import { describe, expect, it } from 'vitest';
import { Color, Group } from 'three';
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

describe('EffectsView.spawnBurst', () => {
  it('lightens the team colour and bursts faster when big', () => {
    const fx = new EffectsView();
    fx.spawnBurst({ x: 0, y: 3, z: 0 }, 0x2f80ed, 'small');
    expect(fx.bursts.alive).toBe(24);
    fx.spawnBurst({ x: 0, y: 3, z: 0 }, 0x2f80ed, 'big');
    expect(fx.bursts.alive).toBe(84);
    const colour = new Color();
    fx.bursts.mesh.getColorAt(0, colour);
    expect(colour.getHex()).not.toBe(new Color(0x2f80ed).getHex());
    expect(colour.b).toBeGreaterThan(new Color(0x2f80ed).b - 1e-6);
    expect(colour.r).toBeGreaterThan(new Color(0x2f80ed).r);
  });
});
