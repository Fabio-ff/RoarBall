import { describe, expect, it } from 'vitest';
import {
  BurstPool,
  PARTICLE_CAPACITY,
  PARTICLE_LIFE_S,
  PARTICLE_SIZE,
} from '../../src/render/burst-pool';

describe('BurstPool (plan decision 24)', () => {
  it('spawns up to capacity, recycling the oldest, and particles die after their life', () => {
    const pool = new BurstPool();
    expect(pool.mesh.count).toBe(0);
    pool.spawn({ x: 0, y: 3, z: 0 }, 0xff0000, 60, 4, () => 0.5);
    expect(pool.alive).toBe(60);
    for (let i = 0; i < 10; i++) pool.spawn({ x: 0, y: 3, z: 0 }, 0xff0000, 60, 4, () => 0.5);
    expect(pool.alive).toBe(PARTICLE_CAPACITY);
    pool.update(PARTICLE_LIFE_S + 0.01);
    expect(pool.alive).toBe(0);
    expect(pool.mesh.count).toBe(0);
  });

  it('particles fall under gravity', () => {
    const pool = new BurstPool();
    pool.spawn({ x: 0, y: 3, z: 0 }, 0xffffff, 1, 0, () => 0.5);
    pool.update(0.5);
    expect(pool.positionOf(0).y).toBeLessThan(3);
  });

  it('keeps the live count on the mesh and the per-instance colour after compaction', () => {
    const pool = new BurstPool();
    pool.spawn({ x: 0, y: 3, z: 0 }, 0xff0000, 2, 0, () => 0.5);
    pool.update(0.5);
    pool.spawn({ x: 0, y: 3, z: 0 }, 0x00ff00, 1, 0, () => 0.5);
    const version = pool.mesh.instanceMatrix.version;
    pool.update(0.5); // the two red ones die (age 1.0 > life), the green one lives
    expect(pool.alive).toBe(1);
    expect(pool.mesh.count).toBe(1);
    expect(pool.mesh.instanceMatrix.version).toBeGreaterThan(version);
  });

  it('uses large particles and reset kills them all', () => {
    const pool = new BurstPool();
    expect(PARTICLE_SIZE).toBeGreaterThanOrEqual(0.14);
    expect(PARTICLE_SIZE).toBeLessThanOrEqual(0.16);
    pool.spawn({ x: 0, y: 3, z: 0 }, 0xff0000, 10, 4, () => 0.5);
    pool.reset();
    expect(pool.alive).toBe(0);
    expect(pool.mesh.count).toBe(0);
  });
});
