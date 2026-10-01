import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { TICK_MS } from '../../src/sim/constants';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { SCORED_PAUSE_TICKS } from '../../src/sim/phases';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchSettings,
  type MatchState,
  type PlayerIntent,
  type SimEvent,
} from '../../src/sim/types';

const court = getCourt('gym');
const base: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 2,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const press: PlayerIntent = { ...NO_INTENT, action: true };
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'placeholder' },
  { id: 'away1', team: 1 as const, characterId: 'placeholder' },
];

function run(
  state: MatchState,
  ticks: number,
  intents = new Map<string, PlayerIntent>(),
): { state: MatchState; events: SimEvent[] } {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = tick(s, intents, court);
    s = r.state;
    all.push(...r.events);
  }
  return { state: s, events: all };
}

describe('phases', () => {
  it('tip-off gives the ball to a seeded random team and goes live', () => {
    const { state, events } = run(createMatch(base, court, roster), 1);
    expect(state.phase).toBe('live');
    expect(state.ball.mode).toBe('held');
    expect(state.possession).not.toBeNull();
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'live')).toBe(true);
  });

  it('shootaround tip-off always gives the ball to team 0', () => {
    for (let seed = 1; seed < 6; seed++) {
      const { state } = run(createMatch({ ...base, mode: 'shootaround', seed }, court, roster), 1);
      expect(state.possession).toBe(0);
    }
  });

  it('a basket pauses, then inbounds to the other team at their baseline', () => {
    const s = run(createMatch(base, court, roster), 1).state;
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    // Force possession to home 1.5 m from hoop 1 and dunk.
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 1.2, y: 0, z: 0 };
    home.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, home, []);
    const { state, events } = run(s, 200, new Map([['home1', press]]));
    expect(events.some((e) => e.type === 'basket')).toBe(true);
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'scored')).toBe(true);
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'inbound')).toBe(true);
    expect(state.phase).toBe('live');
    expect(state.possession).toBe(1);
    expect(state.ball.holder).toBe('away1');
    // Player separation (step 6) may nudge the receiver a few cm if the scorer stands next to them.
    expect(findPlayer(state, 'away1')?.pos.x).toBeCloseTo(court.playArea.length / 2 - 1.5, 1);
    expect(state.shotClockMs).toBeGreaterThan(10_000); // reset at the inbound, then ran for a while
    expect(state.score[0]).toBe(2);
  });

  it('the scored pause lasts SCORED_PAUSE_TICKS', () => {
    let s = run(createMatch(base, court, roster), 1).state;
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 1.2, y: 0, z: 0 };
    home.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, home, []);
    let scoredAt = -1;
    let inboundAt = -1;
    for (let i = 0; i < 300 && inboundAt < 0; i++) {
      const r = tick(s, new Map([['home1', press]]), court);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'phaseChange' && e.to === 'scored') scoredAt = i;
        if (e.type === 'phaseChange' && e.to === 'inbound') inboundAt = i;
      }
    }
    expect(inboundAt - scoredAt).toBe(SCORED_PAUSE_TICKS);
  });

  it('in shootaround the scorer gets the ball back near the hoop they scored on', () => {
    const s = run(createMatch({ ...base, mode: 'shootaround' }, court, roster), 1).state;
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 1.2, y: 0, z: 0 };
    home.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, home, []);
    const { state } = run(s, 200, new Map([['home1', press]]));
    expect(state.ball.holder).toBe('home1');
    expect(findPlayer(state, 'home1')?.pos.x).toBeCloseTo(hoopGeometry(court, 1).rimCenter.x - 6);
  });

  it('shot-clock violation hands the ball to the other team', () => {
    const s = run(createMatch({ ...base, shotClockMs: 500 }, court, roster), 1).state;
    const holder = s.ball.holder;
    const { state, events } = run(s, 40);
    expect(events.some((e) => e.type === 'shotClockViolation')).toBe(true);
    expect(state.ball.holder).not.toBe(holder);
    expect(state.phase).toBe('live');
  });

  it('the team that wins a loose ball after the clock expired gets a fresh shot clock', () => {
    const s = run(createMatch(base, court, roster), 1).state;
    const away = findPlayer(s, 'away1');
    if (!away) throw new Error('no player');
    // Home let the clock expire while the ball is loose; away picks it up.
    s.possession = 0;
    s.shotClockMs = 0;
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      pos: { x: away.pos.x + 0.3, y: s.ball.radius, z: away.pos.z },
      vel: { x: 0, y: 0, z: 0 },
    };
    const { state, events } = run(s, 2);
    expect(events.some((e) => e.type === 'possessionChange' && e.team === 1)).toBe(true);
    expect(events.some((e) => e.type === 'shotClockViolation')).toBe(false);
    expect(state.ball.holder).toBe('away1');
    expect(state.shotClockMs).toBeGreaterThan(base.shotClockMs - 100);
  });

  it('the shot clock resets on a rim hit', () => {
    const s = run(createMatch(base, court, roster), 1).state;
    s.shotClockMs = 300;
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      pos: { x: hoopGeometry(court, 1).rimCenter.x + 0.225, y: 3.6, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
    };
    const { state, events } = run(s, 30);
    expect(events.some((e) => e.type === 'rimHit')).toBe(true);
    expect(state.shotClockMs).toBeGreaterThan(300);
  });

  it('the clock only runs in match mode and finishes when it hits zero', () => {
    const shoot = run(createMatch({ ...base, mode: 'shootaround' }, court, roster), 60).state;
    expect(shoot.clockMs).toBe(base.durationMs);
    const leading = createMatch({ ...base, durationMs: 500 }, court, roster);
    leading.score = [2, 0]; // not a tie, so no overtime
    const { state, events } = run(leading, 60);
    expect(state.phase).toBe('finished');
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'finished')).toBe(true);
  });

  it('a tie at zero goes to sudden death and the next basket ends the match', () => {
    const s = run(createMatch({ ...base, durationMs: TICK_MS * 5 }, court, roster), 8).state;
    expect(s.phase).toBe('live');
    expect(s.overtime).toBe(true);
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 1.2, y: 0, z: 0 };
    home.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, home, []);
    const { state } = run(s, 120, new Map([['home1', press]]));
    expect(state.phase).toBe('finished');
    expect(state.score[0]).toBe(2);
  });

  it('a loose ball nobody reaches is inbounded after the timeout', () => {
    const s = run(createMatch(base, court, roster), 1).state;
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      pos: { x: 0, y: 5, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      freeTicks: 0,
      touchingRim: false,
      touchingBoard: false,
    };
    // Park the ball on top of the backboard so nobody can pick it up.
    const board = hoopGeometry(court, 1);
    s.ball.pos = {
      x: board.boardCenter.x,
      y: board.boardCenter.y + board.boardHalf.y + 0.13,
      z: 0,
    };
    const { state, events } = run(s, 420);
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'inbound')).toBe(true);
    expect(state.ball.mode).toBe('held');
  });

  it('a buzzer-beater counts: the clock waits for a shot in flight', () => {
    const s = run(createMatch({ ...base, durationMs: TICK_MS * 40 }, court, roster), 1).state;
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 4, y: 0, z: 0 };
    home.facing = Math.PI / 2;
    giveBall(s, home, []);
    s.score = [0, 2];
    // Press now: the release lands around tick 27, the clock expires at tick 40 with the ball in the air.
    const { state, events } = run(s, 160, new Map([['home1', press]]));
    const released = events.find((e) => e.type === 'shotReleased');
    expect(released).toBeDefined();
    // The clock hits zero at tick 40 with the ball in the air (released at ~27, lands at ~100):
    // nothing may finish before the flight resolves.
    const releasedAt = events.findIndex((e) => e.type === 'shotReleased');
    const finishedAt = events.findIndex((e) => e.type === 'phaseChange' && e.to === 'finished');
    if (released?.type === 'shotReleased' && released.made) {
      expect(state.score[0]).toBe(2);
      expect(state.overtime).toBe(true); // 2–2: the buzzer-beater forces overtime
      expect(finishedAt).toBe(-1);
      expect(state.phase).not.toBe('finished');
    } else {
      expect(finishedAt).toBeGreaterThan(releasedAt + 40);
      expect(state.phase).toBe('finished');
      expect(state.score).toEqual([0, 2]);
    }
  });
});
