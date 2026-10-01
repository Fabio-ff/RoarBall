// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const created: { deps: { options: unknown; onFinished(f: unknown): void; onQuit(): void } }[] = [];
vi.mock('../../src/app/match-screen', () => ({
  MatchScreen: class {
    constructor(public deps: { options: unknown; onFinished(f: unknown): void; onQuit(): void }) {
      created.push(this);
    }
    handleCommand(): void {}
    dispose(): void {}
  },
}));

const { AppShell } = await import('../../src/app');
const { readGameOptions } = await import('../../src/app/url-options');

describe('AppShell (spec E.1)', () => {
  it('a bare start shows the Title; PLAY → Setup → START → match', () => {
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    expect(shell.screen).toBe('title');
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    expect(shell.screen).toBe('setup');
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    expect(shell.screen).toBe('match');
    expect(created.at(-1)?.deps.options).toMatchObject({ mode: 'match', characterId: 'rook' });
    shell.dispose();
  });

  it('Setup back returns to the Title', () => {
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    expect(shell.screen).toBe('title');
    shell.dispose();
  });

  it('HOW TO PLAY opens from the Title and BACK returns', () => {
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    root.querySelector<HTMLButtonElement>('[data-action="howToPlay"]')?.click();
    expect(shell.screen).toBe('howToPlay');
    root.querySelector<HTMLButtonElement>('[data-action="back"]')?.click();
    expect(shell.screen).toBe('title');
    shell.dispose();
  });

  it('START stores the setup in roarball.setup.v1 and each START builds fresh options', () => {
    const data: Record<string, string> = {};
    const store = {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => void (data[k] = v),
    };
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store });
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-field="characterId"][data-value="dash"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    expect(JSON.parse(data['roarball.setup.v1'] ?? '{}').characterId).toBe('dash');
    const first = created.at(-1)?.deps.options;
    created.at(-1)?.deps.onQuit();
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    expect(
      root
        .querySelector('[data-field="characterId"][data-value="dash"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    expect(created.at(-1)?.deps.options).not.toBe(first);
    shell.dispose();
  });

  it('URL shortcuts start in the match; quitting returns to the Title', () => {
    const root = document.createElement('div');
    const shell = new AppShell(root, {
      initial: readGameOptions('?court=volcano', 0),
      store: null,
    });
    expect(shell.screen).toBe('match');
    created.at(-1)?.deps.onQuit();
    expect(shell.screen).toBe('title');
    shell.dispose();
  });

  it('remembers the sound toggle in storage', () => {
    const data: Record<string, string> = {};
    const store = {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => void (data[k] = v),
    };
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store });
    root.querySelector<HTMLButtonElement>('[data-action="sound"]')?.click();
    expect(JSON.parse(data['roarball.settings.v1'] ?? '{}').sound).toBe(false);
    shell.dispose();
  });

  it('a finished match shows Results; REMATCH starts a match with seed + 1', () => {
    const root = document.createElement('div');
    const options = readGameOptions('?seed=41', 0);
    const shell = new AppShell(root, { initial: options, store: null });
    const line = (id: string, team: 0 | 1) => ({
      id,
      team,
      name: id,
      points: 0,
      dunks: 0,
      threes: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      abilityUses: 0,
    });
    created.at(-1)?.deps.onFinished({
      score: [21, 18],
      humanTeam: 0,
      overtime: false,
      lines: [line('home1', 0), line('away1', 1)],
      options,
    });
    expect(shell.screen).toBe('results');
    expect(root.querySelector('.results-headline')?.textContent).toBe('YOU WIN!');
    root.querySelector<HTMLButtonElement>('[data-action="rematch"]')?.click();
    expect(shell.screen).toBe('match');
    expect(created.at(-1)?.deps.options).toMatchObject({ seed: 42 });
    shell.dispose();
  });
});
