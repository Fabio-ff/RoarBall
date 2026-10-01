import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { attackingHoopIndex, hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import type { Vec2, Vec3 } from '../../src/sim/math';
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
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  // The script only takes long heaves (~5 %); this seed makes one, so the run covers a basket,
  // 'scored' and the inbound. (Seed 7 relied on the heave bounce-in fixed in task 7.)
  seed: 12,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'placeholder' },
  { id: 'away1', team: 1 as const, characterId: 'placeholder' },
];

/** Scripted, varied inputs: circles at different rates, turbo bursts, a press every 90 ticks. */
function scriptedIntent(i: number, offset: number): PlayerIntent {
  const angle = (i + offset) / 40;
  return {
    move: { x: Math.cos(angle), y: Math.sin(angle * 0.7) },
    action: (i + offset) % 90 === 0,
    pass: false,
    special: false,
    turbo: Math.floor((i + offset) / 100) % 2 === 0,
  };
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Second golden run: a 2 s shot clock and a 12 s match with a press only every 400 ticks, so the
 * run goes through shot-clock violations, inbounds, a basket and the end of the match.
 */
const shortSettings: MatchSettings = {
  ...settings,
  durationMs: 12_000,
  shotClockMs: 2000,
  seed: 7,
};

function idleIntent(i: number, offset: number): PlayerIntent {
  return { ...scriptedIntent(i, offset), action: (i + offset) % 400 === 0 };
}

function playShort(): { state: MatchState; events: SimEvent[] } {
  let state = createMatch(shortSettings, court, roster);
  const events: SimEvent[] = [];
  for (let i = 0; i < 1200; i++) {
    const result = tick(
      state,
      new Map([
        ['home1', idleIntent(i, 0)],
        ['away1', idleIntent(i, 37)],
      ]),
      court,
    );
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

function play(): { state: MatchState; events: SimEvent[] } {
  let state = createMatch(settings, court, roster);
  const events: SimEvent[] = [];
  for (let i = 0; i < 1500; i++) {
    const result = tick(
      state,
      new Map([
        ['home1', scriptedIntent(i, 0)],
        ['away1', scriptedIntent(i, 37)],
      ]),
      court,
    );
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/**
 * Third golden run (Phase 3): 2v2 with the real cast in match mode, so passes, catches,
 * interceptions, steals, shoves, blocks and knockdowns all feed the hash. Every intent is a pure
 * function of the state and the tick index: no randomness outside the sim. With seed 27 the script
 * passes, catches, intercepts, steals (and misses), shoves and blocks.
 */
const teamSettings: MatchSettings = { ...settings, seed: 27 };
const teamRoster = [
  { id: 'home1', team: 0 as const, characterId: 'dash', character: getCharacter('dash') },
  { id: 'home2', team: 0 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away1', team: 1 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away2', team: 1 as const, characterId: 'rook', character: getCharacter('rook') },
];
const homeHoop = hoopGeometry(court, attackingHoopIndex(court, 0));

/** Unit court-space step from `from` towards `to`, zero once within 0.3 m. */
function towards(from: Vec3, to: Vec3): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  return d < 0.3 ? { x: 0, y: 0 } : { x: dx / d, y: dz / d };
}

function player(state: MatchState, id: string): PlayerState {
  const p = findPlayer(state, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function teamIntents(state: MatchState, i: number): Map<string, PlayerIntent> {
  const home1 = player(state, 'home1');
  const home2 = player(state, 'home2');
  const away1 = player(state, 'away1');
  const away2 = player(state, 'away2');
  const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
  const wing = {
    x: homeHoop.rimCenter.x - homeHoop.side * 5,
    y: 0,
    z: homeHoop.rimCenter.z + 4,
  };
  const ball = state.ball.pos;
  const toBall = Math.hypot(ball.x - home2.pos.x, ball.z - home2.pos.z) || 1;
  const denySpot = {
    x: home2.pos.x + (ball.x - home2.pos.x) / toBall,
    y: 0,
    z: home2.pos.z + (ball.z - home2.pos.z) / toBall,
  };
  return new Map<string, PlayerIntent>([
    // Drives at the hoop, pressing action every 1.5 s (with the ball only inside 6 m, so it drives
    // first), and passes when home2 calls for the ball.
    [
      'home1',
      {
        ...NO_INTENT,
        move: towards(home1.pos, homeHoop.rimCenter),
        action:
          i % 90 === 0 &&
          (state.ball.holder !== 'home1' ||
            Math.hypot(home1.pos.x - homeHoop.rimCenter.x, home1.pos.z - homeHoop.rimCenter.z) < 6),
        pass: home2.callingForPassTicks > 0,
      },
    ],
    // Waits on the wing and presses pass every 2.5 s (a pass with the ball, a call without).
    ['home2', { ...NO_INTENT, move: towards(home2.pos, wing), pass: i % 150 === 75 }],
    // Chases whoever holds the ball (or the loose ball), pressing action every 0.75 s; 10 ticks
    // after home1's presses, inside the jump-shot block window.
    [
      'away1',
      {
        ...NO_INTENT,
        move: towards(away1.pos, holder?.pos ?? state.ball.pos),
        action: i % 45 === 10,
        turbo: true,
      },
    ],
    // Shadows home2 a metre towards the ball (denying the pass), pressing action every 0.75 s.
    ['away2', { ...NO_INTENT, move: towards(away2.pos, denySpot), action: i % 45 === 30 }],
  ]);
}

function playTeams(): { state: MatchState; events: SimEvent[] } {
  let state = createMatch(teamSettings, court, teamRoster);
  const events: SimEvent[] = [];
  for (let i = 0; i < 2400; i++) {
    const result = tick(state, teamIntents(state, i), court);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

describe('determinism (golden)', () => {
  it('two runs with the same seed and inputs end in the identical state', () => {
    const a = play();
    const b = play();
    expect(a).toEqual(b);
    expect(a.state.score[0] + a.state.score[1]).toBeGreaterThan(0); // the script actually shoots
  });

  it('matches the pinned hash — update it only for an intentional simulation change', () => {
    expect(fnv1a(JSON.stringify(play().state))).toMatchInlineSnapshot(`"3cbe5a85"`);
  });

  it('the short-clock run reaches violations and the end of the match, deterministically', () => {
    const a = playShort();
    expect(a).toEqual(playShort());
    const types = new Set(a.events.map((e) => e.type));
    expect(types.has('shotClockViolation')).toBe(true);
    const finished = a.events.some((e) => e.type === 'phaseChange' && e.to === 'finished');
    expect(finished || a.state.overtime).toBe(true);
  });

  it('matches the pinned short-clock hash — update it only for an intentional simulation change', () => {
    expect(fnv1a(JSON.stringify(playShort().state))).toMatchInlineSnapshot(`"c2687487"`);
  });

  it('the 2v2 run passes and defends, deterministically', () => {
    const a = playTeams();
    expect(a).toEqual(playTeams());
    const counts: Record<string, number> = {};
    for (const e of a.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    const has = (...types: SimEvent['type'][]) => types.some((t) => (counts[t] ?? 0) > 0);
    expect(has('pass')).toBe(true);
    expect(has('steal', 'stealFailed')).toBe(true);
    expect(has('shove')).toBe(true);
    expect(has('block', 'intercept')).toBe(true);
    expect(a.state.score[0] + a.state.score[1]).toBeGreaterThan(0);
  });

  it('matches the pinned 2v2 hash — update it only for an intentional simulation change', () => {
    expect(fnv1a(JSON.stringify(playTeams().state))).toMatchInlineSnapshot(`"3d776fad"`);
  });

  it('pins each run’s events and score (spec D.7: phase 5 never changes them on the gym without abilities)', () => {
    const pin = (run: { state: MatchState; events: SimEvent[] }): string =>
      `${fnv1a(JSON.stringify(run.events))} ${run.state.score[0]}-${run.state.score[1]} ${run.events.length}`;
    expect({
      long: pin(play()),
      short: pin(playShort()),
      teams: pin(playTeams()),
    }).toMatchInlineSnapshot(`
      {
        "long": "4278f28b 3-0 28",
        "short": "41c73bc9 0-3 33",
        "teams": "616184cb 2-5 72",
      }
    `);
  });
});
