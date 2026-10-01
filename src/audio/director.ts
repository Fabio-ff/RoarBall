import type { MatchState, SimEvent } from '../sim/types';
import type { AudioSink, SfxName } from './sink';

export const ABILITY_STINGERS: Readonly<Record<string, SfxName>> = {
  rocketDunk: 'rocketDunk',
  hotHand: 'hotHand',
  blur: 'blur',
  earthquake: 'earthquake',
};

const SQUEAK_SPEED = 3;
const SQUEAK_COS = Math.cos((70 * Math.PI) / 180);
const SQUEAK_GAP_S = 0.25;
/** The sim turns a runner only ~13 degrees per tick, so a cut is measured over 0.2 s of ticks. */
export const SQUEAK_WINDOW_TICKS = 12;

/** Spec E.4: which sounds an event makes. Pure; the director adds ducking and squeaks. */
export function sfxFor(event: SimEvent): { name: SfxName; gain: number }[] {
  switch (event.type) {
    case 'bounce':
      return [{ name: 'bounce', gain: Math.min(1, Math.max(0.15, event.speed / 8)) }];
    case 'basket': {
      const big = event.shotType === 'dunk' || event.points === 3;
      return [
        { name: event.shotType === 'dunk' ? 'dunk' : 'swish', gain: 1 },
        { name: big ? 'crowdBig' : 'crowd', gain: 1 },
      ];
    }
    case 'rimHit':
      return [{ name: 'rim', gain: 1 }];
    case 'boardHit':
      return [{ name: 'board', gain: 1 }];
    case 'pass':
      return [{ name: 'pass', gain: 1 }];
    case 'steal':
    case 'intercept':
      return [{ name: 'steal', gain: 1 }];
    case 'block':
      return [{ name: 'block', gain: 1 }];
    case 'shove':
    case 'knockdown':
      return [{ name: 'shove', gain: 1 }];
    case 'shotClockViolation':
      return [{ name: 'buzzer', gain: 1 }];
    case 'phaseChange':
      return event.to === 'finished' ? [{ name: 'buzzer', gain: 1 }] : [];
    case 'abilityActivated': {
      const name = ABILITY_STINGERS[event.abilityId];
      return name ? [{ name, gain: 1 }] : [];
    }
    default:
      return [];
  }
}

/** Maps sim events and state to sounds (spec E.4). Reads only; never writes state. */
export class AudioDirector {
  private readonly lastSqueak = new Map<string, number>();
  /** Recent horizontal velocities per player, oldest first, at most SQUEAK_WINDOW_TICKS + 1. */
  private readonly history = new Map<string, { x: number; z: number }[]>();

  constructor(private readonly sink: () => AudioSink) {}

  handleEvents(events: readonly SimEvent[]): void {
    const sink = this.sink();
    for (const event of events) {
      for (const { name, gain } of sfxFor(event)) sink.playSfx(name, gain);
      if (event.type === 'basket' && event.shotType === 'dunk') sink.duck(0.8);
      if (event.type === 'abilityActivated') sink.duck(1);
    }
  }

  /** Shoe squeaks: call once per tick; compares velocity with 12 ticks ago (plan decision 21). */
  update(_prev: MatchState, next: MatchState, nowSeconds: number): void {
    for (const team of next.teams) {
      for (const p of team.players) {
        let h = this.history.get(p.id);
        if (!h) this.history.set(p.id, (h = []));
        h.push({ x: p.vel.x, z: p.vel.z });
        if (h.length > SQUEAK_WINDOW_TICKS + 1) h.shift();
        const old = h[0];
        if (!old || h.length <= SQUEAK_WINDOW_TICKS || !p.onGround) continue;
        const a = Math.hypot(old.x, old.z);
        const b = Math.hypot(p.vel.x, p.vel.z);
        if (a < SQUEAK_SPEED || b < SQUEAK_SPEED) continue;
        const cos = (old.x * p.vel.x + old.z * p.vel.z) / (a * b);
        if (cos > SQUEAK_COS) continue;
        if (nowSeconds - (this.lastSqueak.get(p.id) ?? -Infinity) < SQUEAK_GAP_S) continue;
        this.lastSqueak.set(p.id, nowSeconds);
        this.sink().playSfx('squeak', 0.6);
      }
    }
  }
}
