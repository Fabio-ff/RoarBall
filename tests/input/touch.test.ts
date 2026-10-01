// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchBackend } from '../../src/input/touch';

const WIDTH = 1000;
const HEIGHT = 600;

interface PointerInit {
  pointerId: number;
  clientX: number;
  clientY: number;
}

// jsdom has no layout and (depending on version) no PointerEvent; build a MouseEvent and
// graft pointerId onto it so the backend sees the fields it reads.
function fire(target: EventTarget, type: string, init: PointerInit): void {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(e, 'pointerId', { value: init.pointerId });
  Object.defineProperty(e, 'pointerType', { value: 'touch' });
  target.dispatchEvent(e);
}

let parent: HTMLDivElement;
let backend: TouchBackend;

beforeEach(() => {
  parent = document.createElement('div');
  document.body.appendChild(parent);
  backend = new TouchBackend(parent, { joystickRadius: 50 });
  backend.element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
      right: WIDTH,
      bottom: HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

afterEach(() => {
  backend.dispose();
  parent.remove();
});

const joystick = () => backend.element.querySelector<HTMLElement>('.touch-joystick')!;
const button = (name: string) =>
  backend.element.querySelector<HTMLElement>(`.touch-button[data-button="${name}"]`)!;

describe('TouchBackend joystick', () => {
  it('appears where the left-half touch starts and reports a stick vector', () => {
    expect(joystick().hidden).toBe(true);
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    expect(joystick().hidden).toBe(false);
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 225, clientY: 400 });
    expect(backend.sample().move.x).toBeCloseTo(0.5);
    expect(backend.sample().move.y).toBeCloseTo(0);
  });

  it('uses the rendered ring size as the radius when layout is available', () => {
    // Like a real browser, a hidden element has no layout box.
    Object.defineProperty(joystick(), 'offsetWidth', {
      get: () => (joystick().hidden ? 0 : 200),
      configurable: true,
    });
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 250, clientY: 400 });
    expect(backend.sample().move.x).toBeCloseTo(0.5); // 50 px of a 100 px radius
  });

  it('maps screen-up to positive y and clamps to unit length', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 200, clientY: 100 });
    const m = backend.sample().move;
    expect(m.x).toBeCloseTo(0);
    expect(m.y).toBeCloseTo(1);
  });

  it('resets and hides on release', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 250, clientY: 400 });
    fire(window, 'pointerup', { pointerId: 1, clientX: 250, clientY: 400 });
    expect(backend.sample().move).toEqual({ x: 0, y: 0 });
    expect(joystick().hidden).toBe(true);
  });

  it('ignores touches that start in the right half', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 800, clientY: 400 });
    expect(joystick().hidden).toBe(true);
  });

  it('ignores a second pointer while the joystick is held', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointerdown', { pointerId: 2, clientX: 300, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 2, clientX: 400, clientY: 400 });
    expect(backend.sample().move).toEqual({ x: 0, y: 0 });
  });
});

describe('TouchBackend buttons', () => {
  it('reports a button while it is pressed', () => {
    fire(button('action'), 'pointerdown', { pointerId: 3, clientX: 900, clientY: 550 });
    expect(backend.sample().action).toBe(true);
    expect(button('action').classList.contains('is-pressed')).toBe(true);
    fire(window, 'pointerup', { pointerId: 3, clientX: 900, clientY: 550 });
    expect(backend.sample().action).toBe(false);
    expect(button('action').classList.contains('is-pressed')).toBe(false);
  });

  it('supports the joystick and a button at the same time', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 250, clientY: 400 });
    fire(button('turbo'), 'pointerdown', { pointerId: 2, clientX: 850, clientY: 550 });
    const i = backend.sample();
    expect(i.move.x).toBeCloseTo(1);
    expect(i.turbo).toBe(true);
    fire(window, 'pointercancel', { pointerId: 2, clientX: 850, clientY: 550 });
    expect(backend.sample().turbo).toBe(false);
    expect(backend.sample().move.x).toBeCloseTo(1);
  });

  it('latches a tap that starts and ends between two samples', () => {
    fire(button('action'), 'pointerdown', { pointerId: 7, clientX: 900, clientY: 550 });
    fire(window, 'pointerup', { pointerId: 7, clientX: 900, clientY: 550 });
    expect(backend.sample().action).toBe(true);
    expect(backend.sample().action).toBe(false);
  });

  it('has all four buttons', () => {
    for (const name of ['special', 'pass', 'action', 'turbo']) expect(button(name)).toBeTruthy();
  });
});

describe('TouchBackend visibility', () => {
  it('starts hidden and toggles', () => {
    expect(backend.visible).toBe(false);
    backend.show();
    expect(backend.element.hidden).toBe(false);
    backend.hide();
    expect(backend.element.hidden).toBe(true);
  });
});

describe('TouchBackend SP readiness (spec D.6)', () => {
  it('writes nothing when the readiness is unchanged', () => {
    const toggle = vi.spyOn(button('special').classList, 'toggle');
    backend.setSpecialReady(false); // already dimmed
    expect(toggle).not.toHaveBeenCalled();
    backend.setSpecialReady(true);
    backend.setSpecialReady(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    toggle.mockRestore();
  });

  it('dims SP until the ability bar is full, without blocking presses', () => {
    expect(button('special').classList.contains('is-dimmed')).toBe(true);
    backend.setSpecialReady(true);
    expect(button('special').classList.contains('is-dimmed')).toBe(false);
    backend.setSpecialReady(false);
    expect(button('special').classList.contains('is-dimmed')).toBe(true);
    fire(button('special'), 'pointerdown', { pointerId: 4, clientX: 900, clientY: 450 });
    expect(backend.sample().special).toBe(true);
  });
});
