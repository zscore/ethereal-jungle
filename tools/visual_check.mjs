/**
 * visual_check.mjs — screenshot harness (visuals proposal E3, extended by J2).
 *
 * Boots the app headless, wakes the audio engine, then captures every biome
 * band, the climax, the litter, a full perform-rail sweep
 * (each knob's visual twin, H1) and both seam flavors (I2), into
 * shots/<backend>-<name>.png. Exists because the WebGPU point-size bug
 * survived as long as it did by us only ever looking at one backend — run it
 * on both before trusting a visual change:
 *
 *   node tools/visual_check.mjs                # WebGL2 (swiftshader, CI-safe)
 *   node tools/visual_check.mjs --backend=webgpu   # needs a WebGPU-capable chromium
 *
 * Known limitation, re-verified 2026-07-27 against the fa38e86 baseline (a
 * checkout predating the look module, the weather layer and the style tiers):
 * on this headless chromium **the WebGPU device is lost a few seconds into
 * every run** — `WebGPU Device Lost: A valid external Instance reference no
 * longer exists`, followed by a stream of `Instance dropped in popErrorScope`.
 * It happens on the baseline too (3.9 s in), so it is the environment, not the
 * scene: headless WebGPU on this machine, where chromium is asked for Vulkan
 * on a Metal platform. That lost device is also *why* the PNGs are black.
 *
 * An earlier version of this note claimed the WebGPU run was "clean, no page
 * errors". It is not, and it apparently never was — the errors arrive after
 * the boot log, so a glance at the head of the output missed them.
 *
 * So: the WebGPU pass certifies *that the chain compiles and the world boots
 * on that backend* — a real thing to certify, and how the point-size bug would
 * be caught — and nothing about appearance or stability. The WebGL2 pass
 * certifies what it looks like. Look at WebGPU in a real browser window
 * before trusting either appearance or frame rate there.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const webgpu = process.argv.includes('--backend=webgpu');
const outDir = new URL('../shots/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 5198 } });
await server.listen();
// 5198 is a preference, not a promise: vite silently moves to the next free
// port when something else already holds it (another project's dev server will
// do), and the hardcoded goto below then pointed at that stranger's page. The
// symptom is a 30 s timeout waiting for `#overlay`, which reads like a broken
// app. Ask the server where it actually landed.
const origin = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5198';

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

console.log(`serving: ${origin}`);
// Boot and click the way `smoke.mjs` does, and for the reason it does. This
// used to be `waitUntil: 'load'`, a fixed 2.5 s sleep, and one `click` — three
// bets on how fast the machine is, and on a box under load they all lose
// together: the click times out after 30 s waiting for a main-thread slot and
// the whole sweep dies before its first frame, which reads like a broken app
// rather than a busy laptop. `load` is also the wrong signal here (the page
// pulls ~7 MB of ogg and then keeps streaming); `window.jungle.bus` is the
// real "our code ran" one. Then the click escalates — twice for real, because
// that proves the overlay is hit-testable, then dispatched, which needs one
// slot instead of many — and says which one worked, since a run that needed
// the fallback is telling you not to trust its frame rate for anything.
await page.goto(origin, { waitUntil: 'commit' });
await page.waitForFunction(() => Boolean(window.jungle?.bus), null, { timeout: 120000 });
const overlayHidden = () =>
  page.evaluate(() => document.getElementById('overlay')?.style.display === 'none');
let started = null;
for (const [name, fire] of [
  ['click', () => page.locator('#overlay').click({ timeout: 20000 })],
  ['click (retry)', () => page.locator('#overlay').click({ timeout: 20000 })],
  ['dispatched click', () => page.evaluate(() => document.getElementById('overlay').click())],
]) {
  try {
    await fire();
    if (await overlayHidden()) { started = name; break; }
  } catch (err) { console.log(`${name} threw: ${err.message.split('\n')[0]}`); }
}
if (!started) { console.error('could not start audio — the overlay never took a click'); process.exit(1); }
console.log(`started: ${started}${started === 'click' ? '' : '  (the machine is loaded — treat timings with suspicion)'}`);
await page.waitForTimeout(9000); // samples load, engine schedules, figures fire

const backend = await page.evaluate(() => window.jungle?.visuals?.backend ?? 'unknown');
const tier = await page.evaluate(() => ({
  optics: window.jungle?.visuals?.optics, styles: window.jungle?.visuals?.styles,
  quality: window.jungle?.visuals?.quality,
}));
console.log(`backend: ${backend}${webgpu && backend !== 'webgpu' ? '  (WebGPU requested but unavailable — fell back)' : ''}`);
console.log(`chain:   optics(dof)=${tier.optics}  styles(L)=${tier.styles}  quality=${tier.quality}`);
if (!tier.styles) console.log('note: the style tier is NOT built — ink/halftone/kaleido/streak shots will be inert');

const shot = async (name, settleMs = 2500) => {
  await page.waitForTimeout(settleMs);
  await page.screenshot({ path: `${outDir}${backend}-${name}.png` });
  console.log(`captured ${backend}-${name}.png`);
};
const setParams = (p) => page.evaluate((o) => Object.assign(window.jungle.bus.params, o), p);

// The four storeys (D39). These are the *middles* of the four tracks' authored
// brightness spans, not evenly-spaced numbers: the crowns hang on the seams, so
// a stop picked by eye would land on a boundary and photograph neither level.
// (Renamed from roots/floor/canopy/sky when the bands became a forest.)
const stops = [['undergrowth', 0.20], ['understory', 0.42], ['canopy', 0.68], ['openair', 0.98]];
// These four shots are about the WORLD, so the style tier comes off for them.
// They used to be taken at whatever section the set had reached, so one or two
// would arrive wearing the ink style (L3 is bound to breakdowns) — a picture of
// the ink pass, certifying nothing about the band. Seeking to `groove` first is
// not enough: `inkAmt` is smoothed per frame against a dt clamped to 0.1, so on
// a software rasterizer running at ~2 fps the fade takes upward of ten seconds
// of wall clock. The styles have four dedicated shots of their own further
// down; what is lost here is only the always-on optics (L1/L2/L8) riding with
// them, and those have their own frames too.
await page.evaluate(() => window.jungle.visuals.setStyles(false));
for (const [name, a] of stops) {
  await page.evaluate((v) => {
    window.jungle.visuals.setAltitude(v, true);
    window.jungle.bus.params.brightnessMix = 1;    // brightness-keyed effects
    window.jungle.bus.params.brightnessManual = v; // (grade, god rays) show in-band
  }, a);
  await page.waitForTimeout(2500); // settle + let figures land in-band
  await page.screenshot({ path: `${outDir}${backend}-${name}.png` });
  console.log(`captured ${backend}-${name}.png`);
}
await page.evaluate(() => window.jungle.visuals.setStyles(null)); // back to the governor

// There were two `form-*` shots here, of the recurring form at the two scales
// D28 named, and a third assertion that it was absent outside the peak. D42
// removed the form itself, so the shots went with it. The pattern they set is
// worth keeping if the slot is ever refilled: pin the presence rather than wait
// for it (the reveal was a ~4 s growth, which is minutes of wall clock on a
// software rasterizer), and assert what is drawn as well as photographing it,
// because a draw range of zero is invisible in a PNG.

// high-tension shot: manual override pushes the whole system toward the climax
await page.evaluate(() => {
  window.jungle.bus.params.tensionMix = 1;
  window.jungle.bus.params.tensionManual = 1;
  window.jungle.visuals.setAltitude(0.65, true);
});
await shot('climax', 7000); // a rebuild lands, density/bloom rise

// the floor of the world (F1's shot, minus its subject): the corpus shrine used
// to be photographed here, at the bottom of the undergrowth with the wildness up
// because the edit rate of its chop WAS w. D42 removed the shrine; the frame is
// kept because the litter at altitude 0.02 is the one place the world is looked
// at from below, and nothing else in the sweep stands there.
await page.evaluate(() => { window.jungle.bus.params.tensionMix = 0; });
await page.click('button:has-text("undergrowth")').catch(() => {});
await setParams({ wildness: 0.85 });
await page.evaluate(() => {
  window.jungle.visuals.setAltitude(0.02, true);
  window.jungle.visuals.setLateral(-2); // pin the wander so the frame repeats
});
await shot('litter', 5000);
await page.evaluate(() => window.jungle.visuals.setLateral(null));

// perform-rail twins (H1): each knob's picture, one at a time, then at rest
for (const [name, params] of [
  ['rail-lp', { lpf: 0 }],
  ['rail-hp', { hpf: 1 }],
  ['rail-echo', { echo: 1 }],
  ['rail-crush', { crush: 1 }],
  ['rail-space', { space: 1 }],
]) {
  await setParams({ lpf: 1, hpf: 0, echo: 0, crush: 0, space: 0, ...params });
  await shot(name, 1800);
}
await setParams({ lpf: 1, hpf: 0, echo: 0, crush: 0, space: 0, wildness: 0.35 });

// ---- the pizzaz tiers (K/L/M) ----
// The nature layer is weather-gated, so each shot pins the weather rather than
// waiting for the set to deal it: a rain frame that only appears 40 s into the
// forest floor is not something a harness can certify.
await setParams({ lpf: 1, hpf: 0, echo: 0, crush: 0, space: 0 });
await page.evaluate(() => window.jungle.visuals.setStyles(true));

// K3 rain + K1 wind, in the band that owns them
await page.evaluate(() => {
  window.jungle.visuals.setAltitude(0.3, true);
  window.jungle.visuals.setLateral(0);
  window.jungle.visuals.setWeather({ mist: 0.6, rain: 1, wind: 0.9, storm: 0 });
});
await shot('weather-rain', 3500);

// K7 lightning: hold a strike open — the real one lasts ~200 ms
await page.evaluate(() => window.jungle.visuals.strike(1));
await shot('weather-lightning', 1200);
await page.evaluate(() => window.jungle.visuals.strike(null));

// K2/K5/K6: the living layer, low in the world where all three overlap
await page.evaluate(() => {
  window.jungle.visuals.setWeather({ mist: 0.8, rain: 0, wind: 0.5, storm: 0 });
  window.jungle.visuals.setAltitude(0.08, true);
});
await shot('nature-undergrowth', 3500);
for (const biome of ['fireflies', 'mycelium', 'nearfield', 'pool', 'rain', 'forest']) {
  await page.evaluate((b) => window.jungle.visuals.isolate(b), biome);
  await shot(`biome-${biome}`, 1800);
}
await page.evaluate(() => window.jungle.visuals.isolate(null));

// D39 — the two shots the forestscape has to survive: standing among the
// trunks looking up at the shafts, and out over the crown sea from above. They
// are the same world 40 units apart, and if either reads as a different piece
// the ascent has not landed.
await page.evaluate(() => {
  window.jungle.visuals.setWeather({ mist: 0.85, rain: 0, wind: 0.4, storm: 0 });
  window.jungle.visuals.setAltitude(0.40, true);
  window.jungle.visuals.setLateral(0);
  window.jungle.bus.params.brightnessMix = 1;
  window.jungle.bus.params.brightnessManual = 0.40;
});
await shot('forest-understory', 3500);
await page.evaluate(() => {
  window.jungle.visuals.setWeather({ mist: 0.3, rain: 0, wind: 0.7, storm: 0 });
  window.jungle.visuals.setAltitude(0.98, true);
  window.jungle.bus.params.brightnessManual = 0.98;
});
await shot('forest-above', 3500);
await page.evaluate(() => {
  window.jungle.bus.params.brightnessMix = 0;
  window.jungle.visuals.setLateral(null);
});

// L2 god rays live in the canopy band and nowhere else
await page.evaluate(() => {
  window.jungle.visuals.setAltitude(0.62, true);
  window.jungle.bus.params.brightnessMix = 1;
  window.jungle.bus.params.brightnessManual = 0.62;
});
await shot('style-godrays', 3000);

// L4 halftone: the far end of the crush knob (the knee is at 0.55). Pin the
// transport to a section that HAS content first — a halftone of an intro bar
// is a picture of an empty screen with dots on it, which certifies nothing.
await page.click('button:has-text("canopy")').catch(() => {});
await page.click('button:has-text("groove")').catch(() => {});
await setParams({ crush: 1, tensionMix: 1, tensionManual: 0.85 });
await shot('style-halftone', 2500);
await setParams({ crush: 0, tensionMix: 0 });

// L3 ink: bound to breakdown sections, so ask the transport for one
await page.evaluate(() => {
  window.jungle.bus.params.brightnessMix = 0;
  window.jungle.visuals.setAltitude(null);
});
await page.click('button:has-text("breakdown")').catch(() => {});
await shot('style-ink', 4000); // the ink fades in over ~1 s by design
// a style bound to a section is easy to believe is on while its uniform is 0
console.log('  style state:', JSON.stringify(await page.evaluate(() => window.jungle.visuals.debugStyle())));

// L5 kaleido + B3 fusion: the one climax, where everything is spent at once
await page.click('button:has-text("canopy")').catch(() => {});
await page.click('button:has-text("peak")').catch(() => {});
await shot('style-fusion', 5000);
await page.evaluate(() => {
  window.jungle.visuals.setWeather(null);
  window.jungle.visuals.setLateral(null);
});

// ---- the fauna and the sky (proposal IV, tiers U and V) ----
// Every one of these pins what it photographs. A creature bound to an altitude
// band is exactly as easy to *believe* is present as a style bound to a section
// was, and `debugFauna()` is here for the same reason `debugStyle()` is: a PNG
// cannot tell you a band window was zero or a population was culled to nothing.
await page.evaluate(() => {
  window.jungle.visuals.setStyles(false);
  window.jungle.visuals.setSky(true);
  window.jungle.bus.params.brightnessMix = 1;
});

for (const [name, alt, weather] of [
  // U2 — the sloths, in the band whose gaze climbs into them
  ['fauna-sloth', 0.18, { mist: 0.8, rain: 0, wind: 0.35, storm: 0 }],
  // U3 — the pond chorus, which is a BOTTOM-OF-THE-WORLD shot and cannot be
  // taken anywhere else: the undergrowth's gaze climbs, so a frog on the water
  // is out of frame from camera y 6 up (see `CAST.poolfrog`). If this frame is
  // empty the band has been widened again by someone who did not read that note.
  ['fauna-poolfrog', 0.03, { mist: 0.7, rain: 0, wind: 0.25, storm: 0 }],
  // …and the dart frogs on the trunks, which DO travel with the camera — one
  // low in the undergrowth and one at the forest floor, because the whole point
  // of the near-field recycling is that both frames are populated
  ['fauna-dartfrog-low', 0.16, { mist: 0.7, rain: 0, wind: 0.35, storm: 0 }],
  ['fauna-treefrog', 0.40, { mist: 0.55, rain: 0.5, wind: 0.45, storm: 0 }],
  // U4/U5 — the flock, in the crowns
  ['fauna-birds', 0.64, { mist: 0.35, rain: 0, wind: 1, storm: 0 }],
  // U2 again, where sloths actually live
  ['fauna-slothcrown', 0.60, { mist: 0.35, rain: 0, wind: 0.6, storm: 0 }],
  // U4 — the zenith's one bird
  ['fauna-soarer', 0.92, { mist: 0.15, rain: 0, wind: 0.6, storm: 0 }],
]) {
  await page.evaluate(([a, w]) => {
    window.jungle.visuals.setAltitude(a, true);
    window.jungle.bus.params.brightnessManual = a;
    window.jungle.visuals.setWeather(w);
    window.jungle.visuals.setLateral(0);
  }, [alt, weather]);
  await shot(name, 3000);
  const f = await page.evaluate(() => window.jungle.visuals.debugFauna());
  console.log(`  ${name} presence:`, JSON.stringify(f?.presence));
}

// U5 — the toucan startle. The real one fires once every two phrases, which is
// not something a sweep can wait for; `flush()` exists so it can be seen.
await page.evaluate(() => {
  window.jungle.visuals.setAltitude(0.64, true);
  window.jungle.bus.params.brightnessManual = 0.64;
  window.jungle.visuals.flush(0, null, -14);
});
await shot('fauna-flush', 900);   // the envelope is ~1 s: catch it early

// V1 — the cloud field, from inside it. This is the shot the whole tier exists
// for, and the one that settles the proposal's one unverified premise: the old
// deck sat at y 72/82 while this camera flies at y 45–56 tilted 8° DOWN.
await page.evaluate(() => {
  window.jungle.visuals.setWeather({ mist: 0.2, rain: 0, wind: 0.6, storm: 0 });
  window.jungle.visuals.setAltitude(0.90, true);
  window.jungle.bus.params.brightnessManual = 0.90;
});
await shot('sky-clouds', 3500);

// V2/V4 — a storm cell with its virga, pinned, at the two distances that make
// it two different images: overhead on the forest floor, on the horizon above.
for (const [name, alt, far] of [['sky-storm-near', 0.42, 0.15], ['sky-storm-far', 0.90, 0.95]]) {
  await page.evaluate(([a, f]) => {
    window.jungle.visuals.setAltitude(a, true);
    window.jungle.bus.params.brightnessManual = a;
    window.jungle.visuals.setWeather({ mist: 0.4, rain: 0.3, wind: 0.6, storm: 1, stormFar: f });
    window.jungle.visuals.storm(1);
  }, [alt, far]);
  await shot(name, 3000);
  console.log(`  ${name} sky:`, JSON.stringify(await page.evaluate(() => window.jungle.visuals.debugSky()?.cell)));
}

// V3 — the item this tier exists for: a strike, at the zenith, which was
// impossible before (rain 0 → storm 0 → no lightning, ever, in the one band
// with a visible sky). If this frame is dark, the decoupling did not land.
await page.evaluate(() => window.jungle.visuals.strike(1));
await shot('sky-zenith-strike', 1200);
await page.evaluate(() => {
  window.jungle.visuals.strike(null);
  window.jungle.visuals.storm(null);
  window.jungle.visuals.setWeather(null);
  window.jungle.visuals.setLateral(null);
  window.jungle.visuals.setStyles(null);
  window.jungle.bus.params.brightnessMix = 0;
  window.jungle.visuals.setAltitude(null);
});

// X — the rail knobs that had no eye until now. Same shape as the H1 sweep
// above; `gate` is capped at GATE_FLOOR and must never reach black.
for (const [name, params] of [
  ['rail-gate', { gate: 1 }],
  ['rail-drive', { drive: 1 }],
  ['rail-eqlow', { eqLow: 0 }],
  ['rail-eqhigh', { eqHigh: 0 }],
  ['rail-roll', { roll: 0.9 }],
]) {
  await setParams({ gate: 0, drive: 0, eqLow: 1, eqMid: 1, eqHigh: 1, roll: 0, ...params });
  await shot(name, 1800);
}
await setParams({ gate: 0, drive: 0, eqLow: 1, eqMid: 1, eqHigh: 1, roll: 0 });

// seam flavors (I2): seek each track's seam, capture whichever variants the
// seed dealt — the landing flashes on the boundary, the dissolve never does
await page.evaluate(() => window.jungle.visuals.setAltitude(null));
const seen = new Set();
for (const track of ['undergrowth', 'forest floor', 'canopy', 'zenith']) {
  if (seen.size === 2) break;
  await page.click(`button:has-text("${track}")`).catch(() => {});
  await page.click('button:has-text("seam")').catch(() => {});
  await page.waitForTimeout(1200);
  const variant = await page.evaluate(() => window.jungle.bus.seamAt(window.jungle.bus.now()).variant);
  if (!variant || seen.has(variant)) continue;
  seen.add(variant);
  // the seam window is 2 phrases ≈ 11 s; land the shot on the boundary itself
  await shot(`seam-${variant}`, 10500);
}
if (seen.size < 2) console.log(`note: seed dealt only ${[...seen].join(', ')} seams this run`);

console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
