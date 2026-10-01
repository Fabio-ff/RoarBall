import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { BALL_RADIUS } from '../sim/constants';
import type { BallState } from '../sim/types';
import { lerpVec3 } from './interpolate';

/** Dribble phase speed in radians per tick; |sin| period is π/0.11 ≈ 28.6 ticks ≈ 2.1 bounces per second. */
const DRIBBLE_RATE = 0.11;

/** Height of a dribbled ball at animation time `t` (ticks): from the hand down to the floor and back. */
export function dribbleHeight(handY: number, t: number): number {
  const phase = Math.abs(Math.sin(t * DRIBBLE_RATE));
  return BALL_RADIUS + (handY - BALL_RADIUS) * phase;
}

/** Orange sphere with two seams; spins with its velocity and bobs while the holder runs. */
export class BallView {
  readonly group = new Group();
  private spinX = 0;
  private spinZ = 0;

  constructor() {
    const ball = new Mesh(
      new SphereGeometry(BALL_RADIUS, 24, 16),
      new MeshStandardMaterial({ color: 0xe8772e }),
    );
    ball.castShadow = true;
    const seamMaterial = new MeshBasicMaterial({ color: 0x3a2113 });
    const seamA = new Mesh(new TorusGeometry(BALL_RADIUS * 1.002, 0.004, 4, 32), seamMaterial);
    const seamB = new Mesh(new TorusGeometry(BALL_RADIUS * 1.002, 0.004, 4, 32), seamMaterial);
    seamB.rotation.y = Math.PI / 2;
    this.group.add(ball, seamA, seamB);
  }

  update(
    prev: BallState,
    next: BallState,
    alpha: number,
    dtSeconds: number,
    dribbling: boolean,
    tick: number,
  ): void {
    const p = lerpVec3(prev.pos, next.pos, alpha);
    const y = next.mode === 'held' && dribbling ? dribbleHeight(p.y, tick + alpha) : p.y;
    this.group.position.set(p.x, y, p.z);
    // Roll with the horizontal velocity: angular speed = v / r.
    this.spinX += (next.vel.z / BALL_RADIUS) * dtSeconds;
    this.spinZ -= (next.vel.x / BALL_RADIUS) * dtSeconds;
    this.group.rotation.set(this.spinX, 0, this.spinZ);
  }
}
