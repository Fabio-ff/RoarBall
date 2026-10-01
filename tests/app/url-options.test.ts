import { describe, expect, it } from 'vitest';
import { readGameOptions } from '../../src/app/url-options';

describe('readGameOptions (spec C.1)', () => {
  it('defaults to a fair 2v2 match seeded from the clock', () => {
    const o = readGameOptions('', 123_456);
    expect(o).toEqual({
      mode: 'match',
      characterId: 'rook',
      teammateId: 'ace',
      opponentIds: ['brick', 'dash'],
      aiProfile: 'fair',
      seed: 123_456,
      debug: false,
    });
  });

  it('reads every parameter and ignores unknown ids', () => {
    const o = readGameOptions(
      '?mode=match&character=dash&teammate=brick&opponents=ace,rook&ai=hard&seed=42&debug',
      0,
    );
    expect(o).toMatchObject({
      characterId: 'dash',
      teammateId: 'brick',
      opponentIds: ['ace', 'rook'],
      aiProfile: 'hard',
      seed: 42,
      debug: true,
    });
    const bad = readGameOptions('?character=zorg&teammate=nope&opponents=x&ai=brutal&seed=-3', 9);
    expect(bad).toMatchObject({
      characterId: 'rook',
      teammateId: 'ace',
      opponentIds: ['brick', 'dash'],
      aiProfile: 'fair',
      seed: 9,
    });
  });

  it('shootaround keeps the fixed seed unless one is given', () => {
    expect(readGameOptions('?mode=shootaround', 777).seed).toBe(1);
    expect(readGameOptions('?mode=shootaround&seed=5', 777).seed).toBe(5);
    expect(readGameOptions('?mode=shootaround', 777).mode).toBe('shootaround');
    expect(readGameOptions('?mode=bogus', 777).mode).toBe('match');
  });
});
