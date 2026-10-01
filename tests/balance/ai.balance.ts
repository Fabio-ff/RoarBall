import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { characters, getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { decide } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { createMatch, type RosterEntry } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchSettings, MatchState } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 0,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const SEEDS_PER_PAIRING = 10;
const MAX_TICKS = 20_000;
const ids = characters.map((c) => c.id);

function roster(home: [string, string], away: [string, string]): RosterEntry[] {
  return [
    { id: 'home1', team: 0, characterId: home[0], character: getCharacter(home[0]) },
    { id: 'home2', team: 0, characterId: home[1], character: getCharacter(home[1]) },
    { id: 'away1', team: 1, characterId: away[0], character: getCharacter(away[0]) },
    { id: 'away2', team: 1, characterId: away[1], character: getCharacter(away[1]) },
  ];
}

function play(seed: number, entries: RosterEntry[]): MatchState {
  let state = createMatch({ ...settings, seed }, court, entries);
  const memories = entries.map((e, i) => createAiMemory(e.id, seed, i % 2, false));
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    state = tick(
      state,
      new Map(memories.map((m) => [m.playerId, decide(state, m, AI_PROFILES.fair, court)])),
      court,
    ).state;
  }
  return state;
}

interface Row {
  label: string;
  homeWins: number;
  games: number;
  meanHome: number;
  meanAway: number;
}

function series(label: string, home: [string, string], away: [string, string]): Row {
  let homeWins = 0;
  let sumHome = 0;
  let sumAway = 0;
  for (let seed = 1; seed <= SEEDS_PER_PAIRING; seed++) {
    const s = play(seed, roster(home, away));
    if (s.score[0] > s.score[1]) homeWins++;
    sumHome += s.score[0];
    sumAway += s.score[1];
  }
  return {
    label,
    homeWins,
    games: SEEDS_PER_PAIRING,
    meanHome: sumHome / SEEDS_PER_PAIRING,
    meanAway: sumAway / SEEDS_PER_PAIRING,
  };
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

describe('balance report (spec C.7, on demand)', () => {
  it('mirrored duos show no side bias; strength table reported', () => {
    // Mirror set: every ordered duo against itself (16 × SEEDS games) — equal characters, so any
    // bias is a side bias (team 0 attacks +X, gets the tip-off half the time, etc.).
    const mirror: Row[] = [];
    for (const a of ids)
      for (const b of ids) mirror.push(series(`${a}+${b} vs ${a}+${b}`, [a, b], [a, b]));
    // Strength set: each character as the lead with a Rook partner against each other lead.
    const strength: Row[] = [];
    for (const a of ids)
      for (const c of ids)
        strength.push(series(`${a}+rook vs ${c}+rook`, [a, 'rook'], [c, 'rook']));

    const games = mirror.reduce((n, r) => n + r.games, 0);
    const homeWins = mirror.reduce((n, r) => n + r.homeWins, 0);
    const homeRate = homeWins / games;
    const meanTotal = mirror.reduce((n, r) => n + r.meanHome + r.meanAway, 0) / mirror.length;

    const date = new Date().toISOString().slice(0, 10);
    const report = [
      `# AI balance report — ${date}`,
      '',
      `Fair profile, gym court, ${SEEDS_PER_PAIRING} seeds per pairing, 3-minute matches.`,
      '',
      `**Side bias (mirrored duos, ${games} games):** home wins ${(100 * homeRate).toFixed(1)} % — band 40–60 %.`,
      `**Mean total score (mirrored):** ${meanTotal.toFixed(1)} — band 20–60.`,
      '',
      '## Mirrored duos',
      '',
      table(mirror),
      '',
      '## Lead vs lead (Rook partners)',
      '',
      table(strength),
      '',
    ].join('\n');
    mkdirSync('docs/balance', { recursive: true });
    writeFileSync(`docs/balance/${date}.md`, report);
    process.stdout.write(`\n${report}\n`);

    expect(homeRate).toBeGreaterThanOrEqual(0.4);
    expect(homeRate).toBeLessThanOrEqual(0.6);
    expect(meanTotal).toBeGreaterThanOrEqual(20);
    expect(meanTotal).toBeLessThanOrEqual(60);
  });
});
