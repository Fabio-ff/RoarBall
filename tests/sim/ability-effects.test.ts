import { describe, expect, it } from 'vitest';
import { ABILITIES, abilities, getAbility } from '../../src/content/abilities';
import { characters, getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { CHARGE_MAX } from '../../src/sim/abilities';
import { giveBall } from '../../src/sim/ball';
import { resolveSteal } from '../../src/sim/defence';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer, type RosterEntry } from '../../src/sim/match';
import { createRng, nextFloat } from '../../src/sim/rng';
import {
  chooseShotType,
  evaluateShot,
  releaseShot,
  resolveShotOutcome,
  tryBlockShot,
} from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchState,
  type PlayerIntent,
  type PlayerState,
  type SimEvent,
} from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1); // team 0 attacks hoop 1 (x = +12.425)
const special: PlayerIntent = { ...NO_INTENT, special: true };
const press: PlayerIntent = { ...NO_INTENT, action: true };

function cast(id: string, team: 0 | 1, characterId: string): RosterEntry {
  return { id, team, characterId, character: getCharacter(characterId) };
}

/** 'a' (team 0) and 'x' (team 1), standing still far apart; extra players for Earthquake. */
function live(home: string, away: string, extra: RosterEntry[] = []): MatchState {
  const s = createMatch(
    {
      durationMs: 180_000,
      shotClockMs: 14_000,
      seed: 1,
      ruleIds: [],
      courtId: 'gym',
      mode: 'match',
    },
    court,
    [cast('a', 0, home), cast('x', 1, away), ...extra],
  );
  s.phase = 'live';
  s.possession = 0;
  place(s, 'a', 0, 0);
  place(s, 'x', -8, 5);
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

/** A seed whose first draw is ≥ 0.9: any shot or steal below 90 % fails on it. */
function unluckySeed(): number {
  let seed = 1;
  while (nextFloat(createRng(seed)) < 0.9) seed++;
  return seed;
}

function run(
  state: MatchState,
  ticks: number,
  intents: Map<string, PlayerIntent> = new Map(),
  stop?: (events: SimEvent[]) => boolean,
): { state: MatchState; events: SimEvent[] } {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = tick(s, intents, court, ABILITIES);
    s = r.state;
    all.push(...r.events);
    if (stop?.(r.events)) break;
  }
  return { state: s, events: all };
}

function activate(s: MatchState, id: string): { state: MatchState; events: SimEvent[] } {
  player(s, id).charge = CHARGE_MAX;
  return run(s, 1, new Map([[id, special]]));
}

describe('ability registry (spec D.3)', () => {
  it('has the four launch abilities, one per character', () => {
    expect(abilities.map((a) => a.id)).toEqual(['rocketDunk', 'hotHand', 'blur', 'earthquake']);
    for (const c of characters) expect(ABILITIES[c.abilityId]?.id).toBe(c.abilityId);
    expect(getAbility('blur').name).toBe('Blur');
    expect(() => getAbility('nope')).toThrow(/unknown ability/i);
  });
});

describe('Rocket Dunk (Brick)', () => {
  it('sets dunkFromArc and unblockableDunk for 480 ticks', () => {
    let { state } = activate(live('brick', 'ace'), 'a');
    expect(player(state, 'a').stats).toMatchObject({ dunkFromArc: true, unblockableDunk: true });
    expect(player(state, 'a').baseStats.dunkFromArc).toBe(false);
    ({ state } = run(state, 478));
    expect(player(state, 'a').ability).not.toBeNull();
    const end = run(state, 1);
    expect(end.events).toContainEqual({
      type: 'abilityEnded',
      playerId: 'a',
      abilityId: 'rocketDunk',
    });
    expect(player(end.state, 'a').ability).toBeNull();
    // Stats are rebuilt on the end tick itself, so nothing stale shows between ticks.
    expect(player(end.state, 'a').stats.dunkFromArc).toBe(false);
    expect(player(end.state, 'a').stats).toEqual(player(end.state, 'a').baseStats);
  });

  it('makes any shot press inside the arc a dunk, even standing still', () => {
    const s = live('brick', 'ace');
    const a = place(s, 'a', hoop.rimCenter.x - 6, 0);
    expect(chooseShotType(a, hoop)).toBe('jumpshot');
    a.stats.dunkFromArc = true;
    expect(chooseShotType(a, hoop)).toBe('dunk');
    place(s, 'a', hoop.rimCenter.x - 7, 0); // outside the 6.75 m arc
    expect(chooseShotType(a, hoop)).toBe('jumpshot');
  });

  it('launches the dunker on a line to the rim that arrives at the release tick, and scores', () => {
    let s = live('brick', 'ace');
    giveBall(s, place(s, 'a', hoop.rimCenter.x - 6, 0), []);
    s = activate(s, 'a').state;
    const pressed = run(s, 1, new Map([['a', press]]));
    const a = player(pressed.state, 'a');
    expect(a.action).toBe('dunk');
    // (6 m − the 0.6 m dunk stop) ÷ the 24-tick release time, no turbo cap.
    expect(Math.hypot(a.vel.x, a.vel.z)).toBeCloseTo((6 - 0.6) / (24 / 60), 1);
    const rest = run(pressed.state, 90, new Map(), (ev) => ev.some((e) => e.type === 'basket'));
    expect(rest.events).toContainEqual(
      expect.objectContaining({ type: 'basket', playerId: 'a', shotType: 'dunk', points: 2 }),
    );
  });

  it('cannot be blocked, even by a block that started first', () => {
    const s = live('brick', 'ace');
    const a = place(s, 'a', hoop.rimCenter.x - 1, 0);
    giveBall(s, a, []);
    a.shot = { type: 'dunk', hoop: 1, approachSpeed: 5 };
    a.action = 'dunk';
    a.actionTicks = 24;
    a.onGround = false;
    a.pos.y = 0.5;
    const x = place(s, 'x', hoop.rimCenter.x - 0.5, 0);
    x.action = 'block';
    x.actionTicks = 30; // started before the dunk
    x.onGround = false;
    x.pos.y = 0.5;
    x.vel.y = 2;
    const normal = structuredClone(s);
    expect(tryBlockShot(normal, player(normal, 'a'), court, [])).toBe(true);
    a.stats.unblockableDunk = true;
    expect(tryBlockShot(s, a, court, [])).toBe(false);
    expect(s.ball.holder).toBe('a');
  });
});

describe('Hot Hand (Ace)', () => {
  it('gives three sure shots with no timer', () => {
    const activated = activate(live('ace', 'brick'), 'a');
    expect(activated.events).toContainEqual({
      type: 'abilityActivated',
      playerId: 'a',
      abilityId: 'hotHand',
    });
    expect(player(activated.state, 'a').ability).toEqual({ ticksLeft: null, uses: 3 });
    const later = run(activated.state, 600);
    expect(player(later.state, 'a').ability).toEqual({ ticksLeft: null, uses: 3 });
  });

  it('a sure shot is made but still takes the outcome draw (draw order unchanged)', () => {
    const s = live('ace', 'brick');
    const a = place(s, 'a', hoop.rimCenter.x - 10, 0);
    giveBall(s, a, []);
    a.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    a.ability = { ticksLeft: null, uses: 3 };
    const seed = unluckySeed();
    s.rng = createRng(seed);
    const after = createRng(seed);
    nextFloat(after);
    const outcome = resolveShotOutcome(s, a, court);
    expect(outcome.made).toBe(true);
    expect(outcome.quality).toBeLessThan(0.5); // the real quality is still reported
    expect(s.rng.seed).toBe(after.seed); // exactly one draw, as for any make
  });

  it('each released shot spends a use; a blocked shot does not', () => {
    const s = live('ace', 'brick');
    const a = place(s, 'a', hoop.rimCenter.x - 5, 0);
    giveBall(s, a, []);
    a.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    a.ability = { ticksLeft: null, uses: 3 };
    const events: SimEvent[] = [];
    releaseShot(s, a, court, events);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'shotReleased', playerId: 'a', made: true }),
    );
    expect(a.ability?.uses).toBe(2);

    const b = live('ace', 'brick');
    const shooter = place(b, 'a', hoop.rimCenter.x - 5, 0);
    giveBall(b, shooter, []);
    shooter.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    shooter.ability = { ticksLeft: null, uses: 3 };
    const x = place(b, 'x', hoop.rimCenter.x - 4.5, 0);
    x.action = 'block';
    x.onGround = false;
    x.vel.y = 2;
    const blocked: SimEvent[] = [];
    releaseShot(b, shooter, court, blocked);
    expect(blocked).toContainEqual({ type: 'block', by: 'x', shooter: 'a' });
    expect(shooter.ability?.uses).toBe(3);
  });

  it('ends on the tick its last sure shot is released', () => {
    const s = live('ace', 'brick');
    const a = place(s, 'a', hoop.rimCenter.x - 5, 0);
    giveBall(s, a, []);
    a.ability = { ticksLeft: null, uses: 1 };
    const r = run(s, 40, new Map([['a', press]]), (ev) =>
      ev.some((e) => e.type === 'shotReleased'),
    );
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'shotReleased', playerId: 'a', made: true }),
    );
    expect(r.events).toContainEqual({ type: 'abilityEnded', playerId: 'a', abilityId: 'hotHand' });
    expect(player(r.state, 'a').ability).toBeNull();
  });

  it('the AI sees its sure shots: evaluateShot reports quality 1 while uses remain', () => {
    const s = live('ace', 'brick');
    const a = place(s, 'a', hoop.rimCenter.x - 10, 0);
    expect(evaluateShot(s, a, court).quality).toBeLessThan(0.5);
    a.ability = { ticksLeft: null, uses: 1 };
    expect(evaluateShot(s, a, court).quality).toBe(1);
  });
});

describe('Blur (Dash)', () => {
  it('doubles speeds and acceleration with unlimited turbo and sure steals, for 360 ticks', () => {
    const { state } = activate(live('dash', 'brick'), 'a');
    const a = player(state, 'a');
    for (const k of ['runSpeed', 'turboSpeed', 'acceleration', 'deceleration'] as const)
      expect(a.stats[k]).toBeCloseTo(a.baseStats[k] * 2);
    expect(a.stats).toMatchObject({ unlimitedTurbo: true, stealAlwaysSucceeds: true });
    expect(a.ability).toEqual({ ticksLeft: 359, uses: 0 });
  });

  it('turbo never drains, even from an empty bar', () => {
    const s = activate(live('dash', 'brick'), 'a').state;
    player(s, 'a').turbo = 0;
    const r = run(s, 120, new Map([['a', { ...NO_INTENT, move: { x: 0, y: 1 }, turbo: true }]]));
    expect(player(r.state, 'a').turbo).toBe(0);
    expect(player(r.state, 'a').turboActive).toBe(true);
  });

  it('a steal that reaches the holder always succeeds; the draw is still taken', () => {
    const seed = unluckySeed();
    const attempt = (sure: boolean) => {
      const s = live('dash', 'brick');
      giveBall(s, place(s, 'x', 0, 0), []);
      const a = place(s, 'a', 0.8, 0);
      a.stats.stealAlwaysSucceeds = sure;
      s.rng = createRng(seed);
      const events: SimEvent[] = [];
      resolveSteal(s, a, events);
      return { s, events };
    };
    const after = createRng(seed);
    nextFloat(after);
    expect(attempt(false).events).toContainEqual({ type: 'stealFailed', by: 'a' });
    const blur = attempt(true);
    expect(blur.events).toContainEqual({ type: 'steal', by: 'a', from: 'x' });
    expect(blur.s.rng.seed).toBe(after.seed);
  });

  it('still needs reach: an out-of-reach holder keeps the ball and no draw is taken', () => {
    const s = live('dash', 'brick');
    giveBall(s, place(s, 'x', 0, 0), []);
    const a = place(s, 'a', 3, 0);
    a.stats.stealAlwaysSucceeds = true;
    const before = s.rng.seed;
    const events: SimEvent[] = [];
    resolveSteal(s, a, events);
    expect(events).toEqual([{ type: 'stealFailed', by: 'a' }]);
    expect(s.rng.seed).toBe(before);
  });
});

describe('Earthquake (Rook)', () => {
  function quake() {
    const s = live('rook', 'brick', [
      cast('b', 0, 'ace'),
      cast('y', 1, 'dash'),
      cast('z', 1, 'ace'),
    ]);
    place(s, 'a', 0, 0);
    const x = place(s, 'x', 2, 0);
    giveBall(s, x, []); // the holder: Brick, 27 ticks of stun resistance
    x.shoveImmunityTicks = 30;
    const y = place(s, 'y', 0, 3.5);
    y.onGround = false; // in the air
    y.pos.y = 0.8;
    place(s, 'z', 5, 0); // out of range
    place(s, 'b', -1, -1); // a teammate in range
    const seed = s.rng.seed;
    return { seed, ...activate(s, 'a') };
  }

  it('knocks every opponent within 4 m down for 90 ticks, ignoring resistance and immunity', () => {
    const { state, events, seed } = quake();
    expect(events.filter((e) => e.type === 'knockdown')).toEqual([
      { type: 'knockdown', by: 'a', target: 'x' },
      { type: 'knockdown', by: 'a', target: 'y' },
    ]);
    for (const id of ['x', 'y']) {
      expect(player(state, id).action).toBe('stunned');
      expect(player(state, id).stunTicks).toBe(90);
    }
    expect(player(state, 'z').action).not.toBe('stunned');
    expect(player(state, 'b').action).not.toBe('stunned');
    expect(state.ball.holder).toBeNull();
    expect(state.ball.mode).toBe('free');
    const types = events.map((e) => e.type);
    expect(types.indexOf('abilityActivated')).toBeLessThan(types.indexOf('knockdown'));
    expect(types).toContain('abilityEnded');
    expect(player(state, 'a').ability).toBeNull();
    expect(state.rng.seed).toBe(seed); // no RNG
  });

  it('victims get up and are immune afterwards, as after a shove', () => {
    const later = run(quake().state, 115);
    const x = player(later.state, 'x');
    expect(['stunned', 'getup']).not.toContain(x.action);
    expect(x.shoveImmunityTicks).toBeGreaterThan(0);
  });
});
