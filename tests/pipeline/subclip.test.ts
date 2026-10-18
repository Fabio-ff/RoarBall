import { describe, expect, it } from 'vitest';
import { dropClips, subclip } from '../../scripts/asset-pipeline/subclip.ts';
import { buildFixture, hipsTimes, hipsTranslation } from './fixture.ts';

describe('subclip', () => {
  it('cuts a window, shifts times to 0 and interpolates the edges', () => {
    const { doc, take } = buildFixture();
    const cut = subclip(doc, take, 'shoot', 0.25, 0.75);
    expect(cut.getName()).toBe('shoot');
    expect(Array.from(hipsTimes(cut))).toEqual([0, 0.25, 0.5]);
    const t = hipsTranslation(cut);
    expect(t[0]).toBeCloseTo(1.5); // x halfway between keys 0 and 1
    expect(t[3]).toBeCloseTo(2); // the key at 0.5 s
    expect(t[6]).toBeCloseTo(2.5); // x halfway between keys 1 and 2
    expect(t[7]).toBeCloseTo(0.55);
  });

  it('slerps rotations and keeps them unit length', () => {
    const { doc, take } = buildFixture();
    const cut = subclip(doc, take, 'c', 0.25, 0.75);
    const channel = cut.listChannels().find((c) => c.getTargetPath() === 'rotation')!;
    const q = Array.from(channel.getSampler()!.getOutput()!.getArray()!).slice(0, 4);
    expect(Math.hypot(...q)).toBeCloseTo(1, 5);
    expect(q[1]).toBeGreaterThan(0.3); // a quarter of the way to the 90 degree turn about Y: sin(22.5°) ≈ 0.38
    expect(q[1]).toBeLessThan(0.4);
  });

  it('truncates a window past the end of the clip', () => {
    const { doc, take } = buildFixture();
    const cut = subclip(doc, take, 'c', 0.5, 5);
    const times = hipsTimes(cut);
    expect(times[times.length - 1]).toBeCloseTo(0.5);
  });

  it('rejects an empty window', () => {
    const { doc, take } = buildFixture();
    expect(() => subclip(doc, take, 'c', 2, 3)).toThrow(/empty window/);
  });

  it('dropClips removes the source clip and its keyframe data once pruned', () => {
    const { doc, take } = buildFixture();
    subclip(doc, take, 'shoot', 0, 1);
    dropClips([take]);
    expect(
      doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    ).toEqual(['shoot']);
    expect(doc.getRoot().listAnimations()[0].listChannels()).toHaveLength(2);
  });
});
