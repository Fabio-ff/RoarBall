import type { Animation, Document } from '@gltf-transform/core';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { bakeHeight } from './bake-height.ts';
import { offsetHipsY } from './floor-clamp.ts';
import { applyMaterialOverrides } from './materials.ts';
import { CANONICAL_CLIPS, type Manifest } from './manifest.ts';
import { dropClips, subclip } from './subclip.ts';
import { stripRootMotion } from './strip-root-motion.ts';

export const TEXTURE_SIZE = 1024;

/** Length in seconds of a clip: its last keyframe time. */
function clipDuration(clip: Animation): number {
  let duration = 0;
  for (const channel of clip.listChannels()) {
    const times = channel.getSampler()?.getInput()?.getArray();
    if (times && times.length > 0) duration = Math.max(duration, times[times.length - 1]);
  }
  return duration;
}

/**
 * Spec F.4.3 in order: strip root motion, subclip and rename (dropping unlisted clips), floor
 * offset, material overrides, textures to 1024 px WebP, drop redundant keyframes, prune and dedup, bake the height.
 */
export async function transformCharacter(doc: Document, manifest: Manifest): Promise<void> {
  stripRootMotion(doc, manifest.hipsNode);
  // Cut every canonical clip from the raw clips (a raw clip may share a canonical name, e.g.
  // "idle"), then drop all the raw clips, listed or not.
  const sources = doc.getRoot().listAnimations();
  for (const name of CANONICAL_CLIPS) {
    const spec = manifest.clips[name];
    const source = sources.find((a) => a.getName() === spec.source);
    if (!source)
      throw new Error(`manifest ${manifest.id}: clip "${spec.source}" not in the source`);
    const duration = clipDuration(source);
    if (spec.end > duration + 1e-6) {
      throw new Error(
        `manifest ${manifest.id}: clip "${name}" window [${spec.start}, ${spec.end}] exceeds "${spec.source}" (${duration}s)`,
      );
    }
    try {
      subclip(doc, source, name, spec.start, spec.end);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`manifest ${manifest.id}: clip "${name}": ${reason}`, { cause: error });
    }
  }
  dropClips(sources);
  for (const name of CANONICAL_CLIPS) {
    offsetHipsY(doc, name, manifest.clips[name].floorOffset, manifest.hipsNode);
  }
  applyMaterialOverrides(doc, manifest.materials);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_SIZE, TEXTURE_SIZE] }),
    resample(),
    dedup(),
    prune(),
  );
  bakeHeight(doc, manifest.height, manifest.releaseAt);
}
