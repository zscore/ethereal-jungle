/**
 * Unit test for the renderer seam (src/visuals/look.js — fancy proposal G2).
 * Same shape as test/perform.mjs: the look module is pure, so the visual
 * system's own claims about itself are checkable without a GPU.
 * Run: node test/look.mjs  (included in `npm test`)
 */
import {
  look, railSplit, orbitAt, seamPush, seamFlashes, seamExhale, seamFov,
  gradeAt, styleAt, BAND_ORBITS, BAND_GRADES, FOCAL_SHARP, POSTERIZE_STEPS,
  TINT_UNDER, TINT_THIN, INK_SECTIONS, HALFTONE_KNEE, FOV_BASE, FOV_DOLLY,
  canopyLight, beamAt, pitchAt, BAND_PITCH,
  CANOPY_BASE, CANOPY_TOP, FLOOR_LIGHT,
} from '../src/visuals/look.js';
import { PERFORM_DEFAULTS } from '../src/perform.js';
import { BAND_COLORS, WORLD_TOP, CROWN_Y0, CROWN_Y1 } from '../src/visuals/biomes.js';
import { TRACKS } from '../src/bus.js';

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
  check(railSplit(1, 0).lp === 0 && railSplit(1, 0).hp === 0, 'both dials at home are silent');
  check(railSplit(0.995, 0.005).lp === 0 && railSplit(0.995, 0.005).hp === 0,
    'and a hair off home is still inside the deadband');
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
  // two independent dials (D20): each is monotone in its own percept
  const lpSat = [1, 0.75, 0.5, 0.25, 0].map((f) => look({ ...PERFORM_DEFAULTS, lpf: f }, ENV).sat);
  check(lpSat.every((v, i) => i === 0 || v <= lpSat[i - 1] + 1e-9), 'closing the lpf only ever desaturates');
  const hpVig = [0, 0.25, 0.5, 0.75, 1].map((f) => look({ ...PERFORM_DEFAULTS, hpf: f }, ENV).vignette);
  check(hpVig.every((v, i) => i === 0 || v >= hpVig[i - 1] - 1e-9), 'raising the hpf only ever closes the vignette');
}

console.log('the twins say the same sentence as the audio (H1)');
{
  const under = look({ ...PERFORM_DEFAULTS, lpf: 0 }, ENV);
  check(under.tint === TINT_UNDER && under.tintAmt > 0.3, 'LP kill submerges the picture');
  check(under.focal < 20 && under.fogDensity > idle().fogDensity, 'LP kill defocuses and thickens the air');
  const thin = look({ ...PERFORM_DEFAULTS, hpf: 1 }, ENV);
  check(thin.tint === TINT_THIN && thin.vignette > 0.7, 'HP kill miniaturizes: cold tint, closed vignette');
  check(thin.fogDensity < idle().fogDensity, 'HP kill removes the floor — the air thins with it');
  check(thin.dim < 0.7 && look({ ...PERFORM_DEFAULTS, lpf: 0 }, ENV).dim === 1,
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

  // M1 — the dolly zoom: the lens opens while the camera pushes in, and only
  // on the flavor that resolves onto an event
  check(seamFov(landing) > FOV_BASE, 'a landing opens the lens as it pushes in');
  check(seamFov(dissolve) === FOV_BASE, 'a dissolve never dollies (it decelerates instead)');
  check(seamFov({ active: false }) === FOV_BASE, 'and nothing outside a seam touches the lens');
  check(seamFov({ active: true, progress: 0.3, variant: 'landing' }) === FOV_BASE,
    'the dolly is a late-window gesture, like the push-in it rides');
  let fovMonotone = true, fovBounded = true, prevFov = FOV_BASE;
  for (let i = 0; i <= 100; i++) {
    const f = seamFov({ active: true, progress: i / 100, variant: 'landing' });
    if (f < prevFov - 1e-9) fovMonotone = false;
    if (f > FOV_BASE + FOV_DOLLY + 1e-9) fovBounded = false;
    prevFov = f;
  }
  check(fovMonotone, 'it only ever opens across the window — the walls never come back mid-gesture');
  check(fovBounded, 'and never past its stated travel (a full vertigo compensation would be ~85°)');
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
  check(look({ ...PERFORM_DEFAULTS, lpf: 0 }, { ...ENV, b: 0.62 }).godrays < rays(0.62),
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

// ---------------------------------------------------------------------------
// D39 — the four levels are one forest, and the thing they share is the light.
// ---------------------------------------------------------------------------

/** The camera's altitude for a mode brightness b (scene.js: camY = 2 + b·54). */
const altOf = (b) => (2 + b * (WORLD_TOP - 8)) / WORLD_TOP;

console.log('the light budget is a measurement, not a mood (D39)');
{
  check(Math.abs(canopyLight(0) - FLOOR_LIGHT) < 1e-9,
    `the litter gets ${(FLOOR_LIGHT * 100).toFixed(0)}% of open-sky light — the number field studies report`);
  check(canopyLight(1) === 1 && canopyLight(CANOPY_TOP) === 1,
    'and above the last leaf there is nothing left to intercept it');

  let monotone = true, maxJump = 0, prev = canopyLight(0);
  for (let i = 1; i <= 4000; i++) {
    const v = canopyLight(i / 4000);
    if (v < prev - 1e-12) monotone = false;
    maxJump = Math.max(maxJump, Math.abs(v - prev));
    prev = v;
  }
  check(monotone, 'light only ever increases with height — no level is darker than the one below it');
  check(maxJump < 0.01, `and the curve never steps (max ${maxJump.toFixed(5)}), so no seam can flicker the exposure`);

  // the claim that makes it a CEILING rather than a gradient: nearly all of
  // the light is lost inside the crown layer, not spread over the whole climb
  const lostInCrowns = canopyLight(CANOPY_TOP) - canopyLight(CANOPY_BASE);
  const lostTotal = canopyLight(1) - canopyLight(0);
  check(lostInCrowns / lostTotal > 0.9,
    `${((lostInCrowns / lostTotal) * 100).toFixed(0)}% of the whole climb's light arrives inside the crown layer — a ceiling, not a ramp`);
  check(canopyLight(CANOPY_BASE) < 0.08,
    'the understory under it is still single-digit percent (a few percent more than the litter, and no more)');
}

console.log('the crown layer is READ OUT of the timeline, not chosen (D39)');
{
  // TRACKS[i].brightness drives camera altitude, so the set's own seams already
  // say where the storeys are. The crowns are hung on two of them: below /
  // inside / above, with two tracks under the canopy, one in it, one over it.
  const seams = TRACKS.map((tr) => altOf(tr.brightness[1]));
  check(TRACKS.length === 4, 'four tracks, four storeys');
  check(Math.abs(CANOPY_BASE - seams[1]) < 0.01,
    `the crowns' underside is the understory→canopy seam (${seams[1].toFixed(3)})`);
  check(Math.abs(CANOPY_TOP - seams[2]) < 0.01,
    `and their last leaf is the canopy→zenith seam (${seams[2].toFixed(3)})`);
  check(altOf(TRACKS[0].brightness[1]) < CANOPY_BASE && altOf(TRACKS[1].brightness[0]) < CANOPY_BASE,
    'the first two tracks play entirely under the canopy');
  check(altOf(TRACKS[3].brightness[0]) >= CANOPY_TOP - 1e-9,
    'and the last one entirely above it — the climb through the crowns is exactly one track long');
  check(Math.abs(CROWN_Y0 - CANOPY_BASE * WORLD_TOP) < 1e-9 && Math.abs(CROWN_Y1 - CANOPY_TOP * WORLD_TOP) < 1e-9,
    'the geometry and the light curve are the same two numbers, in two units');
}

console.log('every level is somewhere on that one curve');
{
  const at = (a, over = {}) => look(PERFORM_DEFAULTS, { ...ENV, alt: a, ...over });
  const floor = at(altOf(0.10)), understory = at(altOf(0.42)), crowns = at(altOf(0.68)), open = at(altOf(1.0));

  check(floor.exposure < understory.exposure && understory.exposure < crowns.exposure && crowns.exposure < open.exposure,
    'exposure orders the four levels, in the order you climb them');
  check(open.exposure / floor.exposure > 1.4, 'and the open air is materially brighter than the litter, not nominally');
  check(open.exposure === 1, 'above the canopy the world is at full exposure — the climb has an end');

  check(floor.fogDensity > open.fogDensity * 8,
    `the air under the crowns is ${(floor.fogDensity / open.fogDensity).toFixed(1)}× thicker than the air over them`);
  let fogMonotone = true, prevFog = at(0).fogDensity;
  for (let i = 1; i <= 2000; i++) {
    const v = at(i / 2000).fogDensity;
    if (v > prevFog + 1e-12) fogMonotone = false;
    prevFog = v;
  }
  check(fogMonotone, 'and it only ever clears as you climb — no band is hazier than the one below it');
  check(look(PERFORM_DEFAULTS, { ...ENV, b: 0.5 }).fogDensity === look(PERFORM_DEFAULTS, { ...ENV, alt: 0.5 }).fogDensity,
    'altitude defaults to the mode brightness when the caller has no camera to report');

  // the shafts: as legible as the air around them is dark, and impossible above
  check(beamAt(0) > beamAt(0.6) && beamAt(0.6) > beamAt(CANOPY_TOP - 0.01),
    'a light shaft reads hardest where the forest is darkest');
  check(beamAt(CANOPY_TOP) === 0 && beamAt(1) === 0,
    'and not at all above the last leaf — there is nothing up there for it to be a hole in');
  let beamJump = 0, prevBeam = beamAt(0);
  for (let i = 1; i <= 4000; i++) { const v = beamAt(i / 4000); beamJump = Math.max(beamJump, Math.abs(v - prevBeam)); prevBeam = v; }
  check(beamJump < 0.01, 'the shafts fade rather than switching off at the roofline');
}

console.log('the camera climbs like a body, not like a lift (D39)');
{
  check(pitchAt(0) > 0, 'from the litter the gaze goes UP, toward the light it does not have');
  check(pitchAt(1) < 0, 'and from over the crowns it goes DOWN, over the forest it just left');
  check(Math.abs(pitchAt(1)) > Math.abs(pitchAt(0)),
    'the look down from above is the bigger gesture — it is the payoff of the whole climb');
  let pitchMonotone = true, maxPitchJump = 0, prev = pitchAt(0);
  for (let i = 1; i <= 2000; i++) {
    const v = pitchAt(i / 2000);
    if (v > prev + 1e-9) pitchMonotone = false;
    maxPitchJump = Math.max(maxPitchJump, Math.abs(v - prev));
    prev = v;
  }
  check(pitchMonotone, 'the gaze only ever tips one way across the set — it never nods');
  check(maxPitchJump < 0.02, `and never jumps (max ${maxPitchJump.toFixed(4)} world units) — no seam can snap the horizon`);
  check(pitchAt(0) === BAND_PITCH[0] && pitchAt(1) === BAND_PITCH[3], 'the endpoints are the authored constants');

  // flight: a camera only reads as flying if the ground moves under it
  const r = BAND_ORBITS.map((o) => o.radius);
  check(r[3] === Math.max(...r), 'the widest arc in the set belongs to the band that is flying');
  check(BAND_ORBITS[3].rate === Math.min(...BAND_ORBITS.map((o) => o.rate)),
    '…and the slowest, so the width reads as distance rather than as haste');
  check(r[1] < r[2] && BAND_ORBITS[1].rate < BAND_ORBITS[0].rate,
    'the understory is the slowest pass of all — the trunks need time to go by, or they are wallpaper');
}

console.log('the air brightens and blues as you climb; the LIGHT warms (D39)');
{
  // two different physical facts, deliberately split across two modules: the
  // WORLD's colour is aerial perspective (biomes.js BAND_COLORS), the PICTURE's
  // grade is the sun (look.js BAND_GRADES). A forest shows you both at once.
  const lum = BAND_COLORS.map((c) => c.r + c.g + c.b);
  check(lum.every((v, i) => i === 0 || v > lum[i - 1]),
    'the air itself is brighter at every level — the palette IS the extinction curve, drawn in colour');
  const blueness = BAND_COLORS.map((c) => c.b - c.r);
  const greenness = BAND_COLORS.map((c) => c.g - (c.r + c.b) / 2);
  check(blueness[3] === Math.max(...blueness) && blueness[3] > blueness[2] + 0.2,
    'the open air is the blue one, and by a margin — nothing else in the frame is, so it reads as distance');
  check(greenness[1] > 0 && greenness[2] > 0 && greenness[1] > greenness[0] && greenness[2] > greenness[3],
    'and the two levels under the crowns are the green ones: light that has been through a leaf comes out green');
  const grades = BAND_GRADES.map((g) => g.gain[0] - g.gain[2]);
  check(grades[3] === Math.max(...grades) && grades[0] === Math.min(...grades),
    'while the grade walks the other way, coolest at the bottom and warmest under the open sky');
  check(BAND_GRADES[1].gain[1] === Math.max(...BAND_GRADES.map((g) => g.gain[1])) ||
        BAND_GRADES[1].gain[1] >= BAND_GRADES[0].gain[1] + 0.2,
    'and the understory is the green one — leaves absorb red and blue and pass green, which is what a gloom is');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
