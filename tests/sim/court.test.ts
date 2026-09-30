import { describe, expect, it } from 'vitest';
import { courts, getCourt } from '../../src/content/courts';

describe('court registry', () => {
  it('contains the gym', () => {
    expect(courts.map((c) => c.id)).toContain('gym');
  });

  it('throws for an unknown court', () => {
    expect(() => getCourt('nope')).toThrow(/unknown court/i);
  });

  it('gym hoops are symmetric and inside the play area', () => {
    const gym = getCourt('gym');
    const [left, right] = gym.hoops;
    expect(left.pos.x).toBeCloseTo(-right.pos.x);
    expect(left.pos.z).toBe(0);
    expect(right.pos.z).toBe(0);
    expect(Math.abs(left.pos.x)).toBeLessThan(gym.playArea.length / 2);
    expect(left.rimHeight).toBe(3.05);
    expect(right.rimHeight).toBe(3.05);
  });
});
