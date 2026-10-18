import { getBounds, type Document, type Node } from '@gltf-transform/core';

/** Height (Y extent) of the first scene's bounding box, in the file's own units. */
export function sceneHeight(doc: Document): number {
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) throw new Error('no scene');
  const { min, max } = getBounds(scene);
  return max[1] - min[1];
}

/**
 * Wraps the scene's children in a root node scaled by `height / bindHeight` whose extras hold
 * `{ releaseAt }`; returns that node. `bindHeight` is measured before wrapping.
 */
export function bakeHeight(doc: Document, height: number, releaseAt: number): Node {
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) throw new Error('no scene');
  const bindHeight = sceneHeight(doc);
  if (!(bindHeight > 0)) throw new Error('the model has no height');
  const factor = height / bindHeight;
  const root = doc
    .createNode('model-root')
    .setScale([factor, factor, factor])
    .setExtras({ releaseAt });
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    root.addChild(child);
  }
  scene.addChild(root);
  return root;
}
