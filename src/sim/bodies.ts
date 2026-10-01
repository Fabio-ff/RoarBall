import { canTakeLooseBall, giveBall } from './ball';
import { reflect, sphereVsCapsuleContact, type Contact } from './collision';
import { clamp, type Vec3 } from './math';
import { allPlayers } from './match';
import type { CourtDef, MatchState, PlayerState, SimEvent } from './types';

/** Body capsule shared by separation and deflection (pickup uses a wider reach, see ball.ts). */
export const PLAYER_BODY_RADIUS = 0.35;
export const PLAYER_BODY_BOTTOM = 0.35;
export const PLAYER_BODY_TOP = 1.55;
/** Free balls at or below this height are handled by pickup, not deflection (spec A.3). */
const DEFLECT_MIN_HEIGHT = 1.6;
const DEFLECT_RESTITUTION = 0.5;
/** A contact this close to straight up is the ball landing on top of the player: they take it. */
const ON_TOP_NORMAL_Y = 0.7;
/** Below this speed a ball touching a player above their shoulders has settled there. */
const SETTLED_SPEED = 1;
/** Outward speed given to a ball on top of a player who cannot take it, so it does not stay there. */
const ROLL_OFF_SPEED = 1.5;

/** Spec §4.2 step 6: overlapping players push each other apart on the court plane. */
export function separatePlayers(players: readonly PlayerState[], court: CourtDef): void {
  const minDistance = PLAYER_BODY_RADIUS * 2;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (!a || !b) continue;
      if (Math.abs(a.pos.y - b.pos.y) > PLAYER_BODY_TOP - PLAYER_BODY_BOTTOM) continue;
      let dx = b.pos.x - a.pos.x;
      let dz = b.pos.z - a.pos.z;
      let d = Math.hypot(dx, dz);
      if (d >= minDistance) continue;
      if (d < 1e-6) {
        dx = 1;
        dz = 0;
        d = 1;
      }
      const push = (minDistance - d) / 2;
      const ux = dx / d;
      const uz = dz / d;
      a.pos.x -= ux * push;
      a.pos.z -= uz * push;
      b.pos.x += ux * push;
      b.pos.z += uz * push;
    }
  }
  const halfLength = court.playArea.length / 2;
  const halfWidth = court.playArea.width / 2;
  for (const p of players) {
    p.pos.x = clamp(p.pos.x, -halfLength, halfLength);
    p.pos.z = clamp(p.pos.z, -halfWidth, halfWidth);
  }
}

/**
 * Spec A.2: a free ball above pickup height bounces off bodies (needed for blocks and rebounds).
 * It never comes to rest up there (above pickup height, until the loose-ball timeout): a ball that
 * lands on top of a player, or settles on the shoulders of a crowd, goes to the nearest player
 * touching it who can hold it; one on top of a player who cannot is pushed off.
 */
export function deflectBallOffPlayers(state: MatchState, events: SimEvent[]): void {
  const { ball } = state;
  if (ball.mode !== 'free' || ball.pos.y <= DEFLECT_MIN_HEIGHT) return;
  const settled = Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z) < SETTLED_SPEED;
  let first: { contact: Contact; onTop: boolean } | null = null;
  let taker: PlayerState | null = null;
  let takerDistance = Infinity;
  for (const player of allPlayers(state)) {
    const bottom = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_BOTTOM, z: player.pos.z };
    const top = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_TOP, z: player.pos.z };
    const contact = sphereVsCapsuleContact(ball.pos, ball.radius, bottom, top, PLAYER_BODY_RADIUS);
    if (!contact) continue;
    const onTop = contact.normal.y > ON_TOP_NORMAL_Y;
    first ??= { contact, onTop };
    const resting = onTop || (settled && ball.pos.y > top.y);
    // shotCooldownTicks also covers a shooter who was just blocked (the swat clears lastShot), so
    // a swat that lands on the shooter's head rolls off instead of going straight back to them.
    if (!resting || player.shotCooldownTicks > 0 || !canTakeLooseBall(state, player)) continue;
    const distance = Math.hypot(ball.pos.x - player.pos.x, ball.pos.z - player.pos.z);
    if (distance < takerDistance || (distance === takerDistance && taker && player.id < taker.id)) {
      taker = player;
      takerDistance = distance;
    }
  }
  if (taker) {
    giveBall(state, taker, events);
    return;
  }
  if (!first) return;
  const { contact, onTop } = first;
  ball.pos.x += contact.normal.x * contact.depth;
  ball.pos.y += contact.normal.y * contact.depth;
  ball.pos.z += contact.normal.z * contact.depth;
  ball.vel = reflect(ball.vel, contact.normal, DEFLECT_RESTITUTION);
  if (onTop) rollOff(ball.vel, contact.normal);
}

/** Pushes a ball on top of a head outwards (along the contact's horizontal part) so it falls off. */
function rollOff(vel: Vec3, normal: Vec3): void {
  let dx = normal.x;
  let dz = normal.z;
  let len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    // Dead centre: keep going the way it was moving, or towards +X.
    dx = vel.x;
    dz = vel.z;
    len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      dx = 1;
      dz = 0;
      len = 1;
    }
  }
  const outward = (vel.x * dx + vel.z * dz) / len;
  if (outward >= ROLL_OFF_SPEED) return;
  vel.x += (dx / len) * (ROLL_OFF_SPEED - outward);
  vel.z += (dz / len) * (ROLL_OFF_SPEED - outward);
}
