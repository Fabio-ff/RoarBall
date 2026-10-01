import { reflect, sphereVsCapsuleContact } from './collision';
import { clamp } from './math';
import { allPlayers } from './match';
import type { CourtDef, MatchState, PlayerState } from './types';

/** Body capsule shared by separation and deflection (pickup uses a wider reach, see ball.ts). */
export const PLAYER_BODY_RADIUS = 0.35;
export const PLAYER_BODY_BOTTOM = 0.35;
export const PLAYER_BODY_TOP = 1.55;
/** Free balls at or below this height are handled by pickup, not deflection (spec A.3). */
const DEFLECT_MIN_HEIGHT = 1.6;
const DEFLECT_RESTITUTION = 0.5;

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

/** Spec A.2: a free ball above pickup height bounces off bodies (needed for blocks and rebounds). */
export function deflectBallOffPlayers(state: MatchState): void {
  const { ball } = state;
  if (ball.mode !== 'free' || ball.pos.y <= DEFLECT_MIN_HEIGHT) return;
  for (const player of allPlayers(state)) {
    const bottom = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_BOTTOM, z: player.pos.z };
    const top = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_TOP, z: player.pos.z };
    const contact = sphereVsCapsuleContact(ball.pos, ball.radius, bottom, top, PLAYER_BODY_RADIUS);
    if (!contact) continue;
    ball.pos.x += contact.normal.x * contact.depth;
    ball.pos.y += contact.normal.y * contact.depth;
    ball.pos.z += contact.normal.z * contact.depth;
    ball.vel = reflect(ball.vel, contact.normal, DEFLECT_RESTITUTION);
    return;
  }
}
