import { describe, expect, it } from 'vitest';
import { transition, type ScreenId, type ShellEvent } from '../../src/app/screens';

describe('transition (spec E.1 flow)', () => {
  const cases: [ScreenId, ShellEvent['type'], ScreenId][] = [
    ['title', 'play', 'setup'],
    ['setup', 'start', 'match'],
    ['setup', 'back', 'title'],
    ['match', 'finished', 'results'],
    ['match', 'quit', 'title'],
    ['results', 'rematch', 'match'],
    ['results', 'changeSetup', 'setup'],
    ['results', 'toTitle', 'title'],
    ['results', 'back', 'title'],
  ];
  it.each(cases)('%s + %s → %s', (from, type, to) => {
    expect(transition(from, { type } as ShellEvent)).toBe(to);
  });

  it('ignores events that do not apply to the current screen', () => {
    expect(transition('title', { type: 'finished' })).toBe('title');
    expect(transition('match', { type: 'play' })).toBe('match');
    expect(transition('setup', { type: 'rematch' })).toBe('setup');
  });
});
