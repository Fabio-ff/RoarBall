import { justPressed } from './buttons';
import type { AbilityTable, HookContext } from './hooks';
import { allPlayers, findPlayer } from './match';
import { isActionLocked } from './player-movement';
import type {
  CourtDef,
  MatchState,
  PlayerId,
  PlayerIntent,
  PlayerState,
  ResolvedStats,
  SimEvent,
} from './types';

/** Spec D.2: a full bar. */
export const CHARGE_MAX = 100;
/**
 * Spec D.2 charge gains (ratios 12 : 18 : 10 : 15 : 15), all scaled by CHARGE_PACE. At the spec
 * values the AI balance report gave 0.86 uses per player per match; the target is 1.5-3.
 */
export const CHARGE_PACE = 2;
export const CHARGE_GAIN = Object.freeze({
  basket2: 12 * CHARGE_PACE,
  basket3: 18 * CHARGE_PACE,
  assist: 10 * CHARGE_PACE,
  steal: 15 * CHARGE_PACE,
  block: 15 * CHARGE_PACE,
});
/** A basket within this many ticks of catching a teammate's pass is an assist. */
export const ASSIST_WINDOW_TICKS = 180;

/** Pipeline step 1: every player's stats from base, through the court modifier (spec D.2). */
export function rebuildStats(state: MatchState, court: CourtDef): void {
  for (const player of allPlayers(state)) rebuildPlayerStats(state, player, court);
}

/** One player's stats from base through the court modifier (what step 1 does for everyone). */
export function rebuildPlayerStats(state: MatchState, player: PlayerState, court: CourtDef): void {
  const base: ResolvedStats = { ...player.baseStats };
  player.stats = court.modifier?.modifyStats ? court.modifier.modifyStats(base, state) : base;
}

/** Pipeline step 2: the active ability's onTick, then its modifyStats. */
export function stepActiveAbility(
  state: MatchState,
  player: PlayerState,
  abilities: AbilityTable,
  ctx: HookContext,
): void {
  if (player.ability === null || player.abilityId === null) return;
  const def = abilities[player.abilityId];
  if (!def) return;
  def.effect.onTick?.(state, player, ctx);
  if (def.effect.modifyStats) player.stats = def.effect.modifyStats(player.stats);
}

/** Spec D.2 gating: own ability known, none active, full bar, live play, on the ground, not locked. */
export function canActivateAbility(
  state: MatchState,
  player: PlayerState,
  abilities: AbilityTable,
): boolean {
  if (player.abilityId === null || player.ability !== null || player.charge < CHARGE_MAX)
    return false;
  if (!abilities[player.abilityId]) return false;
  return state.phase === 'live' && player.onGround && !isActionLocked(player);
}

/**
 * Pipeline step 3: a SPECIAL press activates the ability. Its modifyStats applies at once, so a
 * timed ability affects exactly `durationTicks` ticks counting this one. True when it activated.
 */
export function tryActivateAbility(
  state: MatchState,
  player: PlayerState,
  intent: PlayerIntent,
  abilities: AbilityTable,
  ctx: HookContext,
): boolean {
  if (!justPressed(player.prevButtons, intent, 'special')) return false;
  if (!canActivateAbility(state, player, abilities) || player.abilityId === null) return false;
  const def = abilities[player.abilityId];
  if (!def) return false;
  player.charge = 0;
  player.ability = {
    ticksLeft: typeof def.durationTicks === 'number' ? def.durationTicks : null,
    uses: 0,
  };
  ctx.emit({ type: 'abilityActivated', playerId: player.id, abilityId: def.id });
  def.effect.onActivate(state, player, ctx);
  if (def.effect.modifyStats) player.stats = def.effect.modifyStats(player.stats);
  return true;
}

/**
 * Pipeline step 9: a timer counts down and ends the ability at 0; an untimed one (Hot Hand,
 * instant) ends once its uses are 0.
 */
export function stepAbilityTimer(
  state: MatchState,
  player: PlayerState,
  abilities: AbilityTable,
  ctx: HookContext,
  court: CourtDef,
): void {
  const active = player.ability;
  if (active === null) return;
  if (active.ticksLeft !== null) {
    active.ticksLeft -= 1;
    if (active.ticksLeft > 0) return;
  } else if (active.uses > 0) {
    return;
  }
  const abilityId = player.abilityId ?? '';
  player.ability = null;
  abilities[abilityId]?.effect.onEnd?.(state, player, ctx);
  rebuildPlayerStats(state, player, court); // the ability's stats must not outlive it
  ctx.emit({ type: 'abilityEnded', playerId: player.id, abilityId });
}

/**
 * Pipeline step 9: charge from this tick's events (spec D.2). `passer` is the thrower of the pass
 * that was in the air this tick, so a `catch` records the receiver's assist window. Nothing is
 * gained while one's own ability is active; the bar caps at CHARGE_MAX.
 */
export function applyChargeGains(
  state: MatchState,
  events: readonly SimEvent[],
  passer: PlayerId | null,
): void {
  const add = (id: PlayerId, amount: number): void => {
    const p = findPlayer(state, id);
    if (!p || p.ability !== null) return;
    p.charge = Math.min(CHARGE_MAX, p.charge + amount);
  };
  for (const event of events) {
    switch (event.type) {
      case 'catch': {
        const receiver = findPlayer(state, event.playerId);
        const from = passer === null ? undefined : findPlayer(state, passer);
        if (receiver && from && from.team === receiver.team && from.id !== receiver.id)
          receiver.lastCatch = { from: from.id, tick: state.tick };
        break;
      }
      case 'basket': {
        add(event.playerId, event.points === 3 ? CHARGE_GAIN.basket3 : CHARGE_GAIN.basket2);
        const scorer = findPlayer(state, event.playerId);
        const last = scorer?.lastCatch;
        if (scorer && last && state.tick - last.tick <= ASSIST_WINDOW_TICKS)
          add(last.from, CHARGE_GAIN.assist);
        // A basket by anyone closes every assist window.
        for (const p of [...state.teams[0].players, ...state.teams[1].players]) p.lastCatch = null;
        break;
      }
      case 'possessionChange':
        // The team that lost the ball loses its pending assists.
        for (const p of state.teams[event.team === 0 ? 1 : 0].players) p.lastCatch = null;
        break;
      case 'steal':
        add(event.by, CHARGE_GAIN.steal);
        break;
      case 'block':
        add(event.by, CHARGE_GAIN.block);
        break;
      default:
        break;
    }
  }
}
