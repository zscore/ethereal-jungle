/**
 * look.js — the renderer seam, as a pure function (fancy proposal G2).
 *
 * `perform.js` is the audio seam: bus params in, one hap value out, no
 * scheduler, no renderer, unit-testable. This is the same treatment for the
 * eye: bus params + frame env in, post-chain uniforms + fog out. No three.js
 * import, no state, no DOM — so every claim the visuals make about themselves
 * (idle is identity, each knob is perceptually monotone §9.1, the camera's
 * motion signature is continuous across biome boundaries §4.2) is an assertion
 * in `test/look.mjs` rather than a paragraph in a design doc.
 *
 * Two families of input, and the split matters:
 *   the timeline  (T, brightness, duck, wildness, fusion, seam staging) — the
 *                 authored world, sampled from the bus;
 *   the rail      (lpf/hpf/echo/crush/space, D17/D20) — the hand on the mixer,
 *                 effective this frame.
 * Both are bus params. Neither is audio. The look never analyzes a signal it
 * could have read.
 *
 * The perform twins (H1) say the same sentence the audio effect says, one
 * sense-organ over — and they say it about three different objects:
 *   filters / space move THE WORLD    (distance: defocus, fog, vignette)
 *   crush           degrades THE MEDIUM (posterize + grain — resolution loss)
 *   echo            repeats THE FRAME   (afterimage + chroma displacement)
 * which is why they read as three different jokes rather than three amounts.
 *
 * The style tiers (L, pizzaz proposal) add a fourth object: some effects
 * change WHAT KIND OF PICTURE THIS IS — ink, halftone, a kaleidoscopic fold.
 * Those are governed by one rule, `styleAt` below: **a style is spent, not
 * sprinkled.** Each is bound to a place in the set that already means
 * something (a breakdown, the far end of the crush knob, the one fusion
 * climax) so that seeing it is information. A style you can see at any moment
 * is wallpaper, and the whole §5 argument about the climax applies verbatim.
 */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const EPS = 0.01; // a dial this close to home is at rest — matches perform.js

/**
 * The two filter dials (D20), each as its own one-sided percept. They are
 * independent, so both percepts can run at once (the bandpass/telephone
 * gesture) — which the old bipolar knob could not say. Home is `lpf` wide open
 * at 1 and `hpf` wide open at 0, and each is deadbanded there so a controller
 * resting a hair off home costs the frame nothing.
 */
export function railSplit(lpf = 1, hpf = 0) {
  const l = lpf ?? 1;
  const h = hpf ?? 0;
  return {
    lp: l >= 1 - EPS ? 0 : clamp01(1 - l),
    hp: h <= EPS ? 0 : clamp01(h),
  };
}

// Tints for the two filter directions. Underwater is a deep teal — the LP
// world is *submerged*; the HP world is a pale cold nothing, a picture with
// its floor removed.
export const TINT_UNDER = [0.05, 0.17, 0.21];
export const TINT_THIN = [0.62, 0.67, 0.78];

// Focal length (world units before an object is fully out of focus) when the
// rail idles. The DoF node's circle of confusion is smoothstep(0, focal,
// |dist − focus|), so "off" means a focal length far past the world's depth
// (the world is ~90 units across): at rest the pass is a no-op to the eye.
export const FOCAL_SHARP = 1200;
export const POSTERIZE_STEPS = 64; // "off" for an 8-bit-ish frame

// ---------- the light budget: the forest as one extinction curve (DXX) ----------
// What makes a tropical rainforest one place rather than four stacked scenes is
// not that the same plants grow at every height — it is that every height is
// somewhere on ONE curve, and the curve is light. The crowns intercept nearly
// all of it: field measurements of understory PAR put the litter at ~1–2% of
// open sky, the understory proper at a few percent more. So the ascent the set
// is making is literally an ascent out of shade, and the number is known.
//
// Beer–Lambert through a leaf-area profile. Two layers: a thin understory of
// shrubs and saplings below the crowns, and the crown layer itself, whose leaf
// area is concentrated toward its top (which is why a canopy has a *sharp*
// underside and a soft top).
//
// The two altitudes are NOT chosen for looks. Altitude is `camY / WORLD_TOP`
// and `camY = 2 + b·54`, so the four tracks' authored brightness spans
// (0.10→0.30, 0.30→0.55, 0.55→0.80, 0.80→1.00 in bus.js) land at
// 0.12→0.29, 0.29→0.51, 0.51→0.73, 0.73→0.90. Putting the crowns' underside at
// 0.51 and their last leaf at 0.73 makes the seams and the layers the same
// boundaries: two tracks below the canopy, one *inside* it, one above. The
// forest's structure was already written in the timeline; this reads it out.
export const CANOPY_BASE = 0.5113;    // altitude of the crowns' underside = altOf(0.55)
export const CANOPY_TOP = 0.7290;     // …and of the last emergent leaf  = altOf(0.80)
export const FLOOR_LIGHT = 0.02;      // 2% of open-sky light reaches the litter
export const UNDERSTORY_DEPTH = 0.22; // share of the optical depth below the crowns

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * Fraction of open-sky light present at altitude a ∈ [0,1]. 1 above the
 * canopy, FLOOR_LIGHT on the litter, and the whole fall happens in the crown
 * layer — which is what a ceiling *is*.
 */
export function canopyLight(a) {
  const x = clamp01(a);
  if (x >= CANOPY_TOP) return 1;
  const depth = x <= CANOPY_BASE
    ? (1 - UNDERSTORY_DEPTH) + UNDERSTORY_DEPTH * (1 - x / CANOPY_BASE)
    : (1 - UNDERSTORY_DEPTH) * (1 - smooth((x - CANOPY_BASE) / (CANOPY_TOP - CANOPY_BASE)));
  return Math.exp(Math.log(FLOOR_LIGHT) * depth);
}

/**
 * How strongly a light shaft reads at altitude a — the visibility of the beam,
 * not its brightness. A shaft that comes down through a gap carries roughly
 * full sunlight wherever it is; what changes with height is the air *around*
 * it, so a beam is exactly as legible as its surroundings are dark. Hence the
 * one-line form: `1 − canopyLight(a)`, and zero above the last leaf, where
 * there is no longer anything overhead to shaft through.
 *
 * This is why the darkest forest on earth is the one famous for its beams of
 * light, and it is the reason the shafts belong to the understory rather than
 * to the sky they used to be keyed to.
 */
export function beamAt(a) {
  const x = clamp01(a);
  if (x >= CANOPY_TOP) return 0;
  return 1 - canopyLight(x);
}

/**
 * Where the camera looks, per level, as a world-unit offset from its own
 * altitude. Deliberately not a straight line from down to up: the eye goes to
 * what it does not have. On the litter the light is the unreachable thing, so
 * the gaze climbs toward the gaps; among the trunks it levels off and looks
 * along them; above the crowns the *ground* is what you no longer have, so it
 * tilts back down over the canopy — which is also the only way the last band
 * can read as flying over a forest rather than floating in a sky.
 */
export const BAND_PITCH = [5.0, 1.5, -1.0, -8.0];

export function pitchAt(a) {
  const n = BAND_PITCH.length;
  let p = 0;
  for (let i = 0; i < n; i++) p += tentWeight(i, a, n) * BAND_PITCH[i];
  return p;
}

/**
 * The whole post chain in one place.
 *
 * env = {
 *   T, Tf,        tension now / 2 s ahead (clairvoyance: light leads sound)
 *   b,            mode brightness == altitude
 *   duck,         the coupling constant, decaying (kick contact)
 *   w,            effective wildness
 *   fusion,       the once-per-set stream fusion window (§5)
 *   arrival,      seam 'landing' impulse, 1 → 0 over ~1 s (I2)
 *   exhale,       seam 'dissolve' openness, 0..1 (I2)
 *   focusDist,    world distance from camera to what it is looking at
 *   flash,        lightning, 0..1, decaying (K7 — weather, not meter)
 *   fusionAmt,    0..1 closeness to the fusion climax's center (L5)
 * }
 */
export function look(params = {}, env = {}) {
  const { lp, hp } = railSplit(params.lpf, params.hpf);
  const echo = params.echo ?? 0;
  const crush = params.crush ?? 0;
  const space = params.space ?? 0;

  const T = env.T ?? 0, Tf = env.Tf ?? T;
  const duck = env.duck ?? 0, w = env.w ?? 0;
  const arrival = env.arrival ?? 0, exhale = env.exhale ?? 0;
  const fusion = env.fusion ? 1 : 0;
  const flash = clamp01(env.flash ?? 0);
  const b = env.b ?? 0.5;
  // where the CAMERA is (camY / WORLD_TOP), which is not quite the mode
  // brightness — the world is 62 units tall and the camera's travel is 54 of
  // them. Everything about the forest's structure keys on this; the mode
  // brightness keeps the things that are about harmony.
  const alt = env.alt ?? b;

  // ---- artifact operators (§3.6): wildness, plus the rail's frame-level jokes
  const bloom = Math.max(0,
    (0.4 + 0.5 * Tf) * (1 - duck * 0.6)   // the kick dips the bloom (§2.1)
    + fusion * 0.15                        // the ether ignites, once per set
    + space * 0.6                          // the wash makes the world glow far
    + arrival * 0.9                        // the landing's exposure spike
    + flash * 1.6                          // lightning (K7): the sky overexposes
    - hp * 0.25);                          // HP kill: nothing left to bloom
  const smear = Math.max(0, w - 0.55) * 1.8 + echo * 0.6;   // stasis smear + dub echo
  const shift = w * w * 0.004 + echo * 0.006;
  const grain = 0.05 + 0.3 * w + crush * 0.45;

  // ---- color: the world's distance (filter) and the medium's health (crush)
  const sat = Math.max(0.1, 1 - 0.6 * lp - 0.3 * hp);
  const steps = 3 + (POSTERIZE_STEPS - 3) * Math.pow(1 - crush, 1.5);
  const tint = lp >= hp ? TINT_UNDER : TINT_THIN;
  const tintAmt = 0.5 * lp + 0.35 * hp;
  // the HP kill is a subtraction, not a wash: with the floor removed there is
  // simply less picture. (The renderer applies the tint scaled by luminance,
  // so neither filter direction can lift the blacks into fog.)
  const dim = 1 - 0.4 * hp;
  const vignette = Math.max(0, 0.18 + 0.65 * hp + 0.12 * lp - 0.5 * arrival);

  // ---- optics (G1): DRR rendered as depth of field. Focus rides the camera's
  // own look-at target; the focal length closes as the world goes away.
  const focal = FOCAL_SHARP / (1 + 90 * lp + 20 * space) * (1 + 0.8 * exhale);
  const bokeh = 1 + 2.5 * lp + 1.5 * space;
  const focus = Math.max(0.1, env.focusDist ?? 14);

  // ---- atmosphere: fog IS distance (§2). Reverb thickens it, the HP kill
  // thins it to nothing, and a dissolving seam opens it (I2).
  //
  // …and altitude now dominates all three of those, because in a rainforest it
  // does. Under the crowns the air is saturated and the sightline is metres:
  // that is what "close" means down there, and it is why the undergrowth has
  // never needed a horizon. Above them the air clears by more than an order of
  // magnitude and the frame acquires a distance for the first time — which is
  // the entire content of "flying above". `aerial` is that ratio (≈10×), and
  // it is the single number that makes the top band a different KIND of
  // picture rather than the same picture higher up. Bounded below by a real
  // sightline rather than by the physics: at the true ratio the undergrowth
  // fogs out inside 8 units and the trunks it is supposed to be full of are
  // never seen at all.
  const aerial = 0.12 + 1.05 * (1 - canopyLight(alt));
  const fogDensity = Math.max(0,
    (0.075 - 0.04 * T) * aerial * (1 + 0.6 * lp + 0.5 * space) * (1 - 0.4 * hp) * (1 - 0.5 * exhale));

  // ---- exposure: the forest floor gets almost none of the light.
  // Kept apart from `dim` (the HP kill's subtraction) so the rail's
  // idle-is-identity property survives — this is the world's own exposure, not
  // a knob's, and the renderer multiplies the two. Compressed hard (a cube
  // root of the transmittance) because a literal 2% frame is a black frame:
  // the eye adapts, and what has to survive is the *order* of the four levels,
  // not the photometry.
  const exposure = 0.45 + 0.55 * Math.pow(canopyLight(alt), 0.3);

  // ---- L1: anamorphic streak. The bloom says "bright"; the streak says
  // "bright *through a lens*", which is the entire difference between a glow
  // and a light. It rides the same envelope as the bloom (tension, the wash,
  // the arrival, the strike) so the two never disagree about what is hot, and
  // the kick dips it for the same reason it dips everything else.
  const streak = Math.max(0,
    (0.18 + 0.4 * Tf + 0.5 * space + 0.7 * arrival + 0.35 * fusion + 1.2 * flash)
    * (1 - duck * 0.5) * (1 - hp * 0.6));

  // ---- L2: god rays. Light scattering through the canopy is a thing that
  // happens where there IS a canopy and a sun — so it keys on altitude, peaks
  // in the canopy band, and is gone among the roots (nothing above to shaft
  // through) and at the zenith (nothing below to shaft onto). The one effect
  // here that is a function of *place* rather than of time.
  // (0.62 is the middle of the crown layer, CANOPY_BASE…CANOPY_TOP — it was
  // guessed here before the layer existed and turned out to be exactly it.)
  const canopyBand = Math.max(0, 1 - Math.abs(alt - 0.62) * 3.4);
  const godrays = Math.max(0, canopyBand * (0.25 + 0.5 * T) * (1 - lp * 0.7) + flash * 0.5);

  // ---- L8: heat shimmer. Refraction is the air itself becoming visible, so
  // it belongs to the two moments when the air is doing the most work: the
  // fusion climax, and the top of a tension curve.
  const shimmer = clamp01(0.55 * (env.fusionAmt ?? 0) + Math.max(0, T - 0.78) * 1.6);

  return {
    bloom, smear, shift, grain, sat, steps, tint, tintAmt, dim, vignette,
    focal, bokeh, focus, fogDensity, exposure, streak, godrays, shimmer,
  };
}

// ---------- L6: per-track colour grade ----------
// The palette lerp (biomes.js) moves the *world's* colour; this moves the
// PICTURE's — a lift/gain/gamma triple per band, which is what separates a
// scene that is lit differently from a scene that was shot differently. Same
// construction as BAND_ORBITS: constants per band, blended by a tent window
// over altitude, so it is continuous by the same argument (§4.2's motion
// signature, applied to colour) and can never cut at a boundary.
// The world's colour COOLS as you climb (BAND_COLORS in biomes.js: the air
// scatters blue and the far distance goes pale). The picture's grade does the
// opposite — it WARMS, because the light source you are climbing toward is the
// sun. Aerial perspective and sunlight are two different things and a forest
// shows you both at once; splitting them across the two modules is what lets
// the top band be a blue distance under a golden light instead of one or the
// other.
export const BAND_GRADES = [
  { lift: [0.010, 0.000, 0.030], gain: [0.92, 0.84, 1.22], gamma: 1.12 }, // undergrowth: scotopic, contrasty, crushed blacks
  { lift: [0.000, 0.012, 0.006], gain: [0.86, 1.14, 0.94], gamma: 1.02 }, // understory: the green gloom — leaves transmit green
  { lift: [0.000, 0.010, 0.006], gain: [1.02, 1.10, 0.92], gamma: 0.94 }, // canopy: sunlit foliage, open
  { lift: [0.030, 0.016, 0.000], gain: [1.18, 1.06, 0.86], gamma: 0.88 }, // open air: warm, lifted, soft
];

/** The grade at altitude a ∈ [0,1]: {lift:[3], gain:[3], gamma}. */
export function gradeAt(a) {
  const n = BAND_GRADES.length;
  const lift = [0, 0, 0], gain = [0, 0, 0];
  let gamma = 0;
  for (let i = 0; i < n; i++) {
    const w = tentWeight(i, a, n);
    if (w <= 0) continue;
    const g = BAND_GRADES[i];
    for (let k = 0; k < 3; k++) { lift[k] += w * g.lift[k]; gain[k] += w * g.gain[k]; }
    gamma += w * g.gamma;
  }
  return { lift, gain, gamma };
}

// ---------- L3/L4/L5: the style tiers ----------
// Each style is bound to a place in the set that already carries meaning, and
// is silent everywhere else. Stated as a table so that adding a fifth style
// forces the same question to be answered: *what does seeing this tell me?*
//
//   ink       breakdown sections — the one section that is already about
//             stripping the picture back to its lines (§ the arrangement's own
//             argument, borrowed by the eye)
//   halftone  the far end of the `crush` knob — crush already degrades the
//             MEDIUM; past 0.55 the medium stops being a frame buffer and
//             becomes print. Same sentence, one register louder.
//   kaleido   the fusion climax, and nowhere else, ever — spent exactly once
//             per set alongside the ether ignition (§5)
export const INK_SECTIONS = ['breakdown'];
export const HALFTONE_KNEE = 0.55; // where crush stops being a frame and becomes print

/**
 * Which style the frame is wearing, 0..1 each. `ink` is a *target* — the
 * caller smooths it, because a section boundary is a hard edge and a style
 * that snaps on is a glitch rather than a change of medium.
 */
export function styleAt(env = {}, params = {}) {
  const crush = params.crush ?? 0;
  const fusionAmt = clamp01(env.fusionAmt ?? 0);
  return {
    ink: INK_SECTIONS.includes(env.section) ? 1 : 0,
    halftone: clamp01((crush - HALFTONE_KNEE) / (1 - HALFTONE_KNEE)),
    // squared, and capped well under 1: a full fold would destroy the world
    // at the exact moment the world is the point. The climax is a glimpse of
    // symmetry, not a screensaver.
    kaleido: fusionAmt * fusionAmt * 0.55,
  };
}

// ---------- camera waypoints (I1) ----------
// One orbit per altitude band, at near-coprime rates (the Eno theorem, for the
// eye): the roots orbit tight and slow, the canopy drifts wide, the sky barely
// moves. Bands are blended by a tent window over altitude and each orbit keeps
// its OWN constant rate and phase, so the path is continuous in altitude *and*
// in time — no boundary can produce a jump, which is what keeps the motion
// signature (§4.2's strongest continuity element) intact across every seam.
//
// Retuned for the ascent (DXX). The old table shrank the top band to a radius
// of 2 — the camera hovered up there. But the last track is the one the brief
// calls *flying above*, and a camera only reads as flying if the ground moves
// underneath it; a small orbit over a distant canopy reads as hanging. So the
// widest arc in the set is now the highest one, and it is also the slowest, so
// nothing about the gesture is hurried. Below it the profile is a gait: a
// crawl among the litter (tight, quick, restless), the slowest and straightest
// pass of all through the trunks (a walk — the trunks have to have time to go
// by, or they are wallpaper), then a wider rise through the crowns.
export const BAND_ORBITS = [
  { radius: 1.2, rate: 0.037, phase: 0.0 },  // undergrowth: a crawl, tight and close
  { radius: 2.6, rate: 0.011, phase: 1.7 },  // understory:  a walk between trunks
  { radius: 5.2, rate: 0.021, phase: 3.1 },  // canopy:      the climb through the crowns
  { radius: 9.0, rate: 0.006, phase: 4.9 },  // open air:    flight — the widest arc in the set
];

/**
 * Tent weight of band i at altitude a ∈ [0,1] over n evenly-spaced bands.
 * Shared by the orbits (I1) and the grades (L6) — both are per-band constants
 * that must not be allowed to cut at a boundary, and one blend means one
 * continuity proof covers both.
 */
function tentWeight(i, a, n) {
  const x = clamp01(a) * (n - 1);
  return Math.max(0, 1 - Math.abs(x - i));
}

/**
 * Lateral camera waypoint at altitude a and set-time t. `drift` (1/f) scales
 * the amplitude only — the shape stays the biome's, the breathing stays the
 * bus's. Superimposed on the existing sway in scene.js, never replacing it.
 */
export function orbitAt(a, t, drift = 0) {
  const amp = 0.75 + 0.25 * clamp01((drift + 1) / 2);
  let x = 0, z = 0;
  for (let i = 0; i < BAND_ORBITS.length; i++) {
    const wgt = tentWeight(i, a, BAND_ORBITS.length);
    if (wgt <= 0) continue;
    const o = BAND_ORBITS[i];
    const ang = t * o.rate * Math.PI * 2 + o.phase;
    x += wgt * o.radius * Math.cos(ang) * amp;
    z += wgt * o.radius * Math.sin(ang) * amp;
  }
  return { x, z };
}

// ---------- seam staging (I2) ----------
// The bus has published each boundary's flavor since D18; this is how the eye
// spends it. 'landing' resolves the countdown onto an EVENT (exposure spike,
// vignette opens, released exactly on the boundary bar); 'dissolve' refuses the
// flash and opens the world instead — the arrival was never a moment.

// The camera's resting field of view, and how far a landing opens it (M1).
// A true dolly zoom would hold the subject exactly — pushing 4.5 units in from
// 12 needs ~85° to compensate — and that is far too much: the effect stops
// being unease and becomes a joke about vertigo. 14° is the partial version,
// where the walls of the frame move and you cannot quite say why.
export const FOV_BASE = 60;
export const FOV_DOLLY = 14;

/**
 * Field of view during a seam (M1). The push-in already moves the camera
 * forward; opening the lens *while* it moves is the one camera gesture that
 * says "the ground is going" rather than "we are arriving" — so it is spent
 * only on landings, exactly where the flash is. A dissolve decelerates and
 * opens the air instead (I2); giving it a dolly too would make the two flavors
 * say the same thing in different words.
 */
export function seamFov(seam, base = FOV_BASE) {
  if (!seamFlashes(seam)) return base;
  return base + FOV_DOLLY * seamPush(seam);
}

/** Camera push-in for the late seam window, by flavor. 0 outside the window. */
export function seamPush(seam) {
  if (!seam?.active || seam.progress <= 0.6) return 0;
  const x = (seam.progress - 0.6) / 0.4;
  return seam.variant === 'dissolve' ? x * 0.35 : x; // dissolve decelerates
}

/** Does crossing this boundary fire the arrival flash? Landings only. */
export function seamFlashes(seam) {
  return !!seam?.active && seam.variant === 'landing';
}

/** Dissolve openness across the late window: fog opens, focus widens. */
export function seamExhale(seam) {
  if (!seam?.active || seam.variant !== 'dissolve') return 0;
  const lateStart = 0.5; // the late phase is the last half of the seam window
  if (seam.progress < lateStart) return 0;
  const x = (seam.progress - lateStart) / (1 - lateStart);
  return x * x * (3 - 2 * x);
}
