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
 * plus the air (altitude-graded background) and canopy light shafts.
 *
 * Every biome is GROUND stream: soft, slow, continuous. Rhythm touches the
 * ground in exactly two licensed places: downbeat blooms (growth's "events on
 * the surface", §3.1) and the kick's duck/flinch (the coupling constant).
 * Each biome reads only env — bus signals, never audio:
 *   env = { t, T, Tf, b, drift, duck, trackPhase, trackIndex }
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
      for (let s = 0; s < 5; s++) step(F, k);
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
      group.rotation.y = env.drift * 0.05;             // 1/f sway, quasi-vestibular
      mat.opacity = 0.35 + 0.25 * env.Tf;              // growth answers the arc, not the beat
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
      for (let i = 0; i < N; i++) {
        let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        // analytic swirl: layered incompressible-ish sines (curl noise in spirit)
        x += (Math.sin(y * 0.16 + tw) * Math.cos(z * 0.11) + 0.4 * Math.sin(z * 0.05 + tw * 1.7)) * speed;
        y += (0.35 * Math.sin(x * 0.09 + tw * 0.7) * Math.cos(y * 0.13)) * speed
           - env.duck * dt * 7;                        // the kick's downdraft
        z += (Math.cos(x * 0.13 - tw * 0.9) * Math.sin(y * 0.10) + 0.4 * Math.cos(x * 0.04 - tw)) * speed;
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
      for (const r of ribbons) {
        r.tex.offset.x += dt * r.scroll * (1 + env.drift * 0.4);
        r.mesh.material.opacity = Math.max(0, env.b - 0.55) * (0.9 + 0.5 * env.T);
      }
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
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  mesh.renderOrder = -1;
  return {
    name: 'air',
    group: mesh,
    update(dt, env) { mesh.position.y = 20 + env.b * 10; }, // the warm top nears as you climb
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
    m.rotation.z = (rng() - 0.5) * 0.12; // slight slant, never perfectly plumb
    group.add(m);
    blades.push(m);
  }
  return {
    name: 'shafts',
    group,
    update(dt, env) {
      const strength = (0.06 + 0.22 * env.T) * Math.min(1, Math.max(0, env.b * 1.6));
      for (const m of blades) {
        m.material.opacity = strength * (0.7 + 0.3 * Math.sin(env.t * 0.21 + m.position.x));
        if (env.cam) m.rotation.y = Math.atan2(env.cam.x - m.position.x, env.cam.z - m.position.z);
      }
    },
  };
}

/** Build the whole world into `scene`; returns per-frame updaters + hooks. */
export function buildWorld(scene, rng) {
  const biomes = [makeAir(), makeRoots(rng), makeFloor(rng), makeCanopy(), makeSky(), makeShafts(rng)];
  for (const b of biomes) scene.add(b.group);
  return {
    update(dt, env) { for (const b of biomes) b.update(dt, env); },
    /** Debug isolation (proposal E2): show one biome by name, or null for all. */
    isolate(name) {
      for (const b of biomes) b.group.visible = !name || b.name === name;
    },
    /** Stream fusion (proposal B3): the figure ignites the ether. Canopy only. */
    ignite() { for (const b of biomes) b.ignite?.(); },
    /** Downbeat events — growth's one licensed rhythm contact (blooms). */
    onDownbeat() { for (const b of biomes) b.onDownbeat?.(); },
  };
}
