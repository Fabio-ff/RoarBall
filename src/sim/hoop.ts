import { v3DistanceXZ, type Vec3 } from './math';
import type { CourtDef, HoopIndex, TeamIndex } from './types';

export const RIM_RADIUS = 0.225;
/** Gameplay tube radius, a little fatter than the visual one so rim bounces are forgiving. */
export const RIM_TUBE = 0.03;
/** Backboard half extents: 0.05 thick, 1.05 tall, 1.8 wide. */
export const BOARD_HALF: Readonly<Vec3> = Object.freeze({ x: 0.025, y: 0.525, z: 0.9 });
/** Board face sits this far behind the rim centre (rim radius + 0.15 m). */
export const BOARD_OFFSET = RIM_RADIUS + 0.15;
export const BOARD_CENTER_ABOVE_RIM = 0.3;

export interface HoopGeometry {
  index: HoopIndex;
  /** +1 for the hoop on +X, -1 for the hoop on -X; the board is on the `side` side of the rim. */
  side: 1 | -1;
  rimCenter: Vec3;
  boardCenter: Vec3;
  boardHalf: Vec3;
}

/** Derives collision and rendering geometry from a CourtDef so both always agree (spec §7.1). */
export function hoopGeometry(court: CourtDef, index: HoopIndex): HoopGeometry {
  const hoop = court.hoops[index];
  const side: 1 | -1 = hoop.pos.x < 0 ? -1 : 1;
  return {
    index,
    side,
    rimCenter: { x: hoop.pos.x, y: hoop.rimHeight, z: hoop.pos.z },
    boardCenter: {
      x: hoop.pos.x + side * BOARD_OFFSET,
      y: hoop.rimHeight + BOARD_CENTER_ABOVE_RIM,
      z: hoop.pos.z,
    },
    boardHalf: { ...BOARD_HALF },
  };
}

/** Team 0 spawns on -X and attacks the +X hoop; team 1 the opposite. */
export function attackingHoopIndex(court: CourtDef, team: TeamIndex): HoopIndex {
  const wantedSide = team === 0 ? 1 : -1;
  return court.hoops[0].pos.x * wantedSide > 0 ? 0 : 1;
}

export function nearestHoopIndex(court: CourtDef, pos: Vec3): HoopIndex {
  const d0 = v3DistanceXZ(pos, court.hoops[0].pos);
  const d1 = v3DistanceXZ(pos, court.hoops[1].pos);
  return d0 <= d1 ? 0 : 1;
}
