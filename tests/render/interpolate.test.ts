import { describe, expect, it } from 'vitest';
import { lerpAngle, lerpVec3 } from '../../src/render/interpolate';

describe('interpolate', () => {
  it('lerps vectors component-wise', () => {
    expect(lerpVec3({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: -2 }, 0.5)).toEqual({
      x: 1,
      y: 2,
      z: -1,
    });
  });

  it('lerps angles along the shortest arc across the -PI/PI seam', () => {
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1;
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(1e-9);
  });

  it('returns the endpoints at t = 0 and t = 1', () => {
    expect(lerpAngle(0.3, 1.2, 0)).toBeCloseTo(0.3);
    expect(lerpAngle(0.3, 1.2, 1)).toBeCloseTo(1.2);
  });
});
