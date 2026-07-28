/**
 * scene.js — the visualizer. Two streams, bimodally clustered (visual doc §2.1):
 *
 *   GROUND — the one-world jungle (biomes.js): family-biomes stacked in
 *            altitude, soft, slow, continuous. The camera's height IS the mode
 *            brightness — the set's harmonic story rendered as a journey
 *            upward or downward through the jungle (§4.4).
 *   FIGURE — figure.js: kick shockwave rings and snare shard scatters.
 *            Sharp, near, discrete.
 *            Spent ONLY on anchor-priced positions (synch-point economy §2.2).
 *            Plus shrine.js: the corpus family (§3.5), figure confined to one
 *            place — the undergrowth — chopping this world's own past with the
 *            break's σ machinery.
 *
 * The sidechain rendered four ways (§2.1): kicks duck the ether, shove the
 * camera, press the mist down, and dip the bloom — one coupling constant,
 * everywhere.
 * Clairvoyance: events arrive on the bus BEFORE they sound; we queue and fire
 * them on the shared audio clock. T(t) is sampled 2 s ahead and brightness
 * 4 s ahead, so the light rises — and the camera begins its travel — before
 * anything is audible. Track transitions are camera traversals, free.
 *
 * Post chain (scene_plan roadmap 2 + 5, fancy proposal G1/H1): ground and
 * figure render as separate layer passes — depth of field and bloom belong to
 * the ground only (the eye's "no reverb on the drum bus"), the figure
 * composites over them clinically sharp — then the perform-rail twins (color,
 * posterize, vignette) and the artifact operators (feedback smear, chroma
 * displacement, grain) run over the final frame. Every uniform on that chain
 * comes from look.js, which is pure and tested; this file only moves values.
 * The chain is built in tiers so the frame-time governor can drop optics
 * before it drops pixels, and drop pixels before it drops the groove; if
 * nothing builds (odd backend), we fall back to a direct render.
 *
 * Stream fusion (proposal B3), spent ONCE per set: in the canopy track's
 * golden-ratio window, kicks ignite the ether — the one effect forbidden
 * everywhere else, which is what makes it the climax (§5).
 */
import * as THREE from 'three';
import { WebGPURenderer, PostProcessing } from 'three/webgpu';
import {
  pass, uniform, vec2, vec3, vec4, mix, saturation, luminance, posterize,
  screenUV, clamp, float, int, atan, mod, abs, cos, sin, max,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { anamorphic } from 'three/addons/tsl/display/AnamorphicNode.js';
import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js';
import { dotScreen } from 'three/addons/tsl/display/DotScreenNode.js';
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js';
import * as B from '../bus.js';
import { buildWorld, paletteAt, WORLD_TOP } from './biomes.js';
import { initFigure } from './figure.js';
import { initShrine } from './shrine.js';
import {
  look, orbitAt, seamPush, seamFlashes, seamExhale, seamFov, gradeAt, styleAt, FOV_BASE,
} from './look.js';
import { windAt, weatherAt, lightningAt } from './weather.js';

const { bus, makeRng } = B;
const BAR = B.BAR_SECONDS ?? 240 / 168; // fallback if the bus is mid-refactor

const FIGURE_LAYER = 1; // ground lives on 0; the streams never share a pass

export async function initScene(canvas) {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init(); // falls back to WebGL2 automatically when WebGPU is absent
  const BASE_PR = Math.min(window.devicePixelRatio, 2);
  let pixelRatio = BASE_PR;
  renderer.setPixelRatio(pixelRatio);

  const qp = new URLSearchParams(location.search);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04060a, 0.055);
  const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, 300);
  camera.position.set(0, 2, 12);
  camera.layers.enable(FIGURE_LAYER); // the fallback direct render sees both streams

  // ---- GROUND: the one-world jungle (visual seed independent of the music's) ----
  // The camera goes in because the near field (K5) hangs its fronds on it: the
  // only part of the world that lives in camera space rather than world space.
  const world = buildWorld(scene, makeRng(bus.params.seed * 131 + 7), camera);
  scene.add(camera); // …so the fronds are in the graph even when nothing else moves it

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x223344, 0.6));

  // ---- FIGURE: rings, shards, and the shrine ----
  const figure = initFigure(scene, FIGURE_LAYER);
  let shrine = null;
  if (qp.get('shrine') !== '0') {
    try {
      shrine = initShrine(renderer, scene, FIGURE_LAYER, bus.params.seed);
    } catch (err) {
      console.warn('[visuals] shrine unavailable:', err.message);
    }
  }

  // ---- post chain: per-stream passes, the perform twins, artifact operators ----
  // Two cameras onto one scene, split by layer; synced to the main camera each
  // frame. Built as a function of one flag so the governor can rebuild it a
  // tier down (J1) instead of dropping frames: `optics` adds the depth-of-field
  // pass, which is the most expensive thing on the chain and the only one whose
  // absence costs no compositional meaning.
  const groundCam = camera.clone();
  const figureCam = camera.clone();
  const fx = {
    bloom: null, shift: null,
    smear: uniform(0), grain: uniform(0.1),
    sat: uniform(1), steps: uniform(64), tint: uniform(new THREE.Vector3()), tintAmt: uniform(0),
    dim: uniform(1), vignette: uniform(0.18),
    focus: uniform(14), focal: uniform(1200), bokeh: uniform(1),
    // pizzaz L: the style tier's uniforms. All of them idle at zero except the
    // grade, which idles at identity (gain 1, lift 0, gamma 1).
    t: uniform(0),
    streak: uniform(0), godrays: uniform(0), shimmer: uniform(0),
    kaleido: uniform(0), ink: uniform(0), halftone: uniform(0),
    sunUV: uniform(new THREE.Vector2(0.5, 0.5)),
    lift: uniform(new THREE.Vector3()), gain: uniform(new THREE.Vector3(1, 1, 1)),
    gamma: uniform(1), duo: uniform(new THREE.Vector3(0.6, 0.8, 1)),
  };

  // The kaleidoscopic fold (L5): polar coordinates, angle wrapped into one
  // sector and mirrored. Six segments because that is the symmetry of every
  // growing thing in the world it is folding.
  const KALEIDO_SEGMENTS = 6;
  function kaleidoUV() {
    const c = screenUV.sub(0.5);
    const ang = atan(c.y, c.x);
    const rad = c.length();
    const sector = float(Math.PI * 2 / KALEIDO_SEGMENTS);
    const folded = abs(mod(ang, sector).sub(sector.mul(0.5)));
    return vec2(cos(folded), sin(folded)).mul(rad).add(0.5);
  }

  function buildChain(optics, styles) {
    const groundPass = pass(scene, groundCam);
    const figurePass = pass(scene, figureCam);
    const gtex = groundPass.getTextureNode();
    // G1: DRR rendered. Focus rides the camera's own look-at distance; the
    // focal length closes as the perform filter dives and the wash opens.
    let ground = optics
      ? dof(groundPass, groundPass.getViewZNode(), fx.focus, fx.focal, fx.bokeh)
      : groundPass;

    if (styles) {
      // L8 shimmer and L5 kaleido both resample the ground's own texture, so
      // they run here — before the bloom, so what blooms is what you see. Note
      // that both are GROUND-only: the figure composites over them untouched,
      // for the same reason it escapes the depth of field. The drums are never
      // refracted and never folded; that is what keeps them the drums.
      const wob = vec2(
        sin(screenUV.y.mul(38).add(fx.t.mul(2.1))),
        cos(screenUV.x.mul(31).sub(fx.t.mul(1.7))),
      ).mul(0.014);
      ground = mix(ground, gtex.sample(screenUV.add(wob)), fx.shimmer);
      ground = mix(ground, gtex.sample(kaleidoUV()), fx.kaleido);
    }

    const bloomNode = bloom(ground, 0.6, 0.5, 0);
    let frame_ = ground.add(bloomNode);

    if (styles) {
      // L1: the anamorphic streak — the horizontal smear a real lens puts on a
      // real highlight. Additive over the bloom rather than replacing it: the
      // bloom is the glow, this is the lens the glow is seen through.
      frame_ = frame_.add(anamorphic(ground, 0.92, 3, 32).mul(fx.streak));
      // L2: god rays, radiating from the sun's screen position. The canopy
      // already casts shaft geometry (C1); this is the light those shafts are
      // made of, scattered by the air between them.
      frame_ = frame_.add(radialBlur(gtex, {
        center: fx.sunUV, exposure: float(0.5), decay: float(0.93), count: int(24),
      }).mul(fx.godrays));
    }

    frame_ = frame_.add(figurePass);

    // L6: the grade — how the picture was SHOT, applied before the rail, which
    // is the hand on the mixer of an already-graded picture. Lift/gain/gamma,
    // blended continuously across altitude (look.js gradeAt).
    let rgb = max(frame_.rgb.mul(fx.gain).add(fx.lift), float(0)).pow(fx.gamma);

    // H1 — the perform rail, rendered. Color moves the world (filter), the
    // posterize degrades the medium (crush); both are silent at rest.
    rgb = saturation(rgb, fx.sat);
    // the tint rides luminance, so a filter kill colors the LIGHT and never
    // lifts the blacks — a washed-out grey card is a bug, not a joke
    rgb = mix(rgb, fx.tint.mul(luminance(rgb).mul(2).add(0.12)), fx.tintAmt);
    // quantize in gamma space, rounded rather than floored: crush must cost
    // color resolution, not exposure (a dark scene posterized in linear light
    // simply goes black)
    const enc = rgb.pow(float(1 / 2.2)).add(float(0.5).div(fx.steps));
    rgb = posterize(enc, fx.steps).pow(float(2.2));
    if (styles) {
      // L3 — ink. A Sobel on the composite gives the outline; the wash is the
      // scene's own luminance printed onto paper. The paper is *lit by the
      // world*, not a flat white card, so a dark jungle stays a dark drawing
      // and a lit one blooms into rice paper — the drawing keeps the frame's
      // exposure story instead of replacing it with a page.
      // Both gains are tuned against how dark this world actually is. A Sobel
      // on a jungle at luminance ~0.03 returns gradients near zero, and a
      // paper lit by that luminance is not paper — the first pass of this used
      // 5× and 1.5× and produced a slightly desaturated dark frame that read
      // as nothing at all. The page needs a floor to be a page.
      const edge = clamp(sobel(vec4(rgb, 1)).r.mul(14), 0, 1);
      const paper = vec3(0.88, 0.86, 0.79).mul(luminance(rgb).mul(4).add(0.14));
      rgb = mix(rgb, mix(paper, vec3(0.03, 0.04, 0.05), edge), fx.ink);

      // L4 — halftone. The crush knob's far end: past the knee the medium
      // stops being a frame buffer and becomes print. Duotone, and the second
      // ink is the biome's own palette, so the print is in the colour of the
      // place it is a print of.
      // DotScreenNode returns luminance*10 - 5 + pattern, where pattern spans
      // ±4 — clamping that raw gives a hard three-tone threshold with the dots
      // only visible in a sliver of the luminance range. Scaling it down first
      // widens the band the screen actually dithers across, which is where the
      // dots live. Halftone without visible dots is just posterize again, and
      // the frame already has one of those on the crush knob.
      const dots = clamp(dotScreen(vec4(rgb, 1), float(1.1), float(1.4)).r.mul(0.24).add(0.5), 0, 1);
      rgb = mix(rgb, mix(vec3(0.02, 0.02, 0.03), fx.duo, dots), fx.halftone);
    }

    const vig = clamp(float(1).sub(screenUV.sub(0.5).length().mul(fx.vignette).mul(2)), 0, 1);
    frame_ = vec4(rgb.mul(vig).mul(fx.dim), frame_.a);

    // artifact operators (§3.6), last: the frame's own damage, on w
    frame_ = afterImage(frame_, fx.smear);
    frame_ = rgbShift(frame_, 0);
    const shiftNode = frame_;
    frame_ = film(frame_, fx.grain);

    const post = new PostProcessing(renderer);
    post.outputNode = frame_;
    return { post, bloomNode, shiftNode };
  }

  // Three chain tiers, and the ORDER they are sold in is a judgement, not an
  // accident: styles go first because they are ornament (§ the set survives
  // without ever showing an ink frame), optics second because depth of field
  // is the dictionary's DRR row and losing it costs a sentence, pixels last,
  // and the groove never. J1's ladder, one rung longer.
  const wantOptics = qp.get('dof') !== '0';
  const wantStyles = qp.get('style') !== '0';
  let post = null, opticsOn = false, stylesOn = false;
  function useChain(optics, styles) {
    try {
      const built = buildChain(optics, styles);
      post?.dispose?.();
      post = built.post;
      fx.bloom = built.bloomNode;
      fx.shift = built.shiftNode;
      opticsOn = optics;
      stylesOn = styles;
      return true;
    } catch (err) {
      console.warn(`[visuals] post chain (optics=${optics}, styles=${styles}) unavailable:`, err.message);
      return false;
    }
  }
  // last resort is a direct render — an odd backend costs the look, never the set
  if (!useChain(wantOptics, wantStyles) && !useChain(wantOptics, false) && !useChain(false, false)) post = null;

  // ---- event queue: fire haps on the audio clock (they arrive early) ----
  const pending = [];
  bus.subscribe((evt) => {
    if (evt.type === 'hap' && (evt.sound === 'bd' || evt.sound === 'sd')) pending.push(evt);
  });

  let duck = 0;        // the coupling constant, rendered
  let camY = 2;        // smoothed altitude — the traversal
  let camDrift = 0;    // smoothed lateral motion signature (continuity layer, §4.2)
  let fusionNow = false;
  let arrival = 0;     // seam 'landing' impulse, decaying (I2)
  let wasSeam = false;
  let quality = 1;     // the governor's dial, read by the heavy biomes (J1)
  let inkAmt = 0;      // smoothed style target: a medium fades in, it never cuts (L3)
  let camFov = FOV_BASE;               // smoothed dolly zoom on landings (M1)
  let lastSection = 'groove';          // exposed for the harness's style assertions
  const SUN = new THREE.Vector3();     // scratch: the god-ray origin, projected
  const scratchColor = new THREE.Color();

  function fire(evt) {
    const x = camera.position.x + (Math.random() - 0.5) * 8;
    const z = camera.position.z - 7 - Math.random() * 5;
    if (evt.sound === 'bd') {
      figure.kick(x, camY, z, evt.gain ?? 1, fusionNow);
      duck = 1;                        // kick ducks the ether — heaven touched
      world.onDownbeat();              // blooms: growth's one rhythm contact
      if (fusionNow) world.ignite();   // the climax: figure ignites ground
    } else {
      figure.snare(x, camY + Math.random() * 2, z, evt.gain ?? 1);
    }
  }

  // ---- debug surface (E2 + J2): ?altitude= / ?biome= / ?shrine=0 / ?dof=0,
  // plus setAltitude/setLateral/isolate/shrine on window.jungle.visuals ----
  let altitudeOverride = null;
  let lateralOverride = null; // pins the wander so a shot is repeatable
  let shrineForce = null;     // debug override of the governor's shrine tier
  let weatherOverride = null; // pins the weather (K/M2) so a rain shot repeats
  let flashOverride = null;   // holds a strike open long enough to photograph
  let styleForce = null;      // pins the style tier against the quality governor
  if (qp.has('altitude')) altitudeOverride = parseFloat(qp.get('altitude'));
  if (qp.get('biome')) world.isolate(qp.get('biome'));
  if (qp.has('weather')) {
    try { weatherOverride = JSON.parse(qp.get('weather')); } catch { /* ignore */ }
  }
  (window.jungle ??= {}).visuals = {
    backend: renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl',
    get optics() { return opticsOn; },
    get styles() { return stylesOn; },
    get quality() { return quality; },
    /** Pin the weather: {mist, rain, wind, storm}, or null to hand it back. */
    setWeather(w) { weatherOverride = w; },
    /** Hold a lightning strike at `f` (0..1), or null for the real schedule. */
    strike(f = 1) { flashOverride = f; },
    /**
     * Force the style tier on/off; null hands it back to the governor. It has
     * to PIN, not just set: on a software rasterizer the governor sheds this
     * tier within seconds, so a harness that merely switched it on would go on
     * to photograph a chain that had already dropped it (which is exactly what
     * the first style sweep did — the shots looked inert and the boot log said
     * `styles=true`, because it had been true at boot).
     */
    setStyles(on) {
      styleForce = on;
      if (on != null && on !== stylesOn) useChain(opticsOn, on);
    },
    setAltitude(v, snap = false) {
      altitudeOverride = v;
      if (snap && v != null) camY = 2 + v * (WORLD_TOP - 8);
    },
    /** Freeze the lateral wander (sway + band orbit) at x, or null to release. */
    setLateral(x) { lateralOverride = x; },
    isolate(name) { world.isolate(name); },
    /** Force the shrine on/off; null hands it back to the governor (J1). */
    shrine(on) { shrineForce = on; if (on != null) shrine?.setEnabled(on); },
    /**
     * What the style tier is actually doing this frame (L). A style bound to a
     * section is easy to *believe* is on while the uniform sits at zero, so
     * the harness asserts it rather than trusting the screenshot.
     */
    debugStyle() {
      return {
        stylesOn, section: lastSection,
        ink: +fx.ink.value.toFixed(3), halftone: +fx.halftone.value.toFixed(3),
        kaleido: +fx.kaleido.value.toFixed(3), streak: +fx.streak.value.toFixed(3),
        godrays: +fx.godrays.value.toFixed(3), shimmer: +fx.shimmer.value.toFixed(3),
      };
    },
    /**
     * The near field's fronds (K5) — the only objects in the world that live
     * in camera space, which makes them the only ones you cannot inspect by
     * walking the scene graph from a biome group.
     */
    debugNearField() {
      return camera.children.map((c) => ({
        visible: c.visible,
        pos: c.position.toArray().map((v) => +v.toFixed(2)),
        scale: +c.scale.x.toFixed(2),
        width: c.geometry?.parameters?.width,
        color: c.material?.color?.getHexString?.(),
        opacity: c.material?.opacity,
        hasMap: !!c.material?.map,
        mapColorSpace: c.material?.map?.colorSpace,
      }));
    },
    debugShrine() {
      if (!shrine) return null;
      const g = shrine.group;
      return { visible: g.visible, recording: shrine.recording, pos: g.position.toArray(),
        screenOpacity: g.children[0].material.opacity, camY, camX: camera.position.x };
    },
  };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- adaptive quality (proposal E1 + J1): trade pixels and optics, never
  // the groove. Three levers, spent in order of how little they mean: sim/
  // particle work first, then the DoF tier, then pixel ratio last.
  let fpsEma = 60, qTimer = 0, tierHold = 0;

  let last = performance.now() / 1000;
  function frame() {
    const wall = performance.now() / 1000;
    const dt = Math.min(0.1, wall - last);
    last = wall;
    fpsEma += (1 / Math.max(dt, 1e-3) - fpsEma) * 0.05;
    qTimer += dt;
    tierHold = Math.max(0, tierHold - dt);
    if (qTimer > 2) {
      qTimer = 0;
      quality = fpsEma < 45 ? Math.max(0.4, quality - 0.2)
        : fpsEma > 57 ? Math.min(1, quality + 0.1) : quality;
      if (tierHold === 0 && post) {
        // sell the ornament first, the sentence second — and buy them back in
        // the reverse order, so the frame never has styles without optics
        const styleLocked = styleForce != null;
        if (fpsEma < 42 && stylesOn && quality <= 0.6 && !styleLocked) {
          if (useChain(opticsOn, false)) tierHold = 15;
        } else if (fpsEma < 40 && opticsOn && !stylesOn && quality <= 0.4) {
          if (useChain(false, false)) tierHold = 15;
        } else if (fpsEma > 58 && quality >= 1) {
          if (!opticsOn && wantOptics) { if (useChain(true, stylesOn)) tierHold = 15; }
          else if (!stylesOn && wantStyles && opticsOn && !styleLocked) {
            if (useChain(opticsOn, true)) tierHold = 15;
          }
        }
      }
      const next = fpsEma < 38 ? Math.max(0.75, pixelRatio - 0.25)
        : fpsEma > 55 ? Math.min(BASE_PR, pixelRatio + 0.25) : pixelRatio;
      if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(pixelRatio); resize(); }
      if (shrineForce == null) shrine?.setEnabled(qp.get('shrine') !== '0' && quality > 0.5);
    }

    const t = bus.now();
    const audioNow = bus._now();
    const T = bus.tensionAt(t);
    const Tf = bus.tensionAt(t + 2);      // clairvoyance: light leads the sound
    const b = bus.brightnessAt(t);
    const bAhead = bus.brightnessAt(t + 4); // the camera departs before the mode does
    const drift = bus.drift(t);
    const trackInfo = bus.trackAt(t);
    const seam = bus.seamAt(t);           // carries the D18 flavor
    const w = bus.wildnessAt(t);

    // section name (bus D11) — guarded: the bus may be mid-refactor next door
    let section = 'groove';
    try { section = B.sectionAt(Math.floor(trackInfo.tLocal / BAR), trackInfo.track.bars).name; } catch { /* keep default */ }
    lastSection = section;

    // stream fusion window: canopy's golden-ratio bar, ±4 bars (B3). The
    // amount (not just the fact) drives the kaleidoscopic fold (L5), which is
    // why it is now a ramp: the symmetry closes in and opens back out.
    const fusionWin = (4 * BAR) / trackInfo.track.seconds;
    const fusionAmt = trackInfo.track.name === 'canopy'
      ? Math.max(0, 1 - Math.abs(trackInfo.phase - 0.618) / fusionWin) : 0;
    fusionNow = fusionAmt > 0;

    // ---- the weather (M2) and the wind (K1): one atmosphere, sampled by all
    // Weather crossfades across a seam on the same smoothstep the brightness
    // walk uses, so the incoming track's air arrives before its downbeat does.
    const seamBlend = seam.active
      ? seam.progress * seam.progress * (3 - 2 * seam.progress) : 0;
    const weather = weatherOverride ?? weatherAt({
      t, index: trackInfo.index, toIndex: seam.toIndex, blend: seamBlend, T,
      seed: bus.params.seed,
    });
    const strike = lightningAt(t, bus.params.seed, weather.storm);
    const flash = flashOverride ?? strike.flash;
    // one closure per frame, so every biome samples the SAME field at its own
    // position — the whole point of K1, and the reason it is a function
    const wind = (x, y, z) => windAt(t, x, y, z, {
      drift, strength: weather.wind, top: WORLD_TOP,
    });

    // fire due events (arrived ahead of time, keyed to the audio clock)
    while (pending.length && pending[0].when <= audioNow + dt) fire(pending.shift());

    duck = Math.max(0, duck - dt * 6);

    // ---- the traversal: altitude ← brightness walk (transition = travel) ----
    const altitude01 = altitudeOverride ?? bAhead;
    const targetY = 2 + altitude01 * (WORLD_TOP - 8);
    camY += (targetY - camY) * Math.min(1, dt * 0.4); // slow — a journey, not a cut
    camDrift += (drift * 2 - camDrift) * Math.min(1, dt * 0.8);

    // ---- seam choreography (D3 + I2): the push-in is staged by the seam's
    // seeded flavor, and the boundary is an ARRIVAL only for a landing. The
    // flash fires when the window we were inside ends — bar-exact seams make
    // this a lookup, not an estimate.
    const flourish = seamPush(seam);
    if (wasSeam && !seam.active && seamFlashes(wasSeam)) arrival = 1;
    wasSeam = seam.active ? seam : false;
    arrival = Math.max(0, arrival - dt * 1.1);
    const exhale = seamExhale(seam);

    // ---- camera waypoints (I1): a per-band lateral orbit, blended by
    // altitude and superimposed on the 1/f sway — the motion signature (the
    // strongest continuity element, §4.2) survives every boundary.
    const orbit = orbitAt(altitude01, t, drift);
    const lateral = lateralOverride ?? (camDrift + orbit.x);
    camera.position.x = lateral;
    camera.position.y = camY - duck * 0.18;           // the kick shoves the camera
    camera.position.z = 12 + (lateralOverride == null ? orbit.z : 0) - 4.5 * flourish;
    // pitch follows altitude: gaze down into the roots at the bottom of the
    // world, up toward the light near the top — the register is where you look
    const lookAt = new THREE.Vector3(lateral * 0.5, camY + (-3 + 6 * b), 0);
    camera.lookAt(lookAt);
    camera.rotateZ(0.1 * flourish);

    // M1 — the dolly zoom, on landings only. Smoothed rather than assigned:
    // the push-in ends the instant the boundary passes, and a 14° snap back on
    // one frame reads as a dropped frame instead of a release. Decaying over
    // ~0.4 s makes the frame relax after the hit, which is what the arrival
    // flash is already doing to the exposure.
    camFov += (seamFov(seam) - camFov) * Math.min(1, dt * 2.5);
    if (Math.abs(camera.fov - camFov) > 0.005) {
      camera.fov = camFov;
      camera.updateProjectionMatrix();
    }

    // ---- world + figure state: bus signals only ----
    const env = {
      t, T, Tf, b, drift, duck, w, quality,
      trackPhase: trackInfo.phase, trackIndex: trackInfo.index,
      cam: camera.position,
      wind, weather, flash,   // the shared atmosphere (K1/K7/M2)
    };
    world.update(dt, env);
    figure.update(dt);

    // palette center of gravity + fog: the continuity layer (§4.2)
    const col = paletteAt(camY / WORLD_TOP);
    light.color = col;
    light.position.set(0, 5 + b * 25, 5);             // phrygian roots … lydian sky
    // K7: a strike is a second light source, from a bearing the storm chose —
    // brief, hard, and from the side, which is what makes the world read as
    // solid for the one frame it lasts
    if (flash > 0.001) {
      light.intensity = 1.2 + flash * 7;
      light.position.set(Math.cos(strike.azimuth) * 60, 30 + b * 25, Math.sin(strike.azimuth) * 60);
    } else {
      light.intensity = 1.2;
    }

    // the whole look, from one pure function (G2): bus params + env in,
    // uniforms out. Nothing here decides anything; it only assigns.
    const L = look(bus.params, {
      T, Tf, b, duck, w, fusion: fusionNow, arrival, exhale, flash, fusionAmt,
      focusDist: camera.position.distanceTo(lookAt),
    });
    const style = styleAt({ section, fusionAmt }, bus.params);
    // the one style that must not snap: a section boundary is a hard edge, and
    // a medium that changes on a frame reads as a dropped frame (§9.1)
    inkAmt += (style.ink - inkAmt) * Math.min(1, dt * 0.9);
    const grade = gradeAt(camY / WORLD_TOP);
    scene.fog.color.copy(col.clone().multiplyScalar(0.12));
    scene.fog.density = L.fogDensity;

    if (post) {
      // Sync the per-stream cameras, then split them by layer. The `false` is
      // load-bearing: Object3D.copy() clones CHILDREN by default, and since
      // K5 the camera has children (the near-field fronds) — a recursive copy
      // grafts three more frond meshes onto each pass camera every frame,
      // forever. They pile up in the ground pass until the frame is nothing
      // but leaves. The fronds still render because they hang off `camera`
      // inside the scene graph, not off these two.
      groundCam.copy(camera, false); groundCam.layers.set(0);
      figureCam.copy(camera, false); figureCam.layers.set(FIGURE_LAYER);
      fx.bloom.strength.value = L.bloom;
      fx.smear.value = L.smear;
      fx.shift.amount.value = L.shift;
      fx.grain.value = L.grain;
      fx.sat.value = L.sat;
      fx.steps.value = L.steps;
      fx.tint.value.set(L.tint[0], L.tint[1], L.tint[2]);
      fx.tintAmt.value = L.tintAmt;
      fx.dim.value = L.dim;
      fx.vignette.value = L.vignette;
      fx.focus.value = L.focus;
      fx.focal.value = L.focal;
      fx.bokeh.value = L.bokeh;
      // L6: the grade is always on and always continuous in altitude
      fx.lift.value.set(grade.lift[0], grade.lift[1], grade.lift[2]);
      fx.gain.value.set(grade.gain[0], grade.gain[1], grade.gain[2]);
      fx.gamma.value = grade.gamma;
      // These are written every frame whether or not the style chain is built:
      // they are a handful of scalar assignments, and a uniform frozen at the
      // value it happened to hold when the governor dropped the tier is a
      // debugging trap (it reads as "the style is half on" when the style is
      // not in the chain at all).
      {
        fx.t.value = t;
        fx.streak.value = L.streak;
        fx.shimmer.value = L.shimmer;
        fx.ink.value = inkAmt;
        fx.halftone.value = style.halftone;
        fx.kaleido.value = style.kaleido;
        // the god-ray origin is the top of the world, projected. Behind the
        // camera or far off-screen it fades out rather than smearing from an
        // edge — a light source you cannot see does not scatter toward you.
        SUN.set(0, WORLD_TOP + 6, 0).project(camera);
        fx.sunUV.value.set(SUN.x * 0.5 + 0.5, SUN.y * 0.5 + 0.5);
        const offScreen = Math.max(Math.abs(SUN.x), Math.abs(SUN.y));
        const visible = SUN.z < 1 ? Math.max(0, 1 - Math.max(0, offScreen - 0.8) * 2.5) : 0;
        fx.godrays.value = L.godrays * visible;
        // the halftone's second ink is the biome's own colour
        scratchColor.copy(col).multiplyScalar(3.2);
        fx.duo.value.set(scratchColor.r, scratchColor.g, scratchColor.b);
      }
      // the shrine records the world as it stands this frame, then cuts —
      // before the composite, so what it shows is genuinely the past
      shrine?.update(dt, env);
      post.render();
    } else {
      shrine?.update(dt, env);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { renderer, scene };
}
