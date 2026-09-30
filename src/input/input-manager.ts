import { v2Length, type Vec2 } from '../sim/math';
import { NO_INTENT, type PlayerIntent } from '../sim/types';
import type { BackendKind, InputBackend } from './types';

export function isNeutral(intent: PlayerIntent): boolean {
  return (
    v2Length(intent.move) === 0 &&
    !intent.action &&
    !intent.pass &&
    !intent.special &&
    !intent.turbo
  );
}

/** Buttons are ORed; the first non-zero move wins. */
export function mergeIntents(a: PlayerIntent, b: PlayerIntent): PlayerIntent {
  return {
    move: v2Length(a.move) > 0 ? a.move : b.move,
    action: a.action || b.action,
    pass: a.pass || b.pass,
    special: a.special || b.special,
    turbo: a.turbo || b.turbo,
  };
}

/**
 * Converts a stick-space move (x right, y up) into court space (x → X, y → Z) for a camera
 * rotated `yaw` radians about Y. Yaw 0 is the broadcast camera on the +Z sideline looking
 * towards −Z (Three.js' default orientation): stick right = +X, stick up = away = −Z.
 * The XZ plane seen from above is a mirror image of stick space, so this is a reflection
 * of y followed by a rotation — a rotation alone would swap left and right.
 */
export function stickToCourt(move: Vec2, yaw: number): Vec2 {
  const x = move.x;
  const z = -move.y;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, y: -x * s + z * c };
}

/**
 * Merges all backends into one PlayerIntent per tick, converts the stick-space move into
 * court space using the camera yaw (spec §8 "Camera-relative movement") and remembers which
 * kind of device was used last so the UI can show or hide touch controls.
 */
export class InputManager {
  /** Rotation of the camera about Y; 0 = broadcast camera on the +Z sideline (see stickToCourt). */
  cameraYaw = 0;
  onActiveKindChange: ((kind: BackendKind) => void) | null = null;
  private active: BackendKind | null = null;

  constructor(private readonly backends: readonly InputBackend[]) {}

  get activeKind(): BackendKind | null {
    return this.active;
  }

  sample(): PlayerIntent {
    let merged: PlayerIntent = { ...NO_INTENT, move: { x: 0, y: 0 } };
    for (const backend of this.backends) {
      const intent = backend.sample();
      if (isNeutral(intent)) continue;
      if (this.active !== backend.kind) {
        this.active = backend.kind;
        this.onActiveKindChange?.(backend.kind);
      }
      merged = mergeIntents(merged, intent);
    }
    merged.move = stickToCourt(merged.move, this.cameraYaw);
    return merged;
  }

  dispose(): void {
    for (const backend of this.backends) backend.dispose();
  }
}
