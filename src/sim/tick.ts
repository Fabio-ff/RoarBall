import { stepBall, tryPickup } from './ball';
import { buttonsOf, justPressed } from './buttons';
import { TICK_DT } from './constants';
import { allPlayers } from './match';
import { receivingTeam, setPhase, stepClocks, stepPhases } from './phases';
import { isActionLocked, startJump, stepPlayer, stepTurbo } from './player-movement';
import { applyRules } from './rules';
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
 *   5. move ball
 *   6. collisions, pickup
 *   7. rules
 *   8. scoring / phases
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

  // 5. move ball
  const prevBallPos = { ...next.ball.pos };
  if (next.ball.mode === 'flight') stepFlight(next.ball, court);
  else stepBall(next, court, events);

  // 6. collisions with players: loose-ball pickup
  tryPickup(next, events);

  // 7. rules
  for (const violation of applyRules(next)) {
    if (violation.ruleId === 'shotClock') {
      events.push({ type: 'shotClockViolation', team: violation.team });
      next.pendingInbound =
        next.settings.mode === 'shootaround' ? violation.team : receivingTeam(next, violation.team);
      setPhase(next, 'inbound', events);
    }
  }

  // 8. scoring / phases
  const basket = detectBasket(next, court, prevBallPos);
  if (basket) next.ball.lastShot = null;
  stepPhases(next, court, events, basket);

  // 9. timers
  stepClocks(
    next,
    events,
    events.some((e) => e.type === 'rimHit'),
  );
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
