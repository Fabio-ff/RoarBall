import { describe, expect, it } from 'vitest';
import { createAiController } from '../../src/app/ai-controller';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchState, PlayerIntent } from '../../src/sim/types';

const court = getCourt('gym');
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function match(seed: number): MatchState {
  return createMatch(
    {
      durationMs: 180_000,
      shotClockMs: 14_000,
      seed,
      ruleIds: ['shotClock'],
      courtId: 'gym',
      mode: 'match',
    },
    court,
    roster,
  );
}

describe('createAiController', () => {
  it('drives a player through the Controller signature and exposes its goal for the overlay', () => {
    const ai = createAiController('away1', court, {
      profile: AI_PROFILES.fair,
      seed: 3,
      offset: 2,
      favourTeammate: false,
    });
    let s = match(3);
    for (let i = 0; i < 120; i++) {
      s = tick(s, new Map<string, PlayerIntent>([['away1', ai.controller(s)]]), court).state;
    }
    expect(ai.id).toBe('away1');
    expect(ai.memory.playerId).toBe('away1');
    expect(ai.memory.goal.kind).not.toBe('idle');
  });

  it('two controllers with the same seed produce the same intents; a different seed differs eventually', () => {
    const make = (seed: number) =>
      createAiController('home2', court, {
        profile: AI_PROFILES.fair,
        seed,
        offset: 1,
        favourTeammate: true,
      });
    const a = make(5);
    const b = make(5);
    const c = make(7);
    let sa = match(5);
    let sb = match(5);
    let sc = match(7);
    let differed = false;
    for (let i = 0; i < 600; i++) {
      const ia = a.controller(sa);
      const ib = b.controller(sb);
      const ic = c.controller(sc);
      expect(ia).toEqual(ib);
      if (JSON.stringify(ia) !== JSON.stringify(ic)) differed = true;
      sa = tick(sa, new Map([['home2', ia]]), court).state;
      sb = tick(sb, new Map([['home2', ib]]), court).state;
      sc = tick(sc, new Map([['home2', ic]]), court).state;
    }
    expect(differed).toBe(true);
  });
});
