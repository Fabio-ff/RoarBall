import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { loadManifest, type Manifest } from './manifest.ts';
import { transformCharacter } from './transform.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Reads sources/raw/<manifest.source>, runs the pipeline and writes <outDir>/<id>.glb. */
export async function buildCharacter(
  manifest: Manifest,
  rawDir: string,
  outDir: string,
): Promise<{ file: string; bytes: number }> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(join(rawDir, manifest.source));
  await transformCharacter(doc, manifest);
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${manifest.id}.glb`);
  await io.write(file, doc);
  return { file, bytes: statSync(file).size };
}

/** `npm run assets`: every sources/characters/*.json becomes public/assets/characters/<id>.glb. */
export async function main(root: string = REPO): Promise<void> {
  const manifestDir = join(root, 'sources/characters');
  const names = existsSync(manifestDir)
    ? readdirSync(manifestDir).filter((f) => f.endsWith('.json'))
    : [];
  if (names.length === 0) {
    console.log('assets: no manifests in sources/characters');
    return;
  }
  for (const name of names) {
    const manifest = loadManifest(join(manifestDir, name));
    const { file, bytes } = await buildCharacter(
      manifest,
      join(root, 'sources/raw'),
      join(root, 'public/assets/characters'),
    );
    console.log(`assets: ${manifest.id} -> ${file} (${(bytes / 1e6).toFixed(2)} MB)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
