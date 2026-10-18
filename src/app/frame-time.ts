import { TICK_MS } from '../sim/constants';

/** The most fixed steps the sim runs in one frame (spec §9 "Game loop"). */
export const MAX_STEPS_PER_FRAME = 5;

/** The longest frame, in seconds, that animation may advance by: what the sim catches up in one frame. */
export const MAX_FRAME_DT = (TICK_MS * MAX_STEPS_PER_FRAME) / 1000;
