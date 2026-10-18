import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { CANONICAL_CLIPS, parseManifest } from '../../scripts/asset-pipeline/manifest.ts';
import { buildCharacter, main } from '../../scripts/asset-pipeline/run.ts';
import { buildFixture, validManifest } from './fixture.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A repo-shaped temp folder holding a raw GLB (with a 2048 px texture) and its manifest. */
async function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'roarball-assets-'));
  dirs.push(root);
  mkdirSync(join(root, 'sources/raw'), { recursive: true });
  mkdirSync(join(root, 'sources/characters'), { recursive: true });
  const { doc } = buildFixture();
  // Not a solid colour: prune() would replace a flat texture by a material factor.
  const size = 2048;
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7) % 251;
  const png = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
  const texture = doc.createTexture('base').setImage(new Uint8Array(png)).setMimeType('image/png');
  doc.getRoot().listMaterials()[0].setBaseColorTexture(texture);
  await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .write(join(root, 'sources/raw/raw.glb'), doc);
  return root;
}

const manifestFor = () => {
  const raw = validManifest();
  const clips = Object.fromEntries(
    CANONICAL_CLIPS.map((name) => [name, { ...raw.clips[name], source: 'take', start: 0, end: 1 }]),
  );
  return { ...raw, releaseAt: 0.4, clips };
};

describe('buildCharacter and main', () => {
  it('writes a GLB with 1024 px WebP textures, the canonical clips and the baked height', async () => {
    const root = await workspace();
    const manifest = parseManifest(manifestFor(), 'golden');
    const { file, bytes } = await buildCharacter(
      manifest,
      join(root, 'sources/raw'),
      join(root, 'out'),
    );
    expect(file).toBe(join(root, 'out/golden.glb'));
    expect(bytes).toBeGreaterThan(0);

    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
    const [texture] = doc.getRoot().listTextures();
    expect(texture.getMimeType()).toBe('image/webp');
    expect(Math.max(...texture.getSize()!)).toBeLessThanOrEqual(1024);
    expect(
      doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    ).toEqual([...CANONICAL_CLIPS]);
    expect(doc.getRoot().listScenes()[0].listChildren()[0].getExtras()).toEqual({ releaseAt: 0.4 });
  });

  it('main processes every manifest in sources/characters into public/assets/characters', async () => {
    const root = await workspace();
    const raw = manifestFor();
    writeFileSync(
      join(root, 'sources/characters/golden.json'),
      JSON.stringify({ ...raw, source: 'raw.glb' }),
    );
    await main(root);
    expect(existsSync(join(root, 'public/assets/characters/golden.glb'))).toBe(true);
  });

  it('main does nothing, and does not fail, when there are no manifests', async () => {
    const root = mkdtempSync(join(tmpdir(), 'roarball-assets-'));
    dirs.push(root);
    await expect(main(root)).resolves.toBeUndefined();
  });
});
