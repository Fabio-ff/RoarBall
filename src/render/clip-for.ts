import type { PlayerAction } from '../sim/types';

/** The seven clips every model ships (spec F.5). Same list as scripts/asset-pipeline/manifest.ts. */
export const CANONICAL_CLIPS = ['idle', 'run', 'dribble', 'jump', 'shoot', 'hit', 'fall'] as const;
export type CanonicalClip = (typeof CANONICAL_CLIPS)[number];

/** Clips that repeat; every other clip plays once and holds its last frame (spec F.7.5). */
export const LOOPING_CLIPS: ReadonlySet<CanonicalClip> = new Set<CanonicalClip>([
  'idle',
  'run',
  'dribble',
]);

/** Horizontal speed above which a player counts as moving (spec F.7.3), m/s. */
export const MOVING_SPEED = 0.5;

/** Spec F.7.3: which canonical clip shows `action`. */
export function clipFor(action: PlayerAction, moving: boolean, hasBall: boolean): CanonicalClip {
  switch (action) {
    case 'idle':
    case 'run':
      if (moving) return 'run';
      return hasBall ? 'dribble' : 'idle';
    case 'jump':
    case 'block':
      return 'jump';
    case 'shoot':
    case 'layup':
    case 'dunk':
    case 'pass':
      return 'shoot';
    case 'steal':
    case 'shove':
      return 'hit';
    case 'stunned':
      return 'fall';
    case 'getup':
      return 'idle';
  }
}

/** Spec F.7.4: the wanted clip, else idle, else null (bind pose). Never throws. */
export function resolveClip(
  wanted: CanonicalClip,
  available: ReadonlySet<string>,
): CanonicalClip | null {
  if (available.has(wanted)) return wanted;
  return available.has('idle') ? 'idle' : null;
}

/** Playback speed of the run clip: horizontal speed over the player's run speed, kept in a sane band. */
export function runTimeScale(speed: number, runSpeed: number): number {
  if (!(runSpeed > 0)) return 1;
  return Math.min(2, Math.max(0.4, speed / runSpeed));
}
