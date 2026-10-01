import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
} from 'three';
import type { PlayerState } from '../sim/types';
import { lerpAngle, lerpVec3 } from './interpolate';

const ARMS_UP = new Set<PlayerState['action']>(['jump', 'block', 'shoot', 'layup', 'dunk']);
const ARMS_FORWARD = new Set<PlayerState['action']>(['pass', 'steal', 'shove']);

/** Mixes a 0xRRGGBB colour toward white by `amount` (0 = unchanged, 1 = white). */
export function brighten(color: number, amount: number): number {
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount);
  const r = mix((color >> 16) & 0xff);
  const g = mix((color >> 8) & 0xff);
  const b = mix(color & 0xff);
  return (r << 16) | (g << 8) | b;
}

/** Scale of the highlight ring in [1, 1.1], driven by the simulation tick (period about 1 s). */
export function highlightPulse(tick: number): number {
  return 1 + 0.05 * (1 + Math.sin(tick / 10));
}

export interface PlayerViewOptions {
  /** Draw a pulsing ring under the feet (used for the human's player). */
  highlighted?: boolean;
}

/**
 * Placeholder player (spec §5.5): capsule body, box head, and a cone on the front so the facing
 * direction is visible. Position and facing are interpolated between two simulation states.
 */
export class PlayerView {
  readonly group = new Group();
  private readonly arms: Group;
  /** Body, head, nose and arms, pivoted at the feet so the stun tilt lays the whole figure down. */
  private readonly figure = new Group();
  private readonly ring: Mesh | null;
  private tilt = 0;

  constructor(color: number, options: PlayerViewOptions = {}) {
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

    this.ring = null;
    if (options.highlighted) {
      const ring = new Mesh(
        new RingGeometry(0.35, 0.45, 32),
        new MeshBasicMaterial({
          color: brighten(color, 0.4),
          transparent: true,
          opacity: 0.85,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      // Child of the group, not the figure, so the stun tilt does not move it.
      this.group.add(ring);
      this.ring = ring;
    }
  }

  update(prev: PlayerState, next: PlayerState, alpha: number, tick = 0): void {
    const p = lerpVec3(prev.pos, next.pos, alpha);
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.y = lerpAngle(prev.facing, next.facing, alpha);
    if (this.ring) {
      // Stay on the floor while the player jumps.
      this.ring.position.y = -p.y + 0.01;
      this.ring.scale.setScalar(highlightPulse(tick));
    }
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
    // Lying down, the body's half-thickness would sink into the floor: lift it by about the radius.
    this.figure.position.y = this.tilt * 0.35;
  }
}
