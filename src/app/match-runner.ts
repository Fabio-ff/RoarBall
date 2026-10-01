import { NO_ABILITIES, type AbilityTable } from '../sim/hooks';
import { tick } from '../sim/tick';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, SimEvent } from '../sim/types';

/** Holds the two latest simulation states so the renderer can interpolate between them. */
export class MatchRunner {
  private prev: MatchState;
  private next: MatchState;

  constructor(
    readonly court: CourtDef,
    initial: MatchState,
    readonly abilities: AbilityTable = NO_ABILITIES,
  ) {
    this.prev = initial;
    this.next = initial;
  }

  get previous(): MatchState {
    return this.prev;
  }

  get current(): MatchState {
    return this.next;
  }

  step(intents: ReadonlyMap<PlayerId, PlayerIntent>): SimEvent[] {
    const result = tick(this.next, intents, this.court, this.abilities);
    this.prev = this.next;
    this.next = result.state;
    return result.events;
  }
}
