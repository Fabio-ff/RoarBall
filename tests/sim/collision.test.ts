import { describe, expect, it } from 'vitest';
import {
  reflect,
  sphereVsBox,
  sphereVsCapsule,
  sphereVsFloor,
  sphereVsRing,
} from '../../src/sim/collision';

describe('collision primitives', () => {
  it('floor: contact only when the sphere dips below y = 0', () => {
    expect(sphereVsFloor({ x: 0, y: 0.5, z: 0 }, 0.12)).toBeNull();
    const c = sphereVsFloor({ x: 0, y: 0.05, z: 0 }, 0.12);
    expect(c?.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(c?.depth).toBeCloseTo(0.07);
  });

  it('box: contact from the outside pushes along the closest face', () => {
    const c = sphereVsBox({ x: 1.1, y: 0, z: 0 }, 0.2, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(c?.normal.x).toBeCloseTo(1);
    expect(c?.depth).toBeCloseTo(0.1);
    expect(
      sphereVsBox({ x: 1.5, y: 0, z: 0 }, 0.2, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
    ).toBeNull();
  });

  it('box: a centre inside the box is pushed out along the least-penetrated axis', () => {
    const c = sphereVsBox({ x: 0.9, y: 0, z: 0 }, 0.2, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(c?.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(c?.depth).toBeCloseTo(0.3);
  });

  it('ring: contact near the tube, none through the middle or far away', () => {
    const ringCenter = { x: 0, y: 3.05, z: 0 };
    expect(sphereVsRing({ x: 0, y: 3.05, z: 0 }, 0.12, ringCenter, 0.225, 0.03)).toBeNull();
    expect(sphereVsRing({ x: 1, y: 3.05, z: 0 }, 0.12, ringCenter, 0.225, 0.03)).toBeNull();
    const onTop = sphereVsRing({ x: 0.225, y: 3.05 + 0.1, z: 0 }, 0.12, ringCenter, 0.225, 0.03);
    expect(onTop?.normal.y).toBeCloseTo(1);
    expect(onTop?.depth).toBeCloseTo(0.05);
    const outside = sphereVsRing({ x: 0.3, y: 3.05, z: 0 }, 0.12, ringCenter, 0.225, 0.03);
    expect(outside?.normal.x).toBeCloseTo(1);
  });

  it('capsule: overlap test against a vertical segment', () => {
    const a = { x: 0, y: 0.35, z: 0 };
    const b = { x: 0, y: 1.55, z: 0 };
    expect(sphereVsCapsule({ x: 0.5, y: 1, z: 0 }, 0.12, a, b, 0.6)).toBe(true);
    expect(sphereVsCapsule({ x: 0.9, y: 1, z: 0 }, 0.12, a, b, 0.6)).toBe(false);
    expect(sphereVsCapsule({ x: 0, y: 2.5, z: 0 }, 0.12, a, b, 0.6)).toBe(false);
  });

  it('reflect: bounces the normal component with restitution and damps the tangent', () => {
    const v = reflect({ x: 2, y: -4, z: 0 }, { x: 0, y: 1, z: 0 }, 0.75);
    expect(v.y).toBeCloseTo(3);
    expect(v.x).toBeCloseTo(1.7);
    expect(reflect({ x: 2, y: 4, z: 0 }, { x: 0, y: 1, z: 0 }, 0.75)).toEqual({ x: 2, y: 4, z: 0 });
  });
});
