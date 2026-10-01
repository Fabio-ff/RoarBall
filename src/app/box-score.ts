import type { GameOptions } from './url-options';
import type { PlayerId, SimEvent, TeamIndex } from '../sim/types';

/** Spec D.2's assist window, mirrored from the sim's charge rule. */
export const ASSIST_WINDOW_TICKS = 180;

export interface BoxLine {
  id: PlayerId;
  team: TeamIndex;
  name: string;
  points: number;
  dunks: number;
  threes: number;
  assists: number;
  steals: number;
  blocks: number;
  abilityUses: number;
}

export interface MatchResult {
  score: [number, number];
  humanTeam: TeamIndex;
  overtime: boolean;
  lines: BoxLine[];
  options: GameOptions;
}

/** Spec E.1: the Results box score, built from sim events only (plan decision 14). */
export class BoxScore {
  private readonly byId = new Map<PlayerId, BoxLine>();
  /** Receiver → passer of a pass in the air. */
  private readonly pending = new Map<PlayerId, PlayerId>();
  /** Receiver → passer and catch tick. */
  private readonly caught = new Map<PlayerId, { from: PlayerId; tick: number }>();

  constructor(players: readonly { id: PlayerId; team: TeamIndex; name: string }[]) {
    for (const p of players) {
      this.byId.set(p.id, {
        ...p,
        points: 0,
        dunks: 0,
        threes: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        abilityUses: 0,
      });
    }
  }

  record(events: readonly SimEvent[], tick: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'pass':
          this.pending.set(e.to, e.from);
          break;
        case 'intercept':
          this.pending.clear();
          break;
        case 'catch': {
          const from = this.pending.get(e.playerId);
          this.pending.delete(e.playerId);
          if (from !== undefined && this.byId.get(from)?.team === this.byId.get(e.playerId)?.team) {
            this.caught.set(e.playerId, { from, tick });
          }
          break;
        }
        case 'possessionChange':
          this.caught.clear();
          this.pending.clear();
          break;
        case 'basket': {
          const scorer = this.byId.get(e.playerId);
          if (scorer) {
            scorer.points += e.points;
            if (e.shotType === 'dunk') scorer.dunks += 1;
            if (e.points === 3) scorer.threes += 1;
          }
          const c = this.caught.get(e.playerId);
          if (c && tick - c.tick <= ASSIST_WINDOW_TICKS) {
            const passer = this.byId.get(c.from);
            if (passer) passer.assists += 1;
          }
          this.caught.clear();
          break;
        }
        case 'steal':
          this.bump(e.by, 'steals');
          break;
        case 'block':
          this.bump(e.by, 'blocks');
          break;
        case 'abilityActivated':
          this.bump(e.playerId, 'abilityUses');
          break;
        default:
          break;
      }
    }
  }

  lines(): BoxLine[] {
    return [...this.byId.values()].map((l) => ({ ...l }));
  }

  private bump(id: PlayerId, key: 'steals' | 'blocks' | 'abilityUses'): void {
    const l = this.byId.get(id);
    if (l) l[key] += 1;
  }
}
