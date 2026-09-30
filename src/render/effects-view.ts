import { Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { Vec3 } from '../sim/math';

const FLASH_SECONDS = 0.4;

interface Flash {
  mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  age: number;
}

/** Short-lived presentation effects driven by simulation events (spec §9). */
export class EffectsView {
  readonly group = new Group();
  private readonly flashes: Flash[] = [];

  spawnFlash(pos: Vec3, color = 0xffe066): void {
    const mesh = new Mesh(
      new SphereGeometry(0.3, 12, 8),
      new MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    mesh.position.set(pos.x, pos.y, pos.z);
    this.group.add(mesh);
    this.flashes.push({ mesh, age: 0 });
  }

  update(dtSeconds: number): void {
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
