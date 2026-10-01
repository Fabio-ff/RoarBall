import { describe, expect, it } from 'vitest';
import { characters, DEFAULT_CHARACTER_ID, getCharacter } from '../../src/content/characters';

describe('character registry', () => {
  it('has the four launch characters with unique ids and valid stats', () => {
    expect(characters.map((c) => c.id).sort()).toEqual(['ace', 'brick', 'dash', 'rook']);
    for (const c of characters) {
      for (const [key, value] of Object.entries(c.stats)) {
        expect(Number.isInteger(value), `${c.id}.${key}`).toBe(true);
        expect(value, `${c.id}.${key}`).toBeGreaterThanOrEqual(1);
        expect(value, `${c.id}.${key}`).toBeLessThanOrEqual(10);
      }
      expect(c.abilityId.length).toBeGreaterThan(0);
    }
  });

  it('resolves the default and rejects unknown ids', () => {
    expect(getCharacter(DEFAULT_CHARACTER_ID).name).toBe('Rook');
    expect(() => getCharacter('nope')).toThrow(/unknown character/i);
  });
});
