import { describe, expect, it, vi } from 'vitest';
import { advanceClock, createFixedStepClock, GameLoop } from '../../src/app/game-loop';

describe('advanceClock', () => {
  it('runs one step per 16.67 ms and reports the leftover as alpha', () => {
    const clock = createFixedStepClock(1000 / 60, 5);
    expect(advanceClock(clock, 1000 / 60)).toEqual({ steps: 1, alpha: expect.closeTo(0, 5) });
    const r = advanceClock(clock, 8);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(8 / (1000 / 60));
  });

  it('accumulates fractional frames across calls', () => {
    const clock = createFixedStepClock(10, 5);
    expect(advanceClock(clock, 6).steps).toBe(0);
    expect(advanceClock(clock, 6).steps).toBe(1);
    expect(clock.accumulatorMs).toBeCloseTo(2);
  });

  it('caps the number of steps per frame and drops the excess (no spiral of death)', () => {
    const clock = createFixedStepClock(10, 5);
    const r = advanceClock(clock, 1000);
    expect(r.steps).toBe(5);
    expect(clock.accumulatorMs).toBeLessThan(10);
  });

  it('ignores negative frame times', () => {
    const clock = createFixedStepClock(10, 5);
    expect(advanceClock(clock, -50)).toEqual({ steps: 0, alpha: 0 });
  });
});

describe('GameLoop', () => {
  it('stop() inside onRender schedules no further frame', () => {
    let frame: ((t: number) => void) | undefined;
    const raf = vi.fn((cb: (t: number) => void) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {} });
    const loop: GameLoop = new GameLoop(
      () => {},
      () => loop.stop(),
    );
    loop.start();
    expect(raf).toHaveBeenCalledTimes(1);
    frame?.(100);
    expect(raf).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
