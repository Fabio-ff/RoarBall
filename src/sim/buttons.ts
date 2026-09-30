import type { Buttons, PlayerIntent } from './types';

export function buttonsOf(intent: PlayerIntent): Buttons {
  return {
    action: intent.action,
    pass: intent.pass,
    special: intent.special,
    turbo: intent.turbo,
  };
}

/** True on the tick a button goes from released to held (spec §8: edges are detected in the sim). */
export function justPressed(prev: Buttons, intent: PlayerIntent, button: keyof Buttons): boolean {
  return intent[button] && !prev[button];
}
