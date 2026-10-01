import { describe, expect, it } from 'vitest';
import { BallTrail, TRAIL_POINTS } from '../../src/render/ball-trail';
import type { BallState } from '../../src/sim/types';

const ball = (mode: BallState['mode'], x: number): BallState =>
  ({
    pos: { x, y: 3, z: 0 },
    vel: { x: 1, y: 0, z: 0 },
    radius: 0.12,
    mode,
    holder: null,
    flight: null,
    lastShot: null,
    freeTicks: 0,
    touchingRim: false,
    touchingBoard: false,
  }) as BallState;

describe('BallTrail (plan decision 26)', () => {
  it('shows while in flight and fades out 0.3 s after', () => {
    const trail = new BallTrail();
    expect(trail.visible).toBe(false);
    for (let i = 0; i < 30; i++) trail.update(ball('flight', i * 0.1), false, 0.016);
    expect(trail.visible).toBe(true);
    expect(trail.line.geometry.drawRange.count).toBe(TRAIL_POINTS);
    trail.update(ball('held', 3), false, 0.2);
    expect(trail.visible).toBe(true);
    trail.update(ball('held', 3), false, 0.2);
    expect(trail.visible).toBe(false);
  });

  it('glows orange for Hot Hand / Rocket Dunk shots', () => {
    const trail = new BallTrail();
    trail.update(ball('flight', 0), true, 0.016);
    expect(trail.color).toBe(0xff8a00);
    trail.update(ball('flight', 0.1), false, 0.016);
    expect(trail.color).toBe(0xffffff);
  });

  it('puts the newest position first', () => {
    const trail = new BallTrail();
    trail.update(ball('flight', 1), false, 0.016);
    trail.update(ball('flight', 2), false, 0.016);
    const p = trail.line.geometry.getAttribute('position');
    expect(p.getX(0)).toBe(2);
    expect(p.getX(1)).toBe(1);
  });
});
