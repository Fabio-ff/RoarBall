// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { HowToPlayScreen } from '../../../src/ui/screens/how-to-play';

function make() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onBack = vi.fn();
  const screen = new HowToPlayScreen(root, { onBack });
  return { root, screen, onBack };
}

describe('HowToPlayScreen', () => {
  it('shows the column headers, every control row and the defence notes', () => {
    const { root } = make();
    expect([...root.querySelectorAll('th')].map((e) => e.textContent)).toEqual(
      expect.arrayContaining(['KEYBOARD', 'GAMEPAD', 'TOUCH']),
    );
    const text = root.textContent ?? '';
    for (const label of [
      'HOW TO PLAY',
      'Move',
      'Shoot (with the ball)',
      'Pass (with the ball)',
      'Call for the ball (without it)',
      'Ability when the bar is full',
      'Turbo',
      'Pause',
      'DEFENCE',
      'Block',
      'Steal',
      'Shove',
      'ALLEY-OOP',
    ]) {
      expect(text).toContain(label);
    }
  });

  it('BACK and the back command call onBack; focus starts on BACK', () => {
    const { root, screen, onBack } = make();
    const back = root.querySelector<HTMLButtonElement>('[data-action="back"]');
    expect(back?.dataset.navRow).toBe('0');
    expect(document.activeElement).toBe(back);
    back?.click();
    screen.handleCommand('back');
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('dispose removes the screen', () => {
    const { root, screen } = make();
    screen.dispose();
    expect(root.children.length).toBe(0);
  });
});
