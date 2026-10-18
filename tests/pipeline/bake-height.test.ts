import { getBounds } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { bakeHeight, sceneHeight } from '../../scripts/asset-pipeline/bake-height.ts';
import { buildFixture } from './fixture.ts';

describe('bakeHeight', () => {
  it('measures the bind-pose height of the fixture as 1', () => {
    expect(sceneHeight(buildFixture().doc)).toBeCloseTo(1, 5);
  });

  it('wraps the scene in a root node scaled to the requested height', () => {
    const { doc } = buildFixture();
    const root = bakeHeight(doc, 1.8, 0.6);
    const scene = doc.getRoot().listScenes()[0];
    expect(scene.listChildren()).toEqual([root]);
    expect(root.getScale()).toEqual([1.8, 1.8, 1.8]);
    const { min, max } = getBounds(scene);
    expect(max[1] - min[1]).toBeCloseTo(1.8, 5);
  });

  it('writes releaseAt into the root node extras', () => {
    const { doc } = buildFixture();
    expect(bakeHeight(doc, 1.8, 0.6).getExtras()).toEqual({ releaseAt: 0.6 });
  });

  it('keeps the skeleton and the mesh under the wrapper', () => {
    const { doc, hips } = buildFixture();
    const root = bakeHeight(doc, 2, 0.5);
    expect(
      root
        .listChildren()
        .map((c) => c.getName())
        .sort(),
    ).toEqual(['Armature', 'Body']);
    expect(hips.getParentNode()?.getName()).toBe('Armature');
  });
});
