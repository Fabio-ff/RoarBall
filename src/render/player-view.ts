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

const ARMS_UP = new Set<PlayerState['action']>(['jump', 'block', 'shoot', 'layup', 'dunk']);
const ARMS_FORWARD = new Set<PlayerState['action']>(['pass', 'steal', 'shove']);

/**
 * Placeholder player (spec §5.5): capsule body, box head, and a cone on the front so the facing
 * direction is visible. Position and facing are interpolated between two simulation states.
 */
export class PlayerView {
  readonly group = new Group();
  private readonly arms: Group;
  /** Body, head, nose and arms, pivoted at the feet so the stun tilt lays the whole figure down. */
  private readonly figure = new Group();
  private tilt = 0;

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

    this.arms = new Group();
    this.arms.position.y = 1.45;
    for (const side of [-1, 1]) {
      const arm = new Mesh(new BoxGeometry(0.12, 0.6, 0.12), new MeshStandardMaterial({ color }));
      arm.position.set(side * 0.42, -0.3, 0);
      arm.castShadow = true;
      this.arms.add(arm);
    }

    this.figure.add(body, head, nose, this.arms);
    this.group.add(this.figure);
  }

  update(prev: PlayerState, next: PlayerState, alpha: number): void {
    const p = lerpVec3(prev.pos, next.pos, alpha);
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.y = lerpAngle(prev.facing, next.facing, alpha);
    // Negative x rotation swings the arms forward (+Z) and up.
    const target = ARMS_UP.has(next.action)
      ? -Math.PI
      : ARMS_FORWARD.has(next.action)
        ? -Math.PI / 2
        : 0;
    this.arms.rotation.x += (target - this.arms.rotation.x) * 0.25;
    const tiltTarget = next.action === 'stunned' ? 1 : next.action === 'getup' ? 0.5 : 0;
    this.tilt += (tiltTarget - this.tilt) * 0.25;
    this.figure.rotation.x = -this.tilt * (Math.PI / 2);
    this.figure.position.z = this.tilt * 0.9;
  }
}
