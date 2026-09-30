import { describe, expect, it } from 'vitest';
import { dribbleHeight } from '../../src/render/ball-view';
import { BALL_RADIUS } from '../../src/sim/constants';

describe('dribbleHeight', () => {
  it('bounces between the floor and the hand', () => {
    const hand = 0.95;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 60; t++) {
      const y = dribbleHeight(hand, t);
      min = Math.min(min, y);
      max = Math.max(max, y);
      expect(y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-9);
      expect(y).toBeLessThanOrEqual(hand + 1e-9);
    }
    expect(min).toBeLessThan(0.3);
    expect(max).toBeGreaterThan(0.8);
  });
});
