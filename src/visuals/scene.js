/**
 * scene.js — the visualizer. Two streams, bimodally clustered (visual doc §2.1):
 *
 *   GROUND — the one-world jungle (biomes.js): four family-biomes stacked in
 *            altitude, soft, slow, continuous. The camera's height IS the mode
 *            brightness — the set's harmonic story rendered as a journey
 *            upward or downward through the jungle (§4.4).
 *   FIGURE — small hard-edged flashes on drum events. Sharp, near, discrete.
 *            Spent ONLY on anchor-priced positions (synch-point economy §2.2):
 *            kicks and snares — the break's interior chaos goes unmarked.
 *
 * The sidechain rendered twice (§2.1): kicks duck the ether AND shove the
 * camera — one coupling constant, both media, same as the audio-side duck.
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
 */
import * as THREE from 'three';
import { WebGPURenderer, PostProcessing } from 'three/webgpu';
import { pass, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { bus, makeRng } from '../bus.js';
import { buildWorld, paletteAt, WORLD_TOP } from './biomes.js';

const FIGURE_LAYER = 1; // ground lives on 0; the streams never share a pass

export async function initScene(canvas) {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init(); // falls back to WebGL2 automatically when WebGPU is absent
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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

  // ---- FIGURE stream: pooled flash cubes ----
  const POOL = 12;
  const figures = [];
  const figGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < POOL; i++) {
    const m = new THREE.Mesh(
      figGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    m.visible = false;
    m.layers.set(FIGURE_LAYER); // figure stream: its own pass, no bloom, no softness
    scene.add(m);
    figures.push({ mesh: m, life: 0 });
  }
  let poolIdx = 0;

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

  function spawnFigure(evt, altitude) {
    const f = figures[poolIdx++ % POOL];
    f.mesh.visible = true;
    f.life = 1;
    const spread = evt.sound === 'bd' ? 3 : 6;
    f.mesh.position.set(
      camera.position.x + (Math.random() - 0.5) * spread * 2,
      altitude - 1 + Math.random() * 3, // the figure lives where the camera lives
      camera.position.z - 6 - Math.random() * spread,
    );
    const s = evt.sound === 'bd' ? 0.9 : 0.5;
    f.mesh.scale.setScalar(s * (0.6 + evt.gain));
    if (evt.sound === 'bd') duck = 1; // kick ducks the ether — heaven touched
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now() / 1000;
  function frame() {
    const wall = performance.now() / 1000;
    const dt = Math.min(0.1, wall - last);
    last = wall;

    const t = bus.now();
    const audioNow = bus._now();
    const T = bus.tensionAt(t);
    const Tf = bus.tensionAt(t + 2);      // clairvoyance: light leads the sound
    const b = bus.brightnessAt(t);
    const bAhead = bus.brightnessAt(t + 4); // the camera departs before the mode does
    const drift = bus.drift(t);

    // fire due events (arrived ahead of time, keyed to the audio clock)
    while (pending.length && pending[0].when <= audioNow + dt) spawnFigure(pending.shift(), camY);

    duck = Math.max(0, duck - dt * 6);

    // ---- the traversal: altitude ← brightness walk (transition = travel) ----
    const targetY = 2 + bAhead * (WORLD_TOP - 8);
    camY += (targetY - camY) * Math.min(1, dt * 0.4); // slow — a journey, not a cut
    camDrift += (drift * 2 - camDrift) * Math.min(1, dt * 0.8);
    camera.position.x = camDrift;
    camera.position.y = camY - duck * 0.18;           // the kick shoves the camera
    camera.position.z = 12;
    camera.lookAt(camDrift * 0.5, camY + 2, 0);       // always climbing toward the light

    // ---- world state: one env object, bus signals only ----
    world.update(dt, { t, T, Tf, b, drift, duck });

    // palette center of gravity + fog: the continuity layer (§4.2)
    const altitude01 = camY / WORLD_TOP;
    const col = paletteAt(altitude01);
    light.color = col;
    light.position.set(0, 5 + b * 25, 5);             // phrygian roots … lydian sky
    scene.fog.color.copy(col.clone().multiplyScalar(0.12));
    scene.fog.density = 0.075 - 0.04 * T;

    // figure decay: fast, discrete
    for (const f of figures) {
      if (!f.mesh.visible) continue;
      f.life -= dt * 7;
      if (f.life <= 0) { f.mesh.visible = false; continue; }
      f.mesh.material.opacity = f.life;
      f.mesh.rotation.y += dt * 4;
    }

    if (post) {
      // sync the per-stream cameras, then split them by layer
      groundCam.copy(camera); groundCam.layers.set(0);
      figureCam.copy(camera); figureCam.layers.set(FIGURE_LAYER);
      const w = bus.wildnessAt(t);
      fx.bloom.strength.value = (0.4 + 0.5 * Tf) * (1 - duck * 0.6); // ducked bloom, lit ahead of the sound
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
