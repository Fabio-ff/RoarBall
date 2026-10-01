import { describe, expect, it } from 'vitest';
import { SFX_NAMES } from '../../src/audio/sink';
import { makeNoiseBuffer, SFX_PATCHES } from '../../src/audio/sfx';
import { fakeAudioContext } from './fake-context';

describe('SFX patches (spec E.4)', () => {
  it('there is one patch per sound name', () => {
    expect(Object.keys(SFX_PATCHES).sort()).toEqual([...SFX_NAMES].sort());
  });

  it.each(SFX_NAMES)(
    '%s builds a short graph that starts at t, stops, and reaches the output',
    (name) => {
      const ctx = fakeAudioContext(5);
      const out = ctx.createGain();
      const noise = makeNoiseBuffer(ctx as unknown as BaseAudioContext);
      const duration = SFX_PATCHES[name]({
        ctx: ctx as unknown as BaseAudioContext,
        out: out as unknown as AudioNode,
        t: 5,
        gain: 1,
        noise,
      });
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThanOrEqual(
        name.startsWith('crowd') || name === 'earthquake' ? 3 : 1.6,
      );
      const sources = ctx.nodes.filter((n) => n.kind === 'osc' || n.kind === 'buffer');
      expect(sources.length).toBeGreaterThan(0);
      for (const s of sources) {
        expect(s.started).toBeGreaterThanOrEqual(5);
        expect(s.stopped).not.toBeNull();
        expect(s.stopped as number).toBeLessThanOrEqual(5 + duration + 0.05);
      }
      // Every source feeds, possibly through filters and gains, into `out`.
      const reaches = (n: { connections: unknown[] }, seen = new Set<unknown>()): boolean =>
        n.connections.some(
          (c) =>
            c === out ||
            (!seen.has(c) && (seen.add(c), reaches(c as { connections: unknown[] }, seen))),
        );
      for (const s of sources) expect(reaches(s)).toBe(true);
    },
  );

  it('bounce is louder with a larger gain', () => {
    const peak = (gain: number): number => {
      const ctx = fakeAudioContext();
      const out = ctx.createGain();
      SFX_PATCHES.bounce({
        ctx: ctx as unknown as BaseAudioContext,
        out: out as unknown as AudioNode,
        t: 0,
        gain,
        noise: makeNoiseBuffer(ctx as unknown as BaseAudioContext),
      });
      const env = ctx.nodes
        .filter((n) => n.kind === 'gain' && n !== out)
        .flatMap((n) => (n.gain as { events: [string, number, number][] }).events);
      return Math.max(...env.map((e) => e[1]));
    };
    expect(peak(1)).toBeGreaterThan(peak(0.2));
  });
});
