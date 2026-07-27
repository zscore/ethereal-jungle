/**
 * cast_audit.mjs — D22 cast audit. Boots the app headless, then walks every
 * track × section with the transport buttons and counts what actually reaches
 * the bus, failing on any console error.
 *
 * Exists because the per-track palettes are the first thing in this project to
 * use worklet-backed effects (crush, coarse, shape) and superdough drops those
 * silently when the AudioWorklets did not load — a class of failure that never
 * shows up in the pattern tests, because the pattern is perfectly correct. Run
 * it after touching palettes or the engine's boot path:
 *
 *   node tools/cast_audit.mjs
 *
 * What it is NOT: a content test. Counts come from a 7 s window taken after a
 * seek, so a sparse section can legitimately report almost nothing, and the
 * transport's re-anchor (D15) can swallow the first bar or so. The claims about
 * what each cast contains are checked exactly, offline, in test/palette.mjs.
 */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ root: process.cwd(), server: { port: 5201 } });
await server.listen();

const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[reqfail] ${r.url()}`));

await page.goto('http://localhost:5201', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.click('#overlay');
await page.waitForTimeout(12000); // samples + worklets

const clickByText = async (container, text) => {
  await page.evaluate(([c, t]) => {
    const btn = [...document.querySelectorAll(`#${c} button`)].find((b) => b.textContent === t);
    if (!btn) throw new Error(`no ${c} button "${t}"`);
    btn.click();
  }, [container, text]);
};

const probe = async (seconds) => page.evaluate(async (ms) => {
  const counts = {};
  const un = window.jungle.bus.subscribe((e) => {
    if (e.type !== 'hap') return;
    counts[e.sound ?? '(note)'] = (counts[e.sound ?? '(note)'] ?? 0) + 1;
  });
  await new Promise((r) => setTimeout(r, ms));
  un();
  return { counts, readout: document.getElementById('readout')?.textContent ?? '' };
}, seconds * 1000);

const TRACKS = ['undergrowth', 'forest floor', 'canopy', 'zenith'];
const SECTIONS = ['intro', 'groove', 'breakdown', 'peak', 'release', 'seam'];

for (const tr of TRACKS) {
  await clickByText('tracks', tr);
  await page.waitForTimeout(500);
  for (const sec of SECTIONS) {
    await clickByText('sections', sec);
    // let the scheduler re-anchor after the seek before counting: events
    // already in flight keep sounding, and the first bar or so under-reports
    await page.waitForTimeout(2000);
    const { counts } = await probe(7);
    const line = Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}×${v}`).join(' ');
    console.log(`${tr.padEnd(13)} ${sec.padEnd(10)} ${line}`);
  }
}

console.log('\nerrors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
