import type { CourtDef } from '../../sim/types';

/** Plain indoor court, no modifier. Development, tutorial and balance baseline (spec §7.2). */
export const gym: CourtDef = {
  id: 'gym',
  name: 'Gym',
  description: 'A plain indoor court. No surprises.',
  playArea: { length: 28, width: 15 },
  // FIBA: rim centre 1.575 m from the baseline.
  hoops: [
    { pos: { x: -12.425, y: 0, z: 0 }, rimHeight: 3.05 },
    { pos: { x: 12.425, y: 0, z: 0 }, rimHeight: 3.05 },
  ],
  physics: { gravity: 9.81, friction: 1, restitution: 0.75, airDrag: 0.01 },
  lighting: {
    skyColor: 0x9fbfe0,
    sunDirection: { x: -0.4, y: -1, z: -0.3 },
    sunColor: 0xffffff,
    ambient: 0.6,
  },
};
