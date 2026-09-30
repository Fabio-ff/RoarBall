import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { createMatch, findPlayer } from '../../src/sim/match';
import { applyRules, RULES, shotClockRule } from '../../src/sim/rules';
import type { MatchSettings } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};

describe('rules', () => {
  it('shot clock: violation only when live, held and expired', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.phase = 'live';
    giveBall(state, p, []);
    expect(shotClockRule.check(state)).toBeNull();
    state.shotClockMs = 0;
    expect(shotClockRule.check(state)).toEqual({ ruleId: 'shotClock', team: 0 });
    state.ball.mode = 'flight';
    expect(shotClockRule.check(state)).toBeNull();
  });

  it('applyRules runs only the enabled rules', () => {
    const state = createMatch({ ...settings, ruleIds: [] }, court, [
      { id: 'p', team: 0, characterId: 'placeholder' },
    ]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.phase = 'live';
    giveBall(state, p, []);
    state.shotClockMs = 0;
    expect(applyRules(state)).toEqual([]);
    state.settings.ruleIds = ['shotClock'];
    expect(applyRules(state)).toHaveLength(1);
    expect(Object.keys(RULES)).toEqual(['shotClock']);
  });

  it('createMatch rejects unknown rule ids', () => {
    expect(() => createMatch({ ...settings, ruleIds: ['travelling'] }, court, [])).toThrow(
      /unknown rule/i,
    );
  });
});
