import type { Document } from '@gltf-transform/core';
import { DEFAULT_HIPS, findNode } from './hips.ts';

/**
 * Removes root motion: in every clip the X and Z of the hips translation keyframes are set to the
 * bind-pose X and Z, Y (the bounce of the hips) is kept. `hipsName` is the glTF node name,
 * with the colon (GLTFLoader only strips it at runtime).
 */
export function stripRootMotion(doc: Document, hipsName: string = DEFAULT_HIPS): void {
  const hips = findNode(doc, hipsName);
  const [bindX, , bindZ] = hips.getTranslation();
  for (const clip of doc.getRoot().listAnimations()) {
    for (const channel of clip.listChannels()) {
      if (channel.getTargetNode() !== hips || channel.getTargetPath() !== 'translation') continue;
      const output = channel.getSampler()?.getOutput();
      if (!output) continue;
      const values = output.getArray() as Float32Array;
      for (let i = 0; i + 2 < values.length; i += 3) {
        values[i] = bindX;
        values[i + 2] = bindZ;
      }
    }
  }
}
