// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch, findPlayer } from '../../src/sim/match';
import { abilityBanner, abilityBarView, bannerFor, formatClock, Hud } from '../../src/ui/hud';
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
    expect(bannerFor({ type: 'phaseChange', from: 'live', to: 'finished' })).toBeNull();
    expect(bannerFor({ type: 'block', by: 'x', shooter: 'a' })).toBe('BLOCKED!');
    expect(bannerFor({ type: 'steal', by: 'x', from: 'a' })).toBe('STEAL!');
    expect(bannerFor({ type: 'intercept', playerId: 'x' })).toBe('INTERCEPTED!');
    expect(bannerFor({ type: 'alleyOop', playerId: 'b' })).toBe('ALLEY-OOP!');
    expect(bannerFor({ type: 'shove', by: 'x', target: 'a' })).toBeNull();
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

  it('shows a sticky final banner with the result for the human team', () => {
    const state = createMatch(settings, court, []);
    state.score = [21, 18];
    state.phase = 'finished';
    hud.update(state);
    hud.tick(5);
    const banner = parent.querySelector<HTMLElement>('.hud-banner')!;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toBe('FINAL 21–18 · YOU WIN!');
    expect(banner.classList.contains('is-final')).toBe(true);
    state.score = [18, 21];
    hud.update(state);
    expect(banner.textContent).toBe('FINAL 18–21 · YOU LOSE');
    // A restart (new match in tipoff) clears it.
    hud.update(createMatch(settings, court, []));
    expect(banner.hidden).toBe(true);
    expect(banner.classList.contains('is-final')).toBe(false);
  });

  it('announces overtime once when sudden death starts', () => {
    const state = createMatch(settings, court, []);
    state.overtime = true;
    hud.update(state);
    hud.update(state);
    hud.tick(0);
    expect(text('.hud-banner')).toBe('OVERTIME!');
    hud.tick(1.3);
    expect(parent.querySelector<HTMLElement>('.hud-banner')?.hidden).toBe(true);
  });

  it('writes the DOM only when a value changes', () => {
    const state = createMatch(settings, court, []);
    hud.update(state);
    const home = parent.querySelector<HTMLElement>('.hud-home')!;
    let writes = 0;
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
    Object.defineProperty(home, 'textContent', {
      set(v: string) {
        writes++;
        original.set!.call(this, v);
      },
      get() {
        return original.get!.call(this) as string;
      },
      configurable: true,
    });
    hud.update(state);
    hud.update(state);
    expect(writes).toBe(0);
    state.score = [1, 0];
    hud.update(state);
    expect(writes).toBe(1);
  });

  it('writes the finished banner state once, not every frame', () => {
    const state = createMatch(settings, court, []);
    state.phase = 'finished';
    hud.update(state);
    const banner = parent.querySelector<HTMLElement>('.hud-banner')!;
    let hiddenWrites = 0;
    let classAdds = 0;
    const hiddenDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden')!;
    Object.defineProperty(banner, 'hidden', {
      set(v: boolean) {
        hiddenWrites++;
        hiddenDesc.set!.call(this, v);
      },
      get() {
        return hiddenDesc.get!.call(this) as boolean;
      },
      configurable: true,
    });
    const add = banner.classList.add.bind(banner.classList);
    banner.classList.add = (...tokens: string[]) => {
      classAdds++;
      add(...tokens);
    };
    hud.update(state);
    hud.update(state);
    expect(hiddenWrites).toBe(0);
    expect(classAdds).toBe(0);
    expect(banner.hidden).toBe(false);
    expect(banner.classList.contains('is-final')).toBe(true);
  });
});

describe('Hud ability bar, ability banners and the GUST chip (spec D.6)', () => {
  let parent: HTMLDivElement;
  let hud: Hud;
  const roster = [
    { id: 'home1', team: 0 as const, characterId: 'brick', character: getCharacter('brick') },
    { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
    { id: 'away1', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
  ];
  const fresh = () => createMatch(settings, court, roster);
  const el = (selector: string): HTMLElement => {
    const found = parent.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`missing ${selector}`);
    return found;
  };
  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    hud = new Hud(parent, 0, { humanId: 'home1', abilities: ABILITIES });
  });
  afterEach(() => {
    hud.dispose();
    parent.remove();
  });

  it('shows the human’s ability name and fills with charge in the team colour', () => {
    const s = fresh();
    const me = findPlayer(s, 'home1');
    if (!me) throw new Error('no human');
    me.charge = 50;
    hud.update(s);
    expect(el('.hud-ability').hidden).toBe(false);
    expect(el('.hud-ability-name').textContent).toContain('Rocket Dunk');
    expect(el('.hud-ability-fill').style.width).toBe('50%');
    expect(el('.hud-ability-status').textContent).toBe('');
    expect(el('.hud-ability').classList.contains('team-0')).toBe(true);
  });

  it('pulses READY at a full bar', () => {
    const s = fresh();
    const me = findPlayer(s, 'home1');
    if (!me) throw new Error('no human');
    me.charge = 100;
    hud.update(s);
    expect(el('.hud-ability-status').textContent).toBe('READY');
    expect(el('.hud-ability').classList.contains('is-ready')).toBe(true);
  });

  it('shows the seconds left while a timed ability runs, draining the bar', () => {
    const s = fresh();
    const me = findPlayer(s, 'home1');
    if (!me) throw new Error('no human');
    me.ability = { ticksLeft: 240, uses: 0 };
    hud.update(s);
    expect(el('.hud-ability-status').textContent).toBe('4 s');
    expect(el('.hud-ability-fill').style.width).toBe('50%'); // 240 of Rocket Dunk's 480 ticks
    expect(el('.hud-ability').classList.contains('is-active')).toBe(true);
    expect(el('.hud-ability').classList.contains('is-ready')).toBe(false);
  });

  it('shows three pips for Hot Hand', () => {
    const s = fresh();
    const ace = findPlayer(s, 'home2');
    const def = ABILITIES.hotHand;
    if (!ace || !def) throw new Error('setup');
    ace.ability = { ticksLeft: null, uses: 3 };
    expect(abilityBarView(ace, def).status).toBe('●●●');
    ace.ability.uses = 1;
    expect(abilityBarView(ace, def).status).toBe('●');
  });

  it('stays hidden without a human id', () => {
    const other = document.createElement('div');
    const plain = new Hud(other);
    plain.update(fresh());
    expect(other.querySelector<HTMLElement>('.hud-ability')?.hidden).toBe(true);
    plain.dispose();
  });

  it('names every launch ability in its banner', () => {
    expect(abilityBanner('rocketDunk', ABILITIES)).toBe('ROCKET DUNK!');
    expect(abilityBanner('hotHand', ABILITIES)).toBe('HOT HAND!');
    expect(abilityBanner('blur', ABILITIES)).toBe('BLUR!');
    expect(abilityBanner('earthquake', ABILITIES)).toBe('EARTHQUAKE!');
  });

  it('announces an activation in the activating team’s colour', () => {
    hud.handleEvents([{ type: 'abilityActivated', playerId: 'away1', abilityId: 'blur' }], fresh());
    hud.tick(0);
    expect(el('.hud-banner').textContent).toBe('BLUR!');
    expect(el('.hud-banner').classList.contains('team-1')).toBe(true);
    hud.handleEvents([{ type: 'block', by: 'home1', shooter: 'away1' }]);
    hud.tick(1.3);
    expect(el('.hud-banner').textContent).toBe('BLOCKED!');
    expect(el('.hud-banner').classList.contains('team-1')).toBe(false);
  });

  it('shows a GUST chip with an arrow while a gust blows', () => {
    expect(el('.hud-gust').hidden).toBe(true);
    hud.handleEvents([{ type: 'gustStart', dir: { x: 0, y: 0, z: 1 } }]);
    expect(el('.hud-gust').hidden).toBe(false);
    expect(el('.hud-gust-arrow').style.transform).toBe('rotate(90deg)');
    hud.handleEvents([{ type: 'gustEnd' }]);
    expect(el('.hud-gust').hidden).toBe(true);
  });
});
