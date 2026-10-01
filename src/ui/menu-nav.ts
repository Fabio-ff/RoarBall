import type { MenuCommand } from '../input/menu-input';

/**
 * Grid focus navigation (plan decision 4): elements with `data-nav-row="<n>"` form rows in
 * DOM order; disabled or hidden elements are skipped. Pointer input uses ordinary clicks.
 */
export class MenuNav {
  private rows: HTMLElement[][] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly onBack?: () => void,
  ) {
    this.refresh();
  }

  /** Re-reads the rows (call after the screen re-renders cards). */
  refresh(): void {
    const byRow = new Map<number, HTMLElement[]>();
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-nav-row]')) {
      if (el.hidden || (el as HTMLButtonElement).disabled) continue;
      const row = Number(el.dataset.navRow);
      byRow.set(row, [...(byRow.get(row) ?? []), el]);
    }
    this.rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, els]) => els);
  }

  focusFirst(): void {
    this.rows[0]?.[0]?.focus();
  }

  handle(command: MenuCommand): boolean {
    if (command === 'back') {
      if (!this.onBack) return false;
      this.onBack();
      return true;
    }
    if (command === 'pause') return false;
    this.refresh();
    const pos = this.position();
    if (!pos) {
      this.focusFirst();
      return true;
    }
    const [r, c] = pos;
    if (command === 'confirm') {
      this.rows[r]?.[c]?.click();
      return true;
    }
    const nr =
      command === 'up'
        ? Math.max(0, r - 1)
        : command === 'down'
          ? Math.min(this.rows.length - 1, r + 1)
          : r;
    const row = this.rows[nr] ?? [];
    const nc =
      nr !== r
        ? Math.min(c, row.length - 1)
        : command === 'left'
          ? Math.max(0, c - 1)
          : command === 'right'
            ? Math.min(row.length - 1, c + 1)
            : c;
    row[nc]?.focus();
    return true;
  }

  private position(): [number, number] | null {
    const active = document.activeElement;
    for (let r = 0; r < this.rows.length; r++) {
      const c = this.rows[r]?.indexOf(active as HTMLElement) ?? -1;
      if (c >= 0) return [r, c];
    }
    return null;
  }
}
