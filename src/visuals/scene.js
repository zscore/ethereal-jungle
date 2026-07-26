/**
 * scene.js — visualizer stub. Two streams, bimodally clustered (visual doc §2.1):
 *
 *   GROUND — a vast slow particle ether + fog. Soft, far, continuous.
 *            Palette temperature & light altitude follow mode brightness;
 *            fog density follows (inverse) tension; drift(t) sways the camera.
 *   FIGURE — small hard-edged flashes on drum events. Sharp, near, discrete.
 *            Spent ONLY on anchor-priced positions (synch-point economy §2.2):
 *            here, kicks and snares — the break's interior chaos goes unmarked.
 *
 * The sidechain rendered twice (§2.1): kicks duck the ether's bloom/exposure.
 * Clairvoyance: events arrive on the bus BEFORE they sound; we queue and fire
 * them on the shared audio clock. T(t) is sampled 2 s into the future to let
 * the light rise before the climax is audible.
 */
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { bus } from '../bus.js';

const COLD = new THREE.Color('#20315e'); // dark modes: deep blue-violet
const WARM = new THREE.Color('#ffd9a0'); // lydian: high golden light

export async function initScene(canvas) {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init(); // falls back to WebGL2 automatically when WebGPU is absent
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04060a, 0.055);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 2, 10);

  // ---- GROUND stream: the ether ----
  const N = 4000;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3 + 0] = (Math.random() - 0.5) * 80;
    pos[i * 3 + 1] = Math.random() * 30;         // register → elevation
    pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }
  const etherGeo = new THREE.BufferGeometry();
  etherGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const etherMat = new THREE.PointsMaterial({
    size: 0.12, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ether = new THREE.Points(etherGeo, etherMat);
  scene.add(ether);

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
    scene.add(m);
    figures.push({ mesh: m, life: 0 });
  }
  let poolIdx = 0;

  // ---- event queue: fire haps on the audio clock (they arrive early) ----
  const pending = [];
  bus.subscribe((evt) => {
    if (evt.type === 'hap' && (evt.sound === 'bd' || evt.sound === 'sd')) pending.push(evt);
  });

  let duck = 0; // the coupling constant, rendered

  function spawnFigure(evt) {
    const f = figures[poolIdx++ % POOL];
    f.mesh.visible = true;
    f.life = 1;
    const spread = evt.sound === 'bd' ? 3 : 6;
    f.mesh.position.set((Math.random() - 0.5) * spread * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * spread);
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
    const Tfuture = bus.tensionAt(t + 2); // clairvoyance: light leads the sound
    const b = bus.params.modeBrightness;
    const drift = bus.drift(t);

    // fire due events (arrived ahead of time, keyed to the audio clock)
    while (pending.length && pending[0].when <= audioNow + dt) spawnFigure(pending.shift());

    duck = Math.max(0, duck - dt * 6);

    // ground: palette temperature + altitude of the light ← brightness
    const col = COLD.clone().lerp(WARM, b);
    etherMat.color = col;
    etherMat.opacity = (0.35 + 0.35 * Tfuture) * (1 - duck * 0.45);
    light.color = col;
    light.position.set(0, 5 + b * 25, 5); // phrygian roots … lydian sky
    scene.fog.density = 0.075 - 0.04 * T;

    // ether motion: slow, 1/f-swayed; speed breathes gently with T
    ether.rotation.y += dt * (0.01 + 0.04 * T);
    ether.position.y = drift * 1.5;
    camera.position.x = drift * 2;
    camera.position.y = 2 + b * 3 - duck * 0.18; // the kick shoves the camera
    camera.lookAt(0, 2 + b * 2, 0);

    // figure decay: fast, discrete
    for (const f of figures) {
      if (!f.mesh.visible) continue;
      f.life -= dt * 7;
      if (f.life <= 0) { f.mesh.visible = false; continue; }
      f.mesh.material.opacity = f.life;
      f.mesh.rotation.y += dt * 4;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { renderer, scene };
}
