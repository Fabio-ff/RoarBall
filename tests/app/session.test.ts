import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCourt } from '../../src/content/courts';
import { buildRoster, buildSession, buildSettings } from '../../src/app/session';
import { readGameOptions, type GameOptions } from '../../src/app/url-options';
import { findPlayer } from '../../src/sim/match';
import { NO_INTENT } from '../../src/sim/types';

const court = getCourt('gym');

describe('buildSession (spec C.1)', () => {
  const base: GameOptions = {
    mode: 'match',
    characterId: 'dash',
    teammateId: 'ace',
    opponentIds: ['brick', 'rook'],
    aiProfile: 'easy',
    seed: 9,
    debug: false,
    courtId: 'gym',
    durationMs: 180_000,
  };

  it('seeds every prevButtons with the buttons held at the restart (spec D.6)', () => {
    const held = new Map([['home1', { ...NO_INTENT, pass: true, special: true }]]);
    const session = buildSession(base, court, 9, () => NO_INTENT, held);
    expect(session.runner.abilities).toBe(ABILITIES);
    expect(findPlayer(session.runner.current, 'home1')?.prevButtons).toEqual({
      action: false,
      pass: true,
      special: true,
      turbo: false,
    });
    expect(findPlayer(session.runner.current, 'away1')?.prevButtons.pass).toBe(false);
    // Still holding PASS on the first tick of the new match is not a press: no call for the ball leaks in.
    session.runner.step(new Map([['home1', { ...NO_INTENT, pass: true }]]));
    expect(findPlayer(session.runner.current, 'home1')?.callingForPassTicks).toBe(0);
  });

  it('a match has four players, three AI controllers and the chosen characters', () => {
    const session = buildSession(base, court, 9, () => NO_INTENT);
    expect(buildRoster(base).map((e) => e.characterId)).toEqual(['dash', 'ace', 'brick', 'rook']);
    expect(session.controllers.size).toBe(4);
    expect(session.ais.map((a) => a.id)).toEqual(['home2', 'away1', 'away2']);
    expect(session.ais[0].memory.favourTeammate).toBe(true);
    expect(session.ais[1].memory.favourTeammate).toBe(false);
    expect(buildSettings(base, court, 9)).toMatchObject({
      mode: 'match',
      seed: 9,
      durationMs: 180_000,
    });
  });

  it('a shootaround keeps the Phase 3 trio and no AI', () => {
    const session = buildSession({ ...base, mode: 'shootaround' }, court, 1, () => NO_INTENT);
    expect(session.controllers.size).toBe(3);
    expect(session.ais).toEqual([]);
    expect(session.runner.current.settings.mode).toBe('shootaround');
  });

  it('stepping a finished match makes previous equal current, so the render stops blending', () => {
    const session = buildSession(base, court, 9, () => NO_INTENT);
    session.runner.current.phase = 'finished';
    session.runner.step(new Map());
    expect(session.runner.previous).toBe(session.runner.current);
  });

  it('buildSettings takes the duration from the options (spec E.1 ?duration)', () => {
    const options = { ...readGameOptions('?duration=30', 0) };
    expect(buildSettings(options, getCourt('gym'), 1).durationMs).toBe(30_000);
  });
});

describe('primeHumanInput (resume/restart must not leak a press)', () => {
  it('a latched Space used to confirm a menu is not an ACTION press afterwards', async () => {
    const { InputManager } = await import('../../src/input/input-manager');
    const { KeyboardBackend } = await import('../../src/input/keyboard');
    const { primeHumanInput } = await import('../../src/app/session');
    const target = new EventTarget() as unknown as Window;
    const input = new InputManager([new KeyboardBackend(target)]);
    const state = buildSession({ ...readGameOptions('', 1) }, court, 1, () => NO_INTENT).runner
      .current;
    (target as unknown as EventTarget).dispatchEvent(
      Object.assign(new Event('keydown', { cancelable: true }), { code: 'Space', repeat: false }),
    );
    primeHumanInput(state, () => input.sample(), new Map());
    expect(findPlayer(state, 'home1')?.prevButtons.action).toBe(true);
    // Still held next tick: prevButtons already true, so the sim sees no new press.
    expect(input.sample().action).toBe(true);
    input.dispose();
  });
});
