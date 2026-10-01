import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function errorsFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.message);
}

describe('src/sim boundary', () => {
  const cases: [string, string][] = [
    ['three', "import { Scene } from 'three'; export const s = new Scene();"],
    ['bare ui dir', "import { a } from '../ui'; export const b = a;"],
    ['render file', "import { a } from '../render/scene'; export const b = a;"],
    ['Math.random', 'export const r = Math.random();'],
    ['Date.now', 'export const t = Date.now();'],
    ['new Date', 'export const d = new Date();'],
    ['performance', 'export const p = performance.now();'],
    ['globalThis', 'export const p = globalThis.performance.now();'],
    ['window', 'export const p = window.performance.now();'],
    ['document', "export const e = document.createElement('div');"],
    ['setTimeout', 'export const h = setTimeout(() => {}, 1);'],
  ];
  for (const [name, code] of cases) {
    it(`rejects ${name}`, async () => {
      expect(await errorsFor('src/sim/probe.ts', code)).not.toHaveLength(0);
    });
  }

  it('accepts plain simulation code', async () => {
    expect(
      await errorsFor(
        'src/sim/probe.ts',
        "import { createRng } from './rng'; export const r = createRng(1);",
      ),
    ).toHaveLength(0);
  });
});

describe('src/content boundary', () => {
  it('rejects value imports from sim', async () => {
    expect(
      await errorsFor(
        'src/content/probe.ts',
        "import { createRng } from '../sim/rng'; export const r = createRng(1);",
      ),
    ).not.toHaveLength(0);
  });

  it('accepts type imports from sim', async () => {
    expect(
      await errorsFor(
        'src/content/probe.ts',
        "import type { RngState } from '../sim/rng'; export const r: RngState = { seed: 1 };",
      ),
    ).toHaveLength(0);
  });

  it('rejects Math.random', async () => {
    expect(
      await errorsFor('src/content/probe.ts', 'export const r = Math.random();'),
    ).not.toHaveLength(0);
  });

  it('accepts an ability written against the hook types only', async () => {
    expect(
      await errorsFor(
        'src/content/probe.ts',
        "import type { AbilityDef } from '../sim/hooks';\n" +
          "export const a: AbilityDef = { id: 'x', name: 'X', description: '', icon: '', durationTicks: 'instant', " +
          'effect: { onActivate(state, player, ctx) { void state; void player; ctx.math.nextFloat(ctx.rng); } } };',
      ),
    ).toHaveLength(0);
  });

  it('rejects three', async () => {
    expect(
      await errorsFor(
        'src/content/probe.ts',
        "import { Scene } from 'three'; export const s = new Scene();",
      ),
    ).not.toHaveLength(0);
  });
});
