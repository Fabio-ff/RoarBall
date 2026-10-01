export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function v2Length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

/** Unit vector in the same direction; a zero vector stays zero. */
export function v2Normalize(a: Vec2): Vec2 {
  const len = v2Length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

export function v2Scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function v2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function v2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Rotates counter-clockwise by `radians`. */
export function v2Rotate(a: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Moves `current` towards `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

export function v3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function v3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function v3Scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function v3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function v3Length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

/** Distance on the court plane, ignoring height. */
export function v3DistanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Distance in the XZ plane from `p` to the segment `a`→`b` (y is ignored). */
export function distanceToSegmentXZ(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = 0;
  if (len2 > 1e-12) t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2, 0, 1);
  const cx = a.x + abx * t;
  const cz = a.z + abz * t;
  return Math.hypot(p.x - cx, p.z - cz);
}
