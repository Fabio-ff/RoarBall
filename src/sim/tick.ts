import {
  applyChargeGains,
  rebuildStats,
  stepAbilityTimer,
  stepActiveAbility,
  tryActivateAbility,
} from './abilities';
import { stepLockedAction } from './actions';
import { stepBall, tryPickup } from './ball';
import { deflectBallOffPlayers, separatePlayers } from './bodies';
import { buttonsOf, justPressed } from './buttons';
import { TICK_DT } from './constants';
import {
  chooseDefensiveAction,
  nearestOpponent,
  startBlock,
  startShove,
  startSteal,
  stepDefenceAction,
} from './defence';
import { createHookContext, NO_ABILITIES, type AbilityTable } from './hooks';
import { allPlayers, findPlayer } from './match';
import { receivingTeam, setPhase, stepClocks, stepPhases } from './phases';
import { isActionLocked, startJump, stepPlayer, stepTurbo } from './player-movement';
import { callForPass, startPass, stepPassAction, stepPassFlight } from './passing';
import { applyRules } from './rules';
import { detectBasket, startShot, stepFlight } from './shooting';
import { NO_INTENT } from './types';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, PlayerState, SimEvent } from './types';

export interface TickResult {
  state: MatchState;
  events: SimEvent[];
}

/**
 * Advances the match by one fixed step (spec §4.2, D.2). Pure: returns a new state and never
 * mutates `state`. Pipeline order is part of the game's definition — keep it stable:
 *   1. court modifier onTick, then every player's stats rebuilt from base
 *   2. active abilities: onTick, modifyStats
 *   3. SPECIAL presses (everyone), then intents → actions
 *   4. move players
 *   5. move ball (held / flight / free, incl. floor, rim and board)
 *   6. bodies: player separation, ball deflection, pickup
 *   7. rules
 *   8. scoring / phases
 *   9. timers, charge gains, ability timers
 *  10. events
 * With `NO_ABILITIES` (the default) nothing activates.
 */
export function tick(
  state: MatchState,
  intents: ReadonlyMap<PlayerId, PlayerIntent>,
  court: CourtDef,
  abilities: AbilityTable = NO_ABILITIES,
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

  const ctx = createHookContext(next, court, events);

  // 1. court modifier, then stats rebuilt from base
  court.modifier?.onTick?.(next, ctx);
  rebuildStats(next, court);

  // 2. active abilities
  for (const player of players) stepActiveAbility(next, player, abilities, ctx);

  // 3. SPECIAL presses for everyone first (an Earthquake locks its victims out this tick), then actions
  for (const player of players) tryActivateAbility(next, player, intentFor(player), abilities, ctx);
  for (const player of players) resolveAction(next, player, intentFor(player), court, events);
  // Any catch this tick comes from the pass in the air now (assists, spec D.2).
  const passer = next.ball.flight?.kind === 'pass' ? next.ball.flight.passer : null;

  // 4. move players
  for (const player of players) stepPlayer(player, intentFor(player), court, TICK_DT);

  // 5. move ball
  const prevBallPos = { ...next.ball.pos };
  if (next.ball.mode === 'flight' && next.ball.flight?.kind === 'pass')
    stepPassFlight(next, court, events);
  else if (next.ball.mode === 'flight') stepFlight(next.ball, court);
  else stepBall(next, court, events);

  // 6. bodies
  separatePlayers(players, court);
  deflectBallOffPlayers(next, events);
  tryPickup(next, events);

  // 7. rules
  for (const violation of applyRules(next)) {
    if (violation.ruleId === 'shotClock') {
      events.push({ type: 'shotClockViolation', team: violation.team });
      next.pendingInbound = receivingTeam(next, violation.team);
      setPhase(next, 'inbound', events);
    }
  }

  // 8. scoring / phases
  const basket = detectBasket(next, court, prevBallPos);
  if (basket) next.ball.lastShot = null;
  stepPhases(next, court, events, basket);

  // 9. timers, charge, abilities
  stepClocks(
    next,
    events,
    events.some((e) => e.type === 'rimHit'),
  );
  applyChargeGains(next, events, passer);
  for (const player of players) {
    stepTurbo(player);
    if (player.shotCooldownTicks > 0) player.shotCooldownTicks -= 1;
    if (player.cooldowns.block > 0) player.cooldowns.block -= 1;
    if (player.cooldowns.steal > 0) player.cooldowns.steal -= 1;
    if (player.cooldowns.shove > 0) player.cooldowns.shove -= 1;
    if (player.shoveImmunityTicks > 0) player.shoveImmunityTicks -= 1;
    if (player.callingForPassTicks > 0) player.callingForPassTicks -= 1;
    stepAbilityTimer(next, player, abilities, ctx, court);
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
    if (player.action === 'pass') stepPassAction(state, player, court, events);
    else if (player.action === 'steal' || player.action === 'shove')
      stepDefenceAction(state, player, events);
    else stepLockedAction(state, player, court, events);
    return;
  }
  const hasBall = state.ball.holder === player.id;
  const live = state.phase === 'live';
  if (justPressed(player.prevButtons, intent, 'pass')) {
    if (hasBall && live && player.onGround) {
      if (startPass(state, player)) return;
    } else if (!hasBall) {
      callForPass(player);
    }
  }
  if (!player.onGround || !justPressed(player.prevButtons, intent, 'action')) return;
  if (hasBall) {
    if (live) startShot(state, player, court);
    return;
  }
  // Defensive moves only during play; a jump is always allowed.
  switch (live ? chooseDefensiveAction(state, player, court) : 'jump') {
    case 'block':
      if (player.cooldowns.block === 0) startBlock(player);
      else startJump(player, player.stats.jumpSpeed);
      return;
    case 'steal': {
      const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
      if (holder && player.cooldowns.steal === 0) startSteal(player, holder);
      return;
    }
    case 'shove': {
      const target = nearestOpponent(state, player);
      if (target && player.cooldowns.shove === 0) startShove(player, target);
      return;
    }
    default:
      startJump(player, player.stats.jumpSpeed);
  }
}
