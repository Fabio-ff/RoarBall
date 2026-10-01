import { movingAway, nearestOpponent, resolveDefensivePress } from '../defence';
import { hoopGeometry } from '../hoop';
import { clamp, v3DistanceXZ, type Vec3 } from '../math';
import { findPlayer } from '../match';
import { otherTeam } from '../phases';
import { nextFloat } from '../rng';
import { SHOT_TIMING, targetHoopIndex } from '../shooting';
import { SHOT_ACTIONS } from '../types';
import type { CourtDef, MatchState, PlayerId, PlayerState, TeamIndex } from '../types';
import type { AiGoal, AiMemory } from './memory';
import type { AiProfile } from './profile';

/** Spec C.5 "defending" numbers. */
export const MARK_GAP_WITH_BALL = 0.8;
export const MARK_GAP_MIN = 0.8;
export const MARK_GAP_MAX = 2.5;
export const MARK_GAP_FACTOR = 0.4;
/** A mark moving towards the rim faster than this is "driving" (shove candidate). */
export const DRIVE_SPEED = 3;
/** Permutation search up to this many defenders; greedy beyond. */
const PERMUTATION_LIMIT = 3;

function byId(a: PlayerState, b: PlayerState): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Spec C.5: defender → opponent, a deterministic function of the state (ids sorted), so every
 * brain on the team computes the same answer. Minimum total distance over permutations for up
 * to PERMUTATION_LIMIT defenders, greedy nearest-unassigned beyond; extra defenders (unequal
 * teams) double the nearest opponent. Ties keep the first permutation in sorted order.
 */
export function assignMarks(state: MatchState, team: TeamIndex): Map<PlayerId, PlayerId> {
  const defenders = [...state.teams[team].players].sort(byId);
  const opponents = [...state.teams[otherTeam(team)].players].sort(byId);
  const marks = new Map<PlayerId, PlayerId>();
  if (defenders.length === 0 || opponents.length === 0) return marks;
  const n = Math.min(defenders.length, opponents.length);
  const dist = (d: number, o: number): number => v3DistanceXZ(defenders[d].pos, opponents[o].pos);

  let best: number[] | null = null;
  if (defenders.length <= PERMUTATION_LIMIT) {
    let bestCost = Infinity;
    const used = new Array<boolean>(opponents.length).fill(false);
    const current: number[] = [];
    const search = (d: number, cost: number): void => {
      if (d === n) {
        if (cost < bestCost) {
          bestCost = cost;
          best = [...current];
        }
        return;
      }
      for (let o = 0; o < opponents.length; o++) {
        if (used[o]) continue;
        used[o] = true;
        current.push(o);
        search(d + 1, cost + dist(d, o));
        current.pop();
        used[o] = false;
      }
    };
    search(0, 0);
  } else {
    const used = new Array<boolean>(opponents.length).fill(false);
    best = [];
    for (let d = 0; d < n; d++) {
      let pick = -1;
      for (let o = 0; o < opponents.length; o++) {
        if (!used[o] && (pick === -1 || dist(d, o) < dist(d, pick))) pick = o;
      }
      used[pick] = true;
      best.push(pick);
    }
  }
  const assignment = best ?? [];
  for (let d = 0; d < defenders.length; d++) {
    if (d < n) {
      marks.set(defenders[d].id, opponents[assignment[d]].id);
    } else {
      let pick = 0;
      for (let o = 1; o < opponents.length; o++) if (dist(d, o) < dist(d, pick)) pick = o;
      marks.set(defenders[d].id, opponents[pick].id);
    }
  }
  return marks;
}

/** Spec C.5: on the segment mark→rim, `clamp(0.4·d, 0.8, 2.5)` from the mark (0.8 with the ball). */
export function markPosition(markPos: Vec3, rim: Vec3, markHasBall: boolean): Vec3 {
  const d = v3DistanceXZ(markPos, rim);
  let gap = markHasBall
    ? MARK_GAP_WITH_BALL
    : clamp(MARK_GAP_FACTOR * d, MARK_GAP_MIN, MARK_GAP_MAX);
  gap = Math.min(gap, d); // never past the rim
  if (d < 1e-6) return { x: rim.x, y: 0, z: rim.z };
  return {
    x: markPos.x + ((rim.x - markPos.x) / d) * gap,
    y: 0,
    z: markPos.z + ((rim.z - markPos.z) / d) * gap,
  };
}

/** Marks are assigned once per possession (spec C.5) and remembered. */
export function planDefence(state: MatchState, me: PlayerState, memory: AiMemory): AiGoal {
  if (memory.markId === null || memory.marksForPossession !== state.possession) {
    memory.markId = assignMarks(state, me.team).get(me.id) ?? null;
    memory.marksForPossession = state.possession;
  }
  return memory.markId === null ? { kind: 'idle' } : { kind: 'mark', markId: memory.markId };
}

function isDriving(player: PlayerState, rim: Vec3): boolean {
  const dx = rim.x - player.pos.x;
  const dz = rim.z - player.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  return (player.vel.x * dx + player.vel.z * dz) / len > DRIVE_SPEED;
}

/**
 * Spec C.5: press the action button only when the sim would do what I intend. Blocks are checked
 * every tick (after `reactionTicks` of the shot); steals and shoves roll on decision ticks only.
 * RNG draw order: at most one draw per decision tick, for the move that is on.
 */
export function decidePress(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
  isDecisionTick: boolean,
): boolean {
  const press = resolveDefensivePress(state, me, court);
  if (press === null || press === 'jump') return false;
  if (press === 'block') {
    const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
    if (!holder || !holder.shot || !SHOT_ACTIONS.has(holder.action)) return false; // a near-hoop holder is not worth a jump
    // A press on the release tick lands only if the sim happens to step me before the shooter
    // (team 0 first): a roster-order coin, not a reaction. Jump only while it can beat the release.
    if (holder.actionTicks >= SHOT_TIMING[holder.shot.type].releaseTick) return false;
    return holder.actionTicks >= profile.reactionTicks;
  }
  if (!isDecisionTick) return false;
  if (press === 'steal') {
    // A reach at a holder running away is a half-chance that freezes me while they blow by.
    const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
    if (holder) {
      if (movingAway(holder, me)) return false;
      const rim = hoopGeometry(court, targetHoopIndex(state, holder, court)).rimCenter;
      if (isDriving(holder, rim)) return false;
    }
    return nextFloat(memory.rng) < profile.stealRate;
  }
  // shove
  const target = nearestOpponent(state, me);
  if (!target) return false;
  const rim = hoopGeometry(court, targetHoopIndex(state, target, court)).rimCenter;
  if (!isDriving(target, rim) || me.turbo < profile.turboThreshold) return false;
  return nextFloat(memory.rng) < profile.shoveRate;
}
