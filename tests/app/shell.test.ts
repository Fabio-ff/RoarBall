// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

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
const { AudioEngine } = await import('../../src/audio/engine');
const { RESULTS_INPUT_GUARD_MS } = await import('../../src/ui/screens/results');
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
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store });
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-field="characterId"][data-value="dash"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    expect(JSON.parse(data['roarball.setup.v1'] ?? '{}').characterId).toBe('dash');
    const first = (created.at(-1)?.deps.options as { seed: number }).seed;
    created.at(-1)?.deps.onQuit();
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    expect(
      root
        .querySelector('[data-field="characterId"][data-value="dash"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    clock.mockReturnValue(2_000);
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    clock.mockRestore();
    expect((created.at(-1)?.deps.options as { seed: number }).seed).not.toBe(first);
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
    vi.useFakeTimers();
    vi.advanceTimersByTime(RESULTS_INPUT_GUARD_MS); // the guard is measured from mount
    root.querySelector<HTMLButtonElement>('[data-action="rematch"]')?.click();
    expect(shell.screen).toBe('match');
    expect(created.at(-1)?.deps.options).toMatchObject({ seed: 42 });
    vi.useRealTimers();
    shell.dispose();
  });
});

describe('AppShell audio (spec E.4)', () => {
  const fakeEngine = () => ({
    played: [] as string[],
    music: [] as (string | null)[],
    enabled: [] as [boolean, boolean][],
    resumed: 0,
    playSfx(name: string) {
      this.played.push(name);
    },
    setMusic(track: string | null) {
      this.music.push(track);
    },
    duck() {},
    setEnabled(sound: boolean, music: boolean) {
      this.enabled.push([sound, music]);
    },
    resume() {
      this.resumed += 1;
    },
    dispose() {},
  });
  const press = (code: string) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates the engine once, on the first keydown, and enables it from the settings', () => {
    const engine = fakeEngine();
    const create = vi
      .spyOn(AudioEngine, 'create')
      .mockReturnValue(engine as unknown as InstanceType<typeof AudioEngine>);
    const shell = new AppShell(document.createElement('div'), { initial: null, store: null });
    expect(create).not.toHaveBeenCalled();
    press('KeyZ');
    press('KeyZ');
    expect(create).toHaveBeenCalledTimes(1);
    expect(engine.enabled).toEqual([[true, true]]);
    shell.dispose();
  });

  it('later keydowns and gamepad commands keep resuming the engine', () => {
    const engine = fakeEngine();
    vi.spyOn(AudioEngine, 'create').mockReturnValue(
      engine as unknown as InstanceType<typeof AudioEngine>,
    );
    const shell = new AppShell(document.createElement('div'), { initial: null, store: null });
    press('KeyZ');
    const after = engine.resumed;
    press('KeyZ');
    expect(engine.resumed).toBe(after + 1);
    shell.dispose();
  });

  it('toggling sound tells the engine', () => {
    const engine = fakeEngine();
    vi.spyOn(AudioEngine, 'create').mockReturnValue(
      engine as unknown as InstanceType<typeof AudioEngine>,
    );
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    press('KeyZ');
    root.querySelector<HTMLButtonElement>('[data-action="sound"]')?.click();
    expect(engine.enabled.at(-1)).toEqual([false, true]);
    shell.dispose();
  });

  it('toggling music tells the engine and leaves sound alone', () => {
    const engine = fakeEngine();
    vi.spyOn(AudioEngine, 'create').mockReturnValue(
      engine as unknown as InstanceType<typeof AudioEngine>,
    );
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    press('KeyZ');
    root.querySelector<HTMLButtonElement>('[data-action="music"]')?.click();
    expect(engine.enabled.at(-1)).toEqual([true, false]);
    shell.dispose();
  });

  it('menus click once per command or pointer press; live play is silent', () => {
    const engine = fakeEngine();
    vi.spyOn(AudioEngine, 'create').mockReturnValue(
      engine as unknown as InstanceType<typeof AudioEngine>,
    );
    const root = document.createElement('div');
    document.body.append(root);
    const shell = new AppShell(root, { initial: null, store: null });
    press('KeyZ');
    press('ArrowDown');
    expect(engine.played).toEqual(['menuMove']);
    press('ArrowUp');
    press('Space'); // confirms PLAY: one confirm sound, not two
    expect(shell.screen).toBe('setup');
    expect(engine.played).toEqual(['menuMove', 'menuMove', 'menuConfirm']);
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    expect(engine.played.at(-1)).toBe('menuConfirm');
    expect(shell.screen).toBe('match');
    const before = engine.played.length;
    press('ArrowDown');
    press('Space');
    expect(engine.played.length).toBe(before);
    shell.dispose();
    root.remove();
  });

  it('picks the track per screen: menu, court, then the win or lose jingle', () => {
    const engine = fakeEngine();
    vi.spyOn(AudioEngine, 'create').mockReturnValue(
      engine as unknown as InstanceType<typeof AudioEngine>,
    );
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    press('KeyZ'); // the engine arrives late and takes the current screen's track
    expect(engine.music.at(-1)).toBe('menu');
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    expect(engine.music.at(-1)).toBe('menu');
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    expect(engine.music.at(-1)).toBe('gym');
    const options = created.at(-1)?.deps.options as ReturnType<typeof readGameOptions>;
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
    const finish = (score: [number, number]) =>
      created.at(-1)?.deps.onFinished({
        score,
        humanTeam: 0,
        overtime: false,
        lines: [line('home1', 0), line('away1', 1)],
        options,
      });
    vi.useFakeTimers();
    finish([21, 18]);
    expect(engine.music.at(-1)).toBe('win');
    vi.advanceTimersByTime(RESULTS_INPUT_GUARD_MS);
    root.querySelector<HTMLButtonElement>('[data-action="rematch"]')?.click();
    finish([10, 18]);
    expect(engine.music.at(-1)).toBe('lose');
    vi.advanceTimersByTime(RESULTS_INPUT_GUARD_MS);
    root.querySelector<HTMLButtonElement>('[data-action="title"]')?.click();
    expect(engine.music.at(-1)).toBe('menu');
    vi.useRealTimers();
    shell.dispose();
  });

  it('stays silent and does not throw where Web Audio is missing', () => {
    vi.spyOn(AudioEngine, 'create').mockReturnValue(null);
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    expect(() => press('ArrowDown')).not.toThrow();
    shell.dispose();
  });
});
