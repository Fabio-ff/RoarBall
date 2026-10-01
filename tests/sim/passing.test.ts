import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { startJump } from '../../src/sim/player-movement';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchSettings,
  type MatchState,
  type PlayerIntent,
  type SimEvent,
} from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 2,
  ruleIds: [],
  courtId: 'gym',
  mode: 'match',
};
const passPress: PlayerIntent = { ...NO_INTENT, pass: true };
const hoop = hoopGeometry(court, 1);

/** Live match: 'a' holds the ball at the origin, teammate 'b' and opponent 'x' where the test puts them. */
function setup(): MatchState {
  const s = createMatch(settings, court, [
    { id: 'a', team: 0, characterId: 'placeholder' },
    { id: 'b', team: 0, characterId: 'placeholder' },
    { id: 'x', team: 1, characterId: 'placeholder' },
  ]);
  s.phase = 'live';
  const a = findPlayer(s, 'a');
  const b = findPlayer(s, 'b');
  const x = findPlayer(s, 'x');
  if (!a || !b || !x) throw new Error('no players');
  a.pos = { x: 0, y: 0, z: 0 };
  a.facing = Math.PI / 2;
  b.pos = { x: 5, y: 0, z: 0 };
  x.pos = { x: 0, y: 0, z: -6 };
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

describe('passing', () => {
  it('a pass reaches a standing teammate and is caught', () => {
    const { state, events } = run(setup(), 120, new Map([['a', passPress]]), (ev) =>
      ev.some((e) => e.type === 'catch'),
    );
    expect(events.some((e) => e.type === 'pass' && e.from === 'a' && e.to === 'b' && !e.lob)).toBe(
      true,
    );
    expect(state.ball.holder).toBe('b');
    expect(state.possession).toBe(0);
    const passer = findPlayer(state, 'a');
    expect(passer?.action).not.toBe('pass');
  });

  it('leads a moving teammate', () => {
    const s = setup();
    const b = findPlayer(s, 'b');
    if (!b) throw new Error('no b');
    b.vel = { x: 0, y: 0, z: 6 }; // already at full run speed, so the lead is exact
    const intents = new Map<string, PlayerIntent>([
      ['a', passPress],
      ['b', { ...NO_INTENT, move: { x: 0, y: 1 } }],
    ]);
    const { state } = run(s, 120, intents, (ev) => ev.some((e) => e.type === 'catch'));
    expect(state.ball.holder).toBe('b');
  });

  it('is intercepted by an opponent standing on the line', () => {
    const s = setup();
    const x = findPlayer(s, 'x');
    if (!x) throw new Error('no x');
    x.pos = { x: 2.5, y: 0, z: 0 };
    const { state, events } = run(s, 120, new Map([['a', passPress]]), (ev) =>
      ev.some((e) => e.type === 'intercept' || e.type === 'catch'),
    );
    expect(events.some((e) => e.type === 'intercept' && e.playerId === 'x')).toBe(true);
    expect(state.ball.holder).toBe('x');
    expect(state.possession).toBe(1);
  });

  it('a pass with no teammate on court does nothing', () => {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    s.phase = 'live';
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no a');
    giveBall(s, a, []);
    const { state, events } = run(s, 5, new Map([['a', passPress]]));
    expect(events.some((e) => e.type === 'pass')).toBe(false);
    expect(state.ball.holder).toBe('a');
  });

  it('PASS without the ball calls for it', () => {
    const s = setup();
    const { state } = run(s, 1, new Map([['b', passPress]]));
    expect(findPlayer(state, 'b')?.callingForPassTicks).toBe(59); // set to 60, decremented once
  });

  it('a lob to an airborne teammate at the rim becomes an alley-oop dunk', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const b = findPlayer(s, 'b');
    if (!a || !b) throw new Error('no players');
    a.pos = { x: hoop.rimCenter.x - 6, y: 0, z: 0 };
    b.pos = { x: hoop.rimCenter.x - 1.2, y: 0, z: 0 };
    s.ball.pos = { x: a.pos.x, y: 0.95, z: 0 };
    startJump(b, 4.5);
    const { state, events } = run(s, 150, new Map([['a', passPress]]), (ev) =>
      ev.some((e) => e.type === 'basket'),
    );
    expect(events.some((e) => e.type === 'pass' && e.lob)).toBe(true);
    expect(events.some((e) => e.type === 'alleyOop' && e.playerId === 'b')).toBe(true);
    expect(events.some((e) => e.type === 'basket' && e.shotType === 'dunk')).toBe(true);
    expect(state.score[0]).toBe(2);
  });
});
