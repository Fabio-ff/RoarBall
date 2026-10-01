import type { Settings } from '../../app/storage';
import type { MenuCommand } from '../../input/menu-input';
import { HowToPlayScreen } from './how-to-play';
import { MenuNav } from '../menu-nav';
import './screens.css';

export interface PauseOptions {
  settings: Settings;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onSettingsChange(settings: Settings): void;
}

const TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: 'sound', label: 'SOUND' },
  { key: 'music', label: 'MUSIC' },
  { key: 'vibration', label: 'VIBRATION' },
  { key: 'reduceMotion', label: 'REDUCE MOTION' },
];

/** Spec E.1 Pause overlay over the frozen match. */
export class PauseOverlay {
  private readonly el: HTMLDivElement;
  private readonly nav: MenuNav;
  private settings: Settings;
  private howTo: HowToPlayScreen | null = null;
  private readonly parent: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly options: PauseOptions,
  ) {
    this.parent = parent;
    this.settings = { ...options.settings };
    this.el = document.createElement('div');
    this.el.className = 'screen is-overlay';
    const column = document.createElement('div');
    column.className = 'menu-column';
    const heading = document.createElement('h2');
    heading.className = 'screen-heading';
    heading.textContent = 'PAUSED';
    let row = 0;
    const add = (
      action: string,
      text: string,
      secondary: boolean,
      onClick: (b: HTMLButtonElement) => void,
    ): void => {
      const b = document.createElement('button');
      b.className = `menu-button${secondary ? ' is-secondary' : ''}`;
      b.dataset.action = action;
      b.dataset.navRow = String(row++);
      b.textContent = text;
      b.addEventListener('click', () => onClick(b));
      column.appendChild(b);
    };
    add('resume', 'RESUME', false, () => options.onResume());
    add('restart', 'RESTART', true, () => options.onRestart());
    add('howToPlay', 'HOW TO PLAY', true, () => this.openHowTo());
    for (const { key, label } of TOGGLES) {
      add(key, `${label}: ${this.settings[key] ? 'ON' : 'OFF'}`, true, (b) => {
        this.settings = { ...this.settings, [key]: !this.settings[key] };
        b.textContent = `${label}: ${this.settings[key] ? 'ON' : 'OFF'}`;
        options.onSettingsChange({ ...this.settings });
      });
    }
    add('quit', 'QUIT TO TITLE', true, () => options.onQuit());
    this.el.append(heading, column);
    parent.appendChild(this.el);
    this.nav = new MenuNav(this.el, () => options.onResume());
    this.nav.focusFirst();
  }

  private openHowTo(): void {
    if (this.howTo) return;
    this.howTo = new HowToPlayScreen(this.parent, {
      onBack: () => {
        this.howTo?.dispose();
        this.howTo = null;
        this.nav.focusFirst();
      },
    });
  }

  handleCommand(command: MenuCommand): void {
    if (this.howTo) this.howTo.handleCommand(command);
    else if (command === 'pause') this.options.onResume();
    else this.nav.handle(command);
  }

  dispose(): void {
    this.howTo?.dispose();
    this.howTo = null;
    this.el.remove();
  }
}
