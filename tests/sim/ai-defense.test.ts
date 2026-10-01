import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { DECISION_INTERVAL_TICKS, decide } from '../../src/sim/ai/brain';
import { assignMarks, decidePress, markPosition, planDefence } from '../../src/sim/ai/defense';
import { createAiMemory, type AiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES, type AiProfile, type AiProfileId } from '../../src/sim/ai/profile';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { SHOT_TIMING, startShot } from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchSettings,
  type MatchState,
  type PlayerIntent,
  type PlayerState,
  type SimEvent,
} from '../../src/sim/types';

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

const rim = hoopGeometry(court, 1).rimCenter; // team 0 attacks this one; team 1 defends it
const exact: AiProfile = { ...AI_PROFILES.fair, perceptionNoise: 0 };

describe('assignMarks', () => {
  it('minimises total distance and is the same whichever brain computes it', () => {
    const s = live();
    place(s, 'home1', 2, 3);
    place(s, 'home2', 2, -3);
    place(s, 'away1', 4, -2.5);
    place(s, 'away2', 4, 2.5);
    const marks = assignMarks(s, 1);
    expect(marks.get('away1')).toBe('home2');
    expect(marks.get('away2')).toBe('home1');
    expect(assignMarks(s, 1)).toEqual(marks);
    // Independent of roster order in the state.
    s.teams[1].players.reverse();
    expect(assignMarks(s, 1)).toEqual(marks);
  });

  it('covers both teams and handles unequal sizes by doubling the nearest opponent', () => {
    const s = live();
    expect(assignMarks(s, 0).size).toBe(2);
    s.teams[0].players.pop();
    const marks = assignMarks(s, 1);
    expect(marks.size).toBe(2);
    expect(marks.get('away1')).toBe('home1');
    expect(marks.get('away2')).toBe('home1');
  });
});

describe('markPosition', () => {
  it('stands between the mark and the hoop, closer when the mark has the ball, never behind the rim', () => {
    const mark = { x: rim.x - 6, y: 0, z: 0 };
    const off = markPosition(mark, rim, false);
    expect(off.x).toBeCloseTo(mark.x + 2.4); // 0.4 · 6
    const on = markPosition(mark, rim, true);
    expect(on.x).toBeCloseTo(mark.x + 0.8);
    const far = markPosition({ x: rim.x - 12, y: 0, z: 0 }, rim, false);
    expect(far.x).toBeCloseTo(rim.x - 12 + 2.5); // capped
    const close = markPosition({ x: rim.x - 0.5, y: 0, z: 0 }, rim, false);
    expect(close.x).toBeLessThanOrEqual(rim.x);
  });
});

describe('planDefence', () => {
  it('assigns a mark once per possession and keeps it while the possession lasts', () => {
    const s = live();
    const me = player(s, 'away1');
    const m = createAiMemory('away1', 1, 0, false);
    const first = planDefence(s, me, m);
    expect(first.kind).toBe('mark');
    expect(m.marksForPossession).toBe(0);
    // Positions change but the mark stays.
    place(s, 'home1', 10, 6);
    place(s, 'home2', -10, -6);
    expect(planDefence(s, me, m)).toEqual(first);
    // New possession: re-assigned.
    s.possession = 1;
    planDefence(s, me, m);
    s.possession = 0;
    const again = planDefence(s, me, m);
    expect(m.marksForPossession).toBe(0);
    expect(again.kind).toBe('mark');
  });
});

describe('decidePress', () => {
  function stealSetup(): { s: MatchState; me: PlayerState } {
    const s = live();
    const holder = place(s, 'home1', rim.x - 6, 0);
    giveBall(s, holder, []);
    const me = place(s, 'away1', rim.x - 5.3, 0);
    me.facing = -Math.PI / 2;
    place(s, 'home2', -8, 6);
    place(s, 'away2', -8, -6);
    return { s, me };
  }

  it('never presses when the sim would do nothing or only jump', () => {
    const { s, me } = stealSetup();
    const m = createAiMemory('away1', 1, 0, false);
    me.cooldowns.steal = 10; // steal on cooldown → null
    for (let i = 0; i < 50; i++)
      expect(decidePress(s, me, m, AI_PROFILES.hard, court, true)).toBe(false);
    me.cooldowns.steal = 0;
    place(s, 'away1', -5, 0); // far from everyone → jump
    for (let i = 0; i < 50; i++)
      expect(decidePress(s, me, m, AI_PROFILES.hard, court, true)).toBe(false);
  });

  it('steals at about the profile rate, only on decision ticks', () => {
    for (const [id, rate] of [
      ['easy', 0.2],
      ['fair', 0.4],
      ['hard', 0.6],
    ] as [AiProfileId, number][]) {
      const { s, me } = stealSetup();
      const m = createAiMemory('away1', 11, 0, false);
      let presses = 0;
      for (let i = 0; i < 1000; i++)
        if (decidePress(s, me, m, AI_PROFILES[id], court, true)) presses++;
      // 4σ band for n = 1000; the seed is fixed, so this is deterministic.
      expect(Math.abs(presses / 1000 - rate)).toBeLessThan(0.06);
      expect(decidePress(s, me, m, AI_PROFILES.hard, court, false)).toBe(false);
    }
  });

  it('blocks a shot only once it has been visible for reactionTicks', () => {
    const { s, me } = stealSetup();
    const holder = player(s, 'home1');
    startShot(s, holder, court);
    const m = createAiMemory('away1', 1, 0, false);
    holder.actionTicks = AI_PROFILES.fair.reactionTicks - 1;
    expect(decidePress(s, me, m, AI_PROFILES.fair, court, false)).toBe(false);
    holder.actionTicks = AI_PROFILES.fair.reactionTicks;
    expect(decidePress(s, me, m, AI_PROFILES.fair, court, false)).toBe(true);
    // Per tick, not per decision: the block does not wait for a decision tick.
    expect(decidePress(s, me, m, AI_PROFILES.fair, court, true)).toBe(true);
  });

  it('never jumps on or after the release tick: that block would land only by roster order', () => {
    const { s, me } = stealSetup();
    const holder = player(s, 'home1');
    startShot(s, holder, court); // a jump shot from 6 m
    const release = SHOT_TIMING.jumpshot.releaseTick;
    const m = createAiMemory('away1', 1, 0, false);
    holder.actionTicks = release - 1;
    expect(decidePress(s, me, m, AI_PROFILES.fair, court, false)).toBe(true);
    holder.actionTicks = release;
    expect(decidePress(s, me, m, AI_PROFILES.fair, court, false)).toBe(false);
  });

  it('reaches for the ball only at a holder who is neither running away nor driving', () => {
    const { s, me } = stealSetup(); // I stand between the holder and the rim (+X)
    const holder = player(s, 'home1');
    const m = createAiMemory('away1', 1, 0, false);
    const always = { ...AI_PROFILES.fair, stealRate: 1 };
    expect(decidePress(s, me, m, always, court, true)).toBe(true); // standing
    holder.vel = { x: -3, y: 0, z: 0 }; // running away from me
    expect(decidePress(s, me, m, always, court, true)).toBe(false);
    holder.vel = { x: 4, y: 0, z: 0 }; // driving at the rim: a shove's job, not a reach
    expect(decidePress(s, me, m, always, court, true)).toBe(false);
    holder.vel = { x: 2, y: 0, z: 0 }; // walking it up
    expect(decidePress(s, me, m, always, court, true)).toBe(true);
  });

  it('shoves a driving mark by the profile rate, never a standing one, and only with turbo', () => {
    const s = live();
    const driver = place(s, 'home2', rim.x - 6, 0); // no ball: shove is what the press does
    place(s, 'home1', -8, 6);
    giveBall(s, player(s, 'home1'), []);
    const me = place(s, 'away1', rim.x - 5, 0);
    me.facing = -Math.PI / 2; // facing −X, towards the driver
    place(s, 'away2', -8, -6);
    const m = createAiMemory('away1', 3, 0, false);
    const always = { ...AI_PROFILES.hard, shoveRate: 1 };
    expect(decidePress(s, me, m, always, court, true)).toBe(false); // standing
    driver.vel = { x: 5, y: 0, z: 0 }; // driving at the rim
    expect(decidePress(s, me, m, always, court, true)).toBe(true);
    me.turbo = 0.1;
    expect(decidePress(s, me, m, always, court, true)).toBe(false);
    me.turbo = 1;
    expect(decidePress(s, me, m, { ...always, shoveRate: 0 }, court, true)).toBe(false);
  });
});

/** Runs the four brains against the sim. */
function playBrains(
  state: MatchState,
  ticks: number,
  profile: AiProfile,
  memories: AiMemory[],
  override?: (s: MatchState) => Map<string, PlayerIntent>,
): { state: MatchState; events: SimEvent[]; rngSeeds: number[] } {
  let s = state;
  const events: SimEvent[] = [];
  const rngSeeds: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const intents = override?.(s) ?? new Map<string, PlayerIntent>();
    for (const m of memories) {
      if (!intents.has(m.playerId)) intents.set(m.playerId, decide(s, m, profile, court));
    }
    rngSeeds.push(s.rng.seed);
    const r = tick(s, intents, court);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events, rngSeeds };
}

describe('decide (brain)', () => {
  it('fair and hard block a jump shot taken in their face; easy is too slow', () => {
    for (const [id, blocked] of [
      ['easy', false],
      ['fair', true],
      ['hard', true],
    ] as [AiProfileId, boolean][]) {
      const s = live();
      const shooter = place(s, 'home1', rim.x - 5, 0);
      giveBall(s, shooter, []);
      place(s, 'away1', rim.x - 4.2, 0);
      place(s, 'home2', -8, 6);
      place(s, 'away2', -8, -6);
      const defender = createAiMemory('away1', 1, 0, false);
      const { events } = playBrains(
        s,
        40,
        { ...AI_PROFILES[id], perceptionNoise: 0 },
        [defender],
        (st) => new Map([['home1', { ...NO_INTENT, action: st.tick === 0 }]]),
      );
      expect(events.some((e) => e.type === 'block')).toBe(blocked);
    }
  });

  it('plans every 6 ticks at its slot phase, steers every tick, presses for one tick only', () => {
    const s = live();
    const me = place(s, 'home1', rim.x - 2.2, 0);
    giveBall(s, me, []);
    place(s, 'home2', -8, 6);
    place(s, 'away1', -8, -6);
    place(s, 'away2', -8, 0);
    const m = createAiMemory('home1', 1, 1, false); // a team's second slot: phase 3
    m.lastPlannedPossession = s.possession; // a plan already exists: only the cadence plans now
    s.tick = 0;
    expect(decide(s, m, exact, court)).toEqual(NO_INTENT); // before its phase: idle goal
    s.tick = 3;
    const first = decide(s, m, exact, court);
    expect(m.goal).toEqual({ kind: 'shoot' });
    expect(first.action).toBe(true);
    expect(m.nextDecisionTick).toBe(3 + DECISION_INTERVAL_TICKS);
    s.tick = 4;
    expect(decide(s, m, exact, court).action).toBe(false); // forced release
    s.tick = 5;
    expect(decide(s, m, exact, court).action).toBe(true); // still wants to shoot (the sim would have locked it)
  });

  it('is silent when not live, when action-locked and when airborne', () => {
    const s = live();
    const me = player(s, 'home1');
    const m = createAiMemory('home1', 1, 0, false);
    s.phase = 'scored';
    expect(decide(s, m, exact, court)).toEqual(NO_INTENT);
    s.phase = 'live';
    me.action = 'shoot';
    expect(decide(s, m, exact, court)).toEqual(NO_INTENT);
    me.action = 'idle';
    me.onGround = false;
    expect(decide(s, m, exact, court)).toEqual(NO_INTENT);
  });

  it('resets its memory on the phase change to inbound and tipoff, keeping the RNG', () => {
    const s = live();
    const m = createAiMemory('away1', 1, 1, false);
    m.lastPhase = 'live';
    m.goal = { kind: 'chase' };
    m.markId = 'home1';
    const seed = m.rng.seed;
    s.phase = 'inbound';
    s.tick = 300;
    decide(s, m, exact, court);
    expect(m.goal).toEqual({ kind: 'idle' });
    expect(m.markId).toBeNull();
    expect(m.nextDecisionTick).toBe(303); // index 1: phase 3 of the match clock
    expect(m.rng.seed).toBe(seed);
    expect(m.lastPhase).toBe('inbound');
  });

  it('both defenders re-plan on the tick possession flips, so their marks never collide', () => {
    const s = live();
    const holder = place(s, 'home1', 1, -1);
    place(s, 'home2', 1, 1);
    giveBall(s, holder, []);
    s.possession = 1; // stale: the marks are assigned for this possession, then it flips
    place(s, 'away1', 6, 0.02);
    place(s, 'away2', 6, -0.02); // a near tie
    const a = createAiMemory('away1', 1, 0, false);
    const b = createAiMemory('away2', 1, 1, false);
    for (let t = 0; t < 4; t++) {
      s.tick = t;
      decide(s, a, exact, court);
      decide(s, b, exact, court);
    }
    expect(a.nextDecisionTick).toBe(6);
    expect(b.nextDecisionTick).toBe(9);
    s.tick = 4;
    s.possession = 0; // team 1 now defends
    decide(s, a, exact, court);
    decide(s, b, exact, court);
    expect(a.nextDecisionTick).toBe(6); // a forced re-plan keeps the staggered cadence
    expect(b.nextDecisionTick).toBe(9);
    expect(a.goal.kind).toBe('mark');
    expect(b.goal.kind).toBe('mark');
    const marks = assignMarks(s, 1);
    expect(a.markId).toBe(marks.get('away1'));
    expect(b.markId).toBe(marks.get('away2'));
    expect(a.markId).not.toBe(b.markId);
  });

  it('after a real inbound both defenders plan on the same first live tick and mark different attackers', () => {
    const s = createMatch({ ...matchSettings, seed: 2 }, court, roster);
    s.phase = 'inbound';
    s.pendingInbound = 0; // team 0 has the ball; team 1 defends
    s.tick = 100;
    const a = createAiMemory('away1', 2, 0, false);
    const b = createAiMemory('away2', 2, 1, false);
    const planTicks: number[][] = [[], []];
    let state = s;
    for (let i = 0; i < 8; i++) {
      const before = [a.goal.kind, b.goal.kind];
      const intents = new Map<string, PlayerIntent>([
        ['away1', decide(state, a, exact, court)],
        ['away2', decide(state, b, exact, court)],
      ]);
      if (state.phase === 'live') {
        if (before[0] === 'idle' && a.goal.kind !== 'idle') planTicks[0].push(state.tick);
        if (before[1] === 'idle' && b.goal.kind !== 'idle') planTicks[1].push(state.tick);
      }
      state = tick(state, intents, court).state;
    }
    expect(state.phase).toBe('live');
    expect(planTicks[0][0]).toBeDefined();
    expect(planTicks[0][0]).toBe(planTicks[1][0]);
    expect(a.goal.kind).toBe('mark');
    expect(b.goal.kind).toBe('mark');
    expect(a.markId).not.toBeNull();
    expect(a.markId).not.toBe(b.markId);
  });

  it('never touches the simulation RNG', () => {
    const s = live();
    const memories = roster.map((e, i) => createAiMemory(e.id, 1, i % 2, e.id === 'home2'));
    const before = s.rng.seed;
    for (let t = 0; t < 120; t++) {
      s.tick = t;
      for (const m of memories) decide(s, m, AI_PROFILES.fair, court);
    }
    expect(s.rng.seed).toBe(before);
  });

  it('four brains play 20 seconds of a match without anyone standing still the whole time', () => {
    const s = createMatch({ ...matchSettings, seed: 4 }, court, roster);
    const memories = roster.map((e, i) => createAiMemory(e.id, 4, i % 2, e.id === 'home2'));
    const start = structuredClone(s);
    const { state, events } = playBrains(s, 1200, AI_PROFILES.fair, memories);
    for (const e of roster) {
      const a = player(start, e.id).pos;
      const b = player(state, e.id).pos;
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.5);
    }
    expect(events.some((e) => e.type === 'shotReleased' || e.type === 'pass')).toBe(true);
  });
});
