/**
 * Unit test for the shading model (src/visuals/shade.js — materials Z1/AC2).
 *
 * The second block is the hard rail. A material change is the first change in
 * this project that alters EVERY frame at EVERY altitude, and the one thing a
 * per-pixel model could plausibly destroy is the monotonicity that makes the
 * ascent legible — the forest's identity is one extinction curve, and if a
 * surface normal can reorder the four bands then the picture has stopped being
 * about the climb. That is asserted here rather than looked for in a screenshot.
 *
 * Run: node test/shade.mjs  (included in `npm test`)
 */
import { shadeJS, SHADE } from '../src/visuals/shade.js';
import { canopyLight, CANOPY_BASE, CANOPY_TOP } from '../src/visuals/look.js';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

// the four tracks' authored altitude spans (look.js:111 derives these)
const BANDS = [
  ['undergrowth', 0.12, 0.29],
  ['understory', 0.29, 0.51],
  ['canopy', 0.51, 0.73],
  ['open air', 0.73, 0.90],
];
const mid = (b) => (b[1] + b[2]) / 2;

console.log('the model is the same curve, not a second one');
{
  // a surface facing straight up receives exactly the light that is there —
  // nothing is invented, which is what ambient+hemi === 1 buys
  check(Math.abs(SHADE.ambient + SHADE.hemi - 1) < 1e-9,
    'ambient + hemi is exactly 1, so an up-facing surface receives the available skylight and no more');
  let exact = true;
  for (let a = 0; a <= 1; a += 0.01) {
    if (Math.abs((shadeJS(1, a) - SHADE.floor) - Math.pow(canopyLight(a), SHADE.gamma)) > 1e-9) exact = false;
  }
  check(exact, 'an up-facing surface receives exactly the compressed curve at every altitude');

  // a down-facing surface gets the ambient share only — that is what makes a
  // crown a silhouette from underneath
  check(Math.abs((shadeJS(-1, 0.6) - SHADE.floor)
    - Math.pow(canopyLight(0.6), SHADE.gamma) * SHADE.ambient) < 1e-9,
    'a down-facing surface gets the ambient share only (the crown, from below)');
  check(shadeJS(-1, 0.6) < shadeJS(1, 0.6),
    'so the same surface is darker underneath than on top — the thing the old model could not say');
}

// The correction that mattered most, kept as a test so it cannot come back.
console.log('the surface does not re-apply the extinction the frame already applies');
{
  // look.js multiplies the WHOLE FRAME by 0.45 + 0.55·canopyLight^0.3, so the
  // band-to-band level is already carried once. If the surface also multiplied
  // by raw canopyLight the understory would be ~30x too dark.
  const rawRange = canopyLight(0.90) / canopyLight(0.12);
  const surfRange = (shadeJS(0, 0.90) - SHADE.floor) / (shadeJS(0, 0.12) - SHADE.floor);
  check(rawRange > 30, `the raw curve spans ${rawRange.toFixed(0)}x across the world`);
  check(surfRange < 6,
    `…and the surface spans only ${surfRange.toFixed(1)}x, because the frame carries the rest`);
  check(SHADE.gamma > 0 && SHADE.gamma < 1, 'the compression is a real compression');
}

console.log('AC2 — the four bands keep their order, at every normal (the hard rail)');
{
  let ordered = true, worst = null;
  // sweep every normal orientation, not just up: the risk is that a steep
  // enough normal at a high altitude reads darker than a flat one lower down
  for (let ni = -1; ni <= 1; ni += 0.05) {
    const vals = BANDS.map((b) => shadeJS(ni, mid(b)));
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] <= vals[i - 1]) {
        ordered = false;
        worst = `n.y=${ni.toFixed(2)}: ${BANDS[i - 1][0]}=${vals[i - 1].toFixed(4)} >= ${BANDS[i][0]}=${vals[i].toFixed(4)}`;
      }
    }
  }
  check(ordered, ordered
    ? 'undergrowth < understory < canopy < open air, for all 41 normal orientations'
    : `band order BROKEN — ${worst}`);

  // …and the stronger claim: the ordering holds for any *pair* of normals too,
  // as long as they are the same. (A crown's top may of course outshine a
  // trunk's side; what must not happen is a band inversion at equal facing.)
  let monotone = true;
  for (const ni of [-1, -0.5, 0, 0.5, 1]) {
    for (let a = 0.02; a <= 1; a += 0.01) {
      if (shadeJS(ni, a) < shadeJS(ni, a - 0.01) - 1e-12) monotone = false;
    }
  }
  check(monotone, 'and the model rises monotonically with altitude at every fixed normal');
}

console.log('it is bounded, and it never invents light');
{
  let lo = Infinity, hi = -Infinity, sane = true;
  for (let ni = -1; ni <= 1; ni += 0.02) {
    for (let a = 0; a <= 1; a += 0.02) {
      for (const s of [0, 0.5, 1]) {
        const v = shadeJS(ni, a, s);
        if (!Number.isFinite(v)) sane = false;
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
    }
  }
  check(sane, 'never NaN across normal × altitude × sun');
  check(lo >= 0, `never negative (min ${lo.toFixed(4)})`);
  check(hi <= 1 + SHADE.sun + SHADE.floor + 1e-9,
    `bounded above (max ${hi.toFixed(4)}) — the sun term is the only thing that may exceed the skylight`);
  check(shadeJS(-1, 0) > 0, 'and nothing is ever perfectly black — the air itself scatters');
}

console.log('the litter stays dark, which is the whole point of the curve');
{
  const litter = shadeJS(1, 0.12);      // best case: facing straight up
  const sky = shadeJS(-1, 0.90);        // worst case up top: facing straight down
  check(litter < sky,
    `even the best-lit surface on the litter (${litter.toFixed(3)}) is darker than the worst-lit one in the open air (${sky.toFixed(3)})`);
  // NOT an absolute threshold. This assertion used to read `< 0.2`, written
  // against the raw curve, and it went stale the moment the surface stopped
  // re-applying the extinction the frame already applies. The meaningful claim
  // is relative: a surface on the litter is a fraction of the same surface in
  // the open air, and the *frame's* exposure carries the rest of the gap.
  const same = shadeJS(1, 0.90);
  check(litter / same < 0.45,
    `the litter is under half as bright as the same surface up top (${(litter / same * 100).toFixed(0)}%), before the frame's exposure is applied at all`);
  check(canopyLight(CANOPY_TOP) === 1 && canopyLight(CANOPY_BASE) < 0.1,
    'and the crown layer is where the fall happens — that is what a ceiling is');
}

console.log('the sun term is weak, directional, and one-sided');
{
  check(shadeJS(0, 0.9, 1) > shadeJS(0, 0.9, 0), 'facing the sun is brighter');
  check(shadeJS(0, 0.9, 0) === shadeJS(0, 0.9, -1),
    'facing away is not *darker* than facing sideways — a light cannot subtract');
  const gain = shadeJS(1, 0.9, 1) / shadeJS(1, 0.9, 0);
  check(gain < 1.3, `and it is weak (${((gain - 1) * 100).toFixed(0)}% at most) — a rainforest interior has almost no direct sun`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
