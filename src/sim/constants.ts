/** Simulation ticks per second. Spec §3: fixed 60 Hz. */
export const TICK_RATE = 60;
/** Milliseconds per tick. */
export const TICK_MS = 1000 / TICK_RATE;
/** Seconds per tick, used for all physics integration. */
export const TICK_DT = 1 / TICK_RATE;
