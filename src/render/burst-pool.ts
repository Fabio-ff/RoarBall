import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Vec3 } from '../sim/math';

export const PARTICLE_CAPACITY = 300;
export const PARTICLE_LIFE_S = 0.9;
const GRAVITY = 9.8;
/** Edge of a particle cube in metres: big enough to read at the broadcast camera distance. */
export const PARTICLE_SIZE = 0.15;

/** Pooled particle bursts (plan decision 24): one InstancedMesh, preallocated particle storage. */
export class BurstPool {
  readonly mesh: InstancedMesh;
  private count = 0;
  // Struct-of-arrays, kept compact and in spawn order (index 0 is the oldest).
  private readonly pos = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly vel = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly age = new Float32Array(PARTICLE_CAPACITY);
  private readonly rgb = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly identity = new Quaternion();
  private readonly color = new Color();

  constructor() {
    this.mesh = new InstancedMesh(
      new BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE),
      new MeshBasicMaterial({ vertexColors: false }),
      PARTICLE_CAPACITY,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'burst-particles';
    // Allocate the colour attribute up front so update never allocates.
    this.mesh.setColorAt(0, this.color.set(0xffffff));
  }

  /** Kills every particle (match restart). */
  reset(): void {
    this.count = 0;
    this.flush();
  }

  get alive(): number {
    return this.count;
  }

  positionOf(i: number): Vec3 {
    return { x: this.pos[i * 3] ?? 0, y: this.pos[i * 3 + 1] ?? 0, z: this.pos[i * 3 + 2] ?? 0 };
  }

  spawn(
    at: Vec3,
    color: number,
    count: number,
    speed: number,
    rand: () => number = Math.random,
  ): void {
    this.color.set(color);
    for (let n = 0; n < count; n++) {
      if (this.count === PARTICLE_CAPACITY) this.dropOldest();
      const i = this.count++;
      // Random direction on the upper hemisphere.
      const theta = rand() * Math.PI * 2;
      const y = rand();
      const r = Math.sqrt(1 - y * y);
      const s = speed * (0.5 + rand());
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z;
      this.vel[i * 3] = Math.cos(theta) * r * s;
      this.vel[i * 3 + 1] = y * s;
      this.vel[i * 3 + 2] = Math.sin(theta) * r * s;
      this.age[i] = 0;
      this.rgb[i * 3] = this.color.r;
      this.rgb[i * 3 + 1] = this.color.g;
      this.rgb[i * 3 + 2] = this.color.b;
    }
    this.flush();
  }

  update(dt: number): void {
    let out = 0;
    for (let i = 0; i < this.count; i++) {
      const age = (this.age[i] ?? 0) + dt;
      if (age >= PARTICLE_LIFE_S) continue;
      const vy = (this.vel[i * 3 + 1] ?? 0) - GRAVITY * dt;
      const x = (this.pos[i * 3] ?? 0) + (this.vel[i * 3] ?? 0) * dt;
      const y = (this.pos[i * 3 + 1] ?? 0) + vy * dt;
      const z = (this.pos[i * 3 + 2] ?? 0) + (this.vel[i * 3 + 2] ?? 0) * dt;
      this.copyTo(out, i);
      this.pos[out * 3] = x;
      this.pos[out * 3 + 1] = y;
      this.pos[out * 3 + 2] = z;
      this.vel[out * 3 + 1] = vy;
      this.age[out] = age;
      out++;
    }
    this.count = out;
    this.flush();
  }

  private copyTo(dst: number, src: number): void {
    if (dst === src) return;
    for (let k = 0; k < 3; k++) {
      this.pos[dst * 3 + k] = this.pos[src * 3 + k] ?? 0;
      this.vel[dst * 3 + k] = this.vel[src * 3 + k] ?? 0;
      this.rgb[dst * 3 + k] = this.rgb[src * 3 + k] ?? 0;
    }
    this.age[dst] = this.age[src] ?? 0;
  }

  private dropOldest(): void {
    for (let i = 1; i < this.count; i++) this.copyTo(i - 1, i);
    this.count--;
  }

  private flush(): void {
    for (let i = 0; i < this.count; i++) {
      const k = 1 - (this.age[i] ?? 0) / PARTICLE_LIFE_S;
      this.scale.setScalar(Math.max(0.0001, k));
      this.position.set(this.pos[i * 3] ?? 0, this.pos[i * 3 + 1] ?? 0, this.pos[i * 3 + 2] ?? 0);
      this.matrix.compose(this.position, this.identity, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.color.setRGB(this.rgb[i * 3] ?? 0, this.rgb[i * 3 + 1] ?? 0, this.rgb[i * 3 + 2] ?? 0);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
