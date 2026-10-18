import type { Document } from '@gltf-transform/core';

export interface MaterialOverrides {
  metalness: number;
  roughness: number;
  /** Also drop the metallic-roughness texture, so the two factors are the final values. */
  flatten?: boolean;
}

export function applyMaterialOverrides(doc: Document, overrides: MaterialOverrides): void {
  for (const material of doc.getRoot().listMaterials()) {
    material.setMetallicFactor(overrides.metalness).setRoughnessFactor(overrides.roughness);
    if (overrides.flatten) material.setMetallicRoughnessTexture(null);
  }
}
