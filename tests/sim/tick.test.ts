import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { TICK_MS } from '../../src/sim/constants';
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
  durationMs: 1000,
  shotClockMs: 14_000,
  seed: 3,
  ruleIds: [],
  mode: 'match',
  courtId: 'gym',
};

function fresh(): MatchState {
  const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
  state.phase = 'live'; // skip the tip-off, whose formation would move the player (spec C.6)
  return state;
}

const moveRight: PlayerIntent = { ...NO_INTENT, move: { x: 1, y: 0 } };

describe('tick', () => {
  it('advances the tick counter and the clock, and moves players by their intents', () => {
    const start = fresh();
    const { state } = tick(start, new Map([['p', moveRight]]), court);
    expect(state.tick).toBe(1);
    expect(state.clockMs).toBeCloseTo(1000 - TICK_MS);
    expect(findPlayer(state, 'p')?.vel.x).toBeGreaterThan(0);
  });

  it('never mutates the input state', () => {
    const start = fresh();
    const snapshot = structuredClone(start);
    tick(start, new Map([['p', moveRight]]), court);
    expect(start).toEqual(snapshot);
  });

  it('treats a missing intent as no input', () => {
    const start = fresh();
    const { state } = tick(start, new Map(), court);
    expect(findPlayer(state, 'p')?.vel.x).toBe(0);
  });

  it('finishes when the clock runs out and emits a phaseChange event once', () => {
    let state = fresh();
    state.phase = 'tipoff';
    state.score = [2, 0];
    const seen: string[] = [];
    for (let i = 0; i < 70; i++) {
      const r = tick(state, new Map(), court);
      state = r.state;
      for (const e of r.events) if (e.type === 'phaseChange') seen.push(`${e.from}->${e.to}`);
    }
    expect(state.phase).toBe('finished');
    expect(state.clockMs).toBe(0);
    expect(seen).toEqual(['tipoff->live', 'live->finished']);
  });

  it('does not advance while paused or finished', () => {
    const start = fresh();
    const paused = { ...start, phase: 'paused' as const };
    expect(tick(paused, new Map([['p', moveRight]]), court).state).toBe(paused);
  });

  it('never finishes with an infinite duration', () => {
    let state = createMatch({ ...settings, durationMs: Number.POSITIVE_INFINITY }, court, [
      { id: 'p', team: 0, characterId: 'placeholder' },
    ]);
    for (let i = 0; i < 200; i++) state = tick(state, new Map([['p', moveRight]]), court).state;
    expect(state.phase).toBe('live');
    expect(state.clockMs).toBe(Number.POSITIVE_INFINITY);
    expect(findPlayer(state, 'p')?.vel.x).toBeGreaterThan(0);
  });

  it('is deterministic: same seed and intents give identical states', () => {
    const intents = new Map([['p', moveRight]]);
    let a = fresh();
    let b = fresh();
    for (let i = 0; i < 120; i++) {
      a = tick(a, intents, court).state;
      b = tick(b, intents, court).state;
    }
    expect(a).toEqual(b);
  });
});

describe('tick: buttons and jumping', () => {
  const press: PlayerIntent = { ...NO_INTENT, action: true };

  it('records last tick buttons in prevButtons', () => {
    const { state } = tick(fresh(), new Map([['p', press]]), court);
    expect(findPlayer(state, 'p')?.prevButtons.action).toBe(true);
    const { state: s2 } = tick(state, new Map(), court);
    expect(findPlayer(s2, 'p')?.prevButtons.action).toBe(false);
  });

  it('jumps once per press without the ball, even when the button is held', () => {
    let state = fresh();
    const jumps: number[] = [];
    for (let i = 0; i < 120; i++) {
      const before = findPlayer(state, 'p')?.onGround;
      state = tick(state, new Map([['p', press]]), court).state;
      if (before && !findPlayer(state, 'p')?.onGround) jumps.push(i);
    }
    expect(jumps).toEqual([0]);
    expect(findPlayer(state, 'p')?.onGround).toBe(true);
  });

  it('drains turbo through the timers step', () => {
    let state = fresh();
    for (let i = 0; i < 60; i++) {
      state = tick(state, new Map([['p', { ...moveRight, turbo: true }]]), court).state;
    }
    expect(findPlayer(state, 'p')?.turbo).toBeCloseTo(1 - 60 / 180, 5);
  });
});
