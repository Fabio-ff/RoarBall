import type { MatchResult } from '../../app/box-score';
import type { MenuCommand } from '../../input/menu-input';
import type { PlayerId } from '../../sim/types';
import { MenuNav } from '../menu-nav';
import './screens.css';
import './results.css';

export interface ResultsOptions {
  result: MatchResult;
  humanId: PlayerId;
  onRematch(): void;
  onChangeSetup(): void;
  onTitle(): void;
}

const COLUMNS = ['PTS', 'DNK', '3PT', 'AST', 'STL', 'BLK', 'ABL'] as const;

export function resultHeadline(result: MatchResult): 'YOU WIN!' | 'YOU LOSE' | 'OVERTIME WIN!' {
  const mine = result.score[result.humanTeam];
  const theirs = result.score[result.humanTeam === 0 ? 1 : 0];
  if (mine > theirs) return result.overtime ? 'OVERTIME WIN!' : 'YOU WIN!';
  return 'YOU LOSE';
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Spec E.1 Results: headline, final score, box score, REMATCH / CHANGE SETUP / TITLE. */
export class ResultsScreen {
  private readonly el: HTMLDivElement;
  private readonly nav: MenuNav;

  constructor(parent: HTMLElement, options: ResultsOptions) {
    const { result } = options;
    const won = resultHeadline(result) !== 'YOU LOSE';
    const head = COLUMNS.map((c) => `<th>${c}</th>`).join('');
    const rows = result.lines
      .map((l) => {
        const cells = [l.points, l.dunks, l.threes, l.assists, l.steals, l.blocks, l.abilityUses];
        const cls = `team-${l.team}${l.id === options.humanId ? ' is-you' : ''}`;
        return (
          `<tr class="${cls}"><td class="results-name"><span class="results-dot"></span>${escapeHtml(l.name)}</td>` +
          cells.map((n) => `<td>${n}</td>`).join('') +
          '</tr>'
        );
      })
      .join('');
    this.el = document.createElement('div');
    this.el.className = 'screen screen-results';
    this.el.innerHTML =
      `<h1 class="results-headline${won ? ' is-win' : ''}">${resultHeadline(result)}</h1>` +
      `<div class="results-score">${result.score[0]} – ${result.score[1]}</div>` +
      `<table class="results-box"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>` +
      '<div class="menu-column results-actions">' +
      '<button class="menu-button is-primary" data-action="rematch" data-nav-row="0">REMATCH</button>' +
      '<button class="menu-button is-secondary" data-action="setup" data-nav-row="0">CHANGE SETUP</button>' +
      '<button class="menu-button is-secondary" data-action="title" data-nav-row="0">TITLE</button>' +
      '</div>';
    parent.appendChild(this.el);
    const on = (action: string, fn: () => void): void =>
      this.el.querySelector(`[data-action="${action}"]`)?.addEventListener('click', fn);
    on('rematch', () => options.onRematch());
    on('setup', () => options.onChangeSetup());
    on('title', () => options.onTitle());
    this.nav = new MenuNav(this.el, () => options.onTitle());
    this.nav.focusFirst();
  }

  handleCommand(command: MenuCommand): void {
    this.nav.handle(command);
  }

  dispose(): void {
    this.el.remove();
  }
}
