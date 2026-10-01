import { hoopGeometry } from '../hoop';
import { clamp, distanceToSegmentXZ, v3DistanceXZ, type Vec3 } from '../math';
import { allPlayers } from '../match';
import { ALLEY_OOP_RANGE, passLaneOpen, teammateOf } from '../passing';
import { nextFloat } from '../rng';
import { evaluateShot, hasSureShot, shotQuality, type ShotEvaluation } from '../shooting';
import type { CourtDef, MatchState, PlayerState } from '../types';
import type { AiGoal, AiMemory } from './memory';
import type { AiProfile } from './profile';
import { farthestSpot } from './spots';

/** Spec C.5 "has ball" numbers. */
export const PANIC_SHOT_CLOCK_MS = 3000;
export const PANIC_MIN_QUALITY = 0.15;
export const CONTESTED_AIRBORNE_RADIUS = 1.5;
export const LANE_BLOCK_RADIUS = 1.2;
export const SIDE_STEP_DISTANCE = 2;
/** The side-step also gains a metre towards the rim so the drive keeps progressing. */
const SIDE_STEP_FORWARD = 1;
export const RESET_AFTER_CLOSED_DECISIONS = 3;
export const RESET_MIN_SHOT_CLOCK_MS = 6000;
/** Spec C.3: the teammate brain's extra bias towards passing to the human. */
export const TEAMMATE_PASS_BIAS = -0.15;

export function opponentsOf(state: MatchState, player: PlayerState): PlayerState[] {
  return allPlayers(state).filter((p) => p.team !== player.team);
}

/**
 * The shot quality as the brain sees it: the true value plus seeded noise from the profile.
 * RNG draw order: exactly one draw per call, from the brain's private RNG (never state.rng).
 */
export function perceive(quality: number, memory: AiMemory, profile: AiProfile): number {
  const jitter = (nextFloat(memory.rng) * 2 - 1) * profile.perceptionNoise;
  return clamp(quality + jitter, 0, 1);
}

/** The opponent closing the drive: within LANE_BLOCK_RADIUS of me→rim and nearer the rim than I am. */
export function laneBlocker(
  me: PlayerState,
  rim: Vec3,
  opponents: readonly PlayerState[],
): PlayerState | null {
  const myDistance = v3DistanceXZ(me.pos, rim);
  let blocker: PlayerState | null = null;
  let best = Infinity;
  for (const o of opponents) {
    if (v3DistanceXZ(o.pos, rim) >= myDistance) continue;
    const d = distanceToSegmentXZ(o.pos, me.pos, rim);
    if (d <= LANE_BLOCK_RADIUS && d < best) {
      blocker = o;
      best = d;
    }
  }
  return blocker;
}

/** A blocker this close to the me→rim line (lateral, m) is dead ahead: no side is "away" (issue #92). */
export const SIDE_STEP_TIE = 0.4;

/** +1: the left-hand side of me→rim (−uz, ux); −1: the right-hand side. */
export type DriveSide = 1 | -1;

/** The signed lateral offset of `p` from the me→rim line (positive: left-hand side). */
function lateralOf(me: PlayerState, rim: Vec3, p: Vec3): number {
  const dx = rim.x - me.pos.x;
  const dz = rim.z - me.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  return (-dz / len) * (p.x - me.pos.x) + (dx / len) * (p.z - me.pos.z);
}

/**
 * A point SIDE_STEP_DISTANCE perpendicular to me→rim on the side away from the blocker (C.5
 * step 6). A blocker dead ahead (|lateral| < SIDE_STEP_TIE) has no "away" side: `tieSide` picks.
 */
export function sideStepPoint(
  me: PlayerState,
  rim: Vec3,
  blocker: PlayerState,
  tieSide: DriveSide = 1,
): Vec3 {
  const dx = rim.x - me.pos.x;
  const dz = rim.z - me.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const lateral = lateralOf(me, rim, blocker.pos);
  const sign = Math.abs(lateral) < SIDE_STEP_TIE ? tieSide : lateral > 0 ? -1 : 1;
  return {
    x: me.pos.x - uz * sign * SIDE_STEP_DISTANCE + ux * SIDE_STEP_FORWARD,
    y: 0,
    z: me.pos.z + ux * sign * SIDE_STEP_DISTANCE + uz * SIDE_STEP_FORWARD,
  };
}

/**
 * The side for a dead-ahead blocker: the stored `driveSide`, else away from the nearest other
 * opponent (the help defender; C.5 "on the side of the farther defender"). No RNG.
 */
export function deadAheadSide(
  me: PlayerState,
  rim: Vec3,
  blocker: PlayerState,
  opponents: readonly PlayerState[],
  driveSide: DriveSide | null,
): DriveSide {
  if (driveSide !== null) return driveSide;
  let help: PlayerState | null = null;
  for (const o of opponents) {
    if (o === blocker) continue;
    if (!help || v3DistanceXZ(o.pos, me.pos) < v3DistanceXZ(help.pos, me.pos)) help = o;
  }
  if (!help) return 1;
  return lateralOf(me, rim, help.pos) > 0 ? -1 : 1;
}

const SHOOT: AiGoal = { kind: 'shoot' };
const PASS: AiGoal = { kind: 'pass' };

/** Deviation from spec D.5: a Hot Hand sure shot only counts as a shot within this range of the hoop. */
export const SURE_SHOT_AI_RANGE = 9;

/**
 * `evaluateShot` as the brain uses it: sure shots (Hot Hand) report quality 1 at any range, so
 * beyond SURE_SHOT_AI_RANGE the ordinary quality is used and normal offence (drive/pass) follows.
 */
export function evaluateShotForAi(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
): ShotEvaluation {
  const e = evaluateShot(state, player, court);
  if (!hasSureShot(player) || e.distance <= SURE_SHOT_AI_RANGE) return e;
  const defenders = opponentsOf(state, player);
  return { ...e, quality: shotQuality(player, e.type, hoopGeometry(court, e.hoop), defenders) };
}

/**
 * Spec C.5 "has ball", evaluated at a decision tick. RNG: one `perceive` draw per call.
 * Mutates memory.laneClosedCount only (reads memory.driveSide).
 */
export function planWithBall(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
): AiGoal {
  const mine = evaluateShotForAi(state, me, court);
  const hoop = hoopGeometry(court, mine.hoop);
  const opponents = opponentsOf(state, me);
  const mate = teammateOf(state, me);
  const laneOpen = mate !== undefined && passLaneOpen(state, me, mate, court);
  const perceived = perceive(mine.quality, memory, profile);
  // Only a run of consecutive drive decisions counts as a closed lane: any early return resets it.
  const previousClosed = memory.laneClosedCount;
  memory.laneClosedCount = 0;

  // 1. Shot clock panic.
  if (state.shotClockMs < PANIC_SHOT_CLOCK_MS) {
    if (perceived > PANIC_MIN_QUALITY) return SHOOT;
    return laneOpen ? PASS : SHOOT;
  }
  if (mate && laneOpen) {
    // 2. Alley-oop: the sim turns this pass into a lob.
    if (!mate.onGround && v3DistanceXZ(mate.pos, hoop.rimCenter) <= ALLEY_OOP_RANGE) return PASS;
    // 3. Honour the call.
    if (mate.callingForPassTicks > 0) return PASS;
  }
  // 4. Shoot: a dunk or layup at once unless contested from the air; otherwise by threshold.
  if (mine.type !== 'jumpshot') {
    const contested = opponents.some(
      (o) => !o.onGround && v3DistanceXZ(o.pos, me.pos) <= CONTESTED_AIRBORNE_RADIUS,
    );
    if (!contested) return SHOOT;
  }
  if (perceived >= profile.shootThreshold) return SHOOT;
  // 5. Pass to a better shot.
  if (mate && laneOpen) {
    const bias = profile.passBias + (memory.favourTeammate ? TEAMMATE_PASS_BIAS : 0);
    if (evaluateShotForAi(state, mate, court).quality >= mine.quality + bias) return PASS;
  }
  // 6–7. Drive, side-step around a blocker, or reset to an open spot.
  const blocker = laneBlocker(me, hoop.rimCenter, opponents);
  memory.laneClosedCount = blocker ? previousClosed + 1 : 0;
  if (
    blocker &&
    memory.laneClosedCount >= RESET_AFTER_CLOSED_DECISIONS &&
    state.shotClockMs > RESET_MIN_SHOT_CLOCK_MS
  ) {
    memory.laneClosedCount = 0;
    const { name, spot } = farthestSpot(
      hoop,
      opponents.map((o) => o.pos),
    );
    return { kind: 'moveTo', spot, name };
  }
  if (!blocker) return { kind: 'drive', sideStep: null };
  const tieSide = deadAheadSide(me, hoop.rimCenter, blocker, opponents, memory.driveSide);
  return { kind: 'drive', sideStep: sideStepPoint(me, hoop.rimCenter, blocker, tieSide) };
}
