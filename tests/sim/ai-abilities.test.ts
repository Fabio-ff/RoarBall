import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { CHARGE_MAX } from '../../src/sim/abilities';
import { chaseTarget, decide, wantsAbility } from '../../src/sim/ai/brain';
import { createAiMemory, type AiMemory } from '../../src/sim/ai/memory';
import { SURE_SHOT_AI_RANGE, planWithBall } from '../../src/sim/ai/offense';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { giveBall } from '../../src/sim/ball';
import { NO_ABILITIES, QUERY_MATH } from '../../src/sim/hooks';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchState, PlayerState } from '../../src/sim/types';

const court = getCourt('gym');
const RIM0 = -12.425; // team 1 attacks hoop 0
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function live(): MatchState {
  const s = createMatch(
    {
      durationMs: 180_000,
      shotClockMs: 14_000,
      seed: 1,
      ruleIds: ['shotClock'],
      courtId: 'gym',
      mode: 'match',
    },
    court,
    roster,
  );
  s.phase = 'live';
  place(s, 'home1', -2, -6);
  place(s, 'home2', -2, 6);
  place(s, 'away1', 2, -6);
  place(s, 'away2', 2, 6);
  return s;
}

function player(s: MatchState, id: string): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(s: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(s, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

const ctx = { math: QUERY_MATH, court };
function wants(s: MatchState, id: string): boolean {
  const p = player(s, id);
  return ABILITIES[p.abilityId ?? '']?.aiWantsToUse?.(s, p, ctx) ?? false;
}

describe('aiWantsToUse rules (spec D.5)', () => {
  it('Rocket Dunk: holding the ball 3.5–6.5 m from the target hoop', () => {
    const s = live();
    giveBall(s, place(s, 'away1', RIM0 + 5, 0), []);
    expect(wants(s, 'away1')).toBe(true);
    place(s, 'away1', RIM0 + 2, 0);
    expect(wants(s, 'away1')).toBe(false);
    place(s, 'away1', RIM0 + 8, 0);
    expect(wants(s, 'away1')).toBe(false);
    place(s, 'away1', RIM0 + 5, 0);
    giveBall(s, player(s, 'away2'), []);
    expect(wants(s, 'away1')).toBe(false);
  });

  it('Hot Hand: own team in possession', () => {
    const s = live();
    s.possession = 0;
    expect(wants(s, 'home2')).toBe(true);
    s.possession = 1;
    expect(wants(s, 'home2')).toBe(false);
  });

  it('Blur: defending the holder within 5 m, or holding the ball more than 10 m out', () => {
    const s = live();
    giveBall(s, place(s, 'home1', 0, 0), []);
    place(s, 'away2', 4, 0);
    expect(wants(s, 'away2')).toBe(true);
    place(s, 'away2', 6, 0);
    expect(wants(s, 'away2')).toBe(false);
    giveBall(s, place(s, 'away2', RIM0 + 12, 0), []);
    expect(wants(s, 'away2')).toBe(true);
    place(s, 'away2', RIM0 + 8, 0);
    expect(wants(s, 'away2')).toBe(false);
  });

  it('Earthquake: two opponents within 4 m, or the opposing holder within 4 m', () => {
    const s = live();
    giveBall(s, player(s, 'home2'), []);
    place(s, 'home1', 0, 0);
    place(s, 'away1', 2, 0);
    place(s, 'away2', 0, 3);
    expect(wants(s, 'home1')).toBe(true);
    place(s, 'away2', 0, 6);
    expect(wants(s, 'home1')).toBe(false);
    giveBall(s, player(s, 'away1'), []);
    expect(wants(s, 'home1')).toBe(true);
  });
});

describe('decide: one-tick SPECIAL press on decision ticks (spec D.5)', () => {
  /** Ace (home2) charged while home1 holds the ball: Hot Hand wants it; home2 plans on tick 3. */
  function ready(): { s: MatchState; m: AiMemory } {
    const s = live();
    giveBall(s, place(s, 'home1', 0, 0), []);
    player(s, 'home2').charge = CHARGE_MAX;
    const m = createAiMemory('home2', 1, 1, true);
    s.tick = m.nextDecisionTick;
    return { s, m };
  }

  it('presses SPECIAL on the decision tick, then releases it', () => {
    const { s, m } = ready();
    expect(wantsAbility(s, player(s, 'home2'), court, ABILITIES)).toBe(true);
    expect(decide(s, m, AI_PROFILES.fair, court, ABILITIES).special).toBe(true);
    s.tick += 1;
    expect(decide(s, m, AI_PROFILES.fair, court, ABILITIES).special).toBe(false);
  });

  it('a second decision tick right after a press still releases the button', () => {
    const { s, m } = ready();
    expect(decide(s, m, AI_PROFILES.fair, court, ABILITIES).special).toBe(true);
    s.tick += 1;
    m.nextDecisionTick = s.tick; // decision tick again, ability still wanted (the sim never ran)
    expect(decide(s, m, AI_PROFILES.fair, court, ABILITIES).special).toBe(false);
    s.tick += 1;
    m.nextDecisionTick = s.tick;
    expect(decide(s, m, AI_PROFILES.fair, court, ABILITIES).special).toBe(true);
  });

  it('never presses without a full bar, while active, or with NO_ABILITIES', () => {
    const a = ready();
    player(a.s, 'home2').charge = CHARGE_MAX - 1;
    expect(decide(a.s, a.m, AI_PROFILES.fair, court, ABILITIES).special).toBe(false);
    const b = ready();
    player(b.s, 'home2').ability = { ticksLeft: null, uses: 3 };
    expect(decide(b.s, b.m, AI_PROFILES.fair, court, ABILITIES).special).toBe(false);
    const c = ready();
    expect(decide(c.s, c.m, AI_PROFILES.fair, court, NO_ABILITIES).special).toBe(false);
    expect(decide(c.s, c.m, AI_PROFILES.fair, court).special).toBe(false);
  });

  it('the press activates the ability in the sim', () => {
    const { s, m } = ready();
    const intent = decide(s, m, AI_PROFILES.fair, court, ABILITIES);
    const r = tick(s, new Map([['home2', intent]]), court, ABILITIES);
    expect(r.events).toContainEqual({
      type: 'abilityActivated',
      playerId: 'home2',
      abilityId: 'hotHand',
    });
  });
});

describe('Hot Hand sure shots only count within range for the AI (deviation from spec D.5)', () => {
  function holder(distance: number): { s: MatchState; m: AiMemory } {
    const s = live();
    // Ace (team 0) attacks hoop 1 at +12.425; keep the defenders out of the way.
    giveBall(s, place(s, 'home2', 12.425 - distance, 0), []);
    s.possession = 0;
    place(s, 'away1', -10, -8);
    place(s, 'away2', -10, 8);
    player(s, 'home2').ability = { ticksLeft: 600, uses: 3 };
    const m = createAiMemory('home2', 1, 1, true);
    return { s, m };
  }

  it('shoots a sure shot inside 9 m, where the same contested shot without Hot Hand is not taken', () => {
    const { s, m } = holder(SURE_SHOT_AI_RANGE - 1);
    place(s, 'away1', 12.425 - (SURE_SHOT_AI_RANGE - 1) + 1, 0.3); // a defender in the shooter's face
    expect(planWithBall(s, player(s, 'home2'), m, AI_PROFILES.fair, court).kind).toBe('shoot');
    player(s, 'home2').ability = null;
    const control = createAiMemory('home2', 1, 1, true);
    expect(planWithBall(s, player(s, 'home2'), control, AI_PROFILES.fair, court).kind).not.toBe(
      'shoot',
    );
  });

  it('beyond 9 m the sure shot is ignored: it drives or passes instead of shooting', () => {
    const { s, m } = holder(14);
    const goal = planWithBall(s, player(s, 'home2'), m, AI_PROFILES.fair, court);
    expect(goal.kind).not.toBe('shoot');
  });
});

describe('loose-ball chase reads the court aiHint (spec D.5)', () => {
  it('leads the ball by where the gust carries it in 0.75 s; straight at it otherwise', () => {
    const s = live();
    s.ball.mode = 'free';
    s.ball.holder = null;
    s.ball.pos = { x: 2, y: 0.12, z: 1 };
    const me = player(s, 'home1');
    expect(chaseTarget(s, me, court)).toEqual(s.ball.pos);
    const rooftop = getCourt('rooftop');
    s.courtState = { nextGustTick: 1_000_000, gust: { ticksLeft: 100, dir: { x: 1, y: 0, z: 0 } } };
    const target = chaseTarget(s, me, rooftop);
    expect(target.x).toBeCloseTo(2 + 4 * 0.5 * 0.75 * 0.75);
    expect(target.z).toBeCloseTo(1);
  });
});
