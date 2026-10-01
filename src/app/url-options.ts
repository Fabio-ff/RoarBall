import { courts, DEFAULT_COURT_ID } from '../content/courts';
import { characters, DEFAULT_CHARACTER_ID } from '../content/characters';
import { DEFAULT_AI_PROFILE_ID, isAiProfileId, type AiProfileId } from '../sim/ai/profile';
import type { MatchMode } from '../sim/types';

/** Everything the menus will choose in phase 6, read from the query string for now (spec C.1). */
export interface GameOptions {
  mode: MatchMode;
  characterId: string;
  teammateId: string;
  opponentIds: [string, string];
  courtId: string;
  aiProfile: AiProfileId;
  seed: number;
  debug: boolean;
  /** Match length (spec A.5 default; `?duration=` seconds, E.1). */
  durationMs: number;
}

export const DEFAULT_DURATION_MS = 180_000;
export const MATCH_PARAMS = [
  'mode',
  'character',
  'teammate',
  'opponents',
  'court',
  'ai',
  'seed',
  'duration',
] as const;
export const DEFAULT_TEAMMATE_ID = 'ace';
export const DEFAULT_OPPONENT_IDS: readonly [string, string] = ['brick', 'dash'];
/** Shootaround stays reproducible run to run, as in Phase 3. */
export const SHOOTAROUND_SEED = 1;

function characterOr(value: string | null | undefined, fallback: string): string {
  return value && characters.some((c) => c.id === value) ? value : fallback;
}

function courtOr(value: string | null): string {
  return value && courts.some((c) => c.id === value) ? value : DEFAULT_COURT_ID;
}

/** Spec E.1: any match parameter skips the menus; `?debug` alone does not. */
export function hasMatchParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return MATCH_PARAMS.some((name) => params.has(name));
}

function durationOr(value: string | null): number {
  const seconds = Number.parseInt(value ?? '', 10);
  return Number.isFinite(seconds) && seconds >= 5 && seconds <= 600
    ? seconds * 1000
    : DEFAULT_DURATION_MS;
}

/** `now` (ms) seeds a match when `?seed=` is absent, so every game is different. */
export function readGameOptions(search: string, now: number): GameOptions {
  const params = new URLSearchParams(search);
  const mode: MatchMode = params.get('mode') === 'shootaround' ? 'shootaround' : 'match';
  const requested = (params.get('opponents') ?? '').split(',');
  const ai = params.get('ai');
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed =
    Number.isFinite(seedParam) && seedParam >= 0
      ? seedParam
      : mode === 'match'
        ? now >>> 0
        : SHOOTAROUND_SEED;
  return {
    mode,
    characterId: characterOr(params.get('character'), DEFAULT_CHARACTER_ID),
    teammateId: characterOr(params.get('teammate'), DEFAULT_TEAMMATE_ID),
    opponentIds: [
      characterOr(requested[0], DEFAULT_OPPONENT_IDS[0]),
      characterOr(requested[1], DEFAULT_OPPONENT_IDS[1]),
    ],
    courtId: courtOr(params.get('court')),
    aiProfile: ai !== null && isAiProfileId(ai) ? ai : DEFAULT_AI_PROFILE_ID,
    seed,
    debug: params.has('debug'),
    durationMs: durationOr(params.get('duration')),
  };
}
