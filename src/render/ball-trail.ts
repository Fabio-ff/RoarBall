import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial } from 'three';
import type { BallState } from '../sim/types';

export const TRAIL_POINTS = 24;
const FADE_S = 0.3;
const GLOW_COLOR = 0xff8a00;
const PLAIN_COLOR = 0xffffff;

/** Fading line behind the ball while it is in flight (plan decision 26). Pooled: fixed buffer. */
export class BallTrail {
  readonly line: Line;
  private readonly positions = new Float32Array(TRAIL_POINTS * 3);
  private readonly material = new LineBasicMaterial({ color: PLAIN_COLOR, transparent: true });
  private filled = 0;
  private fade = 0;
  private wasFlying = false;

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setDrawRange(0, 0);
    this.line = new Line(geometry, this.material);
    this.line.name = 'ball-trail';
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  reset(): void {
    this.filled = 0;
    this.fade = 0;
    this.wasFlying = false;
    this.line.visible = false;
    this.line.geometry.setDrawRange(0, 0);
  }

  get visible(): boolean {
    return this.line.visible;
  }

  get color(): number {
    return this.material.color.getHex();
  }

  /** `ball` is the interpolated ball; `glow` is decided by the caller (Hot Hand / Rocket Dunk). */
  update(ball: BallState, glow: boolean, dt: number): void {
    if (ball.mode === 'flight') {
      if (!this.wasFlying) this.filled = 0;
      this.wasFlying = true;
      this.fade = 0;
      this.material.opacity = 1;
      this.material.color.setHex(glow ? GLOW_COLOR : PLAIN_COLOR);
      this.positions.copyWithin(3, 0, (TRAIL_POINTS - 1) * 3);
      this.positions[0] = ball.pos.x;
      this.positions[1] = ball.pos.y;
      this.positions[2] = ball.pos.z;
      this.filled = Math.min(this.filled + 1, TRAIL_POINTS);
      this.line.geometry.setDrawRange(0, this.filled);
      this.line.geometry.getAttribute('position').needsUpdate = true;
      this.line.visible = true;
      return;
    }
    this.wasFlying = false;
    if (!this.line.visible) return;
    this.fade += dt;
    if (this.fade >= FADE_S) {
      this.line.visible = false;
      this.filled = 0;
      this.line.geometry.setDrawRange(0, 0);
      return;
    }
    this.material.opacity = 1 - this.fade / FADE_S;
  }
}
