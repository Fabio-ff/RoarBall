// Spec §10.2 / E.7 smoke: headless Chromium plays through the menus on the built app.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'pipe' },
);
const errors = [];
const warnings = [];
/** Every .glb the page fetched, with its status (spec F.10.3). */
const models = [];
let browser;

// Whole-run watchdog: nothing may hang CI. unref'd, so it never keeps a finished run alive.
setTimeout(() => {
  console.error('smoke: watchdog timeout');
  server.kill();
  process.exit(1);
}, 150_000).unref();

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite preview did not start');
}

/** vite preview falls back to index.html for unknown paths, so check the bytes, not the status. */
async function checkModelIsServed() {
  const response = await fetch(`${BASE}assets/characters/ace.glb`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || bytes.length < 100_000 || bytes.subarray(0, 4).toString() !== 'glTF') {
    throw new Error(
      `assets/characters/ace.glb is not served as a GLB (status ${response.status}, ${bytes.length} bytes)`,
    );
  }
}

async function run() {
  await waitForServer();
  await checkModelIsServed();
  browser = await chromium.launch({
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on(
    'response',
    (r) => r.url().endsWith('.glb') && models.push({ url: r.url(), status: r.status() }),
  );
  page.on('pageerror', (e) => errors.push(String(e)));

  // Menus path: Title → Setup → START by keyboard → match → pause/resume → Results.
  await page.goto(BASE); // bare URL
  await page.waitForSelector('[data-action="play"]');
  await page.keyboard.press('Enter'); // PLAY has focus
  await page.waitForSelector('[data-action="start"]');
  await page.waitForTimeout(500); // the preview loads the model and draws
  const oversized = await page.$$eval('canvas.setup-preview:not([hidden])', (canvases) =>
    canvases
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 120 || r.height > 160)
      .map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  if (oversized.length > 0) {
    throw new Error(
      `setup preview canvas is oversized (${oversized.join(', ')}); expected <= 120x160 px`,
    );
  }
  await page.keyboard.press('Enter'); // START has focus
  await page.waitForSelector('.hud');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-action="resume"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-action="resume"]', { state: 'detached' });

  // Short match through a URL shortcut reaches Results.
  await page.goto(`${BASE}?duration=5&seed=3`);
  await page.waitForSelector('.screen-results', { timeout: 60_000 });
  const headline = await page.textContent('.results-headline');
  if (!/YOU WIN!|YOU LOSE|OVERTIME WIN!/.test(headline ?? '')) {
    throw new Error(`bad headline: ${headline}`);
  }
  // The focused button pulses forever, so Playwright never sees it as stable: skip that check.
  await page.waitForTimeout(700); // Results ignores confirm/clicks for 600 ms after it mounts
  await page.click('[data-action="rematch"]', { force: true });
  await page.waitForSelector('.hud');

  // Golden (id ace) is a real model: it must load, animate under input (run right, then the action
  // button: a shot if Golden has the ball, a jump otherwise), and never fall back (spec F.8.2).
  await page.goto(`${BASE}?character=ace&seed=2`);
  await page.waitForSelector('.hud');
  await page.keyboard.down('d');
  await page.waitForTimeout(800);
  await page.keyboard.up('d');
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  if (!models.some((m) => m.url.endsWith('/assets/characters/ace.glb') && m.status === 200)) {
    throw new Error(`Golden's model was not fetched: ${JSON.stringify(models)}`);
  }
  const fallbacks = warnings.filter((w) => w.includes('[model] fallback'));
  if (fallbacks.length)
    throw new Error(`model fell back to a placeholder:\n${fallbacks.join('\n')}`);

  if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);
  console.log('smoke: ok');
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close().catch(() => undefined);
    server.kill();
    process.exit(process.exitCode ?? 0);
  });
