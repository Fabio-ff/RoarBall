import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch, findPlayer } from '../../src/sim/match';
import { abilityLines } from '../../src/ui/debug-overlay';

describe('abilityLines (spec D.6 ?debug)', () => {
  it('lists every player’s charge and active ability', () => {
    const s = createMatch(
      {
        durationMs: 180_000,
        shotClockMs: 14_000,
        seed: 1,
        ruleIds: [],
        courtId: 'gym',
        mode: 'match',
      },
      getCourt('gym'),
      [
        { id: 'home1', team: 0, characterId: 'brick', character: getCharacter('brick') },
        { id: 'home2', team: 0, characterId: 'ace', character: getCharacter('ace') },
        { id: 'away1', team: 1, characterId: 'dash', character: getCharacter('dash') },
      ],
    );
    const home1 = findPlayer(s, 'home1');
    const home2 = findPlayer(s, 'home2');
    const away1 = findPlayer(s, 'away1');
    if (!home1 || !home2 || !away1) throw new Error('setup');
    home1.charge = 42.4;
    home2.ability = { ticksLeft: null, uses: 2 };
    away1.ability = { ticksLeft: 120, uses: 0 };
    expect(abilityLines(s)).toEqual(['home1 42%', 'home2 0% hotHand 2 left', 'away1 0% blur 120t']);
  });
});
