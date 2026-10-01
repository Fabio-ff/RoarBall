import type { CourtModifier } from '../../sim/hooks';
import type { CourtDef } from '../../sim/types';
import { gym } from './gym';

/** Spec D.4 Slick: slower to start and to stop (drift on direction change). No RNG. */
export const slick: CourtModifier = {
  id: 'slick',
  name: 'Slick',
  description: 'Low friction: slow to start, slower to stop.',
  modifyStats: (stats) => ({
    ...stats,
    acceleration: stats.acceleration * 0.4,
    deceleration: stats.deceleration * 0.25,
  }),
};

/** Spec §7.2: an ice sheet under the aurora. */
export const frozen: CourtDef = {
  ...gym,
  id: 'frozen',
  name: 'Frozen Lake',
  description: 'An ice sheet under the aurora. Loose balls roll for ever.',
  physics: { ...gym.physics, friction: 0.3 },
  lighting: {
    skyColor: 0x0f4d4d,
    sunDirection: { x: -0.3, y: -1, z: 0.2 },
    sunColor: 0xd8f4ff,
    ambient: 0.7,
  },
  dressing: { floorColor: 0xcfe6f5, lineColor: 0x2c6e9e, floorRoughness: 0.15, weather: 'none' },
  modifier: slick,
};
