import { lerp, wrapAngle, type Vec3 } from '../sim/math';

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

/** Interpolates along the shortest arc so a facing flip never spins the long way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}
