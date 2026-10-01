import { CHARGE_MAX } from '../sim/abilities';
import { TICK_RATE } from '../sim/constants';
import { NO_ABILITIES, type AbilityDef, type AbilityTable } from '../sim/hooks';
import { findPlayer } from '../sim/match';
import type { Vec3 } from '../sim/math';
import type { MatchState, PlayerId, PlayerState, SimEvent, TeamIndex } from '../sim/types';
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

/** Spec D.6: "ROCKET DUNK!" and friends, from the ability's name. */
export function abilityBanner(abilityId: string, abilities: AbilityTable): string {
  return `${(abilities[abilityId]?.name ?? abilityId).toUpperCase()}!`;
}

export interface AbilityBarView {
  /** 0..100: charge, or the share of the timer left while active. */
  fill: number;
  status: string;
  ready: boolean;
  active: boolean;
}

/** Spec D.6: what the human's ability bar shows — charge, READY, seconds left, or Hot Hand pips. */
export function abilityBarView(
  player: PlayerState,
  def: AbilityDef,
  out: AbilityBarView = { fill: 0, status: '', ready: false, active: false },
): AbilityBarView {
  const active = player.ability;
  if (active !== null) {
    out.ready = false;
    out.active = true;
    if (active.ticksLeft !== null) {
      const total = typeof def.durationTicks === 'number' ? def.durationTicks : active.ticksLeft;
      out.fill = total > 0 ? (100 * active.ticksLeft) / total : 0;
      out.status = `${Math.ceil(active.ticksLeft / TICK_RATE)} s`;
    } else {
      out.fill = 100;
      out.status = '●'.repeat(Math.max(0, active.uses));
    }
    return out;
  }
  const ready = player.charge >= CHARGE_MAX;
  out.fill = Math.min(100, player.charge);
  out.status = ready ? 'READY' : '';
  out.ready = ready;
  out.active = false;
  return out;
}

/** The camera sits on +Z, looking at −Z: court X is screen right and court Z is screen down. */
export function gustArrowDegrees(dir: Vec3): number {
  return (Math.atan2(dir.z, dir.x) * 180) / Math.PI;
}

export interface HudOptions {
  /** The human's player: the ability bar follows them. */
  humanId?: PlayerId;
  /** Names for the ability bar and banners (the app passes the content table). */
  abilities?: AbilityTable;
  /** Shows a pause button (the touch way to pause, spec E.1) that calls this. */
  onPause?: () => void;
}

interface Banner {
  text: string;
  /** Team colour of the banner; null = the default white. */
  team: TeamIndex | null;
}

/** Score, clocks, ability bar and event banners in the DOM (spec §9, D.6). Never reads input. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly home: HTMLSpanElement;
  private readonly away: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly shotClock: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly ability: HTMLDivElement;
  private readonly abilityName: HTMLSpanElement;
  private readonly abilityFill: HTMLSpanElement;
  private readonly abilityStatus: HTMLSpanElement;
  private readonly gust: HTMLDivElement;
  private readonly gustArrow: HTMLSpanElement;
  private readonly queue: Banner[] = [];
  private readonly humanId: PlayerId | undefined;
  private readonly abilities: AbilityTable;
  private bannerLeft = 0;
  private wasOvertime = false;
  private final = false;
  /** The sticky final banner is on screen (it waits for the event banners to drain). */
  private finalShown = false;
  private finalText = '';
  /** Last text written per element, so a frame with no change writes nothing to the DOM. */
  private readonly written = new Map<HTMLElement, string>();
  /** Per-frame scratch and last-seen values, so an unchanged frame builds no strings or objects. */
  private readonly view: AbilityBarView = { fill: 0, status: '', ready: false, active: false };
  private lastHome = -1;
  private lastAway = -1;
  private lastClockKey = Number.NaN;
  private lastShotSeconds = -1;
  private lastAbilityDef: AbilityDef | undefined;
  private lastWidth = -1;

  constructor(
    parent: HTMLElement,
    private readonly humanTeam: TeamIndex = 0,
    options: HudOptions = {},
  ) {
    this.humanId = options.humanId;
    this.abilities = options.abilities ?? NO_ABILITIES;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML =
      '<div class="hud-score"><span class="hud-team hud-home">0</span>' +
      '<span class="hud-clock">0:00</span><span class="hud-team hud-away">0</span></div>' +
      '<div class="hud-shotclock">0</div>' +
      '<div class="hud-ability" hidden><span class="hud-ability-name"></span>' +
      '<span class="hud-ability-bar"><span class="hud-ability-fill"></span></span>' +
      '<span class="hud-ability-status"></span></div>' +
      '<div class="hud-gust" hidden><span class="hud-gust-arrow">➜</span>GUST</div>' +
      '<div class="hud-banner" hidden></div>' +
      '<button class="hud-pause" type="button" aria-label="Pause" hidden>⏸</button>';
    parent.appendChild(this.root);
    const pause = this.query<HTMLButtonElement>('.hud-pause');
    if (options.onPause) {
      const onPause = options.onPause;
      pause.hidden = false;
      pause.addEventListener('click', () => onPause());
    }
    this.home = this.query('.hud-home');
    this.away = this.query('.hud-away');
    this.clock = this.query('.hud-clock');
    this.shotClock = this.query('.hud-shotclock');
    this.banner = this.query('.hud-banner');
    this.ability = this.query('.hud-ability');
    this.abilityName = this.query('.hud-ability-name');
    this.abilityFill = this.query('.hud-ability-fill');
    this.abilityStatus = this.query('.hud-ability-status');
    this.gust = this.query('.hud-gust');
    this.gustArrow = this.query('.hud-gust-arrow');
    this.ability.classList.add(`team-${humanTeam}`);
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
    if (state.score[0] !== this.lastHome) {
      this.lastHome = state.score[0];
      this.setText(this.home, String(this.lastHome));
    }
    if (state.score[1] !== this.lastAway) {
      this.lastAway = state.score[1];
      this.setText(this.away, String(this.lastAway));
    }
    const hideClock = state.settings.mode === 'shootaround';
    if (this.clock.hidden !== hideClock) this.clock.hidden = hideClock;
    // -1 stands for overtime ("OT"); otherwise whole seconds left (rounded up, as formatClock does).
    const clockKey = state.overtime ? -1 : Math.ceil(state.clockMs / 1000);
    if (clockKey !== this.lastClockKey) {
      this.lastClockKey = clockKey;
      this.setText(this.clock, state.overtime ? 'OT' : formatClock(state.clockMs));
    }
    const shotSeconds = Math.ceil(state.shotClockMs / 1000);
    if (shotSeconds !== this.lastShotSeconds) {
      this.lastShotSeconds = shotSeconds;
      this.setText(this.shotClock, String(shotSeconds));
    }
    this.shotClock.classList.toggle('is-low', state.shotClockMs <= 5000);
    this.updateAbility(state);

    if (state.overtime && !this.wasOvertime) this.queue.push({ text: 'OVERTIME!', team: null });
    this.wasOvertime = state.overtime;

    const final = state.phase === 'finished';
    if (final) {
      this.finalText = finalBanner(state, this.humanTeam);
      if (!this.final) this.gust.hidden = true; // the sim stops ticking, so no gustEnd will come
      // Event banners (the game-ending basket) play out first; the sticky final follows.
      if (this.queue.length === 0 && this.bannerLeft <= 0) this.showFinal();
      else if (this.finalShown) this.setText(this.banner, this.finalText);
    } else if (this.final) {
      // A new match started: drop the sticky banner, any stale queue and the gust chip.
      this.banner.classList.remove('is-final');
      this.banner.hidden = true;
      this.written.delete(this.banner);
      this.queue.length = 0;
      this.bannerLeft = 0;
      this.gust.hidden = true;
      this.finalShown = false;
    }
    this.final = final;
  }

  private showFinal(): void {
    this.setText(this.banner, this.finalText);
    if (this.finalShown) return;
    this.finalShown = true;
    this.banner.classList.remove('team-0', 'team-1');
    this.banner.classList.add('is-final');
    this.banner.hidden = false;
  }

  /** `state` (after the step) gives the activating player's team for ability banners. */
  handleEvents(events: SimEvent[], state?: MatchState): void {
    for (const event of events) {
      if (event.type === 'abilityActivated') {
        const team = state ? (findPlayer(state, event.playerId)?.team ?? null) : null;
        this.queue.push({ text: abilityBanner(event.abilityId, this.abilities), team });
      } else if (event.type === 'gustStart') {
        this.gustArrow.style.transform = `rotate(${gustArrowDegrees(event.dir).toFixed(0)}deg)`;
        this.gust.hidden = false;
      } else if (
        event.type === 'gustEnd' ||
        (event.type === 'phaseChange' && event.to === 'finished')
      ) {
        this.gust.hidden = true;
      } else {
        const text = bannerFor(event);
        if (text) this.queue.push({ text, team: null });
      }
    }
  }

  tick(dtSeconds: number): void {
    if (this.finalShown) return;
    this.bannerLeft -= dtSeconds;
    if (this.bannerLeft <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.setText(this.banner, next.text);
        this.banner.classList.toggle('team-0', next.team === 0);
        this.banner.classList.toggle('team-1', next.team === 1);
        this.banner.hidden = false;
        this.bannerLeft = BANNER_SECONDS;
      } else if (this.final) {
        this.showFinal();
      } else if (!this.banner.hidden) {
        this.banner.hidden = true;
      }
    }
  }

  private updateAbility(state: MatchState): void {
    const me = this.humanId === undefined ? undefined : findPlayer(state, this.humanId);
    const def = me?.abilityId ? this.abilities[me.abilityId] : undefined;
    const hidden = !me || !def;
    if (this.ability.hidden !== hidden) this.ability.hidden = hidden;
    if (!me || !def) return;
    const view = abilityBarView(me, def, this.view);
    if (def !== this.lastAbilityDef) {
      this.lastAbilityDef = def;
      this.setText(this.abilityName, `${def.icon} ${def.name}`);
    }
    this.setText(this.abilityStatus, view.status);
    const width = Math.round(view.fill);
    if (width !== this.lastWidth) {
      this.lastWidth = width;
      this.abilityFill.style.width = `${width}%`;
    }
    this.ability.classList.toggle('is-ready', view.ready);
    this.ability.classList.toggle('is-active', view.active);
  }

  dispose(): void {
    this.root.remove();
  }
}
