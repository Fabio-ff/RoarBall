// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchRunner } from '../../src/app/match-runner';
import { readGameOptions } from '../../src/app/url-options';
import { findPlayer } from '../../src/sim/match';

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
vi.mock('../../src/render/scene', async () => {
  const { Scene, PerspectiveCamera } = await import('three');
  return {
    GameScene: class {
      scene = new Scene();
      camera = new PerspectiveCamera();
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

function mount(
  options = readGameOptions('?seed=5', 0),
  extra: { onFinished?: (r: unknown) => void } = {},
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
  });
  return { root, screen, loop: loops.at(-1)! };
}

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

  it('a button held when the match starts is not a press on the first tick (spec D.6)', () => {
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
    const { screen, loop } = mount();
    loop.onTick();
    expect(heldBeforeFirstStep).toBe(true);
    screen.dispose();
    vi.unstubAllGlobals();
  });

  it('after Pause → Restart the finished result carries the restarted seed (M1)', () => {
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
    const { root, screen, loop } = mount(options, { onFinished });
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
});
