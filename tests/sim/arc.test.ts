import { describe, expect, it } from 'vitest';
import { arcPoint, flightTimeFor, solveArcVelocity } from '../../src/sim/arc';

describe('arc solver', () => {
  it('passes through the target at the flight time, within 1 mm', () => {
    const from = { x: -2, y: 2.1, z: 1 };
    const to = { x: 4.3, y: 3.1, z: -0.5 };
    const v = solveArcVelocity(from, to, 1.3, 9.81);
    const p = arcPoint(from, v, 9.81, 1.3);
    expect(Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z)).toBeLessThan(0.001);
  });

  it('rises above both endpoints on the way', () => {
    const from = { x: 0, y: 2, z: 0 };
    const to = { x: 5, y: 3.05, z: 0 };
    const v = solveArcVelocity(from, to, 1.2, 9.81);
    expect(arcPoint(from, v, 9.81, 0.6).y).toBeGreaterThan(3.05);
  });

  it('derives a bounded flight time from distance', () => {
    expect(flightTimeFor(0)).toBeCloseTo(0.9);
    expect(flightTimeFor(5)).toBeCloseTo(1.3);
    expect(flightTimeFor(50)).toBeCloseTo(2.0);
  });
});
