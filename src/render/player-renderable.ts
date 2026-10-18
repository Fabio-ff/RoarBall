import type { Group } from 'three';
import type { PlayerState } from '../sim/types';

/** What `MatchScreen` needs from a player on screen: the placeholder and the real model share it (spec F.7.1). */
export interface PlayerRenderable {
  readonly group: Group;
  /**
   * `hasBall` is `next.ball.holder === id`; `dt` is the frame time in seconds (animation mixers
   * run on wall time, the sim state does not carry it).
   */
  update(
    prev: PlayerState,
    next: PlayerState,
    alpha: number,
    tick: number,
    hasBall: boolean,
    dt: number,
  ): void;
  /** Releases mixers and other per-view state; geometry and materials are freed with the scene. */
  dispose?(): void;
}
