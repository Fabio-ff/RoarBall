import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Vec3 } from '../sim/math';
import type { CourtDef, SimEvent, Weather } from '../sim/types';

export const RAIN_COUNT = 400;
export const EMBER_COUNT = 120;
const RAIN_FALL_SPEED = 14;
const RAIN_WIND_SPEED = 6;
const EMBER_RISE_SPEED = 1.2;
const EMBER_WIND_SPEED = 2;
/** Particles live in a box this high and this far beyond the play area. */
const TOP = 12;
const MARGIN = 4;
const UP = new Vector3(0, 1, 0);

/** Wraps `v` into [-half, half) (modulo the box extent). */
function wrap(v: number, half: number): number {
  if (v >= -half && v < half) return v;
  const size = half * 2;
  return ((((v + half) % size) + size) % size) - half;
}

/** Rain falls at 14 m/s and is blown 6 m/s along a gust (spec D.6: streaks slant with the gust). */
export function rainVelocity(gust: Vec3 | null): Vec3 {
  return gust
    ? { x: gust.x * RAIN_WIND_SPEED, y: -RAIN_FALL_SPEED, z: gust.z * RAIN_WIND_SPEED }
    : { x: 0, y: -RAIN_FALL_SPEED, z: 0 };
}

/** Writes the particle velocity into `out` (no allocation: the per-frame path). */
function velocityInto(out: Vec3, rain: boolean, gust: Vec3 | null): void {
  if (rain) {
    out.x = gust ? gust.x * RAIN_WIND_SPEED : 0;
    out.y = -RAIN_FALL_SPEED;
    out.z = gust ? gust.z * RAIN_WIND_SPEED : 0;
  } else {
    out.x = (gust?.x ?? 0) * EMBER_WIND_SPEED;
    out.y = EMBER_RISE_SPEED;
    out.z = (gust?.z ?? 0) * EMBER_WIND_SPEED;
  }
}

/**
 * Placeholder weather (spec D.6): instanced rain streaks on the rooftop, rising embers on the
 * volcano, nothing elsewhere. Reads simulation events only (gustStart / gustEnd).
 */
export class WeatherView {
  readonly group = new Group();
  readonly kind: Weather;
  private mesh: InstancedMesh | null = null;
  private readonly particles: Vec3[] = [];
  private gust: Vec3 | null = null;
  private readonly halfX: number;
  private readonly halfZ: number;
  private readonly matrix = new Matrix4();
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly axis = new Vector3();
  private readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    court: CourtDef,
    private readonly random: () => number = Math.random,
  ) {
    this.kind = court.dressing.weather;
    this.halfX = court.playArea.length / 2 + MARGIN;
    this.halfZ = court.playArea.width / 2 + MARGIN;
    if (this.kind === 'none') return;
    const rain = this.kind === 'rain';
    const count = rain ? RAIN_COUNT : EMBER_COUNT;
    this.mesh = new InstancedMesh(
      rain ? new BoxGeometry(0.02, 0.5, 0.02) : new SphereGeometry(0.05, 6, 4),
      rain
        ? new MeshBasicMaterial({ color: 0xa8c4e0, transparent: true, opacity: 0.5 })
        : new MeshBasicMaterial({ color: 0xff7a1a }),
      count,
    );
    for (let i = 0; i < count; i++) this.particles.push(this.spawn(this.random() * TOP));
    this.group.add(this.mesh);
    this.writeMatrices();
  }

  /** For tests: the instanced mesh, or null when the court has no weather. */
  get instances(): InstancedMesh | null {
    return this.mesh;
  }

  /** Angle of the rain streaks from vertical, radians. */
  get tilt(): number {
    const v = rainVelocity(this.gust);
    return Math.atan2(Math.hypot(v.x, v.z), -v.y);
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'gustStart') this.gust = { ...e.dir };
      else if (e.type === 'gustEnd') this.gust = null;
      else if (e.type === 'phaseChange' && e.to === 'finished') this.gust = null; // no gustEnd follows
    }
  }

  /** A new match starts calm. */
  reset(): void {
    this.gust = null;
  }

  update(dtSeconds: number): void {
    if (!this.mesh) return;
    const v = this.velocity;
    velocityInto(v, this.kind === 'rain', this.gust);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p) continue;
      p.x += v.x * dtSeconds;
      p.y += v.y * dtSeconds;
      p.z += v.z * dtSeconds;
      // A particle leaving the box re-enters on the opposite side (modulo the extents), so wind
      // never thins the upwind edge. In place: no per-frame allocation.
      p.x = wrap(p.x, this.halfX);
      p.z = wrap(p.z, this.halfZ);
      if (p.y < 0) p.y += TOP;
      else if (p.y > TOP) p.y -= TOP;
    }
    this.writeMatrices();
  }

  private spawn(y: number): Vec3 {
    return {
      x: (this.random() * 2 - 1) * this.halfX,
      y,
      z: (this.random() * 2 - 1) * this.halfZ,
    };
  }

  private writeMatrices(): void {
    const mesh = this.mesh;
    if (!mesh) return;
    // Streaks lie along their velocity (pointing up the fall line); embers are round.
    const v = this.velocity;
    velocityInto(v, this.kind === 'rain', this.gust);
    this.axis.set(-v.x, -v.y, -v.z);
    if (v.y > 0) this.axis.negate();
    this.rotation.setFromUnitVectors(UP, this.axis.normalize());
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p) continue;
      this.position.set(p.x, p.y, p.z);
      this.matrix.compose(this.position, this.rotation, this.scale);
      mesh.setMatrixAt(i, this.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}
