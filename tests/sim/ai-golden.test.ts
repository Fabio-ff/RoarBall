import { beforeAll, describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCourt } from '../../src/content/courts';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { court, fnv1a, playAiMatch, roster, settings, startState, type AiRun } from './ai-match';

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
    expect(fnv1a(JSON.stringify(playAiMatch(7).state))).toMatchInlineSnapshot(`"28db140d"`);
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

  it('pins the events and score (spec D.7: phase 5 never changes them on the gym without abilities)', () => {
    const run = playAiMatch(7);
    expect(
      `${fnv1a(JSON.stringify(run.events))} ${run.state.score[0]}-${run.state.score[1]} ${run.events.length}`,
    ).toMatchInlineSnapshot(`"2c4c544d 20-28 420"`);
  });
});

describe('AI goldens with abilities, one per court (spec D.7)', () => {
  const COURT_IDS = ['gym', 'rooftop', 'volcano', 'frozen'] as const;
  let cache: Record<string, AiRun> = {};
  beforeAll(() => {
    cache = Object.fromEntries(
      COURT_IDS.map((id) => [
        id,
        playAiMatch(7, AI_PROFILES.fair, { court: getCourt(id), abilities: ABILITIES }),
      ]),
    );
  }, 60_000);
  const runs = (): Record<string, AiRun> => cache;

  it('every court finishes, scores on both sides and sees abilities used', () => {
    for (const id of COURT_IDS) {
      const run = runs()[id];
      expect(run.state.phase, id).toBe('finished');
      expect(run.state.score[0], id).toBeGreaterThan(0);
      expect(run.state.score[1], id).toBeGreaterThan(0);
      expect(
        run.events.some((e) => e.type === 'abilityActivated'),
        id,
      ).toBe(true);
    }
    expect(runs().rooftop.events.some((e) => e.type === 'gustStart')).toBe(true);
  });

  it('matches the pinned hashes — update only for an intentional simulation, AI, ability or court change', () => {
    const pins = Object.fromEntries(
      COURT_IDS.map((id) => {
        const { state } = runs()[id];
        return [id, `${fnv1a(JSON.stringify(state))} ${state.score[0]}-${state.score[1]}`];
      }),
    );
    expect(pins).toMatchInlineSnapshot(`
      {
        "frozen": "0fd2bf65 14-26",
        "gym": "6cf98452 24-34",
        "rooftop": "8b29c203 25-30",
        "volcano": "67d0a824 26-24",
      }
    `);
  });

  it('brains never draw from state.rng: replaying the recorded intents without them ends on the same RNG, per court', () => {
    for (const id of COURT_IDS) {
      const c = getCourt(id);
      let state = startState(7, c);
      for (const frame of runs()[id].intents) state = tick(state, frame, c, ABILITIES).state;
      expect(state.rng, id).toEqual(runs()[id].state.rng);
    }
  }, 60_000);

  it('replays the rooftop match from seed + recorded intents, court RNG included (spec §4.10)', () => {
    const rooftop = getCourt('rooftop');
    const run = runs().rooftop;
    let state = startState(7, rooftop);
    for (const frame of run.intents) state = tick(state, frame, rooftop, ABILITIES).state;
    expect(fnv1a(JSON.stringify(state))).toBe(fnv1a(JSON.stringify(run.state)));
  }, 60_000);
});
