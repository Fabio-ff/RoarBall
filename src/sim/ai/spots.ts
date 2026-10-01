import type { HoopGeometry } from '../hoop';
import { distanceToSegmentXZ, v3DistanceXZ, type Vec3 } from '../math';

/** Spec §6 / C.5 named spots around the attacking hoop. */
export type SpotName =
  'leftCorner' | 'rightCorner' | 'leftWing' | 'rightWing' | 'top' | 'underBasket';

export const SPOT_NAMES: readonly SpotName[] = [
  'leftCorner',
  'rightCorner',
  'leftWing',
  'rightWing',
  'top',
  'underBasket',
];

export interface NamedSpot {
  name: SpotName;
  spot: Vec3;
}

/** Offsets from the rim: `back` towards centre court (−side·X), `side` across the width (Z). */
const SPOT_OFFSETS: Readonly<Record<SpotName, { back: number; side: number }>> = {
  leftCorner: { back: 1.0, side: -6.3 },
  rightCorner: { back: 1.0, side: 6.3 },
  leftWing: { back: 5.0, side: -4.5 },
  rightWing: { back: 5.0, side: 4.5 },
  top: { back: 6.5, side: 0 },
  underBasket: { back: 1.2, side: 0 },
};

/** Spec C.5 penalties: inside the handler→rim lane, and crowding the handler. */
export const SPOT_LANE_PENALTY_RADIUS = 2.5;
export const SPOT_HANDLER_PENALTY_RADIUS = 3;
/**
 * The drive lane stops this far short of the rim. `underBasket` sits 1.2 m from the rim, so the
 * lane must end more than SPOT_LANE_PENALTY_RADIUS + 1.2 = 3.7 m short for that spot to be out
 * of it (a 2 m shortening still left it 0.8 m from the lane's end, i.e. always penalised).
 */
export const SPOT_LANE_RIM_CLEARANCE = 4;
const SPOT_PENALTY = 3;
/** Openness saturates: a defender 6 m away is as good as one 10 m away. */
const OPENNESS_CAP = 6;
export const SPOT_HYSTERESIS = 1.5;

export function namedSpot(hoop: HoopGeometry, name: SpotName): Vec3 {
  const o = SPOT_OFFSETS[name];
  return { x: hoop.rimCenter.x - hoop.side * o.back, y: 0, z: hoop.rimCenter.z + o.side };
}

function nearestDistance(spot: Vec3, opponents: readonly Vec3[]): number {
  let nearest = Infinity;
  for (const o of opponents) nearest = Math.min(nearest, v3DistanceXZ(spot, o));
  return nearest;
}

function openness(spot: Vec3, opponents: readonly Vec3[]): number {
  return Math.min(OPENNESS_CAP, nearestDistance(spot, opponents));
}

/** The drive lane: handler → a point SPOT_LANE_RIM_CLEARANCE short of the rim (never behind the handler). */
function laneEnd(handlerPos: Vec3, rim: Vec3): Vec3 {
  const dx = handlerPos.x - rim.x;
  const dz = handlerPos.z - rim.z;
  const d = Math.hypot(dx, dz);
  if (d <= SPOT_LANE_RIM_CLEARANCE) return handlerPos;
  const k = SPOT_LANE_RIM_CLEARANCE / d;
  return { x: rim.x + dx * k, y: 0, z: rim.z + dz * k };
}

/** Openness − lane penalty − handler penalty (spec C.5). */
export function scoreSpot(
  spot: Vec3,
  handlerPos: Vec3,
  rim: Vec3,
  opponents: readonly Vec3[],
): number {
  let score = openness(spot, opponents);
  if (distanceToSegmentXZ(spot, handlerPos, laneEnd(handlerPos, rim)) < SPOT_LANE_PENALTY_RADIUS)
    score -= SPOT_PENALTY;
  if (v3DistanceXZ(spot, handlerPos) < SPOT_HANDLER_PENALTY_RADIUS) score -= SPOT_PENALTY;
  return score;
}

/**
 * The best spot for an off-ball attacker; keeps `current` unless another spot beats it by
 * SPOT_HYSTERESIS. Ties resolve in SPOT_NAMES order, so the choice is deterministic.
 */
export function pickOpenSpot(
  hoop: HoopGeometry,
  handlerPos: Vec3,
  opponents: readonly Vec3[],
  current: NamedSpot | null,
): NamedSpot {
  let best: NamedSpot | null = null;
  let bestScore = -Infinity;
  for (const name of SPOT_NAMES) {
    const spot = namedSpot(hoop, name);
    const score = scoreSpot(spot, handlerPos, hoop.rimCenter, opponents);
    if (score > bestScore) {
      best = { name, spot };
      bestScore = score;
    }
  }
  if (current) {
    const currentScore = scoreSpot(current.spot, handlerPos, hoop.rimCenter, opponents);
    if (bestScore - currentScore < SPOT_HYSTERESIS) return current;
  }
  return best as NamedSpot;
}

/** For a reset with the ball (C.5 step 7): the named spot farthest from the defenders. */
export function farthestSpot(hoop: HoopGeometry, defenders: readonly Vec3[]): NamedSpot {
  let best: NamedSpot | null = null;
  let bestScore = -Infinity;
  for (const name of SPOT_NAMES) {
    if (name === 'underBasket') continue;
    const spot = namedSpot(hoop, name);
    const score = nearestDistance(spot, defenders);
    if (score > bestScore) {
      best = { name, spot };
      bestScore = score;
    }
  }
  return best as NamedSpot;
}
