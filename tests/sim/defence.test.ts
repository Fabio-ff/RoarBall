import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { chooseDefensiveAction, resolveSteal } from '../../src/sim/defence';
import { defenderFactor } from '../../src/sim/shooting';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchState, type PlayerIntent, type SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1);
const press: PlayerIntent = { ...NO_INTENT, action: true };

function setup(seed = 1): MatchState {
  const s = createMatch(
    { durationMs: 60_000, shotClockMs: 14_000, seed, ruleIds: [], courtId: 'gym', mode: 'match' },
    court,
    [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'x', team: 1, characterId: 'placeholder' },
    ],
  );
  s.phase = 'live';
  const a = findPlayer(s, 'a');
  const x = findPlayer(s, 'x');
  if (!a || !x) throw new Error('no players');
  a.pos = { x: hoop.rimCenter.x - 5, y: 0, z: 0 };
  a.facing = Math.PI / 2;
  x.pos = { x: hoop.rimCenter.x - 4.2, y: 0, z: 0 };
  x.facing = -Math.PI / 2;
  giveBall(s, a, []);
  return s;
}

function run(
  state: MatchState,
  ticks: number,
  intents: Map<string, PlayerIntent>,
  stop?: (ev: SimEvent[], s: MatchState) => boolean,
) {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = tick(s, intents, court);
    s = r.state;
    all.push(...r.events);
    if (stop?.(r.events, s)) break;
  }
  return { state: s, events: all };
}

describe('chooseDefensiveAction', () => {
  it('blocks a shooter, steals from a close handler, shoves otherwise, jumps when far', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    expect(chooseDefensiveAction(s, x, court)).toBe('steal');
    a.action = 'shoot';
    a.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    expect(chooseDefensiveAction(s, x, court)).toBe('block');
    a.action = 'idle';
    a.shot = null;
    a.pos.x = hoop.rimCenter.x - 2;
    x.pos.x = hoop.rimCenter.x - 3;
    expect(chooseDefensiveAction(s, x, court)).toBe('block'); // handler near the hoop
    s.ball.holder = null;
    s.ball.mode = 'free';
    x.facing = Math.PI / 2; // face +X, towards the opponent
    expect(chooseDefensiveAction(s, x, court)).toBe('shove'); // opponent in reach and in front
    x.pos.x = hoop.rimCenter.x - 9;
    expect(chooseDefensiveAction(s, x, court)).toBe('jump');
  });

  it('never chooses a defensive move while a teammate holds the ball', () => {
    const s = setup();
    const x = findPlayer(s, 'x');
    if (!x) throw new Error('no x');
    s.ball.holder = 'x';
    const y = { ...x, id: 'y' };
    s.teams[1].players.push(y);
    expect(chooseDefensiveAction(s, y, court)).toBe('jump');
  });
});

describe('defender term', () => {
  it('reduces quality with a close defender, more when airborne, never below the floor', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    expect(defenderFactor(a, [])).toBe(1);
    x.pos = { x: a.pos.x + 3, y: 0, z: 0 };
    expect(defenderFactor(a, [x])).toBeCloseTo(1);
    x.pos = { x: a.pos.x + 1, y: 0, z: 0 };
    expect(defenderFactor(a, [x])).toBeCloseTo(0.7);
    x.onGround = false;
    expect(defenderFactor(a, [x])).toBeCloseTo(0.42);
    x.pos = { x: a.pos.x + 0.1, y: 0, z: 0 };
    x.onGround = true;
    expect(defenderFactor(a, [x])).toBeCloseTo(0.475);
  });
});

describe('block', () => {
  it('a rising blocker in reach deflects the shot: no flight, ball loose, no basket', () => {
    const s = setup();
    const x = findPlayer(s, 'x');
    if (!x) throw new Error('no x');
    x.pos.x = hoop.rimCenter.x - 4.4; // 0.6 m from the shooter
    // Shooter presses at tick 0 (release at tick 27). The defender jumps at tick 10: at the release
    // they are 17 ticks up (0.88 m, hand at 3.48 m ≥ the 3.13 m release point) and still rising.
    let state = s;
    const all: SimEvent[] = [];
    for (let i = 0; i < 120; i++) {
      const intents = new Map<string, PlayerIntent>([['a', press]]);
      if (i === 10) intents.set('x', press);
      const r = tick(state, intents, court);
      state = r.state;
      all.push(...r.events);
    }
    expect(all.some((e) => e.type === 'block' && e.by === 'x' && e.shooter === 'a')).toBe(true);
    expect(all.some((e) => e.type === 'shotReleased')).toBe(false);
    expect(all.some((e) => e.type === 'basket')).toBe(false);
    expect(state.score).toEqual([0, 0]);
  });

  it('a blocker out of reach does nothing', () => {
    const s = setup();
    const x = findPlayer(s, 'x');
    if (!x) throw new Error('no x');
    x.pos.x = hoop.rimCenter.x - 3; // 2 m from the shooter, beyond block reach
    let state = s;
    const all: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      const intents = new Map<string, PlayerIntent>([['a', press]]);
      if (i === 10) intents.set('x', press);
      const r = tick(state, intents, court);
      state = r.state;
      all.push(...r.events);
    }
    expect(all.some((e) => e.type === 'block')).toBe(false);
    expect(all.some((e) => e.type === 'shotReleased')).toBe(true);
  });

  it('a block pressed after the dunk press never blocks it', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    a.pos.x = hoop.rimCenter.x - 1.5;
    a.vel = { x: 4, y: 0, z: 0 };
    x.pos.x = hoop.rimCenter.x - 0.9;
    let state = s;
    const all: SimEvent[] = [];
    for (let i = 0; i < 90; i++) {
      const intents = new Map<string, PlayerIntent>();
      if (i >= 0) intents.set('a', press);
      if (i === 2) intents.set('x', press);
      const r = tick(state, intents, court);
      state = r.state;
      all.push(...r.events);
    }
    expect(all.some((e) => e.type === 'block')).toBe(false);
    expect(all.some((e) => e.type === 'shotReleased' && e.shotType === 'dunk')).toBe(true);
  });

  it('a dunk is only blocked by a block that started first', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    a.pos.x = hoop.rimCenter.x - 1.5;
    a.vel = { x: 4, y: 0, z: 0 };
    x.pos.x = hoop.rimCenter.x - 0.9;
    // Block pressed at tick 0, dunk pressed at tick 1: the block started first.
    let state = s;
    const all: SimEvent[] = [];
    for (let i = 0; i < 90; i++) {
      const intents = new Map<string, PlayerIntent>();
      if (i === 0) intents.set('x', press);
      if (i >= 1) intents.set('a', press);
      const r = tick(state, intents, court);
      state = r.state;
      all.push(...r.events);
    }
    expect(all.some((e) => e.type === 'block')).toBe(true);
  });
});

describe('steal', () => {
  it('succeeds at about the resolved chance over many seeds and costs a cooldown either way', () => {
    let wins = 0;
    const n = 120;
    for (let seed = 1; seed <= n; seed++) {
      const s = setup(seed);
      const { state, events } = run(s, 30, new Map([['x', press]]), (ev) =>
        ev.some((e) => e.type === 'steal' || e.type === 'stealFailed'),
      );
      if (events.some((e) => e.type === 'steal')) {
        wins += 1;
        expect(state.ball.holder).toBe('x');
        expect(state.possession).toBe(1);
      }
      expect(findPlayer(state, 'x')?.cooldowns.steal).toBeGreaterThan(0);
    }
    // chance = clamp(0.45 - 0.03*5, 0.1, 0.7) = 0.30 with default stats
    expect(Math.abs(wins / n - 0.3)).toBeLessThan(0.1);
  });

  it('is half as likely against a handler running away (resolved directly, within reach)', () => {
    const rate = (vx: number): number => {
      let wins = 0;
      const n = 300;
      for (let seed = 1; seed <= n; seed++) {
        const s = setup(seed);
        const a = findPlayer(s, 'a');
        const x = findPlayer(s, 'x');
        if (!a || !x) throw new Error('no players');
        a.vel = { x: vx, y: 0, z: 0 }; // x stands at +X of a: negative vx runs away from x
        const events: SimEvent[] = [];
        resolveSteal(s, x, events);
        if (events.some((e) => e.type === 'steal')) wins += 1;
      }
      return wins / n;
    };
    const still = rate(0);
    const away = rate(-3);
    expect(Math.abs(still - 0.3)).toBeLessThan(0.08);
    expect(Math.abs(away - 0.15)).toBeLessThan(0.08);
  });
});

describe('shove', () => {
  it('knocks the handler down, pops the ball loose and respects power', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    // Steal is preferred when the handler is in reach: put x just outside steal reach (1.02 m)
    // but inside shove reach (1.2 m), facing the handler.
    x.pos.x = a.pos.x + 1.1;
    x.facing = -Math.PI / 2;
    const { state, events } = run(s, 40, new Map([['x', press]]), (ev) =>
      ev.some((e) => e.type === 'shove'),
    );
    expect(events.some((e) => e.type === 'shove' && e.by === 'x' && e.target === 'a')).toBe(true);
    const victim = findPlayer(state, 'a');
    expect(victim?.action).toBe('stunned');
    expect(victim?.stunTicks).toBe(45); // 60 dealt − 15 resisted with default stats
    expect(state.ball.holder).toBeNull();
    expect(state.ball.mode).toBe('free');
    expect(findPlayer(state, 'x')?.cooldowns.shove).toBeGreaterThan(0);
  });
});
