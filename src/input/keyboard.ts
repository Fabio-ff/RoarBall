import { v2Normalize } from '../sim/math';
import type { PlayerIntent } from '../sim/types';
import type { InputBackend } from './types';

export interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  action: string[];
  pass: string[];
  special: string[];
  turbo: string[];
}

/** Spec §8: WASD/arrows, Space action, E pass, Q special, Shift turbo. Uses KeyboardEvent.code. */
export const DEFAULT_KEY_MAP: KeyMap = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  action: ['Space'],
  pass: ['KeyE'],
  special: ['KeyQ'],
  turbo: ['ShiftLeft', 'ShiftRight'],
};

export class KeyboardBackend implements InputBackend {
  readonly kind = 'keyboard' as const;
  private readonly down = new Set<string>();
  private readonly latched = new Set<string>();
  private readonly mapped: Set<string>;

  constructor(
    private readonly target: Window = window,
    private readonly map: KeyMap = DEFAULT_KEY_MAP,
  ) {
    this.mapped = new Set(Object.values(map).flat());
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  sample(): PlayerIntent {
    const x = (this.any(this.map.right) ? 1 : 0) - (this.any(this.map.left) ? 1 : 0);
    const y = (this.any(this.map.up) ? 1 : 0) - (this.any(this.map.down) ? 1 : 0);
    const intent = {
      move: v2Normalize({ x, y }),
      action: this.any(this.map.action),
      pass: this.any(this.map.pass),
      special: this.any(this.map.special),
      turbo: this.any(this.map.turbo),
    };
    this.latched.clear();
    return intent;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.down.clear();
    this.latched.clear();
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c) || this.latched.has(c));
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.mapped.has(e.code)) return;
    e.preventDefault();
    this.down.add(e.code);
    this.latched.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
    this.latched.clear();
  };
}
