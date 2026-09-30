import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { allPlayers, createMatch, findPlayer } from '../../src/sim/match';
import type { MatchSettings } from '../../src/sim/types';

const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  mode: 'match',
  courtId: 'gym',
};

describe('createMatch', () => {
  it('places roster players on their own half, facing the far hoop', () => {
    const state = createMatch(settings, getCourt('gym'), [
      { id: 'home1', team: 0, characterId: 'placeholder' },
      { id: 'away1', team: 1, characterId: 'placeholder' },
    ]);
    const home = findPlayer(state, 'home1');
    const away = findPlayer(state, 'away1');
    expect(home?.pos.x).toBeLessThan(0);
    expect(away?.pos.x).toBeGreaterThan(0);
    expect(home?.facing).toBeCloseTo(Math.PI / 2); // +X
    expect(away?.facing).toBeCloseTo(-Math.PI / 2); // -X
    expect(allPlayers(state)).toHaveLength(2);
  });

  it('starts live with the full clock, zero score and the seeded rng', () => {
    const state = createMatch(settings, getCourt('gym'), []);
    expect(state.phase).toBe('live');
    expect(state.tick).toBe(0);
    expect(state.clockMs).toBe(180_000);
    expect(state.score).toEqual([0, 0]);
    expect(state.rng.seed).toBe(1);
  });

  it('spreads teammates across the width', () => {
    const state = createMatch(settings, getCourt('gym'), [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 0, characterId: 'placeholder' },
    ]);
    expect(findPlayer(state, 'a')?.pos.z).not.toBe(findPlayer(state, 'b')?.pos.z);
  });
});
