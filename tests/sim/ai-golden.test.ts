import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { court, fnv1a, playAiMatch, roster, settings } from './ai-match';

describe('AI golden (spec C.7)', () => {
  it('a full 2v2 AI match finishes, scores on both sides and uses the whole move set', () => {
    const run = playAiMatch(7);
    expect(run.state.phase).toBe('finished');
    expect(run.state.score[0]).toBeGreaterThan(0);
    expect(run.state.score[1]).toBeGreaterThan(0);
    const types = new Set(run.events.map((e) => e.type));
    expect(types.has('pass')).toBe(true);
    expect(types.has('steal') || types.has('stealFailed')).toBe(true);
    expect(types.has('block') || types.has('shove')).toBe(true);
    expect(types.has('basket')).toBe(true);
  });

  it('matches the pinned hash — update it only for an intentional simulation or AI change', () => {
    expect(fnv1a(JSON.stringify(playAiMatch(7).state))).toMatchInlineSnapshot(`"2fea3658"`);
  });

  it('replays from seed + recorded intents to the identical state (spec §4.10)', () => {
    const run = playAiMatch(7);
    let state = createMatch({ ...settings, seed: 7 }, court, roster);
    for (const frame of run.intents) state = tick(state, frame, court).state;
    expect(fnv1a(JSON.stringify(state))).toBe(fnv1a(JSON.stringify(run.state)));
  });

  it('the simulation RNG advances only through the sim: brains never draw from it', () => {
    const a = playAiMatch(7);
    let state = createMatch({ ...settings, seed: 7 }, court, roster);
    for (const frame of a.intents) state = tick(state, frame, court).state;
    expect(state.rng.seed).toBe(a.state.rng.seed);
  });
});
