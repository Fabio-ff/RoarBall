import { describe, expect, it } from 'vitest';
import { BoxScore } from '../../src/app/box-score';
import { ABILITIES } from '../../src/content/abilities';
import { decide } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { tick } from '../../src/sim/tick';
import type { SimEvent } from '../../src/sim/types';
import { court, roster, startState } from '../sim/ai-match';

const players = [
  { id: 'home1', team: 0 as const, name: 'Rook' },
  { id: 'home2', team: 0 as const, name: 'Ace' },
  { id: 'away1', team: 1 as const, name: 'Brick' },
  { id: 'away2', team: 1 as const, name: 'Dash' },
];
const line = (box: BoxScore, id: string) => box.lines().find((l) => l.id === id);

describe('BoxScore (spec E.1, plan decision 14)', () => {
  it('counts points, dunks, threes, steals, blocks and ability uses', () => {
    const box = new BoxScore(players);
    box.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }], 10);
    box.record(
      [{ type: 'basket', playerId: 'home2', team: 0, points: 3, shotType: 'jumpshot' }],
      20,
    );
    box.record(
      [
        { type: 'steal', by: 'away1', from: 'home1' },
        { type: 'block', by: 'away2', shooter: 'home2' },
      ],
      30,
    );
    box.record([{ type: 'abilityActivated', playerId: 'away1', abilityId: 'rocketDunk' }], 40);
    expect(line(box, 'home1')).toMatchObject({ points: 2, dunks: 1, threes: 0 });
    expect(line(box, 'home2')).toMatchObject({ points: 3, threes: 1 });
    expect(line(box, 'away1')).toMatchObject({ steals: 1, abilityUses: 1 });
    expect(line(box, 'away2')).toMatchObject({ blocks: 1 });
  });

  it('credits an assist when the receiver scores within 180 ticks of catching a teammate pass', () => {
    const box = new BoxScore(players);
    const pass: SimEvent = { type: 'pass', from: 'home2', to: 'home1', lob: false };
    box.record([pass], 100);
    box.record([{ type: 'catch', playerId: 'home1' }], 120);
    box.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }], 300);
    expect(line(box, 'home2')?.assists).toBe(1);
  });

  it('no assist after the window, after a possession change, or after an interception', () => {
    const late = new BoxScore(players);
    late.record([{ type: 'pass', from: 'home2', to: 'home1', lob: false }], 0);
    late.record([{ type: 'catch', playerId: 'home1' }], 10);
    late.record(
      [{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }],
      191,
    );
    expect(line(late, 'home2')?.assists).toBe(0);

    const turnover = new BoxScore(players);
    turnover.record([{ type: 'pass', from: 'home2', to: 'home1', lob: false }], 0);
    turnover.record([{ type: 'catch', playerId: 'home1' }], 10);
    turnover.record([{ type: 'possessionChange', team: 1 }], 20);
    turnover.record([{ type: 'possessionChange', team: 0 }], 30);
    turnover.record(
      [{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }],
      40,
    );
    expect(line(turnover, 'home2')?.assists).toBe(0);

    const picked = new BoxScore(players);
    picked.record([{ type: 'pass', from: 'home2', to: 'home1', lob: false }], 0);
    picked.record(
      [
        { type: 'intercept', playerId: 'away1' },
        { type: 'catch', playerId: 'away1' },
      ],
      5,
    );
    picked.record(
      [{ type: 'basket', playerId: 'away1', team: 1, points: 2, shotType: 'layup' }],
      50,
    );
    expect(line(picked, 'home2')?.assists).toBe(0);
  });

  it('a basket clears every pending assist (the next basket needs a new pass)', () => {
    const box = new BoxScore(players);
    box.record([{ type: 'pass', from: 'home2', to: 'home1', lob: false }], 0);
    box.record([{ type: 'catch', playerId: 'home1' }], 5);
    box.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }], 20);
    box.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }], 60);
    expect(line(box, 'home2')?.assists).toBe(1);
  });

  it('lines keep the roster order', () => {
    expect(new BoxScore(players).lines().map((l) => l.id)).toEqual([
      'home1',
      'home2',
      'away1',
      'away2',
    ]);
  });
});

describe('BoxScore vs the sim', () => {
  it("agrees with the sim's score over a full AI match", () => {
    const seed = 7;
    let state = startState(seed, court);
    const memories = roster.map((e, i) => createAiMemory(e.id, seed, i % 2, e.id === 'home2'));
    const box = new BoxScore(
      roster.map((e) => ({ id: e.id, team: e.team, name: e.character.name })),
    );
    let baskets = 0;
    while (state.phase !== 'finished' && state.tick < 20_000) {
      const frame = new Map(
        memories.map((m) => [m.playerId, decide(state, m, AI_PROFILES.fair, court, ABILITIES)]),
      );
      const r = tick(state, frame, court, ABILITIES);
      state = r.state;
      baskets += r.events.filter((e) => e.type === 'basket').length;
      box.record(r.events, r.state.tick);
    }
    expect(state.phase).toBe('finished');
    const lines = box.lines();
    for (const team of [0, 1] as const) {
      const pts = lines.filter((l) => l.team === team).reduce((s, l) => s + l.points, 0);
      expect(pts).toBe(state.score[team]);
    }
    const assists = lines.reduce((s, l) => s + l.assists, 0);
    expect(assists).toBeGreaterThanOrEqual(0);
    expect(assists).toBeLessThanOrEqual(baskets);
    expect(baskets).toBeGreaterThan(0);
  });
});
