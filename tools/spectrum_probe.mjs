/**
 * spectrum_probe.mjs — record the finished mix and measure it (D33).
 *
 * Every other check in this repo asks whether the *pattern* is right.
 * `test/palette.mjs` proves a layer exists where it should; `cast_audit.mjs`
 * proves the events reach the renderer. Neither can tell you that the zenith
 * has an unpleasant high ring in it, because a ring is a property of the audio
 * and nothing here had ever listened to the audio.
 *
 * So: boot the real page, seek to a place in the set, tap the master output
 * (`window.jungle.getAudioTap()` — a passive extra connection, the graph is
 * untouched), record N seconds through MediaRecorder, and hand the file to
 * ffmpeg + a small analyser. What comes back:
 *
 *   - **persistent narrowband peaks** — the actual definition of a "ring": a
 *     few adjacent bins that stand well above their neighbours and are STILL
 *     there in the quietest frame of the recording. A cymbal is loud and
 *     broadband; a ring is narrow and never leaves.
 *   - **band levels**, so "too bright" / "too muddy" can be argued with numbers
 *   - **the level envelope**, which is how you prove a seam winds down instead
 *     of building up (§6.3, D34).
 *
 * It is a diagnostic, not a gate: it does not fail a build, it prints what is
 * there. Headless Chromium renders Web Audio to a null sink but the graph runs
 * exactly as it does on a speaker, so the numbers are the real mix.
 *
 * Run:
 *   node tools/spectrum_probe.mjs                          # zenith groove, 20 s
 *   node tools/spectrum_probe.mjs --track=3 --section=peak --secs=25
 *   node tools/spectrum_probe.mjs --bar=200 --secs=30 --keep
 *   node tools/spectrum_probe.mjs --seam=3                 # into track 3's seam
 */
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import {
  TRACKS, PHRASE_BARS, BAR_SECONDS, SEAM_BARS, trackStartBar, sectionSpans,
} from '../src/bus.js';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};
const flag = (k) => process.argv.includes(`--${k}`);

const PORT = 5203;
const track = Number(arg('track', 3));
const section = arg('section', 'groove');
const secs = Number(arg('secs', 20));
const seamOf = arg('seam', null);
const WAV = '/tmp/jungle_probe.wav';
const WEBM = '/tmp/jungle_probe.webm';

/** Which absolute bar to start at. */
function startBar() {
  if (arg('bar', null) != null) return Number(arg('bar'));
  if (seamOf != null) {
    const i = Number(seamOf);
    // a couple of phrases BEFORE the seam window, so the approach is in frame
    return trackStartBar(i) + TRACKS[i].bars - SEAM_BARS - PHRASE_BARS;
  }
  const sp = sectionSpans(TRACKS[track].bars).find((s) => s.name === section);
  if (!sp) throw new Error(`no section "${section}" — try ${sectionSpans(TRACKS[track].bars).map((s) => s.name).join(', ')}`);
  return trackStartBar(track) + sp.startBar;
}

const bar = startBar();
const label = seamOf != null
  ? `seam into ${TRACKS[(Number(seamOf) + 1) % TRACKS.length].name}`
  : `${TRACKS[track].name} / ${section}`;

// ---------------------------------------------------------------- record ----
const server = await createServer({ root: process.cwd(), server: { port: PORT } });
await server.listen();
const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
console.log(`probing ${label} — bar ${bar}, ${secs}s`);

// /lab.html, not /: the lab boots the same engine with no three.js scene, and
// the scene is what starves the audio thread under swiftshader (see below).
await page.goto(`http://localhost:${PORT}/lab.html`, { waitUntil: 'commit', timeout: 120_000 });
await page.waitForFunction(() => Boolean(window.jungle?.bus), null, { timeout: 120_000 });
await page.evaluate(() => document.getElementById('overlay').click());
await page.waitForFunction(() => document.getElementById('overlay').style.display === 'none', null, { timeout: 30_000 });
// wait for real sound before seeking: the samples have to be in cache or the
// first seconds of the recording are a loading gap rather than the arrangement
await page.evaluate(() => {
  window.__heard = 0;
  window.jungle.bus.subscribe((e) => { if (e.type === 'hap') window.__heard += 1; });
});
await page.waitForFunction(() => window.__heard > 20, null, { timeout: 180_000 });
console.log(`sounding at ${at()}`);

// `--mute=bowl,lead` deletes those palette slots and recompiles before
// recording: the A/B that says which cast member owns a frequency. It mutates
// the running page only, never the file.
const mute = (arg('mute', '') || '').split(',').filter(Boolean);
if (mute.length) {
  const gone = await page.evaluate(({ track, mute }) => {
    const pal = window.jungle.TRACKS[track].palette;
    const removed = mute.filter((k) => pal[k] != null);
    for (const k of removed) delete pal[k];
    window.jungle.rebuild();
    return removed;
  }, { track, mute });
  console.log(`muted: ${gone.join(', ') || '(nothing matched)'}`);
}

const b64 = await page.evaluate(async ({ bar, secs }) => {
  const { ctx, node } = window.jungle.getAudioTap();
  const dest = ctx.createMediaStreamDestination();
  node.connect(dest);                       // passive: node keeps its other outputs
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  window.jungle.seekToBar(bar);
  await new Promise((r) => setTimeout(r, 1500)); // let the seek settle
  rec.start();
  await new Promise((r) => setTimeout(r, secs * 1000));
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  node.disconnect(dest);
  const buf = await new Blob(chunks).arrayBuffer();
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}, { bar, secs });

await browser.close();
await server.close();
if (errors.length) console.log('console errors:\n  ' + errors.join('\n  '));

writeFileSync(WEBM, Buffer.from(b64, 'base64'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', WEBM, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', WAV]);
console.log(`recorded ${(Buffer.from(b64, 'base64').length / 1e6).toFixed(2)} MB at ${at()}`);

// --------------------------------------------------------------- analyse ----
const report = execFileSync('python3', [new URL('./analyse_probe.py', import.meta.url).pathname, WAV], {
  encoding: 'utf8',
});
console.log(report);
if (!flag('keep')) { unlinkSync(WEBM); unlinkSync(WAV); }
else console.log(`kept ${WEBM} and ${WAV}`);
