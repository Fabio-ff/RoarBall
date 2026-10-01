import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { buildRoster, buildSession, buildSettings } from '../../src/app/session';
import type { GameOptions } from '../../src/app/url-options';
import { NO_INTENT } from '../../src/sim/types';

const court = getCourt('gym');

describe('buildSession (spec C.1)', () => {
  const base: GameOptions = {
    mode: 'match',
    characterId: 'dash',
    teammateId: 'ace',
    opponentIds: ['brick', 'rook'],
    aiProfile: 'easy',
    seed: 9,
    debug: false,
  };

  it('a match has four players, three AI controllers and the chosen characters', () => {
    const session = buildSession(base, court, 9, () => NO_INTENT);
    expect(buildRoster(base).map((e) => e.characterId)).toEqual(['dash', 'ace', 'brick', 'rook']);
    expect(session.controllers.size).toBe(4);
    expect(session.ais.map((a) => a.id)).toEqual(['home2', 'away1', 'away2']);
    expect(session.ais[0].memory.favourTeammate).toBe(true);
    expect(session.ais[1].memory.favourTeammate).toBe(false);
    expect(buildSettings(base, court, 9)).toMatchObject({
      mode: 'match',
      seed: 9,
      durationMs: 180_000,
    });
  });

  it('a shootaround keeps the Phase 3 trio and no AI', () => {
    const session = buildSession({ ...base, mode: 'shootaround' }, court, 1, () => NO_INTENT);
    expect(session.controllers.size).toBe(3);
    expect(session.ais).toEqual([]);
    expect(session.runner.current.settings.mode).toBe('shootaround');
  });
});
