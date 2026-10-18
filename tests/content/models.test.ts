import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getBounds, NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { beforeAll, describe, expect, it } from 'vitest';
import { characters } from '../../src/content/characters';
import { CANONICAL_CLIPS } from '../../src/render/clip-for';

/** Spec F.6.2: every shipped model has the canonical clips, a releaseAt and a sane height. */
const MODELS_DIR = join(process.cwd(), 'public/assets/characters');
const MAX_BYTES = 3 * 1024 * 1024;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = existsSync(MODELS_DIR)
  ? readdirSync(MODELS_DIR).filter((f) => f.endsWith('.glb'))
  : [];

function hipsTranslations(doc: Document) {
  return doc
    .getRoot()
    .listAnimations()
    .map((clip) => {
      const channel = clip
        .listChannels()
        .find(
          (c) =>
            c.getTargetPath() === 'translation' &&
            c.getTargetNode()?.getName() === 'mixamorig:Hips',
        );
      return { clip: clip.getName(), values: channel?.getSampler()?.getOutput()?.getArray() };
    });
}

describe('public/assets/characters', () => {
  it('has at least one model', () => {
    expect(files.length).toBeGreaterThan(0);
  });
});

describe.each(files)('model %s', (file) => {
  let doc: Document;
  beforeAll(async () => {
    doc = await io.read(join(MODELS_DIR, file));
  });

  it('is smaller than 3 MB', () => {
    expect(statSync(join(MODELS_DIR, file)).size).toBeLessThan(MAX_BYTES);
  });

  it('contains every canonical clip, and only those', () => {
    const names = doc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName());
    expect([...names].sort()).toEqual([...CANONICAL_CLIPS].sort());
    for (const clip of doc.getRoot().listAnimations()) {
      const times = clip.listChannels()[0]?.getSampler()?.getInput()?.getArray();
      expect(times?.[times.length - 1] ?? 0, `${clip.getName()} has a duration`).toBeGreaterThan(0);
    }
  });

  it('carries releaseAt, inside the shoot clip', () => {
    const root = doc.getRoot().listScenes()[0]?.listChildren()[0];
    const releaseAt: unknown = root?.getExtras().releaseAt;
    expect(typeof releaseAt).toBe('number');
    const shoot = doc
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === 'shoot');
    const times = shoot?.listChannels()[0]?.getSampler()?.getInput()?.getArray();
    expect(releaseAt as number).toBeGreaterThan(0);
    expect(releaseAt as number).toBeLessThan(times?.[times.length - 1] ?? 0);
  });

  it('is 1.6 to 2.0 m tall in the bind pose', () => {
    const { min, max } = getBounds(doc.getRoot().listScenes()[0]!);
    expect(max[1] - min[1]).toBeGreaterThanOrEqual(1.6);
    expect(max[1] - min[1]).toBeLessThanOrEqual(2.0);
  });

  it('has no root motion: the hips stay at their X and Z in every clip', () => {
    for (const { clip, values } of hipsTranslations(doc)) {
      expect(values, `${clip} animates the hips`).toBeDefined();
      for (let i = 0; i + 2 < values!.length; i += 3) {
        expect(values![i], `${clip} x`).toBeCloseTo(values![0], 5);
        expect(values![i + 2], `${clip} z`).toBeCloseTo(values![2], 5);
      }
    }
  });
});

describe('characters with a model (spec F.6.1)', () => {
  const withModel = characters.filter((c) => c.model);

  it('Golden is the character `ace` and has a model', () => {
    const ace = characters.find((c) => c.id === 'ace');
    expect(ace?.name).toBe('Golden');
    expect(ace?.model).toEqual({ file: 'characters/ace.glb' });
  });

  it.each(withModel.map((c) => [c.id, c.model!.file] as const))(
    '%s points at a model that exists and was checked above',
    (_id, file) => {
      expect(existsSync(join(process.cwd(), 'public/assets', file))).toBe(true);
      expect(files).toContain(file.replace('characters/', ''));
    },
  );

  it('a character without a model stays a placeholder', () => {
    expect(characters.filter((c) => !c.model).map((c) => c.id)).toEqual(['brick', 'dash', 'rook']);
  });
});
