import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, MAX_VOICES } from '../../src/audio/engine';
import { fakeAudioContext } from './fake-context';

const make = () => {
  const ctx = fakeAudioContext();
  return { ctx, engine: new AudioEngine(ctx as unknown as AudioContext) };
};

describe('AudioEngine (spec E.4)', () => {
  it('builds master, sfx and music buses into the destination', () => {
    const { ctx, engine } = make();
    expect(engine.musicBus).toBeDefined();
    expect(ctx.nodes.some((n) => n.connections.includes(ctx.destination))).toBe(true);
  });

  it('caps simultaneous voices at 12, stopping the oldest', () => {
    const { ctx, engine } = make();
    for (let i = 0; i < MAX_VOICES + 3; i++) engine.playSfx('crowd');
    const voiceGains = ctx.nodes.filter((n) => n.kind === 'gain' && n.voice === true);
    expect(voiceGains.length).toBe(MAX_VOICES + 3);
    expect(voiceGains.filter((n) => n.disconnected).length).toBe(3);
    expect(voiceGains.slice(0, 3).every((n) => n.disconnected)).toBe(true);
  });

  it('plays nothing while sound is off; resume() resumes a suspended context', () => {
    const { ctx, engine } = make();
    engine.setEnabled(false, true);
    const before = ctx.nodes.length;
    engine.playSfx('dunk');
    expect(ctx.nodes.length).toBe(before);
    engine.resume();
    expect(ctx.state).toBe('running');
  });

  it('duck lowers the music bus and brings it back', () => {
    const { engine } = make();
    engine.duck(1);
    const events = (engine.musicBus.gain as unknown as { events: [string, number, number][] })
      .events;
    expect(events.some(([, v]) => v < 0.45)).toBe(true);
    expect(events.at(-1)?.[1]).toBeCloseTo(0.45);
  });
});

describe('AudioEngine music (plan decision 23)', () => {
  const timers = () => {
    const fns: (() => void)[] = [];
    return {
      fns,
      setInterval: vi.fn((fn: () => void) => (fns.push(fn), fns.length)),
      clearInterval: vi.fn(),
    };
  };
  const makeWith = () => {
    const ctx = fakeAudioContext();
    const t = timers();
    return { ctx, t, engine: new AudioEngine(ctx as unknown as AudioContext, t) };
  };

  it('setMusic starts the player, keeps the same track, and null stops it', () => {
    const { engine } = makeWith();
    engine.setMusic('gym');
    expect(engine.musicPlaying).toBe('gym');
    engine.setMusic('gym');
    expect(engine.musicPlaying).toBe('gym');
    engine.setMusic(null);
    expect(engine.musicPlaying).toBeNull();
  });

  it('with music off it remembers the wish; enabling music starts it', () => {
    const { engine } = makeWith();
    engine.setEnabled(true, false);
    engine.setMusic('menu');
    expect(engine.musicPlaying).toBeNull();
    engine.setEnabled(true, true);
    expect(engine.musicPlaying).toBe('menu');
    engine.setEnabled(true, false);
    expect(engine.musicPlaying).toBeNull();
  });

  it('dispose stops the player and clears its interval', () => {
    const { engine, t } = makeWith();
    engine.setMusic('gym');
    engine.dispose();
    expect(t.clearInterval).toHaveBeenCalled();
    expect(engine.musicPlaying).toBeNull();
  });
});
