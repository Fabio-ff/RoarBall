import { B, defaultPadSource, held as buttonHeld, type PadSource } from './gamepad';

/** Where a command came from; a gamepad B is turbo in play, so the match treats sources differently. */
export type MenuSource = 'keyboard' | 'gamepad';

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

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 150;
const STICK_THRESHOLD = 0.5;
const DIRECTIONS: readonly MenuCommand[] = ['up', 'down', 'left', 'right'];

/** Keyboard (and, from Task 4, gamepad) → MenuCommand. Repeats are ignored. */
export class MenuInput {
  onCommand: ((command: MenuCommand, source: MenuSource) => void) | null = null;

  /** Commands held on the previous poll; null until the first poll (that state is the baseline). */
  private previous: Set<MenuCommand> | null = null;
  private readonly heldSince = new Map<MenuCommand, number>();
  private readonly lastRepeat = new Map<MenuCommand, number>();

  constructor(
    private readonly target: Window = window,
    private readonly getPads: PadSource = defaultPadSource,
    private readonly now: () => number = () => performance.now(),
  ) {
    target.addEventListener('keydown', this.onKeyDown);
  }

  /**
   * Called once per animation frame by the shell. Emits on gamepad press edges; a direction held
   * past 400 ms repeats every 150 ms. Buttons held on the first poll are a baseline, not presses.
   */
  poll(): void {
    const held = this.readHeld();
    const previous = this.previous;
    this.previous = held;
    if (!previous) return;
    const t = this.now();
    for (const command of held) {
      if (!previous.has(command)) {
        this.heldSince.set(command, t);
        this.lastRepeat.set(command, t);
        this.emit(command, 'gamepad');
      } else if (DIRECTIONS.includes(command)) {
        const since = this.heldSince.get(command) ?? t;
        const last = this.lastRepeat.get(command) ?? t;
        const due = last === since ? since + REPEAT_DELAY_MS : last + REPEAT_INTERVAL_MS;
        if (t >= due) {
          this.lastRepeat.set(command, t);
          this.emit(command, 'gamepad');
        }
      }
    }
    for (const command of previous) {
      if (!held.has(command)) {
        this.heldSince.delete(command);
        this.lastRepeat.delete(command);
      }
    }
  }

  private readHeld(): Set<MenuCommand> {
    const held = new Set<MenuCommand>();
    let pads: readonly (Gamepad | null)[];
    try {
      pads = this.getPads();
    } catch {
      return held;
    }
    const down = buttonHeld;
    for (const pad of pads) {
      if (!pad || pad.connected === false) continue;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const horizontal = Math.abs(ax) >= Math.abs(ay);
      if (down(pad, B.up) || (!horizontal && ay < -STICK_THRESHOLD)) held.add('up');
      if (down(pad, B.down) || (!horizontal && ay > STICK_THRESHOLD)) held.add('down');
      if (down(pad, B.left) || (horizontal && ax < -STICK_THRESHOLD)) held.add('left');
      if (down(pad, B.right) || (horizontal && ax > STICK_THRESHOLD)) held.add('right');
      if (down(pad, B.a)) held.add('confirm');
      if (down(pad, B.b)) held.add('back');
      if (down(pad, B.start)) held.add('pause');
    }
    return held;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.onCommand = null;
  }

  protected emit(command: MenuCommand, source: MenuSource): void {
    this.onCommand?.(command, source);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const command = KEYS[e.code];
    if (!command) return;
    // Handled here: stops the browser's native activation of the focused button (a second click).
    e.preventDefault();
    this.emit(command, 'keyboard');
  };
}
