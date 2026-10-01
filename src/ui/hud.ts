import type { MatchState, SimEvent, TeamIndex } from '../sim/types';
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
    case 'block':
      return 'BLOCKED!';
    case 'steal':
      return 'STEAL!';
    case 'intercept':
      return 'INTERCEPTED!';
    case 'alleyOop':
      return 'ALLEY-OOP!';
    default:
      return null; // the final is a sticky banner built from the state (spec C.6)
  }
}

/** Spec C.6: `FINAL 21–18 · YOU WIN!` from the human team's point of view. */
export function finalBanner(state: MatchState, humanTeam: TeamIndex): string {
  const [home, away] = state.score;
  const won = state.score[humanTeam] > state.score[humanTeam === 0 ? 1 : 0];
  return `FINAL ${home}–${away} · ${won ? 'YOU WIN!' : 'YOU LOSE'}`;
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
  private wasOvertime = false;
  private final = false;
  /** Last text written per element, so a frame with no change writes nothing to the DOM. */
  private readonly written = new Map<HTMLElement, string>();

  constructor(
    parent: HTMLElement,
    private readonly humanTeam: TeamIndex = 0,
  ) {
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

  private setText(el: HTMLElement, text: string): void {
    if (this.written.get(el) === text) return;
    el.textContent = text;
    this.written.set(el, text);
  }

  update(state: MatchState): void {
    this.setText(this.home, String(state.score[0]));
    this.setText(this.away, String(state.score[1]));
    const hideClock = state.settings.mode === 'shootaround';
    if (this.clock.hidden !== hideClock) this.clock.hidden = hideClock;
    this.setText(this.clock, state.overtime ? 'OT' : formatClock(state.clockMs));
    this.setText(this.shotClock, String(Math.ceil(state.shotClockMs / 1000)));
    this.shotClock.classList.toggle('is-low', state.shotClockMs <= 5000);

    if (state.overtime && !this.wasOvertime) this.queue.push('OVERTIME!');
    this.wasOvertime = state.overtime;

    const final = state.phase === 'finished';
    if (final) {
      this.setText(this.banner, finalBanner(state, this.humanTeam));
      if (!this.final) {
        this.banner.classList.add('is-final');
        this.banner.hidden = false;
      }
    } else if (this.final) {
      // A new match started: drop the sticky banner and any stale queue.
      this.banner.classList.remove('is-final');
      this.banner.hidden = true;
      this.written.delete(this.banner);
      this.queue.length = 0;
      this.bannerLeft = 0;
    }
    this.final = final;
  }

  handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      const text = bannerFor(event);
      if (text) this.queue.push(text);
    }
  }

  tick(dtSeconds: number): void {
    if (this.final) return;
    this.bannerLeft -= dtSeconds;
    if (this.bannerLeft <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.setText(this.banner, next);
        this.banner.hidden = false;
        this.bannerLeft = BANNER_SECONDS;
      } else if (!this.banner.hidden) {
        this.banner.hidden = true;
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
