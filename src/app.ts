import { AudioEngine } from './audio/engine';
import { NullAudioSink, type AudioSink } from './audio/sink';
import type { MatchResult } from './app/box-score';
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
import { MenuInput, type MenuCommand, type MenuSource } from './input/menu-input';
import { HUMAN_ID } from './app/session';
import { HowToPlayScreen } from './ui/screens/how-to-play';
import { ResultsScreen } from './ui/screens/results';
import { SetupScreen } from './ui/screens/setup';
import { TitleScreen } from './ui/screens/title';

export type { GameOptions } from './app/url-options';
export { buildRoster, buildSession, buildSettings, type Session } from './app/session';

interface ScreenHandle {
  handleCommand(command: MenuCommand, source: MenuSource): void;
  /** Only the match has this: true while the pause overlay is open. */
  readonly paused?: boolean;
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
  private lastResult: MatchResult | null = null;
  private readonly store: StorageLike | null;
  private sink: AudioSink = new NullAudioSink();
  private engine: AudioEngine | null = null;
  private audioTried = false;
  /** True while a menu command runs, so the click it triggers does not sound a second time. */
  private handlingCommand = false;

  constructor(
    private readonly root: HTMLElement,
    opts: { initial: GameOptions | null; store?: StorageLike | null },
  ) {
    this.store = opts.store === undefined ? browserStorage() : opts.store;
    this.settings = loadSettings(this.store);
    this.setup = loadSetup(this.store);
    this.options = opts.initial;
    // Registered before MenuInput so the engine exists when the same keydown is a menu command.
    window.addEventListener('keydown', this.onGesture, true);
    window.addEventListener('pointerdown', this.onGesture, true);
    this.root.addEventListener('click', this.onClick);
    this.menuInput = new MenuInput(window);
    this.menuInput.onCommand = (c, source) => this.onMenuCommand(c, source);
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
          onFinished: (result) => this.onFinished(result),
          onQuit: () => this.dispatch({ type: 'quit' }),
          onSettingsChange: (s) => this.updateSettings(s),
          sink: () => this.sink,
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
      case 'results': {
        const result = this.lastResult;
        if (!result) return this.show('title');
        this.handle = new ResultsScreen(this.root, {
          result,
          humanId: HUMAN_ID,
          onRematch: () => {
            this.options = { ...result.options, seed: (result.options.seed + 1) >>> 0 };
            this.dispatch({ type: 'rematch' });
          },
          onChangeSetup: () => this.dispatch({ type: 'changeSetup' }),
          onTitle: () => this.dispatch({ type: 'toTitle' }),
        });
        break;
      }
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

  private onFinished(result: MatchResult): void {
    this.lastResult = result;
    this.dispatch({ type: 'finished' });
  }

  /** First gesture builds the engine (browsers need a gesture); later ones resume it (iOS). */
  private readonly onGesture = (): void => {
    this.ensureAudio();
    this.engine?.resume();
  };

  private ensureAudio(): void {
    if (this.audioTried) return;
    this.audioTried = true;
    this.engine = AudioEngine.create();
    if (!this.engine) {
      window.removeEventListener('keydown', this.onGesture, true);
      window.removeEventListener('pointerdown', this.onGesture, true);
      return;
    }
    this.engine.setEnabled(this.settings.sound, this.settings.music);
    this.sink = this.engine;
  }

  private onMenuCommand(command: MenuCommand, source: MenuSource): void {
    if (source === 'gamepad') {
      this.ensureAudio();
      this.engine?.resume();
    }
    // Live play ignores everything but pause/back, so only menus (and the pause overlay) click.
    const inMenu = this.current !== 'match' || this.handle?.paused === true;
    if (inMenu) {
      if (command === 'confirm') this.sink.playSfx('menuConfirm');
      else if (['up', 'down', 'left', 'right'].includes(command)) this.sink.playSfx('menuMove');
    }
    this.handlingCommand = true;
    try {
      this.handle?.handleCommand(command, source);
    } finally {
      this.handlingCommand = false;
    }
  }

  private readonly onClick = (e: Event): void => {
    if (this.handlingCommand) return;
    if ((e.target as Element | null)?.closest('.menu-button, .setup-card')) {
      this.sink.playSfx('menuConfirm');
    }
  };

  private updateSettings(settings: Settings): void {
    this.settings = settings;
    this.sink.setEnabled(settings.sound, settings.music);
    saveSettings(settings, this.store);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.handle?.dispose();
    this.menuInput.dispose();
    window.removeEventListener('keydown', this.onGesture, true);
    window.removeEventListener('pointerdown', this.onGesture, true);
    this.root.removeEventListener('click', this.onClick);
    this.engine?.dispose();
  }
}
