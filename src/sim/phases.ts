import { giveBall } from './ball';
import { TICK_MS } from './constants';
import { attackingHoopIndex, hoopGeometry } from './hoop';
import type { Vec3 } from './math';
import { nextInt } from './rng';
import type { BasketInfo } from './shooting';
import type {
  CourtDef,
  HoopIndex,
  MatchPhase,
  MatchState,
  PlayerState,
  SimEvent,
  TeamIndex,
} from './types';

/** Spec A.5: 1.5 s celebration before the inbound. */
export const SCORED_PAUSE_TICKS = 90;
/** Spec A.5: a loose ball nobody reaches for 6 s is inbounded. */
export const LOOSE_BALL_TIMEOUT_TICKS = 360;
const INBOUND_FROM_BASELINE = 1.5;
const SHOOTAROUND_FROM_RIM = 6;

export function setPhase(state: MatchState, to: MatchPhase, events: SimEvent[]): void {
  if (state.phase === to) return;
  events.push({ type: 'phaseChange', from: state.phase, to });
  state.phase = to;
  state.phaseTicks = 0;
}

/** Match: the scored-on team. Shootaround: always team 0 (spec B.1), whoever scored. */
export function receivingTeam(state: MatchState, scoringTeam: TeamIndex): TeamIndex {
  if (state.settings.mode === 'shootaround') return 0;
  return scoringTeam === 0 ? 1 : 0;
}

export function otherTeam(team: TeamIndex): TeamIndex {
  return team === 0 ? 1 : 0;
}

/** Own baseline, centred (team 0 lives on -X). */
export function inboundPosition(court: CourtDef, team: TeamIndex): Vec3 {
  const side = team === 0 ? -1 : 1;
  return { x: side * (court.playArea.length / 2 - INBOUND_FROM_BASELINE), y: 0, z: 0 };
}

/** Top of the key of the given hoop, for shootaround resets. */
export function shootaroundPosition(court: CourtDef, hoop: HoopIndex): Vec3 {
  const g = hoopGeometry(court, hoop);
  return { x: g.rimCenter.x - g.side * SHOOTAROUND_FROM_RIM, y: 0, z: g.rimCenter.z };
}

const FORMATION_WING_SIDE = 4;
/** Top of the key: 5.8 m from the rim towards centre court. */
const FORMATION_KEY_BACK = 5.8;
const FORMATION_KEY_SIDE = 1.5;

function firstPlayer(state: MatchState, team: TeamIndex): PlayerState | undefined {
  return state.teams[team].players[0] ?? state.teams[otherTeam(team)].players[0];
}

function resetForInbound(player: PlayerState, pos: Vec3): void {
  player.pos = { ...pos };
  player.vel = { x: 0, y: 0, z: 0 };
  player.onGround = true;
  player.action = 'idle';
  player.actionTicks = 0;
  player.shot = null;
  // Face centre court along X.
  player.facing = pos.x < 0 ? Math.PI / 2 : -Math.PI / 2;
}

/**
 * Spec C.6 (match mode): a possession starts in formation — the receiver at their baseline,
 * their teammates on the own-half wings, the defenders at the top of the key of the hoop they
 * defend (the one `team` attacks). Resets actions; does not touch the ball.
 */
export function placeFormation(state: MatchState, court: CourtDef, team: TeamIndex): void {
  const side = team === 0 ? -1 : 1;
  const defended = hoopGeometry(court, attackingHoopIndex(court, team));
  state.teams[team].players.forEach((p, i) => {
    const pos =
      i === 0
        ? inboundPosition(court, team)
        : {
            x: side * (court.playArea.length / 4 + Math.floor((i - 1) / 2) * 2),
            y: 0,
            z: (i % 2 === 1 ? 1 : -1) * FORMATION_WING_SIDE,
          };
    resetForInbound(p, pos);
  });
  state.teams[otherTeam(team)].players.forEach((p, i) => {
    resetForInbound(p, {
      x: defended.rimCenter.x - defended.side * FORMATION_KEY_BACK,
      y: 0,
      z: (i % 2 === 0 ? -1 : 1) * FORMATION_KEY_SIDE * (Math.floor(i / 2) + 1),
    });
  });
}

/** Places the receiver and hands them the ball; the phase becomes live with a fresh shot clock. */
export function inbound(state: MatchState, court: CourtDef, events: SimEvent[]): void {
  const team = state.pendingInbound ?? 0;
  state.pendingInbound = null;
  const receiver = firstPlayer(state, team);
  if (receiver) {
    if (state.settings.mode === 'shootaround') {
      // Back to the top of the key of the hoop the ball is under (the one just scored on).
      resetForInbound(receiver, shootaroundPosition(court, hoopNearest(court, state.ball.pos)));
    } else {
      placeFormation(state, court, team);
    }
    giveBall(state, receiver, events);
  } else {
    state.ball.mode = 'free';
    state.ball.holder = null;
    state.ball.pos = { x: 0, y: state.ball.radius, z: 0 };
    state.ball.vel = { x: 0, y: 0, z: 0 };
    state.ball.freeTicks = 0;
  }
  state.shotClockMs = state.settings.shotClockMs;
  setPhase(state, 'live', events);
}

function hoopNearest(court: CourtDef, pos: Vec3): HoopIndex {
  const d0 = Math.hypot(pos.x - court.hoops[0].pos.x, pos.z - court.hoops[0].pos.z);
  const d1 = Math.hypot(pos.x - court.hoops[1].pos.x, pos.z - court.hoops[1].pos.z);
  return d0 <= d1 ? 0 : 1;
}

/** Spec A.5: a seeded random team gets the ball (team 0 in shootaround); live immediately. */
export function handleTipoff(state: MatchState, court: CourtDef, events: SimEvent[]): void {
  const team: TeamIndex =
    state.settings.mode === 'shootaround' ? 0 : (nextInt(state.rng, 2) as TeamIndex);
  const receiver = firstPlayer(state, team);
  if (state.settings.mode === 'match') placeFormation(state, court, team);
  if (receiver) giveBall(state, receiver, events);
  state.shotClockMs = state.settings.shotClockMs;
  setPhase(state, 'live', events);
}

/** Spec §4.2 step 8: scoring and phase transitions. */
export function stepPhases(
  state: MatchState,
  court: CourtDef,
  events: SimEvent[],
  basket: BasketInfo | null,
): void {
  switch (state.phase) {
    case 'tipoff':
      handleTipoff(state, court, events);
      return;
    case 'live':
      if (state.ball.mode === 'free' && state.ball.freeTicks >= LOOSE_BALL_TIMEOUT_TICKS) {
        state.pendingInbound = state.settings.mode === 'shootaround' ? 0 : (state.possession ?? 0);
        setPhase(state, 'inbound', events);
        return;
      }
      if (basket) {
        state.score[basket.team] += basket.points;
        events.push({
          type: 'basket',
          playerId: basket.shooter,
          team: basket.team,
          points: basket.points,
          shotType: basket.shotType,
        });
        if (state.overtime || state.buzzerPending) {
          if (finishOrOvertime(state, events)) return;
        }
        state.pendingInbound = receivingTeam(state, basket.team);
        setPhase(state, 'scored', events);
      }
      return;
    case 'scored':
      if (state.phaseTicks >= SCORED_PAUSE_TICKS) setPhase(state, 'inbound', events);
      return;
    case 'inbound':
      inbound(state, court, events);
      return;
    default:
      return;
  }
}

/** Spec §4.2 step 9: match clock (match mode only) and shot clock. */
export function stepClocks(state: MatchState, events: SimEvent[], rimHitThisTick: boolean): void {
  if (state.phase !== 'live') return;
  if (rimHitThisTick) state.shotClockMs = state.settings.shotClockMs;
  else state.shotClockMs = Math.max(0, state.shotClockMs - TICK_MS);

  if (state.settings.mode !== 'match' || state.overtime) return;
  if (state.buzzerPending) {
    // Spec B.5: the buzzer waits for a shot already in the air.
    if (!shotInFlight(state)) finishOrOvertime(state, events);
    return;
  }
  state.clockMs = Math.max(0, state.clockMs - TICK_MS);
  if (state.clockMs === 0) {
    if (shotInFlight(state)) state.buzzerPending = true;
    else finishOrOvertime(state, events);
  }
}

/** Ends regulation: a tie goes to sudden death, otherwise the match is over. True when finished. */
export function finishOrOvertime(state: MatchState, events: SimEvent[]): boolean {
  state.buzzerPending = false;
  if (state.score[0] === state.score[1]) {
    state.overtime = true;
    return false;
  }
  setPhase(state, 'finished', events);
  return true;
}

/**
 * Spec B.5: the buzzer waits for a *scripted* shot flight only. A miss hands over to free physics
 * just before the rim, so a lucky bounce-in after the buzzer does not count.
 */
function shotInFlight(state: MatchState): boolean {
  return (
    state.ball.mode === 'flight' &&
    state.ball.flight?.kind === 'shot' &&
    state.ball.lastShot !== null
  );
}
