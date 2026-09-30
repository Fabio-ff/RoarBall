import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { createRng } from '../../src/sim/rng';
import {
  chooseShotType,
  distanceFactor,
  pickMissType,
  pointsFor,
  shotQuality,
} from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchSettings,
  type MatchState,
  type PlayerIntent,
  type SimEvent,
} from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1);
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  courtId: 'gym',
  mode: 'match',
};
const press: PlayerIntent = { ...NO_INTENT, action: true };

/** A match with player 'p' holding the ball `distance` metres in front of hoop 1, standing still. */
function ready(distance: number, seed = 1): MatchState {
  const state = createMatch({ ...settings, seed }, court, [
    { id: 'p', team: 0, characterId: 'placeholder' },
  ]);
  const p = findPlayer(state, 'p');
  if (!p) throw new Error('no player');
  p.pos = { x: hoop.rimCenter.x - distance, y: 0, z: 0 };
  p.facing = Math.PI / 2;
  giveBall(state, p, []);
  return state;
}

function runUntil(
  state: MatchState,
  intent: PlayerIntent,
  stop: (events: SimEvent[], s: MatchState) => boolean,
  maxTicks = 300,
): { state: MatchState; events: SimEvent[] } {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const r = tick(s, new Map([['p', intent]]), court);
    s = r.state;
    all.push(...r.events);
    if (stop(r.events, s)) break;
  }
  return { state: s, events: all };
}

describe('shot selection and quality', () => {
  it('chooses dunk, layup or jump shot by range and motion', () => {
    const s = ready(1.5);
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    expect(chooseShotType(p, hoop)).toBe('layup');
    p.vel = { x: 4, y: 0, z: 0 };
    expect(chooseShotType(p, hoop)).toBe('dunk');
    p.pos.x = hoop.rimCenter.x - 5;
    expect(chooseShotType(p, hoop)).toBe('jumpshot');
  });

  it('distance factor is 1 up close and falls off monotonically', () => {
    expect(distanceFactor(1)).toBe(1);
    let last = 1;
    for (let d = 1.5; d <= 12; d += 0.5) {
      const f = distanceFactor(d);
      expect(f).toBeLessThanOrEqual(last);
      last = f;
    }
    expect(distanceFactor(6.75)).toBeGreaterThan(0.45);
  });

  it('quality: dunks are certain, layups high, jump shots drop with distance and speed', () => {
    const s = ready(4);
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    expect(shotQuality(p, 'dunk', hoop)).toBe(1);
    expect(shotQuality(p, 'layup', hoop)).toBeGreaterThan(0.8);
    const standing = shotQuality(p, 'jumpshot', hoop);
    p.vel = { x: 6, y: 0, z: 0 };
    expect(shotQuality(p, 'jumpshot', hoop)).toBeLessThan(standing);
    p.vel = { x: 0, y: 0, z: 0 };
    p.pos.x = hoop.rimCenter.x - 8;
    expect(shotQuality(p, 'jumpshot', hoop)).toBeLessThan(standing);
    expect(standing).toBeGreaterThan(0.4);
    expect(standing).toBeLessThan(0.8);
  });

  it('scores 3 from the arc and 2 inside', () => {
    expect(pointsFor(6.74)).toBe(2);
    expect(pointsFor(6.75)).toBe(3);
  });

  it('picks every miss type over many rolls', () => {
    const rng = createRng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickMissType(rng));
    expect([...seen].sort()).toEqual(['backRim', 'board', 'frontRim', 'sideRim']);
  });
});

describe('shooting through the tick', () => {
  it('a press with the ball starts a locked shot and releases the ball at the release tick', () => {
    const start = ready(4);
    const r1 = tick(start, new Map([['p', press]]), court);
    const p1 = findPlayer(r1.state, 'p');
    expect(p1?.action).toBe('shoot');
    expect(p1?.onGround).toBe(false);
    expect(r1.state.ball.mode).toBe('held');
    const { state, events } = runUntil(r1.state, press, (ev) =>
      ev.some((e) => e.type === 'shotReleased'),
    );
    const released = events.find((e) => e.type === 'shotReleased');
    expect(released).toBeDefined();
    expect(state.ball.mode).toBe('flight');
    expect(state.ball.holder).toBeNull();
    // Set to 30 at release (step 3), then decremented once by the timers step of the same tick.
    expect(findPlayer(state, 'p')?.shotCooldownTicks).toBe(29);
  });

  it('holding the button does not shoot again after landing', () => {
    const { state, events } = runUntil(ready(4), press, () => false, 200);
    expect(events.filter((e) => e.type === 'shotReleased')).toHaveLength(1);
    expect(findPlayer(state, 'p')?.onGround).toBe(true);
  });

  it('a made shot scores the right points and emits a basket', () => {
    // Find a seed whose first roll makes the shot, then check the basket.
    for (let seed = 1; seed < 50; seed++) {
      const { state, events } = runUntil(
        ready(4, seed),
        press,
        (ev) => ev.some((e) => e.type === 'basket'),
        400,
      );
      const released = events.find((e) => e.type === 'shotReleased');
      if (released?.type === 'shotReleased' && released.made) {
        const basket = events.find((e) => e.type === 'basket');
        expect(basket).toMatchObject({ type: 'basket', team: 0, points: 2, playerId: 'p' });
        expect(state.score).toEqual([2, 0]);
        return;
      }
    }
    throw new Error('no seed made the shot');
  });

  it('a missed shot never emits a basket by itself and leaves the ball free', () => {
    for (let seed = 1; seed < 50; seed++) {
      const { state, events } = runUntil(ready(4, seed), press, () => false, 240);
      const released = events.find((e) => e.type === 'shotReleased');
      if (released?.type === 'shotReleased' && !released.made) {
        expect(events.some((e) => e.type === 'rimHit' || e.type === 'boardHit')).toBe(true);
        expect(state.ball.mode).toBe('free');
        expect(state.score).toEqual([0, 0]);
        return;
      }
    }
    throw new Error('no seed missed the shot');
  });

  it('a three from 7 m is worth 3', () => {
    for (let seed = 1; seed < 80; seed++) {
      const { state, events } = runUntil(
        ready(7, seed),
        press,
        (ev) => ev.some((e) => e.type === 'basket'),
        400,
      );
      if (events.some((e) => e.type === 'basket')) {
        expect(state.score).toEqual([3, 0]);
        return;
      }
    }
    throw new Error('no seed made the three');
  });

  it('a dunk always scores', () => {
    const start = ready(1.2);
    const p = findPlayer(start, 'p');
    if (!p) throw new Error('no player');
    p.vel = { x: 5, y: 0, z: 0 };
    const { events } = runUntil(start, press, (ev) => ev.some((e) => e.type === 'basket'), 200);
    const released = events.find((e) => e.type === 'shotReleased');
    expect(released).toMatchObject({ shotType: 'dunk', made: true });
    expect(events.some((e) => e.type === 'basket')).toBe(true);
  });

  it('make rate over 300 seeded shots matches the reported quality', () => {
    let made = 0;
    let qualitySum = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const { events } = runUntil(
        ready(4, seed),
        press,
        (ev) => ev.some((e) => e.type === 'shotReleased'),
        60,
      );
      const released = events.find((e) => e.type === 'shotReleased');
      if (released?.type !== 'shotReleased') throw new Error('no release');
      qualitySum += released.quality;
      if (released.made) made += 1;
    }
    expect(Math.abs(made / n - qualitySum / n)).toBeLessThan(0.08);
  });
});
