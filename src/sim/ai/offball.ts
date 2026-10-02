import { hoopGeometry, type HoopGeometry } from '../hoop';
import { v3DistanceXZ, type Vec3 } from '../math';
import { targetHoopIndex } from '../shooting';
import type { CourtDef, MatchState, PlayerState } from '../types';
import type { AiGoal, AiMemory } from './memory';
import { nextFloat } from '../rng';
import { opponentsOf } from './offense';
import { pickOpenSpot, type NamedSpot } from './spots';

/** Spec C.5 "teammate has ball" numbers. */
export const INVITE_HANDLER_RANGE = 6;
export const INVITE_CLEAR_RADIUS = 1.5;
export const INVITE_EVERY_TICKS = 90;
export const INVITE_AT_SPOT_RADIUS = 0.8;
export const CHASE_RADIUS = 3;
/** Shot in the air: players this close to the rim move in for the rebound. */
export const REBOUND_RANGE = 5;
export const REBOUND_FROM_RIM = 1.2;

/**
 * Pick (or keep) an open named spot around `hoop`, scored against `anchorPos` (the handler or the
 * ball). RNG: one draw from the brain's private RNG on a fresh pick only (no current spot), none
 * while a spot is held; the roll picks among near-tied spots (issue #92). Off-ball decision
 * ticks draw nothing else, so C.2's at-most-one-draw-per-decision-tick rule holds.
 */
export function planOffBall(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  hoop: HoopGeometry,
  anchorPos: Vec3,
): AiGoal {
  const opponents = opponentsOf(state, me).map((o) => o.pos);
  const current: NamedSpot | null =
    memory.goal.kind === 'moveTo' && memory.goal.name !== null
      ? { name: memory.goal.name, spot: memory.goal.spot }
      : null;
  const roll = current === null ? nextFloat(memory.rng) : null;
  const pick = pickOpenSpot(hoop, anchorPos, opponents, current, roll);
  return { kind: 'moveTo', spot: pick.spot, name: pick.name };
}

/** Spec C.5: jump under the basket to invite the alley-oop, at most once per INVITE_EVERY_TICKS. */
export function wantsAlleyOopInvite(
  state: MatchState,
  me: PlayerState,
  handler: PlayerState,
  memory: AiMemory,
): boolean {
  if (memory.goal.kind !== 'moveTo' || memory.goal.name !== 'underBasket') return false;
  if (!me.onGround || state.tick - memory.lastInviteTick < INVITE_EVERY_TICKS) return false;
  if (v3DistanceXZ(me.pos, memory.goal.spot) > INVITE_AT_SPOT_RADIUS) return false;
  if (v3DistanceXZ(handler.pos, me.pos) > INVITE_HANDLER_RANGE) return false;
  return !opponentsOf(state, me).some((o) => v3DistanceXZ(o.pos, me.pos) <= INVITE_CLEAR_RADIUS);
}

/** Loose ball: I chase when within CHASE_RADIUS or when I am the closest of my team (ties: lower id). */
export function shouldChase(state: MatchState, me: PlayerState): boolean {
  const d = v3DistanceXZ(me.pos, state.ball.pos);
  if (d <= CHASE_RADIUS) return true;
  for (const p of state.teams[me.team].players) {
    if (p.id === me.id) continue;
    const other = v3DistanceXZ(p.pos, state.ball.pos);
    if (other < d || (other === d && p.id < me.id)) return false;
  }
  return true;
}

/** Shot in the air: move to a rebound spot REBOUND_FROM_RIM from the rim on my side, if I am near. */
export function planRebound(state: MatchState, me: PlayerState, court: CourtDef): AiGoal {
  const hoopIndex = state.ball.lastShot?.hoop ?? targetHoopIndex(state, me, court);
  const rim = hoopGeometry(court, hoopIndex).rimCenter;
  const d = v3DistanceXZ(me.pos, rim);
  if (d > REBOUND_RANGE) return { kind: 'idle' };
  const ux = d > 1e-6 ? (me.pos.x - rim.x) / d : 1;
  const uz = d > 1e-6 ? (me.pos.z - rim.z) / d : 0;
  return {
    kind: 'moveTo',
    spot: { x: rim.x + ux * REBOUND_FROM_RIM, y: 0, z: rim.z + uz * REBOUND_FROM_RIM },
    name: null,
  };
}
