import { TICK_DT } from './constants';
import { knockDown } from './defence';
import { hoopGeometry } from './hoop';
import { clamp, lerp, v3Add, v3DistanceXZ, v3Length, v3Scale, v3Sub, type Vec3 } from './math';
import { nextFloat, nextInt, type RngState } from './rng';
import { targetHoopIndex } from './shooting';
import type { CourtDef, MatchState, PlayerState, ResolvedStats, SimEvent } from './types';

/**
 * Spec A.7 / D.2: the sim's pure helpers, handed to content hooks (content may import only types
 * from `src/sim`). Content draws randomness only as `ctx.math.nextFloat(ctx.rng)` or
 * `ctx.math.nextInt(ctx.rng, n)`.
 */
export const HOOK_MATH = Object.freeze({
  TICK_DT,
  clamp,
  lerp,
  v3Add,
  v3Sub,
  v3Scale,
  v3Length,
  v3DistanceXZ,
  nextFloat,
  nextInt,
  /** XZ distance from `player` to the rim they shoot at (spec A.4 target hoop). */
  targetRimDistance(state: MatchState, player: PlayerState, court: CourtDef): number {
    const rim = hoopGeometry(court, targetHoopIndex(state, player, court)).rimCenter;
    return v3DistanceXZ(player.pos, rim);
  },
});
export type HookMath = typeof HOOK_MATH;

/** What `aiWantsToUse` may look at: no RNG, so brains never touch `state.rng` (spec C.2). */
export interface AbilityQueryContext {
  math: HookMath;
  court: CourtDef;
}

/** Spec D.2: everything a hook may use besides the state and its own arguments. */
export interface HookContext extends AbilityQueryContext {
  /** `state.rng`; hooks draw only through it (spec A.7, D.2). */
  rng: RngState;
  /** Adds an event to this tick's events. */
  emit(event: SimEvent): void;
  /** Spec D.3: knock `target` down for `ticks`, ignoring stun resistance and shove immunity. */
  knockDown(by: PlayerState, target: PlayerState, ticks: number): void;
}

/** Spec §5.3 / D.2. Hooks mutate the state they are given; `modifyStats` returns a new object. */
export interface AbilityEffect {
  onActivate(state: MatchState, player: PlayerState, ctx: HookContext): void;
  onTick?(state: MatchState, player: PlayerState, ctx: HookContext): void;
  onEnd?(state: MatchState, player: PlayerState, ctx: HookContext): void;
  modifyStats?(stats: ResolvedStats): ResolvedStats;
}

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Ticks it lasts; 'instant' ends on the activation tick; null lasts until its `uses` run out. */
  durationTicks: number | 'instant' | null;
  effect: AbilityEffect;
  /** Spec D.5: checked on AI decision ticks only, when the ability could activate. */
  aiWantsToUse?(state: MatchState, player: PlayerState, ctx: AbilityQueryContext): boolean;
}

/** Abilities keyed by id; the app passes the content table, tests pass their own. */
export type AbilityTable = Readonly<Partial<Record<string, AbilityDef>>>;

/** With this table nothing ever activates (the gym baseline of spec D.2). */
export const NO_ABILITIES: AbilityTable = Object.freeze({});

/** Spec §7.1 / D.4. */
export interface CourtModifier {
  id: string;
  name: string;
  description: string;
  onTick?(state: MatchState, ctx: HookContext): void;
  modifyStats?(stats: ResolvedStats, state: MatchState): ResolvedStats;
  aiHint?(state: MatchState, player: PlayerState): { ballDrift?: Vec3 };
  /** Horizontal acceleration (m/s²) the weather puts on the ball right now, or null; read when a shot or pass is released. */
  ballDrift?(state: MatchState): Vec3 | null;
}

/** One context per tick, bound to the state being built and this tick's events. */
export function createHookContext(
  state: MatchState,
  court: CourtDef,
  events: SimEvent[],
): HookContext {
  return {
    rng: state.rng,
    math: HOOK_MATH,
    court,
    emit: (event) => {
      events.push(event);
    },
    knockDown: (by, target, ticks) => knockDown(state, by, target, ticks, events),
  };
}
