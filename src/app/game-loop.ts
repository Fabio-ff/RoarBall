import { TICK_MS } from '../sim/constants';

/** Accumulator for a fixed-timestep loop (spec §9 "Game loop"). Plain data so it is testable. */
export interface FixedStepClock {
  stepMs: number;
  maxStepsPerFrame: number;
  accumulatorMs: number;
}

export function createFixedStepClock(stepMs = TICK_MS, maxStepsPerFrame = 5): FixedStepClock {
  return { stepMs, maxStepsPerFrame, accumulatorMs: 0 };
}

/**
 * Adds a frame's elapsed time and returns how many fixed steps to run and the interpolation
 * factor (0..1) for rendering between the previous and current simulation states. Frame time
 * is clamped so a long stall (background tab, breakpoint) never causes a burst of catch-up.
 */
export function advanceClock(
  clock: FixedStepClock,
  frameMs: number,
): { steps: number; alpha: number } {
  const cap = clock.stepMs * clock.maxStepsPerFrame;
  clock.accumulatorMs += Math.min(Math.max(frameMs, 0), cap);
  let steps = 0;
  while (clock.accumulatorMs >= clock.stepMs && steps < clock.maxStepsPerFrame) {
    clock.accumulatorMs -= clock.stepMs;
    steps += 1;
  }
  return { steps, alpha: clock.accumulatorMs / clock.stepMs };
}

/** requestAnimationFrame driver around a FixedStepClock. */
export class GameLoop {
  private rafId = 0;
  private lastTime = 0;
  private isRunning = false;

  constructor(
    private readonly onTick: () => void,
    private readonly onRender: (alpha: number, frameMs: number) => void,
    private readonly clock: FixedStepClock = createFixedStepClock(),
  ) {}

  get running(): boolean {
    return this.isRunning;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly frame = (now: number): void => {
    if (!this.isRunning) return;
    const frameMs = now - this.lastTime;
    this.lastTime = now;
    const { steps, alpha } = advanceClock(this.clock, frameMs);
    for (let i = 0; i < steps; i++) this.onTick();
    this.onRender(alpha, frameMs);
    if (this.isRunning) this.rafId = requestAnimationFrame(this.frame);
  };

  private readonly onVisibilityChange = (): void => {
    // Coming back from a hidden tab: forget the gap instead of simulating it.
    this.lastTime = performance.now();
    this.clock.accumulatorMs = 0;
  };
}
