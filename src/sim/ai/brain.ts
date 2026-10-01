import { arcPoint } from '../arc';
import { TICK_DT } from '../constants';
import { nearestOpponent } from '../defence';
import { hoopGeometry } from '../hoop';
import { v3DistanceXZ, type Vec3 } from '../math';
import { findPlayer } from '../match';
import { isActionLocked } from '../player-movement';
import { targetHoopIndex } from '../shooting';
import { NO_INTENT } from '../types';
import type { CourtDef, MatchState, PlayerIntent, PlayerState, ShotFlight } from '../types';
import { decidePress, markPosition, planDefence } from './defense';
import { nextCadenceTick, resetAiMemory, type AiGoal, type AiMemory } from './memory';
import { planOffBall, planRebound, shouldChase, wantsAlleyOopInvite } from './offball';
import { planWithBall } from './offense';
import type { AiProfile } from './profile';
import { steerTowards, wantsTurbo } from './steering';

/** Spec §6 / C.2: re-plan at 10 Hz, steer every tick. */
export { DECISION_INTERVAL_TICKS } from './memory';
const CHASE_ARRIVE_RADIUS = 0.1;
const DRIVE_ARRIVE_RADIUS = 0.2;

/**
 * Spec C.2: the AI's single entry point. Pure over (state, memory): reads the state, mutates only
 * `memory`, never `state` or `state.rng`. Returns this tick's intent for `memory.playerId`.
 */
export function decide(
  state: MatchState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
): PlayerIntent {
  const me = findPlayer(state, memory.playerId);
  if (!me) return NO_INTENT;
  if (state.phase !== memory.lastPhase) {
    if (state.phase === 'inbound' || state.phase === 'tipoff') resetAiMemory(memory, state.tick);
    memory.lastPhase = state.phase;
  }
  if (state.phase !== 'live' || isActionLocked(me) || !me.onGround)
    return finish(memory, NO_INTENT);

  // A possession change (or the first plan after a reset) re-plans everyone on the same tick, so
  // teammates assign marks from the same snapshot. Only the regular cadence reschedules, which
  // keeps the per-player offsets staggered.
  const cadenceTick = state.tick >= memory.nextDecisionTick;
  const isDecisionTick = cadenceTick || state.possession !== memory.lastPlannedPossession;
  if (isDecisionTick) {
    memory.goal = plan(state, me, memory, profile, court);
    if (cadenceTick) memory.nextDecisionTick = nextCadenceTick(state.tick + 1, memory.offset);
    memory.lastPlannedPossession = state.possession;
  }
  return finish(memory, act(state, me, memory, profile, court, isDecisionTick));
}

/** One-tick presses: a button emitted last tick is forced off this tick (spec C.2). */
function finish(memory: AiMemory, intent: PlayerIntent): PlayerIntent {
  const out: PlayerIntent = {
    ...intent,
    action: intent.action && !memory.pressedLastTick,
    pass: intent.pass && !memory.passedLastTick,
  };
  memory.pressedLastTick = out.action;
  memory.passedLastTick = out.pass;
  return out;
}

function plan(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
): AiGoal {
  const { ball } = state;
  const myHoop = hoopGeometry(court, targetHoopIndex(state, me, court));
  if (ball.holder === me.id) return planWithBall(state, me, memory, profile, court);
  const holder = ball.holder === null ? undefined : findPlayer(state, ball.holder);
  if (holder) {
    return holder.team === me.team
      ? planOffBall(state, me, memory, myHoop, holder.pos)
      : planDefence(state, me, memory);
  }
  if (ball.mode === 'flight' && ball.flight) {
    if (ball.flight.kind === 'shot') return planRebound(state, me, court);
    // The sim leads a pass by the receiver's velocity: run to where the arc ends, not stop dead.
    if (ball.flight.receiver === me.id)
      return { kind: 'moveTo', spot: passLanding(ball.flight, court), name: null };
    if (ball.flight.team !== me.team) return planDefence(state, me, memory);
    const receiver =
      ball.flight.receiver === null ? undefined : findPlayer(state, ball.flight.receiver);
    return planOffBall(state, me, memory, myHoop, receiver?.pos ?? ball.pos);
  }
  // Loose ball.
  if (shouldChase(state, me)) return { kind: 'chase' };
  return state.possession === null || state.possession === me.team
    ? planOffBall(state, me, memory, myHoop, ball.pos)
    : planDefence(state, me, memory);
}

/** Where a pass arc ends (XZ, on the floor): the point the sim checks the catch against. */
export function passLanding(flight: ShotFlight, court: CourtDef): Vec3 {
  const end = arcPoint(
    flight.from,
    flight.velocity,
    court.physics.gravity,
    flight.totalTicks * TICK_DT,
  );
  return { x: end.x, y: 0, z: end.z };
}

function act(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
  isDecisionTick: boolean,
): PlayerIntent {
  const goal = memory.goal;
  switch (goal.kind) {
    case 'idle':
      return NO_INTENT;
    case 'shoot':
      return state.ball.holder === me.id ? { ...NO_INTENT, action: true } : NO_INTENT;
    case 'pass':
      return state.ball.holder === me.id ? { ...NO_INTENT, pass: true } : NO_INTENT;
    case 'drive': {
      if (state.ball.holder !== me.id) return NO_INTENT;
      const rim = hoopGeometry(court, targetHoopIndex(state, me, court)).rimCenter;
      const target = goal.sideStep ?? rim;
      return {
        ...NO_INTENT,
        move: steerTowards(me.pos, target, DRIVE_ARRIVE_RADIUS),
        turbo: goal.sideStep === null && wantsTurbo(me, v3DistanceXZ(me.pos, rim), profile),
      };
    }
    case 'moveTo': {
      const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
      const invite =
        holder !== undefined &&
        holder.team === me.team &&
        holder.id !== me.id &&
        wantsAlleyOopInvite(state, me, holder, memory);
      if (invite) memory.lastInviteTick = state.tick;
      return { ...NO_INTENT, move: steerTowards(me.pos, goal.spot), action: invite };
    }
    case 'chase': {
      const d = v3DistanceXZ(me.pos, state.ball.pos);
      return {
        ...NO_INTENT,
        move: steerTowards(me.pos, state.ball.pos, CHASE_ARRIVE_RADIUS),
        turbo: wantsTurbo(me, d, profile),
      };
    }
    case 'mark': {
      const mark = findPlayer(state, goal.markId) ?? nearestOpponent(state, me);
      if (!mark) return NO_INTENT;
      const rim = hoopGeometry(court, targetHoopIndex(state, mark, court)).rimCenter;
      const target = markPosition(mark.pos, rim, state.ball.holder === mark.id);
      const d = v3DistanceXZ(me.pos, target);
      return {
        ...NO_INTENT,
        move: steerTowards(me.pos, target),
        turbo: wantsTurbo(me, d, profile),
        action: decidePress(state, me, memory, profile, court, isDecisionTick),
      };
    }
  }
}
