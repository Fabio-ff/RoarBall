import type { PlayerIntent } from '../sim/types';
import type { InputBackend } from './types';
import './touch.css';

export interface TouchBackendOptions {
  /** Fallback joystick radius in px when the element has no layout (tests). */
  joystickRadius?: number;
}

type ButtonName = 'special' | 'pass' | 'action' | 'turbo';
const BUTTONS: { name: ButtonName; label: string }[] = [
  { name: 'special', label: 'SP' },
  { name: 'pass', label: 'PASS' },
  { name: 'turbo', label: 'TURBO' },
  { name: 'action', label: 'GO' },
];

/**
 * Spec §8 touch layout: a floating joystick that appears where the left thumb lands, and
 * DOM buttons on the right. Pointer Events tracked by pointerId so a joystick drag and a
 * button press coexist. Starts hidden; the app shows it on first touch.
 */
export class TouchBackend implements InputBackend {
  readonly kind = 'touch' as const;
  readonly element: HTMLDivElement;

  private readonly joystick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly buttons = new Map<ButtonName, { el: HTMLDivElement; pointers: Set<number> }>();
  private readonly latched = new Set<ButtonName>();
  private joystickPointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private move = { x: 0, y: 0 };
  private radius: number;

  constructor(
    parent: HTMLElement,
    private readonly options: TouchBackendOptions = {},
  ) {
    this.radius = options.joystickRadius ?? 60;

    this.element = document.createElement('div');
    this.element.className = 'touch-controls';
    this.element.hidden = true;

    this.joystick = document.createElement('div');
    this.joystick.className = 'touch-joystick';
    this.joystick.hidden = true;
    this.knob = document.createElement('div');
    this.knob.className = 'touch-joystick-knob';
    this.joystick.appendChild(this.knob);

    const buttonBar = document.createElement('div');
    buttonBar.className = 'touch-buttons';
    for (const { name, label } of BUTTONS) {
      const el = document.createElement('div');
      el.className = 'touch-button';
      el.dataset.button = name;
      el.setAttribute('role', 'button');
      el.textContent = label;
      buttonBar.appendChild(el);
      this.buttons.set(name, { el, pointers: new Set() });
    }

    this.element.append(this.joystick, buttonBar);
    parent.appendChild(this.element);

    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerEnd);
    window.addEventListener('pointercancel', this.onPointerEnd);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  show(): void {
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
    this.resetJoystick();
    this.latched.clear();
    for (const b of this.buttons.values()) {
      b.pointers.clear();
      b.el.classList.remove('is-pressed');
    }
  }

  sample(): PlayerIntent {
    const intent = {
      move: { ...this.move },
      action: this.pressed('action'),
      pass: this.pressed('pass'),
      special: this.pressed('special'),
      turbo: this.pressed('turbo'),
    };
    this.latched.clear();
    return intent;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerEnd);
    window.removeEventListener('pointercancel', this.onPointerEnd);
    this.latched.clear();
    this.element.remove();
  }

  private pressed(name: ButtonName): boolean {
    return (this.buttons.get(name)?.pointers.size ?? 0) > 0 || this.latched.has(name);
  }

  private buttonFromTarget(target: EventTarget | null): ButtonName | null {
    if (!(target instanceof HTMLElement)) return null;
    const el = target.closest<HTMLElement>('.touch-button');
    return (el?.dataset.button as ButtonName | undefined) ?? null;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const name = this.buttonFromTarget(e.target);
    if (name) {
      const button = this.buttons.get(name);
      if (!button) return;
      button.pointers.add(e.pointerId);
      this.latched.add(name);
      button.el.classList.add('is-pressed');
      e.preventDefault();
      return;
    }
    if (this.joystickPointer !== null) return;
    const rect = this.element.getBoundingClientRect();
    if (e.clientX - rect.left >= rect.width / 2) return;

    this.joystickPointer = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.move = { x: 0, y: 0 };
    this.joystick.style.left = `${e.clientX - rect.left}px`;
    this.joystick.style.top = `${e.clientY - rect.top}px`;
    // Reveal before measuring: a hidden element has no layout box, so offsetWidth would be 0.
    this.joystick.hidden = false;
    this.radius = this.joystick.offsetWidth / 2 || (this.options.joystickRadius ?? 60);
    this.knob.style.transform = 'translate(0px, 0px)';
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.joystickPointer) return;
    const dx = (e.clientX - this.origin.x) / this.radius;
    const dy = (e.clientY - this.origin.y) / this.radius;
    const len = Math.hypot(dx, dy);
    const scale = len > 1 ? 1 / len : 1;
    // Screen Y grows downwards; stick "up" is +y.
    this.move = { x: dx * scale, y: -dy * scale };
    this.knob.style.transform = `translate(${dx * scale * this.radius}px, ${dy * scale * this.radius}px)`;
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    if (e.pointerId === this.joystickPointer) this.resetJoystick();
    for (const b of this.buttons.values()) {
      if (b.pointers.delete(e.pointerId) && b.pointers.size === 0) {
        b.el.classList.remove('is-pressed');
      }
    }
  };

  private resetJoystick(): void {
    this.joystickPointer = null;
    this.move = { x: 0, y: 0 };
    this.joystick.hidden = true;
  }
}
