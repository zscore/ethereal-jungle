/**
 * scene.js — the visualizer. Two streams, bimodally clustered (visual doc §2.1):
 *
 *   GROUND — the one-world jungle (biomes.js): family-biomes stacked in
 *            altitude, soft, slow, continuous. The camera's height IS the mode
 *            brightness — the set's harmonic story rendered as a journey
 *            upward or downward through the jungle (§4.4).
 *   FIGURE — figure.js: kick shockwave rings, snare shard scatters, and the
 *            recurring glyph (peak sections only). Sharp, near, discrete.
 *            Spent ONLY on anchor-priced positions (synch-point economy §2.2).
 *
 * The sidechain rendered three ways (§2.1): kicks duck the ether, shove the
 * camera, and dip the bloom — one coupling constant, everywhere.
 * Clairvoyance: events arrive on the bus BEFORE they sound; we queue and fire
 * them on the shared audio clock. T(t) is sampled 2 s ahead and brightness
 * 4 s ahead, so the light rises — and the camera begins its travel — before
 * anything is audible. Track transitions are camera traversals, free.
 *
 * Post chain (scene_plan roadmap 2 + 5): ground and figure render as separate
 * layer passes — bloom belongs to the ground only and the kick ducks it, the
 * figure composites over it clinically sharp — then the artifact operators
 * (feedback smear, chroma displacement, grain/scanline) run over the final
 * frame with amount = wildness. If the post chain can't build (odd backend),
 * we fall back to a direct render.
 *
 * Stream fusion (proposal B3), spent ONCE per set: in the canopy track's
 * golden-ratio window, kicks ignite the ether — the one effect forbidden
 * everywhere else, which is what makes it the climax (§5).
 */
import * as THREE from 'three';
import { WebGPURenderer, PostProcessing } from 'three/webgpu';
import { pass, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import * as B from '../bus.js';
import { buildWorld, paletteAt, WORLD_TOP } from './biomes.js';
import { initFigure } from './figure.js';

const { bus, makeRng } = B;
const BAR = B.BAR_SECONDS ?? 240 / 168; // fallback if the bus is mid-refactor

const FIGURE_LAYER = 1; // ground lives on 0; the streams never share a pass

export async function initScene(canvas) {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init(); // falls back to WebGL2 automatically when WebGPU is absent
  const BASE_PR = Math.min(window.devicePixelRatio, 2);
  let pixelRatio = BASE_PR;
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04060a, 0.055);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  camera.position.set(0, 2, 12);
  camera.layers.enable(FIGURE_LAYER); // the fallback direct render sees both streams

  // ---- GROUND: the one-world jungle (visual seed independent of the music's) ----
  const world = buildWorld(scene, makeRng(bus.params.seed * 131 + 7));

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x223344, 0.6));

  // ---- FIGURE: rings, shards, the glyph ----
  const figure = initFigure(scene, FIGURE_LAYER);

  // ---- post chain: per-stream passes + artifact operators (roadmap 2 + 5) ----
  // Two cameras onto one scene, split by layer; synced to the main camera each
  // frame. Bloom applies to the ground pass only and its strength is ducked by
  // the kick — the sidechain rendered a third way. The composite then passes
  // through the artifact operators, all silent at low wildness.
  const groundCam = camera.clone();
  const figureCam = camera.clone();
  let post = null;
  const fx = {};
  try {
    const groundPass = pass(scene, groundCam);
    const figurePass = pass(scene, figureCam);
    fx.bloom = bloom(groundPass, 0.6, 0.5, 0);
    fx.smear = uniform(0);   // afterimage damp: feedback smear, high-w stasis only
    fx.grain = uniform(0.1); // film intensity
    let frame_ = groundPass.add(fx.bloom).add(figurePass);
    frame_ = afterImage(frame_, fx.smear);
    frame_ = rgbShift(frame_, 0);
    fx.shift = frame_; // .amount uniform lives on the node
    frame_ = film(frame_, fx.grain);
    post = new PostProcessing(renderer);
    post.outputNode = frame_;
  } catch (err) {
    console.warn('[visuals] post chain unavailable, direct render:', err.message);
    post = null;
  }

  // ---- event queue: fire haps on the audio clock (they arrive early) ----
  const pending = [];
  bus.subscribe((evt) => {
    if (evt.type === 'hap' && (evt.sound === 'bd' || evt.sound === 'sd')) pending.push(evt);
  });

  let duck = 0;        // the coupling constant, rendered
  let camY = 2;        // smoothed altitude — the traversal
  let camDrift = 0;    // smoothed lateral motion signature (continuity layer, §4.2)
  let fusionNow = false;

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

  // ---- debug surface (proposal E2): ?altitude= / ?biome= + console API ----
  let altitudeOverride = null;
  const qp = new URLSearchParams(location.search);
  if (qp.has('altitude')) altitudeOverride = parseFloat(qp.get('altitude'));
  if (qp.get('biome')) world.isolate(qp.get('biome'));
  (window.jungle ??= {}).visuals = {
    backend: renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl',
    setAltitude(v, snap = false) {
      altitudeOverride = v;
      if (snap && v != null) camY = 2 + v * (WORLD_TOP - 8);
    },
    isolate(name) { world.isolate(name); },
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

  // ---- adaptive quality (proposal E1): trade pixels, never the groove ----
  let fpsEma = 60, qTimer = 0;

  let last = performance.now() / 1000;
  function frame() {
    const wall = performance.now() / 1000;
    const dt = Math.min(0.1, wall - last);
    last = wall;
    fpsEma += (1 / Math.max(dt, 1e-3) - fpsEma) * 0.05;
    qTimer += dt;
    if (qTimer > 2) {
      qTimer = 0;
      const next = fpsEma < 40 ? Math.max(0.75, pixelRatio - 0.25)
        : fpsEma > 55 ? Math.min(BASE_PR, pixelRatio + 0.25) : pixelRatio;
      if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(pixelRatio); resize(); }
    }

    const t = bus.now();
    const audioNow = bus._now();
    const T = bus.tensionAt(t);
    const Tf = bus.tensionAt(t + 2);      // clairvoyance: light leads the sound
    const b = bus.brightnessAt(t);
    const bAhead = bus.brightnessAt(t + 4); // the camera departs before the mode does
    const drift = bus.drift(t);
    const trackInfo = bus.trackAt(t);
    const seam = bus.seamAt(t);

    // section name (bus D11) — guarded: the bus may be mid-refactor next door
    let section = 'groove';
    try { section = B.sectionAt(Math.floor(trackInfo.tLocal / BAR), trackInfo.track.bars).name; } catch { /* keep default */ }

    // stream fusion window: canopy's golden-ratio bar, ±4 bars (B3)
    fusionNow = trackInfo.track.name === 'canopy'
      && Math.abs(trackInfo.phase - 0.618) < (4 * BAR) / trackInfo.track.seconds;

    // fire due events (arrived ahead of time, keyed to the audio clock)
    while (pending.length && pending[0].when <= audioNow + dt) fire(pending.shift());

    duck = Math.max(0, duck - dt * 6);

    // ---- the traversal: altitude ← brightness walk (transition = travel) ----
    const altitude01 = altitudeOverride ?? bAhead;
    const targetY = 2 + altitude01 * (WORLD_TOP - 8);
    camY += (targetY - camY) * Math.min(1, dt * 0.4); // slow — a journey, not a cut
    camDrift += (drift * 2 - camDrift) * Math.min(1, dt * 0.8);

    // seam flourish (proposal D3): late-seam push-in + slight roll, released
    // exactly on the boundary (bar-exact seams make the release a lookup)
    const flourish = seam.active && seam.progress > 0.6 ? (seam.progress - 0.6) / 0.4 : 0;
    camera.position.x = camDrift;
    camera.position.y = camY - duck * 0.18;           // the kick shoves the camera
    camera.position.z = 12 - 4.5 * flourish;
    // pitch follows altitude: gaze down into the roots at the bottom of the
    // world, up toward the light near the top — the register is where you look
    camera.lookAt(camDrift * 0.5, camY + (-3 + 6 * b), 0);
    camera.rotateZ(0.1 * flourish);

    // ---- world + figure state: bus signals only ----
    const env = {
      t, T, Tf, b, drift, duck,
      trackPhase: trackInfo.phase, trackIndex: trackInfo.index,
      cam: camera.position,
    };
    world.update(dt, env);
    figure.update(dt);
    figure.updateGlyph(dt, env, camDrift, camY, section === 'peak');

    // palette center of gravity + fog: the continuity layer (§4.2)
    const col = paletteAt(camY / WORLD_TOP);
    light.color = col;
    light.position.set(0, 5 + b * 25, 5);             // phrygian roots … lydian sky
    scene.fog.color.copy(col.clone().multiplyScalar(0.12));
    scene.fog.density = 0.075 - 0.04 * T;

    if (post) {
      // sync the per-stream cameras, then split them by layer
      groundCam.copy(camera); groundCam.layers.set(0);
      figureCam.copy(camera); figureCam.layers.set(FIGURE_LAYER);
      const w = bus.wildnessAt(t);
      fx.bloom.strength.value = (0.4 + 0.5 * Tf) * (1 - duck * 0.6) + (fusionNow ? 0.15 : 0);
      fx.smear.value = Math.max(0, w - 0.55) * 1.8;                  // smear exists only in high-w stasis (§5)
      fx.shift.amount.value = w * w * 0.004;
      fx.grain.value = 0.05 + 0.3 * w;
      post.render();
    } else {
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { renderer, scene };
}
