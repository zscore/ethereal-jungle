// Headless smoke test: load the app, click to start audio, prove it makes sound.
//
// This is the only check that instantiates audio — `npm test` asserts
// pattern-level design claims against a fake clock and never boots a browser.
// So it is the release gate, and it has to be BOTH honest and non-flaky.
//
// **Honest.** It now fails when the page makes no sound. The previous version
// printed `overlayHidden` and the event counts and then exited purely on
// console errors, so a silent page passed the gate.
//
// **Non-flaky.** The old flake (`element was detached from the DOM`, then a
// navigation timeout) was diagnosed as a click race. It is really a *timing
// assumption*: the script slept a fixed 2500 ms and then clicked. Under CPU
// contention that sleep is simply too short — `--use-gl=swiftshader` is a
// SOFTWARE rasterizer, so the renderer competes for the same cores as
// everything else on the machine. On a loaded box the main thread stalls for
// seconds at a time, `load` fires late (15 s observed), and every fixed sleep
// becomes a coin flip.
//
// So: no step here waits for a duration. Every step waits for a *condition*,
// with timeouts generous enough to survive a busy machine, and the run prints
// the load average so that a slow run is self-diagnosing rather than a mystery.
import { existsSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const URL = 'http://localhost:5199/';
const BOOT_TIMEOUT = 120_000;  // module graph + scene init, on a contended machine
const CLICK_TIMEOUT = 30_000;
const SOUND_TIMEOUT = 120_000; // sample loading is network-bound and worklets are slow
const COUNT_WINDOW = 5_000;

const [load1] = loadavg();
const nCpu = cpus().length;
if (load1 > nCpu * 0.7) {
  console.log(`! load average ${load1.toFixed(1)} on ${nCpu} CPUs — swiftshader is a software`);
  console.log('! rasterizer and will be starved. Expect a slow run; close other CPU hogs');
  console.log('! before treating a failure here as a product bug.');
}

const server = await createServer({ root: process.cwd(), server: { port: 5199 } });
await server.listen();

const browser = await chromium.launch({
  // sandbox image ships a system chromium; local dev uses playwright's own
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
// A small viewport is not cosmetic: every pixel is shaded on the CPU here, and
// this test is about whether the engine makes sound, not about visual fidelity.
// tools/visual_check.mjs is the harness that cares how it looks.
const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
page.on('response', (res) => {
  if (res.status() >= 400) errors.push(`[http ${res.status()}] ${res.url()}`);
});
page.on('requestfailed', (req) => errors.push(`[reqfail] ${req.url()} ${req.failure()?.errorText}`));

// A reload mid-test would detach #overlay. Count navigations so that shows up
// as a fact in the output rather than as an unexplained timeout.
let navigations = 0;
page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

/**
 * Wait for the app to be genuinely ready.
 *
 * Deliberately NOT `waitUntil: 'load'` or `networkidle`: this page pulls ~7 MB
 * of ogg beds and then keeps streaming, so `load` arrives late and the network
 * never goes quiet. `main.js` assigns `window.jungle` at module scope, which is
 * the real "our code ran" signal — and it re-appears by itself after a reload.
 */
async function waitForBoot() {
  await page.waitForFunction(() => Boolean(window.jungle?.bus), null, { timeout: BOOT_TIMEOUT });
}

await page.goto(URL, { waitUntil: 'commit', timeout: BOOT_TIMEOUT });
await waitForBoot();
console.log(`booted at ${at()}`);

// A real click is the better assertion — it proves the overlay is visible and
// hit-testable, not merely present. But Playwright's actionability checks need
// many main-thread slots, and a starved thread cannot supply them. So: try the
// real thing twice, then fall back to dispatching the event, which needs one
// slot. The fallback is recorded in the output, because a run that needed it is
// telling you the machine was too busy to trust for anything else.
const overlayHidden = () =>
  page.evaluate(() => document.getElementById('overlay').style.display === 'none');

/** Click the overlay to wake audio. Returns the strategy that worked, or null. */
async function startAudio() {
  const strategies = [
    ['click', () => page.locator('#overlay').click({ timeout: CLICK_TIMEOUT })],
    ['click (retry)', () => page.locator('#overlay').click({ timeout: CLICK_TIMEOUT })],
    ['dispatched click', () => page.evaluate(() => document.getElementById('overlay').click())],
  ];
  for (const [name, fire] of strategies) {
    try {
      await fire();
      // The handler hides the overlay synchronously, so a hidden overlay proves
      // the click reached a live listener rather than a doomed element.
      if (await overlayHidden()) return name;
    } catch (err) {
      console.log(`${name} threw at ${at()}: ${err.message.split('\n')[0]}`);
    }
    console.log(`${name} did not take at ${at()} — resettling`);
    await waitForBoot().catch(() => {});
  }
  return null;
}

/**
 * ONE persistent subscription, accumulating from the moment audio starts.
 *
 * Not a sampling window: bus.js publishes "ahead of time", i.e. the scheduler
 * emits a burst per phrase and then goes quiet. A fixed 5 s window can land
 * wholly inside a gap and report silence for an engine that is running fine —
 * which it did, on 3 of 3 runs. Counting cumulatively cannot miss a burst.
 */
const installCounter = () => page.evaluate(() => {
  window.__smoke = { haps: 0, counts: {} };
  window.jungle.bus.subscribe((e) => {
    const k = e.type === 'hap' ? `hap:${e.sound}` : e.type;
    window.__smoke.counts[k] = (window.__smoke.counts[k] ?? 0) + 1;
    if (e.type === 'hap') window.__smoke.haps += 1;
  });
});

/**
 * Wait for sound, then sample. Returns null if the page reloaded underneath us,
 * which wipes `window.__smoke` and stops the audio — Vite re-optimizing its
 * dependency cache mid-run does exactly this. The predicate therefore also
 * resolves on the accumulator vanishing, so a reload is detected in seconds
 * instead of burning the full sound timeout.
 */
async function waitForSoundAndSample() {
  await page.waitForFunction(
    () => !window.__smoke || window.__smoke.haps > 0,
    null,
    { timeout: SOUND_TIMEOUT },
  );
  if (!(await page.evaluate(() => Boolean(window.__smoke)))) return null;
  console.log(`first hap at ${at()}`);

  // Let the engine run past the first burst so the breakdown describes a running
  // engine rather than the very first event. This sleep is a sampling choice,
  // not a readiness bet: nothing is asserted on what lands inside it, only on
  // the cumulative total.
  return page.evaluate(async (ms) => {
    await new Promise((r) => setTimeout(r, ms));
    if (!window.__smoke) return null; // reloaded during the sample window
    return {
      overlayHidden: document.getElementById('overlay').style.display === 'none',
      readout: document.getElementById('readout')?.textContent ?? '',
      counts: window.__smoke.counts,
    };
  }, COUNT_WINDOW);
}

let started = false;
let startedVia = null;
let state = null;
for (let attempt = 1; attempt <= 2 && !state; attempt += 1) {
  startedVia = await startAudio();
  started = Boolean(startedVia);
  if (!started) break;
  console.log(`audio started at ${at()} via ${startedVia}`);

  await installCounter();
  try {
    state = await waitForSoundAndSample();
  } catch (err) {
    console.log(`measurement failed at ${at()}: ${err.message.split('\n')[0]}`);
    break;
  }
  if (!state) {
    console.log(`page reloaded mid-measurement at ${at()} — restarting (attempt ${attempt} of 2)`);
    started = false;
    startedVia = null;
    await waitForBoot().catch(() => {});
  }
}

const measured = Boolean(state);
state ??= { overlayHidden: false, readout: '', counts: {} };

const haps = Object.entries(state.counts).filter(([k]) => k.startsWith('hap:'));
const hapTotal = haps.reduce((n, [, v]) => n + v, 0);

// ---- the assertions this file exists to make ----
if (!started) errors.push('[smoke] audio never started — the overlay never hid');
else if (!measured) errors.push('[smoke] never got a clean measurement — the page kept reloading');
else if (!state.overlayHidden) errors.push('[smoke] overlay came back — the engine reported a failure');
else if (hapTotal === 0) errors.push('[smoke] no sound: zero hap events since audio started');

console.log('--- SMOKE RESULT ---');
console.log('elapsed:', at(), '| load avg at start:', load1.toFixed(2), `| navigations: ${navigations}`);
console.log('started via:', startedVia ?? 'nothing worked');
console.log('overlayHidden:', state.overlayHidden);
console.log('readout:', JSON.stringify(state.readout));
console.log('bus events since audio started:', JSON.stringify(state.counts));
console.log(`haps: ${hapTotal} across ${haps.length} distinct sounds`);

const fatal = errors.filter((e) => !e.includes('favicon'));
console.log('errors:', fatal.length ? '\n' + fatal.join('\n') : 'none');

await browser.close();
await server.close();
process.exit(fatal.length > 0 ? 1 : 0);
