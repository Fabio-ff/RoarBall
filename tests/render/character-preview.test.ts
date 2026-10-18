// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCharacterPreview, previewDistance } from '../../src/render/character-preview';
import type { LoadedModel } from '../../src/render/model-cache';
import { fakeGltf } from './model-fixtures';

const fakeModel = (): LoadedModel => {
  const gltf = fakeGltf();
  return { scene: gltf.scene, clips: gltf.animations, releaseAt: 0.6 };
};

function fakeRenderer() {
  return {
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
let canvas: HTMLCanvasElement;

beforeEach(() => {
  canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 128;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 7),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('previewDistance', () => {
  it('puts the model at 1/1.15 of the view height', () => {
    const d = previewDistance(1.8, 30);
    const visible = 2 * d * Math.tan((30 * Math.PI) / 360);
    expect(1.8 / visible).toBeCloseTo(1 / 1.15, 5);
  });
});

describe('createCharacterPreview (spec F.9)', () => {
  it('renders the model and keeps drawing frames', async () => {
    const renderer = fakeRenderer();
    createCharacterPreview(canvas, 'characters/ace.glb', {
      loadModel: async () => fakeModel(),
      createRenderer: () => renderer,
    });
    await flush();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.setSize).toHaveBeenCalledWith(96, 128, false);
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(canvas.hidden).toBe(false);
  });

  it('hides the canvas when the model is missing, without creating a renderer', async () => {
    const createRenderer = vi.fn(() => fakeRenderer());
    createCharacterPreview(canvas, 'characters/ace.glb', {
      loadModel: async () => null,
      createRenderer,
    });
    await flush();
    expect(canvas.hidden).toBe(true);
    expect(createRenderer).not.toHaveBeenCalled();
  });

  it('hides the canvas when the load throws or WebGL is unavailable', async () => {
    createCharacterPreview(canvas, 'a', {
      loadModel: async () => Promise.reject(new Error('boom')),
    });
    await flush();
    expect(canvas.hidden).toBe(true);

    const second = document.createElement('canvas');
    createCharacterPreview(second, 'a', {
      loadModel: async () => fakeModel(),
      createRenderer: () => null,
    });
    await flush();
    expect(second.hidden).toBe(true);
  });

  it('a preview disposed while loading never renders', async () => {
    const renderer = fakeRenderer();
    const createRenderer = vi.fn(() => renderer);
    const handle = createCharacterPreview(canvas, 'a', {
      loadModel: async () => fakeModel(),
      createRenderer,
    });
    handle.dispose();
    await flush();
    expect(createRenderer).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('dispose stops the loop and frees the context', async () => {
    const renderer = fakeRenderer();
    const handle = createCharacterPreview(canvas, 'a', {
      loadModel: async () => fakeModel(),
      createRenderer: () => renderer,
    });
    await flush();
    handle.dispose();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(renderer.dispose).toHaveBeenCalled();
    expect(renderer.forceContextLoss).toHaveBeenCalled();
    expect(() => handle.dispose()).not.toThrow();
  });
});
