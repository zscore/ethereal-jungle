/**
 * shot_diff.mjs — compare a sweep against its baseline (materials proposal AC1).
 *
 * `.gitignore` has carried a `shots-baseline/` entry since the pizzaz pass and
 * nothing has ever read it. That was survivable while every visual change was
 * ADDITIVE — a new system, a new style, a new creature — because each could be
 * judged in the frames that contained it. A material change is the first one
 * where every frame at every altitude moves, and eyeballing forty PNG pairs is
 * not a review.
 *
 * Deliberately NOT a perceptual metric. It answers one question — *which frames
 * changed most, and did anything change that should not have* — and leaves the
 * verdict to a human. Per-quadrant means are reported alongside the whole-frame
 * one because the failure this is really watching for is regional: a sky that
 * brightened while the ground did not, or one band inverting against another.
 *
 *   node tools/visual_check.mjs && cp -r shots shots-baseline    # set a baseline
 *   …make a change…
 *   node tools/visual_check.mjs && node tools/shot_diff.mjs      # review it
 *
 * A caveat worth knowing before you trust a number: **this world is
 * time-varying**. Clouds drift, weather walks, the storm cell arrives and
 * leaves, and `visual_check` does not pin the transport for most shots. Two
 * runs of the SAME build therefore differ, and in practice the noise floor is
 * around ±25 mean levels on the busiest frames. Treat anything under that as
 * nothing, and re-run before believing a single frame's delta.
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const A = process.argv[2] ?? 'shots-baseline';
const B = process.argv[3] ?? 'shots';

if (!existsSync(A)) {
  console.error(`no baseline at ${A}/ — make one with:  node tools/visual_check.mjs && cp -r shots ${A}`);
  process.exit(2);
}

/** Minimal PNG reader: enough for what our own harness writes, and no deps. */
function readPng(path) {
  const d = readFileSync(path);
  let pos = 8, w = 0, h = 0, ct = 6, bd = 8;
  const idat = [];
  while (pos < d.length) {
    const len = d.readUInt32BE(pos);
    const type = d.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      w = d.readUInt32BE(pos + 8); h = d.readUInt32BE(pos + 12);
      bd = d[pos + 16]; ct = d[pos + 17];
    } else if (type === 'IDAT') idat.push(d.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  if (bd !== 8) throw new Error(`${path}: only 8-bit PNGs (got ${bd})`);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0, i = 0; y < h; y++) {
    const f = raw[i++];
    const line = Buffer.from(raw.subarray(i, i + stride)); i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { w, h, ch, px: out };
}

// The UI panel is a third of the frame and never changes; including it would
// dilute every delta by the same constant and make real changes look smaller.
const UI_FRACTION = 0.72;

function stats(img) {
  const { w, h, ch, px } = img;
  const wide = Math.floor(w * UI_FRACTION);
  const quads = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  let total = 0, n = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < wide; x += 2) {
      const o = (y * w + x) * ch;
      const l = (px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000;
      const q = (y < h / 2 ? 0 : 2) + (x < wide / 2 ? 0 : 1);
      quads[q] += l; counts[q]++;
      total += l; n++;
    }
  }
  return { mean: total / n, quads: quads.map((s, i) => s / counts[i]) };
}

const names = readdirSync(B).filter((f) => f.endsWith('.png'));
const rows = [];
for (const name of names) {
  if (!existsSync(`${A}/${name}`)) { rows.push({ name, missing: true }); continue; }
  try {
    const a = stats(readPng(`${A}/${name}`));
    const b = stats(readPng(`${B}/${name}`));
    rows.push({
      name,
      d: b.mean - a.mean,
      a: a.mean, b: b.mean,
      quads: b.quads.map((v, i) => v - a.quads[i]),
    });
  } catch (err) { rows.push({ name, error: err.message }); }
}

const NOISE = 25;   // see the header: this world moves between runs
rows.sort((x, y) => Math.abs(y.d ?? 0) - Math.abs(x.d ?? 0));

console.log(`${B} vs ${A}\n`);
console.log('  delta   before  after   quadrants (TL TR BL BR)   frame');
for (const r of rows) {
  if (r.missing) { console.log(`  (new)                                            ${r.name}`); continue; }
  if (r.error) { console.log(`  (err)   ${r.error}  ${r.name}`); continue; }
  const flag = Math.abs(r.d) > NOISE ? '*' : ' ';
  const q = r.quads.map((v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`.padStart(5)).join(' ');
  console.log(`${flag} ${(r.d >= 0 ? '+' : '') + r.d.toFixed(1)}`.padEnd(10)
    + `${r.a.toFixed(0)}`.padStart(6) + `${r.b.toFixed(0)}`.padStart(8)
    + `   ${q}   ${r.name}`);
}
const moved = rows.filter((r) => Math.abs(r.d ?? 0) > NOISE);
const missing = rows.filter((r) => r.missing);
console.log(`\n${rows.length} frames, ${moved.length} past the ±${NOISE} noise floor`
  + (missing.length ? `, ${missing.length} new` : ''));
if (moved.length) console.log('starred frames are the ones to actually look at.');
