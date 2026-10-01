import type { CourtModifier } from '../../sim/hooks';
import type { CourtDef } from '../../sim/types';
import { gym } from './gym';

/** Spec D.4 Heat: modifyStats only, no RNG. Earthquake's fixed 90 ticks is not scaled. */
export const heat: CourtModifier = {
  id: 'heat',
  name: 'Heat',
  description: 'Turbo drains faster, shoves hit harder and knock-downs last longer.',
  modifyStats: (stats) => ({
    ...stats,
    turboDrainPerTick: stats.turboDrainPerTick * 1.5,
    stunTicksDealt: stats.stunTicksDealt * 1.4,
    stunResistTicks: stats.stunResistTicks * 0.5,
  }),
};

/** Spec §7.2: cooled lava beside a glowing crater. */
export const volcano: CourtDef = {
  ...gym,
  id: 'volcano',
  name: 'Volcano Rim',
  description: 'Cooled lava beside a glowing crater. The heat wears you down.',
  lighting: {
    skyColor: 0x3a0d08,
    sunDirection: { x: 0.5, y: -0.8, z: -0.3 },
    sunColor: 0xff8a3d,
    ambient: 0.4,
  },
  dressing: { floorColor: 0x3a2a26, lineColor: 0xffb070, floorRoughness: 0.8, weather: 'embers' },
  modifier: heat,
};
