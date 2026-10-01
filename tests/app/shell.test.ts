// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const created: { deps: { onFinished(f: unknown): void; onQuit(): void } }[] = [];
vi.mock('../../src/app/match-screen', () => ({
  MatchScreen: class {
    constructor(public deps: { onFinished(f: unknown): void; onQuit(): void }) {
      created.push(this);
    }
    handleCommand(): void {}
    dispose(): void {}
  },
}));

const { AppShell } = await import('../../src/app');
const { readGameOptions } = await import('../../src/app/url-options');

describe('AppShell (spec E.1)', () => {
  it('a bare start shows the Title; PLAY goes on to a match (Setup arrives in Task 2)', () => {
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    expect(shell.screen).toBe('title');
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    expect(shell.screen).toBe('match');
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
});
