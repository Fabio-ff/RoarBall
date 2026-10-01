import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, RANDOM, sanitizeSetup, toGameOptions } from '../../src/app/setup-model';

describe('setup model (spec E.1, plan decisions 5 and 8)', () => {
  it('defaults match the URL defaults: Rook with Ace vs Brick and Dash on the gym, fair', () => {
    expect(DEFAULT_SETUP).toEqual({
      characterId: 'rook',
      teammateId: 'ace',
      opponentIds: ['brick', 'dash'],
      courtId: 'gym',
      aiProfile: 'fair',
    });
  });

  it('sanitizes stored data field by field', () => {
    expect(sanitizeSetup(null)).toEqual(DEFAULT_SETUP);
    expect(
      sanitizeSetup({
        characterId: 'ace',
        teammateId: 'nobody',
        opponentIds: ['random', 7],
        courtId: 'volcano',
        aiProfile: 'hard',
      }),
    ).toEqual({
      characterId: 'ace',
      teammateId: 'ace',
      opponentIds: [RANDOM, 'dash'],
      courtId: 'volcano',
      aiProfile: 'hard',
    });
    expect(
      sanitizeSetup({ opponentIds: 'brick', aiProfile: 'insane', characterId: RANDOM }),
    ).toEqual(DEFAULT_SETUP);
  });

  it('resolves random opponents with the injected rand and builds match options', () => {
    const setup = { ...DEFAULT_SETUP, opponentIds: [RANDOM, RANDOM] as [string, string] };
    const rolls = [0, 0.99];
    const options = toGameOptions(setup, 42, () => rolls.shift() ?? 0);
    expect(options.opponentIds).toEqual(['brick', 'rook']); // characters order: brick, ace, dash, rook
    expect(options).toMatchObject({
      mode: 'match',
      characterId: 'rook',
      teammateId: 'ace',
      courtId: 'gym',
      aiProfile: 'fair',
      seed: 42,
      durationMs: 180_000,
      debug: false,
    });
    expect(toGameOptions(DEFAULT_SETUP, 1, Math.random, true).debug).toBe(true);
  });
});
