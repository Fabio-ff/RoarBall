import { clamp, type Vec3 } from './math';

/** Initial velocity that carries a point from `from` to `to` in `flightTime` seconds under gravity. */
export function solveArcVelocity(from: Vec3, to: Vec3, flightTime: number, gravity: number): Vec3 {
  const t = flightTime;
  return {
    x: (to.x - from.x) / t,
    y: (to.y - from.y) / t + 0.5 * gravity * t,
    z: (to.z - from.z) / t,
  };
}

/** Position on the ballistic path after `t` seconds. */
export function arcPoint(from: Vec3, velocity: Vec3, gravity: number, t: number): Vec3 {
  return {
    x: from.x + velocity.x * t,
    y: from.y + velocity.y * t - 0.5 * gravity * t * t,
    z: from.z + velocity.z * t,
  };
}

/** Spec A.4: longer shots arc higher and take longer. Seconds, from horizontal distance in metres. */
export function flightTimeFor(distance: number): number {
  return clamp(0.9 + 0.08 * distance, 0.9, 2.0);
}
