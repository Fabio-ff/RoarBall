import type { ResolvedStats } from './types';

/**
 * Stats for the placeholder player until CharacterDef arrives in phase 3.
 * Speeds in m/s, accelerations in m/s². Turbo drains fully in 3 s and refills in 6 s.
 */
export const DEFAULT_STATS: Readonly<ResolvedStats> = Object.freeze({
  runSpeed: 6,
  turboSpeed: 8,
  acceleration: 30,
  deceleration: 40,
  turboDrainPerTick: 1 / 180,
  turboRegenPerTick: 1 / 360,
  shooting: 0.75,
  jumpSpeed: 4.5,
});
