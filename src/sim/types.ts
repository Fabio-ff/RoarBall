import type { Vec2, Vec3 } from './math';
import type { RngState } from './rng';

export type TeamIndex = 0 | 1;
export type PlayerId = string;
export type HoopIndex = 0 | 1;

export type PlayerAction = 'idle' | 'run' | 'jump' | 'shoot' | 'layup' | 'dunk';
export type ShotType = 'jumpshot' | 'layup' | 'dunk';
/** Actions during which input is ignored (spec §4.4: the shooter is animation-locked). */
export const SHOT_ACTIONS: ReadonlySet<PlayerAction> = new Set<PlayerAction>([
  'shoot',
  'layup',
  'dunk',
]);
export const ACTION_FOR_SHOT: Readonly<Record<ShotType, PlayerAction>> = {
  jumpshot: 'shoot',
  layup: 'layup',
  dunk: 'dunk',
};

/** The four buttons, reported as held. The simulation detects presses from prevButtons (spec §8). */
export interface Buttons {
  /** Context-sensitive: shoot / layup / dunk with the ball, jump (phase 2) or block / steal / shove without. */
  action: boolean;
  pass: boolean;
  special: boolean;
  turbo: boolean;
}

export const NO_BUTTONS: Readonly<Buttons> = Object.freeze({
  action: false,
  pass: false,
  special: false,
  turbo: false,
});

/**
 * One controlled player's input for one tick. Produced by input backends, AI and (later) the
 * network. `move` is a unit-or-zero vector in court space: x → court X, y → court Z.
 */
export interface PlayerIntent extends Buttons {
  move: Vec2;
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
  /** 0..1, multiplies jump-shot quality. */
  shooting: number;
  /** Vertical speed of a plain jump, m/s. */
  jumpSpeed: number;
}

export interface ShotInProgress {
  type: ShotType;
  hoop: HoopIndex;
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
  /** Set by movement each tick: turbo was held while moving. */
  turboRequested: boolean;
  /** Set by movement each tick: turbo speed is being applied. */
  turboActive: boolean;
  /** Last tick's buttons, for edge detection. */
  prevButtons: Buttons;
  /** The shot being performed while action-locked. */
  shot: ShotInProgress | null;
  /** Ticks left during which this player cannot pick up their own shot. */
  shotCooldownTicks: number;
  stats: ResolvedStats;
}

export interface TeamState {
  players: PlayerState[];
}

export type MatchPhase = 'tipoff' | 'live' | 'scored' | 'inbound' | 'paused' | 'finished';

export type BallMode = 'held' | 'flight' | 'free';
export type MissType = 'frontRim' | 'backRim' | 'sideRim' | 'board';

/** A scripted ballistic path (spec A.4): the ball follows it exactly until totalTicks elapse. */
export interface ShotFlight {
  from: Vec3;
  velocity: Vec3;
  totalTicks: number;
  elapsedTicks: number;
}

export interface LastShot {
  shooter: PlayerId;
  team: TeamIndex;
  shotType: ShotType;
  points: 2 | 3;
  made: boolean;
}

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  radius: number;
  mode: BallMode;
  holder: PlayerId | null;
  flight: ShotFlight | null;
  lastShot: LastShot | null;
}

export type MatchMode = 'match' | 'shootaround';

export interface MatchSettings {
  durationMs: number;
  shotClockMs: number;
  seed: number;
  ruleIds: string[];
  courtId: string;
  mode: MatchMode;
}

export interface MatchState {
  tick: number;
  clockMs: number;
  shotClockMs: number;
  score: [number, number];
  phase: MatchPhase;
  /** Ticks spent in the current phase. */
  phaseTicks: number;
  possession: TeamIndex | null;
  /** Team that receives the ball at the next inbound. */
  pendingInbound: TeamIndex | null;
  /** Sudden death: the next basket ends the match. */
  overtime: boolean;
  ball: BallState;
  teams: [TeamState, TeamState];
  rng: RngState;
  settings: MatchSettings;
}

export type SimEvent =
  | { type: 'phaseChange'; from: MatchPhase; to: MatchPhase }
  | {
      type: 'shotReleased';
      playerId: PlayerId;
      shotType: ShotType;
      quality: number;
      made: boolean;
      points: 2 | 3;
    }
  | { type: 'basket'; playerId: PlayerId; team: TeamIndex; points: 2 | 3; shotType: ShotType }
  | { type: 'rimHit' }
  | { type: 'boardHit' }
  | { type: 'bounce'; speed: number }
  | { type: 'pickup'; playerId: PlayerId }
  | { type: 'possessionChange'; team: TeamIndex }
  | { type: 'shotClockViolation'; team: TeamIndex };

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
