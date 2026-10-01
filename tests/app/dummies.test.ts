import { describe, expect, it } from 'vitest';
import { defenderDummy, teammateDummy } from '../../src/app/dummies';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { startJump } from '../../src/sim/player-movement';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchState, type PlayerIntent } from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1);

function setup(): MatchState {
  const s = createMatch(
    {
      durationMs: 180_000,
      shotClockMs: 14_000,
      seed: 1,
      ruleIds: ['shotClock'],
      courtId: 'gym',
      mode: 'shootaround',
    },
    court,
    [
      { id: 'home1', team: 0, characterId: 'placeholder' },
      { id: 'home2', team: 0, characterId: 'placeholder' },
      { id: 'away1', team: 1, characterId: 'placeholder' },
    ],
  );
  s.phase = 'live';
  const h = findPlayer(s, 'home1');
  if (!h) throw new Error('no human');
  h.pos = { x: hoop.rimCenter.x - 6, y: 0, z: 0 };
  giveBall(s, h, []);
  return s;
}

function play(state: MatchState, ticks: number, human: (s: MatchState) => PlayerIntent) {
  const mate = teammateDummy('home2', 'home1', court);
  const def = defenderDummy('away1', 'home1', court);
  let s = state;
  const events = [];
  for (let i = 0; i < ticks; i++) {
    const intents = new Map<string, PlayerIntent>([
      ['home1', human(s)],
      ['home2', mate(s)],
      ['away1', def(s)],
    ]);
    const r = tick(s, intents, court);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('dummies', () => {
  it('walk to their spots near the hoop the human attacks', () => {
    const { state } = play(setup(), 240, () => NO_INTENT);
    const mate = findPlayer(state, 'home2');
    const def = findPlayer(state, 'away1');
    expect(mate && Math.abs(mate.pos.z) > 2).toBe(true); // on the wing
    expect(def && def.pos.x > hoop.rimCenter.x - 4 && def.pos.x < hoop.rimCenter.x).toBe(true); // in the key
  });

  it('the teammate passes back a second after catching', () => {
    const { events } = play(setup(), 240, (s) =>
      s.tick === 1 ? { ...NO_INTENT, pass: true } : NO_INTENT,
    );
    const passes = events.filter((e) => e.type === 'pass');
    expect(passes.some((e) => e.type === 'pass' && e.from === 'home1' && e.to === 'home2')).toBe(
      true,
    );
    expect(passes.some((e) => e.type === 'pass' && e.from === 'home2' && e.to === 'home1')).toBe(
      true,
    );
  });

  it('the teammate passes at once when the human calls for the ball', () => {
    const s = setup();
    const mate = findPlayer(s, 'home2');
    if (!mate) throw new Error('no mate');
    giveBall(s, mate, []);
    const { events } = play(s, 30, (st) =>
      st.tick === 1 ? { ...NO_INTENT, pass: true } : NO_INTENT,
    );
    const idx = events.findIndex((e) => e.type === 'pass' && e.from === 'home2');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(20);
  });

  it('the teammate lobs when the human is airborne near the rim', () => {
    const s = setup();
    const mate = findPlayer(s, 'home2');
    const h = findPlayer(s, 'home1');
    if (!mate || !h) throw new Error('no players');
    mate.pos = { x: hoop.rimCenter.x - 5, y: 0, z: 4 };
    giveBall(s, mate, []);
    h.pos = { x: hoop.rimCenter.x - 1.2, y: 0, z: 0 };
    startJump(h, 4.5);
    const { events } = play(s, 120, () => NO_INTENT);
    expect(events.some((e) => e.type === 'pass' && e.lob)).toBe(true);
  });

  it('the human can steal from the defender holding the ball at its spot', () => {
    const s = setup();
    const h = findPlayer(s, 'home1');
    const d = findPlayer(s, 'away1');
    if (!h || !d) throw new Error('no players');
    d.pos = { x: hoop.rimCenter.x - 3.5, y: 0, z: 0 };
    giveBall(s, d, []);
    h.pos = { x: d.pos.x - 0.8, y: 0, z: 0 };
    h.facing = Math.PI / 2;
    const { events } = play(s, 30, (st) =>
      st.tick === 1 ? { ...NO_INTENT, action: true } : NO_INTENT,
    );
    expect(events.some((e) => e.type === 'steal' || e.type === 'stealFailed')).toBe(true);
    expect(events.some((e) => e.type === 'block')).toBe(false);
  });

  it('the defender walks a rebound back to its spot instead of holding it under the rim', () => {
    const s = setup();
    const h = findPlayer(s, 'home1');
    const d = findPlayer(s, 'away1');
    if (!h || !d) throw new Error('no players');
    d.pos = { x: hoop.rimCenter.x - 1, y: 0, z: 0 };
    giveBall(s, d, []);
    const spot = { x: hoop.rimCenter.x - 3.5, z: hoop.rimCenter.z };
    const { state } = play(s, 120, () => NO_INTENT);
    const after = findPlayer(state, 'away1');
    if (!after) throw new Error('no d');
    expect(state.ball.holder).toBe('away1');
    expect(Math.hypot(after.pos.x - spot.x, after.pos.z - spot.z)).toBeLessThan(0.8);
    expect(Math.hypot(after.vel.x, after.vel.z)).toBeLessThan(0.1); // standing there
  });

  it('the defender chases a loose ball nearby', () => {
    const s = setup();
    const d = findPlayer(s, 'away1');
    if (!d) throw new Error('no d');
    d.pos = { x: hoop.rimCenter.x - 3.5, y: 0, z: 0 };
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      pos: { x: d.pos.x + 2, y: s.ball.radius, z: 1 },
      vel: { x: 0, y: 0, z: 0 },
    };
    const { state } = play(s, 90, () => NO_INTENT);
    expect(state.ball.holder).toBe('away1');
  });

  it('the defender raises for a block when the handler comes close', () => {
    const s = setup();
    const h = findPlayer(s, 'home1');
    const d = findPlayer(s, 'away1');
    if (!h || !d) throw new Error('no players');
    d.pos = { x: hoop.rimCenter.x - 2.5, y: 0, z: 0 };
    h.pos = { x: hoop.rimCenter.x - 4, y: 0, z: 0 };
    const { state } = play(s, 20, () => NO_INTENT);
    expect(['block', 'jump']).toContain(findPlayer(state, 'away1')?.action);
  });

  it('the defender blocks a shot taken close to it', () => {
    const s = setup();
    const h = findPlayer(s, 'home1');
    const d = findPlayer(s, 'away1');
    if (!h || !d) throw new Error('no players');
    // Defender at its spot (3.5 m out); the human starts 2.6 m further out, runs at it and shoots on tick 12,
    // which is the ~130 ms window where the defender is grounded and the shooter is within block reach.
    d.pos = { x: hoop.rimCenter.x - 3.5, y: 0, z: 0 };
    h.pos = { x: hoop.rimCenter.x - 6.08, y: 0, z: 0 };
    const { events } = play(s, 150, (st) =>
      st.tick < 22 ? { ...NO_INTENT, move: { x: 1, y: 0 }, action: st.tick === 12 } : NO_INTENT,
    );
    expect(events.some((e) => e.type === 'block')).toBe(true);
  });
});
