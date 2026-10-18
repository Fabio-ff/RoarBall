import { describe, expect, it } from 'vitest';
import { passStartTime, shootClipTime, shotTimeScale } from '../../src/render/release-timing';
import { PASS_TIMING } from '../../src/sim/passing';
import { SHOT_TIMING } from '../../src/sim/shooting';

describe('shotTimeScale (spec F.5.3)', () => {
  it('maps releaseAt onto the sim release tick for each shot', () => {
    expect(shotTimeScale('shoot', 0.45)).toBeCloseTo(1); // jumpshot releases at 27 / 60 = 0.45 s
    expect(shotTimeScale('shoot', 0.6)).toBeCloseTo(0.6 / (SHOT_TIMING.jumpshot.releaseTick / 60));
    expect(shotTimeScale('layup', 0.6)).toBeCloseTo(2.4); // 15 / 60 = 0.25 s
    expect(shotTimeScale('dunk', 0.6)).toBeCloseTo(1.5); // 24 / 60 = 0.4 s
  });
  it('is 1 for actions that are not shots and for a bad releaseAt', () => {
    expect(shotTimeScale('pass', 0.6)).toBe(1);
    expect(shotTimeScale('idle', 0.6)).toBe(1);
    expect(shotTimeScale('shoot', 0)).toBe(1);
    expect(shotTimeScale('shoot', Number.NaN)).toBe(1);
  });
  it('plays the visible release on the sim release tick', () => {
    for (const [action, type] of [
      ['shoot', 'jumpshot'],
      ['layup', 'layup'],
      ['dunk', 'dunk'],
    ] as const) {
      const releaseTick = SHOT_TIMING[type].releaseTick;
      expect(shootClipTime(action, releaseTick, 0.6)).toBeCloseTo(0.6);
    }
  });
});

describe('passStartTime and shootClipTime for a pass (spec F.5.3)', () => {
  it('starts releaseAt minus the pass release time into the clip', () => {
    expect(passStartTime(0.6)).toBeCloseTo(0.6 - PASS_TIMING.releaseTick / 60);
  });
  it('never starts before 0 when releaseAt is shorter than the pass release time', () => {
    expect(passStartTime(0.02)).toBe(0);
  });
  it('a pass reaches the release pose on the pass release tick', () => {
    expect(shootClipTime('pass', PASS_TIMING.releaseTick, 0.6)).toBeCloseTo(0.6);
    expect(shootClipTime('pass', 0, 0.6)).toBeCloseTo(passStartTime(0.6));
  });
  it('a view that first sees an action late still lands on the right frame (alley-oop)', () => {
    const late = SHOT_TIMING.dunk.releaseTick - 1;
    expect(shootClipTime('dunk', late, 0.6)).toBeLessThan(0.6);
    expect(shootClipTime('dunk', late, 0.6)).toBeGreaterThan(0.5);
  });
  it('treats negative ticks as 0', () => {
    expect(shootClipTime('shoot', -3, 0.6)).toBe(0);
  });
});
