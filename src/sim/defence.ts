import { ACTION_TIMING, applyStun, beginAction, endAction } from './actions';
import { giveBall, holdPosition } from './ball';
import { hoopGeometry } from './hoop';
import { clamp, v3DistanceXZ, type Vec3 } from './math';
import { allPlayers, findPlayer } from './match';
import { startJump } from './player-movement';
import { nextFloat } from './rng';
import { targetHoopIndex } from './shooting';
import { SHOT_ACTIONS } from './types';
import type { CourtDef, MatchState, PlayerState, SimEvent } from './types';

/** Spec B.4 reach and geometry. */
const BLOCK_NEAR_HOOP = 3;
const SHOVE_REACH = 1.2;
/** cos of the half-angle in front of the shover that counts as "in front". */
const SHOVE_FACING_COS = 0.3;
const SHOVE_TURBO_MULTIPLIER = 1.5;
const AWAY_SPEED = 1;
/** Loose-ball pop after a shove. */
const POP_SPEED = 2;

export type DefensiveChoice = 'block' | 'steal' | 'shove' | 'jump';

export function nearestOpponent(state: MatchState, player: PlayerState): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bestD = Infinity;
  for (const other of allPlayers(state)) {
    if (other.team === player.team) continue;
    const d = v3DistanceXZ(player.pos, other.pos);
    if (d < bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

function inFront(player: PlayerState, target: Vec3): boolean {
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  return (Math.sin(player.facing) * dx + Math.cos(player.facing) * dz) / len > SHOVE_FACING_COS;
}

/** Spec B.4: a player who is down, getting up or just got up cannot be shoved (no stun-lock). */
export function canBeShoved(player: PlayerState): boolean {
  return (
    player.action !== 'stunned' && player.action !== 'getup' && player.shoveImmunityTicks === 0
  );
}

/** Spec B.4: what the action button means for a player without the ball. */
export function chooseDefensiveAction(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
): DefensiveChoice {
  const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
  if (holder && holder.team === player.team) return 'jump';
  const opponent = nearestOpponent(state, player);
  if (!opponent) return 'jump';
  if (holder && holder.id === opponent.id) {
    const hoop = hoopGeometry(court, targetHoopIndex(state, holder, court));
    const shooting = SHOT_ACTIONS.has(holder.action);
    if (shooting || v3DistanceXZ(holder.pos, hoop.rimCenter) <= BLOCK_NEAR_HOOP) return 'block';
    if (v3DistanceXZ(player.pos, holder.pos) <= player.stats.stealReach) return 'steal';
  }
  if (
    v3DistanceXZ(player.pos, opponent.pos) <= SHOVE_REACH &&
    inFront(player, opponent.pos) &&
    canBeShoved(opponent)
  )
    return 'shove';
  return 'jump';
}

export function startBlock(player: PlayerState): void {
  beginAction(player, 'block');
  player.cooldowns.block = ACTION_TIMING.block.cooldown;
  startJump(player, player.stats.jumpSpeed);
}

export function startSteal(player: PlayerState, target: PlayerState): void {
  beginAction(player, 'steal');
  player.targetId = target.id;
  player.cooldowns.steal = ACTION_TIMING.steal.cooldown;
  player.facing = Math.atan2(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
}

export function startShove(player: PlayerState, target: PlayerState): void {
  beginAction(player, 'shove');
  player.targetId = target.id;
  player.cooldowns.shove = ACTION_TIMING.shove.cooldown;
  player.facing = Math.atan2(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
}

/** Per-tick bookkeeping for steals and shoves (blocks end in actions.ts when the blocker lands). */
export function stepDefenceAction(
  state: MatchState,
  player: PlayerState,
  events: SimEvent[],
): void {
  if (player.action === 'steal') {
    if (player.actionTicks === ACTION_TIMING.steal.hitTick) resolveSteal(state, player, events);
    if (player.actionTicks >= ACTION_TIMING.steal.totalTicks) endAction(player);
  } else if (player.action === 'shove') {
    if (player.actionTicks === ACTION_TIMING.shove.hitTick) resolveShove(state, player, events);
    if (player.actionTicks >= ACTION_TIMING.shove.totalTicks) endAction(player);
  }
}

function movingAway(holder: PlayerState, from: PlayerState): boolean {
  const speed = Math.hypot(holder.vel.x, holder.vel.z);
  if (speed < AWAY_SPEED) return false;
  const dx = holder.pos.x - from.pos.x;
  const dz = holder.pos.z - from.pos.z;
  return holder.vel.x * dx + holder.vel.z * dz > 0;
}

/** Spec B.4 steal roll. RNG draw order: exactly one draw per attempt that reaches the holder. */
export function resolveSteal(state: MatchState, stealer: PlayerState, events: SimEvent[]): void {
  const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
  if (!holder || holder.team === stealer.team || !holder.onGround) {
    events.push({ type: 'stealFailed', by: stealer.id });
    return;
  }
  if (v3DistanceXZ(stealer.pos, holder.pos) > stealer.stats.stealReach) {
    events.push({ type: 'stealFailed', by: stealer.id });
    return;
  }
  let chance = clamp(stealer.stats.stealChance - 0.03 * holder.stats.power, 0.1, 0.7);
  if (movingAway(holder, stealer)) chance *= 0.5;
  if (nextFloat(state.rng) < chance) {
    giveBall(state, stealer, events);
    events.push({ type: 'steal', by: stealer.id, from: holder.id });
  } else {
    events.push({ type: 'stealFailed', by: stealer.id });
  }
}

/** Spec B.4 shove: the nearest opponent in reach and in front is knocked down; the ball pops loose. */
export function resolveShove(state: MatchState, shover: PlayerState, events: SimEvent[]): void {
  const target = shover.targetId === null ? undefined : findPlayer(state, shover.targetId);
  if (!target || target.team === shover.team || !canBeShoved(target)) return;
  if (v3DistanceXZ(shover.pos, target.pos) > SHOVE_REACH || !inFront(shover, target.pos)) return;
  const dealt = shover.stats.stunTicksDealt * (shover.turboActive ? SHOVE_TURBO_MULTIPLIER : 1);
  const stun = dealt - target.stats.stunResistTicks;
  const dx = target.pos.x - shover.pos.x;
  const dz = target.pos.z - shover.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  applyStun(target, stun);
  target.vel.x = ux * POP_SPEED;
  target.vel.z = uz * POP_SPEED;
  if (state.ball.holder === target.id) {
    const { ball } = state;
    const hand = holdPosition(target);
    ball.mode = 'free';
    ball.holder = null;
    ball.flight = null;
    ball.lastShot = null;
    ball.freeTicks = 0;
    ball.pos = { x: hand.x, y: hand.y + 0.3, z: hand.z };
    ball.vel = { x: ux * POP_SPEED, y: POP_SPEED, z: uz * POP_SPEED };
  }
  events.push({ type: 'shove', by: shover.id, target: target.id });
}
