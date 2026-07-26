/**
 * visual_check.mjs — screenshot harness (visuals proposal E3).
 *
 * Boots the app headless, wakes the audio engine, then captures every biome
 * band plus a high-tension shot, into shots/<backend>-<name>.png. Exists
 * because the WebGPU point-size bug survived as long as it did by us only
 * ever looking at one backend — run it on both before trusting a visual
 * change:
 *
 *   node tools/visual_check.mjs                # WebGL2 (swiftshader, CI-safe)
 *   node tools/visual_check.mjs --backend=webgpu   # needs a WebGPU-capable chromium
 */
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const webgpu = process.argv.includes('--backend=webgpu');
const outDir = new URL('../shots/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 5198 } });
await server.listen();

const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: [
    '--autoplay-policy=no-user-gesture-required',
    ...(webgpu ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] : ['--use-gl=swiftshader']),
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

await page.goto('http://localhost:5198', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.click('#overlay');
await page.waitForTimeout(9000); // samples load, engine schedules, figures fire

const backend = await page.evaluate(() => window.jungle?.visuals?.backend ?? 'unknown');
console.log(`backend: ${backend}${webgpu && backend !== 'webgpu' ? '  (WebGPU requested but unavailable — fell back)' : ''}`);

const stops = [['roots', 0.05], ['floor', 0.35], ['canopy', 0.65], ['sky', 0.95]];
for (const [name, a] of stops) {
  await page.evaluate((v) => {
    window.jungle.visuals.setAltitude(v, true);
    window.jungle.bus.params.brightnessMix = 1;    // brightness-keyed effects
    window.jungle.bus.params.brightnessManual = v; // (aurora, shafts) show in-band
  }, a);
  await page.waitForTimeout(2500); // settle + let figures land in-band
  await page.screenshot({ path: `${outDir}${backend}-${name}.png` });
  console.log(`captured ${backend}-${name}.png`);
}

// glyph shot: jump the transport to a peak section (skip buttons, bus D15)
await page.evaluate(() => {
  window.jungle.visuals.setAltitude(null);
  window.jungle.bus.params.brightnessMix = 0;
});
await page.click('button:has-text("canopy")').catch(() => {});
await page.click('button:has-text("peak")').catch(() => {});
await page.waitForTimeout(5000);
await page.screenshot({ path: `${outDir}${backend}-peak-glyph.png` });
console.log(`captured ${backend}-peak-glyph.png`);

// high-tension shot: manual override pushes the whole system toward the climax
await page.evaluate(() => {
  window.jungle.bus.params.tensionMix = 1;
  window.jungle.bus.params.tensionManual = 1;
  window.jungle.visuals.setAltitude(0.65, true);
});
await page.waitForTimeout(7000); // a rebuild lands, density/bloom rise
await page.screenshot({ path: `${outDir}${backend}-climax.png` });
console.log(`captured ${backend}-climax.png`);

console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
