import { Group, Mesh, MeshBasicMaterial, SphereGeometry, type Object3D } from 'three';
import type { Vec3 } from '../sim/math';
import { BurstPool } from './burst-pool';

const FLASH_SECONDS = 0.4;
const RIM_SHAKE_SECONDS = 0.5;
const RIM_SHAKE_AMPLITUDE = 0.08;

interface RimShake {
  target: Object3D;
  age: number;
}

interface Flash {
  mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  age: number;
}

/** Short-lived presentation effects driven by simulation events (spec §9). */
export class EffectsView {
  readonly group = new Group();
  readonly bursts = new BurstPool();
  private readonly flashes: Flash[] = [];
  private readonly rimShakes: RimShake[] = [];

  constructor() {
    this.group.add(this.bursts.mesh);
  }

  spawnBurst(pos: Vec3, color: number, size: 'small' | 'big'): void {
    this.bursts.spawn(pos, color, size === 'big' ? 60 : 24, size === 'big' ? 5 : 3);
  }

  spawnFlash(pos: Vec3, color = 0xffe066): void {
    const mesh = new Mesh(
      new SphereGeometry(0.3, 12, 8),
      new MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    mesh.position.set(pos.x, pos.y, pos.z);
    this.group.add(mesh);
    this.flashes.push({ mesh, age: 0 });
  }

  /** Wobbles a rim group around z for 0.5 s (a dunk). Restarts if it is already wobbling. */
  shakeRim(target: Object3D): void {
    const active = this.rimShakes.find((r) => r.target === target);
    if (active) active.age = 0;
    else this.rimShakes.push({ target, age: 0 });
  }

  update(dtSeconds: number): void {
    this.bursts.update(dtSeconds);
    for (let i = this.rimShakes.length - 1; i >= 0; i--) {
      const shake = this.rimShakes[i];
      if (!shake) continue;
      shake.age += dtSeconds;
      if (shake.age >= RIM_SHAKE_SECONDS) {
        shake.target.rotation.z = 0;
        this.rimShakes.splice(i, 1);
      } else {
        shake.target.rotation.z =
          RIM_SHAKE_AMPLITUDE * Math.exp(-8 * shake.age) * Math.sin(40 * shake.age);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      if (!flash) continue;
      flash.age += dtSeconds;
      const k = flash.age / FLASH_SECONDS;
      flash.mesh.scale.setScalar(1 + k * 4);
      flash.mesh.material.opacity = Math.max(0, 1 - k);
      if (flash.age >= FLASH_SECONDS) {
        this.group.remove(flash.mesh);
        flash.mesh.geometry.dispose();
        flash.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
  }
}
