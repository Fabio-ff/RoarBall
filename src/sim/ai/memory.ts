import type { Vec3 } from '../math';
import { createRng, type RngState } from '../rng';
import type { MatchPhase, PlayerId, TeamIndex } from '../types';
import type { SpotName } from './spots';

/** Finite "long ago" tick: -Infinity would serialise to null in JSON. */
export const NEVER_TICK = -1_000_000;

/** What a brain is currently trying to do; re-planned every DECISION_INTERVAL_TICKS. */
export type AiGoal =
  | { kind: 'idle' }
  | { kind: 'moveTo'; spot: Vec3; name: SpotName | null }
  | { kind: 'drive'; sideStep: Vec3 | null }
  | { kind: 'shoot' }
  | { kind: 'pass' }
  | { kind: 'chase' }
  | { kind: 'mark'; markId: PlayerId };

/**
 * Spec C.2: all of a brain's state, as plain serialisable data. No closures. Reset on the
 * phase change to inbound/tipoff; the RNG stream is kept so a match stays reproducible.
 */
export interface AiMemory {
  playerId: PlayerId;
  /** Private RNG: the brain never touches state.rng (spec §4.10). */
  rng: RngState;
  /** Decision cadence offset so the brains do not all plan on the same tick. */
  offset: number;
  nextDecisionTick: number;
  goal: AiGoal;
  /** Defence: the opponent I am marking, and the possession the marks were assigned for. */
  markId: PlayerId | null;
  marksForPossession: TeamIndex | null;
  /** Offense: consecutive decisions with the driving lane closed (C.5 step 7). */
  laneClosedCount: number;
  /** Off ball: tick of the last alley-oop invite jump. */
  lastInviteTick: number;
  /** One-tick presses: true when the button was emitted last tick (forced false next). */
  pressedLastTick: boolean;
  passedLastTick: boolean;
  lastPhase: MatchPhase;
  /** The teammate brain favours passing to the human (passBias − 0.15, spec C.3). */
  favourTeammate: boolean;
}

/** FNV-1a over `${seed}:${playerId}` so each player gets its own stream from the match seed. */
export function hashSeed(seed: number, playerId: PlayerId): number {
  const text = `${seed >>> 0}:${playerId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function createAiMemory(
  playerId: PlayerId,
  seed: number,
  offset: number,
  favourTeammate: boolean,
): AiMemory {
  return {
    playerId,
    rng: createRng(hashSeed(seed, playerId)),
    offset,
    nextDecisionTick: offset,
    goal: { kind: 'idle' },
    markId: null,
    marksForPossession: null,
    laneClosedCount: 0,
    lastInviteTick: NEVER_TICK,
    pressedLastTick: false,
    passedLastTick: false,
    lastPhase: 'tipoff',
    favourTeammate,
  };
}

/** Forgets goals and marks (not the RNG); the next plan happens `offset` ticks after `tick`. */
export function resetAiMemory(memory: AiMemory, tick: number): void {
  memory.nextDecisionTick = tick + memory.offset;
  memory.goal = { kind: 'idle' };
  memory.markId = null;
  memory.marksForPossession = null;
  memory.laneClosedCount = 0;
  memory.lastInviteTick = NEVER_TICK;
  memory.pressedLastTick = false;
  memory.passedLastTick = false;
}
