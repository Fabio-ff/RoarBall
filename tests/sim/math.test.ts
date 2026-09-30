import { describe, expect, it } from 'vitest';
import {
  clamp,
  lerp,
  moveTowards,
  v2Length,
  v2Normalize,
  v2Rotate,
  v3Add,
  v3DistanceXZ,
  v3Dot,
  v3Length,
  v3Scale,
  v3Sub,
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

describe('vec3', () => {
  it('adds, subtracts, scales, dots and measures', () => {
    expect(v3Add({ x: 1, y: 2, z: 3 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 2, y: 3, z: 4 });
    expect(v3Sub({ x: 1, y: 2, z: 3 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 0, y: 1, z: 2 });
    expect(v3Scale({ x: 1, y: 2, z: 3 }, 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(v3Dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32);
    expect(v3Length({ x: 2, y: 3, z: 6 })).toBe(7);
    expect(v3DistanceXZ({ x: 0, y: 5, z: 0 }, { x: 3, y: 0, z: 4 })).toBe(5);
  });
});
