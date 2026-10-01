// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '../../../src/app/box-score';
import { readGameOptions } from '../../../src/app/url-options';
import { ResultsScreen, resultHeadline } from '../../../src/ui/screens/results';

const line = (id: string, team: 0 | 1, name: string, points: number) => ({
  id,
  team,
  name,
  points,
  dunks: 1,
  threes: 0,
  assists: 2,
  steals: 0,
  blocks: 1,
  abilityUses: 1,
});
const result = (score: [number, number], overtime = false): MatchResult => ({
  score,
  humanTeam: 0,
  overtime,
  lines: [
    line('home1', 0, 'Rook', 12),
    line('home2', 0, 'Ace', 9),
    line('away1', 1, 'Brick', 10),
    line('away2', 1, 'Dash', 8),
  ],
  options: readGameOptions('', 0),
});

describe('resultHeadline', () => {
  it('reads the human team', () => {
    expect(resultHeadline(result([21, 18]))).toBe('YOU WIN!');
    expect(resultHeadline(result([18, 21]))).toBe('YOU LOSE');
    expect(resultHeadline(result([23, 21], true))).toBe('OVERTIME WIN!');
    expect(resultHeadline(result([21, 23], true))).toBe('YOU LOSE');
  });
});

describe('ResultsScreen (spec E.1)', () => {
  it('shows score, headline and a box score row per player with the human marked', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const screen = new ResultsScreen(root, {
      result: result([21, 18]),
      humanId: 'home1',
      onRematch: vi.fn(),
      onChangeSetup: vi.fn(),
      onTitle: vi.fn(),
    });
    expect(root.querySelector('.results-headline')?.textContent).toBe('YOU WIN!');
    expect(root.querySelector('.results-score')?.textContent).toBe('21 – 18');
    const rows = root.querySelectorAll('tbody tr');
    expect(rows.length).toBe(4);
    expect(rows[0]?.classList.contains('is-you')).toBe(true);
    expect([...root.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      '',
      'PTS',
      'DNK',
      '3PT',
      'AST',
      'STL',
      'BLK',
      'ABL',
    ]);
    screen.dispose();
  });

  it('REMATCH has focus; buttons and back call their handlers', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const opts = {
      result: result([21, 18]),
      humanId: 'home1',
      onRematch: vi.fn(),
      onChangeSetup: vi.fn(),
      onTitle: vi.fn(),
    };
    const screen = new ResultsScreen(root, opts);
    screen.handleCommand('confirm');
    expect(opts.onRematch).toHaveBeenCalledOnce();
    root.querySelector<HTMLButtonElement>('[data-action="setup"]')?.click();
    expect(opts.onChangeSetup).toHaveBeenCalledOnce();
    screen.handleCommand('back');
    expect(opts.onTitle).toHaveBeenCalledOnce();
    screen.dispose();
  });
});
