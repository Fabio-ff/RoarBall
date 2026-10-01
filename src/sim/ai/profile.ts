/** Spec C.3: one profile type, three presets picked with `?ai=`. */
export type AiProfileId = 'easy' | 'fair' | 'hard';

export interface AiProfile {
  id: AiProfileId;
  /** Ticks a mark's shot or drive must be visible before the AI reacts. */
  reactionTicks: number;
  /** Minimum perceived shot quality to shoot (the shot-clock panic overrides it). */
  shootThreshold: number;
  /** How much better the teammate's shot must be before passing. */
  passBias: number;
  /** ± seeded jitter added to the perceived shot quality. */
  perceptionNoise: number;
  /** Chance per decision tick to press when a steal is on. */
  stealRate: number;
  /** Chance per decision tick to shove a driving mark. */
  shoveRate: number;
  /** Minimum turbo bar before using turbo. */
  turboThreshold: number;
}

export const AI_PROFILES: Readonly<Record<AiProfileId, Readonly<AiProfile>>> = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    reactionTicks: 24,
    shootThreshold: 0.65,
    passBias: 0.15,
    perceptionNoise: 0.15,
    stealRate: 0.2,
    shoveRate: 0.1,
    turboThreshold: 0.6,
  }),
  fair: Object.freeze({
    id: 'fair',
    reactionTicks: 15,
    shootThreshold: 0.55,
    passBias: 0.1,
    perceptionNoise: 0.08,
    stealRate: 0.4,
    shoveRate: 0.3,
    turboThreshold: 0.4,
  }),
  hard: Object.freeze({
    id: 'hard',
    reactionTicks: 8,
    shootThreshold: 0.45,
    passBias: 0,
    perceptionNoise: 0.03,
    stealRate: 0.6,
    shoveRate: 0.5,
    turboThreshold: 0.2,
  }),
});

export const DEFAULT_AI_PROFILE_ID: AiProfileId = 'fair';

export function isAiProfileId(value: string): value is AiProfileId {
  return value === 'easy' || value === 'fair' || value === 'hard';
}
