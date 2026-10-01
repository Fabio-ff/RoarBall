import { hoopGeometry, nearestHoopIndex } from '../sim/hoop';
import { findPlayer } from '../sim/match';
import { ALLEY_OOP_RANGE } from '../sim/passing';
import { v3DistanceXZ, type Vec3 } from '../sim/math';
import {
  NO_INTENT,
  type CourtDef,
  type MatchState,
  type PlayerId,
  type PlayerIntent,
  type PlayerState,
} from '../sim/types';

/** One intent per tick from the match state. Humans wrap InputManager; AI arrives in phase 4. */
export type Controller = (state: MatchState) => PlayerIntent;

const ARRIVE_RADIUS = 0.5;
const WING_BACK = 5;
const WING_SIDE = 4;
const KEY_BACK = 2.5;
const TEAMMATE_HOLD_TICKS = 60;
const DEFENDER_BLOCK_RANGE = 2.5;
const DEFENDER_BLOCK_EVERY_TICKS = 120;
/** A handler this close gets an unprovoked jump; further out the dummy waits for the shot. */
const DEFENDER_JUMP_RANGE = 1.6;

function stepTowards(player: PlayerState, spot: Vec3): PlayerIntent['move'] {
  const dx = spot.x - player.pos.x;
  const dz = spot.z - player.pos.z;
  const d = Math.hypot(dx, dz);
  if (d <= ARRIVE_RADIUS) return { x: 0, y: 0 };
  return { x: dx / d, y: dz / d };
}

/** The hoop the human is working on: the nearer one in shootaround. */
function humanHoop(state: MatchState, human: PlayerState, court: CourtDef) {
  return hoopGeometry(court, nearestHoopIndex(court, human.pos));
}

/** Spec B.1 teammate: wing spot, pass back after a second, at once when called, lob when the human is up at the rim. */
export function teammateDummy(id: PlayerId, humanId: PlayerId, court: CourtDef): Controller {
  let heldTicks = 0;
  let passedLastTick = false;
  return (state) => {
    const me = findPlayer(state, id);
    const human = findPlayer(state, humanId);
    if (!me || !human) return NO_INTENT;
    const hoop = humanHoop(state, human, court);
    const spot = {
      x: hoop.rimCenter.x - hoop.side * WING_BACK,
      y: 0,
      z: hoop.rimCenter.z + WING_SIDE,
    };
    const holding = state.ball.holder === id;
    // Plant the feet while the human winds up a pass or one is inbound, so the pass lead (extrapolated
    // from our velocity at release) lands on us instead of overshooting.
    const catching =
      human.action === 'pass' ||
      (state.ball.flight?.kind === 'pass' && state.ball.flight.receiver === id);
    heldTicks = holding ? heldTicks + 1 : 0;
    const humanUpAtRim =
      !human.onGround && v3DistanceXZ(human.pos, hoop.rimCenter) <= ALLEY_OOP_RANGE;
    const wantsPass =
      holding &&
      !passedLastTick &&
      (heldTicks >= TEAMMATE_HOLD_TICKS || human.callingForPassTicks > 0 || humanUpAtRim);
    passedLastTick = wantsPass;
    return {
      ...NO_INTENT,
      move: holding || catching ? { x: 0, y: 0 } : stepTowards(me, spot),
      pass: wantsPass,
    };
  };
}

/** Spec B.1 defender: stands in the key, raises for a block when the handler comes close. */
export function defenderDummy(id: PlayerId, humanId: PlayerId, court: CourtDef): Controller {
  let lastBlockTick = -Infinity;
  return (state) => {
    const me = findPlayer(state, id);
    const human = findPlayer(state, humanId);
    if (!me || !human) return NO_INTENT;
    const hoop = humanHoop(state, human, court);
    const spot = { x: hoop.rimCenter.x - hoop.side * KEY_BACK, y: 0, z: hoop.rimCenter.z };
    const handlerClose =
      state.ball.holder === humanId && v3DistanceXZ(human.pos, me.pos) <= DEFENDER_BLOCK_RANGE;
    const handlerOnTop = handlerClose && v3DistanceXZ(human.pos, me.pos) <= DEFENDER_JUMP_RANGE;
    // A shot in reach is what the sim's block needs (B.4); a bare approach only earns a jump.
    const handlerShooting = handlerClose && (human.action === 'shoot' || human.action === 'layup');
    const block =
      me.onGround &&
      (handlerShooting ||
        (handlerOnTop && state.tick - lastBlockTick >= DEFENDER_BLOCK_EVERY_TICKS));
    if (block) lastBlockTick = state.tick;
    return { ...NO_INTENT, move: stepTowards(me, spot), action: block };
  };
}
