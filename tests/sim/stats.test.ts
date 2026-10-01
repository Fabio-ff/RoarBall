import { describe, expect, it } from 'vitest';
import { DEFAULT_STATS, resolveStats } from '../../src/sim/stats';
import type { CharacterDef, CharacterStats } from '../../src/sim/types';

function def(stats: Partial<CharacterStats>): CharacterDef {
  return {
    id: 't',
    name: 'T',
    description: '',
    stats: {
      speed: 5,
      jump: 5,
      shooting: 5,
      dunking: 5,
      defense: 5,
      power: 5,
      stamina: 5,
      ...stats,
    },
    abilityId: 'none',
    appearance: { primaryColor: 0, secondaryColor: 0 },
  };
}

describe('resolveStats', () => {
  it('all-fives resolves close to the placeholder defaults', () => {
    const s = resolveStats(def({}));
    expect(s.runSpeed).toBeCloseTo(DEFAULT_STATS.runSpeed, 1);
    expect(s.turboSpeed).toBeCloseTo(DEFAULT_STATS.turboSpeed, 1);
    expect(s.jumpSpeed).toBeCloseTo(DEFAULT_STATS.jumpSpeed, 0);
    expect(Math.abs(s.shooting - DEFAULT_STATS.shooting)).toBeLessThan(0.15);
  });

  it('each stat moves its own numbers monotonically', () => {
    const lo = resolveStats(
      def({ speed: 1, jump: 1, shooting: 1, dunking: 1, defense: 1, power: 1, stamina: 1 }),
    );
    const hi = resolveStats(
      def({ speed: 10, jump: 10, shooting: 10, dunking: 10, defense: 10, power: 10, stamina: 10 }),
    );
    expect(hi.runSpeed).toBeGreaterThan(lo.runSpeed);
    expect(hi.turboSpeed).toBeGreaterThan(lo.turboSpeed);
    expect(hi.jumpSpeed).toBeGreaterThan(lo.jumpSpeed);
    expect(hi.shooting).toBeGreaterThan(lo.shooting);
    expect(hi.dunkRangeBonus).toBeGreaterThan(lo.dunkRangeBonus);
    expect(hi.stealReach).toBeGreaterThan(lo.stealReach);
    expect(hi.blockReach).toBeGreaterThan(lo.blockReach);
    expect(hi.stealChance).toBeGreaterThan(lo.stealChance);
    expect(hi.stunTicksDealt).toBeGreaterThan(lo.stunTicksDealt);
    expect(hi.stunResistTicks).toBeGreaterThan(lo.stunResistTicks);
    expect(hi.turboDrainPerTick).toBeLessThan(lo.turboDrainPerTick); // more stamina drains slower
    expect(hi.shooting).toBeLessThanOrEqual(0.9);
    expect(lo.shooting).toBeGreaterThanOrEqual(0.45);
  });
});
