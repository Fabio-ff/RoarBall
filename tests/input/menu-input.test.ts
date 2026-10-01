// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { MenuInput, type MenuCommand } from '../../src/input/menu-input';

let input: MenuInput | null = null;
afterEach(() => input?.dispose());

function press(code: string, key = ''): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { code, key, cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('MenuInput keyboard (spec E.1)', () => {
  it('maps arrows, WASD, Enter/Space, Escape/Backspace and P', () => {
    input = new MenuInput(window);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    for (const code of [
      'ArrowUp',
      'KeyS',
      'ArrowLeft',
      'KeyD',
      'Enter',
      'Space',
      'Escape',
      'Backspace',
      'KeyP',
    ])
      press(code);
    expect(got).toEqual([
      'up',
      'down',
      'left',
      'right',
      'confirm',
      'confirm',
      'back',
      'back',
      'pause',
    ]);
  });

  it('reports Escape as back; the match screen treats back as pause', () => {
    input = new MenuInput(window);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    press('Escape');
    expect(got).toEqual(['back']);
  });

  it('ignores key repeats and stops listening after dispose', () => {
    input = new MenuInput(window);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', repeat: true }));
    input.dispose();
    press('ArrowUp');
    expect(got).toEqual([]);
  });

  it('prevents the default of mapped keys only (Tab stays native)', () => {
    input = new MenuInput(window);
    for (const code of ['Enter', 'Space', 'ArrowDown', 'Escape']) {
      expect(press(code).defaultPrevented).toBe(true);
    }
    expect(press('Tab').defaultPrevented).toBe(false);
  });
});

function pad(index: number, opts: { axes?: number[]; pressed?: number[] } = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const pressed = opts.pressed?.includes(i) ?? false;
    return { pressed, touched: false, value: pressed ? 1 : 0 };
  });
  return {
    index,
    id: `pad${index}`,
    connected: true,
    mapping: 'standard',
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons,
    timestamp: 0,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('MenuInput gamepad (spec E.1)', () => {
  it('emits on press edges: D-pad/stick directions, A confirm, B back, Start pause', () => {
    let pads: (Gamepad | null)[] = [pad(0)];
    input = new MenuInput(window, () => pads);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    input.poll();
    pads = [pad(0, { pressed: [13] })];
    input.poll();
    input.poll(); // held: no repeat yet
    pads = [pad(0, { axes: [0.9, 0, 0, 0] })];
    input.poll();
    pads = [pad(0, { pressed: [0] })];
    input.poll();
    pads = [pad(0, { pressed: [1] })];
    input.poll();
    pads = [pad(0, { pressed: [9] })];
    input.poll();
    expect(got).toEqual(['down', 'right', 'confirm', 'back', 'pause']);
  });

  it('reports the source: gamepad for pad commands, keyboard for keys', () => {
    let pads: (Gamepad | null)[] = [pad(0)];
    input = new MenuInput(window, () => pads);
    const got: [MenuCommand, string][] = [];
    input.onCommand = (c, source) => got.push([c, source]);
    input.poll();
    pads = [pad(0, { pressed: [1] })];
    input.poll();
    press('Escape');
    expect(got).toEqual([
      ['back', 'gamepad'],
      ['back', 'keyboard'],
    ]);
  });

  it('buttons already held when polling starts are the baseline, not presses', () => {
    let pads: (Gamepad | null)[] = [pad(0, { pressed: [0, 12] })];
    input = new MenuInput(window, () => pads);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    input.poll();
    input.poll();
    expect(got).toEqual([]);
    pads = [pad(0)];
    input.poll();
    pads = [pad(0, { pressed: [0] })];
    input.poll();
    expect(got).toEqual(['confirm']);
  });

  it('survives a pad source that throws', () => {
    input = new MenuInput(window, () => {
      throw new Error('no gamepads');
    });
    expect(() => input?.poll()).not.toThrow();
  });

  it('repeats a held direction after 400 ms, then every 150 ms', () => {
    let now = 0;
    let pads: (Gamepad | null)[] = [pad(0)];
    input = new MenuInput(
      window,
      () => pads,
      () => now,
    );
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    input.poll(); // baseline
    pads = [pad(0, { pressed: [12] })];
    input.poll(); // edge
    now = 399;
    input.poll();
    now = 400;
    input.poll();
    now = 550;
    input.poll();
    expect(got).toEqual(['up', 'up', 'up']);
  });
});
