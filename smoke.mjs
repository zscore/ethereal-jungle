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

// Start audio. The click handler hides the overlay synchronously, so a hidden
// overlay proves the click landed on a live listener rather than on an element
// that a reload was about to replace.
// A real click is the better assertion — it proves the overlay is visible and
// hit-testable, not merely present. But Playwright's actionability checks need
// many main-thread slots, and a starved thread cannot supply them. So: try the
// real thing twice, then fall back to dispatching the event, which needs one
// slot. The fallback is recorded in the output, because a run that needed it is
// telling you the machine was too busy to trust for anything else.
const overlayHidden = () =>
  page.evaluate(() => document.getElementById('overlay').style.display === 'none');

const strategies = [
  ['click', () => page.locator('#overlay').click({ timeout: CLICK_TIMEOUT })],
  ['click (retry)', () => page.locator('#overlay').click({ timeout: CLICK_TIMEOUT })],
  ['dispatched click', () => page.evaluate(() => document.getElementById('overlay').click())],
];

let started = false;
let startedVia = null;
for (const [name, fire] of strategies) {
  try {
    await fire();
    started = await overlayHidden();
  } catch (err) {
    console.log(`${name} threw at ${at()}: ${err.message.split('\n')[0]}`);
  }
  if (started) { startedVia = name; break; }
  console.log(`${name} did not take at ${at()} — resettling`);
  await waitForBoot().catch(() => {});
}
if (!started) errors.push('[smoke] every strategy failed to start audio');
if (started) console.log(`audio started at ${at()} via ${startedVia}`);

// Subscribe before waiting, so nothing between the click and the count window
// goes unseen.
if (started) {
  // ONE persistent subscription, accumulating from the moment audio starts.
  //
  // Not a sampling window: bus.js publishes "ahead of time", i.e. the scheduler
  // emits a burst per phrase and then goes quiet. A fixed 5 s window can land
  // wholly inside a gap and report silence for an engine that is running fine —
  // which it did, on 3 of 3 runs. Counting cumulatively cannot miss a burst.
  await page.evaluate(() => {
    window.__smoke = { haps: 0, counts: {} };
    window.jungle.bus.subscribe((e) => {
      const k = e.type === 'hap' ? `hap:${e.sound}` : e.type;
      window.__smoke.counts[k] = (window.__smoke.counts[k] ?? 0) + 1;
      if (e.type === 'hap') window.__smoke.haps += 1;
    });
  });

  // Wait for the FIRST hap rather than sleeping through sample loading. On a
  // fast machine this returns in a second or two; on a loaded one it takes as
  // long as it takes, instead of failing at a hardcoded 25 s.
  await page
    .waitForFunction(() => window.__smoke.haps > 0, null, { timeout: SOUND_TIMEOUT })
    .then(() => console.log(`first hap at ${at()}`))
    .catch(() => errors.push(`[smoke] no audio events within ${SOUND_TIMEOUT / 1000}s of starting`));
}

// Let the engine run a little past the first burst so the breakdown describes a
// running engine rather than the very first event, then read the accumulator.
// This sleep is a sampling choice, not a readiness bet: nothing is asserted on
// what arrives within it, only on the cumulative total.
const state = started
  ? await page.evaluate(async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return {
        overlayHidden: document.getElementById('overlay').style.display === 'none',
        readout: document.getElementById('readout')?.textContent ?? '',
        counts: window.__smoke.counts,
      };
    }, COUNT_WINDOW)
  : { overlayHidden: false, readout: '', counts: {} };

const haps = Object.entries(state.counts).filter(([k]) => k.startsWith('hap:'));
const hapTotal = haps.reduce((n, [, v]) => n + v, 0);

// ---- the assertions this file exists to make ----
if (!started) errors.push('[smoke] audio never started — the overlay never hid');
else if (!state.overlayHidden) errors.push('[smoke] overlay came back — the engine reported a failure');
if (started && hapTotal === 0) errors.push('[smoke] no sound: zero hap events since audio started');

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
