import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import {
  attackingHoopIndex,
  BOARD_OFFSET,
  hoopGeometry,
  nearestHoopIndex,
} from '../../src/sim/hoop';

const court = getCourt('gym');

describe('hoop geometry', () => {
  it('puts the rim at rim height over the hoop position and the board behind it', () => {
    const right = hoopGeometry(court, 1);
    expect(right.side).toBe(1);
    expect(right.rimCenter).toEqual({ x: 12.425, y: 3.05, z: 0 });
    expect(right.boardCenter.x).toBeCloseTo(12.425 + BOARD_OFFSET);
    expect(right.boardCenter.y).toBeCloseTo(3.35);
    const left = hoopGeometry(court, 0);
    expect(left.side).toBe(-1);
    expect(left.boardCenter.x).toBeCloseTo(-12.425 - BOARD_OFFSET);
  });

  it('team 0 attacks the +X hoop and team 1 the -X hoop', () => {
    expect(court.hoops[attackingHoopIndex(court, 0)].pos.x).toBeGreaterThan(0);
    expect(court.hoops[attackingHoopIndex(court, 1)].pos.x).toBeLessThan(0);
  });

  it('finds the nearest hoop', () => {
    expect(nearestHoopIndex(court, { x: -5, y: 0, z: 0 })).toBe(0);
    expect(nearestHoopIndex(court, { x: 5, y: 0, z: 0 })).toBe(1);
  });
});
