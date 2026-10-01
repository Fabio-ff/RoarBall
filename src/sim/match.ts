import { BALL_RADIUS } from './constants';
import { createRng } from './rng';
import { RULES } from './rules';
import { DEFAULT_STATS, resolveStats } from './stats';
import { NO_BUTTONS } from './types';
import type {
  CharacterDef,
  CourtDef,
  MatchSettings,
  MatchState,
  PlayerId,
  PlayerState,
  TeamIndex,
} from './types';

export interface RosterEntry {
  id: PlayerId;
  team: TeamIndex;
  characterId: string;
  /** Resolved through the stat table when present; placeholders use DEFAULT_STATS. */
  character?: CharacterDef;
}

/** Builds the initial state. Every match starts in 'tipoff'. */
export function createMatch(
  settings: MatchSettings,
  court: CourtDef,
  roster: readonly RosterEntry[],
): MatchState {
  for (const id of settings.ruleIds) {
    if (!(id in RULES)) throw new Error(`Unknown rule: ${id}`);
  }
  const teams: MatchState['teams'] = [{ players: [] }, { players: [] }];
  for (const entry of roster) {
    const team = teams[entry.team];
    team.players.push(createPlayer(entry, team.players.length, court));
  }
  return {
    tick: 0,
    clockMs: settings.durationMs,
    shotClockMs: settings.shotClockMs,
    score: [0, 0],
    phase: 'tipoff',
    phaseTicks: 0,
    possession: null,
    pendingInbound: null,
    overtime: false,
    ball: {
      pos: { x: 0, y: BALL_RADIUS, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      radius: BALL_RADIUS,
      mode: 'free',
      holder: null,
      flight: null,
      lastShot: null,
      freeTicks: 0,
      touchingRim: false,
      touchingBoard: false,
    },
    teams,
    rng: createRng(settings.seed),
    settings: { ...settings, ruleIds: [...settings.ruleIds] },
  };
}

const TEAMMATE_SPACING = 3; // metres across the width

function createPlayer(entry: RosterEntry, indexInTeam: number, court: CourtDef): PlayerState {
  const side = entry.team === 0 ? -1 : 1;
  return {
    id: entry.id,
    team: entry.team,
    characterId: entry.characterId,
    pos: { x: (side * court.playArea.length) / 4, y: 0, z: (indexInTeam - 0.5) * TEAMMATE_SPACING },
    // Face the far hoop: +X for team 0, -X for team 1 (facing = atan2(dir.x, dir.z)).
    facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    vel: { x: 0, y: 0, z: 0 },
    onGround: true,
    action: 'idle',
    actionTicks: 0,
    turbo: 1,
    turboRequested: false,
    turboActive: false,
    prevButtons: { ...NO_BUTTONS },
    shot: null,
    shotCooldownTicks: 0,
    stats: entry.character ? resolveStats(entry.character) : { ...DEFAULT_STATS },
  };
}

export function allPlayers(state: MatchState): PlayerState[] {
  return [...state.teams[0].players, ...state.teams[1].players];
}

export function findPlayer(state: MatchState, id: PlayerId): PlayerState | undefined {
  return allPlayers(state).find((p) => p.id === id);
}
