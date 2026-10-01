import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { ACTION_TIMING, applyStun, stepLockedAction } from '../../src/sim/actions';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchSettings,
  type MatchState,
  type PlayerIntent,
} from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  courtId: 'gym',
  mode: 'match',
};

function fresh(): MatchState {
  const s = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
  s.phase = 'live';
  return s;
}

describe('stun and getup', () => {
  it('a stunned player ignores input, then gets up, then is free', () => {
    let s = fresh();
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    applyStun(p, 30);
    expect(p.action).toBe('stunned');
    const run: PlayerIntent = { ...NO_INTENT, move: { x: 1, y: 0 } };
    // actionTicks reaches 30 at the end of tick 30; the transition is seen at tick 31's resolve step.
    for (let i = 0; i < 31; i++) s = tick(s, new Map([['p', run]]), court).state;
    expect(findPlayer(s, 'p')?.action).toBe('getup');
    expect(Math.hypot(findPlayer(s, 'p')?.vel.x ?? 1, findPlayer(s, 'p')?.vel.z ?? 1)).toBe(0);
    for (let i = 0; i < ACTION_TIMING.getup.totalTicks; i++) s = tick(s, new Map(), court).state;
    expect(findPlayer(s, 'p')?.action).toBe('idle');
    s = tick(s, new Map([['p', run]]), court).state;
    expect(findPlayer(s, 'p')?.vel.x).toBeGreaterThan(0);
  });

  it('a stun cancels a shot in progress', () => {
    const s = fresh();
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    p.action = 'shoot';
    p.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    applyStun(p, 20);
    expect(p.shot).toBeNull();
    expect(p.action).toBe('stunned');
  });
});

describe('cooldowns', () => {
  it('count down through the timers step', () => {
    let s = fresh();
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    p.cooldowns.steal = 3;
    p.callingForPassTicks = 2;
    s = tick(s, new Map(), court).state;
    expect(findPlayer(s, 'p')?.cooldowns.steal).toBe(2);
    expect(findPlayer(s, 'p')?.callingForPassTicks).toBe(1);
    s = tick(s, new Map(), court).state;
    s = tick(s, new Map(), court).state;
    expect(findPlayer(s, 'p')?.cooldowns.steal).toBe(0);
    expect(findPlayer(s, 'p')?.callingForPassTicks).toBe(0);
  });
});

describe('block landing', () => {
  it('a block ends when the blocker lands', () => {
    const s = fresh();
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    p.action = 'block';
    p.actionTicks = 0;
    p.vel.y = 4.5;
    p.onGround = false;
    let state = s;
    for (let i = 0; i < 70; i++) state = tick(state, new Map(), court).state;
    expect(findPlayer(state, 'p')?.onGround).toBe(true);
    expect(findPlayer(state, 'p')?.action).toBe('idle');
    expect(stepLockedAction).toBeTypeOf('function');
  });
});
