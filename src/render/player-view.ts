import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { PlayerState } from '../sim/types';
import { lerpAngle, lerpVec3 } from './interpolate';

/**
 * Placeholder player (spec §5.5): capsule body, box head, and a cone on the front so the facing
 * direction is visible. Position and facing are interpolated between two simulation states.
 */
export class PlayerView {
  readonly group = new Group();

  constructor(color: number) {
    const body = new Mesh(
      new CapsuleGeometry(0.35, 1.0, 4, 12),
      new MeshStandardMaterial({ color }),
    );
    body.position.y = 0.85;
    body.castShadow = true;

    const head = new Mesh(
      new BoxGeometry(0.3, 0.3, 0.3),
      new MeshStandardMaterial({ color: 0xf1c27d }),
    );
    head.position.y = 1.75;
    head.castShadow = true;

    // ConeGeometry points +Y; rotate so it points +Z, which is the facing direction at yaw 0.
    const nose = new Mesh(
      new ConeGeometry(0.12, 0.3, 8),
      new MeshStandardMaterial({ color: 0xffffff }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.2, 0.45);

    this.group.add(body, head, nose);
  }

  update(prev: PlayerState, next: PlayerState, alpha: number): void {
    const p = lerpVec3(prev.pos, next.pos, alpha);
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.y = lerpAngle(prev.facing, next.facing, alpha);
  }
}
