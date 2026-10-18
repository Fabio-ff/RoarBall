import type { Document } from '@gltf-transform/core';
import { DEFAULT_HIPS, findNode } from './hips.ts';

/** Adds `offset` (source-model metres) to the Y of the hips translation keys of clip `clipName`. */
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
  for (const channel of clip.listChannels()) {
    if (channel.getTargetNode() !== hips || channel.getTargetPath() !== 'translation') continue;
    const output = channel.getSampler()?.getOutput();
    if (!output) continue;
    const values = output.getArray() as Float32Array;
    for (let i = 1; i < values.length; i += 3) values[i] += offset;
  }
}
