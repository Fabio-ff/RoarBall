import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { decide } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES, type AiProfile } from '../../src/sim/ai/profile';
import { NO_ABILITIES, type AbilityTable } from '../../src/sim/hooks';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type {
  CourtDef,
  MatchSettings,
  MatchState,
  PlayerIntent,
  SimEvent,
} from '../../src/sim/types';

export const court = getCourt('gym');
export const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 7,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
export const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];
/** Overtime guard: a sudden-death match ends at the next basket, well before this. */
const MAX_TICKS = 20_000;

export interface AiRun {
  state: MatchState;
  events: SimEvent[];
  intents: Map<string, PlayerIntent>[];
}

/** Defaults (gym, NO_ABILITIES) are the Phase 4 golden; phase 5 runs pass a court and ABILITIES. */
export interface AiMatchOptions {
  court?: CourtDef;
  abilities?: AbilityTable;
}

/** The initial state for `seed` on `matchCourt` (shared with replays). */
export function startState(seed: number, matchCourt: CourtDef = court): MatchState {
  return createMatch({ ...settings, seed, courtId: matchCourt.id }, matchCourt, roster);
}

/** Four brains (the human slot too) play a full match; every intent is recorded for replay. */
export function playAiMatch(
  seed: number,
  profile: AiProfile = AI_PROFILES.fair,
  options: AiMatchOptions = {},
): AiRun {
  const matchCourt = options.court ?? court;
  const abilities = options.abilities ?? NO_ABILITIES;
  let state = startState(seed, matchCourt);
  const memories = roster.map((e, i) => createAiMemory(e.id, seed, i % 2, e.id === 'home2'));
  const events: SimEvent[] = [];
  const intents: Map<string, PlayerIntent>[] = [];
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    const frame = new Map(
      memories.map((m) => [m.playerId, decide(state, m, profile, matchCourt, abilities)]),
    );
    intents.push(frame);
    const r = tick(state, frame, matchCourt, abilities);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events, intents };
}

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
