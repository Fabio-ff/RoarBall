import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall, holdPosition, stepFreeBall, tryPickup } from '../../src/sim/ball';
import { BALL_RADIUS } from '../../src/sim/constants';
import { hoopGeometry, RIM_RADIUS } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { BallState, MatchSettings, SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  courtId: 'gym',
  mode: 'match',
};

function freeBall(pos: { x: number; y: number; z: number }, vel = { x: 0, y: 0, z: 0 }): BallState {
  return {
    pos,
    vel,
    radius: BALL_RADIUS,
    mode: 'free',
    holder: null,
    flight: null,
    lastShot: null,
    freeTicks: 0,
    touchingRim: false,
    touchingBoard: false,
  };
}

function drop(ball: BallState, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) stepFreeBall(ball, court, events);
  return events;
}

describe('free ball', () => {
  it('falls, bounces with the court restitution and reports the impact', () => {
    const ball = freeBall({ x: 0, y: 2, z: 0 });
    const events = drop(ball, 60);
    const bounce = events.find((e) => e.type === 'bounce');
    expect(bounce && bounce.type === 'bounce' ? bounce.speed : 0).toBeGreaterThan(5);
    expect(ball.pos.y).toBeGreaterThan(BALL_RADIUS);
  });

  it('comes to rest on the floor', () => {
    const ball = freeBall({ x: 0, y: 2, z: 0 }, { x: 3, y: 0, z: 0 });
    drop(ball, 600);
    expect(ball.pos.y).toBeCloseTo(BALL_RADIUS, 3);
    expect(Math.hypot(ball.vel.x, ball.vel.z)).toBeLessThan(0.01);
    expect(ball.pos.x).toBeGreaterThan(0.5); // it rolled before stopping
  });

  it('bounces off the rim and reports it', () => {
    const rim = hoopGeometry(court, 1).rimCenter;
    const ball = freeBall({ x: rim.x + RIM_RADIUS, y: rim.y + 0.6, z: rim.z });
    const events = drop(ball, 25); // rim hit at tick 17, apex near tick 29
    expect(events.some((e) => e.type === 'rimHit')).toBe(true);
    expect(ball.vel.y).toBeGreaterThan(0);
  });

  it('bounces back off the backboard', () => {
    const hoop = hoopGeometry(court, 1);
    const ball = freeBall(
      { x: hoop.boardCenter.x - 0.5, y: hoop.boardCenter.y, z: hoop.boardCenter.z },
      { x: 6, y: 0, z: 0 },
    );
    const events = drop(ball, 20);
    expect(events.some((e) => e.type === 'boardHit')).toBe(true);
    expect(ball.vel.x).toBeLessThan(0);
  });

  it('stays inside the play area', () => {
    const ball = freeBall({ x: 13, y: BALL_RADIUS, z: 0 }, { x: 20, y: 0, z: 0 });
    drop(ball, 30);
    expect(ball.pos.x).toBeLessThanOrEqual(court.playArea.length / 2 - BALL_RADIUS);
  });
});

describe('holding and pickup', () => {
  it('places the held ball in front of the holder at hand height', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    p.facing = Math.PI / 2; // facing +X
    const h = holdPosition(p);
    expect(h.x).toBeGreaterThan(p.pos.x);
    expect(h.y).toBeCloseTo(0.95);
  });

  it('a nearby free ball is picked up and possession changes', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    state.phase = 'live';
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.ball.pos = { x: p.pos.x + 0.3, y: BALL_RADIUS, z: p.pos.z };
    const { state: after, events } = tick(state, new Map(), court);
    expect(after.ball.mode).toBe('held');
    expect(after.ball.holder).toBe('p');
    expect(after.possession).toBe(0);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['pickup', 'possessionChange']),
    );
  });

  it('the last shooter cannot pick up their own shot during the cooldown', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.ball.pos = { x: p.pos.x + 0.3, y: BALL_RADIUS, z: p.pos.z };
    state.ball.lastShot = { shooter: 'p', team: 0, shotType: 'jumpshot', points: 2, made: false };
    p.shotCooldownTicks = 5;
    const events: SimEvent[] = [];
    tryPickup(state, events);
    expect(state.ball.mode).toBe('free');
    p.shotCooldownTicks = 0;
    tryPickup(state, events);
    expect(state.ball.mode).toBe('held');
  });

  it('a ball above shoulder height is not picked up', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.ball.pos = { x: p.pos.x, y: 2.5, z: p.pos.z };
    tryPickup(state, []);
    expect(state.ball.mode).toBe('free');
  });

  it('giveBall hands the ball over and follows the holder while held', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    giveBall(state, p, []);
    let s = state;
    for (let i = 0; i < 30; i++) {
      s = tick(
        s,
        new Map([
          ['p', { move: { x: 1, y: 0 }, action: false, pass: false, special: false, turbo: false }],
        ]),
        court,
      ).state;
    }
    const holder = findPlayer(s, 'p');
    expect(s.ball.mode).toBe('held');
    expect(s.ball.pos.x).toBeCloseTo(holder ? holdPosition(holder).x : NaN);
  });
});

describe('contact events', () => {
  it('a ball resting on the rim does not spam rimHit', () => {
    const rim = hoopGeometry(court, 1).rimCenter;
    const ball = freeBall({ x: rim.x + RIM_RADIUS, y: rim.y + 0.16, z: rim.z });
    const events = drop(ball, 600);
    expect(events.filter((e) => e.type === 'rimHit').length).toBeLessThan(10);
  });
});
