import { arcPoint, flightTimeFor, solveArcVelocity } from './arc';
import { TICK_DT, TICK_RATE } from './constants';
import {
  attackingHoopIndex,
  hoopGeometry,
  nearestHoopIndex,
  RIM_RADIUS,
  RIM_TUBE,
  type HoopGeometry,
} from './hoop';
import { clamp, lerp, v3DistanceXZ, type Vec3 } from './math';
import { startJump } from './player-movement';
import { nextFloat, type RngState } from './rng';
import { ACTION_FOR_SHOT } from './types';
import type {
  BallState,
  CourtDef,
  HoopIndex,
  MatchState,
  MissType,
  PlayerId,
  PlayerState,
  ShotType,
  SimEvent,
  TeamIndex,
} from './types';

export interface ShotTiming {
  totalTicks: number;
  releaseTick: number;
  jumpSpeed: number;
}

/** Animation lengths and the tick at which the ball leaves the hand (spec A.4). */
export const SHOT_TIMING: Readonly<Record<ShotType, ShotTiming>> = {
  jumpshot: { totalTicks: 48, releaseTick: 27, jumpSpeed: 4.5 },
  layup: { totalTicks: 36, releaseTick: 15, jumpSpeed: 2.5 },
  dunk: { totalTicks: 42, releaseTick: 24, jumpSpeed: 4.0 },
};

export const DUNK_RANGE = 2.0;
export const LAYUP_RANGE = 2.5;
export const THREE_POINT_DISTANCE = 6.75;
export const SHOOTER_PICKUP_COOLDOWN_TICKS = 30;
/** Release point relative to the shooter's feet: arms raised. */
const RELEASE_HEIGHT = 2.1;
const RELEASE_FORWARD = 0.3;
/**
 * A made shot targets a point just below the rim plane so the crossing happens inside the
 * collision-free flight, whatever the horizontal speed (long heaves included).
 */
const MADE_TARGET_BELOW_RIM = 0.1;
/** Dunkers and layup drivers arrive this far short of the rim centre at release. */
const DRIVE_STOP_SHORT = 0.6;
/** Dunks: the ball is slammed from above the rim straight down through it. */
const DUNK_FLIGHT_TIME = 0.1;
const DUNK_FROM_ABOVE_RIM = 0.4;
const DUNK_TARGET_BELOW_RIM = 0.1;

export interface BasketInfo {
  team: TeamIndex;
  points: 2 | 3;
  shooter: PlayerId;
  shotType: ShotType;
}

function movingTowards(player: PlayerState, target: Vec3): boolean {
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed < 1) return false;
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  return (player.vel.x * dx + player.vel.z * dz) / (speed * len) > 0.3;
}

export function chooseShotType(player: PlayerState, hoop: HoopGeometry): ShotType {
  const d = v3DistanceXZ(player.pos, hoop.rimCenter);
  if (d <= DUNK_RANGE && movingTowards(player, hoop.rimCenter)) return 'dunk';
  if (d <= LAYUP_RANGE) return 'layup';
  return 'jumpshot';
}

/** 1 up close, 0.5 at 7 m, 0.25 at 10 m, then a slow tail. */
export function distanceFactor(distance: number): number {
  if (distance <= 1.5) return 1;
  if (distance <= 7) return lerp(1, 0.5, (distance - 1.5) / 5.5);
  if (distance <= 10) return lerp(0.5, 0.25, (distance - 7) / 3);
  return Math.max(0.1, 0.25 - (distance - 10) * 0.05);
}

/**
 * Probability that a shot goes in (spec §4.4, A.4). Shared with the AI in phase 4. Defender
 * terms are added in phase 3.
 */
export function shotQuality(shooter: PlayerState, shotType: ShotType, hoop: HoopGeometry): number {
  if (shotType === 'dunk') return 1;
  const { shooting } = shooter.stats;
  if (shotType === 'layup') return clamp(0.7 + 0.25 * shooting, 0, 0.95);
  const distance = v3DistanceXZ(shooter.pos, hoop.rimCenter);
  const speed = Math.hypot(shooter.vel.x, shooter.vel.z);
  const motion = 1 - 0.4 * Math.min(speed / 8, 1);
  return clamp(shooting * distanceFactor(distance) * motion, 0.02, 0.97);
}

export function pointsFor(distance: number): 2 | 3 {
  return distance >= THREE_POINT_DISTANCE ? 3 : 2;
}

export function pickMissType(rng: RngState): MissType {
  const r = nextFloat(rng);
  if (r < 0.5) return 'frontRim';
  if (r < 0.7) return 'backRim';
  if (r < 0.85) return 'sideRim';
  return 'board';
}

/**
 * Where a missed shot's ball centre arrives. Rim misses aim at the outer side of the tube so the
 * bounce goes back out; the board miss hits the backboard face above the rim.
 */
export function missTarget(
  hoop: HoopGeometry,
  shooterPos: Vec3,
  missType: MissType,
  ballRadius: number,
): Vec3 {
  const rim = hoop.rimCenter;
  const dx = rim.x - shooterPos.x;
  const dz = rim.z - shooterPos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const outer = RIM_RADIUS + RIM_TUBE + ballRadius * 0.5;
  const y = rim.y + ballRadius * 0.6;
  switch (missType) {
    case 'frontRim':
      return { x: rim.x - ux * outer, y, z: rim.z - uz * outer };
    case 'backRim': {
      // Top of the far tube. The board face is only 0.35 m behind the rim centre, so a ball
      // cannot sit outside the far tube without touching the board: back-rim misses are rattles
      // and the free physics decides where they end up.
      const farTop = RIM_RADIUS - ballRadius * 0.2;
      return {
        x: rim.x + ux * farTop,
        y: rim.y + RIM_TUBE + ballRadius * 0.85,
        z: rim.z + uz * farTop,
      };
    }
    case 'sideRim':
      return { x: rim.x - uz * outer, y, z: rim.z + ux * outer };
    case 'board':
      // High and off-centre so the rebound comes down beside the ring, not through it.
      return {
        x: hoop.boardCenter.x - hoop.side * (hoop.boardHalf.x + ballRadius),
        y: rim.y + 0.6,
        z: rim.z + 0.35,
      };
  }
}

/** Spec A.4: the team's attacking hoop, or the nearer one in shootaround. */
export function targetHoopIndex(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
): HoopIndex {
  return state.settings.mode === 'shootaround'
    ? nearestHoopIndex(court, player.pos)
    : attackingHoopIndex(court, player.team);
}

function releasePoint(player: PlayerState): Vec3 {
  return {
    x: player.pos.x + Math.sin(player.facing) * RELEASE_FORWARD,
    y: player.pos.y + RELEASE_HEIGHT,
    z: player.pos.z + Math.cos(player.facing) * RELEASE_FORWARD,
  };
}

/** Locks the player into a shot animation and starts its jump; the ball stays in hand until release. */
export function startShot(state: MatchState, player: PlayerState, court: CourtDef): void {
  const hoopIndex = targetHoopIndex(state, player, court);
  const hoop = hoopGeometry(court, hoopIndex);
  const type = chooseShotType(player, hoop);
  player.shot = { type, hoop: hoopIndex };
  player.action = ACTION_FOR_SHOT[type];
  player.actionTicks = 0;
  player.facing = Math.atan2(hoop.rimCenter.x - player.pos.x, hoop.rimCenter.z - player.pos.z);
  if (type !== 'jumpshot') {
    // Drive to a point just short of the rim by the release tick (no air control after this).
    const dx = hoop.rimCenter.x - player.pos.x;
    const dz = hoop.rimCenter.z - player.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const travel = Math.max(0, len - DRIVE_STOP_SHORT);
    const speed = Math.min(
      travel / (SHOT_TIMING[type].releaseTick * TICK_DT),
      player.stats.turboSpeed,
    );
    player.vel.x = (dx / len) * speed;
    player.vel.z = (dz / len) * speed;
  }
  startJump(player, SHOT_TIMING[type].jumpSpeed);
}

export interface ShotOutcome {
  quality: number;
  made: boolean;
  missType: MissType | null;
}

/** Rolls the seeded RNG for the outcome (spec §4.4). Consumed in a fixed order: make roll, then miss type. */
export function resolveShotOutcome(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
): ShotOutcome {
  const shot = player.shot;
  if (!shot) return { quality: 0, made: false, missType: 'frontRim' };
  const hoop = hoopGeometry(court, shot.hoop);
  const quality = shotQuality(player, shot.type, hoop);
  const made = nextFloat(state.rng) < quality;
  return { quality, made, missType: made ? null : pickMissType(state.rng) };
}

/** Launches the ball on an arc that realises `outcome`; exported so tests can force each outcome. */
export function launchShot(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
  events: SimEvent[],
  outcome: ShotOutcome,
): void {
  const shot = player.shot;
  if (!shot) return;
  const hoop = hoopGeometry(court, shot.hoop);
  const { ball } = state;
  const distance = v3DistanceXZ(player.pos, hoop.rimCenter);
  const points = pointsFor(distance);
  const rim = hoop.rimCenter;
  const isDunk = shot.type === 'dunk';
  // A dunker's hand is over the rim at release; the ball goes straight down through the ring.
  const from = isDunk
    ? { x: rim.x, y: rim.y + DUNK_FROM_ABOVE_RIM, z: rim.z }
    : releasePoint(player);
  let target: Vec3;
  if (isDunk) target = { x: rim.x, y: rim.y - DUNK_TARGET_BELOW_RIM, z: rim.z };
  else if (outcome.made) target = { x: rim.x, y: rim.y - MADE_TARGET_BELOW_RIM, z: rim.z };
  else target = missTarget(hoop, player.pos, outcome.missType ?? 'frontRim', ball.radius);
  const flightTime = isDunk ? DUNK_FLIGHT_TIME : flightTimeFor(distance);
  const totalTicks = Math.max(1, Math.round(flightTime * TICK_RATE));
  const velocity = solveArcVelocity(from, target, totalTicks * TICK_DT, court.physics.gravity);

  ball.mode = 'flight';
  ball.holder = null;
  ball.pos = { ...from };
  ball.vel = velocity;
  ball.flight = { from, velocity, totalTicks, elapsedTicks: 0 };
  ball.lastShot = {
    shooter: player.id,
    team: player.team,
    shotType: shot.type,
    points,
    made: outcome.made,
  };
  player.shotCooldownTicks = SHOOTER_PICKUP_COOLDOWN_TICKS;
  if (!isDunk && shot.type === 'layup') {
    player.vel.x = 0;
    player.vel.z = 0;
  }
  if (isDunk) {
    player.vel.x = 0;
    player.vel.z = 0;
  }
  events.push({
    type: 'shotReleased',
    playerId: player.id,
    shotType: shot.type,
    quality: outcome.quality,
    made: outcome.made,
    points,
  });
}

/** Decides the outcome and launches the ball (spec §4.4). */
export function releaseShot(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
  events: SimEvent[],
): void {
  launchShot(state, player, court, events, resolveShotOutcome(state, player, court));
}

/** Per-tick bookkeeping of a locked shot: release at the release tick, unlock after landing. */
export function stepShotAction(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
  events: SimEvent[],
): void {
  const shot = player.shot;
  if (!shot) {
    player.action = 'idle';
    player.actionTicks = 0;
    return;
  }
  const timing = SHOT_TIMING[shot.type];
  if (player.actionTicks === timing.releaseTick && state.ball.holder === player.id) {
    releaseShot(state, player, court, events);
  }
  if (player.actionTicks >= timing.totalTicks && player.onGround) {
    player.shot = null;
    player.action = 'idle';
    player.actionTicks = 0;
  }
}

/** Moves a ball in flight along its scripted arc; hands it to free physics at the end. */
export function stepFlight(ball: BallState, court: CourtDef): void {
  const flight = ball.flight;
  if (!flight) {
    ball.mode = 'free';
    return;
  }
  flight.elapsedTicks += 1;
  const t = flight.elapsedTicks * TICK_DT;
  const g = court.physics.gravity;
  ball.pos = arcPoint(flight.from, flight.velocity, g, t);
  ball.vel = { x: flight.velocity.x, y: flight.velocity.y - g * t, z: flight.velocity.z };
  if (flight.elapsedTicks >= flight.totalTicks) {
    ball.mode = 'free';
    ball.flight = null;
  }
}

/**
 * A basket is the ball centre crossing the rim plane downwards inside the ring. Made shots are
 * scripted to do exactly that; a lucky bounce after a miss counts too.
 */
export function detectBasket(
  state: MatchState,
  court: CourtDef,
  prevBallPos: Vec3,
): BasketInfo | null {
  const { ball } = state;
  if (ball.mode === 'held' || ball.vel.y >= 0 || !ball.lastShot) return null;
  for (const index of [0, 1] as const) {
    const rim = hoopGeometry(court, index).rimCenter;
    const crossed = prevBallPos.y > rim.y && ball.pos.y <= rim.y;
    if (!crossed) continue;
    if (v3DistanceXZ(ball.pos, rim) < RIM_RADIUS - RIM_TUBE - ball.radius * 0.5) {
      const { team, points, shooter, shotType } = ball.lastShot;
      return { team, points, shooter, shotType };
    }
  }
  return null;
}
