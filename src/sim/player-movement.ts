import { clamp, moveTowards, v2Length, v2Normalize } from './math';
import type { CourtDef, PlayerAction, PlayerIntent, PlayerState } from './types';

/** Stick magnitudes below this count as no input. */
const MOVE_DEADZONE = 0.1;
/** Below this speed (m/s) the player is idle. */
const IDLE_SPEED = 0.05;

/**
 * Advances one player by `dt` seconds according to `intent` (spec §4.2 step 4, §4.7 turbo).
 * Kinematic: velocity moves towards the intended velocity at the acceleration/deceleration
 * rate, position integrates velocity and is clamped to the play area. Mutates `player`.
 */
export function stepPlayer(
  player: PlayerState,
  intent: PlayerIntent,
  court: CourtDef,
  dt: number,
): void {
  const { stats } = player;
  const moving = v2Length(intent.move) > MOVE_DEADZONE;
  const usingTurbo = intent.turbo && moving && player.turbo > 0;
  const dir = moving ? v2Normalize(intent.move) : { x: 0, y: 0 };
  const maxSpeed = usingTurbo ? stats.turboSpeed : stats.runSpeed;
  const rate = (moving ? stats.acceleration : stats.deceleration) * dt;

  player.vel.x = moveTowards(player.vel.x, dir.x * maxSpeed, rate);
  player.vel.z = moveTowards(player.vel.z, dir.y * maxSpeed, rate);

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;

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

  if (usingTurbo) {
    player.turbo = Math.max(0, player.turbo - stats.turboDrainPerTick);
  } else if (!intent.turbo || !moving) {
    player.turbo = Math.min(1, player.turbo + stats.turboRegenPerTick);
  }

  const speed = Math.hypot(player.vel.x, player.vel.z);
  const action: PlayerAction = speed > IDLE_SPEED ? 'run' : 'idle';
  if (action === player.action) {
    player.actionTicks += 1;
  } else {
    player.action = action;
    player.actionTicks = 0;
  }
}
