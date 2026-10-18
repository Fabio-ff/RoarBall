import type { Document } from '@gltf-transform/core';
import { DEFAULT_HIPS, findNode } from './hips.ts';

/**
 * Lifts the hips Y keys of clip `clipName` by up to `offset` (source-model metres), scaled by how
 * far each key has descended from the hips' bind-pose Y towards the clip's lowest key: a standing
 * key gets 0, the lowest (lying) key the full offset. A clip without descent is left alone.
 */
export function offsetHipsY(
  doc: Document,
  clipName: string,
  offset: number,
  hipsName: string = DEFAULT_HIPS,
): void {
  if (offset === 0) return;
  const clip = doc
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === clipName);
  if (!clip) throw new Error(`clip "${clipName}" not found`);
  const hips = findNode(doc, hipsName);
  const bindY = hips.getTranslation()[1];
  for (const channel of clip.listChannels()) {
    if (channel.getTargetNode() !== hips || channel.getTargetPath() !== 'translation') continue;
    const output = channel.getSampler()?.getOutput();
    if (!output) continue;
    const values = output.getArray() as Float32Array;
    let minY = Infinity;
    for (let i = 1; i < values.length; i += 3) minY = Math.min(minY, values[i]);
    const range = bindY - minY;
    if (!(range > 1e-6)) continue;
    for (let i = 1; i < values.length; i += 3) {
      const factor = Math.min(1, Math.max(0, (bindY - values[i]) / range));
      values[i] += offset * factor;
    }
  }
}
