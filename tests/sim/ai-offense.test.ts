import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { decide, passLanding } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import {
  INVITE_AT_SPOT_RADIUS,
  INVITE_EVERY_TICKS,
  planOffBall,
  planRebound,
  shouldChase,
  wantsAlleyOopInvite,
} from '../../src/sim/ai/offball';
import { laneBlocker, perceive, planWithBall, sideStepPoint } from '../../src/sim/ai/offense';
import { AI_PROFILES, type AiProfile } from '../../src/sim/ai/profile';
import { namedSpot } from '../../src/sim/ai/spots';
import { v3DistanceXZ } from '../../src/sim/math';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { startJump } from '../../src/sim/player-movement';
import { evaluateShot } from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import { NO_INTENT } from '../../src/sim/types';
import type { MatchSettings, MatchState, PlayerState, SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const matchSettings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function live(seed = 1): MatchState {
  const s = createMatch({ ...matchSettings, seed }, court, roster);
  s.phase = 'live';
  s.possession = 0;
  return s;
}

function player(state: MatchState, id: string): PlayerState {
  const p = findPlayer(state, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(state: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(state, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

const hoop = hoopGeometry(court, 1);
const rim = hoop.rimCenter;
/** Noise-free fair profile so plans are a pure function of the geometry. */
const exact: AiProfile = { ...AI_PROFILES.fair, perceptionNoise: 0 };

/** Holder at `distance` m from the rim along the lane; teammate and opponents parked far away. */
function holderAt(distance: number, holderId = 'home1'): { s: MatchState; me: PlayerState } {
  const s = live();
  const me = place(s, holderId, rim.x - distance, 0);
  place(s, holderId === 'home1' ? 'home2' : 'home1', rim.x - 9, 6);
  place(s, 'away1', -10, -6);
  place(s, 'away2', -10, 6);
  giveBall(s, me, []);
  return { s, me };
}

describe('perceive', () => {
  it('draws exactly once and stays within the noise band', () => {
    const m = createAiMemory('home1', 3, 0, false);
    const before = m.rng.seed;
    const q = perceive(0.5, m, AI_PROFILES.easy);
    expect(m.rng.seed).not.toBe(before);
    expect(Math.abs(q - 0.5)).toBeLessThanOrEqual(0.15 + 1e-9);
    expect(perceive(0.5, m, exact)).toBe(0.5);
  });
});

describe('planWithBall', () => {
  it('panics under 3 s: shoots a weak but possible shot', () => {
    const { s, me } = holderAt(9);
    s.shotClockMs = 2000;
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'shoot' });
  });

  it('panics under 3 s: passes a hopeless shot when the lane is open, else shoots anyway', () => {
    const { s, me } = holderAt(13);
    s.shotClockMs = 2000;
    place(s, 'away1', rim.x - 12.6, 0); // on top of the shooter: quality collapses
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'pass' });
    // An opponent a quarter of the way along the lane (1.8 m out, past the 1 m release shield,
    // where the pass is still low) closes it.
    const mate = player(s, 'home2');
    place(
      s,
      'away2',
      me.pos.x + 0.25 * (mate.pos.x - me.pos.x),
      me.pos.z + 0.25 * (mate.pos.z - me.pos.z),
    );
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'shoot' });
  });

  it('lobs to a teammate who is airborne at the rim', () => {
    const { s, me } = holderAt(7);
    const mate = place(s, 'home2', rim.x - 1.5, 1);
    startJump(mate, 4);
    mate.pos.y = 0.5;
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'pass' });
  });

  it('honours a call for the ball when the lane is open, not when it is closed', () => {
    const { s, me } = holderAt(9);
    const mate = player(s, 'home2');
    mate.callingForPassTicks = 30;
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'pass' });
    // An opponent a quarter of the way along the lane (1.5 m out, past the 1 m release shield,
    // where the pass is still low) closes it.
    place(
      s,
      'away1',
      me.pos.x + 0.25 * (mate.pos.x - me.pos.x),
      me.pos.z + 0.25 * (mate.pos.z - me.pos.z),
    );
    expect(planWithBall(s, me, m, exact, court).kind).not.toBe('pass');
  });

  it('takes a layup at once unless an opponent is airborne next to me', () => {
    const { s, me } = holderAt(2.2);
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'shoot' });
    const d = place(s, 'away1', rim.x - 3, 0.5);
    startJump(d, 4);
    d.pos.y = 0.4;
    expect(planWithBall(s, me, m, { ...exact, shootThreshold: 0.99 }, court).kind).not.toBe(
      'shoot',
    );
  });

  it('shoots above the threshold and drives below it', () => {
    const { s, me } = holderAt(4, 'home2'); // Ace, open, mid-range
    const m = createAiMemory('home2', 1, 0, false);
    m.laneClosedCount = 2;
    expect(planWithBall(s, me, m, { ...exact, shootThreshold: 0.3 }, court)).toEqual({
      kind: 'shoot',
    });
    expect(m.laneClosedCount).toBe(0); // only consecutive drive decisions extend the streak
    expect(planWithBall(s, me, m, { ...exact, shootThreshold: 0.99, passBias: 9 }, court)).toEqual({
      kind: 'drive',
      sideStep: null,
    });
  });

  it('passes when the teammate has the clearly better shot', () => {
    const { s, me } = holderAt(9);
    place(s, 'home2', rim.x - 2.2, 0.5); // open layup
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, { ...exact, shootThreshold: 0.99 }, court)).toEqual({
      kind: 'pass',
    });
  });

  it('the teammate brain favours the human: passes on a marginally better shot', () => {
    const { s, me } = holderAt(5, 'home2');
    const mine = evaluateShot(s, me, court).quality;
    // Walk the human (a worse shooter than Ace) in from the arc until their jump shot is between
    // mine − 0.05 and mine + 0.10: the plain bias (0.10) refuses the pass, the teammate bias
    // (0.10 − 0.15 = −0.05) takes it. Stay beyond layup range so only the human's distance moves.
    let placed = false;
    for (let d = 6; d >= 2.6 && !placed; d -= 0.1) {
      const theirs = evaluateShot(s, place(s, 'home1', rim.x - d, 0.3), court).quality;
      placed = theirs > mine - 0.04 && theirs < mine + 0.09;
    }
    expect(placed).toBe(true);
    const noShoot = { ...exact, shootThreshold: 0.99 };
    const plain = createAiMemory('home2', 1, 0, false);
    const favouring = createAiMemory('home2', 1, 0, true);
    expect(planWithBall(s, me, plain, noShoot, court).kind).toBe('drive');
    expect(planWithBall(s, me, favouring, noShoot, court)).toEqual({ kind: 'pass' });
  });

  it('side-steps around a lane blocker, away from them, and resets after three closed decisions', () => {
    const { s, me } = holderAt(9);
    const blocker = place(s, 'away1', rim.x - 7, 0.6); // 2 m ahead, a little to +Z
    expect(laneBlocker(me, rim, [blocker])).toBe(blocker);
    const step = sideStepPoint(me, rim, blocker);
    expect(step.z).toBeLessThan(me.pos.z); // away from the blocker (−Z)
    expect(Math.abs(step.z - me.pos.z)).toBeCloseTo(2, 1);
    const m = createAiMemory('home1', 1, 0, false);
    const noShoot = { ...exact, shootThreshold: 0.99, passBias: 9 };
    s.shotClockMs = 10_000;
    const first = planWithBall(s, me, m, noShoot, court);
    expect(first.kind).toBe('drive');
    expect(first.kind === 'drive' && first.sideStep !== null).toBe(true);
    expect(planWithBall(s, me, m, noShoot, court).kind).toBe('drive');
    const third = planWithBall(s, me, m, noShoot, court);
    expect(third.kind).toBe('moveTo');
    expect(m.laneClosedCount).toBe(0);
    // Under 6 s there is no reset: keep driving.
    s.shotClockMs = 5000;
    m.laneClosedCount = 5;
    expect(planWithBall(s, me, m, noShoot, court).kind).toBe('drive');
  });

  it('no blocker when the opponent is behind me or off the lane', () => {
    const { s, me } = holderAt(6);
    const behind = place(s, 'away1', rim.x - 8, 0);
    const wide = place(s, 'away2', rim.x - 3, 2);
    expect(laneBlocker(me, rim, [behind, wide])).toBeNull();
  });
});

describe('off ball', () => {
  it('moves to an open spot off the drive lane', () => {
    const s = live();
    const handler = place(s, 'home1', rim.x - 7, 0);
    giveBall(s, handler, []);
    const me = place(s, 'home2', rim.x - 9, 6);
    place(s, 'away1', namedSpot(hoop, 'rightWing').x, namedSpot(hoop, 'rightWing').z);
    place(s, 'away2', namedSpot(hoop, 'rightCorner').x, namedSpot(hoop, 'rightCorner').z);
    const m = createAiMemory('home2', 1, 0, true);
    const goal = planOffBall(s, me, m, hoop, handler.pos);
    expect(goal.kind).toBe('moveTo');
    if (goal.kind === 'moveTo') {
      expect(goal.spot.z).toBeLessThan(0);
      expect(goal.name).not.toBeNull();
      // Re-planning keeps the spot (hysteresis).
      m.goal = goal;
      expect(planOffBall(s, me, m, hoop, handler.pos)).toEqual(goal);
    }
  });

  it('invites the alley-oop from under the basket, at most once per 90 ticks', () => {
    const s = live();
    const handler = place(s, 'home1', rim.x - 5, 0);
    giveBall(s, handler, []);
    const under = namedSpot(hoop, 'underBasket');
    const me = place(s, 'home2', under.x, under.z);
    place(s, 'away1', -10, 0);
    place(s, 'away2', -10, 3);
    const m = createAiMemory('home2', 1, 0, true);
    m.goal = { kind: 'moveTo', spot: under, name: 'underBasket' };
    s.tick = 500;
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(true);
    m.lastInviteTick = 500;
    s.tick = 500 + INVITE_EVERY_TICKS - 1;
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(false);
    s.tick = 500 + INVITE_EVERY_TICKS;
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(true);
    place(s, 'away1', under.x + 1, under.z); // a defender on me
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(false);
    place(s, 'away1', -10, 0);
    place(s, 'home1', rim.x - 8, 0); // handler too far
    expect(wantsAlleyOopInvite(s, me, player(s, 'home1'), m)).toBe(false);
    m.goal = { kind: 'moveTo', spot: namedSpot(hoop, 'top'), name: 'top' };
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(false);
  });

  it('through the real tick, a 2v2 teammate runs to the basket spot and invites the alley-oop', () => {
    let state = live();
    // Human at the top of the key area, ~6 m from the rim; defenders sit between the wings/corners.
    const handler = place(state, 'home1', rim.x - 6, 0);
    giveBall(state, handler, []);
    place(state, 'home2', rim.x - 5, 4.5);
    place(state, 'away1', rim.x - 3, -3.5);
    place(state, 'away2', rim.x - 3, 3.5);
    const brain = createAiMemory('home2', 1, 1, true);
    let atBasket = false;
    let invites = 0;
    for (let i = 0; i < 300; i++) {
      const intent = decide(state, brain, exact, court);
      const me = player(state, 'home2');
      if (
        brain.goal.kind === 'moveTo' &&
        brain.goal.name === 'underBasket' &&
        v3DistanceXZ(me.pos, brain.goal.spot) <= INVITE_AT_SPOT_RADIUS
      ) {
        atBasket = true;
        if (intent.action) invites++;
      }
      state = tick(state, new Map([['home2', intent]]), court).state;
    }
    expect(atBasket).toBe(true);
    expect(invites).toBeGreaterThanOrEqual(1);
  });

  it('chases a loose ball when closest on my team or within 3 m', () => {
    const s = live();
    s.ball.mode = 'free';
    s.ball.holder = null;
    s.ball.pos = { x: 0, y: 0.12, z: 0 };
    const me = place(s, 'home1', 4, 0);
    place(s, 'home2', 6, 0);
    expect(shouldChase(s, me)).toBe(true);
    expect(shouldChase(s, player(s, 'home2'))).toBe(false);
    place(s, 'home2', 2.5, 0); // now home2 is closer, and within 3 m
    expect(shouldChase(s, me)).toBe(false);
    expect(shouldChase(s, player(s, 'home2'))).toBe(true);
    place(s, 'home1', 0, 2.9); // within 3 m: both chase
    expect(shouldChase(s, player(s, 'home1'))).toBe(true);
  });

  it('crashes the boards within 5 m of the rim during a shot, otherwise waits', () => {
    const s = live();
    s.ball.mode = 'flight';
    s.ball.holder = null;
    s.ball.flight = {
      kind: 'shot',
      from: { x: 0, y: 2, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      totalTicks: 40,
      elapsedTicks: 5,
      passer: null,
      receiver: null,
      lob: false,
      team: 0,
      bow: null,
    };
    s.ball.lastShot = {
      shooter: 'home1',
      team: 0,
      hoop: 1,
      shotType: 'jumpshot',
      points: 2,
      made: false,
    };
    const near = place(s, 'away1', rim.x - 3, 2);
    const goal = planRebound(s, near, court);
    expect(goal.kind).toBe('moveTo');
    if (goal.kind === 'moveTo') {
      expect(Math.hypot(goal.spot.x - rim.x, goal.spot.z - rim.z)).toBeCloseTo(1.2, 5);
      expect(goal.spot.z).toBeGreaterThan(0); // on my side of the rim
    }
    const far = place(s, 'home2', rim.x - 9, 0);
    expect(planRebound(s, far, court)).toEqual({ kind: 'idle' });
  });

  it('a running receiver keeps running to where the led pass lands, and catches it', () => {
    const s = live();
    const passer = place(s, 'home1', 0, 0);
    const receiver = place(s, 'home2', 0, 4);
    place(s, 'away1', -10, -6);
    place(s, 'away2', -10, 6);
    giveBall(s, passer, []);
    receiver.vel = { x: 6, y: 0, z: 0 }; // running across: the sim leads the pass by this velocity
    receiver.action = 'run';
    const brain = createAiMemory('home2', 1, 0, false);
    let state = s;
    const events: SimEvent[] = [];
    for (let i = 0; i < 120 && !events.some((e) => e.type === 'catch'); i++) {
      const toReceiver = decide(state, brain, exact, court);
      // Keep the receiver running across until the pass is out, as a human would.
      const runAcross =
        state.ball.mode === 'held' ? { ...NO_INTENT, move: { x: 1, y: 0 } } : toReceiver;
      const intents = new Map([
        ['home1', { ...NO_INTENT, pass: i === 0 }],
        ['home2', runAcross],
      ]);
      const r = tick(state, intents, court);
      state = r.state;
      events.push(...r.events);
      if (state.ball.mode === 'flight' && state.ball.flight?.kind === 'pass') {
        const goal = brain.goal;
        if (goal.kind === 'moveTo' && goal.name === null)
          expect(goal.spot).toEqual(passLanding(state.ball.flight, court));
      }
    }
    expect(events.some((e) => e.type === 'pass')).toBe(true);
    expect(events.some((e) => e.type === 'catch' && e.playerId === 'home2')).toBe(true);
  });
});
