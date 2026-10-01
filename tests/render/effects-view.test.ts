import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { EffectsView } from '../../src/render/effects-view';

describe('EffectsView.shakeRim', () => {
  it('wobbles the rim group for half a second, then settles at zero', () => {
    const fx = new EffectsView();
    const rim = new Group();
    fx.shakeRim(rim);
    fx.update(0.02);
    expect(rim.rotation.z).not.toBe(0);
    expect(Math.abs(rim.rotation.z)).toBeLessThanOrEqual(0.08);
    fx.update(0.6);
    expect(rim.rotation.z).toBe(0);
  });
});
