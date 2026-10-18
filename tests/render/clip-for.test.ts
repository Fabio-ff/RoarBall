import { describe, expect, it } from 'vitest';
import { CANONICAL_CLIPS as PIPELINE_CLIPS } from '../../scripts/asset-pipeline/manifest.ts';
import {
  CANONICAL_CLIPS,
  clipFor,
  LOOPING_CLIPS,
  resolveClip,
  runTimeScale,
  type CanonicalClip,
} from '../../src/render/clip-for';
import type { PlayerAction } from '../../src/sim/types';

describe('clipFor (spec F.7.3)', () => {
  const rows: [PlayerAction, boolean, boolean, CanonicalClip][] = [
    ['idle', false, false, 'idle'],
    ['idle', false, true, 'dribble'],
    ['idle', true, false, 'run'],
    ['idle', true, true, 'run'],
    ['run', true, false, 'run'],
    ['run', true, true, 'run'],
    ['run', false, true, 'dribble'],
    ['run', false, false, 'idle'],
    ['jump', false, false, 'jump'],
    ['jump', true, true, 'jump'],
    ['block', true, false, 'jump'],
    ['shoot', false, true, 'shoot'],
    ['layup', true, true, 'shoot'],
    ['dunk', false, true, 'shoot'],
    ['pass', true, true, 'shoot'],
    ['steal', true, false, 'hit'],
    ['shove', false, false, 'hit'],
    ['stunned', true, true, 'fall'],
    ['getup', false, false, 'idle'],
    ['getup', true, true, 'idle'],
  ];
  it.each(rows)('%s moving=%s hasBall=%s -> %s', (action, moving, hasBall, expected) => {
    expect(clipFor(action, moving, hasBall)).toBe(expected);
  });

  it('returns a canonical clip for every action', () => {
    const actions: PlayerAction[] = [
      'idle',
      'run',
      'jump',
      'shoot',
      'layup',
      'dunk',
      'pass',
      'block',
      'steal',
      'shove',
      'stunned',
      'getup',
    ];
    for (const action of actions) {
      expect(CANONICAL_CLIPS).toContain(clipFor(action, false, false));
    }
  });
});

describe('resolveClip (spec F.7.4)', () => {
  it('returns the wanted clip when the model has it', () => {
    expect(resolveClip('shoot', new Set(['idle', 'shoot']))).toBe('shoot');
  });
  it('falls back to idle when the wanted clip is missing', () => {
    expect(resolveClip('fall', new Set(['idle', 'run']))).toBe('idle');
  });
  it('returns null (bind pose) when idle is missing too', () => {
    expect(resolveClip('run', new Set(['shoot']))).toBeNull();
    expect(resolveClip('idle', new Set())).toBeNull();
  });
});

describe('looping and run speed', () => {
  it('only idle, run and dribble loop', () => {
    expect([...LOOPING_CLIPS].sort()).toEqual(['dribble', 'idle', 'run']);
  });
  it('the pipeline and the renderer list the same canonical clips', () => {
    expect([...PIPELINE_CLIPS]).toEqual([...CANONICAL_CLIPS]);
  });
  it('runTimeScale is speed over run speed, kept within 0.4..2', () => {
    expect(runTimeScale(5, 5)).toBe(1);
    expect(runTimeScale(7.5, 5)).toBe(1.5);
    expect(runTimeScale(0.5, 5)).toBe(0.4);
    expect(runTimeScale(50, 5)).toBe(2);
  });
  it('runTimeScale ignores a non-positive run speed', () => {
    expect(runTimeScale(3, 0)).toBe(1);
    expect(runTimeScale(3, Number.NaN)).toBe(1);
  });
});
