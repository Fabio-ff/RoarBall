import type { Vec2, Vec3 } from './math';
import type { RngState } from './rng';

export type TeamIndex = 0 | 1;
export type PlayerId = string;

/** Grows in later phases (shoot, pass, block, …). */
export type PlayerAction = 'idle' | 'run';

/**
 * One controlled player's input for one tick. Produced by input backends, AI and (later) the
 * network. `move` is a unit-or-zero vector in court space: x → court X, y → court Z.
 */
export interface PlayerIntent {
  move: Vec2;
  /** Context-sensitive: shoot / layup / dunk with the ball, block / steal / shove without. */
  action: boolean;
  pass: boolean;
  special: boolean;
  turbo: boolean;
}

export const NO_INTENT: Readonly<PlayerIntent> = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  action: false,
  pass: false,
  special: false,
  turbo: false,
});

/** Character stats × court modifier × ability, resolved to simulation units (metres, seconds). */
export interface ResolvedStats {
  runSpeed: number;
  turboSpeed: number;
  acceleration: number;
  deceleration: number;
  turboDrainPerTick: number;
  turboRegenPerTick: number;
}

export interface PlayerState {
  id: PlayerId;
  team: TeamIndex;
  characterId: string;
  pos: Vec3;
  /** Yaw in radians; facing direction is (sin(facing), 0, cos(facing)). */
  facing: number;
  vel: Vec3;
  onGround: boolean;
  action: PlayerAction;
  /** Ticks spent in the current action. */
  actionTicks: number;
  /** Turbo stamina, 0..1. */
  turbo: number;
  stats: ResolvedStats;
}

export interface TeamState {
  players: PlayerState[];
}

export type MatchPhase = 'tipoff' | 'live' | 'scored' | 'inbound' | 'paused' | 'finished';

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  holder: PlayerId | null;
}

export interface MatchSettings {
  durationMs: number;
  shotClockMs: number;
  seed: number;
  ruleIds: string[];
  courtId: string;
}

export interface MatchState {
  tick: number;
  clockMs: number;
  shotClockMs: number;
  score: [number, number];
  phase: MatchPhase;
  ball: BallState;
  teams: [TeamState, TeamState];
  rng: RngState;
  settings: MatchSettings;
}

export type SimEvent = { type: 'phaseChange'; from: MatchPhase; to: MatchPhase };

export interface HoopDef {
  /** Rim centre on the floor plane (y ignored). */
  pos: Vec3;
  rimHeight: number;
}

export interface CourtDef {
  id: string;
  name: string;
  description: string;
  playArea: { length: number; width: number };
  hoops: [HoopDef, HoopDef];
  physics: { gravity: number; friction: number; restitution: number; airDrag: number };
  lighting: {
    skyColor: number;
    sunDirection: Vec3;
    sunColor: number;
    ambient: number;
  };
}
