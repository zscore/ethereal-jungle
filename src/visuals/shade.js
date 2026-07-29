/**
 * shade.js — the extinction curve, evaluated per pixel (materials proposal, Z1).
 *
 * ---------------------------------------------------------------------------
 * THE RULE, first, because it is what keeps this file small:
 *
 *   A material is a candidate for shading only if it WRITES DEPTH and is NOT
 *   additively blended.
 *
 * Everything else in this world — fireflies, motes, dust, blooms, leaves, mist,
 * shafts, rain, the pool and its ripples, the mycelial net, the clouds, the
 * cirrus, the virga, and both figure streams — is emissive by construction. Its
 * glow is not an approximation of a lit surface; it *is* the object. Shading it
 * would not improve it, it would delete it. Of 23 materials in this world, five
 * families qualify: trunks, crowns, sloths, frogs, birds.
 *
 * Two consequences worth stating with the rule. **The figure stream must stay
 * unlit, always** — §2.1's whole argument is that the figure is sharp, near and
 * clinical while the ground is soft and atmospheric, which is also why it
 * escapes the depth of field; a lit drum hit has joined the ether. And **the air
 * sphere is the environment, not a surface** — it is what the light is made of.
 * ---------------------------------------------------------------------------
 *
 * What this module is for. `look.js` already contains a real lighting model:
 * `canopyLight(a)` is Beer–Lambert extinction through a two-layer leaf profile,
 * calibrated to field measurements of understory PAR. It was producing exactly
 * **one number per object per frame**, so the light was correct and no surface
 * was lit: a sphere rendered as a filled circle, a 40-unit trunk had one
 * brightness from base to crown, and the entire canopy chose between two colours
 * according to where the CAMERA was.
 *
 * So this is not a new lighting model and it must never become one. It is the
 * same curve, sampled at the surface instead of at the object, with a normal.
 * D39's "the world is lit analytically instead, and that is a decision rather
 * than an omission" survives intact — there are still no lights in this scene,
 * no shadow maps, and no environment maps. `MeshBasicNodeMaterial` keeps the
 * unlit pipeline and lets the colour be a node graph; that is the whole trick.
 *
 * Why hemispherical rather than a sun lambert: under a canopy the light is not
 * directional. It is diffuse skylight arriving through gaps, from a hemisphere
 * overhead. `n·up` remapped is both the correct model and the cheaper one, and
 * it is the single term that makes a crown lit on top and dark underneath.
 *
 * Purity, same as `look.js`, `weather.js` and `fauna.js`: `shadeJS` below is a
 * line-for-line transcription of the node graph, so `test/shade.mjs` can assert
 * the claims — that the four bands keep their order at every normal, that the
 * result is bounded, that it is monotone in altitude — without a GPU.
 *
 * **If you edit the node graph, edit `shadeJS` to match.** They are adjacent on
 * purpose and the test compares the transcription against `look.js`'s own curve.
 */
import {
  float, mix, step, smoothstep, clamp, exp, max, dot, vec3,
  positionWorld, normalWorld, faceDirection, cameraPosition, materialColor, uniform,
} from 'three/tsl';
import { canopyLight, CANOPY_BASE, CANOPY_TOP, FLOOR_LIGHT, UNDERSTORY_DEPTH } from './look.js';

/**
 * The weights. `ambient + hemi` is deliberately 1.0 so that a surface facing
 * straight up receives exactly `canopyLight` and nothing is invented: the
 * brightest any surface can be is the light that is actually there. `sun` is
 * small because a rainforest interior genuinely has almost no direct sun — it
 * exists so the top of the world gets a lit side and so a lightning strike
 * briefly rakes the forest from the bearing it came from (D44).
 */
/**
 * How many world units of height difference it takes for a billboard to go from
 * "seen from underneath" to "seen from above". Soft, because the camera climbs
 * through the crown layer over ~20 seconds and a hard edge would pop each crown
 * as it passed; wide enough that a crown 8 units above the lens still reads as
 * a ceiling.
 */
export const BILLBOARD_FEATHER = 8;

export const SHADE = {
  ambient: 0.38,   // skylight from the whole dome
  hemi: 0.62,      // …and how much of it depends on facing up
  sun: 0.22,       // the weak directional term
  floor: 0.08,     // nothing is ever perfectly black; the air itself scatters
  // THE IMPORTANT ONE. The surface must NOT re-apply the full extinction,
  // because the frame already applies it: `look.js` sets
  //   exposure = 0.45 + 0.55 · canopyLight(alt)^0.3
  // and multiplies the whole picture by it, with a comment explaining that a
  // literal 2% frame is a black frame and what has to survive is the ORDER of
  // the four levels rather than the photometry.
  //
  // So the band-to-band level difference is already carried, globally, once.
  // A surface that multiplied by raw `canopyLight` on top of that would
  // double-count the canopy — the understory came out about thirty times too
  // dark in the arithmetic, which is a black screen with some trees in it.
  //
  // The surface's job is FORM, not level: the gradient up a trunk, the
  // difference between a crown's top and its underside. `gamma` compresses the
  // curve to roughly the contrast the old hand-tuned trunk tint had
  // (~3.8× across the world, which times the frame's own ~1.6× lands where the
  // forest already was). Monotone, so AC2's band order is untouched.
  gamma: 0.33,
};

// ---------- the curve, as a node ----------
// A branchless transcription of `canopyLight`. The branch in the original
// (`if (x >= CANOPY_TOP) return 1`) falls out for free: at CANOPY_TOP the
// smoothstep is 1, so `depth` is 0 and exp(0) = 1, and above it the smoothstep
// clamps, so it stays 1.
function skyNode(alt, gamma) {
  const U = UNDERSTORY_DEPTH;
  const below = float(1 - U).add(float(U).mul(float(1).sub(alt.div(CANOPY_BASE))));
  const above = float(1 - U).mul(
    float(1).sub(smoothstep(0, 1, alt.sub(CANOPY_BASE).div(CANOPY_TOP - CANOPY_BASE))));
  const depth = mix(below, above, step(CANOPY_BASE, alt));
  // exp(log(F)·depth·gamma) === canopyLight(alt)^gamma, one exp instead of two
  return exp(depth.mul(Math.log(FLOOR_LIGHT) * gamma));
}

/**
 * The shading colour node for a solid surface.
 *
 * @param {object} opts
 *   worldTop      world height the altitude is normalised by
 *   doubleSided   flip the normal by face direction. **Required for the crowns**
 *                 and for anything else DoubleSide: without it every underside
 *                 is shaded as though it were a top, which is precisely the
 *                 error this module exists to fix, applied upside down.
 *   sunDir        a vec3 uniform (unit, pointing TOWARD the light), or null
 *   weights       overrides for SHADE
 *
 * Note what is NOT here: any colour. This returns a monochrome light AMOUNT.
 *
 * Use `shadedColor()` below rather than wiring this into `colorNode` directly.
 * three's `setupDiffuseColor` reads
 *   colorNode = this.colorNode ?? materialColor
 * so a `colorNode` **replaces** `material.color` — it does not multiply with it.
 * (Vertex and instance colours *are* applied on top, which is what misled the
 * first version of this file.) Wiring the raw light amount in therefore renders
 * every shaded surface as white × light, and the entire forest came back as a
 * stand of glowing white sticks — the exact failure D39's trunk comment warns
 * about, reintroduced from the other direction.
 *
 * Tinting the skylight by the sky's own colour is deliberately NOT done here.
 * The world's colour already walks with altitude (`BAND_COLORS`) and the
 * picture's grade walks the other way (`BAND_GRADES`, L6) — those two were
 * built to disagree, and a third colour walk in the shading would flatten the
 * difference. It is the open decision in the proposal; leave it open.
 */
export function shadeNode(opts = {}) {
  const {
    worldTop = 62, doubleSided = false, billboard = false,
    sunDir = null, sunAmt = null, weights = {},
  } = opts;
  const w = { ...SHADE, ...weights };

  const alt = clamp(positionWorld.y.div(worldTop), 0, 1);
  const sky = skyNode(alt, w.gamma);
  const n = doubleSided ? normalWorld.mul(faceDirection) : normalWorld;

  // `hemi` is n·up remapped — except for billboards, which have no surface
  // normal to speak of. A crown card is rotated to face the camera every frame,
  // so its geometric normal says "toward the lens" and nothing about which side
  // of a leaf you are looking at; relying on face winding to recover that was
  // tried first and came back with lit undersides, because which face is front
  // depends on how the billboard was built.
  //
  // What IS meaningful for a canopy card is unambiguous and needs no normal at
  // all: are you above this crown or under it? That is the whole question, and
  // answering it per crown instead of once for the entire canopy — which is
  // what the old camera-height lerp did — is the point of AA1. Inside the crown
  // layer the crowns below the camera are lit and the ones above it are dark,
  // in the same frame, which the old model could not express at all.
  const hemi = billboard
    ? smoothstep(-BILLBOARD_FEATHER, BILLBOARD_FEATHER, cameraPosition.y.sub(positionWorld.y))
    : n.y.mul(0.5).add(0.5);
  let light = float(w.ambient).add(float(w.hemi).mul(hemi));
  // AC3 — the governor's lever. The materials are built once at construction,
  // so shedding this tier cannot mean swapping materials: rebuilding every
  // pipeline mid-frame to save fragment work is a trade that loses. What it CAN
  // mean is degrading the model — `sunAmt` is a uniform the governor drives to
  // zero, which drops the directional term and leaves the hemisphere one, and
  // that is the expensive half. A full drop to flat materials stays a boot-time
  // choice (`?mat=0`), which is what the A/B needs it for anyway.
  if (sunDir && !billboard) {
    const amt = sunAmt ? sunAmt.mul(w.sun) : float(w.sun);
    light = light.add(max(dot(n, sunDir), 0).mul(amt));
  }

  return vec3(sky.mul(light).add(w.floor));
}

/**
 * The node to actually assign to `material.colorNode`: the material's own
 * colour, lit. Keeping `material.color` live matters — several callers write it
 * every frame (the trunks take their hue from the palette walk, the creatures
 * fade with their band), and those writes have to keep reaching the frame.
 */
export function shadedColor(opts = {}) {
  return materialColor.mul(shadeNode(opts));
}

/** A vec3 uniform for the sun direction, so the caller can move it per frame. */
export function sunUniform() {
  return uniform(vec3(0, 1, 0));
}

/** A scalar uniform, for the governor's lever (AC3). */
export function uniformScalar(v = 1) {
  return uniform(float(v));
}

// ---------- the plain-JS mirror ----------
/**
 * The same maths, for `test/shade.mjs`. Line-for-line with `shadeNode` above.
 *
 * @param {number} normalY  the surface normal's world y, −1..1
 * @param {number} alt      the surface's altitude, 0..1
 * @param {number} sunDot   max(0, n·l), or 0
 */
export function shadeJS(normalY, alt, sunDot = 0, weights = {}) {
  const w = { ...SHADE, ...weights };
  const a = alt < 0 ? 0 : alt > 1 ? 1 : alt;
  // `canopyLight` itself rather than a transcription: the curve has exactly one
  // definition and this module is not allowed to become a second one.
  const sky = Math.pow(canopyLight(a), w.gamma);
  const hemi = normalY * 0.5 + 0.5;
  const light = w.ambient + w.hemi * hemi + Math.max(0, sunDot) * w.sun;
  return sky * light + w.floor;
}

/**
 * The billboard variant's `hemi`, for the same reason: `test/shade.mjs` asserts
 * that a crown seen from below is darker than the same crown seen from above,
 * which is the claim AA1 is entirely about.
 */
export function billboardHemi(camY, surfaceY) {
  const x = (camY - surfaceY + BILLBOARD_FEATHER) / (2 * BILLBOARD_FEATHER);
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}
