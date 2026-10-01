import { describe, expect, it } from 'vitest';
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
