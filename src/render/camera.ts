import type { PerspectiveCamera } from 'three';
import type { Vec3 } from '../sim/math';

export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
}

const HEIGHT = 12;
const DISTANCE = 20;
/** How much of the target's X the camera follows (1 = rigidly, 0 = fixed at centre court). */
const FOLLOW = 0.5;

/**
 * Broadcast-style side camera (spec §9 "Camera"): on the +Z sideline, elevated, fixed
 * orientation, looking towards −Z (Three.js' default orientation, so screen right is +X).
 * In portrait the distance and height grow with 1/aspect so the court fits.
 */
export function computeCameraPose(target: Vec3, aspect: number): CameraPose {
  const portraitFactor = Math.max(1, 1 / Math.max(aspect, 0.1));
  const x = target.x * FOLLOW;
  return {
    position: { x, y: HEIGHT * portraitFactor, z: DISTANCE * portraitFactor },
    lookAt: { x, y: 1, z: 0 },
  };
}

const SHAKE_METRES = 0.25;
const SHAKE_DECAY = 8;

/** Bounded camera offset at time `time` seconds for a shake `strength` in [0, 1] (plan decision 25). */
export function shakeOffset(
  time: number,
  strength: number,
  out: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  out.x = strength * SHAKE_METRES * (0.6 * Math.sin(37 * time) + 0.4 * Math.sin(53 * time + 1));
  out.y = strength * SHAKE_METRES * (0.6 * Math.sin(41 * time + 2) + 0.4 * Math.sin(61 * time));
  out.z = 0;
  return out;
}

export class BroadcastCamera {
  /** Yaw 0 = camera on the +Z sideline; InputManager.stickToCourt maps stick space accordingly. */
  readonly yaw = 0;
  private position: Vec3 | null = null;
  /** Reduce motion (settings): shake requests are ignored. */
  reduceMotion = false;
  private shakeStrength = 0;
  private time = 0;
  private readonly offset: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly camera: PerspectiveCamera) {}

  /** Match restart: stop any shake in progress. */
  resetShake(): void {
    this.shakeStrength = 0;
  }

  shake(strength: number): void {
    if (!this.reduceMotion) this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  update(target: Vec3, dtSeconds: number): void {
    const pose = computeCameraPose(target, this.camera.aspect);
    if (!this.position) {
      this.position = { ...pose.position };
    } else {
      const k = 1 - Math.exp(-dtSeconds * 4);
      this.position.x += (pose.position.x - this.position.x) * k;
      this.position.y += (pose.position.y - this.position.y) * k;
      this.position.z += (pose.position.z - this.position.z) * k;
    }
    this.time += dtSeconds;
    if (this.reduceMotion) this.shakeStrength = 0;
    this.shakeStrength *= Math.exp(-SHAKE_DECAY * dtSeconds);
    if (this.shakeStrength < 0.001) this.shakeStrength = 0;
    const o = shakeOffset(this.time, this.shakeStrength, this.offset);
    // The offset is applied to the camera only, never to the smoothed position, so it cannot drift.
    this.camera.position.set(this.position.x + o.x, this.position.y + o.y, this.position.z);
    this.camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  }
}
