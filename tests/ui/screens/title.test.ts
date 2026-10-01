// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { TitleScreen } from '../../../src/ui/screens/title';

describe('TitleScreen', () => {
  it('renders PLAY and a sound toggle; PLAY calls onPlay; the toggle flips the setting', () => {
    const root = document.createElement('div');
    const onPlay = vi.fn();
    const onSound = vi.fn();
    const screen = new TitleScreen(root, { sound: true, onPlay, onSoundChange: onSound });
    const play = root.querySelector<HTMLButtonElement>('[data-action="play"]');
    const sound = root.querySelector<HTMLButtonElement>('[data-action="sound"]');
    expect(play?.dataset.navRow).toBe('0');
    expect(sound?.textContent).toBe('SOUND: ON');
    play?.click();
    expect(onPlay).toHaveBeenCalledOnce();
    sound?.click();
    expect(onSound).toHaveBeenCalledWith(false);
    expect(sound?.textContent).toBe('SOUND: OFF');
    screen.dispose();
    expect(root.children.length).toBe(0);
  });

  it('handles menu commands through MenuNav (confirm on the focused PLAY)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onPlay = vi.fn();
    const screen = new TitleScreen(root, { sound: true, onPlay, onSoundChange: vi.fn() });
    screen.handleCommand('confirm');
    expect(onPlay).toHaveBeenCalledOnce();
    screen.dispose();
  });
});
