import { stepBall, tryPickup } from './ball';
import { buttonsOf, justPressed } from './buttons';
import { TICK_DT, TICK_MS } from './constants';
import { allPlayers } from './match';
import { isActionLocked, startJump, stepPlayer, stepTurbo } from './player-movement';
import { detectBasket, startShot, stepFlight, stepShotAction } from './shooting';
import { NO_INTENT } from './types';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, PlayerState, SimEvent } from './types';

export interface TickResult {
  state: MatchState;
  events: SimEvent[];
}

/**
 * Advances the match by one fixed step (spec §4.2). Pure: returns a new state and never
 * mutates `state`. Pipeline order is part of the game's definition — keep it stable:
 *   1. court modifier      (phase 5)
 *   2. abilities           (phase 5)
 *   3. resolve intents → actions
 *   4. move players
 *   5. move ball           (task 2/3)
 *   6. collisions, pickup  (task 2)
 *   7. rules               (task 4)
 *   8. scoring / phases    (task 3/4)
 *   9. timers
 *  10. events
 */
export function tick(
  state: MatchState,
  intents: ReadonlyMap<PlayerId, PlayerIntent>,
  court: CourtDef,
): TickResult {
  if (state.phase === 'paused' || state.phase === 'finished') {
    return { state, events: [] };
  }

  const next = structuredClone(state);
  const events: SimEvent[] = [];
  next.tick += 1;
  next.phaseTicks += 1;
  const players = allPlayers(next);
  const intentFor = (player: PlayerState): PlayerIntent => intents.get(player.id) ?? NO_INTENT;

  // 3. resolve intents → actions
  for (const player of players) resolveAction(next, player, intentFor(player), court, events);

  // 4. move players
  for (const player of players) stepPlayer(player, intentFor(player), court, TICK_DT);

  // 5. move ball (held follows the holder; flights follow their arc; free balls fly and bounce)
  const prevBallPos = { ...next.ball.pos };
  if (next.ball.mode === 'flight') stepFlight(next.ball, court);
  else stepBall(next, court, events);

  // 6. collisions with players: loose-ball pickup
  tryPickup(next, events);

  // 8. scoring (phase transitions arrive in task 4)
  const basket = detectBasket(next, court, prevBallPos);
  if (basket) {
    next.score[basket.team] += basket.points;
    next.ball.lastShot = null;
    events.push({
      type: 'basket',
      playerId: basket.shooter,
      team: basket.team,
      points: basket.points,
      shotType: basket.shotType,
    });
  }

  // 9. timers
  if (next.phase === 'live') {
    next.clockMs = Math.max(0, next.clockMs - TICK_MS);
    if (next.clockMs === 0) {
      events.push({ type: 'phaseChange', from: 'live', to: 'finished' });
      next.phase = 'finished';
      next.phaseTicks = 0;
    }
  }
  for (const player of players) {
    stepTurbo(player);
    if (player.shotCooldownTicks > 0) player.shotCooldownTicks -= 1;
    player.prevButtons = buttonsOf(intentFor(player));
  }

  return { state: next, events };
}

function resolveAction(
  state: MatchState,
  player: PlayerState,
  intent: PlayerIntent,
  court: CourtDef,
  events: SimEvent[],
): void {
  if (isActionLocked(player)) {
    stepShotAction(state, player, court, events);
    return;
  }
  const hasBall = state.ball.holder === player.id;
  if (!player.onGround || !justPressed(player.prevButtons, intent, 'action')) return;
  if (hasBall && state.phase === 'live') startShot(state, player, court);
  else if (!hasBall) startJump(player, player.stats.jumpSpeed);
}
