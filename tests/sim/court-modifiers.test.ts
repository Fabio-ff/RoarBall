import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCharacter } from '../../src/content/characters';
import { courts, getCourt } from '../../src/content/courts';
import {
  GUST_BALL_ACCEL,
  GUST_GAP_SPREAD_TICKS,
  GUST_MIN_GAP_TICKS,
  GUST_PLAYER_ACCEL,
  GUST_TICKS,
  gustOf,
} from '../../src/content/courts/rooftop';
import { CHARGE_MAX } from '../../src/sim/abilities';
import { passLanding } from '../../src/sim/ai/brain';
import { arcPoint } from '../../src/sim/arc';
import { giveBall } from '../../src/sim/ball';
import { TICK_DT } from '../../src/sim/constants';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { releasePass, startPass } from '../../src/sim/passing';
import { createRng, nextInt } from '../../src/sim/rng';
import { bowFactor, launchShot, shotBow, startShot, stepFlight } from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type CourtDef,
  type MatchState,
  type PlayerState,
  type SimEvent,
} from '../../src/sim/types';

const gym = getCourt('gym');
const rooftop = getCourt('rooftop');
const volcano = getCourt('volcano');
const frozen = getCourt('frozen');
const hoop = hoopGeometry(gym, 1);

function match(court: CourtDef, seed = 1): MatchState {
  const s = createMatch(
    {
      durationMs: 180_000,
      shotClockMs: 14_000,
      seed,
      ruleIds: [],
      courtId: court.id,
      mode: 'match',
    },
    court,
    [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 0, characterId: 'placeholder' },
      { id: 'x', team: 1, characterId: 'placeholder' },
    ],
  );
  s.phase = 'live';
  s.ball.pos = { x: 0, y: 3, z: 0 }; // free, out of everyone's reach
  return s;
}

/** A rooftop state with a gust blowing along `dir` that will not end during the test. */
function gusty(dir = { x: 1, y: 0, z: 0 }, seed = 1): MatchState {
  const s = match(rooftop, seed);
  s.courtState = { nextGustTick: 1_000_000, gust: { ticksLeft: 1000, dir } };
  return s;
}

function player(s: MatchState, id: string): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(s: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(s, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

describe('court registry (spec D.4)', () => {
  it('has the four courts on the gym’s play area and hoops, each dressed', () => {
    expect(courts.map((c) => c.id)).toEqual(['gym', 'rooftop', 'volcano', 'frozen']);
    for (const c of courts) {
      expect(c.playArea).toEqual(gym.playArea);
      expect(c.hoops).toEqual(gym.hoops);
      expect(['none', 'rain', 'embers']).toContain(c.dressing.weather);
    }
    expect(gym.modifier).toBeUndefined();
    expect(gym.dressing).toEqual({
      floorColor: 0xc9a06a,
      lineColor: 0xffffff,
      floorRoughness: 1,
      weather: 'none',
    });
    expect(rooftop.dressing.weather).toBe('rain');
    expect(volcano.dressing.weather).toBe('embers');
  });
});

describe('Rooftop Storm — gusts (spec D.4)', () => {
  it('schedules the first gust 900–1500 ticks ahead with exactly one draw', () => {
    const s = match(rooftop, 5);
    const { state } = tick(s, new Map(), rooftop);
    const rng = createRng(5);
    const gap = GUST_MIN_GAP_TICKS + nextInt(rng, GUST_GAP_SPREAD_TICKS + 1);
    expect(state.courtState).toEqual({ nextGustTick: state.tick + gap, gust: null });
    expect(gap).toBeGreaterThanOrEqual(900);
    expect(gap).toBeLessThanOrEqual(1500);
    expect(state.rng.seed).toBe(rng.seed);
  });

  it('a gust starts on schedule with a horizontal unit direction, blows 180 ticks, then the next is scheduled', () => {
    let s = match(rooftop, 9);
    s.courtState = { nextGustTick: s.tick + 1, gust: null };
    const events: SimEvent[] = [];
    let ticks = 0;
    let started = -1;
    while (!events.some((e) => e.type === 'gustEnd') && ticks < 400) {
      const r = tick(s, new Map(), rooftop);
      s = r.state;
      events.push(...r.events);
      ticks++;
      if (started < 0 && r.events.some((e) => e.type === 'gustStart')) started = s.tick;
    }
    const start = events.find((e) => e.type === 'gustStart');
    if (!start || start.type !== 'gustStart') throw new Error('no gust');
    expect(Math.hypot(start.dir.x, start.dir.z)).toBeCloseTo(1);
    expect(start.dir.y).toBe(0);
    expect(s.tick - started + 1).toBe(GUST_TICKS);
    expect(gustOf(s)).toBeNull();
    const next = (s.courtState as { nextGustTick: number }).nextGustTick;
    expect(next - s.tick).toBeGreaterThanOrEqual(900);
    expect(next - s.tick).toBeLessThanOrEqual(1500);
  });

  it('shooting ×0.85 during a gust only, and aiHint reports the drift then', () => {
    const calm = tick(match(rooftop), new Map(), rooftop).state;
    const a0 = player(calm, 'a');
    expect(a0.stats.shooting).toBeCloseTo(a0.baseStats.shooting);
    expect(rooftop.modifier?.aiHint?.(calm, a0)).toEqual({});
    const windy = tick(gusty({ x: 0, y: 0, z: -1 }), new Map(), rooftop).state;
    const a1 = player(windy, 'a');
    expect(a1.stats.shooting).toBeCloseTo(a1.baseStats.shooting * 0.85);
    expect(rooftop.modifier?.aiHint?.(windy, a1)).toEqual({
      ballDrift: { x: 0, y: 0, z: -GUST_BALL_ACCEL },
    });
  });

  it('pushes a free ball 4 m/s² and airborne players 2 m/s² along the gust; grounded players stay put', () => {
    const still = match(gym);
    const windy = gusty();
    for (const s of [still, windy]) {
      const a = player(s, 'a');
      a.onGround = false;
      a.pos.y = 1;
    }
    const g = tick(still, new Map(), gym).state;
    const w = tick(windy, new Map(), rooftop).state;
    expect(w.ball.vel.x - g.ball.vel.x).toBeCloseTo(GUST_BALL_ACCEL * TICK_DT, 4);
    expect(player(w, 'a').vel.x - player(g, 'a').vel.x).toBeCloseTo(GUST_PLAYER_ACCEL * TICK_DT, 4);
    expect(player(w, 'b').vel.x).toBe(0);
  });
});

describe('the shot bow (spec D.4)', () => {
  it('is zero at both ends and full at the middle', () => {
    expect(bowFactor(0, 90)).toBe(0);
    expect(bowFactor(90, 90)).toBe(0);
    expect(bowFactor(45, 90)).toBeCloseTo(1);
    expect(shotBow({ x: 4, y: 0, z: 0 }, 60)).toEqual({ x: 0.5, y: 0, z: 0 }); // 4 · 1² / 8
  });

  it('bends a shot released in a gust and lands it exactly where the outcome says', () => {
    const s = gusty({ x: 0, y: 0, z: 1 });
    const a = place(s, 'a', hoop.rimCenter.x - 6, 0);
    giveBall(s, a, []);
    startShot(s, a, rooftop);
    launchShot(s, a, rooftop, [], { quality: 1, made: true, missType: null, jitter: null });
    const flight = s.ball.flight;
    if (!flight) throw new Error('no flight');
    expect(flight.bow).toEqual(shotBow({ x: 0, y: 0, z: GUST_BALL_ACCEL }, flight.totalTicks));
    let maxOffset = 0;
    for (let k = 1; k <= flight.totalTicks; k++) {
      stepFlight(s.ball, rooftop);
      const straight = arcPoint(flight.from, flight.velocity, rooftop.physics.gravity, k * TICK_DT);
      maxOffset = Math.max(maxOffset, s.ball.pos.z - straight.z);
      if (k === flight.totalTicks) expect(s.ball.pos).toEqual(straight);
    }
    expect(maxOffset).toBeGreaterThan(0.5);
  });

  it('a made shot in a gust still scores', () => {
    let s = gusty({ x: 0, y: 0, z: 1 });
    const a = place(s, 'a', hoop.rimCenter.x - 6, 0);
    giveBall(s, a, []);
    startShot(s, a, rooftop);
    launchShot(s, a, rooftop, [], { quality: 1, made: true, missType: null, jitter: null });
    const events: SimEvent[] = [];
    for (let i = 0; i < 150 && !events.some((e) => e.type === 'basket'); i++) {
      const r = tick(s, new Map(), rooftop);
      s = r.state;
      events.push(...r.events);
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'basket', playerId: 'a' }));
  });

  it('shots outside a gust have no bow', () => {
    const s = match(rooftop);
    s.courtState = { nextGustTick: 1_000_000, gust: null };
    const a = place(s, 'a', hoop.rimCenter.x - 6, 0);
    giveBall(s, a, []);
    startShot(s, a, rooftop);
    launchShot(s, a, rooftop, [], { quality: 1, made: true, missType: null, jitter: null });
    expect(s.ball.flight?.bow).toBeNull();
  });
});

describe('the pass landing shift (spec D.4)', () => {
  it('shifts a pass released in a gust by 4 m/s² × T² / 2 along the gust', () => {
    const s = gusty({ x: 1, y: 0, z: 0 });
    const a = place(s, 'a', 0, 0);
    giveBall(s, a, []);
    const b = place(s, 'b', 0, 5);
    expect(startPass(s, a)).toBe(true);
    releasePass(s, a, rooftop, []);
    const flight = s.ball.flight;
    if (!flight) throw new Error('no pass');
    const t = flight.totalTicks * TICK_DT;
    const landing = passLanding(flight, rooftop);
    expect(landing.x).toBeCloseTo(b.pos.x + GUST_BALL_ACCEL * 0.5 * t * t, 5);
    expect(landing.z).toBeCloseTo(b.pos.z, 5);
    expect(flight.bow).toBeNull();
  });
});

describe('Volcano Rim — heat, and Frozen Lake — slick (spec D.4)', () => {
  it('heat: turbo drains ×1.5, shoves deal ×1.4 stun, resistance ×0.5; no RNG', () => {
    const v = tick(match(volcano), new Map(), volcano).state;
    const g = tick(match(gym), new Map(), gym).state;
    const p = player(v, 'a');
    expect(p.stats.turboDrainPerTick).toBeCloseTo(p.baseStats.turboDrainPerTick * 1.5);
    expect(p.stats.stunTicksDealt).toBeCloseTo(p.baseStats.stunTicksDealt * 1.4);
    expect(p.stats.stunResistTicks).toBeCloseTo(p.baseStats.stunResistTicks * 0.5);
    expect(v.rng.seed).toBe(g.rng.seed);
    expect(v.courtState).toEqual({});
  });

  it('heat does not scale Earthquake’s fixed 90 ticks', () => {
    const s = createMatch(
      {
        durationMs: 180_000,
        shotClockMs: 14_000,
        seed: 1,
        ruleIds: [],
        courtId: 'volcano',
        mode: 'match',
      },
      volcano,
      [
        { id: 'r', team: 0, characterId: 'rook', character: getCharacter('rook') },
        { id: 'x', team: 1, characterId: 'brick', character: getCharacter('brick') },
      ],
    );
    s.phase = 'live';
    place(s, 'r', 0, 0);
    place(s, 'x', 2, 0);
    s.ball.pos = { x: 0, y: 3, z: 6 };
    player(s, 'r').charge = CHARGE_MAX;
    const { state } = tick(
      s,
      new Map([['r', { ...NO_INTENT, special: true }]]),
      volcano,
      ABILITIES,
    );
    expect(player(state, 'x').stunTicks).toBe(90);
  });

  it('slick: friction 0.3, acceleration ×0.4, deceleration ×0.25; no RNG', () => {
    expect(frozen.physics.friction).toBe(0.3);
    const f = tick(match(frozen), new Map(), frozen).state;
    const g = tick(match(gym), new Map(), gym).state;
    const p = player(f, 'a');
    expect(p.stats.acceleration).toBeCloseTo(p.baseStats.acceleration * 0.4);
    expect(p.stats.deceleration).toBeCloseTo(p.baseStats.deceleration * 0.25);
    expect(f.rng.seed).toBe(g.rng.seed);
  });
});

describe('stats when a timed ability ends on a modifier court', () => {
  it('fall back to base plus the court modifier on the end tick itself', () => {
    const s = createMatch(
      {
        durationMs: 180_000,
        shotClockMs: 14_000,
        seed: 1,
        ruleIds: [],
        courtId: 'frozen',
        mode: 'match',
      },
      frozen,
      [
        { id: 'r', team: 0, characterId: 'brick', character: getCharacter('brick') },
        { id: 'x', team: 1, characterId: 'ace', character: getCharacter('ace') },
      ],
    );
    s.phase = 'live';
    place(s, 'r', 0, 0);
    place(s, 'x', -8, 5);
    s.ball.pos = { x: 0, y: 3, z: 6 };
    player(s, 'r').charge = CHARGE_MAX;
    let state = tick(s, new Map([['r', { ...NO_INTENT, special: true }]]), frozen, ABILITIES).state;
    const slickStats = {
      ...player(state, 'r').baseStats,
      acceleration: player(state, 'r').baseStats.acceleration * 0.4,
      deceleration: player(state, 'r').baseStats.deceleration * 0.25,
    };
    expect(player(state, 'r').stats.dunkFromArc).toBe(true);
    let ended = false;
    for (let i = 0; i < 600 && !ended; i++) {
      const r = tick(state, new Map(), frozen, ABILITIES);
      state = r.state;
      ended = r.events.some((e) => e.type === 'abilityEnded');
    }
    expect(ended).toBe(true);
    expect(player(state, 'r').ability).toBeNull();
    expect(player(state, 'r').stats).toEqual(slickStats);
  });
});
