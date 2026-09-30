import type { MatchState, SimEvent } from '../sim/types';
import './hud.css';

const BANNER_SECONDS = 1.2;

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function bannerFor(event: SimEvent): string | null {
  switch (event.type) {
    case 'basket':
      if (event.shotType === 'dunk') return 'DUNK!';
      return event.points === 3 ? '3 POINTS!' : '2 POINTS!';
    case 'shotClockViolation':
      return 'SHOT CLOCK!';
    case 'phaseChange':
      return event.to === 'finished' ? 'FINAL' : null;
    default:
      return null;
  }
}

/** Score, clocks and event banners in the DOM (spec §9 "UI screens"). Never reads input. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly home: HTMLSpanElement;
  private readonly away: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly shotClock: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly queue: string[] = [];
  private bannerLeft = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML =
      '<div class="hud-score"><span class="hud-team hud-home">0</span>' +
      '<span class="hud-clock">0:00</span><span class="hud-team hud-away">0</span></div>' +
      '<div class="hud-shotclock">0</div><div class="hud-banner" hidden></div>';
    parent.appendChild(this.root);
    this.home = this.query('.hud-home');
    this.away = this.query('.hud-away');
    this.clock = this.query('.hud-clock');
    this.shotClock = this.query('.hud-shotclock');
    this.banner = this.query('.hud-banner');
  }

  private query<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`HUD element missing: ${selector}`);
    return el;
  }

  update(state: MatchState): void {
    this.home.textContent = String(state.score[0]);
    this.away.textContent = String(state.score[1]);
    this.clock.hidden = state.settings.mode === 'shootaround';
    this.clock.textContent = state.overtime ? 'OT' : formatClock(state.clockMs);
    this.shotClock.textContent = String(Math.ceil(state.shotClockMs / 1000));
    this.shotClock.classList.toggle('is-low', state.shotClockMs <= 5000);
  }

  handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      const text = bannerFor(event);
      if (text) this.queue.push(text);
    }
  }

  tick(dtSeconds: number): void {
    this.bannerLeft -= dtSeconds;
    if (this.bannerLeft <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.banner.textContent = next;
        this.banner.hidden = false;
        this.bannerLeft = BANNER_SECONDS;
      } else {
        this.banner.hidden = true;
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
