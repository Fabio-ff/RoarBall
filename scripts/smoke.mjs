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

async function run() {
  await waitForServer();
  browser = await chromium.launch({
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  // Menus path: Title → Setup → START by keyboard → match → pause/resume → Results.
  await page.goto(BASE); // bare URL
  await page.waitForSelector('[data-action="play"]');
  await page.keyboard.press('Enter'); // PLAY has focus
  await page.waitForSelector('[data-action="start"]');
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
