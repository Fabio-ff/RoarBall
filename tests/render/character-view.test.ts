import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { CharacterView } from '../../src/render/character-view';
import { instantiate, type LoadedModel } from '../../src/render/model-cache';
import { SHOT_TIMING } from '../../src/sim/shooting';
import type { PlayerAction, PlayerState } from '../../src/sim/types';
import { ALL_CLIPS, fakeGltf } from './model-fixtures';

const RELEASE_AT = 0.6;

function model(clipNames: readonly string[] = ALL_CLIPS): LoadedModel {
  const gltf = fakeGltf(clipNames, RELEASE_AT);
  return instantiate({ scene: gltf.scene, clips: gltf.animations, releaseAt: RELEASE_AT });
}

function state(over: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'home1',
    team: 0,
    characterId: 'ace',
    pos: { x: 0, y: 0, z: 0 },
    facing: 0,
    vel: { x: 0, y: 0, z: 0 },
    action: 'idle',
    actionTicks: 0,
    stats: { runSpeed: 5 },
    ...over,
  } as unknown as PlayerState;
}

const running = (speed: number): PlayerState =>
  state({ action: 'run', vel: { x: speed, y: 0, z: 0 } });

/** One render frame at alpha 1: the view sees `next`. */
function frame(view: CharacterView, next: PlayerState, hasBall = false, dt = 0): void {
  view.update(next, next, 1, 0, hasBall, dt);
}

const ringOf = (view: CharacterView): Mesh =>
  view.group.children.find(
    (c): c is Mesh => c instanceof Mesh && c.geometry.type === 'RingGeometry',
  )!;

describe('CharacterView clip choice (spec F.7.3)', () => {
  it('idle without the ball shows idle, with the ball dribble', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state());
    expect(view.currentClip).toBe('idle');
    frame(view, state(), true);
    expect(view.currentClip).toBe('dribble');
  });

  it('moving shows run whether or not the player holds the ball', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, running(4), true);
    expect(view.currentClip).toBe('run');
    frame(view, running(4), false);
    expect(view.currentClip).toBe('run');
  });

  it.each<[PlayerAction, string]>([
    ['jump', 'jump'],
    ['block', 'jump'],
    ['shoot', 'shoot'],
    ['layup', 'shoot'],
    ['dunk', 'shoot'],
    ['pass', 'shoot'],
    ['steal', 'hit'],
    ['shove', 'hit'],
    ['stunned', 'fall'],
    ['getup', 'idle'],
  ])('action %s shows %s', (action, clip) => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state({ action }));
    expect(view.currentClip).toBe(clip);
  });
});

describe('CharacterView timing (spec F.5.3, F.7.5)', () => {
  it('run plays at horizontal speed over runSpeed', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, running(5));
    expect(view.currentTimeScale).toBeCloseTo(1);
    frame(view, running(7.5));
    expect(view.currentTimeScale).toBeCloseTo(1.5);
  });

  it('a jump shot, layup and dunk stretch the shoot clip so it releases on the sim tick', () => {
    const scales: [PlayerAction, number][] = [
      ['shoot', RELEASE_AT / (SHOT_TIMING.jumpshot.releaseTick / 60)],
      ['layup', RELEASE_AT / (SHOT_TIMING.layup.releaseTick / 60)],
      ['dunk', RELEASE_AT / (SHOT_TIMING.dunk.releaseTick / 60)],
    ];
    for (const [action, scale] of scales) {
      const view = new CharacterView(model(), 0x2f80ed, false);
      frame(view, state({ action }), true);
      expect(view.currentClip).toBe('shoot');
      expect(view.currentTimeScale).toBeCloseTo(scale);
      expect(view.actionFor('shoot')!.time).toBe(0);
    }
  });

  it('a pass plays shoot at speed 1, starting 4 ticks before the release pose', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state({ action: 'pass', actionTicks: 0 }), true);
    expect(view.currentClip).toBe('shoot');
    expect(view.currentTimeScale).toBe(1);
    expect(view.actionFor('shoot')!.time).toBeCloseTo(RELEASE_AT - 4 / 60);
  });

  it('an alley-oop dunk seen one tick before its release starts near the release pose', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state({ action: 'dunk', actionTicks: SHOT_TIMING.dunk.releaseTick - 1 }), true);
    expect(view.actionFor('shoot')!.time).toBeGreaterThan(0.5);
    expect(view.actionFor('shoot')!.time).toBeLessThan(RELEASE_AT);
  });

  it('one-shot clips hold their last frame instead of looping', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    const jump = state({ action: 'jump' });
    frame(view, jump, false, 0.5);
    frame(view, jump, false, 2);
    const action = view.actionFor('jump')!;
    expect(action.time).toBeCloseTo(1);
    expect(action.clampWhenFinished).toBe(true);
    expect(action.loop).toBe(2200); // LoopOnce
  });

  it('a shot that starts again (tick counter back to 0) restarts the clip', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state({ action: 'shoot', actionTicks: 30 }), true);
    const late = view.actionFor('shoot')!.time;
    expect(late).toBeGreaterThan(0.5);
    frame(view, state({ action: 'shoot', actionTicks: 0 }), true);
    expect(view.actionFor('shoot')!.time).toBe(0);
  });

  it('looping clips are not restarted when only the action changes (run to idle while moving)', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, running(5), false, 0.3);
    const before = view.actionFor('run')!.time;
    frame(view, state({ action: 'idle', vel: { x: 5, y: 0, z: 0 } }), false, 0);
    expect(view.currentClip).toBe('run');
    expect(view.actionFor('run')!.time).toBeCloseTo(before);
  });

  it('crossfades over 0.15 s: halfway, both clips carry about half the weight', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state(), false, 0.016);
    frame(view, state({ action: 'stunned' }), false, 0.075);
    expect(view.currentClip).toBe('fall');
    expect(view.actionFor('fall')!.getEffectiveWeight()).toBeCloseTo(0.5, 1);
    expect(view.actionFor('idle')!.getEffectiveWeight()).toBeCloseTo(0.5, 1);
  });
});

describe('CharacterView fallbacks (spec F.7.4)', () => {
  it('a missing clip falls back to idle', () => {
    const view = new CharacterView(model(['idle', 'run']), 0x2f80ed, false);
    frame(view, state({ action: 'stunned' }));
    expect(view.currentClip).toBe('idle');
  });

  it('with no idle either the bind pose shows and nothing throws', () => {
    const view = new CharacterView(model(['run']), 0x2f80ed, false);
    expect(() => frame(view, state({ action: 'shoot' }), true, 0.016)).not.toThrow();
    expect(view.currentClip).toBeNull();
    expect(view.currentTimeScale).toBe(1);
  });

  it('a model with no clips at all and bad inputs never throw', () => {
    const view = new CharacterView(model([]), 0x2f80ed, false);
    expect(() => {
      frame(view, state(), false, Number.NaN);
      frame(view, state({ action: 'dunk' }), true, -1);
      frame(view, state({ stats: { runSpeed: 0 } as PlayerState['stats'] }), false, 0.016);
      view.dispose();
    }).not.toThrow();
  });

  it('ignores clips that are not canonical', () => {
    const view = new CharacterView(model(['idle', 'tpose']), 0x2f80ed, false);
    frame(view, state());
    expect(view.actionFor('idle')).toBeDefined();
  });
});

describe('CharacterView placement and ring (spec F.7.7)', () => {
  it('interpolates position and facing like PlayerView', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    view.update(
      state({ pos: { x: 0, y: 0, z: 0 }, facing: 0 }),
      state({ pos: { x: 2, y: 1, z: 4 }, facing: 1 }),
      0.5,
      0,
      false,
      0,
    );
    expect(view.group.position.x).toBeCloseTo(1);
    expect(view.group.position.z).toBeCloseTo(2);
    expect(view.group.rotation.y).toBeCloseTo(0.5);
  });

  it('every view has a ring on the floor, static unless it is the human', () => {
    const other = new CharacterView(model(), 0x2f80ed, false);
    const human = new CharacterView(model(), 0x2f80ed, true);
    const airborne = state({ pos: { x: 0, y: 0.8, z: 0 } });
    for (const tick of [0, 15, 31]) {
      other.update(airborne, airborne, 1, tick, false, 0);
      human.update(airborne, airborne, 1, tick, false, 0);
    }
    expect(ringOf(other).scale.x).toBe(1);
    expect(ringOf(other).getWorldPosition(ringOf(other).position.clone()).y).toBeCloseTo(0.01);
    human.update(airborne, airborne, 1, 15, false, 0);
    expect(ringOf(human).scale.x).toBeGreaterThan(1);
  });
});
