import { reflect, sphereVsBox, sphereVsCapsule, sphereVsFloor, sphereVsRing } from './collision';
import { TICK_DT } from './constants';
import { hoopGeometry, RIM_RADIUS, RIM_TUBE } from './hoop';
import { clamp, moveTowards, v3DistanceXZ, type Vec3 } from './math';
import { allPlayers, findPlayer } from './match';
import type { BallState, CourtDef, MatchState, PlayerState, SimEvent } from './types';

const HAND_FORWARD = 0.35;
const HAND_HEIGHT = 0.95;
/** Below this vertical speed a floor bounce ends and the ball rolls. */
const REST_SPEED = 0.6;
/** Floor impacts above this speed emit a bounce event (audio later). */
const BOUNCE_EVENT_SPEED = 1;
/** Rolling deceleration, m/s² at friction 1. */
const ROLLING_DECEL = 3;
/** Spec A.3: pickups only below shoulder height. */
const PICKUP_MAX_HEIGHT = 1.6;
/** Reach of a player for a loose ball (capsule radius used for pickup). */
const PICKUP_RADIUS = 0.6;
const PLAYER_CAPSULE_BOTTOM = 0.35;
const PLAYER_CAPSULE_TOP = 1.55;

/** Where a held ball sits: in front of the holder at hand height (dribbling is presentation only). */
export function holdPosition(holder: PlayerState): Vec3 {
  return {
    x: holder.pos.x + Math.sin(holder.facing) * HAND_FORWARD,
    y: holder.pos.y + HAND_HEIGHT,
    z: holder.pos.z + Math.cos(holder.facing) * HAND_FORWARD,
  };
}

export function stepHeldBall(ball: BallState, holder: PlayerState): void {
  ball.pos = holdPosition(holder);
  ball.vel = { ...holder.vel };
}

/** Gravity, drag, floor/rim/backboard bounces and the invisible boundary (spec A.2). */
export function stepFreeBall(ball: BallState, court: CourtDef, events: SimEvent[]): void {
  const { gravity, restitution, friction, airDrag } = court.physics;
  ball.freeTicks += 1;
  ball.vel.y -= gravity * TICK_DT;
  const dragKeep = Math.max(0, 1 - airDrag * TICK_DT);
  ball.vel.x *= dragKeep;
  ball.vel.y *= dragKeep;
  ball.vel.z *= dragKeep;

  ball.pos.x += ball.vel.x * TICK_DT;
  ball.pos.y += ball.vel.y * TICK_DT;
  ball.pos.z += ball.vel.z * TICK_DT;

  const floor = sphereVsFloor(ball.pos, ball.radius);
  if (floor) {
    ball.pos.y += floor.depth;
    const impact = -ball.vel.y;
    if (impact > BOUNCE_EVENT_SPEED) events.push({ type: 'bounce', speed: impact });
    ball.vel = reflect(ball.vel, floor.normal, restitution);
    if (ball.vel.y < REST_SPEED) ball.vel.y = 0;
    const speed = Math.hypot(ball.vel.x, ball.vel.z);
    if (speed > 0) {
      const slowed = moveTowards(speed, 0, ROLLING_DECEL * friction * TICK_DT);
      ball.vel.x *= slowed / speed;
      ball.vel.z *= slowed / speed;
    }
  }

  let rimContact = false;
  let boardContact = false;
  for (const index of [0, 1] as const) {
    const hoop = hoopGeometry(court, index);
    const board = sphereVsBox(ball.pos, ball.radius, hoop.boardCenter, hoop.boardHalf);
    if (board) {
      boardContact = true;
      pushOut(ball, board.normal, board.depth);
      ball.vel = reflect(ball.vel, board.normal, restitution);
      if (!ball.touchingBoard) events.push({ type: 'boardHit' });
    }
    const rim = sphereVsRing(ball.pos, ball.radius, hoop.rimCenter, RIM_RADIUS, RIM_TUBE);
    if (rim) {
      rimContact = true;
      pushOut(ball, rim.normal, rim.depth);
      ball.vel = reflect(ball.vel, rim.normal, restitution * 0.9);
      if (!ball.touchingRim) events.push({ type: 'rimHit' });
    }
  }
  ball.touchingRim = rimContact;
  ball.touchingBoard = boardContact;

  const maxX = court.playArea.length / 2 - ball.radius;
  const maxZ = court.playArea.width / 2 - ball.radius;
  const cx = clamp(ball.pos.x, -maxX, maxX);
  if (cx !== ball.pos.x) {
    ball.pos.x = cx;
    ball.vel.x = 0;
  }
  const cz = clamp(ball.pos.z, -maxZ, maxZ);
  if (cz !== ball.pos.z) {
    ball.pos.z = cz;
    ball.vel.z = 0;
  }
}

function pushOut(ball: BallState, normal: Vec3, depth: number): void {
  ball.pos.x += normal.x * depth;
  ball.pos.y += normal.y * depth;
  ball.pos.z += normal.z * depth;
}

/** Spec §4.2 step 5 for held and free balls; flights are stepped by shooting.ts (task 3). */
export function stepBall(state: MatchState, court: CourtDef, events: SimEvent[]): void {
  const { ball } = state;
  if (ball.mode === 'held') {
    const holder = ball.holder === null ? undefined : findPlayer(state, ball.holder);
    if (holder) {
      stepHeldBall(ball, holder);
    } else {
      ball.mode = 'free';
      ball.holder = null;
    }
    return;
  }
  if (ball.mode === 'free') stepFreeBall(ball, court, events);
}

/**
 * Spec A.3: a player touching a low free ball takes it, except the shooter during the cooldown.
 * Contested balls go to the nearest player (XZ distance to the ball), ties to the lower id, so
 * roster order never decides (steals and interceptions reuse this in phase 3).
 */
export function tryPickup(state: MatchState, events: SimEvent[]): void {
  const { ball } = state;
  if (ball.mode !== 'free' || ball.pos.y > PICKUP_MAX_HEIGHT) return;
  let best: PlayerState | null = null;
  let bestDistance = Infinity;
  for (const player of allPlayers(state)) {
    if (player.action === 'stunned' || player.action === 'getup') continue;
    if (player.shotCooldownTicks > 0 && ball.lastShot?.shooter === player.id) continue;
    const bottom = { x: player.pos.x, y: player.pos.y + PLAYER_CAPSULE_BOTTOM, z: player.pos.z };
    const top = { x: player.pos.x, y: player.pos.y + PLAYER_CAPSULE_TOP, z: player.pos.z };
    if (!sphereVsCapsule(ball.pos, ball.radius, bottom, top, PICKUP_RADIUS)) continue;
    const distance = v3DistanceXZ(player.pos, ball.pos);
    if (distance < bestDistance || (distance === bestDistance && best && player.id < best.id)) {
      best = player;
      bestDistance = distance;
    }
  }
  if (best) giveBall(state, best, events);
}

export function giveBall(state: MatchState, player: PlayerState, events: SimEvent[]): void {
  const { ball } = state;
  ball.mode = 'held';
  ball.holder = player.id;
  ball.flight = null;
  ball.freeTicks = 0;
  ball.touchingRim = false;
  ball.touchingBoard = false;
  // Any pickup ends the shot: a later fumble or deflection must not score for the old shooter.
  // (The shooter's pickup cooldown keys off lastShot, so it no longer matters either.)
  ball.lastShot = null;
  ball.vel = { x: 0, y: 0, z: 0 };
  ball.pos = holdPosition(player);
  events.push({ type: 'pickup', playerId: player.id });
  if (state.possession !== player.team) {
    state.possession = player.team;
    // Spec A.5: a fresh shot clock for the team that just won the ball.
    state.shotClockMs = state.settings.shotClockMs;
    events.push({ type: 'possessionChange', team: player.team });
  }
}
