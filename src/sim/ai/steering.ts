import type { Vec2, Vec3 } from '../math';
import type { PlayerState } from '../types';
import type { AiProfile } from './profile';

export const ARRIVE_RADIUS = 0.4;
/** Spec C.5: turbo to recover or drive only from this far away. */
export const TURBO_RECOVER_DISTANCE = 4;

/** Unit court-space step (x → X, y → Z) from `from` towards `to`; zero inside the arrive radius. */
export function steerTowards(from: Vec3, to: Vec3, arriveRadius = ARRIVE_RADIUS): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d <= arriveRadius) return { x: 0, y: 0 };
  return { x: dx / d, y: dz / d };
}

/** Turbo when the way is long and the bar is above the profile's threshold. */
export function wantsTurbo(player: PlayerState, distance: number, profile: AiProfile): boolean {
  return distance > TURBO_RECOVER_DISTANCE && player.turbo >= profile.turboThreshold;
}
