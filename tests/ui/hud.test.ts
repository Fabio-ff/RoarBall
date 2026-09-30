// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import { bannerFor, formatClock, Hud } from '../../src/ui/hud';
import type { MatchSettings } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};

describe('formatClock', () => {
  it('formats mm:ss rounding up and hides infinite clocks', () => {
    expect(formatClock(180_000)).toBe('3:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(4_300)).toBe('0:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('--:--');
  });
});

describe('bannerFor', () => {
  it('maps events to banners', () => {
    expect(
      bannerFor({ type: 'basket', playerId: 'p', team: 0, points: 3, shotType: 'jumpshot' }),
    ).toBe('3 POINTS!');
    expect(bannerFor({ type: 'basket', playerId: 'p', team: 0, points: 2, shotType: 'dunk' })).toBe(
      'DUNK!',
    );
    expect(
      bannerFor({ type: 'basket', playerId: 'p', team: 0, points: 2, shotType: 'layup' }),
    ).toBe('2 POINTS!');
    expect(bannerFor({ type: 'shotClockViolation', team: 1 })).toBe('SHOT CLOCK!');
    expect(bannerFor({ type: 'phaseChange', from: 'live', to: 'finished' })).toBe('FINAL');
    expect(bannerFor({ type: 'rimHit' })).toBeNull();
  });
});

describe('Hud', () => {
  let parent: HTMLDivElement;
  let hud: Hud;
  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    hud = new Hud(parent);
  });
  afterEach(() => {
    hud.dispose();
    parent.remove();
  });

  const text = (selector: string): string => parent.querySelector(selector)?.textContent ?? '';

  it('renders score, clock and shot clock', () => {
    const state = createMatch(settings, court, []);
    state.score = [7, 12];
    state.shotClockMs = 9_400;
    hud.update(state);
    expect(text('.hud-home')).toBe('7');
    expect(text('.hud-away')).toBe('12');
    expect(text('.hud-clock')).toBe('3:00');
    expect(text('.hud-shotclock')).toBe('10');
  });

  it('hides the match clock in shootaround', () => {
    hud.update(createMatch({ ...settings, mode: 'shootaround' }, court, []));
    expect(parent.querySelector<HTMLElement>('.hud-clock')?.hidden).toBe(true);
  });

  it('shows banners one after another and hides them again', () => {
    hud.handleEvents([
      { type: 'basket', playerId: 'p', team: 0, points: 2, shotType: 'layup' },
      { type: 'shotClockViolation', team: 0 },
    ]);
    hud.tick(0);
    expect(text('.hud-banner')).toBe('2 POINTS!');
    hud.tick(1.3);
    expect(text('.hud-banner')).toBe('SHOT CLOCK!');
    hud.tick(1.3);
    expect(parent.querySelector<HTMLElement>('.hud-banner')?.hidden).toBe(true);
  });
});
