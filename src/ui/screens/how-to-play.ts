import type { MenuCommand } from '../../input/menu-input';
import { MenuNav } from '../menu-nav';
import './screens.css';

export interface HowToPlayOptions {
  onBack(): void;
}

const CONTROLS: [action: string, keyboard: string, gamepad: string, touch: string][] = [
  ['Move', 'WASD / arrows', 'left stick or D-pad', 'left-thumb joystick'],
  ['Shoot (with the ball)', 'Space', 'A', 'GO'],
  ['Pass (with the ball)', 'E', 'X', 'PASS'],
  ['Call for the ball (without it)', 'E', 'X', 'PASS'],
  ['Ability when the bar is full', 'Q', 'Y', 'SP'],
  ['Turbo', 'Shift', 'RT or B', 'TURBO'],
  ['Pause', 'Esc or P', 'Start', '⏸'],
];

const DEFENCE = [
  'Without the ball, Shoot is your defence button:',
  '• Block — when your opponent is shooting or near the hoop (you jump)',
  '• Steal — when the ball handler is within reach and you face them',
  '• Shove — an opponent close in front of you: knocks them down; otherwise you jump',
];

/** The controls and defence cheat sheet, reachable from the Title and the Pause menu. */
export class HowToPlayScreen {
  private readonly el: HTMLDivElement;
  private readonly nav: MenuNav;

  constructor(parent: HTMLElement, options: HowToPlayOptions) {
    this.el = document.createElement('div');
    this.el.className = 'screen screen-howto';
    const heading = document.createElement('h2');
    heading.className = 'screen-heading';
    heading.textContent = 'HOW TO PLAY';

    const table = document.createElement('table');
    table.className = 'howto-table';
    const head = table.createTHead().insertRow();
    for (const h of ['', 'KEYBOARD', 'GAMEPAD', 'TOUCH']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    const body = table.createTBody();
    for (const [action, ...cells] of CONTROLS) {
      const tr = body.insertRow();
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = action;
      tr.appendChild(th);
      for (const c of cells) tr.insertCell().textContent = c;
    }

    const defence = document.createElement('div');
    defence.className = 'howto-defence';
    const defenceHeading = document.createElement('h3');
    defenceHeading.textContent = 'DEFENCE';
    defence.appendChild(defenceHeading);
    for (const line of DEFENCE) {
      const p = document.createElement('p');
      p.textContent = line;
      defence.appendChild(p);
    }
    const alley = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = 'ALLEY-OOP';
    alley.append(strong, ' — jump near the rim while your teammate has the ball.');
    defence.appendChild(alley);

    const back = document.createElement('button');
    back.className = 'menu-button';
    back.dataset.action = 'back';
    back.dataset.navRow = '0';
    back.textContent = 'BACK';
    back.addEventListener('click', () => options.onBack());

    this.el.append(heading, table, defence, back);
    parent.appendChild(this.el);
    this.nav = new MenuNav(this.el, () => options.onBack());
    back.focus();
  }

  handleCommand(command: MenuCommand): void {
    this.nav.handle(command);
  }

  dispose(): void {
    this.el.remove();
  }
}
