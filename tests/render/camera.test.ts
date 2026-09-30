import { describe, expect, it } from 'vitest';
import { computeCameraPose } from '../../src/render/camera';

describe('computeCameraPose', () => {
  it('sits on the +Z sideline, elevated, looking at the court', () => {
    const pose = computeCameraPose({ x: 0, y: 0, z: 0 }, 16 / 9);
    expect(pose.position.z).toBeGreaterThan(0);
    expect(pose.position.y).toBeGreaterThan(5);
    expect(pose.lookAt.z).toBe(0);
  });

  it('follows the target along X with damping', () => {
    const left = computeCameraPose({ x: -10, y: 0, z: 0 }, 16 / 9);
    const right = computeCameraPose({ x: 10, y: 0, z: 0 }, 16 / 9);
    expect(left.position.x).toBeLessThan(0);
    expect(right.position.x).toBeGreaterThan(0);
    expect(Math.abs(left.position.x)).toBeLessThan(10);
    expect(left.lookAt.x).toBe(left.position.x);
  });

  it('pulls back and rises in portrait so the court still fits', () => {
    const landscape = computeCameraPose({ x: 0, y: 0, z: 0 }, 16 / 9);
    const portrait = computeCameraPose({ x: 0, y: 0, z: 0 }, 9 / 16);
    expect(portrait.position.z).toBeGreaterThan(landscape.position.z);
    expect(portrait.position.y).toBeGreaterThan(landscape.position.y);
  });
});
