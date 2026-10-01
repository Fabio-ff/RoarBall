import { clamp, v3Add, v3Dot, v3Length, v3Scale, v3Sub, type Vec3 } from './math';

export interface Contact {
  /** Unit vector pointing out of the obstacle, towards the sphere centre. */
  normal: Vec3;
  /** How far the sphere must move along `normal` to stop overlapping. */
  depth: number;
}

const EPSILON = 1e-9;

export function sphereVsFloor(center: Vec3, radius: number): Contact | null {
  const depth = radius - center.y;
  return depth > 0 ? { normal: { x: 0, y: 1, z: 0 }, depth } : null;
}

/** Axis-aligned box given by centre and half extents. */
export function sphereVsBox(
  center: Vec3,
  radius: number,
  boxCenter: Vec3,
  boxHalf: Vec3,
): Contact | null {
  const closest: Vec3 = {
    x: clamp(center.x, boxCenter.x - boxHalf.x, boxCenter.x + boxHalf.x),
    y: clamp(center.y, boxCenter.y - boxHalf.y, boxCenter.y + boxHalf.y),
    z: clamp(center.z, boxCenter.z - boxHalf.z, boxCenter.z + boxHalf.z),
  };
  const delta = v3Sub(center, closest);
  const dist = v3Length(delta);
  if (dist >= radius) return null;
  if (dist > EPSILON) return { normal: v3Scale(delta, 1 / dist), depth: radius - dist };

  // Centre inside the box: leave through the nearest face.
  const local = v3Sub(center, boxCenter);
  const penX = boxHalf.x - Math.abs(local.x);
  const penY = boxHalf.y - Math.abs(local.y);
  const penZ = boxHalf.z - Math.abs(local.z);
  const sign = (v: number): number => (v < 0 ? -1 : 1);
  if (penX <= penY && penX <= penZ) {
    return { normal: { x: sign(local.x), y: 0, z: 0 }, depth: penX + radius };
  }
  if (penY <= penZ) return { normal: { x: 0, y: sign(local.y), z: 0 }, depth: penY + radius };
  return { normal: { x: 0, y: 0, z: sign(local.z) }, depth: penZ + radius };
}

/** Horizontal ring (torus) of radius `ringRadius` and tube radius `tube` centred at `ringCenter`. */
export function sphereVsRing(
  center: Vec3,
  radius: number,
  ringCenter: Vec3,
  ringRadius: number,
  tube: number,
): Contact | null {
  const dx = center.x - ringCenter.x;
  const dz = center.z - ringCenter.z;
  const h = Math.hypot(dx, dz);
  const closest: Vec3 =
    h > EPSILON
      ? {
          x: ringCenter.x + (dx / h) * ringRadius,
          y: ringCenter.y,
          z: ringCenter.z + (dz / h) * ringRadius,
        }
      : { x: ringCenter.x + ringRadius, y: ringCenter.y, z: ringCenter.z };
  const delta = v3Sub(center, closest);
  const dist = v3Length(delta);
  const reach = radius + tube;
  if (dist >= reach) return null;
  const normal = dist > EPSILON ? v3Scale(delta, 1 / dist) : { x: 0, y: 1, z: 0 };
  return { normal, depth: reach - dist };
}

/** Contact of a sphere with a capsule (segment a→b, radius), or null. */
export function sphereVsCapsuleContact(
  center: Vec3,
  radius: number,
  a: Vec3,
  b: Vec3,
  capsuleRadius: number,
): Contact | null {
  const ab = v3Sub(b, a);
  const lengthSq = v3Dot(ab, ab);
  const t = lengthSq > EPSILON ? clamp(v3Dot(v3Sub(center, a), ab) / lengthSq, 0, 1) : 0;
  const closest = v3Add(a, v3Scale(ab, t));
  const delta = v3Sub(center, closest);
  const dist = v3Length(delta);
  const reach = radius + capsuleRadius;
  if (dist >= reach) return null;
  const normal = dist > EPSILON ? v3Scale(delta, 1 / dist) : { x: 1, y: 0, z: 0 };
  return { normal, depth: reach - dist };
}

/** True when the sphere overlaps the capsule with axis segment a→b. */
export function sphereVsCapsule(
  center: Vec3,
  radius: number,
  a: Vec3,
  b: Vec3,
  capsuleRadius: number,
): boolean {
  return sphereVsCapsuleContact(center, radius, a, b, capsuleRadius) !== null;
}

/**
 * Velocity after hitting a surface: the normal component is reversed and scaled by
 * `restitution`; the tangential component keeps `tangentialKeep` of its speed (surface friction).
 * A velocity already leaving the surface is returned unchanged.
 */
export function reflect(vel: Vec3, normal: Vec3, restitution: number, tangentialKeep = 0.85): Vec3 {
  const vn = v3Dot(vel, normal);
  if (vn >= 0) return { ...vel };
  const normalPart = v3Scale(normal, vn);
  const tangent = v3Sub(vel, normalPart);
  return v3Add(v3Scale(tangent, tangentialKeep), v3Scale(normal, -vn * restitution));
}
