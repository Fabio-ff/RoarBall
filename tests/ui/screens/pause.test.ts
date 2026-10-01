// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/app/storage';
import { PauseOverlay } from '../../../src/ui/screens/pause';

function make() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const handlers = {
    onResume: vi.fn(),
    onRestart: vi.fn(),
    onQuit: vi.fn(),
    onSettingsChange: vi.fn(),
  };
  const overlay = new PauseOverlay(root, { settings: { ...DEFAULT_SETTINGS }, ...handlers });
  const button = (action: string) =>
    root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  return { root, overlay, handlers, button };
}

describe('PauseOverlay (spec E.1)', () => {
  it('lists Resume, Restart, How to play, Sound, Music, Vibration, Reduce motion, Quit in that order', () => {
    const { root } = make();
    expect([...root.querySelectorAll('button')].map((b) => b.dataset.action)).toEqual([
      'resume',
      'restart',
      'howToPlay',
      'sound',
      'music',
      'vibration',
      'reduceMotion',
      'quit',
    ]);
  });

  it('toggles a setting and reports the whole new settings object', () => {
    const { button, handlers } = make();
    button('vibration')?.click();
    expect(handlers.onSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      vibration: false,
    });
    expect(button('vibration')?.textContent).toBe('VIBRATION: OFF');
    button('reduceMotion')?.click();
    expect(handlers.onSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      vibration: false,
      reduceMotion: true,
    });
  });

  it('back and pause commands resume; buttons call their handlers', () => {
    const { overlay, button, handlers } = make();
    overlay.handleCommand('back');
    overlay.handleCommand('pause');
    expect(handlers.onResume).toHaveBeenCalledTimes(2);
    button('restart')?.click();
    button('quit')?.click();
    expect(handlers.onRestart).toHaveBeenCalledOnce();
    expect(handlers.onQuit).toHaveBeenCalledOnce();
  });

  it('HOW TO PLAY opens over the pause menu, takes the commands, and BACK returns to RESUME', () => {
    const { root, overlay, button, handlers } = make();
    button('howToPlay')?.click();
    expect(root.querySelector('.screen-howto')).not.toBeNull();
    overlay.handleCommand('pause'); // routed to the how-to screen: does not resume
    expect(handlers.onResume).not.toHaveBeenCalled();
    expect(root.querySelector('.screen-howto')).not.toBeNull();
    overlay.handleCommand('back');
    expect(root.querySelector('.screen-howto')).toBeNull();
    expect(handlers.onResume).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('resume'));
    button('howToPlay')?.click();
    overlay.dispose();
    expect(root.children.length).toBe(0);
  });
});
