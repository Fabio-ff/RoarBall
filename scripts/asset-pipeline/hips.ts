import type { Document, Node } from '@gltf-transform/core';

export const DEFAULT_HIPS = 'mixamorig:Hips';

/** The node called `name`; throws with the node names that do exist when it is missing. */
export function findNode(doc: Document, name: string): Node {
  const nodes = doc.getRoot().listNodes();
  const node = nodes.find((n) => n.getName() === name);
  if (!node) {
    const known = nodes.slice(0, 8).map((n) => n.getName());
    throw new Error(`node "${name}" not found (first nodes: ${known.join(', ')})`);
  }
  return node;
}
