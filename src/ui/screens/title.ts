import type { MenuCommand } from '../../input/menu-input';
import { MenuNav } from '../menu-nav';
import './screens.css';

export interface TitleOptions {
  sound: boolean;
  onPlay(): void;
  onHowToPlay(): void;
  onSoundChange(sound: boolean): void;
}

const soundLabel = (on: boolean): string => `SOUND: ${on ? 'ON' : 'OFF'}`;

/** Spec E.1 Title: logo, PLAY, sound on/off. */
export class TitleScreen {
  private readonly el: HTMLDivElement;
  private readonly nav: MenuNav;

  constructor(parent: HTMLElement, options: TitleOptions) {
    let sound = options.sound;
    this.el = document.createElement('div');
    this.el.className = 'screen screen-title-page';
    this.el.innerHTML =
      '<h1 class="screen-title">ROARBALL</h1>' +
      '<div class="menu-column">' +
      '<button class="menu-button is-primary" data-action="play" data-nav-row="0">PLAY</button>' +
      '<button class="menu-button is-secondary" data-action="howToPlay" data-nav-row="1">HOW TO PLAY</button>' +
      `<button class="menu-button is-secondary" data-action="sound" data-nav-row="2">${soundLabel(sound)}</button>` +
      '</div><p class="rotate-hint">Turn your device sideways to play</p>';
    parent.appendChild(this.el);
    const play = this.el.querySelector<HTMLButtonElement>('[data-action="play"]');
    const toggle = this.el.querySelector<HTMLButtonElement>('[data-action="sound"]');
    play?.addEventListener('click', () => options.onPlay());
    this.el
      .querySelector<HTMLButtonElement>('[data-action="howToPlay"]')
      ?.addEventListener('click', () => options.onHowToPlay());
    toggle?.addEventListener('click', () => {
      sound = !sound;
      toggle.textContent = soundLabel(sound);
      options.onSoundChange(sound);
    });
    this.nav = new MenuNav(this.el);
    this.nav.focusFirst();
  }

  handleCommand(command: MenuCommand): void {
    this.nav.handle(command);
  }

  dispose(): void {
    this.el.remove();
  }
}
