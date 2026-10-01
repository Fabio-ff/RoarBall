import { MatchScreen } from './app/match-screen';
import { transition, type ScreenId, type ShellEvent } from './app/screens';
import {
  browserStorage,
  loadSettings,
  saveSettings,
  type Settings,
  type StorageLike,
} from './app/storage';
import { readGameOptions, type GameOptions } from './app/url-options';
import { MenuInput, type MenuCommand } from './input/menu-input';
import { TitleScreen } from './ui/screens/title';

export type { GameOptions } from './app/url-options';
export { buildRoster, buildSession, buildSettings, type Session } from './app/session';

interface ScreenHandle {
  handleCommand(command: MenuCommand): void;
  dispose(): void;
}

/** Options for a menu-started match: `?debug` still reaches it, everything else is the default. */
function defaultOptions(): GameOptions {
  return readGameOptions(window.location.search, Date.now());
}

/** Spec E.1 / §9: the screen flow as a state machine over DOM screens. */
export class AppShell {
  private current: ScreenId = 'title';
  private handle: ScreenHandle | null = null;
  private settings: Settings;
  private readonly menuInput: MenuInput;
  private rafId = 0;
  private options: GameOptions | null;
  private readonly store: StorageLike | null;

  constructor(
    private readonly root: HTMLElement,
    opts: { initial: GameOptions | null; store?: StorageLike | null },
  ) {
    this.store = opts.store === undefined ? browserStorage() : opts.store;
    this.settings = loadSettings(this.store);
    this.options = opts.initial;
    this.menuInput = new MenuInput(window);
    this.menuInput.onCommand = (c) => this.handle?.handleCommand(c);
    const poll = (): void => {
      this.menuInput.poll();
      this.rafId = requestAnimationFrame(poll);
    };
    this.rafId = requestAnimationFrame(poll);
    this.show(opts.initial ? 'match' : 'title');
  }

  get screen(): ScreenId {
    return this.current;
  }

  dispatch(event: ShellEvent): void {
    this.show(transition(this.current, event));
  }

  show(screen: ScreenId): void {
    this.handle?.dispose();
    this.handle = null;
    this.current = screen;
    switch (screen) {
      case 'title':
        this.handle = new TitleScreen(this.root, {
          sound: this.settings.sound,
          onPlay: () => this.dispatch({ type: 'play' }),
          onSoundChange: (sound) => this.updateSettings({ ...this.settings, sound }),
        });
        break;
      case 'match':
        if (!this.options) return this.show('title');
        this.handle = new MatchScreen({
          root: this.root,
          options: this.options,
          settings: this.settings,
          onFinished: () => this.onFinished(),
          onQuit: () => this.dispatch({ type: 'quit' }),
          onSettingsChange: (s) => this.updateSettings(s),
        });
        break;
      case 'setup':
      case 'results':
        // Task 2 adds Setup and Task 3 adds Results; until then go straight to a default match / back to the title.
        if (screen === 'setup') {
          this.options ??= defaultOptions();
          return this.dispatch({ type: 'start' });
        }
        return this.show('title');
    }
  }

  /** Task 3 receives the `MatchFinish` here and shows Results. */
  private onFinished(): void {
    this.dispatch({ type: 'finished' });
  }

  private updateSettings(settings: Settings): void {
    this.settings = settings;
    saveSettings(settings, this.store);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.handle?.dispose();
    this.menuInput.dispose();
  }
}
