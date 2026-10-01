import { describe, expect, it } from 'vitest';
import { DEFAULT_DURATION_MS, hasMatchParams, readGameOptions } from '../../src/app/url-options';

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
      courtId: 'gym',
      durationMs: 180_000,
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

  it('reads ?court= and falls back to the gym (spec D.1)', () => {
    expect(readGameOptions('?court=rooftop', 0).courtId).toBe('rooftop');
    expect(readGameOptions('?court=frozen&seed=3', 0).courtId).toBe('frozen');
    expect(readGameOptions('?court=moon', 0).courtId).toBe('gym');
    expect(readGameOptions('', 0).courtId).toBe('gym');
  });
});

describe('hasMatchParams (spec E.1 URL shortcuts)', () => {
  it('is false for a bare URL or debug alone', () => {
    expect(hasMatchParams('')).toBe(false);
    expect(hasMatchParams('?debug')).toBe(false);
  });
  it.each([
    'mode=shootaround',
    'character=ace',
    'teammate=dash',
    'opponents=a,b',
    'court=volcano',
    'ai=hard',
    'seed=3',
    'duration=20',
  ])('is true with %s', (param) => {
    expect(hasMatchParams(`?${param}`)).toBe(true);
    expect(hasMatchParams(`?debug&${param}`)).toBe(true);
  });
});

describe('duration', () => {
  it('defaults to 180 s and reads ?duration= seconds within 5..600', () => {
    expect(readGameOptions('', 0).durationMs).toBe(DEFAULT_DURATION_MS);
    expect(DEFAULT_DURATION_MS).toBe(180_000);
    expect(readGameOptions('?duration=20', 0).durationMs).toBe(20_000);
    expect(readGameOptions('?duration=2', 0).durationMs).toBe(DEFAULT_DURATION_MS);
    expect(readGameOptions('?duration=601', 0).durationMs).toBe(DEFAULT_DURATION_MS);
    expect(readGameOptions('?duration=abc', 0).durationMs).toBe(DEFAULT_DURATION_MS);
  });
});
