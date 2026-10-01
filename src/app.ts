import { MatchScreen } from './app/match-screen';
import { transition, type ScreenId, type ShellEvent } from './app/screens';
import { buildSetupCatalog, toGameOptions, type SetupChoice } from './app/setup-model';
import {
  browserStorage,
  loadSettings,
  loadSetup,
  saveSettings,
  saveSetup,
  type Settings,
  type StorageLike,
} from './app/storage';
import type { GameOptions } from './app/url-options';
import { MenuInput, type MenuCommand } from './input/menu-input';
import { HowToPlayScreen } from './ui/screens/how-to-play';
import { SetupScreen } from './ui/screens/setup';
import { TitleScreen } from './ui/screens/title';

export type { GameOptions } from './app/url-options';
export { buildRoster, buildSession, buildSettings, type Session } from './app/session';

interface ScreenHandle {
  handleCommand(command: MenuCommand): void;
  dispose(): void;
}

/** Spec E.1 / §9: the screen flow as a state machine over DOM screens. */
export class AppShell {
  private current: ScreenId = 'title';
  private handle: ScreenHandle | null = null;
  private settings: Settings;
  private setup: SetupChoice;
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
    this.setup = loadSetup(this.store);
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
          onHowToPlay: () => this.dispatch({ type: 'howToPlay' }),
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
      case 'howToPlay':
        this.handle = new HowToPlayScreen(this.root, {
          onBack: () => this.dispatch({ type: 'back' }),
        });
        break;
      case 'setup':
        this.handle = new SetupScreen(this.root, {
          setup: this.setup,
          catalog: buildSetupCatalog(),
          onStart: (s) => this.startMatch(s),
          onBack: () => this.dispatch({ type: 'back' }),
        });
        break;
      case 'results':
        // Task 3 replaces this with the Results screen.
        return this.show('title');
    }
  }

  /** Every START remembers the setup and builds fresh options with a fresh seed (never a previous match's). */
  private startMatch(setup: SetupChoice): void {
    this.setup = setup;
    saveSetup(setup, this.store);
    this.options = toGameOptions(
      setup,
      Date.now() >>> 0,
      Math.random,
      new URLSearchParams(window.location.search).has('debug'),
    );
    this.dispatch({ type: 'start' });
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
