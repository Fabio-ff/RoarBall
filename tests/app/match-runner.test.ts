import { describe, expect, it } from 'vitest';
import { MatchRunner } from '../../src/app/match-runner';
import { getCourt } from '../../src/content/courts';
import { createMatch, findPlayer } from '../../src/sim/match';
import { NO_INTENT } from '../../src/sim/types';

function runner(): MatchRunner {
  const court = getCourt('gym');
  const state = createMatch(
    {
      durationMs: 60_000,
      shotClockMs: 14_000,
      seed: 5,
      ruleIds: [],
      courtId: 'gym',
      mode: 'match',
    },
    court,
    [{ id: 'p', team: 0, characterId: 'placeholder' }],
  );
  return new MatchRunner(court, state);
}

describe('MatchRunner', () => {
  it('starts with previous and current equal to the initial state', () => {
    const r = runner();
    expect(r.previous).toBe(r.current);
    expect(r.current.tick).toBe(0);
  });

  it('keeps the previous state one tick behind after stepping', () => {
    const r = runner();
    r.step(new Map([['p', { ...NO_INTENT, move: { x: 1, y: 0 } }]]));
    r.step(new Map([['p', { ...NO_INTENT, move: { x: 1, y: 0 } }]]));
    expect(r.current.tick).toBe(2);
    expect(r.previous.tick).toBe(1);
    expect(findPlayer(r.current, 'p')?.pos.x).toBeGreaterThan(
      findPlayer(r.previous, 'p')?.pos.x ?? 0,
    );
  });

  it('returns the events of the step', () => {
    const r = runner();
    const first = r.step(new Map());
    expect(first.some((e) => e.type === 'phaseChange' && e.to === 'live')).toBe(true);
    expect(r.step(new Map())).toEqual([]);
  });
});
