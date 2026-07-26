/**
 * biomes.js — the one-world solution (visual doc §4.4).
 *
 * One continuous world in which each visualizer family governs an altitude
 * band. Altitude IS mode brightness: phrygian among the roots, lydian in the
 * light above the canopy. A transition between tracks is a camera traversal,
 * so every boundary is visually legal by construction, and the set is one
 * long shot.
 *
 * Band map (world y):        family (visual doc §3):
 *   roots    0–12            local-rule — a real Gray–Scott sim drives the pulse
 *   floor   10–24            growth — vines GROW over each track's arc; blooms on downbeats
 *   canopy  22–42            fields — flow-field ether; the kick makes it flinch
 *   sky     40–62            self-similar — nested shells + aurora, ascent without arrival
 * plus the air (altitude-graded background), canopy light shafts, and a mist
 * card stack through the floor/canopy bands (the cheapest real volume there
 * is — parallax the fog cannot give you).
 *
 * plus the LIVING layer (pizzaz proposal K): fireflies flocking through the
 * floor and canopy, leaves on the growing branches, rain and a black pool, a
 * mycelial net signalling under the roots, and a near field of motes and
 * fronds right at the lens — the depth cue the frame never had.
 *
 * Every biome is GROUND stream: soft, slow, continuous. Rhythm touches the
 * ground in exactly two licensed places: downbeat blooms (growth's "events on
 * the surface", §3.1) and the kick's duck/flinch (the coupling constant).
 * Each biome reads only env — bus signals, never audio:
 *   env = { t, T, Tf, b, drift, duck, trackPhase, trackIndex, cam, quality,
 *           wind(x,y,z), weather, flash }
 * `quality` (0.4…1) is the governor's dial (J1): biomes spend it on work the
 * eye can't name — sim steps, particle population — never on the composition.
 *
 * `wind` and `weather` (K1/M2, `weather.js`) are the one thing every biome
 * shares. Before them each biome breathed on its own private sine and the
 * world read as a stack of dioramas; now a gust crosses the floor, tips the
 * shafts, shears the mist and bends the ether *as one event moving through a
 * place*. Any new biome should sample the field rather than invent a clock.
 */
import * as THREE from 'three';

export const WORLD_TOP = 62;

// per-band palette anchors: deep violet roots → mossy floor → blue-grey canopy → gold sky
export const BAND_COLORS = [
  new THREE.Color('#1b1030'), // roots
  new THREE.Color('#16301f'), // floor
  new THREE.Color('#20315e'), // canopy
  new THREE.Color('#ffd9a0'), // sky
];

/** Palette center of gravity at altitude a ∈ [0,1] — the continuity layer's slow axis. */
export function paletteAt(a) {
  const x = a * (BAND_COLORS.length - 1);
  const i = Math.min(BAND_COLORS.length - 2, Math.floor(x));
  return BAND_COLORS[i].clone().lerp(BAND_COLORS[i + 1], x - i);
}

// WebGPU renders THREE.Points as fixed 1-px primitives (point size is not in
// the WebGPU spec), so every "glow dot" cloud is an InstancedMesh of tiny
// spheres instead — sized identically on WebGPU and the WebGL2 fallback.
function glowCloud(positions, color, radius) {
  const n = positions.length / 3;
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(radius, 6, 4),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    n,
  );
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m4.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    mesh.setMatrixAt(i, m4);
  }
  return mesh;
}

/** Soft vertical-gradient sprite texture for shafts/aurora (no external assets). */
function gradientTexture(stops, w = 4, h = 128) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  for (const [at, c] of stops) grad.addColorStop(at, c);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Canvas-drawn sprite, cached by key — no external assets, ever (README). */
const spriteCache = new Map();
function sprite(key, size, draw) {
  let tex = spriteCache.get(key);
  if (tex) return tex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  tex = new THREE.CanvasTexture(cv);
  spriteCache.set(key, tex);
  return tex;
}

/** One leaf: a tapered blade with a midrib, alpha-shaped (K4). */
function leafTexture() {
  return sprite('leaf', 64, (g, s) => {
    g.clearRect(0, 0, s, s);
    const grad = g.createLinearGradient(0, s, 0, 0);
    grad.addColorStop(0, 'rgba(190,255,220,0.15)');
    grad.addColorStop(0.5, 'rgba(210,255,230,0.95)');
    grad.addColorStop(1, 'rgba(160,235,200,0.1)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(s / 2, 2);
    g.quadraticCurveTo(s - 4, s * 0.45, s / 2, s - 2);
    g.quadraticCurveTo(4, s * 0.45, s / 2, 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(s / 2, 4); g.lineTo(s / 2, s - 4); g.stroke();
  });
}

/**
 * A frond cluster growing in from one corner — the near field's framing (K5).
 * Drawn WHITE, because it is used as an `alphaMap`: the mask supplies the
 * shape and the material's `color` supplies the darkness. Feeding a dark
 * sprite in as a normal `map` looks equivalent and is not — the RGB then runs
 * the colour-space gauntlet (an unmanaged CanvasTexture is treated as linear
 * data, not sRGB) and the silhouette comes out as a pale card instead of a
 * leaf. Shape from the mask, colour from the material: no gauntlet.
 */
function frondTexture() {
  return sprite('frond', 256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 1.25 + 0.12;          // fan out from the corner
      const len = s * (0.62 + 0.34 * Math.sin(i * 2.4));
      g.save();
      g.translate(4, s - 4);
      g.rotate(-a);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.55, -s * 0.075, len, 0);
      g.quadraticCurveTo(len * 0.55, s * 0.075, 0, 0);
      g.fill();
      g.restore();
    }
  });
}

/** Caustic web: interfering sines thresholded into bright filaments (K3). */
function causticTexture() {
  return sprite('caustic', 128, (g, s) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = (x / s) * Math.PI * 2, v = (y / s) * Math.PI * 2;
        // three interfering wave trains; the ridges are where they cancel
        const f = Math.sin(u * 3) + Math.sin(v * 3 + 1.1) + Math.sin((u + v) * 2.2)
          + Math.sin((u - v) * 2.8 + 0.6);
        const ridge = Math.pow(Math.max(0, 1 - Math.abs(f) * 0.7), 5);
        const i = (y * s + x) * 4;
        img.data[i] = 200; img.data[i + 1] = 240; img.data[i + 2] = 255;
        img.data[i + 3] = ridge * 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/** Zero-cost helper: the wind at a point, safe when scene.js hasn't wired it. */
const NO_WIND = { x: 0, y: 0, z: 0, gust: 0, amp: 0 };
const windAtOr = (env, x, y, z) => (env.wind ? env.wind(x, y, z) : NO_WIND);

// ---------- roots: local-rule — a real Gray–Scott reaction–diffusion (§3.3) ----------
// The sim runs CPU-side on the 42×42 lattice itself (toroidal, 9-point
// Laplacian, a few steps per frame — ~2k cells, trivial). Each root glow's
// brightness is the V field at its cell, so the lattice shows actual pattern
// morphology (spots → worms → labyrinths), and (F, k) walks with mode
// brightness: the roots' SPECIES changes with the harmonic weather, the way a
// modal shift re-colors a drone. Rich local motion, zero global progress.
function makeRoots(rng) {
  const SIDE = 42;
  const N = SIDE * SIDE;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const gx = (i % SIDE) - SIDE / 2;
    const gz = Math.floor(i / SIDE) - SIDE / 2;
    pos[i * 3 + 0] = gx * 1.6 + Math.sin(gx * 3.7 + gz) * 0.4;
    pos[i * 3 + 1] = 2 + Math.sin(gx * 0.7) * Math.cos(gz * 0.9) * 3 + (i % 7) * 1.1;
    pos[i * 3 + 2] = gz * 1.6 + Math.cos(gz * 2.9 + gx) * 0.4;
  }
  const mesh = glowCloud(pos, 0xffffff, 0.22);
  // well above the band anchor: additive violet through exp2 fog needs the headroom
  const base = BAND_COLORS[0].clone().multiplyScalar(4.5);
  const tmp = new THREE.Color();
  for (let i = 0; i < N; i++) mesh.setColorAt(i, tmp.copy(base));

  // Gray–Scott state (Pearson's parameterization; Du/Dv classic 0.16/0.08)
  let U = new Float32Array(N).fill(1);
  let V = new Float32Array(N).fill(0);
  let U2 = new Float32Array(N);
  let V2 = new Float32Array(N);
  const seedSpot = (cx, cz) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const i = (((cz + dz) % SIDE + SIDE) % SIDE) * SIDE + (((cx + dx) % SIDE + SIDE) % SIDE);
      V[i] = 0.6; U[i] = 0.4;
    }
  };
  for (let s = 0; s < 8; s++) seedSpot((rng() * SIDE) | 0, (rng() * SIDE) | 0);
  let reseedClock = 0;

  const idx = (x, z) => (((z % SIDE) + SIDE) % SIDE) * SIDE + (((x % SIDE) + SIDE) % SIDE);
  function step(F, k) {
    for (let z = 0; z < SIDE; z++) {
      for (let x = 0; x < SIDE; x++) {
        const i = z * SIDE + x;
        // 9-point Laplacian (adjacent 0.2, diagonal 0.05, center −1)
        const lapU =
          0.2 * (U[idx(x - 1, z)] + U[idx(x + 1, z)] + U[idx(x, z - 1)] + U[idx(x, z + 1)]) +
          0.05 * (U[idx(x - 1, z - 1)] + U[idx(x + 1, z - 1)] + U[idx(x - 1, z + 1)] + U[idx(x + 1, z + 1)]) -
          U[i];
        const lapV =
          0.2 * (V[idx(x - 1, z)] + V[idx(x + 1, z)] + V[idx(x, z - 1)] + V[idx(x, z + 1)]) +
          0.05 * (V[idx(x - 1, z - 1)] + V[idx(x + 1, z - 1)] + V[idx(x - 1, z + 1)] + V[idx(x + 1, z + 1)]) -
          V[i];
        const uvv = U[i] * V[i] * V[i];
        U2[i] = U[i] + (0.16 * lapU - uvv + F * (1 - U[i]));
        V2[i] = V[i] + (0.08 * lapV + uvv - (F + k) * V[i]);
      }
    }
    [U, U2] = [U2, U]; [V, V2] = [V2, V];
  }

  return {
    name: 'roots',
    group: mesh,
    update(dt, env) {
      // species walks with brightness: solitons at the dark end, worms toward the light
      const F = 0.030 + 0.016 * env.b;
      const k = 0.062 - 0.005 * env.b;
      // sim steps are the first thing the quality governor buys back (J1):
      // fewer steps slow the morphology, they never change its species
      const steps = Math.max(2, Math.round(5 * (env.quality ?? 1)));
      for (let s = 0; s < steps; s++) step(F, k);
      // keep the sim alive: occasional reseed, drift-placed, never rhythmic
      reseedClock += dt;
      if (reseedClock > 6) {
        reseedClock = 0;
        seedSpot(((env.drift * 0.5 + 0.5) * SIDE) | 0, ((env.t * 0.13) % 1 * SIDE) | 0);
      }
      const lift = 0.15 + 0.25 * env.T;
      for (let i = 0; i < N; i++) {
        const kk = Math.min(1.4, lift + V[i] * 3.2);
        mesh.setColorAt(i, tmp.copy(base).multiplyScalar(kk));
      }
      mesh.instanceColor.needsUpdate = true;
      mesh.rotation.y += dt * 0.008;
      mesh.position.y = Math.sin(env.t * 0.11) * 0.6;
    },
  };
}

// ---------- floor: growth that actually GROWS (§3.1) ----------
// Segments carry a growth order (depth across all trees, jittered); the drawn
// range advances with the track's phase, so the forest grows over each track
// and resets at the boundary — the drop is the cut-safe point that hides the
// regrowth (§5, change blindness). Blooms are the one licensed rhythm contact:
// they open on downbeats only, slow-attacked, at branch tips.
function branch(segs, tips, rng, x, y, z, dir, len, depth, gen) {
  if (depth <= 0 || len < 0.4) { tips.push([x, y, z]); return; }
  const nx = x + dir.x * len, ny = y + dir.y * len, nz = z + dir.z * len;
  segs.push({ a: [x, y, z], b: [nx, ny, nz], gen });
  if (depth <= 2) tips.push([nx, ny, nz]);
  const kids = 1 + (rng() < 0.6 ? 1 : 0);
  for (let ki = 0; ki < kids; ki++) {
    const d = dir.clone();
    d.x += (rng() - 0.5) * 0.9;
    d.y += (rng() - 0.35) * 0.5; // upward bias: it grows toward the canopy
    d.z += (rng() - 0.5) * 0.9;
    d.normalize();
    branch(segs, tips, rng, nx, ny, nz, d, len * (0.72 + rng() * 0.15), depth - 1, gen + 1);
  }
}

function makeFloor(rng) {
  const segs = [];
  const tips = [];
  for (let i = 0; i < 14; i++) {
    const x = (rng() - 0.5) * 60, z = (rng() - 0.5) * 60;
    branch(segs, tips, rng, x, 10, z, new THREE.Vector3(0, 1, 0), 2.2 + rng() * 1.5, 7, 0);
  }
  // growth order: generation-first across ALL trees (jittered) — the forest
  // rises level by level rather than tree by tree
  segs.sort((p, q) => (p.gen + (rng() - 0.5) * 0.8) - (q.gen + (rng() - 0.5) * 0.8));
  const vertices = new Float32Array(segs.length * 6);
  segs.forEach((s, i) => vertices.set([...s.a, ...s.b], i * 6));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const mat = new THREE.LineBasicMaterial({
    color: BAND_COLORS[1].clone().multiplyScalar(3.5),
    transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(geo, mat);
  const group = new THREE.Group();
  group.add(lines);

  // bloom pool: soft glow spheres at branch tips, opened by downbeats
  const POOL = 14;
  const blooms = [];
  const bloomGeo = new THREE.SphereGeometry(0.5, 8, 6);
  for (let i = 0; i < POOL; i++) {
    const m = new THREE.Mesh(bloomGeo, new THREE.MeshBasicMaterial({
      color: '#bfffdd', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    group.add(m);
    blooms.push({ mesh: m, life: 0 });
  }
  let bloomIdx = 0;
  let grownSegs = segs.length;

  // ---- K4: leaves, on a phyllotaxis spiral ----
  // The floor was a wireframe of branches; leaves make it a forest. Each tip
  // carries a few blades placed at the golden angle (137.507°) — the same
  // constant the sky's shells use for their radii, which is not a coincidence
  // so much as the reason both look organic. They unfold over the LAST stretch
  // of the track's growth (a branch exists before its leaves do) and they
  // flutter on the shared wind, never on a clock of their own.
  const leaves = (() => {
    const PER_TIP = 3;
    const count = Math.min(480, tips.length * PER_TIP);
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.85, 1.3),
      new THREE.MeshBasicMaterial({
        map: leafTexture(), color: BAND_COLORS[1].clone().multiplyScalar(5),
        transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      count,
    );
    mesh.frustumCulled = false;
    group.add(mesh);
    const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // 137.507°, in radians
    const blades = [];
    for (let i = 0; i < count; i++) {
      const tip = tips[i % tips.length];
      blades.push({
        pos: new THREE.Vector3(tip[0], tip[1], tip[2]),
        yaw: i * GOLDEN,                       // the spiral, one blade per step
        pitch: 0.35 + (i % PER_TIP) * 0.45,
        phase: (i * 0.618) % 1 * Math.PI * 2,  // desynced flutter
        born: 0.55 + 0.4 * ((i * 0.7548) % 1), // unfolds late in the growth arc
      });
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    return {
      update(dt, env, grown, wind) {
        const drawn = Math.max(60, Math.floor(count * (env.quality ?? 1)));
        if (mesh.count !== drawn) mesh.count = drawn;
        mesh.material.opacity = (0.3 + 0.3 * env.Tf) * (1 - env.duck * 0.3);
        mesh.material.color.copy(paletteAt(env.b * 0.6 + 0.15)).multiplyScalar(4.5);
        for (let i = 0; i < drawn; i++) {
          const bl = blades[i];
          const open = Math.min(1, Math.max(0, (grown - bl.born) * 6));
          // flutter: the gust twists the blade about its own stem
          const flut = wind.amp * 0.6 * Math.sin(env.t * (1.7 + wind.gust * 4) + bl.phase);
          e.set(bl.pitch + flut, bl.yaw + wind.x * 0.5, flut * 1.4);
          q.setFromEuler(e);
          sc.setScalar(open * (0.8 + 0.4 * Math.sin(bl.phase)));
          m4.compose(bl.pos, q, sc);
          mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  })();

  return {
    name: 'floor',
    group,
    onDownbeat() {
      if (grownSegs < segs.length * 0.15) return; // nothing to bloom on yet
      const bl = blooms[bloomIdx++ % POOL];
      const tip = tips[(Math.random() * tips.length) | 0];
      bl.mesh.position.set(tip[0], tip[1], tip[2]);
      bl.mesh.visible = true;
      bl.life = 1;
    },
    update(dt, env) {
      // grown-ness follows the track's arc; regrows fresh each track
      const f = Math.min(1, env.trackPhase * 1.4);
      const eased = f * f * (3 - 2 * f);
      grownSegs = Math.floor(eased * segs.length);
      geo.setDrawRange(0, grownSegs * 2);
      // K1: the whole canopy of branches leans into the gust — sampled at the
      // grove's own position, so the lean is this place's weather, not a knob
      const wind = windAtOr(env, 0, 16, 0);
      group.rotation.y = env.drift * 0.05;             // 1/f sway, quasi-vestibular
      group.rotation.z += (wind.x * 0.035 - group.rotation.z) * Math.min(1, dt * 1.5);
      group.rotation.x += (wind.z * 0.035 - group.rotation.x) * Math.min(1, dt * 1.5);
      mat.opacity = 0.35 + 0.25 * env.Tf;              // growth answers the arc, not the beat
      leaves.update(dt, env, eased, wind);
      for (const bl of blooms) {
        if (!bl.mesh.visible) continue;
        bl.life -= dt * 0.7;                           // slow open, slower fade: ground-legal
        if (bl.life <= 0) { bl.mesh.visible = false; continue; }
        const open = Math.min(1, (1 - bl.life) * 6);   // ~0.25 s attack
        bl.mesh.material.opacity = open * bl.life * 0.8;
        bl.mesh.scale.setScalar(0.4 + (1 - bl.life) * 1.2);
      }
    },
  };
}

// ---------- canopy: a flow field, not a rotating object (§3.2) ----------
// Particles advected through a divergence-free-ish analytic swirl whose slow
// component is drift(t) and whose speed breathes with T. The kick's duck is a
// downdraft impulse: the ether FLINCHES instead of merely dimming. (CPU
// advection over the instanced cloud — identical on WebGPU and WebGL2; a TSL
// compute path can replace the integrator behind this same interface.)
function makeCanopy() {
  const N = 4200;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3 + 0] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 1] = 22 + Math.random() * 20;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
  }
  const mesh = glowCloud(pos, 0xffffff, 0.16);
  const mat = mesh.material;
  const m4 = new THREE.Matrix4();
  let heat = 0; // stream-fusion afterglow (§5's one climax rule)

  return {
    name: 'canopy',
    group: mesh,
    ignite() { heat = 1; },
    update(dt, env) {
      const speed = (0.5 + 1.6 * env.T + heat * 2) * dt;
      const tw = env.t * 0.08 + env.drift * 2;
      // K1: the swirl is the ether's own motion; the wind is the world's, and
      // it is ADDED rather than mixed — a gust displaces the whole field
      // downwind without changing what the field is doing. (Sampled once at
      // band center: per-particle sampling would cost 4200 evaluations to say
      // something the eye reads as a single coherent push.)
      const wind = windAtOr(env, 0, 32, 0);
      const wx = wind.x * dt * 5, wz = wind.z * dt * 5, wy = wind.y * dt * 3;
      // the ether's population is the governor's second lever (J1): thinner
      // weather, same weather — advect only what is drawn
      const drawn = Math.max(1200, Math.floor(N * (env.quality ?? 1)));
      if (mesh.count !== drawn) mesh.count = drawn;
      for (let i = 0; i < drawn; i++) {
        let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        // analytic swirl: layered incompressible-ish sines (curl noise in spirit)
        x += (Math.sin(y * 0.16 + tw) * Math.cos(z * 0.11) + 0.4 * Math.sin(z * 0.05 + tw * 1.7)) * speed + wx;
        y += (0.35 * Math.sin(x * 0.09 + tw * 0.7) * Math.cos(y * 0.13)) * speed
           - env.duck * dt * 7                         // the kick's downdraft
           + wy;                                       // …and the gust's updraft
        z += (Math.cos(x * 0.13 - tw * 0.9) * Math.sin(y * 0.10) + 0.4 * Math.cos(x * 0.04 - tw)) * speed + wz;
        // soft wrap inside the band's box
        if (x > 46) x = -46; else if (x < -46) x = 46;
        if (z > 46) z = -46; else if (z < -46) z = 46;
        if (y > 42.5) y = 22; else if (y < 21.5) y = 42;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        m4.setPosition(x, y, z);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      heat = Math.max(0, heat - dt * 0.35);
      mat.color.copy(paletteAt(env.b)).multiplyScalar(1.6).lerp(new THREE.Color('#fff3d0'), heat * 0.5);
      mat.opacity = (0.35 + 0.35 * env.Tf) * (1 - env.duck * 0.45) + heat * 0.18;
    },
  };
}

// ---------- sky: self-similar geometry (§3.4) + aurora (proposal C3) ----------
function makeSky() {
  const group = new THREE.Group();
  const shells = [];
  for (let i = 0; i < 4; i++) {
    const r = 6 * Math.pow(1.618, i); // golden-ratio scaling between levels
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshBasicMaterial({
        color: BAND_COLORS[3], wireframe: true, transparent: true,
        opacity: 0.14 - i * 0.02, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    group.add(mesh);
    shells.push(mesh);
  }
  group.position.y = 52;

  // aurora: two ribbons scrolling at near-coprime rates — never quite recurs
  const auroraTex = gradientTexture([
    [0, 'rgba(0,0,0,0)'], [0.35, 'rgba(140,255,210,0.55)'],
    [0.55, 'rgba(255,230,170,0.5)'], [0.75, 'rgba(190,140,255,0.4)'], [1, 'rgba(0,0,0,0)'],
  ]);
  const ribbons = [];
  for (const [scroll, y, tilt] of [[0.011, 8, 0.12], [0.017, 11, -0.09]]) {
    const g = new THREE.PlaneGeometry(200, 16, 64, 1);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 0.045) * 12); // curved sheet
    const tex = auroraTex.clone();
    tex.needsUpdate = true;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.position.y = y;
    m.rotation.x = tilt;
    group.add(m);
    ribbons.push({ mesh: m, scroll, tex });
  }

  return {
    name: 'sky',
    group,
    update(dt, env) {
      shells.forEach((m, i) => {
        // coprime-ish rates: the nest never quite recurs (the Eno theorem, for the eye)
        m.rotation.y += dt * 0.05 * (i % 2 ? 1 : -1) * (1 + i * 0.618) * (0.5 + env.T);
        m.rotation.x += dt * 0.02 * (1 + i * 0.382);
        m.material.opacity = (0.1 + 0.1 * env.b) * (1 - i * 0.15) * (1 - env.duck * 0.3);
      });
      // the aurora is the highest thing in the world, so it gets the most wind
      const wind = windAtOr(env, 0, WORLD_TOP, 0);
      for (const r of ribbons) {
        r.tex.offset.x += dt * r.scroll * (1 + env.drift * 0.4 + wind.gust * 1.5);
        r.mesh.material.opacity = Math.max(0, env.b - 0.55) * (0.9 + 0.5 * env.T);
        r.mesh.rotation.z = wind.x * 0.04;
      }
      // K7: a strike lights the shells from inside — the sky is the first
      // thing lightning touches, and the only thing that keeps glowing after
      if (env.flash) for (const m of shells) m.material.opacity += env.flash * 0.5;
    },
  };
}

// ---------- the air: altitude-graded atmosphere (proposal C2) ----------
// A vast inverted vertex-colored sphere: violet haze at the floor, near-black
// mid, warm glow at the top — each biome gets its own air behind the fog.
function makeAir() {
  const geo = new THREE.SphereGeometry(170, 24, 16);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const bottom = new THREE.Color('#0d0618');
  const mid = new THREE.Color('#030507');
  const top = new THREE.Color('#241605');
  const c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) / 170; // -1..1
    if (y < 0) c.copy(mid).lerp(bottom, -y);
    else c.copy(mid).lerp(top, y);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return {
    name: 'air',
    group: mesh,
    update(dt, env) {
      mesh.position.y = 20 + env.b * 10;  // the warm top nears as you climb
      // K7: lightning is *behind* everything — it lights the air itself, which
      // is what makes the canopy read as a silhouette for the length of a
      // frame. The multiplier rides the vertex colors, so the flash inherits
      // the altitude gradient instead of flattening it to white.
      mat.color.setScalar(1 + (env.flash ?? 0) * 9);
    },
  };
}

// ---------- volumetric mist (fancy proposal G3) ----------
// The cheapest real volume there is: a stack of wide additive haze cards
// through the floor and lower canopy, at slightly different heights and scroll
// rates, so travelling through them gives parallax the fog can't. Pure ground
// stream — density answers T and the palette, and the kick's duck compresses
// the stack (the coupling constant, once more, in a fourth place).
function makeMist(rng) {
  const group = new THREE.Group();
  const tex = gradientTexture([
    [0, 'rgba(0,0,0,0)'], [0.4, 'rgba(190,220,255,0.30)'],
    [0.6, 'rgba(190,220,255,0.30)'], [1, 'rgba(0,0,0,0)'],
  ]);
  const cards = [];
  const COUNT = 14;
  for (let i = 0; i < COUNT; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 22),
      new THREE.MeshBasicMaterial({
        map: tex.clone(), transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    m.material.map.needsUpdate = true;
    const y = 8 + (i / COUNT) * 26 + rng() * 2;
    const x = (rng() - 0.5) * 20;
    m.position.set(x, y, -30 + (i / COUNT) * 55);
    m.rotation.z = (rng() - 0.5) * 0.05;
    group.add(m);
    cards.push({ mesh: m, x0: x, y0: y, shear: 0, rate: 0.004 + rng() * 0.01, phase: rng() * 9 });
  }
  return {
    name: 'mist',
    group,
    update(dt, env) {
      const q = env.quality ?? 1;
      // M2: how much mist there is is now the track's weather, not a constant
      const wet = env.weather?.mist ?? 0.6;
      const base = (0.5 - 0.25 * env.T) * (1 - env.duck * 0.5) * q * (0.45 + 0.9 * wet);
      for (const c of cards) {
        const wind = windAtOr(env, c.mesh.position.x, c.y0, c.mesh.position.z);
        const near = 1 - Math.min(1, Math.abs(c.y0 - (env.cam?.y ?? 0)) / 20); // the band you are in
        c.mesh.material.opacity = base * near * (0.35 + 0.3 * Math.sin(env.t * 0.13 + c.phase));
        // K1: a gust tears the sheet sideways and thins it as it goes — the
        // scroll rate and the shear come off the same sample, so the mist
        // moves the way the leaves below it are already moving
        c.mesh.material.map.offset.x += dt * c.rate * (1 + env.drift * 0.6 + wind.gust * 2.5);
        c.shear += (wind.x * 2.5 - c.shear) * Math.min(1, dt * 0.6);
        c.mesh.position.x = c.x0 + c.shear;
        c.mesh.position.y = c.y0 - env.duck * 0.6 + wind.y * 0.8;   // the kick presses it down
        c.mesh.material.color.copy(paletteAt(env.b)).multiplyScalar(1.5);
      }
    },
  };
}

// ---------- canopy light shafts (proposal C1) ----------
// Billboard blades of light falling through the canopy band; density breathes
// with T, warmth with brightness. Y-axis billboarding only, so they stay
// vertical — light falls DOWN.
function makeShafts(rng) {
  const group = new THREE.Group();
  const tex = gradientTexture([
    [0, 'rgba(255,244,214,0.55)'], [0.5, 'rgba(255,244,214,0.18)'], [1, 'rgba(255,244,214,0)'],
  ]);
  const blades = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6 + rng() * 2.5, 30),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    const a = rng() * Math.PI * 2, rad = 10 + rng() * 26;
    m.position.set(Math.cos(a) * rad, 30, Math.sin(a) * rad);
    m.userData.tilt = (rng() - 0.5) * 0.12; // slight slant, never perfectly plumb
    m.rotation.z = m.userData.tilt;
    group.add(m);
    blades.push(m);
  }
  return {
    name: 'shafts',
    group,
    update(dt, env) {
      const strength = (0.06 + 0.22 * env.T) * Math.min(1, Math.max(0, env.b * 1.6));
      for (const m of blades) {
        const wind = windAtOr(env, m.position.x, 30, m.position.z);
        m.material.opacity = strength * (0.7 + 0.3 * Math.sin(env.t * 0.21 + m.position.x));
        if (env.cam) m.rotation.y = Math.atan2(env.cam.x - m.position.x, env.cam.z - m.position.z);
        // K1: light falls DOWN, but the canopy it falls through moves — so the
        // shaft tips with the gust instead of standing plumb through a storm
        m.rotation.z = m.userData.tilt + wind.x * 0.06;
      }
    },
  };
}

// ---------- K2: fireflies — the fields family, made of agents ----------
// The canopy's ether is a field sampled by particles: every mote does what the
// analytic swirl at its position says, and none of them knows the others
// exist. This is the other half of §3.2 — local rules between *neighbours*,
// which is a genuinely different motion signature (a flock banks; a field
// merely flows) and therefore earns its place rather than adding more of the
// same. Boids: separation, alignment, cohesion, plus a wander, plus the shared
// wind, plus a weak pull back into the band so the swarm stays a swarm.
//
// The blink is the point, though. Each firefly carries its own period drawn
// from an irrational-ish spread, so the swarm NEVER synchronises — real
// fireflies do synchronise, and a synchronised swarm would be rhythm on the
// ground stream, which is forbidden (§2.1). The physics is wrong on purpose
// and the discipline is why.
function makeFireflies(rng) {
  const N = 220;
  const mesh = glowCloud(new Float32Array(N * 3), 0xffe9a0, 0.09);
  mesh.frustumCulled = false;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const acc = new Float32Array(N * 3);
  const blink = [];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rng() - 0.5) * 70;
    pos[i * 3 + 1] = 12 + rng() * 20;
    pos[i * 3 + 2] = (rng() - 0.5) * 70;
    vel[i * 3] = (rng() - 0.5) * 2;
    vel[i * 3 + 1] = (rng() - 0.5) * 0.6;
    vel[i * 3 + 2] = (rng() - 0.5) * 2;
    // periods spread over 2.1…5.9 s with an irrational stride: no two agree,
    // and the set of them has no common multiple inside a track
    blink.push({ period: 2.1 + ((i * 0.7548) % 1) * 3.8, phase: rng() * 9 });
  }
  const NEIGHBOUR = 6;      // world units — the radius the rules see
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Color();
  const base = new THREE.Color('#ffd98a');
  let stride = 0;           // rebuild a third of the accelerations per frame

  return {
    name: 'fireflies',
    group: mesh,
    update(dt, env) {
      const drawn = Math.max(60, Math.floor(N * (env.quality ?? 1)));
      if (mesh.count !== drawn) mesh.count = drawn;
      // the swarm belongs to the undergrowth and floor; it thins out of band
      const alt = env.cam?.y ?? 0;
      const band = 1 - Math.min(1, Math.max(0, (alt - 30) / 22));
      if (band <= 0.01) { mesh.visible = false; return; }
      mesh.visible = true;

      stride = (stride + 1) % 3;
      const wind = windAtOr(env, 0, 20, 0);
      for (let i = 0; i < drawn; i++) {
        const ix = i * 3;
        // the neighbour rules are the expensive part, so each agent re-reads
        // its neighbourhood every third frame — a flock has latency anyway
        if (i % 3 === stride) {
          let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
          for (let j = 0; j < drawn; j++) {
            if (j === i) continue;
            const jx = j * 3;
            const dx = pos[jx] - pos[ix], dy = pos[jx + 1] - pos[ix + 1], dz = pos[jx + 2] - pos[ix + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > NEIGHBOUR * NEIGHBOUR || d2 < 1e-6) continue;
            n++;
            cx += pos[jx]; cy += pos[jx + 1]; cz += pos[jx + 2];         // cohesion
            ax += vel[jx]; ay += vel[jx + 1]; az += vel[jx + 2];         // alignment
            const inv = 1 / d2;
            sx -= dx * inv; sy -= dy * inv; sz -= dz * inv;              // separation
          }
          if (n) {
            acc[ix] = sx * 2.2 + (ax / n - vel[ix]) * 0.7 + (cx / n - pos[ix]) * 0.06;
            acc[ix + 1] = sy * 2.2 + (ay / n - vel[ix + 1]) * 0.7 + (cy / n - pos[ix + 1]) * 0.06;
            acc[ix + 2] = sz * 2.2 + (az / n - vel[ix + 2]) * 0.7 + (cz / n - pos[ix + 2]) * 0.06;
          } else {
            acc[ix] = acc[ix + 1] = acc[ix + 2] = 0;
          }
          // wander, so a settled flock never freezes into a lattice
          acc[ix] += Math.sin(env.t * 0.7 + i) * 0.5;
          acc[ix + 1] += Math.cos(env.t * 0.5 + i * 1.3) * 0.35;
          acc[ix + 2] += Math.cos(env.t * 0.6 + i * 0.7) * 0.5;
          // and a soft box: the swarm is a resident of the band, not a tourist
          acc[ix] -= pos[ix] * 0.004;
          acc[ix + 1] += (20 - pos[ix + 1]) * 0.02;
          acc[ix + 2] -= pos[ix + 2] * 0.004;
        }
        vel[ix] += (acc[ix] + wind.x * 1.4) * dt;
        vel[ix + 1] += (acc[ix + 1] + wind.y) * dt;
        vel[ix + 2] += (acc[ix + 2] + wind.z * 1.4) * dt;
        // terminal speed: a firefly drifts, it does not commute
        const sp = Math.hypot(vel[ix], vel[ix + 1], vel[ix + 2]);
        const cap = 2.6 + wind.amp * 2;
        if (sp > cap) { const k = cap / sp; vel[ix] *= k; vel[ix + 1] *= k; vel[ix + 2] *= k; }
        pos[ix] += vel[ix] * dt; pos[ix + 1] += vel[ix + 1] * dt; pos[ix + 2] += vel[ix + 2] * dt;

        const bl = blink[i];
        const ph = ((env.t / bl.period + bl.phase) % 1 + 1) % 1;
        const lit = Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 6); // brief, sharp-ish
        const k = band * (0.15 + lit * 1.5) * (0.5 + 0.5 * env.Tf);
        tmp.copy(base).multiplyScalar(k);
        mesh.setColorAt(i, tmp);
        m4.makeScale(0.6 + lit * 1.2, 0.6 + lit * 1.2, 0.6 + lit * 1.2);
        m4.setPosition(pos[ix], pos[ix + 1], pos[ix + 2]);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---------- K3: rain, and the surface it lands on ----------
// The forest floor has been playing `ambrain` since D16 with nothing falling.
// Streaks fall in a cylinder that follows the camera (a snow globe: the world
// is 90 units across and rain 40 units away is invisible, so drawing it is
// waste) and are recycled at the top. They are GROUND stream despite being
// fast and hard-edged, because there are hundreds of them and no single one is
// ever an event — that is precisely the §2.1 distinction, and it is why rain
// can be dense without spending a synch point.
function makeRain(rng) {
  const N = 700;
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.035, 1.5),
    new THREE.MeshBasicMaterial({
      color: '#cfe4ff', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
    N,
  );
  mesh.frustumCulled = false;
  const RADIUS = 26, TOP = 16, DROP = 30;
  const p = new Float32Array(N * 3);
  const spd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * RADIUS;
    p[i * 3] = Math.cos(a) * r;
    p[i * 3 + 1] = rng() * DROP;
    p[i * 3 + 2] = Math.sin(a) * r;
    spd[i] = 26 + rng() * 22;
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  return {
    name: 'rain',
    group: mesh,
    update(dt, env) {
      const rain = env.weather?.rain ?? 0;
      if (rain < 0.02) { mesh.visible = false; return; } // clear weather is free
      mesh.visible = true;
      const drawn = Math.max(120, Math.floor(N * rain * (env.quality ?? 1)));
      if (mesh.count !== drawn) mesh.count = drawn;
      mesh.material.opacity = 0.10 + 0.35 * rain;
      const cam = env.cam ?? { x: 0, y: 0, z: 0 };
      const wind = windAtOr(env, cam.x, cam.y, cam.z);
      // rain leans into the wind, and the streak leans with it: the geometry
      // is stretched along the fall vector rather than merely tilted
      const fall = v.set(wind.x * 6, -1, wind.z * 6).normalize();
      e.set(0, Math.atan2(fall.x, fall.z), Math.atan2(Math.hypot(fall.x, fall.z), -fall.y));
      q.setFromEuler(e);
      for (let i = 0; i < drawn; i++) {
        const ix = i * 3;
        p[ix] += wind.x * 6 * dt;
        p[ix + 1] -= spd[i] * dt * (0.6 + 0.6 * rain);
        p[ix + 2] += wind.z * 6 * dt;
        // recycle relative to the camera, not the world
        if (p[ix + 1] < cam.y - TOP) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * RADIUS;
          p[ix] = cam.x + Math.cos(a) * r;
          p[ix + 1] = cam.y + TOP;
          p[ix + 2] = cam.z + Math.sin(a) * r;
        }
        scale.set(1, 0.6 + spd[i] * 0.035, 1); // faster drops draw longer streaks
        m4.compose(v.set(p[ix], p[ix + 1], p[ix + 2]), q, scale);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// A still black pool among the roots, lit by caustics — two interfering
// caustic layers scrolling at coprime rates, plus ripple rings from falling
// drops. The ripples are the only expanding rings in the world that are NOT
// figure: they are stochastic, soft-edged, slow, and they never coincide with
// a kick, which is what keeps the kick's shockwave legible as the one ring
// that means something (§2.2 — do not counterfeit the currency).
function makePool(rng) {
  const group = new THREE.Group();
  const tex = causticTexture();
  const layers = [];
  for (const [rep, rate, op] of [[3, 0.013, 0.55], [5, -0.008, 0.35]]) {
    const t2 = tex.clone();
    t2.needsUpdate = true;
    t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    t2.repeat.set(rep, rep);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshBasicMaterial({
        map: t2, transparent: true, opacity: 0, color: '#8fd9ff',
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    group.add(m);
    layers.push({ mesh: m, rate, op });
  }
  const RIPPLES = 10;
  const ripples = [];
  const ringGeo = new THREE.RingGeometry(0.7, 1, 40);
  for (let i = 0; i < RIPPLES; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: '#bfe8ff', transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    group.add(m);
    ripples.push({ mesh: m, life: 0 });
  }
  let rippleIdx = 0, dripClock = 0;
  group.position.y = 0.35;
  return {
    name: 'pool',
    group,
    update(dt, env) {
      // the pool is the floor of the world: it fades out as you climb away
      const near = 1 - Math.min(1, Math.max(0, ((env.cam?.y ?? 0) - 6) / 20));
      group.visible = near > 0.01;
      if (!group.visible) return;
      const wind = windAtOr(env, 0, 2, 0);
      for (const l of layers) {
        l.mesh.material.opacity = near * l.op * (0.25 + 0.5 * env.b) * (1 - env.duck * 0.4);
        l.mesh.material.map.offset.x += dt * l.rate * (1 + wind.gust);
        l.mesh.material.map.offset.y += dt * l.rate * 0.6;
        l.mesh.material.color.copy(paletteAt(env.b)).multiplyScalar(2.2);
      }
      // drips: a Poisson-ish trickle that rains harder when it is raining
      const rate = 0.4 + 6 * (env.weather?.rain ?? 0);
      dripClock += dt * rate;
      while (dripClock > 1) {
        dripClock -= 1;
        const r = ripples[rippleIdx++ % RIPPLES];
        r.mesh.position.set((Math.random() - 0.5) * 70, 0, (Math.random() - 0.5) * 70);
        r.mesh.visible = true;
        r.life = 1;
      }
      for (const r of ripples) {
        if (!r.mesh.visible) continue;
        r.life -= dt * 0.55;
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        r.mesh.scale.setScalar(0.5 + (1 - r.life) * 7);
        r.mesh.material.opacity = r.life * r.life * 0.5 * near;
      }
    },
  };
}

// ---------- K6: the mycelial net (local-rule, §3.3, at a second scale) ----------
// The roots run a real Gray–Scott sim whose morphology is the *pattern*
// family's argument. This is the same family's other argument: a network with
// signals on it. Filaments join nearby anchor points; each carries a pulse
// that departs on its own dwell and travels at its own speed, so the net is
// always signalling somewhere and never everywhere. The pulse is a gaussian in
// arc-length, written straight into vertex colors — one draw call, no shader.
function makeMycelium(rng) {
  const FILAMENTS = 150, SEGS = 12;
  const verts = new Float32Array(FILAMENTS * SEGS * 2 * 3);
  const colors = new Float32Array(FILAMENTS * SEGS * 2 * 3);
  const filaments = [];
  const anchor = () => new THREE.Vector3((rng() - 0.5) * 66, 1 + rng() * 10, (rng() - 0.5) * 66);
  let v = 0;
  for (let f = 0; f < FILAMENTS; f++) {
    const a = anchor();
    // reach to a nearby point, not a random one: a net, not a starburst
    const b = a.clone().add(new THREE.Vector3((rng() - 0.5) * 22, (rng() - 0.5) * 5, (rng() - 0.5) * 22));
    const sag = (rng() - 0.5) * 3;
    const pts = [];
    for (let s = 0; s <= SEGS; s++) {
      const u = s / SEGS;
      pts.push(new THREE.Vector3(
        a.x + (b.x - a.x) * u + Math.sin(u * Math.PI) * sag,
        a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * Math.abs(sag) * 0.6,
        a.z + (b.z - a.z) * u + Math.cos(u * Math.PI * 1.3) * sag * 0.5,
      ));
    }
    const start = v;
    for (let s = 0; s < SEGS; s++) {
      verts.set([pts[s].x, pts[s].y, pts[s].z], v * 3); v++;
      verts.set([pts[s + 1].x, pts[s + 1].y, pts[s + 1].z], v * 3); v++;
    }
    filaments.push({
      start, count: SEGS * 2,
      pulse: rng() * 2 - 1,                 // negative = still dwelling
      speed: 0.5 + rng() * 0.9,
      dwell: 1 + rng() * 5,
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const glow = new THREE.Color();
  const HOT = new THREE.Color('#a8ffe0'); // the colour a signal is, everywhere
  return {
    name: 'mycelium',
    group: lines,
    update(dt, env) {
      const near = 1 - Math.min(1, Math.max(0, ((env.cam?.y ?? 0) - 4) / 22));
      lines.visible = near > 0.01;
      if (!lines.visible) return;
      const base = paletteAt(env.b * 0.35).multiplyScalar(1.6 * near);
      for (const fil of filaments) {
        fil.pulse += dt * fil.speed * (0.6 + 0.8 * env.T);
        if (fil.pulse > 1.25) fil.pulse = -fil.dwell * (0.4 + Math.random());
        for (let s = 0; s < fil.count; s++) {
          const u = (s / fil.count);
          const d = u - fil.pulse;
          const lit = fil.pulse < 0 ? 0 : Math.exp(-(d * d) * 90);
          glow.copy(base).lerp(HOT, lit * 0.85).multiplyScalar(0.35 + lit * 3.5 + env.Tf * 0.2);
          colors.set([glow.r, glow.g, glow.b], (fil.start + s) * 3);
        }
      }
      geo.attributes.color.needsUpdate = true;
    },
  };
}

// ---------- K5: the near field ----------
// The frame's real deficiency, and the cheapest thing on this list to fix:
// everything in the world lives 12–90 units out, so there is no parallax
// gradient and therefore no depth — and the depth-of-field pass built in G1
// had nothing close enough to blur. Two parts:
//   motes  — world-space dust in a box that WRAPS around the camera, so it
//            parallaxes hard against a world that barely moves;
//   fronds — silhouettes parented to the camera itself, framing the corners
//            and swaying on the shared wind. They are the only objects in the
//            world that are darker than the sky, which is what makes them read
//            as *in front of* rather than *far away*.
// Both are ground stream and neither articulates anything.
function makeNearField(rng, camera) {
  const group = new THREE.Group();

  const N = 260, BOX = 9;
  const motes = glowCloud(new Float32Array(N * 3), 0xffffff, 0.012);
  motes.frustumCulled = false;
  const p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    p[i * 3] = (rng() - 0.5) * BOX * 2;
    p[i * 3 + 1] = (rng() - 0.5) * BOX * 2;
    p[i * 3 + 2] = (rng() - 0.5) * BOX * 2;
  }
  group.add(motes);
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Color();

  // fronds ride the camera: three corners, so the frame is never symmetric
  const fronds = [];
  if (camera) {
    const tex = frondTexture();
    // Framing, not filling: each frond hangs into one corner and the middle of
    // the frame stays the world's. The camera's frustum at z=-2.8 is ~3.2
    // units tall, so a 1.7-unit blade at these offsets reads as a leaf at the
    // edge of vision — which is the entire job. (It is very easy to make these
    // twice this size and end up photographing a hedge.)
    const layout = [
      { pos: [-1.95, -1.15, -2.8], rot: 0.0, scale: 1.05 },
      { pos: [2.20, -1.35, -3.1], rot: -Math.PI / 2, scale: 1.20 },
      { pos: [-2.35, 1.45, -3.4], rot: Math.PI / 2, scale: 1.00 },
    ];
    for (const l of layout) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 1.7),
        new THREE.MeshBasicMaterial({
          alphaMap: tex, color: 0x070c0a, transparent: true, opacity: 0.95,
          depthWrite: false, side: THREE.DoubleSide, fog: false,
        }),
      );
      m.position.set(...l.pos);
      m.rotation.z = l.rot;
      m.scale.setScalar(l.scale);
      m.renderOrder = 2;
      camera.add(m);
      fronds.push({ mesh: m, rot0: l.rot, phase: rng() * 9 });
    }
  }

  return {
    name: 'nearfield',
    group,
    update(dt, env) {
      const cam = env.cam ?? { x: 0, y: 0, z: 0 };
      const wind = windAtOr(env, cam.x, cam.y, cam.z);
      const drawn = Math.max(70, Math.floor(N * (env.quality ?? 1)));
      if (motes.count !== drawn) motes.count = drawn;
      const col = paletteAt(env.b).multiplyScalar(3.2);
      for (let i = 0; i < drawn; i++) {
        const ix = i * 3;
        // dust follows the wind and sinks slowly; nothing else acts on it
        p[ix] += (wind.x * 1.6 + Math.sin(env.t * 0.6 + i) * 0.12) * dt;
        p[ix + 1] += (wind.y * 1.2 - 0.09 + Math.cos(env.t * 0.5 + i * 1.7) * 0.1) * dt;
        p[ix + 2] += (wind.z * 1.6 + Math.cos(env.t * 0.55 + i * 0.9) * 0.12) * dt;
        // wrap in the camera's own box: infinite dust from 260 instances
        for (let k = 0; k < 3; k++) {
          const c = k === 0 ? cam.x : k === 1 ? cam.y : cam.z;
          const rel = p[ix + k] - c;
          if (rel > BOX) p[ix + k] -= BOX * 2;
          else if (rel < -BOX) p[ix + k] += BOX * 2;
        }
        // near motes are brighter: the parallax gradient, stated in light too
        const d = Math.hypot(p[ix] - cam.x, p[ix + 1] - cam.y, p[ix + 2] - cam.z);
        const k = Math.max(0, 1 - d / BOX) * (0.35 + 0.5 * env.Tf) * (1 - env.duck * 0.5);
        tmp.copy(col).multiplyScalar(k);
        motes.setColorAt(i, tmp);
        m4.makeScale(1, 1, 1);
        m4.setPosition(p[ix], p[ix + 1], p[ix + 2]);
        motes.setMatrixAt(i, m4);
      }
      motes.instanceMatrix.needsUpdate = true;
      if (motes.instanceColor) motes.instanceColor.needsUpdate = true;

      for (const f of fronds) {
        // the same gust that bends the grove moves the leaf at the lens —
        // that agreement across 40 units of depth is the whole illusion
        f.mesh.rotation.z = f.rot0 + wind.x * 0.09 + Math.sin(env.t * 1.1 + f.phase) * 0.02 * (1 + wind.gust * 3);
        f.mesh.material.opacity = 0.9 * (1 - env.duck * 0.15);
      }
    },
    /** The fronds live on the camera, so isolation has to reach them too. */
    setVisible(v) { for (const f of fronds) f.mesh.visible = v; },
  };
}

/** Build the whole world into `scene`; returns per-frame updaters + hooks. */
export function buildWorld(scene, rng, camera) {
  const biomes = [
    makeAir(), makeRoots(rng), makeMycelium(rng), makePool(rng), makeFloor(rng),
    makeCanopy(), makeSky(), makeShafts(rng), makeMist(rng),
    makeFireflies(rng), makeRain(rng), makeNearField(rng, camera),
  ];
  for (const b of biomes) scene.add(b.group);
  return {
    update(dt, env) { for (const b of biomes) b.update(dt, env); },
    /** Debug isolation (proposal E2): show one biome by name, or null for all. */
    isolate(name) {
      for (const b of biomes) {
        const on = !name || b.name === name;
        b.group.visible = on;
        b.setVisible?.(on); // parts that live on the camera, not in the scene
      }
    },
    /** Stream fusion (proposal B3): the figure ignites the ether. Canopy only. */
    ignite() { for (const b of biomes) b.ignite?.(); },
    /** Downbeat events — growth's one licensed rhythm contact (blooms). */
    onDownbeat() { for (const b of biomes) b.onDownbeat?.(); },
  };
}
