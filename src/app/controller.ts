import type { MatchState, PlayerIntent } from '../sim/types';

/** One intent per tick from the match state. Humans wrap InputManager; AI brains and dummies implement it too. */
export type Controller = (state: MatchState) => PlayerIntent;
