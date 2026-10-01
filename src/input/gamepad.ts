import { v2Normalize } from '../sim/math';
import type { PlayerId, PlayerIntent, SimEvent, TeamIndex } from '../sim/types';
import type { InputBackend } from './types';

export type PadSource = () => readonly (Gamepad | null)[];

export const defaultPadSource: PadSource = () =>
  typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
    ? navigator.getGamepads()
    : [];

/** Spec E.3: radial dead zone, rescaled so the stick still reaches every speed. */
export const DEAD_ZONE = 0.2;

export function applyDeadZone(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= DEAD_ZONE) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - DEAD_ZONE) / (1 - DEAD_ZONE));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

const B = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  rt: 7,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

function held(pad: Gamepad, i: number): boolean {
  const b = pad.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
}

/** Spec E.3 standard mapping → an intent in stick space (y up) plus Start. */
export function readPad(pad: Gamepad): PlayerIntent & { start: boolean } {
  const dx = (held(pad, B.right) ? 1 : 0) - (held(pad, B.left) ? 1 : 0);
  const dy = (held(pad, B.up) ? 1 : 0) - (held(pad, B.down) ? 1 : 0);
  const move =
    dx !== 0 || dy !== 0
      ? v2Normalize({ x: dx, y: dy })
      : applyDeadZone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
  return {
    move,
    action: held(pad, B.a),
    pass: held(pad, B.x),
    special: held(pad, B.y),
    turbo: held(pad, B.rt) || held(pad, B.b),
    start: held(pad, B.start),
  };
}

function isActive(i: PlayerIntent & { start: boolean }): boolean {
  return i.move.x !== 0 || i.move.y !== 0 || i.action || i.pass || i.special || i.turbo || i.start;
}

const NEUTRAL = (): PlayerIntent => ({
  move: { x: 0, y: 0 },
  action: false,
  pass: false,
  special: false,
  turbo: false,
});

/**
 * Spec §8 / E.3 gamepad backend, polled once per tick. Hot-plug: the pad with input most
 * recently drives the human (plan decision 16). Polling at 60 Hz sees every press a player
 * can make, so no latching beyond the poll is needed.
 */
export class GamepadBackend implements InputBackend {
  readonly kind = 'gamepad' as const;
  private activeIndex: number | null = null;
  private lastPads: readonly (Gamepad | null)[] = [];

  constructor(private readonly getPads: PadSource = defaultPadSource) {}

  sample(): PlayerIntent {
    try {
      this.lastPads = this.getPads();
    } catch {
      this.lastPads = [];
    }
    for (const pad of this.lastPads) {
      if (pad && pad.index !== this.activeIndex && isActive(readPad(pad)))
        this.activeIndex = pad.index;
    }
    const active = this.activePad();
    if (!active) {
      this.activeIndex = null;
      return NEUTRAL();
    }
    const { move, action, pass, special, turbo } = readPad(active);
    return { move, action, pass, special, turbo };
  }

  activePad(): Gamepad | null {
    return this.lastPads.find((p) => p?.index === this.activeIndex) ?? null;
  }

  dispose(): void {
    this.lastPads = [];
    this.activeIndex = null;
  }
}

export interface Rumble {
  ms: number;
  strong: number;
  weak: number;
}

/** Plan decision 17. */
export function rumbleFor(event: SimEvent, humanId: PlayerId, humanTeam: TeamIndex): Rumble | null {
  switch (event.type) {
    case 'basket':
      return event.shotType === 'dunk' && event.team === humanTeam
        ? { ms: 200, strong: 0.6, weak: 0.3 }
        : null;
    case 'block':
      return event.shooter === humanId ? { ms: 150, strong: 0.4, weak: 0.6 } : null;
    case 'knockdown':
      return event.target === humanId ? { ms: 300, strong: 1, weak: 0.5 } : null;
    case 'abilityActivated':
      return event.playerId === humanId && event.abilityId === 'earthquake'
        ? { ms: 400, strong: 1, weak: 1 }
        : null;
    default:
      return null;
  }
}

/** Narrow local type: the DOM lib's GamepadHapticActuator typing varies by TS version. */
interface Actuator {
  playEffect(
    type: 'dual-rumble',
    params: {
      duration: number;
      strongMagnitude: number;
      weakMagnitude: number;
      startDelay: number;
    },
  ): Promise<unknown>;
}

export function playRumble(pad: Gamepad | null, rumble: Rumble): void {
  try {
    const actuator = pad?.vibrationActuator as Actuator | null | undefined;
    void actuator
      ?.playEffect('dual-rumble', {
        duration: rumble.ms,
        strongMagnitude: rumble.strong,
        weakMagnitude: rumble.weak,
        startDelay: 0,
      })
      ?.catch(() => undefined);
  } catch {
    // Unsupported actuator: no rumble.
  }
}
