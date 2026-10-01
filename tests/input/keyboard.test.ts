// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardBackend } from '../../src/input/keyboard';

function press(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
}
function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

let backend: KeyboardBackend;
afterEach(() => backend.dispose());

describe('KeyboardBackend', () => {
  it('maps WASD and arrows to a normalized move vector', () => {
    backend = new KeyboardBackend(window);
    press('KeyW');
    expect(backend.sample().move).toEqual({ x: 0, y: 1 });
    press('KeyD');
    const diag = backend.sample().move;
    expect(diag.x).toBeCloseTo(Math.SQRT1_2);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2);
    release('KeyW');
    release('KeyD');
    press('ArrowLeft');
    expect(backend.sample().move).toEqual({ x: -1, y: 0 });
  });

  it('maps buttons', () => {
    backend = new KeyboardBackend(window);
    press('Space');
    press('KeyE');
    press('KeyQ');
    press('ShiftLeft');
    const i = backend.sample();
    expect(i).toMatchObject({ action: true, pass: true, special: true, turbo: true });
    release('Space');
    expect(backend.sample().action).toBe(false);
  });

  it('an auto-repeat keydown does not re-latch a press (held state is still tracked)', () => {
    backend = new KeyboardBackend(window);
    press('Space');
    backend.sample();
    const repeat = (): boolean =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', repeat: true, cancelable: true }),
      );
    repeat();
    expect(backend.sample().action).toBe(true); // still held
    repeat();
    release('Space'); // a latched repeat would still read as pressed
    expect(backend.sample().action).toBe(false);
  });

  it('prevents the default action of mapped keys so Space does not scroll', () => {
    backend = new KeyboardBackend(window);
    const e = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    const other = new KeyboardEvent('keydown', { code: 'KeyZ', cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('clears all keys on window blur', () => {
    backend = new KeyboardBackend(window);
    press('KeyW');
    window.dispatchEvent(new Event('blur'));
    expect(backend.sample().move).toEqual({ x: 0, y: 0 });
  });

  it('stops listening after dispose', () => {
    backend = new KeyboardBackend(window);
    backend.dispose();
    press('KeyW');
    expect(backend.sample().move).toEqual({ x: 0, y: 0 });
  });

  it('latches a press that starts and ends between two samples', () => {
    backend = new KeyboardBackend(window);
    press('Space');
    release('Space');
    expect(backend.sample().action).toBe(true);
    expect(backend.sample().action).toBe(false);
  });
});
