import type { CharacterDef, ResolvedStats } from './types';

/**
 * Stats for the placeholder player and for tests. Speeds in m/s, accelerations in m/s².
 * Turbo drains fully in 3 s and refills in 6 s. Kept fixed so existing tests and the
 * golden runs do not move when the character table is tuned.
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
  defense: 5,
  power: 5,
  dunkRangeBonus: 0.2,
  stealReach: 1.02,
  blockReach: 1.32,
  stealChance: 0.45,
  stunTicksDealt: 60,
  stunResistTicks: 15,
});

/**
 * The one tuning table (spec §5.1): 1..10 stats → simulation units. Rebalancing the cast means
 * editing these lines, not the characters.
 */
export function resolveStats(def: CharacterDef): ResolvedStats {
  const s = def.stats;
  const runSpeed = 5.2 + 0.2 * (s.speed - 1);
  return {
    runSpeed,
    turboSpeed: runSpeed + 2,
    acceleration: 30,
    deceleration: 40,
    turboDrainPerTick: 1 / (120 + 12 * s.stamina),
    turboRegenPerTick: 1 / 360,
    shooting: 0.45 + 0.04 * s.shooting,
    jumpSpeed: 3.9 + 0.1 * s.jump,
    defense: s.defense,
    power: s.power,
    dunkRangeBonus: 0.05 * (s.dunking - 1),
    stealReach: 0.9 + 0.03 * (s.defense - 1),
    blockReach: 1.2 + 0.03 * (s.defense - 1),
    stealChance: 0.2 + 0.05 * s.defense,
    stunTicksDealt: 30 + 6 * s.power,
    stunResistTicks: 3 * s.power,
  };
}
