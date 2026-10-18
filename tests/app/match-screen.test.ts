// @vitest-environment jsdom
import { SkinnedMesh, type Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchRunner } from '../../src/app/match-runner';
import { readGameOptions } from '../../src/app/url-options';
import type { LoadedModel } from '../../src/render/model-cache';
import { findPlayer } from '../../src/sim/match';
import { CharacterView } from '../../src/render/character-view';
import { MAX_FRAME_DT } from '../../src/app/frame-time';
import { fakeGltf } from '../render/model-fixtures';

/** The loop callbacks the MatchScreen registered, so a test can drive ticks by hand. */
const loops: { onTick(): void; onRender(alpha: number, frameMs: number): void }[] = [];
vi.mock('../../src/app/game-loop', () => ({
  GameLoop: class {
    running = false;
    constructor(
      public onTick: () => void,
      public onRender: (alpha: number, frameMs: number) => void,
    ) {
      loops.push(this);
    }
    start(): void {
      this.running = true;
    }
    stop(): void {
      this.running = false;
    }
  },
}));
/** The scenes the MatchScreen created, so a test can look at what was added to them. */
const scenes = vi.hoisted(() => [] as { scene: Object3D }[]);
vi.mock('../../src/render/scene', async () => {
  const { Scene, PerspectiveCamera } = await import('three');
  return {
    GameScene: class {
      scene = new Scene();
      camera = new PerspectiveCamera();
      constructor() {
        scenes.push(this);
      }
      setBackground(): void {}
      resize(): void {}
      render(): void {}
      dispose(): void {}
    },
  };
});

const { MatchScreen } = await import('../../src/app/match-screen');

const sink = { playSfx() {}, setMusic() {}, duck() {}, setEnabled() {} };
const settings = { sound: true, music: true, vibration: false, reduceMotion: false };

/** Mounts a MatchScreen; by default no model loads, so every player is a placeholder. */
async function mount(
  options = readGameOptions('?seed=5', 0),
  extra: {
    onFinished?: (r: unknown) => void;
    loadModel?: (file: string) => Promise<LoadedModel | null>;
    wait?: boolean;
  } = {},
) {
  const root = document.createElement('div');
  document.body.append(root);
  const screen = new MatchScreen({
    root,
    options,
    settings,
    onFinished: extra.onFinished ?? vi.fn(),
    onQuit: vi.fn(),
    onSettingsChange: vi.fn(),
    sink: () => sink,
    loadModel: extra.loadModel ?? (async () => null),
  });
  if (extra.wait !== false) await screen.ready;
  return { root, screen, loop: loops.at(-1)! };
}

const fakeModel = (): LoadedModel => {
  const gltf = fakeGltf();
  return { scene: gltf.scene, clips: gltf.animations, releaseAt: 0.6 };
};
const skinnedMeshes = (): number => {
  let n = 0;
  scenes.at(-1)!.scene.traverse((o) => {
    if (o instanceof SkinnedMesh) n += 1;
  });
  return n;
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('MatchScreen', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );

  it('a button held when the match starts is not a press on the first tick (spec D.6)', async () => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({
      pressed: i === 0,
      touched: false,
      value: i === 0 ? 1 : 0,
    }));
    const pad = { index: 0, axes: [0, 0, 0, 0], buttons, connected: true } as unknown as Gamepad;
    vi.stubGlobal('navigator', { ...navigator, getGamepads: () => [pad] });
    // The sim sees a press when the held A is not already in prevButtons at the first step.
    const step = MatchRunner.prototype.step;
    let heldBeforeFirstStep: boolean | undefined;
    vi.spyOn(MatchRunner.prototype, 'step').mockImplementation(function (this: MatchRunner, i) {
      heldBeforeFirstStep ??= findPlayer(this.current, 'home1')?.prevButtons.action;
      return step.call(this, i);
    });
    const { screen, loop } = await mount();
    loop.onTick();
    expect(heldBeforeFirstStep).toBe(true);
    screen.dispose();
    vi.unstubAllGlobals();
  });

  it('hands the player views at most what the sim catches up in a frame, however long the stall', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    const update = vi.spyOn(CharacterView.prototype, 'update');
    const { screen, loop } = await mount(readGameOptions('?seed=5', 0), {
      loadModel: async () => fakeModel(),
    });
    loop.onRender(0.5, 60_000);
    expect(update).toHaveBeenCalled();
    for (const call of update.mock.calls) expect(call[5]).toBeCloseTo(MAX_FRAME_DT, 10);
    update.mockClear();
    loop.onRender(0.5, 8);
    for (const call of update.mock.calls) expect(call[5]).toBeCloseTo(0.008, 10);
    screen.dispose();
  });

  it('after Pause → Restart the finished result carries the restarted seed (M1)', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onFinished = vi.fn();
    const options = { ...readGameOptions('?seed=5', 0), durationMs: 500 };
    const { root, screen, loop } = await mount(options, { onFinished });
    screen.pause();
    root.querySelector<HTMLButtonElement>('[data-action="restart"]')?.click();
    for (let i = 0; i < 5000 && !onFinished.mock.calls.length; i++) {
      loop.onTick();
      now += 100;
      loop.onRender(0, 16);
    }
    expect(onFinished).toHaveBeenCalledOnce();
    expect(onFinished.mock.calls[0]?.[0].options.seed).toBe(6);
    screen.dispose();
  });

  describe('loading (spec F.8)', () => {
    it('shows a Loading line at once and replaces it with the match when the models are in', async () => {
      let release!: (m: LoadedModel | null) => void;
      const loadModel = () => new Promise<LoadedModel | null>((resolve) => (release = resolve));
      const { root, screen } = await mount(readGameOptions('?seed=5&teammate=ace', 0), {
        loadModel,
        wait: false,
      });
      expect(root.textContent).toContain('Loading');
      expect(root.querySelector('canvas')).toBeNull();
      release(fakeModel());
      await screen.ready;
      expect(root.textContent).not.toContain('Loading');
      expect(root.querySelector('canvas')).not.toBeNull();
      screen.dispose();
    });

    it('asks for each distinct model once, even when the character is picked four times', async () => {
      const loadModel = vi.fn(async () => fakeModel());
      const options = readGameOptions('?seed=5&character=ace&teammate=ace&opponents=ace,ace', 0);
      const { screen } = await mount(options, { loadModel });
      expect(loadModel).toHaveBeenCalledTimes(1);
      expect(loadModel).toHaveBeenCalledWith('characters/ace.glb');
      screen.dispose();
    });

    it('builds a CharacterView per player of a character whose model loaded, placeholders for the rest', async () => {
      const options = readGameOptions('?seed=5&character=ace&teammate=rook&opponents=ace,brick', 0);
      const { screen } = await mount(options, { loadModel: async () => fakeModel() });
      expect(skinnedMeshes()).toBe(2); // home1 and away1 are Golden; rook and brick have no model
      screen.dispose();
    });

    it('falls back to placeholders and still starts when the model fails to load', async () => {
      const options = readGameOptions('?seed=5&character=ace', 0);
      const { screen, loop } = await mount(options, { loadModel: async () => null });
      expect(skinnedMeshes()).toBe(0);
      expect(() => {
        loop.onTick();
        loop.onRender(0.5, 16);
      }).not.toThrow();
      screen.dispose();
    });

    it('falls back to placeholders, with one warning, when an injected loader rejects', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const options = readGameOptions('?seed=5&character=ace', 0);
      const { screen } = await mount(options, {
        loadModel: () => Promise.reject(new Error('404')),
      });
      expect(skinnedMeshes()).toBe(0);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe('[model] fallback to placeholder for');
      screen.dispose();
    });

    it('renders model players for a few ticks without throwing, then disposes cleanly', async () => {
      const options = readGameOptions('?seed=5&character=ace&teammate=ace', 0);
      const { screen, loop } = await mount(options, { loadModel: async () => fakeModel() });
      for (let i = 0; i < 30; i++) {
        loop.onTick();
        loop.onRender(0.5, 16);
      }
      expect(() => screen.dispose()).not.toThrow();
    });

    it('a screen disposed while loading never builds', async () => {
      let release!: (m: LoadedModel | null) => void;
      const loadModel = () => new Promise<LoadedModel | null>((resolve) => (release = resolve));
      const before = loops.length;
      const { root, screen } = await mount(readGameOptions('?seed=5&character=ace', 0), {
        loadModel,
        wait: false,
      });
      screen.dispose();
      release(fakeModel());
      await screen.ready;
      expect(loops.length).toBe(before);
      expect(root.querySelector('.match-screen')).toBeNull();
      expect(() => screen.pause()).not.toThrow();
    });
  });
});
