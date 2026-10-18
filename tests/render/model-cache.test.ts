import { SkinnedMesh } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearModelCache,
  instantiate,
  loadCharacterModel,
  type ModelLoader,
} from '../../src/render/model-cache';
import { fakeGltf } from './model-fixtures';

const FILE = 'characters/ace.glb';

beforeEach(() => {
  clearModelCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadCharacterModel', () => {
  it('loads from BASE_URL + assets/ + file and reads releaseAt', async () => {
    const loadAsync = vi.fn(async () => fakeGltf());
    const model = await loadCharacterModel(FILE, { loader: { loadAsync }, baseUrl: '/RoarBall/' });
    expect(loadAsync).toHaveBeenCalledWith('/RoarBall/assets/characters/ace.glb');
    expect(model?.releaseAt).toBe(0.6);
    expect(model?.clips.map((c) => c.name)).toContain('shoot');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('caches per file: two calls, one load', async () => {
    const loadAsync = vi.fn(async () => fakeGltf());
    const loader: ModelLoader = { loadAsync };
    const [a, b] = await Promise.all([
      loadCharacterModel(FILE, { loader }),
      loadCharacterModel(FILE, { loader }),
    ]);
    expect(a).toBe(b);
    expect(loadAsync).toHaveBeenCalledTimes(1);
  });

  it('resolves null and warns once with the grep-able prefix when the load fails', async () => {
    const loader: ModelLoader = { loadAsync: async () => Promise.reject(new Error('404')) };
    expect(await loadCharacterModel(FILE, { loader })).toBeNull();
    expect(await loadCharacterModel(FILE, { loader })).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0]?.slice(0, 2)).toEqual([
      '[model] fallback to placeholder for',
      FILE,
    ]);
  });

  it('resolves null when the loader hangs past the timeout', async () => {
    vi.useFakeTimers();
    const loader: ModelLoader = { loadAsync: () => new Promise(() => {}) };
    const result = loadCharacterModel(FILE, { loader, timeoutMs: 10_000 });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await result).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('resolves null when the model carries no releaseAt', async () => {
    const loader: ModelLoader = { loadAsync: async () => fakeGltf(undefined, null) };
    expect(await loadCharacterModel(FILE, { loader })).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('instantiate', () => {
  it('gives each view its own skeleton, shadows on, culling off', async () => {
    const model = (await loadCharacterModel(FILE, {
      loader: { loadAsync: async () => fakeGltf() },
    }))!;
    const a = instantiate(model);
    const b = instantiate(model);
    const skinned = (g: typeof a): SkinnedMesh => {
      let found: SkinnedMesh | undefined;
      g.scene.traverse((o) => {
        if (o instanceof SkinnedMesh) found = o;
      });
      return found!;
    };
    expect(a.scene).not.toBe(b.scene);
    expect(skinned(a).skeleton).not.toBe(skinned(b).skeleton);
    expect(skinned(a).castShadow).toBe(true);
    expect(skinned(a).frustumCulled).toBe(false);
    expect(a.releaseAt).toBe(0.6);
    expect(a.clips).toBe(model.clips);
  });
});
