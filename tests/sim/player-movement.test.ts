import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { TICK_DT } from '../../src/sim/constants';
import { createMatch, findPlayer } from '../../src/sim/match';
import { isActionLocked, startJump, stepPlayer, stepTurbo } from '../../src/sim/player-movement';
import { NO_INTENT, type PlayerIntent, type PlayerState } from '../../src/sim/types';

const court = getCourt('gym');

function makePlayer(): PlayerState {
  const state = createMatch(
    {
      durationMs: 60_000,
      shotClockMs: 14_000,
      seed: 1,
      ruleIds: [],
      courtId: 'gym',
      mode: 'match',
    },
    court,
    [{ id: 'p', team: 0, characterId: 'placeholder' }],
  );
  const player = findPlayer(state, 'p');
  if (!player) throw new Error('player missing');
  player.pos = { x: 0, y: 0, z: 0 };
  return player;
}

const intent = (partial: Partial<PlayerIntent>): PlayerIntent => ({ ...NO_INTENT, ...partial });

function run(player: PlayerState, i: PlayerIntent, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    stepPlayer(player, i, court, TICK_DT);
    stepTurbo(player);
  }
}

describe('stepPlayer', () => {
  it('accelerates towards run speed in the intent direction', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 60);
    expect(p.vel.x).toBeCloseTo(p.stats.runSpeed);
    expect(p.vel.z).toBeCloseTo(0);
    expect(p.pos.x).toBeGreaterThan(4);
    expect(p.action).toBe('run');
  });

  it('maps intent y to court z', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 0, y: 1 } }), 30);
    expect(p.pos.z).toBeGreaterThan(0);
    expect(p.pos.x).toBeCloseTo(0);
  });

  it('normalizes diagonal input so diagonal speed equals straight speed', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 1 } }), 60);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(p.stats.runSpeed);
  });

  it('decelerates to idle when input stops', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 60);
    run(p, NO_INTENT, 30);
    expect(p.vel.x).toBe(0);
    expect(p.action).toBe('idle');
  });

  it('faces the movement direction', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 1);
    expect(p.facing).toBeCloseTo(Math.PI / 2);
    run(p, intent({ move: { x: 0, y: 1 } }), 1);
    expect(p.facing).toBeCloseTo(0);
  });

  it('cannot leave the play area and loses velocity on the blocked axis', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 60 * 10);
    expect(p.pos.x).toBe(court.playArea.length / 2);
    expect(p.vel.x).toBe(0);
  });

  it('turbo is faster, drains while used and regenerates when released', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 }, turbo: true }), 60);
    expect(p.vel.x).toBeCloseTo(p.stats.turboSpeed);
    expect(p.turbo).toBeLessThan(1);
    const drained = p.turbo;
    run(p, intent({ move: { x: 1, y: 0 } }), 60);
    expect(p.turbo).toBeGreaterThan(drained);
    expect(p.vel.x).toBeCloseTo(p.stats.runSpeed);
  });

  it('turbo does nothing while standing still and runs out when empty', () => {
    const p = makePlayer();
    run(p, intent({ turbo: true }), 60);
    expect(p.turbo).toBe(1);
    // Start near the left wall so 3 s of turbo (~24 m) does not reach the right wall.
    p.pos.x = -court.playArea.length / 2 + 1;
    run(p, intent({ move: { x: 1, y: 0 }, turbo: true }), 60 * 3);
    expect(p.turbo).toBeCloseTo(0, 10);
    // Empty turbo: reverse (wall now far away) and confirm the speed falls back to run speed.
    run(p, intent({ move: { x: -1, y: 0 }, turbo: true }), 60);
    expect(p.turbo).toBe(0);
    expect(p.vel.x).toBeCloseTo(-p.stats.runSpeed);
  });

  it('counts ticks in the current action and resets on change', () => {
    const p = makePlayer();
    run(p, NO_INTENT, 5);
    expect(p.actionTicks).toBe(5);
    run(p, intent({ move: { x: 1, y: 0 } }), 1);
    expect(p.action).toBe('run');
    expect(p.actionTicks).toBe(0);
  });
});

describe('jumping and action lock', () => {
  it('rises, reports jump, and lands after 2v/g seconds', () => {
    const p = makePlayer();
    startJump(p, 4.5);
    run(p, NO_INTENT, 1);
    expect(p.onGround).toBe(false);
    expect(p.action).toBe('jump');
    expect(p.pos.y).toBeGreaterThan(0);
    run(p, NO_INTENT, 27);
    expect(p.pos.y).toBeGreaterThan(0.9); // apex ≈ v²/2g = 1.03 m
    run(p, NO_INTENT, 40);
    expect(p.onGround).toBe(true);
    expect(p.pos.y).toBe(0);
    expect(p.action).toBe('idle');
  });

  it('has no air control: horizontal velocity is kept while airborne', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 60);
    const vx = p.vel.x;
    startJump(p, 4.5);
    run(p, intent({ move: { x: -1, y: 0 } }), 10);
    expect(p.vel.x).toBeCloseTo(vx);
    expect(p.onGround).toBe(false);
  });

  it('ignores movement input while action-locked', () => {
    const p = makePlayer();
    p.action = 'shoot';
    p.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    expect(isActionLocked(p)).toBe(true);
    run(p, intent({ move: { x: 1, y: 0 } }), 30);
    expect(p.vel.x).toBe(0);
    expect(p.action).toBe('shoot');
    expect(p.actionTicks).toBe(30);
  });

  it('does not use turbo while airborne', () => {
    const p = makePlayer();
    startJump(p, 4.5);
    run(p, intent({ move: { x: 1, y: 0 }, turbo: true }), 10);
    expect(p.turboActive).toBe(false);
    expect(p.turbo).toBe(1);
  });
});
