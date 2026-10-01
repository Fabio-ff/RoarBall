import type { AbilityDef, AbilityTable } from '../../sim/hooks';
import { blur } from './blur';
import { earthquake } from './earthquake';
import { hotHand } from './hot-hand';
import { rocketDunk } from './rocket-dunk';

/** Spec §10.1 registry: one file per signature move, keyed by the characters' `abilityId`. */
export const abilities: readonly AbilityDef[] = [rocketDunk, hotHand, blur, earthquake];

/** The table the app passes to `tick` and the AI (spec D.2). */
export const ABILITIES: AbilityTable = Object.freeze(
  Object.fromEntries(abilities.map((a) => [a.id, a])),
);

export function getAbility(id: string): AbilityDef {
  const ability = abilities.find((a) => a.id === id);
  if (!ability) throw new Error(`Unknown ability: ${id}`);
  return ability;
}
