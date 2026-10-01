// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildSetupCatalog, DEFAULT_SETUP, RANDOM } from '../../../src/app/setup-model';
import { SetupScreen } from '../../../src/ui/screens/setup';

function make(setup = DEFAULT_SETUP) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onStart = vi.fn();
  const onBack = vi.fn();
  const screen = new SetupScreen(root, {
    setup: { ...setup },
    catalog: buildSetupCatalog(),
    onStart,
    onBack,
  });
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  return { root, screen, onStart, onBack, q };
}

describe('SetupScreen (spec E.1)', () => {
  it('renders the rows You, Teammate, Opponent 1, Opponent 2, Court, Difficulty, Start', () => {
    const { root } = make();
    expect([...root.querySelectorAll('[data-row-label]')].map((e) => e.textContent)).toEqual([
      'YOU',
      'TEAMMATE',
      'OPPONENT 1',
      'OPPONENT 2',
      'COURT',
      'DIFFICULTY',
    ]);
    // 4 characters in the first two rows; 4 + RANDOM in each opponent row; 4 courts; 3 profiles.
    expect(root.querySelectorAll('[data-nav-row="0"]').length).toBe(4);
    expect(root.querySelectorAll('[data-nav-row="2"]').length).toBe(5);
    expect(root.querySelectorAll('[data-nav-row="4"]').length).toBe(4);
    expect(root.querySelectorAll('[data-nav-row="5"]').length).toBe(3);
    expect([...root.querySelectorAll('[data-nav-row="6"]')].map((e) => e.textContent)).toEqual([
      'BACK',
      'START',
    ]);
  });

  it('marks the current choices selected', () => {
    const { q } = make();
    expect(q('[data-field="characterId"][data-value="rook"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(q('[data-field="aiProfile"][data-value="fair"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(q('[data-field="characterId"][data-value="ace"]')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('character cards show the ability and seven stat bars; court cards the description and modifier', () => {
    const { q } = make();
    const ace = q('[data-field="characterId"][data-value="ace"]');
    expect(ace?.textContent).toContain('Hot Hand');
    expect(ace?.querySelectorAll('.stat-bar').length).toBe(7);
    expect(q('[data-field="courtId"][data-value="rooftop"]')?.textContent).toContain('Gusts');
    expect(q('[data-field="courtId"][data-value="gym"]')?.textContent).toContain('No modifier');
  });

  it('clicking cards changes the choice; START reports it; back calls onBack', () => {
    const { q, onStart, screen, onBack } = make();
    q('[data-field="characterId"][data-value="dash"]')?.click();
    q('[data-field="opponent1"][data-value="random"]')?.click();
    q('[data-field="courtId"][data-value="frozen"]')?.click();
    q('[data-field="aiProfile"][data-value="easy"]')?.click();
    q('[data-action="start"]')?.click();
    expect(onStart).toHaveBeenCalledWith({
      ...DEFAULT_SETUP,
      characterId: 'dash',
      opponentIds: ['brick', RANDOM],
      courtId: 'frozen',
      aiProfile: 'easy',
    });
    screen.handleCommand('back');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('the BACK button calls onBack and START holds the initial focus', () => {
    const { q, onBack } = make();
    expect(document.activeElement).toBe(q('[data-action="start"]'));
    q('[data-action="back"]')?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('character cards label the seven stat bars in order', () => {
    const { q } = make();
    const labels = [
      ...(q('[data-field="characterId"][data-value="ace"]')?.querySelectorAll('.stat-label') ?? []),
    ].map((e) => e.textContent);
    expect(labels).toEqual(['SPD', 'JMP', 'SHT', 'DNK', 'DEF', 'POW', 'STA']);
  });

  it('a clicked card takes focus (iPad Safari does not focus buttons on tap)', () => {
    const { q } = make();
    const card = q('[data-field="courtId"][data-value="frozen"]');
    card?.click();
    expect(document.activeElement).toBe(card);
  });

  it('starts with focus on START so a quick confirm plays the remembered setup', () => {
    const { screen, onStart } = make();
    screen.handleCommand('confirm');
    expect(onStart).toHaveBeenCalledOnce();
  });
});
