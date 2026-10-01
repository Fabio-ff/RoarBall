import { DEFAULT_CHARACTER_ID, characters } from '../content/characters';
import { DEFAULT_COURT_ID, courts } from '../content/courts';
import { DEFAULT_AI_PROFILE_ID, isAiProfileId, type AiProfileId } from '../sim/ai/profile';
import {
  DEFAULT_DURATION_MS,
  DEFAULT_OPPONENT_IDS,
  DEFAULT_TEAMMATE_ID,
  type GameOptions,
} from './url-options';

/** An opponent slot that is rolled when the match starts (spec E.1). */
export const RANDOM = 'random';

export interface SetupChoice {
  characterId: string;
  teammateId: string;
  /** Character ids or RANDOM. */
  opponentIds: [string, string];
  courtId: string;
  aiProfile: AiProfileId;
}

export const DEFAULT_SETUP: Readonly<SetupChoice> = Object.freeze({
  characterId: DEFAULT_CHARACTER_ID,
  teammateId: DEFAULT_TEAMMATE_ID,
  opponentIds: [DEFAULT_OPPONENT_IDS[0], DEFAULT_OPPONENT_IDS[1]] as [string, string],
  courtId: DEFAULT_COURT_ID,
  aiProfile: DEFAULT_AI_PROFILE_ID,
});

const isCharacter = (v: unknown): v is string =>
  typeof v === 'string' && characters.some((c) => c.id === v);

/** Stored data → a valid setup; anything unknown falls back to the default field (plan decision 8). */
export function sanitizeSetup(raw: Record<string, unknown> | null): SetupChoice {
  const r = raw ?? {};
  const opp = Array.isArray(r.opponentIds) ? (r.opponentIds as unknown[]) : [];
  const slot = (i: 0 | 1): string => {
    const v = opp[i];
    return v === RANDOM || isCharacter(v) ? (v as string) : DEFAULT_SETUP.opponentIds[i];
  };
  return {
    characterId: isCharacter(r.characterId) ? r.characterId : DEFAULT_SETUP.characterId,
    teammateId: isCharacter(r.teammateId) ? r.teammateId : DEFAULT_SETUP.teammateId,
    opponentIds: [slot(0), slot(1)],
    courtId:
      typeof r.courtId === 'string' && courts.some((c) => c.id === r.courtId)
        ? r.courtId
        : DEFAULT_SETUP.courtId,
    aiProfile:
      typeof r.aiProfile === 'string' && isAiProfileId(r.aiProfile)
        ? r.aiProfile
        : DEFAULT_SETUP.aiProfile,
  };
}

/** Rolls RANDOM slots (outside the sim, so Math.random is fine) and builds the match options. */
export function toGameOptions(
  setup: SetupChoice,
  seed: number,
  rand: () => number = Math.random,
  debug = false,
): GameOptions {
  const roll = (id: string): string =>
    id === RANDOM
      ? (characters[Math.min(characters.length - 1, Math.floor(rand() * characters.length))]?.id ??
        DEFAULT_SETUP.opponentIds[0])
      : id;
  return {
    mode: 'match',
    characterId: setup.characterId,
    teammateId: setup.teammateId,
    opponentIds: [roll(setup.opponentIds[0]), roll(setup.opponentIds[1])],
    courtId: setup.courtId,
    aiProfile: setup.aiProfile,
    seed,
    durationMs: DEFAULT_DURATION_MS,
    debug,
  };
}
