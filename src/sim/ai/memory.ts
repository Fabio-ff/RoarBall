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
  /** Slot in the team, 0 or 1; sets the decision phase (see cadencePhase). */
  slot: number;
  nextDecisionTick: number;
  goal: AiGoal;
  /** Defence: the opponent I am marking, and the possession the marks were assigned for. */
  markId: PlayerId | null;
  marksForPossession: TeamIndex | null;
  /** The possession at the last plan: a change forces a re-plan so teammates assign marks together. */
  lastPlannedPossession: TeamIndex | null;
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
  slot: number,
  favourTeammate: boolean,
): AiMemory {
  return {
    playerId,
    rng: createRng(hashSeed(seed, playerId)),
    slot,
    nextDecisionTick: cadencePhase(slot),
    goal: { kind: 'idle' },
    markId: null,
    marksForPossession: null,
    lastPlannedPossession: null,
    laneClosedCount: 0,
    lastInviteTick: NEVER_TICK,
    pressedLastTick: false,
    passedLastTick: false,
    lastPhase: 'tipoff',
    favourTeammate,
  };
}

/** Ticks between two plans (spec §6: 10 Hz at 60 Hz). */
export const DECISION_INTERVAL_TICKS = 6;

/**
 * The tick of the 6-tick cycle on which the brain in `slot` (0 or 1: the player's index within
 * its team) plans, spec §6: slot 0 on phase 0, slot 1 half a cycle later (phase = slot * 3). Both
 * teams share the same two phases. Staggering by the raw roster index (0, 1 | 2, 3) made one team
 * always re-plan two ticks before the other, which alone won 62 % of mirrored games for team 0.
 */
export function cadencePhase(slot: number): number {
  return slot * (DECISION_INTERVAL_TICKS / 2);
}

/**
 * The first tick at or after `from` on this brain's phase of the match clock. The phase is
 * absolute, not counted from the last reset, so a team's brains do not re-plan in a fixed order
 * after every inbound either.
 */
export function nextCadenceTick(from: number, slot: number): number {
  const phase = cadencePhase(slot);
  const behind =
    (((from - phase) % DECISION_INTERVAL_TICKS) + DECISION_INTERVAL_TICKS) %
    DECISION_INTERVAL_TICKS;
  return behind === 0 ? from : from + DECISION_INTERVAL_TICKS - behind;
}

/** Forgets goals and marks (not the RNG); the next cadence plan is the brain's next phase tick. */
export function resetAiMemory(memory: AiMemory, tick: number): void {
  memory.nextDecisionTick = nextCadenceTick(tick, memory.slot);
  memory.goal = { kind: 'idle' };
  memory.markId = null;
  memory.marksForPossession = null;
  memory.lastPlannedPossession = null;
  memory.laneClosedCount = 0;
  memory.lastInviteTick = NEVER_TICK;
  memory.pressedLastTick = false;
  memory.passedLastTick = false;
}
