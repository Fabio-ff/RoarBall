import { describe, expect, it } from 'vitest';
import { applyMaterialOverrides } from '../../scripts/asset-pipeline/materials.ts';
import { buildFixture } from './fixture.ts';

describe('applyMaterialOverrides', () => {
  it('sets metalness and roughness on every material', () => {
    const { doc } = buildFixture();
    doc.createMaterial('second');
    applyMaterialOverrides(doc, { metalness: 0.1, roughness: 0.7 });
    for (const m of doc.getRoot().listMaterials()) {
      expect(m.getMetallicFactor()).toBe(0.1);
      expect(m.getRoughnessFactor()).toBe(0.7);
    }
  });

  it('drops the metallic-roughness texture only when asked to flatten', () => {
    const { doc } = buildFixture();
    const texture = doc
      .createTexture('mr')
      .setImage(new Uint8Array([1]))
      .setMimeType('image/png');
    const material = doc.getRoot().listMaterials()[0].setMetallicRoughnessTexture(texture);
    applyMaterialOverrides(doc, { metalness: 0.1, roughness: 0.7 });
    expect(material.getMetallicRoughnessTexture()).toBe(texture);
    applyMaterialOverrides(doc, { metalness: 0.1, roughness: 0.7, flatten: true });
    expect(material.getMetallicRoughnessTexture()).toBeNull();
  });
});
