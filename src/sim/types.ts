import type { CourtModifier } from './hooks';
import type { Vec2, Vec3 } from './math';
import type { RngState } from './rng';

export type TeamIndex = 0 | 1;
export type PlayerId = string;
export type HoopIndex = 0 | 1;

export type PlayerAction =
  | 'idle'
  | 'run'
  | 'jump'
  | 'shoot'
  | 'layup'
  | 'dunk'
  | 'pass'
  | 'block'
  | 'steal'
  | 'shove'
  | 'stunned'
  | 'getup';
export type ShotType = 'jumpshot' | 'layup' | 'dunk';
/** Actions during which input is ignored (spec §4.4: the shooter is animation-locked). */
export const SHOT_ACTIONS: ReadonlySet<PlayerAction> = new Set<PlayerAction>([
  'shoot',
  'layup',
  'dunk',
]);
/** Actions during which input is ignored (shots, passes, defensive moves, being knocked down). */
export const LOCKED_ACTIONS: ReadonlySet<PlayerAction> = new Set<PlayerAction>([
  'shoot',
  'layup',
  'dunk',
  'pass',
  'block',
  'steal',
  'shove',
  'stunned',
  'getup',
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

/** Spec §5.1: seven stats, each 1..10. */
export interface CharacterStats {
  speed: number;
  jump: number;
  shooting: number;
  dunking: number;
  defense: number;
  power: number;
  stamina: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  description: string;
  stats: CharacterStats;
  /** Signature ability, implemented in phase 5. */
  abilityId: string;
  appearance: { primaryColor: number; secondaryColor: number };
}

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
  /** Raw 1..10 stats that defensive formulas read directly. */
  defense: number;
  power: number;
  /** Extra dunk range in metres (dunking stat). */
  dunkRangeBonus: number;
  /** Reach of a steal attempt and of a block, metres. */
  stealReach: number;
  blockReach: number;
  /** Base chance of a steal before the holder's power is subtracted. */
  stealChance: number;
  /** Stun ticks a shove deals, and ticks of stun this player shrugs off. */
  stunTicksDealt: number;
  stunResistTicks: number;
  /** Spec D.2 ability flags: false unless an active ability sets them. Rocket Dunk: a shot press inside the 3-point line is a dunk. */
  dunkFromArc: boolean;
  /** Rocket Dunk: tryBlockShot ignores this player's dunks. */
  unblockableDunk: boolean;
  /** Blur: a steal that reaches the holder always succeeds (the draw is still taken). */
  stealAlwaysSucceeds: boolean;
  /** Blur: turbo never drains. */
  unlimitedTurbo: boolean;
}

export interface ShotInProgress {
  type: ShotType;
  hoop: HoopIndex;
  /** Horizontal speed at the press, before any wind-up damping; drives the motion penalty. */
  approachSpeed: number;
}

/** Spec D.2: a signature ability in progress. */
export interface ActiveAbility {
  /** Ticks left before it ends; null = no timer (it ends when `uses` reaches 0). */
  ticksLeft: number | null;
  /** Shots that cannot miss (Hot Hand, spec D.3); 0 for every other ability. */
  uses: number;
}

/** The last pass this player caught from a teammate: the assist window (spec D.2). */
export interface LastCatch {
  from: PlayerId;
  tick: number;
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
  /** Ticks left before each defensive move can be used again. */
  cooldowns: { block: number; steal: number; shove: number };
  /** Length of the current stun, set by a shove. */
  stunTicks: number;
  /** Ticks left after getting up during which this player cannot be shoved again (spec B.4). */
  shoveImmunityTicks: number;
  /** Set by PASS without the ball; controllers read it (spec B.3). */
  callingForPassTicks: number;
  /** The player a pass, steal or shove is aimed at. */
  targetId: PlayerId | null;
  /** Derived every tick (spec D.2): baseStats × court modifier × active ability. */
  stats: ResolvedStats;
  /** Resolved once from the character; `stats` is rebuilt from it at the start of every tick. */
  baseStats: ResolvedStats;
  /** The character's signature ability, or null (placeholders). */
  abilityId: string | null;
  /** Ability charge, 0..100; a full bar plus SPECIAL activates (spec D.2). */
  charge: number;
  ability: ActiveAbility | null;
  lastCatch: LastCatch | null;
}

export interface TeamState {
  players: PlayerState[];
}

export type MatchPhase = 'tipoff' | 'live' | 'scored' | 'inbound' | 'paused' | 'finished';

export type BallMode = 'held' | 'flight' | 'free';
export type MissType = 'frontRim' | 'backRim' | 'sideRim' | 'board';

/** A scripted ballistic path (spec A.4): the ball follows it exactly until totalTicks elapse. */
export interface ShotFlight {
  kind: 'shot' | 'pass';
  from: Vec3;
  velocity: Vec3;
  totalTicks: number;
  elapsedTicks: number;
  /** Passes: who threw it (null for shots), who it is for, whether it is an alley-oop lob, and the passing team. */
  passer: PlayerId | null;
  receiver: PlayerId | null;
  lob: boolean;
  team: TeamIndex;
  /** Spec D.4: sideways bow amplitude of a shot released in a gust (sin-shaped, zero at both ends); null otherwise. */
  bow: Vec3 | null;
}

/** The shot the loose ball came from; cleared on any pickup and after a basket. */
export interface LastShot {
  shooter: PlayerId;
  team: TeamIndex;
  /** The hoop it was aimed at: only this hoop can count a basket for it. */
  hoop: HoopIndex;
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
  /** Ticks the ball has been free and untouched. */
  freeTicks: number;
  /** Contact flags so resting on the rim or board reports one hit (rising edge). */
  touchingRim: boolean;
  touchingBoard: boolean;
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

/** Plain, JSON-safe state owned by the court's modifier (spec D.2); `{}` when there is none. */
export type CourtState = Record<string, unknown>;

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
  /** The clock hit zero with a shot in the air: the buzzer waits for it (spec B.5). */
  buzzerPending: boolean;
  ball: BallState;
  teams: [TeamState, TeamState];
  rng: RngState;
  settings: MatchSettings;
  courtState: CourtState;
}

export type SimEvent =
  | { type: 'phaseChange'; from: MatchPhase; to: MatchPhase }
  | {
      type: 'shotReleased';
      playerId: PlayerId;
      shotType: ShotType;
      quality: number;
      made: boolean;
      /** How a miss was scripted to miss; null for makes. */
      missType: MissType | null;
      points: 2 | 3;
    }
  | { type: 'basket'; playerId: PlayerId; team: TeamIndex; points: 2 | 3; shotType: ShotType }
  | { type: 'rimHit' }
  | { type: 'boardHit' }
  | { type: 'bounce'; speed: number }
  | { type: 'pickup'; playerId: PlayerId }
  | { type: 'possessionChange'; team: TeamIndex }
  | { type: 'shotClockViolation'; team: TeamIndex }
  | { type: 'pass'; from: PlayerId; to: PlayerId; lob: boolean }
  | { type: 'catch'; playerId: PlayerId }
  | { type: 'intercept'; playerId: PlayerId }
  | { type: 'alleyOop'; playerId: PlayerId }
  | { type: 'block'; by: PlayerId; shooter: PlayerId }
  | { type: 'steal'; by: PlayerId; from: PlayerId }
  | { type: 'stealFailed'; by: PlayerId }
  | { type: 'shove'; by: PlayerId; target: PlayerId }
  | { type: 'abilityActivated'; playerId: PlayerId; abilityId: string }
  | { type: 'abilityEnded'; playerId: PlayerId; abilityId: string }
  | { type: 'knockdown'; by: PlayerId; target: PlayerId }
  | { type: 'gustStart'; dir: Vec3 }
  | { type: 'gustEnd' };

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
  /** Spec §7.1 / D.4: the court's light gameplay modifier (none on the gym). */
  modifier?: CourtModifier;
}
