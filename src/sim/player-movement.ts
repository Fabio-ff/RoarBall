import { clamp, moveTowards, v2Length, v2Normalize } from './math';
import { SHOT_ACTIONS } from './types';
import type { CourtDef, PlayerAction, PlayerIntent, PlayerState } from './types';

/** Stick magnitudes below this count as no input. */
const MOVE_DEADZONE = 0.1;
/** Below this speed (m/s) the player is idle. */
const IDLE_SPEED = 0.05;

/** Shots lock the player out of input until the animation ends (spec §4.4). */
export function isActionLocked(player: PlayerState): boolean {
  return SHOT_ACTIONS.has(player.action);
}

/** Leaves the ground with the given vertical speed; gravity applies from the next step. */
export function startJump(player: PlayerState, speed: number): void {
  player.vel.y = speed;
  player.onGround = false;
}

/**
 * Advances one player by `dt` seconds according to `intent` (spec §4.2 step 4). Kinematic on the
 * ground (velocity moves towards the intended velocity), ballistic in the air (no air control),
 * clamped to the play area. Records turbo demand for stepTurbo (step 9). Mutates `player`.
 */
export function stepPlayer(
  player: PlayerState,
  intent: PlayerIntent,
  court: CourtDef,
  dt: number,
): void {
  const { stats } = player;
  const locked = isActionLocked(player);
  const moving = !locked && v2Length(intent.move) > MOVE_DEADZONE;
  const dir = moving ? v2Normalize(intent.move) : { x: 0, y: 0 };

  player.turboRequested = intent.turbo && moving;
  player.turboActive = player.turboRequested && player.turbo > 0 && player.onGround;
  const maxSpeed = player.turboActive ? stats.turboSpeed : stats.runSpeed;

  if (player.onGround) {
    const rate = (moving ? stats.acceleration : stats.deceleration) * dt;
    player.vel.x = moveTowards(player.vel.x, dir.x * maxSpeed, rate);
    player.vel.z = moveTowards(player.vel.z, dir.y * maxSpeed, rate);
  } else {
    player.vel.y -= court.physics.gravity * dt;
  }

  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;
  player.pos.z += player.vel.z * dt;

  if (!player.onGround && player.pos.y <= 0) {
    player.pos.y = 0;
    player.vel.y = 0;
    player.onGround = true;
  }

  const halfLength = court.playArea.length / 2;
  const halfWidth = court.playArea.width / 2;
  const clampedX = clamp(player.pos.x, -halfLength, halfLength);
  if (clampedX !== player.pos.x) {
    player.pos.x = clampedX;
    player.vel.x = 0;
  }
  const clampedZ = clamp(player.pos.z, -halfWidth, halfWidth);
  if (clampedZ !== player.pos.z) {
    player.pos.z = clampedZ;
    player.vel.z = 0;
  }

  if (moving) player.facing = Math.atan2(dir.x, dir.y);

  let action: PlayerAction;
  if (locked) action = player.action;
  else if (!player.onGround) action = 'jump';
  else action = Math.hypot(player.vel.x, player.vel.z) > IDLE_SPEED ? 'run' : 'idle';

  if (action === player.action) {
    player.actionTicks += 1;
  } else {
    player.action = action;
    player.actionTicks = 0;
  }
}

/**
 * Spec §4.2 step 9 / §4.7: turbo drains while active and regenerates unless the player is
 * holding turbo while moving on an empty bar.
 */
export function stepTurbo(player: PlayerState): void {
  const { stats } = player;
  if (player.turboActive) {
    player.turbo = Math.max(0, player.turbo - stats.turboDrainPerTick);
  } else if (!player.turboRequested) {
    player.turbo = Math.min(1, player.turbo + stats.turboRegenPerTick);
  }
}
