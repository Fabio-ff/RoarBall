import { mkdirSync, writeFileSync } from 'node:fs';
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
interface TeammateRow {
  label: string;
  meanHome: number;
  meanAway: number;
  homeWins: number;
  minHome: number;
  games: number;
}

function teammateSeries(label: string, abilities: AbilityTable): TeammateRow {
  const gym = getCourt('gym');
  const entries = roster(['rook', 'ace'], ['brick', 'dash']);
  let sumHome = 0;
  let sumAway = 0;
  let homeWins = 0;
  let minHome = Infinity;
  for (let seed = 1; seed <= TEAMMATE_SEEDS; seed++) {
    const [h, a] = playWith(seed, entries, gym, abilities);
    sumHome += h;
    sumAway += a;
    minHome = Math.min(minHome, h);
    if (h > a) homeWins++;
  }
  return {
    label,
    meanHome: sumHome / TEAMMATE_SEEDS,
    meanAway: sumAway / TEAMMATE_SEEDS,
    homeWins,
    minHome,
    games: TEAMMATE_SEEDS,
  };
}

/** `play` with home2 as the teammate brain and a chosen ability table (no ability counting). */
function playWith(
  seed: number,
  entries: RosterEntry[],
  court: CourtDef,
  abilities: AbilityTable,
): [number, number] {
  let state = createMatch({ ...settings, seed, courtId: court.id }, court, entries);
  const memories = entries.map((e, i) => createAiMemory(e.id, seed, i % 2, e.id === 'home2'));
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    const frame = new Map(
      memories.map((m) => [m.playerId, decide(state, m, AI_PROFILES.fair, court, abilities)]),
    );
    state = tick(state, frame, court, abilities).state;
  }
  return [state.score[0], state.score[1]];
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
      "Home2 favours home1 as the app's teammate does; the human slot is an AI stand-in. Issue #92 floor: team-0 mean within 2 of the pre-#92 baseline (19.2 without abilities), no seed under 6.",
      '',
      '| matchup | team-0 mean | opponents mean | team-0 wins | team-0 min |',
      '|---|---|---|---|---|',
      ...teammate.map(
        (r) =>
          `| ${r.label} | ${r.meanHome.toFixed(1)} | ${r.meanAway.toFixed(1)} | ${r.homeWins}/${r.games} (${((100 * r.homeWins) / r.games).toFixed(0)} %) | ${r.minHome} |`,
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
    writeFileSync(`docs/balance/${date}-phase-5.md`, report);
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
    for (const r of teammate) expect(r.minHome, r.label).toBeGreaterThanOrEqual(6);
  });
});
