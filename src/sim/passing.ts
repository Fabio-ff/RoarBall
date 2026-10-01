import { ACTION_TIMING, beginAction, endAction } from './actions';
import { solveArcVelocity } from './arc';
import { giveBall, holdPosition } from './ball';
import { PLAYER_BODY_BOTTOM, PLAYER_BODY_TOP } from './bodies';
import { sphereVsCapsule } from './collision';
import { TICK_DT, TICK_RATE } from './constants';
import { hoopGeometry } from './hoop';
import { v3DistanceXZ, type Vec3 } from './math';
import { allPlayers, findPlayer } from './match';
import { SHOT_TIMING, stepFlight, targetHoopIndex } from './shooting';
import type { CourtDef, MatchState, PlayerState, SimEvent } from './types';

export const PASS_TIMING = ACTION_TIMING.pass;
export const PASS_CATCH_RADIUS = 0.9;
/** Spec B.3: flight time 0.35 s + 0.05 s per metre. */
const PASS_BASE_TIME = 0.35;
const PASS_TIME_PER_METRE = 0.05;
/** Chest height the pass is aimed at, and how far above it still counts as catchable. */
const PASS_TARGET_HEIGHT = 1.2;
const CATCH_HEIGHT_TOLERANCE = 1.2;
export const ALLEY_OOP_RANGE = 3;
const LOB_TIME = 0.5;
const LOB_ABOVE_RIM = 0.55;
const LOB_TOWARDS_RECEIVER = 0.4;
export const CALL_FOR_PASS_TICKS = 60;
/** Reach used for interceptions: body plus arms. */
const INTERCEPT_RADIUS = 0.45;

/** The other player on this player's team (2v2: exactly one). */
export function teammateOf(state: MatchState, player: PlayerState): PlayerState | undefined {
  return state.teams[player.team].players.find((p) => p.id !== player.id);
}

export function callForPass(player: PlayerState): void {
  player.callingForPassTicks = CALL_FOR_PASS_TICKS;
}

/** Starts the pass animation towards the teammate; false when there is nobody to pass to. */
export function startPass(state: MatchState, player: PlayerState): boolean {
  const receiver = teammateOf(state, player);
  if (!receiver) return false;
  beginAction(player, 'pass');
  player.targetId = receiver.id;
  player.facing = Math.atan2(receiver.pos.x - player.pos.x, receiver.pos.z - player.pos.z);
  return true;
}

function isNearAttackingHoop(state: MatchState, player: PlayerState, court: CourtDef): boolean {
  const hoop = hoopGeometry(court, targetHoopIndex(state, player, court));
  return v3DistanceXZ(player.pos, hoop.rimCenter) <= ALLEY_OOP_RANGE;
}

/** Launches the ball at the receiver: a fast low arc, or a lob above the rim for an alley-oop (B.3). */
export function releasePass(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
  events: SimEvent[],
): void {
  const receiver = player.targetId === null ? undefined : findPlayer(state, player.targetId);
  const { ball } = state;
  if (!receiver || ball.holder !== player.id) return;
  const from = holdPosition(player);
  const lob = !receiver.onGround && isNearAttackingHoop(state, receiver, court);
  let target: Vec3;
  let flightTime: number;
  if (lob) {
    const rim = hoopGeometry(court, targetHoopIndex(state, receiver, court)).rimCenter;
    const dx = receiver.pos.x - rim.x;
    const dz = receiver.pos.z - rim.z;
    const len = Math.hypot(dx, dz) || 1;
    target = {
      x: rim.x + (dx / len) * LOB_TOWARDS_RECEIVER,
      y: rim.y + LOB_ABOVE_RIM,
      z: rim.z + (dz / len) * LOB_TOWARDS_RECEIVER,
    };
    flightTime = LOB_TIME;
  } else {
    const distance = v3DistanceXZ(player.pos, receiver.pos);
    flightTime = PASS_BASE_TIME + PASS_TIME_PER_METRE * distance;
    // Lead a moving receiver by where they will be at arrival.
    target = {
      x: receiver.pos.x + receiver.vel.x * flightTime,
      y: receiver.pos.y + PASS_TARGET_HEIGHT,
      z: receiver.pos.z + receiver.vel.z * flightTime,
    };
  }
  const totalTicks = Math.max(1, Math.round(flightTime * TICK_RATE));
  const velocity = solveArcVelocity(from, target, totalTicks * TICK_DT, court.physics.gravity);
  ball.mode = 'flight';
  ball.holder = null;
  ball.pos = { ...from };
  ball.vel = velocity;
  ball.flight = {
    kind: 'pass',
    from,
    velocity,
    totalTicks,
    elapsedTicks: 0,
    receiver: receiver.id,
    lob,
    team: player.team,
  };
  ball.lastShot = null;
  events.push({ type: 'pass', from: player.id, to: receiver.id, lob });
}

/** Per-tick bookkeeping of the pass animation: release at the release tick, unlock at the end. */
export function stepPassAction(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
  events: SimEvent[],
): void {
  if (player.actionTicks === PASS_TIMING.releaseTick) releasePass(state, player, court, events);
  if (player.actionTicks >= PASS_TIMING.totalTicks) endAction(player);
}

function overlapsBall(state: MatchState, player: PlayerState, radius: number): boolean {
  const bottom = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_BOTTOM, z: player.pos.z };
  const top = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_TOP, z: player.pos.z };
  return sphereVsCapsule(state.ball.pos, state.ball.radius, bottom, top, radius);
}

function canHold(player: PlayerState): boolean {
  return player.action !== 'stunned' && player.action !== 'getup';
}

/**
 * Moves a pass along its arc, hands it to an intercepting opponent, and at arrival to the
 * receiver if they are within reach; an airborne receiver near the rim turns a lob into a dunk.
 */
export function stepPassFlight(state: MatchState, court: CourtDef, events: SimEvent[]): void {
  const { ball } = state;
  const flight = ball.flight;
  if (!flight) {
    ball.mode = 'free';
    return;
  }
  stepFlight(ball, court);
  for (const opponent of allPlayers(state)) {
    if (opponent.team === flight.team || !canHold(opponent)) continue;
    if (overlapsBall(state, opponent, INTERCEPT_RADIUS)) {
      giveBall(state, opponent, events);
      events.push({ type: 'intercept', playerId: opponent.id });
      return;
    }
  }
  if (ball.mode !== 'free') return; // still flying
  const receiver = flight.receiver === null ? undefined : findPlayer(state, flight.receiver);
  if (!receiver || !canHold(receiver)) return;
  const nearHoop = isNearAttackingHoop(state, receiver, court);
  if (flight.lob && !receiver.onGround && nearHoop) {
    giveBall(state, receiver, events);
    events.push({ type: 'catch', playerId: receiver.id });
    // Catch above the rim: slam it on the next tick.
    receiver.shot = {
      type: 'dunk',
      hoop: targetHoopIndex(state, receiver, court),
      approachSpeed: 0,
    };
    receiver.action = 'dunk';
    receiver.actionTicks = SHOT_TIMING.dunk.releaseTick - 1;
    events.push({ type: 'alleyOop', playerId: receiver.id });
    return;
  }
  const withinReach = v3DistanceXZ(receiver.pos, ball.pos) <= PASS_CATCH_RADIUS;
  const withinHeight =
    Math.abs(ball.pos.y - (receiver.pos.y + PASS_TARGET_HEIGHT)) <= CATCH_HEIGHT_TOLERANCE;
  if (withinReach && withinHeight) {
    giveBall(state, receiver, events);
    events.push({ type: 'catch', playerId: receiver.id });
  }
}
