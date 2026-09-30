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
  const portraitFactor = Math.max(1, 1 / aspect);
  const x = target.x * FOLLOW;
  return {
    position: { x, y: HEIGHT * portraitFactor, z: DISTANCE * portraitFactor },
    lookAt: { x, y: 1, z: 0 },
  };
}

export class BroadcastCamera {
  /** Yaw 0 = camera on the +Z sideline; InputManager.stickToCourt maps stick space accordingly. */
  readonly yaw = 0;
  private position: Vec3 | null = null;

  constructor(private readonly camera: PerspectiveCamera) {}

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
    this.camera.position.set(this.position.x, this.position.y, this.position.z);
    this.camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  }
}
