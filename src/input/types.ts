import type { PlayerIntent } from '../sim/types';

export type BackendKind = 'keyboard' | 'gamepad' | 'touch';

/** A device that can be sampled once per simulation tick. `move` is in stick space here. */
export interface InputBackend {
  readonly kind: BackendKind;
  sample(): PlayerIntent;
  dispose(): void;
}
