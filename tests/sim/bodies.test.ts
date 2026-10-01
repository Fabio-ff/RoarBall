import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { deflectBallOffPlayers, separatePlayers } from '../../src/sim/bodies';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchSettings, MatchState, SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  courtId: 'gym',
  mode: 'match',
};

describe('separatePlayers', () => {
  it('pushes overlapping players apart symmetrically', () => {
    const s = createMatch(settings, court, [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 1, characterId: 'placeholder' },
    ]);
    const a = findPlayer(s, 'a');
    const b = findPlayer(s, 'b');
    if (!a || !b) throw new Error('no players');
    a.pos = { x: 0, y: 0, z: 0 };
    b.pos = { x: 0.3, y: 0, z: 0 };
    separatePlayers([a, b], court);
    expect(b.pos.x - a.pos.x).toBeCloseTo(0.7);
    expect(a.pos.x).toBeCloseTo(-0.2);
    expect(b.pos.x).toBeCloseTo(0.5);
  });

  it('does nothing when a player is well above the other', () => {
    const s = createMatch(settings, court, [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 1, characterId: 'placeholder' },
    ]);
    const a = findPlayer(s, 'a');
    const b = findPlayer(s, 'b');
    if (!a || !b) throw new Error('no players');
    a.pos = { x: 0, y: 0, z: 0 };
    b.pos = { x: 0.3, y: 1.8, z: 0 };
    separatePlayers([a, b], court);
    expect(b.pos.x).toBeCloseTo(0.3);
  });
});

describe('deflectBallOffPlayers', () => {
  it('bounces a high free ball off a player instead of passing through', () => {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.pos = { x: 0, y: 0, z: 0 };
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      // Capsule top at 1.55 + 0.35 reach, ball radius 0.12: at y = 1.7 the ball just overlaps the shoulder.
      pos: { x: -0.4, y: 1.7, z: 0 },
      vel: { x: 6, y: 0, z: 0 },
    };
    deflectBallOffPlayers(s, []);
    expect(s.ball.vel.x).toBeLessThan(0);
  });

  it('leaves low balls to the pickup logic', () => {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.pos = { x: 0, y: 0, z: 0 };
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      pos: { x: -0.4, y: 1.0, z: 0 },
      vel: { x: 6, y: 0, z: 0 },
    };
    deflectBallOffPlayers(s, []);
    expect(s.ball.vel.x).toBe(6);
  });

  /** One standing player at the origin and a free ball dropped from `from` with velocity `vel`. */
  function drop(from: { x: number; y: number; z: number }, vel = { x: 0, y: 0, z: 0 }) {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.pos = { x: 0, y: 0, z: 0 };
    s.phase = 'live';
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      lastShot: null,
      pos: from,
      vel,
    };
    return s;
  }

  function runUntilHeld(state: MatchState, ticks: number) {
    let s = state;
    let lastFreeY = s.ball.pos.y;
    const events: SimEvent[] = [];
    for (let i = 0; i < ticks && s.ball.mode !== 'held'; i++) {
      lastFreeY = s.ball.pos.y;
      const r = tick(s, new Map(), court);
      s = r.state;
      events.push(...r.events);
    }
    return { state: s, events, lastFreeY };
  }

  it("a ball dropped onto a standing player's head is theirs, not stuck up there", () => {
    const { state, events, lastFreeY } = runUntilHeld(drop({ x: 0.1, y: 3.2, z: 0 }), 120);
    expect(state.ball.holder).toBe('a');
    expect(lastFreeY).toBeGreaterThan(1.6); // taken off the head, above pickup height
    expect(events.some((e) => e.type === 'pickup' && e.playerId === 'a')).toBe(true);
  });

  it('a ball hitting the shoulder from the side still bounces off', () => {
    const s = drop({ x: -0.4, y: 1.7, z: 0 }, { x: 6, y: 0, z: 0 });
    const events: SimEvent[] = [];
    deflectBallOffPlayers(s, events);
    expect(s.ball.mode).toBe('free');
    expect(s.ball.vel.x).toBeLessThan(0);
    expect(events).toEqual([]);
  });

  it('a knocked-down player does not catch a ball on top of them', () => {
    const s = drop({ x: 0, y: 2.0, z: 0 }, { x: 0, y: -2, z: 0 });
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.action = 'stunned';
    a.stunTicks = 60;
    deflectBallOffPlayers(s, []);
    expect(s.ball.mode).toBe('free');
    expect(s.ball.vel.y).toBeGreaterThan(0);
    expect(Math.hypot(s.ball.vel.x, s.ball.vel.z)).toBeGreaterThanOrEqual(1.5); // rolls off
  });

  it('a swat landing on the shooter who was just blocked rolls off instead of going back', () => {
    const s = drop({ x: 0.1, y: 2.0, z: 0 }, { x: 0, y: -1.5, z: 0 });
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.shotCooldownTicks = 30; // set by the block; lastShot is cleared
    deflectBallOffPlayers(s, []);
    expect(s.ball.mode).toBe('free');
    expect(s.ball.vel.x).toBeGreaterThanOrEqual(1.5);
  });

  it('a slow ball settled on the shoulders of a crowd goes to the nearest player', () => {
    const s = createMatch(settings, court, [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 1, characterId: 'placeholder' },
      { id: 'c', team: 1, characterId: 'placeholder' },
    ]);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => findPlayer(s, id));
    if (!a || !b || !c) throw new Error('no players');
    // The shape seen in scripted 2v2s: three chasers about 0.4 m from a slow ball at 1.74 m.
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      lastShot: null,
      pos: { x: 0, y: 1.74, z: 0 },
      vel: { x: 0.3, y: -0.2, z: 0.1 },
    };
    // All three touch it from the side (contact normal.y ≈ 0.4, not "on top").
    a.pos = { x: 0.42, y: 0, z: 0 };
    b.pos = { x: -0.2, y: 0, z: 0.346 };
    c.pos = { x: -0.205, y: 0, z: -0.355 };
    const events: SimEvent[] = [];
    deflectBallOffPlayers(s, events);
    expect(s.ball.holder).toBe('b'); // 0.40 m, nearer than c (0.41 m) and a (0.42 m)
    expect(events.some((e) => e.type === 'pickup' && e.playerId === 'b')).toBe(true);
  });
});
