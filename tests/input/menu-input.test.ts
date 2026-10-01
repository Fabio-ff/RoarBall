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
