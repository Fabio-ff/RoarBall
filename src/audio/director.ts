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

  constructor(private readonly sink: () => AudioSink) {}

  handleEvents(events: readonly SimEvent[]): void {
    const sink = this.sink();
    for (const event of events) {
      for (const { name, gain } of sfxFor(event)) sink.playSfx(name, gain);
      if (event.type === 'basket' && event.shotType === 'dunk') sink.duck(0.8);
      if (event.type === 'abilityActivated') sink.duck(1);
    }
  }

  /** Shoe squeaks from consecutive states (plan decision 21). */
  update(prev: MatchState, next: MatchState, nowSeconds: number): void {
    for (let team = 0; team < 2; team++) {
      const before = prev.teams[team as 0 | 1].players;
      for (const p of next.teams[team as 0 | 1].players) {
        const q = before.find((b) => b.id === p.id);
        if (!q || !p.onGround) continue;
        const a = Math.hypot(q.vel.x, q.vel.z);
        const b = Math.hypot(p.vel.x, p.vel.z);
        if (a < SQUEAK_SPEED || b < SQUEAK_SPEED) continue;
        const cos = (q.vel.x * p.vel.x + q.vel.z * p.vel.z) / (a * b);
        if (cos > SQUEAK_COS) continue;
        if (nowSeconds - (this.lastSqueak.get(p.id) ?? -Infinity) < SQUEAK_GAP_S) continue;
        this.lastSqueak.set(p.id, nowSeconds);
        this.sink().playSfx('squeak', 0.6);
      }
    }
  }
}
