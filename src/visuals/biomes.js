/**
 * biomes.js — the one-world solution (visual doc §4.4).
 *
 * Instead of switching visualizer families, ONE continuous world in which each
 * family governs an altitude band. Altitude IS mode brightness: phrygian among
 * the roots, lydian in the light above the canopy. A transition between tracks
 * is not a switch but a traversal — the camera travels — so every boundary is
 * visually legal by construction (d ≡ 0), and the set is one long shot.
 *
 * Band map (world y):        family (visual doc §3):
 *   roots    0–12            local-rule texture  — shimmering, going nowhere
 *   floor   10–24            growth              — vines; all memory, no rhythm
 *   canopy  22–42            fields              — the particle ether, fog
 *   sky     40–62            self-similar        — nested geometry, ascent without arrival
 *
 * Every biome is GROUND stream: soft, slow, continuous (no hard edges here —
 * the figure stream lives in scene.js and is spent only on drum anchors).
 * Each biome reads only env = { t, T, Tf, b, drift, duck } — bus signals,
 * never audio.
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

// ---------- roots: local-rule texture (§3.3) ----------
// Rich local motion, zero global progress — a lattice of points whose
// brightness pulses by neighboring phase, Gray–Scott in spirit if not in math.
function makeRoots() {
  const SIDE = 42;
  const N = SIDE * SIDE;
  const pos = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const gx = (i % SIDE) - SIDE / 2;
    const gz = Math.floor(i / SIDE) - SIDE / 2;
    pos[i * 3 + 0] = gx * 1.6 + Math.sin(gx * 3.7 + gz) * 0.4;
    pos[i * 3 + 1] = 2 + Math.sin(gx * 0.7) * Math.cos(gz * 0.9) * 3 + (i % 7) * 0.6;
    pos[i * 3 + 2] = gz * 1.6 + Math.cos(gz * 2.9 + gx) * 0.4;
    phase[i] = (gx * 0.35 + gz * 0.53); // neighboring cells pulse near-together
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.22, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, color: BAND_COLORS[0].clone().multiplyScalar(2.2),
  });
  const group = new THREE.Points(geo, mat);
  return {
    group,
    update(dt, env) {
      // the whole lattice breathes as slow traveling waves — alive, going nowhere
      mat.opacity = 0.3 + 0.25 * Math.sin(env.t * 0.6) * env.drift + 0.15 * env.T;
      group.rotation.y += dt * 0.008;
      group.position.y = Math.sin(env.t * 0.11) * 0.6;
      void phase; // per-point pulse belongs to the shader upgrade (scene_plan §roadmap)
    },
  };
}

// ---------- floor: growth (§3.1) ----------
// Branching vines: state accumulates and never resets — brown noise, all
// memory. Grown once per seed; rhythm enters only as sway on the surface.
function branch(vertices, rng, x, y, z, dir, len, depth) {
  if (depth <= 0 || len < 0.4) return;
  const nx = x + dir.x * len, ny = y + dir.y * len, nz = z + dir.z * len;
  vertices.push(x, y, z, nx, ny, nz);
  const kids = 1 + (rng() < 0.6 ? 1 : 0);
  for (let k = 0; k < kids; k++) {
    const d = dir.clone();
    d.x += (rng() - 0.5) * 0.9;
    d.y += (rng() - 0.35) * 0.5; // upward bias: it grows toward the canopy
    d.z += (rng() - 0.5) * 0.9;
    d.normalize();
    branch(vertices, rng, nx, ny, nz, d, len * (0.72 + rng() * 0.15), depth - 1);
  }
}

function makeFloor(rng) {
  const vertices = [];
  for (let i = 0; i < 14; i++) {
    const x = (rng() - 0.5) * 60, z = (rng() - 0.5) * 60;
    branch(vertices, rng, x, 10, z, new THREE.Vector3(0, 1, 0), 2.2 + rng() * 1.5, 7);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const mat = new THREE.LineBasicMaterial({
    color: BAND_COLORS[1].clone().multiplyScalar(2.5),
    transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending,
  });
  const group = new THREE.LineSegments(geo, mat);
  return {
    group,
    update(dt, env) {
      group.rotation.y = env.drift * 0.05;             // 1/f sway, quasi-vestibular
      mat.opacity = 0.25 + 0.2 * env.Tf;               // growth answers the arc, not the beat
    },
  };
}

// ---------- canopy: fields (§3.2) ----------
// drift(t) made visible: densities and currents, no individuals. The ether.
function makeCanopy() {
  const N = 4000;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3 + 0] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 1] = 22 + Math.random() * 20;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.12, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const group = new THREE.Points(geo, mat);
  return {
    group, mat,
    update(dt, env) {
      mat.color = paletteAt(env.b);
      mat.opacity = (0.35 + 0.35 * env.Tf) * (1 - env.duck * 0.45); // the kick ducks the ether
      group.rotation.y += dt * (0.01 + 0.04 * env.T);
      group.position.y = env.drift * 1.5;
    },
  };
}

// ---------- sky: self-similar geometry (§3.4) ----------
// The same structure at every scale: nested wireframe shells rotating at
// harmonic-ratio rates — ascent without arrival, the eye's shimmer reverb.
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
  return {
    group,
    update(dt, env) {
      shells.forEach((m, i) => {
        // coprime-ish rates: the nest never quite recurs (the Eno theorem, for the eye)
        m.rotation.y += dt * 0.05 * (i % 2 ? 1 : -1) * (1 + i * 0.618) * (0.5 + env.T);
        m.rotation.x += dt * 0.02 * (1 + i * 0.382);
        m.material.opacity = (0.1 + 0.1 * env.b) * (1 - i * 0.15) * (1 - env.duck * 0.3);
      });
    },
  };
}

/** Build the whole world into `scene`; returns per-frame updaters. */
export function buildWorld(scene, rng) {
  const biomes = [makeRoots(), makeFloor(rng), makeCanopy(), makeSky()];
  for (const b of biomes) scene.add(b.group);
  return {
    update(dt, env) { for (const b of biomes) b.update(dt, env); },
  };
}
