/**
 * creatures.js — the animals, as meshes (proposal IV, tier U).
 *
 * The logic lives in `fauna.js`, which is pure and tested; this file builds
 * geometry and moves values, exactly the way `biomes.js` relates to `look.js`.
 * Every system here keeps the biome contract — `{ name, group, update(dt, env) }`
 * — so `buildWorld` composes them with everything else.
 *
 * Read fauna.js's U1 note before adding a creature. The short version: an
 * animal is the first thing in this world that wants to be continuous like
 * weather AND discrete when it moves, so it is the first thing that can break
 * §2.1's rule that the ground stream carries no rhythm. Three tiers of
 * behaviour, at most one of them anchored to a bus event, per creature.
 *
 * **Silhouette first.** This world is soft, additive and near-abstract — glow
 * clouds, cards, instanced spheres — and D28/D42 removed the recurring glyph
 * twice for looking wrong in it. So no creature here is modelled: they are
 * shapes read against the light, dark where the light is behind them, and what
 * makes them legible is how they MOVE rather than how they are built. A sloth
 * that reads as a sack is a sloth that needs a slower reach, not more polygons.
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, vec3, mix, sin, max, uniform, positionLocal } from 'three/tsl';
import { shadedColor } from './shade.js';
import { pitchAt } from './look.js';
import {
  populationFor, slothCrawl, wingbeat, throatPulse, slotEvent, flushEnv,
  glint, branchTaper, SLOTH_TOP_FRAC,
} from './fauna.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const UP = new THREE.Vector3(0, 1, 0);
const NO_WIND = { x: 0, y: 0, z: 0, gust: 0, amp: 0 };
const windAtOr = (env, x, y, z) => (env.wind ? env.wind(x, y, z) : NO_WIND);
const SOAR_SCALE = new THREE.Vector3(2.6, 2.6, 2.6);

/**
 * Where the camera stands, in plan — `scene.js` puts it at (0, camY, 12) and
 * lets a small lateral orbit wander it. Every creature small enough to be eaten
 * by the fog has to be placed against this rather than against the origin, so
 * it is one constant instead of three.
 */
const CAM_XZ = { x: 0, z: 12 };


/**
 * A solid-creature material (AA2).
 *
 * Every animal here is opaque-ish and normal-blended, which by `shade.js`'s rule
 * makes it a shading candidate — so they all go through one factory. The fade
 * in and out of a band still rides `opacity`, which is why they stay
 * `transparent` with `depthWrite: false`: a creature that popped the depth
 * buffer as it faded would punch a hole in the additive world behind it.
 *
 * This replaces `shadeGeometry()`, which baked a fake lambert into vertex
 * colours because an unlit sphere renders as a filled circle. That was a
 * workaround for the missing surface response and it is exactly what this tier
 * was for; the geometry is plain again.
 */
function makeCreatureMat(props, shadeOpts = {}, detail = null) {
  const m = new MeshBasicNodeMaterial({
    transparent: true, opacity: 0, depthWrite: false, ...props,
  });
  const lit = shadedColor({ worldTop: 62, ...shadeOpts });
  // `detail` multiplies the LIT colour rather than replacing it, and it is
  // written to average 1 — so a surface with a texture on it still sits at the
  // level the shading tuned it to. That matters more here than it looks: every
  // creature base colour in this file was re-tuned against the shaded path in
  // D48, and a detail term with a mean away from unity would silently undo it.
  m.colorNode = detail ? lit.mul(detail) : lit;
  return m;
}

// ---------- U2: the fur (requested — texture, reactive to the music) ----------
/**
 * A sloth's coat, as a node graph. Two uniforms, both driven from the bus.
 *
 * Why procedural and not a texture map: this animal is a sphere, three cylinders
 * and a smaller sphere, and the limbs are open-ended `CylinderGeometry` — there
 * is no shared UV layout to paint across, and a canvas map would have to be
 * authored per part. A function of `positionLocal` is one expression that works
 * on every part of the body and moves with it, which is what fur does.
 *
 * The pattern is the animal that is actually there. A sloth's hair grows in
 * coarse strands running along the hanging body, and the strands hold algae —
 * the reason D45 chose a mossy base colour in the first place. So: banded
 * strands along the body's long axis, warped by a slower wave so they are not a
 * comb, times a fine three-axis mottle for the clumping. One is the coat's
 * structure, the other is what is growing in it.
 *
 * **Reactive, and reactive in the legal way.** `amt` and `sheen` ride the
 * tension and brightness walks, which are continuous bus signals and therefore
 * free on the ground stream (§2.1) — the coat deepens and the algae comes up
 * green as the arrangement thickens, over seconds, the way the mist and the
 * exposure already do. Nothing here is on a beat. The one beat-locked thing this
 * animal has is its crawl (`slothCrawl`), which is its single anchored
 * behaviour, and U1's economy says it may not have two.
 */
function furNode(amt, sheen) {
  const p = positionLocal;
  // the strands: bands along the body, bent by a slower wave across it
  const strands = sin(p.y.mul(11.3).add(sin(p.x.mul(2.7)).mul(1.9)));
  // …and the clumping: a cheap three-axis mottle, which at this scale reads as
  // matted hair rather than as noise
  const mottle = sin(p.x.mul(17.3)).mul(sin(p.z.mul(19.1))).mul(sin(p.y.mul(13.7)));
  const f = strands.mul(0.55).add(mottle.mul(0.45));       // −1…1, mean ≈ 0
  const shade = float(1).add(f.mul(amt));                  // …so this means ≈ 1
  // the algae, which only ever ADDS colour to the lit side of a strand: a green
  // that showed in the troughs too would read as a repaint of the animal
  const ALGAE = vec3(0.66, 1.05, 0.6);
  return mix(vec3(shade, shade, shade), ALGAE.mul(shade), max(f, float(0)).mul(sheen));
}

// ---------- U2: the sloths ----------
/**
 * The thesis of §3.1 rendered as an animal: an integrative motion with all
 * memory and no rhythm, incapable of dancing at 168 BPM and therefore incapable
 * of breaking the ground-stream rule even by accident. The one creature in this
 * world that cannot get it wrong.
 *
 * Placed by the camera rather than by ecology, and the camera is right here:
 * `BAND_PITCH[0] = 5.0`, so in the undergrowth the gaze CLIMBS — "the eye goes
 * to what it does not have", and down there that is light. The set therefore
 * opens with 97 seconds of looking up into a band that contained trunks and
 * nothing else. (`CAST.slothCrown` is the same system placed where sloths
 * actually live, for the canopy track — one constant apart.)
 */
export function makeSloths(rng, spec, name, trees = []) {
  const group = new THREE.Group();
  const n = spec.count;
  // The fur is now shaded by `shadeNode` like every other solid surface, so the
  // baked fake-lambert that `shadeGeometry` used to provide is gone. That
  // function existed only because an unlit sphere renders as a filled circle
  // and this animal photographed as "two pale saucers with sticks coming out of
  // them" (D45); a material that can read a normal retires it.
  //
  // Mossy rather than brown: the algae that really does grow in sloth fur, and
  // it agrees with the band it hangs in.
  // Tuned against the shot, twice. The old flat path multiplied FUR by
  // `0.18 + 1.2·canopyLight(min(alt, CANOPY_BASE))` by hand — about 0.35 in the
  // crowns — and the shaded path applies its own ~0.64 there, so carrying the
  // old base colour across made the animal roughly twice as bright as it had
  // been and it photographed as a white stick figure. The base is the value the
  // shading expects, not the value the old multiplier expected.
  //
  // …and it carries a coat now (`furNode`). The two uniforms are written once per
  // frame in `update`, from the tension and brightness walks: the strands deepen
  // as the arrangement thickens and the algae comes up green in the light. Both
  // are continuous bus signals, so the coat costs nothing on the ground stream.
  const furAmt = uniform(float(0.2));
  const furSheen = uniform(float(0.25));
  const mat = makeCreatureMat(
    { color: '#4a5942', fog: true }, { worldTop: 62 }, furNode(furAmt, furSheen));
  // the branch is bark, not fur: it belongs to the forest and is lit like it
  const barkMat = makeCreatureMat({ color: '#38402d', fog: true }, { worldTop: 62 });
  const bodyGeo = new THREE.SphereGeometry(1, 14, 10);
  const limbGeo = new THREE.CylinderGeometry(0.13, 0.17, 1, 6, 1, true);
  const branchGeo = new THREE.CylinderGeometry(0.2, 0.34, 1, 6);

  // ---- pick a host tree, and hang a real branch off it ----
  // The first version put each sloth at a free-floating point with its own
  // branch bar hovering in the air beside it. It read, but it read as a prop:
  // the branch belonged to nothing, so the animal was attached to the world by
  // an object that was itself attached to nothing. Now the branch grows out of
  // an actual trunk from `makeForest.trees`, which means the sloth is somewhere
  // in the forest rather than somewhere in the frame.
  //
  // Hosts are chosen near the camera's path — the fog under the crowns eats
  // anything past ~15 units (D45), so a sloth on a far tree is a sloth nobody
  // will ever see — and never twice.
  //
  // The height test is `SLOTH_TOP_FRAC`, not a fixed clearance. It used to be
  // `h > spec.y[1] + 3`, which for the crown band meant `h > 46` — and since a
  // non-emergent trunk tops out at 43.3, that quietly restricted every crown
  // sloth to an emergent and then hung it in the last few units of the tallest
  // tree in the forest. A tree qualifies now if it can carry this animal in its
  // own lower reaches, which is where the animal belongs.
  const CAM = CAM_XZ;
  const candidates = trees
    .map((tr, idx) => ({ tr, idx, d: Math.hypot(tr.x - CAM.x, tr.z - CAM.z) }))
    .filter((c) => c.d > 4 && c.d < 17 && c.tr.h * SLOTH_TOP_FRAC > spec.y[0])
    .sort((a, b) => a.d - b.d);

  const beasts = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const host = candidates.length ? candidates[i % candidates.length].tr : null;
    // Never above 78% of the host's height, whatever the band asks for: the
    // guarantee is against the TREE, because that is the thing that was being
    // topped out (see `SLOTH_TOP_FRAC`). A sloth hangs under a canopy.
    const want = spec.y[0] + rng() * (spec.y[1] - spec.y[0]);
    const hy = host ? Math.min(want, host.h * SLOTH_TOP_FRAC) : want;
    // …and how big everything is up there. One factor drives the branch's length,
    // the branch's thickness and the animal together — which is the requested
    // proportionality and also just what a tree is: a bough near the ground is a
    // metre thick, the same tree's upper branches bend under a bird.
    const size = branchTaper(hy, host ? host.h : hy / 0.6);
    // the branch points back toward the camera's side of the trunk, so the
    // sloth travels ACROSS the view rather than away down it
    const toCam = host ? Math.atan2(CAM.z - host.z, CAM.x - host.x) : 0;
    const theta = toCam + (rng() < 0.5 ? 1 : -1) * (0.5 + rng() * 0.7);
    const len = (7 + rng() * 4) * size;
    const bx = host ? host.x : (rng() - 0.5) * 12;
    const bz = host ? host.z : 2 - rng() * 8;
    const r0 = host ? host.rad * 0.9 : 0;

    const branch = new THREE.Mesh(branchGeo, barkMat);
    // built along +Y then laid down along theta, with a slight droop. The girth
    // tapers with the height too — a shorter branch at the old radius reads as a
    // stump, and it is the pair of them that says "high up this tree".
    const droop = 0.11 + rng() * 0.07;
    branch.scale.set(size, len, size);
    branch.rotation.order = 'YZX';
    branch.rotation.set(0, -theta, Math.PI / 2 - droop);
    branch.position.set(
      bx + Math.cos(theta) * (r0 + len * 0.5),
      hy - len * 0.5 * Math.sin(droop),
      bz + Math.sin(theta) * (r0 + len * 0.5),
    );
    group.add(branch);

    // the animal scales with its branch — `g` holds body, head and limbs, so one
    // scale on the group carries all four and the pose is unchanged
    g.scale.setScalar(size);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.scale.set(1.5, 0.9, 0.92);          // a long hanging bundle, not a ball
    g.add(body);
    const head = new THREE.Mesh(bodyGeo, mat);
    head.scale.setScalar(0.64);
    head.position.set(1.5, 0.2, 0);
    g.add(head);

    // four limbs, reaching UP to the branch — the pose is the whole silhouette
    const limbs = [];
    for (let k = 0; k < 4; k++) {
      const limb = new THREE.Mesh(limbGeo, mat);
      const fx = k < 2 ? 0.85 : -0.8;
      const fz = k % 2 === 0 ? 0.5 : -0.5;
      limb.position.set(fx * 1.15, 1.3, fz);
      limb.scale.y = 2.3;
      limb.rotation.z = fx > 0 ? -0.22 : 0.22;
      g.add(limb);
      limbs.push({ mesh: limb, rest: limb.rotation.z, side: fx > 0 ? -1 : 1, lead: k < 2 });
    }
    group.add(g);
    beasts.push({
      g, head, limbs, i, sway: rng() * 9, headRest: 0, size,
      // the branch, as a ray the animal travels along
      bx: bx + Math.cos(theta) * r0, bz: bz + Math.sin(theta) * r0, hy, theta, len, droop,
      u: 0.15 + rng() * 0.6,             // where along it, 0..1
      dir: rng() < 0.5 ? 1 : -1,         // and which way it is going
      lastReach: 0,
      step: 0,
    });
  }

  return {
    name,
    group,
    /** What the sloths are doing this frame — the harness cannot see a gait. */
    debug() {
      return beasts.map((b) => ({
        u: +b.u.toFixed(3), dir: b.dir, y: +b.hy.toFixed(1), size: +b.size.toFixed(2),
        x: +(b.bx + Math.cos(b.theta) * b.u * b.len).toFixed(1),
      }));
    },
    update(dt, env) {
      const presence = env.fauna?.presence?.[name] ?? 0;
      const still = env.fauna?.life?.still ?? 0;
      group.visible = presence > 0.01;
      if (!group.visible) return;
      mat.opacity = presence * 0.95;
      barkMat.opacity = mat.opacity;

      // the coat, from the two continuous walks (see `furNode`). Tension deepens
      // the strands; the light in the band decides how much algae-green comes up.
      // `Tf` rather than `T`, like everything else the eye does: the world leads
      // the sound by two seconds.
      furAmt.value = 0.14 + 0.34 * clamp01(env.Tf ?? env.T ?? 0);
      furSheen.value = 0.12 + 0.5 * clamp01(env.b ?? 0);

      for (const b of beasts) {
        const wind = windAtOr(env, b.bx, b.hy, b.bz);

        // ANCHORED (requested): the crawl, locked to the bar. `slothCrawl` starts
        // a pull on a downbeat and plants the hand on the next one, once every
        // two to six bars — each animal on its own multiple and its own offset,
        // so three sloths reach on three different downbeats and the aggregate
        // is not a pulse. Read the note over `slothCrawl` in fauna.js: this is
        // the sloth's one anchored behaviour and U1 prices it at exactly one.
        //
        // The refusal to be hurried survives the move: at high tension the
        // animal skips more of its slots, so it still reaches LESS often at the
        // drop than in the intro. D45's joke now plays against an audible grid
        // instead of against nothing, which is what makes it legible.
        const reach = slothCrawl(env.t, b.i, env.bar ?? 0, env.T ?? 0) * (1 - still * 0.7);

        // …and the reach is what MOVES it. This is the animation the first pass
        // was missing: the sloth used to reach in place, so it was a fixed
        // object with a moving arm. Travel is driven by the same envelope, so
        // it advances in pulses — hand, then body, then hand — and is
        // motionless in between, which is what hanging locomotion looks like.
        //
        // Re-scaled for the crawl, and the arithmetic is the point of the change.
        // D46's reach fired once every 44–96 s and moved the animal by a hair, so
        // most of its travel was actually the constant term — a creep with an
        // occasional twitch on top. The crawl fires on one downbeat in two to six
        // bars and takes about half of them at mid tension, so a pulse arrives
        // roughly every 10 s: ~0.06 of the branch each time, half a world unit,
        // about a third of the animal's own length. Thirteen or so of those cross
        // the branch in a little over two minutes — the same traverse D46 had,
        // spent in steps you can see instead of in a drift you cannot.
        //
        // The constant term is what is left of the creep and it is deliberately
        // tiny (3%): between pulses this animal is meant to be motionless, which
        // is what makes a pulse read as a step at all.
        b.u += dt * 0.042 * (0.03 + reach) * b.dir * (1 - still * 0.8);
        if (b.u > 0.92) { b.u = 0.92; b.dir = -1; }
        else if (b.u < 0.08) { b.u = 0.08; b.dir = 1; }

        // where that puts it: along the branch ray, hanging under it. The drop
        // scales with the animal, or a small sloth would hang at a full-size
        // sloth's distance below its own branch.
        const along = b.u * b.len;
        const drop = 1.75 * b.size;
        b.g.position.set(
          b.bx + Math.cos(b.theta) * along + wind.x * 0.08,
          b.hy - along * Math.sin(b.droop) - drop,
          b.bz + Math.sin(b.theta) * along + wind.z * 0.08,
        );
        // it faces the way it is travelling, and hangs level with its branch
        b.g.rotation.order = 'YZX';
        b.g.rotation.set(
          wind.z * 0.045,
          -b.theta + (b.dir > 0 ? 0 : Math.PI),
          wind.x * 0.05 + Math.sin(env.t * 0.21 + b.sway) * 0.03 + reach * 0.07 - b.droop * b.dir,
        );

        // the two lead limbs alternate, so it is hand over hand rather than a
        // single arm waving. `step` flips each time a reach completes.
        if (b.lastReach > 0.5 && reach <= 0.5) b.step ^= 1;
        b.lastReach = reach;
        b.limbs.forEach((l, k) => {
          const active = l.lead && (k % 2) === b.step;
          const a = active ? reach : 0;
          l.mesh.rotation.z = l.rest + a * 1.15 * l.side;
          l.mesh.position.y = 1.3 + a * 0.4;
        });

        // EPISODIC: a head turn on a seeded slot schedule. That is the entire
        // remaining vocabulary, and it is enough.
        const turn = slotEvent(env.t, (b.i + 1) * 977, 14, 0.5);
        const turning = turn ? Math.exp(-turn.since * 0.55) * (turn.roll - 0.5) * 2 : 0;
        b.headRest += (turning - b.headRest) * Math.min(1, dt * 0.8);
        b.head.position.z = b.headRest * 0.45;
        b.head.position.x = 1.5 - Math.abs(b.headRest) * 0.15;
      }
    },
  };
}

// ---------- U3: the frogs ----------
/**
 * THE FROGS WERE NEVER VISIBLE, and the reason was three bugs stacked, none of
 * which a band window or a population count could show. Written out because
 * every one of them is a trap the next small animal will fall into too.
 *
 * **1. The colour was squared.** `shadedColor()` returns `materialColor × light`
 * and three then multiplies *that* by the instance colour — `setupDiffuseColor`
 * reads `colorNode = instanceColor.mul(colorNode)`. Both frog systems set a
 * saturated green material AND a saturated green instance colour, so the hue
 * multiplied into itself: a #5a9160 body times a #7cc47f instance times 0.55
 * times the understory's own shading lands near (0.004, 0.034, 0.005) linear,
 * about a twentieth of the intended level. The animals were being drawn, in
 * black, in a black forest. `shade.js` warns about exactly this asymmetry
 * ("vertex and instance colours ARE applied on top") and it still caught us, so:
 * **anything instanced and shaded keeps a white material and carries its colour
 * in the instance attribute.** One of the two, never both.
 *
 * **2. They were spawned outside the fog.** A frog is half a unit across, and
 * under the crowns `look.js`'s `aerial` term puts the air at 48% transmittance
 * by 10 units and 9% by 18 (D45's sightline). Scattering seven of them on a
 * 6–19 unit shell around the ORIGIN — while the camera stands at (0, ·, 12) —
 * put 48% of that volume inside the frustum and 2% of it inside the fog's
 * reach. Two per cent of seven frogs is nobody's frog.
 *
 * **3. The pond chorus was under the floor of the frame.** Pool frogs sat at
 * y 0.5–2.2 across a band running to camera y 18.6, and the undergrowth's gaze
 * CLIMBS (`BAND_PITCH[0]` = 5.0). Projecting the spawn volume through the real
 * camera: 44% of it is in frame at camera y 2, 3.5% at y 7.4, and **0% from y 10
 * upward** — there is no distance at which a frog on the water is inside a frame
 * pitched that far up. The band was claiming a creature the geometry forbade.
 *
 * The fix for (2) and (3) is one idea: the frogs are placed like the motes in
 * `makeNearField` rather than like the trunks — a small population kept in the
 * camera's near field and RECYCLED when it leaves. The camera climbs 30 units
 * through these two bands, so any static scatter is a scatter it walks away
 * from; this one travels with it. Recycling only ever fires on a frog that is
 * already well outside the frustum (`offFrame` below is deliberately slack), so
 * nothing is ever seen to move.
 */

/**
 * Aposematic colour — the one place in this world where the bright animal is
 * the honest one.
 *
 * This file opens with *silhouette first*, and it is the right rule: the world
 * is soft and near-abstract and D28/D42 deleted the recurring glyph twice for
 * sitting on top of it like a decal. A poison dart frog is the exception the
 * rule is actually about. Its colour is not decoration, it is a SIGNAL — evolved
 * to be seen at distance, against wet green, by an eye in exactly this light.
 * Rendering one as a dark green pebble is not restraint, it is the wrong animal.
 *
 * Still not a glow, which is the distinction the first pass got wrong: these are
 * normal-blended wet bodies with saturated skin, and they take the shading, the
 * fog and the depth buffer like everything else solid. An additive frog was a
 * green lantern hanging in the trunks — one more particle system in a world that
 * already has four.
 */
const DART_SKIN = [
  '#1f6ad8',   // Dendrobates tinctorius 'azureus' — cobalt
  '#e2452c',   // Oophaga pumilio — strawberry
  '#f0c020',   // Phyllobates terribilis — golden
  '#35b258',   // D. auratus — green over black
  '#f07d1e',   // D. leucomelas — banded
];

// The near field a frog has to live in to survive the fog: past 7 units so it
// is not in the lens, inside 14 so it is still a quarter-lit when it arrives.
//
// The near end is set by the BLOOM, not by taste. `scene.js` builds
// `bloom(ground, 0.6, 0.5, 0)` — threshold **zero**, so everything in this
// world glows in proportion to its own brightness and there is no level at
// which an object is merely lit. At 4.5 units a frog subtends 6.6°, which is
// ~90 px of saturated colour on an 800 px frame, and the bloom turns that into
// a balloon: the first pass at this fix photographed as a row of coloured
// lanterns, which is precisely the failure the original additive version was
// removed for, re-earned from the other direction. At 7–14 units it is 20–40 px
// and it reads as an animal on a trunk.
const FROG_NEAR = 7;
const FROG_FAR = 14;

/**
 * The colour a wet animal's highlight is (U3's sparkle). A specular is the colour
 * of the LIGHT, so this is the skylight arriving through the crowns rather than
 * anything about a frog — faintly green because that is what the air is down
 * there (`BAND_COLORS[1]`, the green gloom), and never pure white, which in this
 * palette reads as a hole in the picture.
 */
const WET_SHEEN = new THREE.Color('#d8f0e2');

/**
 * A point in front of the lens, `r0`–`r1` out, within `spread` radians of the
 * gaze. `bias` above 1 weights the draw toward the near end, which is where an
 * animal this small is still an animal rather than a speck in fog.
 */
function nearPoint(rng, cx, cz, r0 = FROG_NEAR, r1 = FROG_FAR, spread = 0.8, bias = 1) {
  const a = (rng() * 2 - 1) * spread;
  const r = r0 + (r1 - r0) * Math.pow(rng(), bias);
  return { x: cx + Math.sin(a) * r, z: cz - Math.cos(a) * r };
}

/**
 * Is this frog outside the frame, and therefore free to be moved unseen?
 *
 * This wants to be TIGHT, and the first version's slackness is instructive: a
 * flat 13 units of vertical tolerance sounds safe, and it silently parked the
 * whole population above the top of the frame. A frog 12 units over the lens at
 * 10 units out is 50° up and nowhere near a 60° frame, but it passed the test,
 * so it was never recycled and never seen — the band said `presence 1.00` and
 * the picture had no frogs in it. A margin that is too slack does not fail
 * safe; it fails invisibly, which is worse.
 *
 * So the test is the frustum itself. The frame is 60° tall (`FOV_BASE`), giving
 * a half-height of `tan(30°)·d ≈ 0.577d`, and the gaze is PITCHED — `scene.js`
 * looks at `camY + pitchAt(alt)` from 12 units back, so the frame's vertical
 * centre at distance `d` climbs by `pitch·d/12` and is not the lens height. The
 * slack over the true half-height is 1.2 units: enough to cover the frog's own
 * radius and a frame of camera smoothing, not enough to hide a frog behind.
 */
function offFrame(f, cam, alt) {
  const d = Math.hypot(f.x - cam.x, f.z - cam.z);
  if (d > FROG_FAR + 6 || d < 2 || f.z > cam.z + 3) return true;
  const centre = cam.y + pitchAt(alt) * (d / 12);
  return Math.abs(f.y - centre) > 0.577 * d + 1.2;
}

/**
 * Both frog systems, which differ only in where a perch is.
 *
 * @param perch  (frog, cam) => void — put this frog somewhere fresh and near
 * @param opts   radius/seed/level, and `onCall` for the pool's ripple
 */
function makeFrogs(rng, spec, name, perch, opts = {}) {
  const {
    radius = 0.26, seed = 1, skins = DART_SKIN, level = 1, hop = true, onCall = null,
  } = opts;
  const n = spec.count;
  // White, and the colour lives in the instance attribute — see (1) above. This
  // is the whole of that fix and it is one character of material state.
  const mat = makeCreatureMat({ color: '#ffffff' });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 10, 7), mat, n);
  mesh.frustumCulled = false;
  // Allocate the instance colours up front rather than letting the first
  // `setColorAt` size them. The governor sets `mesh.count` BEFORE the write
  // loop, so on a machine that boots at quality 0.8 the buffer would be sized
  // for 80% of the population and every frog above it would read past the end
  // when the quality came back up.
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);

  const frogs = [];
  for (let i = 0; i < n; i++) {
    const f = {
      i, x: 0, y: 0, z: 0,
      jx: 0, jz: 0,          // the hop's target perch
      dx: 0, dz: 0,          // …and how far along it we are, this frame only
      landed: true, wasCalling: false,
      skin: new THREE.Color(skins[i % skins.length]),
    };
    // seed the population against the camera's home position; `update` moves
    // them the moment it knows where the lens really is
    perch(f, { x: CAM_XZ.x, y: (spec.y[0] + spec.y[1]) / 2, z: CAM_XZ.z });
    frogs.push(f);
  }

  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let lastDrawn = 0;

  return {
    name,
    group: mesh,
    update(dt, env) {
      const presence = env.fauna?.presence?.[name] ?? 0;
      const life = env.fauna?.life ?? { rate: 1, still: 0 };
      mesh.visible = presence > 0.01;
      if (!mesh.visible) return;
      const drawn = populationFor(spec, env.quality ?? 1);
      if (mesh.count !== drawn) mesh.count = drawn;
      lastDrawn = drawn;
      mat.opacity = presence * level;
      const cam = env.cam ?? { x: CAM_XZ.x, y: 0, z: CAM_XZ.z };
      const alt = env.alt ?? 0;

      // chorus density rides tension — MORE frogs calling, never faster ones
      const density = 0.25 + 0.75 * clamp01(env.T ?? 0) * (1 - life.still);

      for (let k = 0; k < drawn; k++) {
        const f = frogs[k];
        // the camera has climbed away from this one: give it back
        if (offFrame(f, cam, alt)) perch(f, cam);

        // EPISODIC: a hop between two perches. The one hard-edged motion in
        // this tier, licensed as weather exactly the way a strike is. It
        // COMMITS on landing — the old version interpolated toward a jump
        // target and then snapped home the first time the slot schedule rolled
        // a miss, which is a teleport with extra steps.
        let arc = 0;
        if (hop) {
          const jump = slotEvent(env.t, (f.i + 3) * 5501,
            19 / Math.max(0.3, life.rate), 0.45 * (1 - life.still));
          const hopping = jump != null && jump.since < 0.55;
          if (hopping) {
            const j = clamp01(jump.since / 0.55);
            f.landed = false;
            arc = Math.sin(j * Math.PI) * 1.4;
            // read the interpolation off the perch, never write it back
            f.dx = (f.jx - f.x) * j;
            f.dz = (f.jz - f.z) * j;
          } else {
            if (!f.landed) { f.x = f.jx; f.z = f.jz; f.landed = true; }
            f.dx = 0; f.dz = 0;
          }
        }
        const x = f.x + f.dx;
        const z = f.z + f.dz;
        const wind = windAtOr(env, x, f.y, z);

        // CONTINUOUS: the throat. Desynchronised by construction (`throatPulse`
        // goes through `phaseFor`), because a synchronised chorus is rhythm on
        // the ground stream and §2.1 does not allow the ground to keep time.
        const call = throatPulse(env.t, f.i, seed) * density;
        const s = 1 + call * 0.45;   // the throat swells; the frog does not inflate
        m4.makeScale(s, s * 0.85, s);
        m4.setPosition(x + wind.x * 0.12, f.y + arc + wind.y * 0.1, z + wind.z * 0.12);
        mesh.setMatrixAt(k, m4);
        // The fade belongs to `opacity` alone. Multiplying `presence` in here
        // as well faded the animal toward black at the same time it faded it
        // toward transparent, which is two fades for one crossing.
        //
        // The level is low for a colour this saturated, and again the bloom is
        // why: at threshold 0 a frog held near 1.0 stops being a lit surface
        // and becomes a light source. Held near the value the crowns and trunks
        // sit at, it blooms the way the rest of the world blooms — which is
        // what makes it an animal IN the picture rather than a sticker on it.
        // The call is the only thing that brightens it, and it is worth ~2×.
        col.copy(f.skin).multiplyScalar(0.42 + call * 0.38);
        // …and the SPARKLE (requested: "so I can see them"). Deliberately not a
        // lift of the base level, which is the tuning above and was arrived at
        // against the bloom — a brighter frog is a lantern, and this world has
        // deleted two of those already. What finds the eye instead is movement in
        // the highlight: a wet body catching light for a fraction of a second,
        // which is how you actually spot a frog.
        //
        // Synced to the music, and to the ONE rhythmic coupling this world
        // already licenses: `duck` is the kick's own sidechain envelope, the same
        // constant that ducks the ether, shoves the camera, presses the mist down
        // and dips the bloom (scene.js's header). The frogs are a fifth rendering
        // of it rather than a new synch point (§2.2). The carrier is per-frog and
        // fast, so what the eye gets is a scatter of wet points, never a chorus
        // flashing in unison — that would be rhythm on the ground stream.
        //
        // Toward the colour of the LIGHT, not of the skin: a specular highlight
        // is the light source's colour, and it is capped well under 1 so that a
        // sparkle stays a sparkle.
        const sparkle = glint(env.t, f.i, (env.duck ?? 0) * 0.85 + 0.14 * clamp01(env.T ?? 0), seed);
        if (sparkle > 0.001) col.lerp(WET_SHEEN, Math.min(0.5, sparkle));
        mesh.setColorAt(k, col);

        if (onCall) {
          const calling = call > 0.55;
          if (calling && !f.wasCalling) onCall(f);
          f.wasCalling = calling;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
    /**
     * For the harness: how far each frog is from the lens, and how far above
     * or below it. A frog that is present, drawn, and 20 units over the top of
     * the frame looks identical to a working frog in every other diagnostic.
     */
    debug(cam = { x: CAM_XZ.x, y: 0, z: CAM_XZ.z }) {
      // `lastDrawn`, not the full population: the governor sheds frogs on a
      // slow machine and the shed ones keep their stale positions forever, so
      // reporting all of them buries the live rows in noise that looks like a
      // stuck population — which is exactly what it looked like once already.
      const rows = frogs.slice(0, lastDrawn).map((f) => ({
        d: +Math.hypot(f.x - cam.x, f.z - cam.z).toFixed(1),
        dy: +(f.y - cam.y).toFixed(1),
      }));
      return { drawn: lastDrawn, of: spec.count, radius, rows };
    },
  };
}

/**
 * The dart frogs, on the trunks (U3).
 *
 * The brief asked for frogs on the forest floor, and the litter is 20–30 units
 * below this camera's lens and out of frame — so they live where the camera is
 * looking, which for a jungle frog is a legitimate place to be: the bromeliads
 * and the wet bark of a trunk, not the ground. What has changed is that a perch
 * is now an actual trunk from `makeForest.trees` picked *near the lens*, the way
 * a sloth's branch is, instead of a random point on a 6–19 unit shell.
 *
 * A frog with no trunk in reach sits on a leaf in the near field instead. That
 * is not a fallback for tidiness — the layout puts 26 trunks in a 62-unit world
 * and there is no guarantee any of them is within 13 units of the lens at a
 * given moment, and a chorus that thinned out whenever the camera crossed a
 * clearing would read as a bug rather than as a clearing.
 */
export function makeTreeFrogs(rng, spec, name, trees = []) {
  /**
   * A trunk in the near field at roughly `want` units out, or null.
   *
   * Asking for a DISTANCE rather than for any trunk at all is the whole of this
   * function, and the version that did not photographed as an empty forest: the
   * layout puts 26 trunks in a 62-unit world, so at any moment there is usually
   * exactly ONE inside the near field, every frog was handed it, and the entire
   * chorus stacked onto a single trunk at a single distance. Seven frogs 12.5
   * units away is seven 16-pixel specks in one place with the fog at 32% —
   * present, drawn, correct in every diagnostic, and invisible.
   */
  function host(cam, y, want) {
    let best = null, bestGap = Infinity;
    for (const tr of trees) {
      if (tr.h <= y + 2) continue;
      const gap = Math.abs(Math.hypot(tr.x - cam.x, tr.z - cam.z) - want);
      if (gap < bestGap) { bestGap = gap; best = tr; }
    }
    // …and if the nearest trunk to the distance we wanted is not near it, the
    // frog takes a leaf at that distance instead. A chorus that thinned out
    // whenever the camera crossed a clearing would read as a bug, not a clearing.
    return bestGap < 2.5 ? best : null;
  }

  function perch(f, cam) {
    // Eye level, biased a little ABOVE it: down here the gaze climbs
    // (`BAND_PITCH[0]` = 5.0 — "the eye goes to what it does not have"), so a
    // frog exactly level with the lens sits under the part of the frame the eye
    // is actually in.
    f.y = Math.max(spec.y[0], Math.min(spec.y[1], cam.y + 1.5 + (rng() - 0.5) * 7));
    // Distance first, and weighted toward the near end rather than uniform: a
    // frog at 7 units is ~37 px with the fog at 62%, and at 14 units it is
    // 18 px at 24%. Those are not two samples of one animal, they are a legible
    // one and a smudge, so the population should lean on the legible end.
    const want = FROG_NEAR + (FROG_FAR - FROG_NEAR) * Math.pow(rng(), 1.8);
    const tr = host(cam, f.y, want);
    if (tr) {
      // on the bark, on the side the camera is on, and on the taper: the trunk
      // geometry is a 0.55→1 cylinder scaled by `rad`, so it is genuinely
      // thinner up here and a frog pinned at the base radius would float
      const toCam = Math.atan2(cam.z - tr.z, cam.x - tr.x) + (rng() - 0.5) * 1.2;
      const r = tr.rad * (1 - 0.45 * clamp01(f.y / tr.h)) + 0.22;
      f.x = tr.x + Math.cos(toCam) * r;
      f.z = tr.z + Math.sin(toCam) * r;
    } else {
      const p = nearPoint(rng, cam.x, cam.z, want, want);
      f.x = p.x; f.z = p.z;
    }
    // where a hop would take it: one real perch away, never a fresh random point
    const away = rng() * Math.PI * 2;
    f.jx = f.x + Math.cos(away) * (1.2 + rng() * 1.6);
    f.jz = f.z + Math.sin(away) * (1.2 + rng() * 1.6);
    f.landed = true;
  }

  return makeFrogs(rng, spec, name, perch, { radius: 0.185, seed: 1 });
}

/**
 * The chorus at the water, in the undergrowth — where `ambfrogs` actually
 * sounds (D16). Nearly free, because `makePool` already recycles ten rings on a
 * free index: a call drops one in, so the frogs and the water are the same
 * event rather than two things that happen to be near each other.
 *
 * These sit from the waterline up onto the root arches at the bank, and both
 * numbers below are the output of a search rather than a taste: 6–16 units is
 * the window where a frog is far enough out to clear the bottom of an upward-
 * pitched frame and near enough in to survive the fog, and it beat every other
 * radius pair at the camera heights this band actually covers. See `CAST.
 * poolfrog` for why the band is as short as it is — the summary is that a
 * ground-dwelling animal cannot follow a camera that climbs away from the
 * ground, and pretending otherwise just draws it off-screen.
 *
 * Green, not aposematic: this is a pond chorus, and the dart frogs upstairs
 * carry the colour. Two animals in one world wearing the same warning pattern
 * would make the pattern mean nothing.
 */
export function makePoolFrogs(rng, spec, name, pool) {
  const POND_NEAR = 7.5, POND_FAR = 16;

  function perch(f, cam) {
    f.y = spec.y[0] + rng() * (spec.y[1] - spec.y[0]);
    const p = nearPoint(rng, cam.x, cam.z, POND_NEAR, POND_FAR, 0.8, 1.6);
    f.x = p.x; f.z = p.z;
    f.jx = f.x; f.jz = f.z;
    f.landed = true;
  }

  return makeFrogs(rng, spec, name, perch, {
    radius: 0.20,
    seed: 7,
    level: 0.9,
    // a frog at the water does not hop across the frame; it sits and calls
    hop: false,
    skins: ['#7fbf86', '#94cf8c', '#6fae7e', '#a8d79a'],
    // Requested (visuals task 7): a call no longer drops a ring on the water.
    // D45 tied the two together — "a call and the ripple it makes are one event"
    // — and the argument still holds; what went wrong is that the pool was the
    // only thing in the middle of the frame that ever moved, and between these
    // rings and the ambient drip trickle it was moving constantly. The surface
    // breaks for RAIN now and nothing else (`makePool`'s splash). The `pool`
    // argument stays in this function's signature because restoring the link is
    // then exactly one line:
    //   onCall: (f) => pool?.ripple?.(f.x, f.z, 0.55),
  });
}

// ---------- U4/U5: the birds ----------
/** Two triangles in a shallow V. Forward is +Z; the wings scale to flap. */
function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 0.7, -1, 0.30, 0, 0, 0, -0.5,   // left wing
    0, 0, 0.7, 0, 0, -0.5, 1, 0.30, 0,    // right wing
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The canopy flock (U4), and the toucan startle (U5).
 *
 * Deliberately NOT a copy of the fireflies. §3.2's comment already names the
 * difference — *a flock banks; a field merely flows* — so the rules here carry
 * higher alignment, lower separation, much higher speed, and a roll into the
 * turn taken from lateral acceleration. That roll is nearly free once velocity
 * is integrated and is the whole difference between particles with wings and
 * birds.
 *
 * 56 individuals, not 220: a flock reads as a flock at small counts, and a
 * cloud of 220 birds reads as insects. At this size the neighbour scan is a
 * naive O(n²) on a 3-frame stride — about a thousand distance tests a frame,
 * which is cheaper than the spatial hash K2 needed at four times the population
 * and is why that machinery is not repeated here.
 *
 * W1 — the flocking weights come from `coherenceAt(warmth)`, so the flock is
 * where the second harmonic axis is most visible: the canopy (warmth 0.85)
 * flies as one body, and the zenith (warmth 0.10) comes apart while the light
 * keeps growing. That is the D22 crossing, rendered.
 */
export function makeBirds(rng, spec, name) {
  const N = spec.count;
  // NOT face-corrected, deliberately. `doubleSided` was tried here and the
  // flock came back white — these were the only two materials in the world
  // using `faceDirection` and the only two that went wrong, which is about as
  // clean a bisection as a renderer ever offers. A bird is a thin V seen from
  // tens of units away; one side lit and the other dark is fine, and is arguably
  // what a banking bird should do anyway.
  const mat = makeCreatureMat({ color: '#20313a', side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(birdGeometry(), mat, N);
  mesh.frustumCulled = false;

  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const acc = new Float32Array(N * 3);
  const bank = new Float32Array(N);
  const home = { x: 0, y: (spec.y[0] + spec.y[1]) / 2, z: 0 };
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rng() - 0.5) * 70;
    pos[i * 3 + 1] = spec.y[0] + rng() * (spec.y[1] - spec.y[0]);
    pos[i * 3 + 2] = (rng() - 0.5) * 70;
    vel[i * 3] = (rng() - 0.5) * 6;
    vel[i * 3 + 1] = (rng() - 0.5) * 1.2;
    vel[i * 3 + 2] = (rng() - 0.5) * 6;
  }
  const NEIGHBOUR = 9;
  const m4 = new THREE.Matrix4();
  const rotZ = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const target = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let stride = 0;

  // U5 — the startle. One anchored behaviour, on the one event rare enough to
  // afford it (`squawk.every = 2` phrases).
  const startle = { x: 0, y: 0, z: 0, at: -99, live: false };

  return {
    name,
    group: mesh,
    /** ANCHORED (U5): the toucan called, and the birds nearest it leave. */
    flush(x, y, z, t) {
      startle.x = x; startle.y = y; startle.z = z; startle.at = t; startle.live = true;
    },
    startleAge(t) { return startle.live ? t - startle.at : null; },
    update(dt, env) {
      const presence = env.fauna?.presence?.[name] ?? 0;
      mesh.visible = presence > 0.01;
      if (!mesh.visible) return;
      const drawn = populationFor(spec, env.quality ?? 1, 8);
      if (mesh.count !== drawn) mesh.count = drawn;
      mat.opacity = presence;

      const coh = env.fauna?.coherence ?? { separation: 2, alignment: 0.6, cohesion: 0.06, consent: 0.6 };
      const life = env.fauna?.life ?? { rate: 1, still: 0 };
      const wp = env.fauna?.waypoint;
      // EPISODIC: the flock changes its mind — a new waypoint every 20–40 s,
      // faster in a build (W6). The whole group swings across the frame.
      if (wp) {
        home.x = (wp.roll - 0.5) * 70;
        home.z = (hashish(wp.at) - 0.5) * 70;
      }
      const flush = startle.live ? flushEnv(env.t - startle.at) : 0;
      if (startle.live && flush <= 0) startle.live = false;

      stride = (stride + 1) % 3;
      for (let i = 0; i < drawn; i++) {
        const ix = i * 3;
        if (i % 3 === stride) {
          let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
          for (let j = 0; j < drawn; j++) {
            if (j === i) continue;
            const jx = j * 3;
            const dx = pos[jx] - pos[ix], dy = pos[jx + 1] - pos[ix + 1], dz = pos[jx + 2] - pos[ix + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > NEIGHBOUR * NEIGHBOUR || d2 < 1e-6) continue;
            n++;
            cx += pos[jx]; cy += pos[jx + 1]; cz += pos[jx + 2];
            ax += vel[jx]; ay += vel[jx + 1]; az += vel[jx + 2];
            const inv = 1 / d2;
            sx -= dx * inv; sy -= dy * inv; sz -= dz * inv;
          }
          if (n) {
            // W1: every weight here is the warmth axis, rendered as agreement
            acc[ix] = sx * coh.separation + (ax / n - vel[ix]) * coh.alignment + (cx / n - pos[ix]) * coh.cohesion;
            acc[ix + 1] = sy * coh.separation + (ay / n - vel[ix + 1]) * coh.alignment + (cy / n - pos[ix + 1]) * coh.cohesion;
            acc[ix + 2] = sz * coh.separation + (az / n - vel[ix + 2]) * coh.alignment + (cz / n - pos[ix + 2]) * coh.cohesion;
          } else {
            acc[ix] = acc[ix + 1] = acc[ix + 2] = 0;
          }
          // toward the waypoint, and back into the band
          acc[ix] += (home.x - pos[ix]) * 0.02;
          acc[ix + 1] += (home.y - pos[ix + 1]) * 0.06;
          acc[ix + 2] += (home.z - pos[ix + 2]) * 0.02;
          // a wander, so a settled flock never freezes into a lattice
          acc[ix] += Math.sin(env.t * 0.9 + i * 1.7) * 0.8;
          acc[ix + 2] += Math.cos(env.t * 0.8 + i * 2.3) * 0.8;
        }

        // U5: away from the startle, hardest for the birds nearest it
        let fx = 0, fy = 0, fz = 0;
        if (flush > 0) {
          const dx = pos[ix] - startle.x, dy = pos[ix + 1] - startle.y, dz = pos[ix + 2] - startle.z;
          const d = Math.max(3, Math.hypot(dx, dy, dz));
          const k = (flush * 260) / (d * d);
          fx = dx / d * k; fy = (dy / d + 0.5) * k; fz = dz / d * k;
        }

        const wind = windAtOr(env, pos[ix], pos[ix + 1], pos[ix + 2]);
        // W1 again: `consent` is how much a bird leans with the shared wind
        // versus arguing with it. A cold flock is a crowd of individuals.
        const vx0 = vel[ix];
        vel[ix] += (acc[ix] + wind.x * 2.2 * coh.consent + fx) * dt;
        vel[ix + 1] += (acc[ix + 1] + wind.y * 1.4 + fy) * dt;
        vel[ix + 2] += (acc[ix + 2] + wind.z * 2.2 * coh.consent + fz) * dt;
        const sp = Math.hypot(vel[ix], vel[ix + 1], vel[ix + 2]);
        const cap = (7 + wind.amp * 3) * (1 + flush * 1.2) * (1 - 0.45 * life.still);
        if (sp > cap) { const k = cap / sp; vel[ix] *= k; vel[ix + 1] *= k; vel[ix + 2] *= k; }
        pos[ix] += vel[ix] * dt; pos[ix + 1] += vel[ix + 1] * dt; pos[ix + 2] += vel[ix + 2] * dt;

        // the bank: roll into the turn, from lateral acceleration. This is the
        // line that makes them birds rather than particles with wings.
        const lateral = (vel[ix] - vx0) / Math.max(dt, 1e-3);
        bank[i] += (clamp01(Math.abs(lateral) / 26) * Math.sign(lateral) * 0.9 - bank[i]) * Math.min(1, dt * 3);

        // CONTINUOUS: the wingbeat, desynchronised like everything else. With
        // instancing the flap has to be a scale rather than a vertex motion, so
        // the V deepens and flattens — which is what a wingbeat looks like at
        // this distance anyway.
        const flap = Math.sin(wingbeat(env.t, i) * Math.PI * 2);
        const size = 0.55 + presence * 0.25;

        p.set(pos[ix], pos[ix + 1], pos[ix + 2]);
        target.set(p.x - vel[ix], p.y - vel[ix + 1], p.z - vel[ix + 2]);
        m4.lookAt(p, target, UP);
        rotZ.makeRotationZ(bank[i]);
        m4.multiply(rotZ);
        scl.set(size, size * (0.5 + Math.abs(flap) * 1.1), size);
        m4.scale(scl);
        m4.setPosition(p);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Cheap deterministic scatter for the waypoint's second axis. */
function hashish(x) {
  const s = Math.sin(x * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The zenith's one bird, circling on a thermal.
 *
 * The zenith's ambience has no animal in it and the band's whole argument is
 * scale; a single distant shape is the cheapest way to say how big the air is.
 * No flock, no wingbeat — a soaring bird holds its wings still, and the
 * stillness is the point.
 */
export function makeSoarer(rng, spec, name) {
  const mat = makeCreatureMat({ color: '#243542', side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(birdGeometry(), mat);
  mesh.matrixAutoUpdate = false;   // the matrix is composed by hand each frame
  const radius = 46 + rng() * 22;
  const phase = rng() * Math.PI * 2;
  const rate = 0.022;            // one circuit per ~45 s: unhurried, like the band
  const p = new THREE.Vector3();
  const target = new THREE.Vector3();
  const rotZ = new THREE.Matrix4();
  const m4 = new THREE.Matrix4();

  return {
    name,
    group: mesh,
    update(dt, env) {
      const presence = env.fauna?.presence?.[name] ?? 0;
      mesh.visible = presence > 0.01;
      if (!mesh.visible) return;
      mat.opacity = presence * 0.85;
      const a = env.t * rate + phase;
      // it rises slowly on the thermal and settles again — a long, slow spiral
      const y = spec.y[0] + (Math.sin(env.t * 0.017) * 0.5 + 0.5) * (spec.y[1] - spec.y[0]);
      p.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
      target.set(Math.cos(a - 0.05) * radius, y, Math.sin(a - 0.05) * radius);
      m4.lookAt(p, target, UP);
      rotZ.makeRotationZ(0.32);   // held in a permanent bank — it is circling
      m4.multiply(rotZ);
      m4.scale(SOAR_SCALE);
      m4.setPosition(p);
      mesh.matrix.copy(m4);
    },
  };
}
