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
      slot: 0,
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

  it('two controllers with the same seed produce the same intents; a different brain seed differs eventually', () => {
    // All four players are AI-driven so the ball is actually played (the brain RNG is drawn when
    // shooting and defending); the match seed is fixed, only the controllers' seed varies.
    const ids = ['home1', 'home2', 'away1', 'away2'];
    const make = (seed: number) =>
      ids.map((id, slot) =>
        createAiController(id, court, {
          profile: AI_PROFILES.fair,
          seed,
          slot: slot % 2,
          favourTeammate: true,
        }),
      );
    const run = (brains: ReturnType<typeof make>): string[] => {
      let s = match(5);
      const log: string[] = [];
      for (let i = 0; i < 1800; i++) {
        const intents = new Map<string, PlayerIntent>(
          brains.map((b) => [b.id, b.controller(s)] as const),
        );
        log.push(JSON.stringify([...intents]));
        s = tick(s, intents, court).state;
      }
      return log;
    };
    const a = run(make(5));
    const b = run(make(5));
    const c = run(make(7));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
