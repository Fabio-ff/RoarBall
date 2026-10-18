import { getBounds } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { CANONICAL_CLIPS, parseManifest } from '../../scripts/asset-pipeline/manifest.ts';
import { transformCharacter } from '../../scripts/asset-pipeline/transform.ts';
import { BIND_HIPS, buildFixture, hipsTimes, hipsTranslation, validManifest } from './fixture.ts';

/** Every canonical clip is cut from the fixture's single "take" clip. */
function fixtureManifest() {
  const raw = validManifest();
  const clips = Object.fromEntries(
    CANONICAL_CLIPS.map((name) => [
      name,
      {
        ...raw.clips[name],
        source: 'take',
        start: 0,
        end: 1,
        floorOffset: name === 'fall' ? 0.19 : 0,
      },
    ]),
  );
  return parseManifest({ ...raw, releaseAt: 0.4, clips }, 'fixture');
}

describe('transformCharacter', () => {
  it('produces exactly the canonical clips, drops the raw ones and strips root motion', async () => {
    const { doc } = buildFixture();
    await transformCharacter(doc, fixtureManifest());
    const clips = doc.getRoot().listAnimations();
    expect(clips.map((c) => c.getName())).toEqual([...CANONICAL_CLIPS]);
    const idle = clips.find((c) => c.getName() === 'idle')!;
    const t = hipsTranslation(idle);
    expect(t[0]).toBe(BIND_HIPS[0]);
    expect(t[2]).toBe(BIND_HIPS[2]);
    expect(hipsTimes(idle)[0]).toBe(0);
  });

  it('lifts only the fall clip by the floor offset', async () => {
    const { doc } = buildFixture();
    await transformCharacter(doc, fixtureManifest());
    const by = (name: string) =>
      doc
        .getRoot()
        .listAnimations()
        .find((c) => c.getName() === name)!;
    expect(hipsTranslation(by('fall'))[1]).toBeCloseTo(0.69);
    expect(hipsTranslation(by('idle'))[1]).toBeCloseTo(0.5);
  });

  it('bakes the height and writes releaseAt', async () => {
    const { doc } = buildFixture();
    await transformCharacter(doc, fixtureManifest());
    const scene = doc.getRoot().listScenes()[0];
    const { min, max } = getBounds(scene);
    expect(max[1] - min[1]).toBeCloseTo(1.8, 4);
    expect(scene.listChildren()[0].getExtras()).toEqual({ releaseAt: 0.4 });
  });

  it('writes no orphan keyframe data', async () => {
    const { doc } = buildFixture();
    await transformCharacter(doc, fixtureManifest());
    const root = doc.getRoot();
    // Accessors legitimately in use: keyframes of live animations, mesh data, skin matrices.
    const live = new Set<unknown>();
    for (const animation of root.listAnimations()) {
      for (const sampler of animation.listSamplers()) {
        live.add(sampler.getInput());
        live.add(sampler.getOutput());
      }
    }
    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        live.add(primitive.getIndices());
        for (const semantic of primitive.listSemantics())
          live.add(primitive.getAttribute(semantic));
      }
    }
    for (const skin of root.listSkins()) live.add(skin.getInverseBindMatrices());
    expect(new Set(root.listAccessors())).toEqual(live);
  });

  it('fails clearly when the manifest names a clip the source does not have', async () => {
    const { doc } = buildFixture();
    const m = fixtureManifest();
    m.clips.hit.source = 'nope';
    await expect(transformCharacter(doc, m)).rejects.toThrow(/clip "nope" not in the source/);
  });

  it('rejects a window that runs past the end of the source clip, naming manifest and clip', async () => {
    const { doc } = buildFixture();
    const m = fixtureManifest();
    m.clips.shoot.end = 1.5;
    await expect(transformCharacter(doc, m)).rejects.toThrow(
      'manifest fixture: clip "shoot" window [0, 1.5] exceeds "take" (1s)',
    );
  });

  it('prefixes a subclip error with the manifest id and the canonical clip name', async () => {
    const { doc } = buildFixture();
    const m = fixtureManifest();
    m.clips.hit.start = 0.5;
    m.clips.hit.end = 0.5;
    await expect(transformCharacter(doc, m)).rejects.toThrow(
      /^manifest fixture: clip "hit": clip "take": empty window/,
    );
  });
});
