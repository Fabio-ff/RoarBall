/** Spec E.1: one navigation vocabulary for every menu and the in-match pause key. */
export type MenuCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';

const KEYS: Readonly<Record<string, MenuCommand>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  KeyP: 'pause',
};

/** Keyboard (and, from Task 4, gamepad) → MenuCommand. Repeats are ignored. */
export class MenuInput {
  onCommand: ((command: MenuCommand) => void) | null = null;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
  }

  /** Called once per animation frame by the shell; gamepads are polled here (Task 4). */
  poll(): void {}

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.onCommand = null;
  }

  protected emit(command: MenuCommand): void {
    this.onCommand?.(command);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const command = KEYS[e.code];
    if (command) this.emit(command);
  };
}
