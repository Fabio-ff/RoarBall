import { findPlayer } from '../sim/match';
import { nearestHoopIndex } from '../sim/hoop';
import type { CourtDef, MatchState, PlayerId, SimEvent } from '../sim/types';

export type EffectCommand =
  | { kind: 'burst'; at: 'rim'; hoop: 0 | 1; color: number; size: 'small' | 'big' }
  | { kind: 'rimShake'; hoop: 0 | 1 }
  | { kind: 'shake'; strength: number }
  | { kind: 'shockwave'; playerId: PlayerId }
  | { kind: 'flash'; playerId: PlayerId; color: number };

export const SHAKE = { dunk: 0.6, earthquake: 1, block: 0.3, knockdown: 0.3 } as const;

/** Pure event → presentation effects (spec E.5). `state` is the post-step state. */
export function effectsFor(
  event: SimEvent,
  state: MatchState,
  court: CourtDef,
  teamColors: readonly [number, number],
): EffectCommand[] {
  switch (event.type) {
    case 'basket': {
      // On the basket tick the ball is at the rim it went through.
      const hoop = nearestHoopIndex(court, state.ball.pos);
      const dunk = event.shotType === 'dunk';
      const out: EffectCommand[] = [
        {
          kind: 'burst',
          at: 'rim',
          hoop,
          color: teamColors[event.team],
          size: dunk || event.points === 3 ? 'big' : 'small',
        },
      ];
      if (dunk) {
        out.push({ kind: 'rimShake', hoop }, { kind: 'shake', strength: SHAKE.dunk });
      }
      return out;
    }
    case 'block':
      return [{ kind: 'shake', strength: SHAKE.block }];
    case 'knockdown':
      return [{ kind: 'shake', strength: SHAKE.knockdown }];
    case 'abilityActivated': {
      const player = findPlayer(state, event.playerId);
      if (!player) return [];
      const out: EffectCommand[] = [
        { kind: 'flash', playerId: event.playerId, color: teamColors[player.team] },
      ];
      if (event.abilityId === 'earthquake') {
        out.push(
          { kind: 'shockwave', playerId: event.playerId },
          { kind: 'shake', strength: SHAKE.earthquake },
        );
      }
      return out;
    }
    default:
      return [];
  }
}
