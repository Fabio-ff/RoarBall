import { stepShotAction } from './shooting';
import { SHOT_ACTIONS } from './types';
import type { CourtDef, MatchState, PlayerState, SimEvent } from './types';

/** Durations and hit ticks of the non-shot actions (spec B.3, B.4). */
export const ACTION_TIMING = {
  pass: { totalTicks: 12, releaseTick: 4 },
  steal: { totalTicks: 18, hitTick: 6, cooldown: 45 },
  shove: { totalTicks: 20, hitTick: 5, cooldown: 60 },
  block: { cooldown: 30, minTicks: 8 },
  getup: { totalTicks: 20 },
} as const;

export const STUN_MIN_TICKS = 20;
/** Spec B.4: after getting up a player cannot be shoved again for this long (no stun-lock). */
export const SHOVE_IMMUNITY_TICKS = 30;

/** Knocks a player down: input ignored, any shot cancelled, horizontal motion decays. */
export function applyStun(player: PlayerState, ticks: number): void {
  player.action = 'stunned';
  player.actionTicks = 0;
  player.stunTicks = Math.max(STUN_MIN_TICKS, Math.round(ticks));
  player.shot = null;
  player.targetId = null;
}

/** Puts a player into a locked action from its first tick. */
export function beginAction(player: PlayerState, action: PlayerState['action']): void {
  player.action = action;
  player.actionTicks = 0;
}

export function endAction(player: PlayerState): void {
  player.action = 'idle';
  player.actionTicks = 0;
  player.targetId = null;
}

/**
 * Per-tick bookkeeping of locked actions (step 3 of the pipeline). Shots live in shooting.ts;
 * passes and defensive moves plug in here (tasks 3 and 4).
 */
export function stepLockedAction(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
  events: SimEvent[],
): void {
  if (SHOT_ACTIONS.has(player.action)) {
    stepShotAction(state, player, court, events);
    return;
  }
  switch (player.action) {
    case 'stunned':
      if (player.actionTicks >= player.stunTicks) beginAction(player, 'getup');
      return;
    case 'getup':
      if (player.actionTicks >= ACTION_TIMING.getup.totalTicks) {
        endAction(player);
        player.shoveImmunityTicks = SHOVE_IMMUNITY_TICKS;
      }
      return;
    case 'block':
      if (player.onGround && player.actionTicks >= ACTION_TIMING.block.minTicks) endAction(player);
      return;
    default:
      // 'pass', 'steal', 'shove' are stepped by passing.ts / defence.ts (tasks 3–4).
      return;
  }
}
