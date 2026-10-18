import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../scripts/asset-pipeline/manifest.ts';
import { validManifest } from './fixture.ts';

describe('parseManifest', () => {
  it('accepts a full manifest and fills the defaults', () => {
    const m = parseManifest(validManifest(), 'ace');
    expect(m.id).toBe('ace');
    expect(m.hipsNode).toBe('mixamorig:Hips');
    expect(m.clips.idle.floorOffset).toBe(0);
    expect(m.clips.fall.floorOffset).toBe(0.19);
    expect(m.materials.flatten).toBe(false);
  });

  it('rejects a missing canonical clip', () => {
    const raw = validManifest();
    const clips = Object.fromEntries(Object.entries(raw.clips).filter(([name]) => name !== 'hit'));
    expect(() => parseManifest({ ...raw, clips }, 'ace')).toThrow(/missing clip "hit"/);
  });

  it('rejects an empty or negative window', () => {
    const raw = validManifest();
    raw.clips.run.end = 0;
    expect(() => parseManifest(raw, 'ace')).toThrow(/clip "run": need 0 <= start < end/);
  });

  it('rejects a loop flag that disagrees with the canonical name', () => {
    const raw = validManifest();
    raw.clips.jump.loop = true;
    expect(() => parseManifest(raw, 'ace')).toThrow(/clip "jump": loop must be false/);
  });

  it('rejects a releaseAt outside the shoot clip', () => {
    const raw = validManifest();
    raw.releaseAt = 5;
    expect(() => parseManifest(raw, 'ace')).toThrow(/releaseAt/);
  });

  it('rejects a non-object and a bad height', () => {
    expect(() => parseManifest(null, 'ace')).toThrow(/must be an object/);
    const raw = validManifest();
    raw.height = 0;
    expect(() => parseManifest(raw, 'ace')).toThrow(/height/);
  });
});
