// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MenuNav } from '../../src/ui/menu-nav';

function grid(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML =
    '<button data-nav-row="0">a0</button><button data-nav-row="0">a1</button><button data-nav-row="0">a2</button>' +
    '<button data-nav-row="1">b0</button><button data-nav-row="1" disabled>b1</button>' +
    '<button data-nav-row="2">c0</button><button data-nav-row="2">c1</button>';
  document.body.appendChild(root);
  return root;
}
const focused = (): string => (document.activeElement as HTMLElement).textContent ?? '';

describe('MenuNav (plan decision 4)', () => {
  it('focuses the first element, moves within and across rows, clamps the column', () => {
    const nav = new MenuNav(grid());
    nav.focusFirst();
    expect(focused()).toBe('a0');
    nav.handle('right');
    nav.handle('right');
    expect(focused()).toBe('a2');
    nav.handle('right');
    expect(focused()).toBe('a2'); // no wrap
    nav.handle('down');
    expect(focused()).toBe('b0'); // column 2 clamped to the last enabled element of row 1
    nav.handle('down');
    expect(focused()).toBe('c0');
    nav.handle('right');
    nav.handle('up');
    expect(focused()).toBe('b0');
  });

  it('confirm clicks the focused element; back calls onBack; returns whether it handled', () => {
    const onBack = vi.fn();
    const root = grid();
    const nav = new MenuNav(root, onBack);
    const click = vi.fn();
    root.querySelector('button')?.addEventListener('click', click);
    nav.focusFirst();
    expect(nav.handle('confirm')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(nav.handle('back')).toBe(true);
    expect(onBack).toHaveBeenCalledOnce();
    expect(new MenuNav(root).handle('back')).toBe(false);
    expect(nav.handle('pause')).toBe(false);
  });

  it('starts from the first element when focus is outside the menu', () => {
    const nav = new MenuNav(grid());
    (document.body as HTMLElement).focus();
    nav.handle('down');
    expect(focused()).toBe('a0');
  });
});
