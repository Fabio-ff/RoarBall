import { TICK_RATE } from '../sim/constants';
import { PASS_TIMING } from '../sim/passing';
import { SHOT_TIMING } from '../sim/shooting';
import type { PlayerAction, ShotType } from '../sim/types';

const SHOT_TYPE: Partial<Record<PlayerAction, ShotType>> = {
  shoot: 'jumpshot',
  layup: 'layup',
  dunk: 'dunk',
};

/**
 * Spec F.5.3: playback speed of the `shoot` clip so the ball leaves the hands (`releaseAt`
 * seconds into the clip) on the sim's release tick. 1 for any action that is not a shot.
 */
export function shotTimeScale(action: PlayerAction, releaseAt: number): number {
  const type = SHOT_TYPE[action];
  if (!type || !(releaseAt > 0)) return 1;
  return releaseAt / (SHOT_TIMING[type].releaseTick / TICK_RATE);
}

/** Spec F.5.3: a pass releases after 4 ticks, so the clip starts that long before its release. */
export function passStartTime(releaseAt: number): number {
  return Math.max(0, releaseAt - PASS_TIMING.releaseTick / TICK_RATE);
}

/**
 * Where in the `shoot` clip the view should be `actionTicks` ticks into `action`. Reading the sim's
 * tick count (not the time since the view noticed the action) keeps an alley-oop, which enters
 * `dunk` a tick before its release, in sync too.
 */
export function shootClipTime(
  action: PlayerAction,
  actionTicks: number,
  releaseAt: number,
): number {
  const elapsed = Math.max(0, actionTicks) / TICK_RATE;
  if (action === 'pass') return passStartTime(releaseAt) + elapsed;
  return elapsed * shotTimeScale(action, releaseAt);
}
