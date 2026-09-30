import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { createRng, nextFloat } from '../../src/sim/rng';
import {
  chooseShotType,
  distanceFactor,
  launchShot,
  MISS_JITTER_LATERAL,
  MISS_JITTER_VERTICAL,
  missTarget,
  pickMissType,
  pointsFor,
  resolveShotOutcome,
  shotQuality,
  startShot,
} from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchSettings,
  type MatchState,
  type MissType,
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
  return tick(state, new Map(), court).state;
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

describe('miss targets and the outcome roll', () => {
  const zero = { lateral: 0, vertical: 0 };
  const rim = hoop.rimCenter;

  it('a board miss hits the board on the side away from the shooter', () => {
    const fromPlusZ = missTarget(hoop, { x: rim.x - 5, y: 0, z: 4 }, 'board', 0.12, zero);
    const fromMinusZ = missTarget(hoop, { x: rim.x - 5, y: 0, z: -4 }, 'board', 0.12, zero);
    expect(fromPlusZ.z).toBeLessThan(rim.z);
    expect(fromMinusZ.z).toBeGreaterThan(rim.z);
    // Straight on, the lateral jitter picks the side.
    const left = missTarget(hoop, { x: rim.x - 5, y: 0, z: 0 }, 'board', 0.12, {
      lateral: -0.5,
      vertical: 0,
    });
    const right = missTarget(hoop, { x: rim.x - 5, y: 0, z: 0 }, 'board', 0.12, {
      lateral: 0.5,
      vertical: 0,
    });
    expect(Math.sign(left.z - rim.z)).toBe(-1);
    expect(Math.sign(right.z - rim.z)).toBe(1);
  });

  it('jitter moves the target across the shot line and vertically, within its scale', () => {
    const shooter = { x: rim.x - 6, y: 0, z: 0 };
    const base = missTarget(hoop, shooter, 'frontRim', 0.12, zero);
    const moved = missTarget(hoop, shooter, 'frontRim', 0.12, { lateral: 1, vertical: -1 });
    expect(moved.x).toBeCloseTo(base.x, 9); // straight on: across the line is along z
    expect(moved.z - base.z).toBeCloseTo(MISS_JITTER_LATERAL, 9);
    expect(moved.y - base.y).toBeCloseTo(-MISS_JITTER_VERTICAL, 9);
  });

  it('long front-rim misses aim lower, down to about rim height', () => {
    const at = (d: number) =>
      missTarget(hoop, { x: rim.x - d, y: 0, z: 0 }, 'frontRim', 0.12, zero);
    expect(at(8).y).toBeCloseTo(rim.y + 0.12 * 0.6, 9);
    expect(at(14).y).toBeLessThan(at(8).y);
    expect(at(20).y).toBeCloseTo(rim.y + 0.12 * 0.1, 9);
    expect(at(26).y).toBeCloseTo(at(20).y, 9);
  });

  it('draws make roll, miss type, lateral and vertical jitter in that order', () => {
    const s = ready(8);
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    startShot(s, p, court);
    for (let seed = 1; seed < 100; seed++) {
      s.rng = createRng(seed);
      const mirror = createRng(seed);
      const outcome = resolveShotOutcome(s, p, court);
      const roll = nextFloat(mirror);
      expect(outcome.made).toBe(roll < outcome.quality);
      if (outcome.made) {
        expect(outcome.jitter).toBeNull();
        expect(s.rng).toEqual(mirror);
        continue;
      }
      expect(outcome.missType).toBe(pickMissType(mirror));
      expect(outcome.jitter).toEqual({
        lateral: nextFloat(mirror) * 2 - 1,
        vertical: nextFloat(mirror) * 2 - 1,
      });
      expect(s.rng).toEqual(mirror);
    }
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
      // Up to the first hoop contact: the ball is loose there. (Later the shooter may catch
      // their own rebound once the pickup cooldown is over.)
      const hit = runUntil(ready(4, seed), press, (ev) =>
        ev.some((e) => e.type === 'rimHit' || e.type === 'boardHit'),
      );
      const released = hit.events.find((e) => e.type === 'shotReleased');
      if (released?.type === 'shotReleased' && !released.made) {
        expect(hit.events.some((e) => e.type === 'rimHit' || e.type === 'boardHit')).toBe(true);
        expect(hit.state.ball.mode).toBe('free');
        const rest = runUntil(hit.state, press, () => false, 240);
        expect([...hit.events, ...rest.events].some((e) => e.type === 'basket')).toBe(false);
        expect(rest.state.score).toEqual([0, 0]);
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

  it('basket rate over 150 seeded shots tracks the reported quality', () => {
    let baskets = 0;
    let qualitySum = 0;
    const n = 150;
    for (let seed = 1; seed <= n; seed++) {
      const { events } = runUntil(
        ready(4, seed),
        press,
        (ev, s) =>
          ev.some((e) => e.type === 'basket') || (s.ball.mode === 'free' && s.ball.pos.y < 0.5),
        300,
      );
      const released = events.find((e) => e.type === 'shotReleased');
      if (released?.type !== 'shotReleased') throw new Error('no release');
      qualitySum += released.quality;
      if (events.some((e) => e.type === 'basket')) baskets += 1;
    }
    // Lucky bounces after a miss may add a few percent; systematic bounce-ins would blow this.
    expect(Math.abs(baskets / n - qualitySum / n)).toBeLessThan(0.1);
  });
});

describe('shot geometry with forced outcomes', () => {
  const missTypes: MissType[] = ['frontRim', 'backRim', 'sideRim', 'board'];

  /**
   * Starts the shot and launches it with a forced outcome from the real jump-shot release height
   * (the shooter's feet are 0.99 m up at the release tick); runs the ball out.
   */
  function forced(distance: number, outcome: { made: boolean; missType: MissType | null }) {
    const s = ready(distance);
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    startShot(s, p, court);
    p.pos.y = 0.99;
    const events: SimEvent[] = [];
    launchShot(s, p, court, events, {
      quality: 0.5,
      jitter: outcome.made ? null : { lateral: 0, vertical: 0 },
      ...outcome,
    });
    return runUntil(
      s,
      NO_INTENT,
      (ev, st) =>
        ev.some((e) => e.type === 'basket') || (st.ball.mode === 'free' && st.ball.pos.y < 0.5),
      300,
    );
  }

  const distances = [3, 5, 7, 10];
  for (const distance of distances) {
    for (const missType of missTypes) {
      it(`a ${missType} miss from ${distance} m touches the hoop`, () => {
        const { events } = forced(distance, { made: false, missType });
        expect(events.some((e) => e.type === 'rimHit' || e.type === 'boardHit')).toBe(true);
      });
    }
    for (const missType of ['frontRim', 'sideRim'] as const) {
      it(`a ${missType} miss from ${distance} m never scores`, () => {
        const { events } = forced(distance, { made: false, missType });
        expect(events.some((e) => e.type === 'basket')).toBe(false);
      });
    }
  }

  it('rattles (back-rim and board misses) go in only occasionally', () => {
    // These bounce off the far tube and the board; physics decides. Systematic bounce-ins
    // would show up here and in the basket-rate test.
    let baskets = 0;
    let cases = 0;
    for (const distance of distances) {
      for (const missType of ['backRim', 'board'] as const) {
        cases += 1;
        if (forced(distance, { made: false, missType }).events.some((e) => e.type === 'basket'))
          baskets += 1;
      }
    }
    expect(baskets).toBeLessThanOrEqual(cases / 4);
  });

  for (const distance of [16, 20, 24]) {
    it(`a long frontRim miss from ${distance} m hits the rim and stays out`, () => {
      const { events } = forced(distance, { made: false, missType: 'frontRim' });
      expect(events.some((e) => e.type === 'rimHit')).toBe(true);
      expect(events.some((e) => e.type === 'basket')).toBe(false);
    });
  }

  for (const distance of [3, 5, 7, 10, 14, 18]) {
    it(`a made shot from ${distance} m scores without touching the rim`, () => {
      const { events } = forced(distance, { made: true, missType: null });
      expect(events.some((e) => e.type === 'basket')).toBe(true);
      expect(events.some((e) => e.type === 'rimHit')).toBe(false);
    });
  }

  it('a dunker stops short of the rim instead of flying through the backboard', () => {
    const start = ready(1.9);
    const p = findPlayer(start, 'p');
    if (!p) throw new Error('no player');
    p.vel = { x: 9, y: 0, z: 0 };
    const { state, events } = runUntil(
      start,
      press,
      (ev) => ev.some((e) => e.type === 'shotReleased'),
      60,
    );
    expect(events.find((e) => e.type === 'shotReleased')).toMatchObject({ shotType: 'dunk' });
    const shooter = findPlayer(state, 'p');
    expect(shooter?.pos.x).toBeLessThan(hoop.rimCenter.x);
    expect(Math.hypot(shooter?.vel.x ?? 0, shooter?.vel.z ?? 0)).toBe(0);
  });
});
