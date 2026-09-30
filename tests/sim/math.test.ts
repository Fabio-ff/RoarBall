import { describe, expect, it } from 'vitest';
import {
  clamp,
  lerp,
  moveTowards,
  v2Length,
  v2Normalize,
  v2Rotate,
  wrapAngle,
} from '../../src/sim/math';

describe('math', () => {
  it('normalizes vectors and leaves zero as zero', () => {
    expect(v2Normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(v2Normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('measures length', () => {
    expect(v2Length({ x: 3, y: 4 })).toBe(5);
  });

  it('rotates counter-clockwise by radians', () => {
    const r = v2Rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  it('clamps and lerps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it('moves towards a target without overshooting', () => {
    expect(moveTowards(0, 10, 3)).toBe(3);
    expect(moveTowards(9, 10, 3)).toBe(10);
    expect(moveTowards(0, -10, 3)).toBe(-3);
  });

  it('wraps angles into [-PI, PI)', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
