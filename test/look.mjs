/**
 * Unit test for the renderer seam (src/visuals/look.js — fancy proposal G2).
 * Same shape as test/perform.mjs: the look module is pure, so the visual
 * system's own claims about itself are checkable without a GPU.
 * Run: node test/look.mjs  (included in `npm test`)
 */
import {
  look, railSplit, orbitAt, seamPush, seamFlashes, seamExhale,
  gradeAt, styleAt, BAND_ORBITS, BAND_GRADES, FOCAL_SHARP, POSTERIZE_STEPS,
  TINT_UNDER, TINT_THIN, INK_SECTIONS, HALFTONE_KNEE,
} from '../src/visuals/look.js';
import { PERFORM_DEFAULTS } from '../src/perform.js';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const ENV = { T: 0.5, Tf: 0.5, b: 0.5, duck: 0, w: 0, focusDist: 14 };
const idle = () => look(PERFORM_DEFAULTS, ENV);

/** Is f monotone (non-strict, in `dir`) over the knob sweep 0…1? */
function monotone(key, pick, dir, env = ENV) {
  let prev = pick(look({ ...PERFORM_DEFAULTS, [key]: 0 }, env));
  for (let i = 1; i <= 20; i++) {
    const v = pick(look({ ...PERFORM_DEFAULTS, [key]: i / 20 }, env));
    if ((v - prev) * dir < -1e-9) return false;
    prev = v;
  }
  return true;
}

console.log('the rail at rest is the frame we already had');
{
  const L = idle();
  check(L.sat === 1, 'no desaturation');
  check(L.tintAmt === 0, 'no tint');
  check(L.steps === POSTERIZE_STEPS, 'posterize is off');
  check(L.focal === FOCAL_SHARP, 'depth of field is a no-op (focal past the world)');
  check(L.bokeh === 1, 'bokeh at unity');
  check(Math.abs(L.smear) < 1e-9 && Math.abs(L.shift) < 1e-9, 'artifact ops silent at w=0');
  check(L.vignette > 0 && L.vignette < 0.25, 'a base vignette only');
  check(L.dim === 1, 'full exposure');
  check(railSplit(0.5).lp === 0 && railSplit(64 / 127).hp === 0, 'MIDI center is inside the neutral band');
}

console.log('perceptual monotonicity (§9.1: one knob, one nameable percept)');
{
  check(monotone('space', (L) => L.bloom, +1), 'space only ever adds glow');
  check(monotone('space', (L) => L.fogDensity, +1), 'space only ever adds distance');
  check(monotone('space', (L) => L.bokeh, +1), 'space only ever softens the far world');
  check(monotone('crush', (L) => L.steps, -1), 'crush only ever removes color resolution');
  check(monotone('crush', (L) => L.grain, +1), 'crush only ever adds grain');
  check(monotone('echo', (L) => L.smear, +1), 'echo only ever adds afterimage');
  check(monotone('echo', (L) => L.shift, +1), 'echo only ever adds chroma displacement');
  // the filter is bipolar: each half is monotone in its own percept
  const lpSat = [0.5, 0.375, 0.25, 0.125, 0].map((f) => look({ ...PERFORM_DEFAULTS, filter: f }, ENV).sat);
  check(lpSat.every((v, i) => i === 0 || v <= lpSat[i - 1] + 1e-9), 'diving the filter only ever desaturates');
  const hpVig = [0.5, 0.625, 0.75, 0.875, 1].map((f) => look({ ...PERFORM_DEFAULTS, filter: f }, ENV).vignette);
  check(hpVig.every((v, i) => i === 0 || v >= hpVig[i - 1] - 1e-9), 'raising the filter only ever closes the vignette');
}

console.log('the twins say the same sentence as the audio (H1)');
{
  const under = look({ ...PERFORM_DEFAULTS, filter: 0 }, ENV);
  check(under.tint === TINT_UNDER && under.tintAmt > 0.3, 'LP kill submerges the picture');
  check(under.focal < 20 && under.fogDensity > idle().fogDensity, 'LP kill defocuses and thickens the air');
  const thin = look({ ...PERFORM_DEFAULTS, filter: 1 }, ENV);
  check(thin.tint === TINT_THIN && thin.vignette > 0.7, 'HP kill miniaturizes: cold tint, closed vignette');
  check(thin.fogDensity < idle().fogDensity, 'HP kill removes the floor — the air thins with it');
  check(thin.dim < 0.7 && look({ ...PERFORM_DEFAULTS, filter: 0 }, ENV).dim === 1,
    'HP kill subtracts picture; LP kill submerges it without subtracting');
  check(look({ ...PERFORM_DEFAULTS, crush: 1 }, ENV).dim === 1, 'crush never touches exposure');
  check(thin.focal > 200, 'HP kill never defocuses (that is the LP percept)');
  const crushed = look({ ...PERFORM_DEFAULTS, crush: 1 }, ENV);
  check(crushed.steps <= 3.001 && crushed.focal === FOCAL_SHARP,
    'crush degrades the medium and leaves the world where it stands');
  const echoed = look({ ...PERFORM_DEFAULTS, echo: 1 }, ENV);
  check(echoed.smear > 0.5 && echoed.fogDensity === idle().fogDensity,
    'echo repeats the frame and moves nothing in the world');
}

console.log('the timeline still owns the frame');
{
  const hot = look(PERFORM_DEFAULTS, { ...ENV, Tf: 1 });
  check(hot.bloom > idle().bloom, 'tension ahead raises the bloom (clairvoyance)');
  const ducked = look(PERFORM_DEFAULTS, { ...ENV, duck: 1 });
  check(ducked.bloom < idle().bloom, 'the kick dips the bloom — the coupling constant, rendered');
  check(look(PERFORM_DEFAULTS, { ...ENV, fusion: true }).bloom > idle().bloom, 'fusion ignites');
  const wild = look(PERFORM_DEFAULTS, { ...ENV, w: 1 });
  check(wild.smear > 0 && wild.shift > 0 && wild.grain > idle().grain, 'w drives the artifact operators');
  check(look(PERFORM_DEFAULTS, { ...ENV, w: 0.5 }).smear === 0, 'smear exists only in high-w stasis (§5)');
  check(look(PERFORM_DEFAULTS, { ...ENV, T: 1 }).fogDensity < look(PERFORM_DEFAULTS, { ...ENV, T: 0 }).fogDensity,
    'tension clears the air');
  check(look(PERFORM_DEFAULTS, { ...ENV, focusDist: 31 }).focus === 31, 'focus rides the camera look-at distance');
}

console.log('seam staging by flavor (I2, off D18)');
{
  const landing = { active: true, progress: 0.9, variant: 'landing' };
  const dissolve = { active: true, progress: 0.9, variant: 'dissolve' };
  check(seamPush(landing) > seamPush(dissolve), 'the landing pushes in harder than the dissolve');
  check(seamPush({ active: true, progress: 0.3, variant: 'landing' }) === 0, 'no push before the late window');
  check(seamPush({ active: false }) === 0, 'no push outside a seam');
  check(seamFlashes(landing) && !seamFlashes(dissolve), 'only landings flash on the boundary');
  check(seamExhale(dissolve) > 0.85 && seamExhale(landing) === 0, 'only dissolves exhale');
  check(seamExhale({ ...dissolve, progress: 0.99 }) > seamExhale(dissolve), 'and the exhale deepens toward the boundary');
  check(seamExhale({ active: true, progress: 0.4, variant: 'dissolve' }) === 0, 'the exhale is a late-window event');
  const arrived = look(PERFORM_DEFAULTS, { ...ENV, arrival: 1 });
  check(arrived.bloom > idle().bloom && arrived.vignette < idle().vignette, 'the arrival spikes exposure and opens the frame');
  const exhaled = look(PERFORM_DEFAULTS, { ...ENV, exhale: 1 });
  check(exhaled.fogDensity < idle().fogDensity && exhaled.focal > idle().focal, 'the dissolve opens the air and the focus');
}

console.log('camera waypoints stay continuous (I1 / §4.2)');
{
  const t = 137.5;
  let maxJump = 0, prev = orbitAt(0, t, 0);
  for (let i = 1; i <= 2000; i++) {
    const p = orbitAt(i / 2000, t, 0);
    maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.z - prev.z));
    prev = p;
  }
  check(maxJump < 0.02, `no altitude produces a jump (max step ${maxJump.toFixed(4)} world units)`);

  let maxTimeJump = 0;
  prev = orbitAt(0.42, 0, 0);
  for (let i = 1; i <= 4000; i++) {
    const p = orbitAt(0.42, i * 0.05, 0);
    maxTimeJump = Math.max(maxTimeJump, Math.hypot(p.x - prev.x, p.z - prev.z));
    prev = p;
  }
  check(maxTimeJump < 0.1, 'and no instant produces one either (constant per-band rates)');

  const rMax = Math.max(...BAND_ORBITS.map((o) => o.radius));
  let bounded = true, moves = 0;
  for (let i = 0; i < 500; i++) {
    const p = orbitAt((i % 11) / 10, i * 3.7, Math.sin(i));
    if (Math.hypot(p.x, p.z) > rMax + 1e-9) bounded = false;
    if (i && Math.hypot(p.x, p.z) > 0.05) moves++;
  }
  check(bounded, 'the orbit never leaves its band radius');
  check(moves > 400, 'and it actually moves (a waypoint, not a constant)');
  check(orbitAt(0.5, 100, 1).x !== orbitAt(0.5, 100, -1).x, 'drift scales the amplitude (1/f breathing)');
}

console.log('lightning is weather, and it reaches the frame (K7)');
{
  const struck = look(PERFORM_DEFAULTS, { ...ENV, flash: 1 });
  check(struck.bloom > idle().bloom * 2, 'a strike overexposes the frame');
  check(struck.streak > idle().streak, 'and blows the lens out with it');
  check(look(PERFORM_DEFAULTS, { ...ENV, flash: 0 }).bloom === idle().bloom,
    'no strike, no difference — the effect is entirely in the envelope');
  // crush degrades the MEDIUM; a lens streak is the world's light, so the two
  // must not touch (the H1 division of labour, extended to the new operators)
  const lit = { ...ENV, flash: 0.5 };
  check(look({ ...PERFORM_DEFAULTS, crush: 1 }, lit).streak === look(PERFORM_DEFAULTS, lit).streak,
    'crush leaves the streak exactly where it stands');
}

console.log('the always-on optics (L1/L2/L8) key on the things they claim to');
{
  check(monotone('space', (L) => L.streak, +1), 'the wash lengthens the streak (it is the same light, further away)');
  check(look(PERFORM_DEFAULTS, { ...ENV, duck: 1 }).streak < idle().streak,
    'and the kick dips it, like everything else the coupling constant touches');
  check(look(PERFORM_DEFAULTS, { ...ENV, Tf: 1 }).streak > look(PERFORM_DEFAULTS, { ...ENV, Tf: 0 }).streak,
    'tension ahead raises it — the streak agrees with the bloom about what is hot');

  // god rays are a function of PLACE: they peak in the canopy and die at both ends
  const rays = (b) => look(PERFORM_DEFAULTS, { ...ENV, b }).godrays;
  check(rays(0.62) > rays(0.3) && rays(0.62) > rays(0.95), 'god rays peak in the canopy band');
  check(rays(0.05) === 0, 'and are absent among the roots — nothing above to shaft through');
  check(rays(1) === 0, '…and at the zenith — nothing below to shaft onto');
  let raysContinuous = true;
  let prev = rays(0);
  for (let i = 1; i <= 2000; i++) {
    const v = rays(i / 2000);
    if (Math.abs(v - prev) > 0.01) raysContinuous = false;
    prev = v;
  }
  check(raysContinuous, 'and no altitude produces a jump in them');
  check(look({ ...PERFORM_DEFAULTS, filter: 0 }, { ...ENV, b: 0.62 }).godrays < rays(0.62),
    'an LP kill puts the world behind a wall, and the shafts with it');

  check(look(PERFORM_DEFAULTS, { ...ENV, fusionAmt: 1 }).shimmer > 0.5, 'the climax refracts');
  check(look(PERFORM_DEFAULTS, { ...ENV, T: 0.5 }).shimmer === 0, 'ordinary tension does not');
  check(look(PERFORM_DEFAULTS, { ...ENV, T: 1 }).shimmer > 0, 'the top of a curve does');
}

console.log('the grade is continuous across altitude (L6, §4.2 applied to colour)');
{
  let maxJump = 0;
  let prev = gradeAt(0);
  for (let i = 1; i <= 2000; i++) {
    const g = gradeAt(i / 2000);
    let d = Math.abs(g.gamma - prev.gamma);
    for (let k = 0; k < 3; k++) d += Math.abs(g.gain[k] - prev.gain[k]) + Math.abs(g.lift[k] - prev.lift[k]);
    maxJump = Math.max(maxJump, d);
    prev = g;
  }
  check(maxJump < 0.01, `no boundary can cut the grade (max step ${maxJump.toFixed(5)})`);

  const roots = gradeAt(0), sky = gradeAt(1);
  check(roots.gain[2] > roots.gain[0] && sky.gain[0] > sky.gain[2],
    'the roots grade cool-violet and the sky grades warm — opposite ends of one axis');
  check(roots.gamma > sky.gamma, 'and the roots are the contrastier end (crushed blacks, phrygian)');
  check(gradeAt(0).gain.every((v, i) => Math.abs(v - BAND_GRADES[0].gain[i]) < 1e-9),
    'the endpoints are the authored constants, not a blend of them');
  let lifted = true;
  for (let i = 0; i <= 100; i++) {
    const g = gradeAt(i / 100);
    if (g.lift.some((v) => v < 0) || g.gain.some((v) => v <= 0) || g.gamma <= 0) lifted = false;
  }
  check(lifted, 'and no altitude produces a negative lift or a zero gain (which would be a black frame)');
}

console.log('a style is SPENT, not sprinkled (L3/L4/L5)');
{
  const groove = styleAt({ section: 'groove' }, PERFORM_DEFAULTS);
  check(groove.ink === 0 && groove.halftone === 0 && groove.kaleido === 0,
    'the ordinary frame wears no style at all');
  for (const s of INK_SECTIONS) check(styleAt({ section: s }, PERFORM_DEFAULTS).ink === 1, `${s} is an ink section`);
  for (const s of ['intro', 'build', 'groove', 'build2', 'peak', 'release', 'seam']) {
    check(styleAt({ section: s }, PERFORM_DEFAULTS).ink === 0, `${s} is not`);
  }

  check(styleAt({}, { crush: HALFTONE_KNEE }).halftone === 0, 'the halftone is silent up to the knee');
  check(styleAt({}, { crush: 1 }).halftone === 1, 'and complete at the top of the knob');
  let halftoneMonotone = true;
  let prevH = 0;
  for (let i = 0; i <= 40; i++) {
    const v = styleAt({}, { crush: i / 40 }).halftone;
    if (v < prevH - 1e-9) halftoneMonotone = false;
    prevH = v;
  }
  check(halftoneMonotone, 'and it only ever increases — the medium never heals (§9.1)');

  check(styleAt({ fusionAmt: 0 }, PERFORM_DEFAULTS).kaleido === 0, 'no fold outside the fusion window');
  check(styleAt({ fusionAmt: 1 }, PERFORM_DEFAULTS).kaleido < 0.6,
    'and never a full fold — the climax is a glimpse of symmetry, not a screensaver');
  check(styleAt({ fusionAmt: 0.5 }, PERFORM_DEFAULTS).kaleido < styleAt({ fusionAmt: 1 }, PERFORM_DEFAULTS).kaleido / 2,
    'the fold closes in faster than it opens (squared), so its centre is the event');
  // the styles must be mutually exclusive in practice: nothing in the set puts
  // an ink section inside the fusion window, or the frame would wear two media
  check(styleAt({ section: 'breakdown', fusionAmt: 1 }, { crush: 1 }).ink === 1,
    'they are independent by construction — the exclusion is the set list, not the code');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
