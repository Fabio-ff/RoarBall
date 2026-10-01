/** Spec E.1: the shell's screens. Pause is an overlay inside the match (plan decision 1). */
export type ScreenId = 'title' | 'setup' | 'howToPlay' | 'match' | 'results';

export type ShellEvent =
  | { type: 'play' }
  | { type: 'howToPlay' }
  | { type: 'start' }
  | { type: 'back' }
  | { type: 'finished' }
  | { type: 'quit' }
  | { type: 'rematch' }
  | { type: 'changeSetup' }
  | { type: 'toTitle' };

const TABLE: Record<ScreenId, Partial<Record<ShellEvent['type'], ScreenId>>> = {
  title: { play: 'setup', howToPlay: 'howToPlay' },
  howToPlay: { howToPlay: 'howToPlay', back: 'title' },
  setup: { start: 'match', back: 'title' },
  match: { finished: 'results', quit: 'title' },
  results: { rematch: 'match', changeSetup: 'setup', toTitle: 'title', back: 'title' },
};

/** Title → Setup → Match → Results → Match | Setup | Title; anything else is ignored. */
export function transition(screen: ScreenId, event: ShellEvent): ScreenId {
  return TABLE[screen][event.type] ?? screen;
}
