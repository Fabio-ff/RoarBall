import type { SetupChoice } from '../../app/setup-model';
import type { MenuCommand } from '../../input/menu-input';
import type { AiProfileId } from '../../sim/ai/profile';
import { MenuNav } from '../menu-nav';
import './screens.css';
import './setup.css';

const RANDOM = 'random';
const STAT_ORDER = ['speed', 'jump', 'shooting', 'dunking', 'defense', 'power', 'stamina'] as const;
const STAT_LABELS: Record<(typeof STAT_ORDER)[number], string> = {
  speed: 'SPD',
  jump: 'JMP',
  shooting: 'SHT',
  dunking: 'DNK',
  defense: 'DEF',
  power: 'POW',
  stamina: 'STA',
};
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

export interface SetupCatalog {
  characters: {
    id: string;
    name: string;
    color: number;
    abilityName: string;
    abilityIcon: string;
    stats: Record<(typeof STAT_ORDER)[number], number>;
  }[];
  courts: {
    id: string;
    name: string;
    description: string;
    modifierName: string;
    floorColor: number;
    skyColor: number;
  }[];
  profiles: { id: AiProfileId; label: string }[];
}

export interface SetupOptions {
  setup: SetupChoice;
  catalog: SetupCatalog;
  onStart(setup: SetupChoice): void;
  onBack(): void;
}

type Field = 'characterId' | 'teammateId' | 'opponent0' | 'opponent1' | 'courtId' | 'aiProfile';

const ROWS: [label: string, field: Field][] = [
  ['YOU', 'characterId'],
  ['TEAMMATE', 'teammateId'],
  ['OPPONENT 1', 'opponent0'],
  ['OPPONENT 2', 'opponent1'],
  ['COURT', 'courtId'],
  ['DIFFICULTY', 'aiProfile'],
];

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Spec E.1 Setup: choose character, teammate, opponents, court and difficulty with cards. */
export class SetupScreen {
  private readonly el: HTMLDivElement;
  private readonly nav: MenuNav;
  private readonly choice: SetupChoice;

  constructor(parent: HTMLElement, options: SetupOptions) {
    this.choice = { ...options.setup, opponentIds: [...options.setup.opponentIds] };
    this.el = document.createElement('div');
    this.el.className = 'screen screen-setup';

    ROWS.forEach(([label, field], navRow) => {
      const section = document.createElement('section');
      section.className = 'setup-row';
      section.innerHTML = `<h3 data-row-label>${label}</h3><div class="setup-cards">${this.cards(field, navRow, options.catalog)}</div>`;
      this.el.appendChild(section);
    });

    const actions = document.createElement('div');
    actions.className = 'setup-actions';
    const back = document.createElement('button');
    back.className = 'menu-button is-secondary';
    back.dataset.action = 'back';
    back.dataset.navRow = String(ROWS.length);
    back.textContent = 'BACK';
    back.addEventListener('click', () => options.onBack());
    const start = document.createElement('button');
    start.className = 'menu-button is-primary';
    start.dataset.action = 'start';
    start.dataset.navRow = String(ROWS.length);
    start.textContent = 'START';
    start.addEventListener('click', () =>
      options.onStart({ ...this.choice, opponentIds: [...this.choice.opponentIds] }),
    );
    actions.append(back, start);
    this.el.appendChild(actions);

    this.el.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-field]');
      if (!card) return;
      this.select(card.dataset.field as Field, card.dataset.value ?? '');
      card.focus();
    });

    parent.appendChild(this.el);
    this.nav = new MenuNav(this.el, options.onBack);
    start.focus();
  }

  private value(field: Field): string {
    switch (field) {
      case 'opponent0':
        return this.choice.opponentIds[0];
      case 'opponent1':
        return this.choice.opponentIds[1];
      default:
        return this.choice[field];
    }
  }

  private select(field: Field, value: string): void {
    if (field === 'opponent0') this.choice.opponentIds[0] = value;
    else if (field === 'opponent1') this.choice.opponentIds[1] = value;
    else if (field === 'aiProfile') this.choice.aiProfile = value as AiProfileId;
    else this.choice[field] = value;
    for (const card of this.el.querySelectorAll<HTMLElement>(`[data-field="${field}"]`)) {
      card.setAttribute('aria-pressed', String(card.dataset.value === value));
    }
  }

  private cards(field: Field, navRow: number, catalog: SetupCatalog): string {
    const current = this.value(field);
    const attrs = (id: string): string =>
      `data-field="${field}" data-value="${esc(id)}" aria-pressed="${id === current}" data-nav-row="${navRow}"`;
    if (field === 'courtId') {
      return catalog.courts
        .map(
          (c) =>
            `<button class="setup-card is-court" ${attrs(c.id)} style="background:linear-gradient(rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.5)), linear-gradient(160deg, ${hex(c.skyColor)} 0%, ${hex(c.floorColor)} 100%)">` +
            `<strong>${esc(c.name)}</strong><span>${esc(c.description)}</span>` +
            `<span class="setup-modifier">${esc(c.modifierName)}</span></button>`,
        )
        .join('');
    }
    if (field === 'aiProfile') {
      return catalog.profiles
        .map(
          (p) =>
            `<button class="menu-button is-secondary setup-difficulty" ${attrs(p.id)}>${esc(p.label)}</button>`,
        )
        .join('');
    }
    const cards = catalog.characters.map((c) => {
      const bars = STAT_ORDER.map(
        (s) =>
          `<span class="stat-col" title="${s} ${c.stats[s]}"><span class="stat-bar"><span style="height:${c.stats[s] * 10}%"></span></span><span class="stat-label">${STAT_LABELS[s]}</span></span>`,
      ).join('');
      return (
        `<button class="setup-card" ${attrs(c.id)} style="--card-color:${hex(c.color)}">` +
        `<strong>${esc(c.name)}</strong>` +
        `<span class="setup-ability">${esc(c.abilityIcon)} ${esc(c.abilityName)}</span>` +
        `<span class="setup-stats">${bars}</span></button>`
      );
    });
    if (field === 'opponent0' || field === 'opponent1') {
      cards.push(
        `<button class="setup-card is-random" ${attrs(RANDOM)}>?<strong>RANDOM</strong></button>`,
      );
    }
    return cards.join('');
  }

  handleCommand(command: MenuCommand): void {
    this.nav.handle(command);
  }

  dispose(): void {
    this.el.remove();
  }
}
