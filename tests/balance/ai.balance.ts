import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { characters, getCharacter } from '../../src/content/characters';
import { courts, getCourt } from '../../src/content/courts';
import { decide } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { NO_ABILITIES, type AbilityTable } from '../../src/sim/hooks';
import { createMatch, type RosterEntry } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { CourtDef, MatchSettings } from '../../src/sim/types';

const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 0,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
/**
 * Spec C.7 / D.7 sample sizes, trimmed so the run stays near 5 minutes (≈ 864 matches): the gym
 * keeps 20 seeds for the mirrored duos (10 for the strength table); the other courts play the
 * mirrored duos only, 8 seeds each.
 */
const GYM_MIRROR_SEEDS = 20;
const GYM_STRENGTH_SEEDS = 10;
const COURT_MIRROR_SEEDS = 8;
const MAX_TICKS = 20_000;
/** Spec D.7 score ceilings: the gym keeps C.7's 60; the modifier courts get 66 (ruling). */
const SCORE_CEILING = { gym: 60, modifier: 66 } as const;
const ceilingOf = (id: string): number =>
  id === 'gym' ? SCORE_CEILING.gym : SCORE_CEILING.modifier;
const ABILITY_USE_TARGET = [1.5, 3] as const;
const ids = characters.map((c) => c.id);

function roster(home: [string, string], away: [string, string]): RosterEntry[] {
  return [
    { id: 'home1', team: 0, characterId: home[0], character: getCharacter(home[0]) },
    { id: 'home2', team: 0, characterId: home[1], character: getCharacter(home[1]) },
    { id: 'away1', team: 1, characterId: away[0], character: getCharacter(away[0]) },
    { id: 'away2', team: 1, characterId: away[1], character: getCharacter(away[1]) },
  ];
}

/** Ability activations per character, and how many player-matches each character played. */
const uses: Record<string, number> = {};
const slots: Record<string, number> = {};

function play(seed: number, entries: RosterEntry[], court: CourtDef): [number, number] {
  let state = createMatch({ ...settings, seed, courtId: court.id }, court, entries);
  const memories = entries.map((e, i) => createAiMemory(e.id, seed, i % 2, false));
  const characterOf = new Map(entries.map((e) => [e.id, e.characterId]));
  for (const e of entries) slots[e.characterId] = (slots[e.characterId] ?? 0) + 1;
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    const frame = new Map(
      memories.map((m) => [m.playerId, decide(state, m, AI_PROFILES.fair, court, ABILITIES)]),
    );
    const r = tick(state, frame, court, ABILITIES);
    state = r.state;
    for (const e of r.events) {
      if (e.type !== 'abilityActivated') continue;
      const c = characterOf.get(e.playerId) ?? '?';
      uses[c] = (uses[c] ?? 0) + 1;
    }
  }
  return [state.score[0], state.score[1]];
}

interface Row {
  label: string;
  homeWins: number;
  games: number;
  meanHome: number;
  meanAway: number;
}

function series(
  label: string,
  home: [string, string],
  away: [string, string],
  court: CourtDef,
  seeds: number,
): Row {
  let homeWins = 0;
  let sumHome = 0;
  let sumAway = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const [h, a] = play(seed, roster(home, away), court);
    if (h > a) homeWins++;
    sumHome += h;
    sumAway += a;
  }
  return { label, homeWins, games: seeds, meanHome: sumHome / seeds, meanAway: sumAway / seeds };
}

/**
 * Issue #92: the app's default matchup with the human's teammate brain (home2 favours home1, as
 * in tests/sim/ai-match.ts). The mirrored duos above never build that brain, so a change that
 * hurts only the teammate is invisible there. Gym, both with and without abilities.
 */
const TEAMMATE_SEEDS = 30;
/** Issue #92 guards: the no-abilities mean floor (pre-#92 19.2 − 2) and the interception cap. */
const TEAMMATE_MEAN_FLOOR = 17.2;
const TEAMMATE_INTERCEPT_CAP = 0.2;
/** Issue #92 (I-2): share of home2's shot attempts (released + blocked) that are blocked. */
const TEAMMATE_BLOCKED_CAP = 0.25;
/** With abilities: a tripwire at the pre-#92 level (47 %); measured 40 % after #92. */
const TEAMMATE_BLOCKED_CAP_ABILITIES = 0.47;
interface TeammateRow {
  label: string;
  meanHome: number;
  meanAway: number;
  homeWins: number;
  minHome: number;
  games: number;
  /** home2's passes, how many were intercepted, how many home1 caught. */
  passes: number;
  intercepted: number;
  completed: number;
  /** home2's shot attempts (released + blocked; a blocked shot is never released) and blocks. */
  attempts: number;
  blocked: number;
}

interface TeammateGame {
  score: [number, number];
  passes: number;
  intercepted: number;
  completed: number;
  attempts: number;
  blocked: number;
}

function teammateSeries(label: string, abilities: AbilityTable): TeammateRow {
  const gym = getCourt('gym');
  const entries = roster(['rook', 'ace'], ['brick', 'dash']);
  const row: TeammateRow = {
    label,
    meanHome: 0,
    meanAway: 0,
    homeWins: 0,
    minHome: Infinity,
    games: TEAMMATE_SEEDS,
    passes: 0,
    intercepted: 0,
    completed: 0,
    attempts: 0,
    blocked: 0,
  };
  for (let seed = 1; seed <= TEAMMATE_SEEDS; seed++) {
    const g = playWith(seed, entries, gym, abilities);
    const [h, a] = g.score;
    row.meanHome += h / TEAMMATE_SEEDS;
    row.meanAway += a / TEAMMATE_SEEDS;
    row.minHome = Math.min(row.minHome, h);
    if (h > a) row.homeWins++;
    row.passes += g.passes;
    row.intercepted += g.intercepted;
    row.completed += g.completed;
    row.attempts += g.attempts;
    row.blocked += g.blocked;
  }
  return row;
}

/** `play` with home2 as the teammate brain and a chosen ability table; counts home2's passes. */
function playWith(
  seed: number,
  entries: RosterEntry[],
  court: CourtDef,
  abilities: AbilityTable,
): TeammateGame {
  let state = createMatch({ ...settings, seed, courtId: court.id }, court, entries);
  const memories = entries.map((e, i) => createAiMemory(e.id, seed, i % 2, e.id === 'home2'));
  const game: TeammateGame = {
    score: [0, 0],
    passes: 0,
    intercepted: 0,
    completed: 0,
    attempts: 0,
    blocked: 0,
  };
  let inFlight = false;
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    const frame = new Map(
      memories.map((m) => [m.playerId, decide(state, m, AI_PROFILES.fair, court, abilities)]),
    );
    const r = tick(state, frame, court, abilities);
    state = r.state;
    for (const e of r.events) {
      if (e.type === 'shotReleased' && e.playerId === 'home2') game.attempts++;
      if (e.type === 'block' && e.shooter === 'home2') {
        game.attempts++;
        game.blocked++;
      }
      if (e.type === 'pass') {
        inFlight = e.from === 'home2';
        if (inFlight) game.passes++;
      } else if (inFlight && e.type === 'intercept') {
        game.intercepted++;
        inFlight = false;
      } else if (inFlight && e.type === 'catch') {
        if (e.playerId === 'home1') game.completed++;
        inFlight = false;
      }
    }
  }
  game.score = [state.score[0], state.score[1]];
  return game;
}

function summary(rows: Row[]): { games: number; homeRate: number; meanTotal: number } {
  const games = rows.reduce((n, r) => n + r.games, 0);
  const homeWins = rows.reduce((n, r) => n + r.homeWins, 0);
  const total = rows.reduce((n, r) => n + (r.meanHome + r.meanAway) * r.games, 0);
  return { games, homeRate: homeWins / games, meanTotal: total / games };
}

function table(rows: Row[]): string {
  const lines = ['| pairing | home wins | mean score |', '|---|---|---|'];
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${r.homeWins}/${r.games} (${((100 * r.homeWins) / r.games).toFixed(0)} %) | ${r.meanHome.toFixed(1)}–${r.meanAway.toFixed(1)} |`,
    );
  }
  return lines.join('\n');
}

describe('balance report (spec C.7, D.7; on demand)', () => {
  it('no side bias on any court; scores in band; ability use reported', () => {
    const mirrored = new Map<string, Row[]>();
    for (const court of courts) {
      const seeds = court.id === 'gym' ? GYM_MIRROR_SEEDS : COURT_MIRROR_SEEDS;
      const rows: Row[] = [];
      for (const a of ids)
        for (const b of ids)
          rows.push(series(`${a}+${b} vs ${a}+${b}`, [a, b], [a, b], court, seeds));
      mirrored.set(court.id, rows);
    }
    const gym = getCourt('gym');
    const strength: Row[] = [];
    for (const a of ids)
      for (const c of ids)
        strength.push(
          series(`${a}+rook vs ${c}+rook`, [a, 'rook'], [c, 'rook'], gym, GYM_STRENGTH_SEEDS),
        );

    const teammate = [
      teammateSeries('rook+ace (home2 teammate brain) vs brick+dash, no abilities', NO_ABILITIES),
      teammateSeries('rook+ace (home2 teammate brain) vs brick+dash, abilities', ABILITIES),
    ];
    const perCourt = courts.map((c) => ({ id: c.id, ...summary(mirrored.get(c.id) ?? []) }));
    const all = summary([...mirrored.values()].flat());
    const perCharacter = ids.map((id) => ({ id, perMatch: (uses[id] ?? 0) / (slots[id] ?? 1) }));
    const inTarget = (x: number): string =>
      x >= ABILITY_USE_TARGET[0] && x <= ABILITY_USE_TARGET[1] ? 'yes' : '**no**';

    const date = new Date().toISOString().slice(0, 10);
    const report = [
      `# AI balance report — ${date}`,
      '',
      `Fair profile, abilities on, 3-minute matches. Mirrored duos: ${GYM_MIRROR_SEEDS} seeds on the gym, ${COURT_MIRROR_SEEDS} on each other court; strength table on the gym, ${GYM_STRENGTH_SEEDS} seeds.`,
      '',
      `**Side bias (all mirrored games, ${all.games}):** home wins ${(100 * all.homeRate).toFixed(1)} % — band 45–55 %.`,
      `**Mean total score (all mirrored):** ${all.meanTotal.toFixed(1)} — band 20–${SCORE_CEILING.gym} (gym), 20–${SCORE_CEILING.modifier} (modifier courts).`,
      '',
      '## Per court (mirrored duos)',
      '',
      '| court | games | home wins | mean total | band |',
      '|---|---|---|---|---|',
      ...perCourt.map(
        (c) =>
          `| ${c.id} | ${c.games} | ${(100 * c.homeRate).toFixed(1)} % | ${c.meanTotal.toFixed(1)} | 20–${ceilingOf(c.id)} |`,
      ),
      '',
      `## Ability uses per player per match (target ${ABILITY_USE_TARGET[0]}–${ABILITY_USE_TARGET[1]})`,
      '',
      '| character | uses / match | in target |',
      '|---|---|---|',
      ...perCharacter.map(
        (c) => `| ${c.id} | ${c.perMatch.toFixed(2)} | ${inTarget(c.perMatch)} |`,
      ),
      '',
      `## Default matchup with the teammate brain (gym, ${TEAMMATE_SEEDS} seeds)`,
      '',
      `Home2 favours home1 as the app's teammate does; the human slot is an AI stand-in. Issue #92 guards: team-0 mean ≥ ${TEAMMATE_MEAN_FLOOR} without abilities (pre-#92 19.2 − 2), no seed under 6, home2's passes intercepted ≤ ${100 * TEAMMATE_INTERCEPT_CAP} %, home2's attempts blocked ≤ ${100 * TEAMMATE_BLOCKED_CAP} % without abilities (≤ ${100 * TEAMMATE_BLOCKED_CAP_ABILITIES} % with, the pre-#92 level).`,
      '',
      '| matchup | team-0 mean | opponents mean | team-0 wins | team-0 min | home2 passes / match | intercepted | completed to home1 / match | home2 attempts blocked |',
      '|---|---|---|---|---|---|---|---|---|',
      ...teammate.map(
        (r) =>
          `| ${r.label} | ${r.meanHome.toFixed(1)} | ${r.meanAway.toFixed(1)} | ${r.homeWins}/${r.games} (${((100 * r.homeWins) / r.games).toFixed(0)} %) | ${r.minHome} | ${(r.passes / r.games).toFixed(1)} | ${((100 * r.intercepted) / Math.max(1, r.passes)).toFixed(0)} % | ${(r.completed / r.games).toFixed(1)} | ${r.blocked}/${r.attempts} (${((100 * r.blocked) / Math.max(1, r.attempts)).toFixed(0)} %) |`,
      ),
      '',
      '## Gym — mirrored duos',
      '',
      table(mirrored.get('gym') ?? []),
      '',
      '## Gym — lead vs lead (Rook partners)',
      '',
      table(strength),
      '',
    ].join('\n');
    mkdirSync('docs/balance', { recursive: true });
    let file = `docs/balance/${date}.md`;
    for (let n = 2; existsSync(file); n++) file = `docs/balance/${date}-${n}.md`;
    writeFileSync(file, report);
    process.stdout.write(`\n${report}\n`);

    // Spec C.7 on the gym; spec D.7's 45–55 % on the aggregate (per court the samples are small).
    const gymRow = perCourt.find((c) => c.id === 'gym');
    if (!gymRow) throw new Error('no gym');
    expect(gymRow.homeRate).toBeGreaterThanOrEqual(0.4);
    expect(gymRow.homeRate).toBeLessThanOrEqual(0.6);
    expect(all.homeRate).toBeGreaterThanOrEqual(0.45);
    expect(all.homeRate).toBeLessThanOrEqual(0.55);
    for (const c of perCourt) {
      expect(c.homeRate, c.id).toBeGreaterThanOrEqual(0.35);
      expect(c.homeRate, c.id).toBeLessThanOrEqual(0.65);
      expect(c.meanTotal, c.id).toBeGreaterThanOrEqual(20);
      expect(c.meanTotal, c.id).toBeLessThanOrEqual(ceilingOf(c.id));
    }
    for (const c of perCharacter) expect(c.perMatch, c.id).toBeGreaterThan(0);
    // Issue #92: the teammate brain must not collapse again (sweep floor ≥ 6 per seed).
    for (const r of teammate) {
      expect(r.minHome, r.label).toBeGreaterThanOrEqual(6);
      expect(r.intercepted / Math.max(1, r.passes), r.label).toBeLessThanOrEqual(
        TEAMMATE_INTERCEPT_CAP,
      );
    }
    // Blocked attempts: the cap holds without abilities. With abilities the row is reported
    // and only guarded against falling back to the pre-#92 level (47 %, Hot Hand and Blur).
    const [plain, withAbilities] = teammate;
    expect(plain.blocked / Math.max(1, plain.attempts), plain.label).toBeLessThanOrEqual(
      TEAMMATE_BLOCKED_CAP,
    );
    expect(
      withAbilities.blocked / Math.max(1, withAbilities.attempts),
      withAbilities.label,
    ).toBeLessThanOrEqual(TEAMMATE_BLOCKED_CAP_ABILITIES);
    expect(plain.meanHome, plain.label).toBeGreaterThanOrEqual(TEAMMATE_MEAN_FLOOR);
  });
});
