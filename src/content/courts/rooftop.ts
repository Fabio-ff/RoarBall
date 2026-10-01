import type { CourtModifier, HookContext } from '../../sim/hooks';
import type { Vec3 } from '../../sim/math';
import type { CourtDef, MatchState } from '../../sim/types';
import { gym } from './gym';

/** Spec D.4: the next gust comes 900–1500 ticks after the last one ended (one draw). */
export const GUST_MIN_GAP_TICKS = 900;
export const GUST_GAP_SPREAD_TICKS = 600;
export const GUST_TICKS = 180;
/** m/s² along the gust: free ball, airborne players. */
export const GUST_BALL_ACCEL = 4;
export const GUST_PLAYER_ACCEL = 2;
export const GUST_SHOOTING_FACTOR = 0.85;

export interface Gust {
  ticksLeft: number;
  dir: Vec3;
}

/** The rooftop's `courtState` (spec D.4): JSON-safe, written only by this modifier. */
interface StormState {
  nextGustTick?: number;
  gust?: Gust | null;
}

function storm(state: MatchState): StormState {
  return state.courtState as unknown as StormState;
}

/** The gust blowing now, or null. */
export function gustOf(state: MatchState): Gust | null {
  return storm(state).gust ?? null;
}

function drift(state: MatchState): Vec3 | null {
  const gust = gustOf(state);
  return gust ? { x: gust.dir.x * GUST_BALL_ACCEL, y: 0, z: gust.dir.z * GUST_BALL_ACCEL } : null;
}

function scheduleNext(state: MatchState, ctx: HookContext): void {
  storm(state).nextGustTick =
    state.tick + GUST_MIN_GAP_TICKS + ctx.math.nextInt(ctx.rng, GUST_GAP_SPREAD_TICKS + 1);
}

/** Spec D.4 Gusts: every 15–25 s a 3 s gust bends shots and passes and pushes loose balls and jumpers. */
export const gusts: CourtModifier = {
  id: 'gusts',
  name: 'Gusts',
  description: 'Every 15–25 seconds a gust bends shots and passes and pushes loose balls.',
  onTick(state, ctx) {
    const s = storm(state);
    if (s.nextGustTick === undefined) {
      s.gust = null;
      scheduleNext(state, ctx);
    }
    if (!s.gust && state.tick >= (s.nextGustTick ?? Infinity)) {
      const angle = ctx.math.nextFloat(ctx.rng) * 2 * Math.PI;
      s.gust = { ticksLeft: GUST_TICKS, dir: { x: Math.cos(angle), y: 0, z: Math.sin(angle) } };
      ctx.emit({ type: 'gustStart', dir: { ...s.gust.dir } });
    }
    const gust = s.gust;
    if (!gust) return;
    const dt = ctx.math.TICK_DT;
    const { ball } = state;
    if (ball.mode === 'free') {
      ball.vel.x += gust.dir.x * GUST_BALL_ACCEL * dt;
      ball.vel.z += gust.dir.z * GUST_BALL_ACCEL * dt;
    }
    for (const team of state.teams) {
      for (const p of team.players) {
        if (p.onGround) continue;
        p.vel.x += gust.dir.x * GUST_PLAYER_ACCEL * dt;
        p.vel.z += gust.dir.z * GUST_PLAYER_ACCEL * dt;
      }
    }
    gust.ticksLeft -= 1;
    if (gust.ticksLeft <= 0) {
      s.gust = null;
      ctx.emit({ type: 'gustEnd' });
      scheduleNext(state, ctx);
    }
  },
  modifyStats: (stats, state) =>
    gustOf(state) ? { ...stats, shooting: stats.shooting * GUST_SHOOTING_FACTOR } : stats,
  ballDrift: (state) => drift(state),
  aiHint(state) {
    const d = drift(state);
    return d ? { ballDrift: d } : {};
  },
};

/** Spec §7.2: a skyscraper roof in a thunderstorm. */
export const rooftop: CourtDef = {
  ...gym,
  id: 'rooftop',
  name: 'Rooftop Storm',
  description: 'A skyscraper roof in a thunderstorm. Gusts bend shots and passes.',
  lighting: {
    skyColor: 0x2a3340,
    sunDirection: { x: -0.2, y: -1, z: -0.4 },
    sunColor: 0xaab8cc,
    ambient: 0.35,
  },
  dressing: { floorColor: 0x2b2f36, lineColor: 0xd8dde3, floorRoughness: 0.25, weather: 'rain' },
  modifier: gusts,
};
