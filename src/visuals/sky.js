/**
 * sky.js — the weather deck, the storm cell, and the shadow they cast
 * (proposal IV, tier V).
 *
 * Split out of `biomes.js` rather than added to it: that file is already 1500
 * lines of ground, and the sky is the one part of this world with its own
 * geometry problem. It keeps the same contract every biome has —
 * `{ name, group, update(dt, env) }` — so `buildWorld` composes it identically.
 *
 * ---------------------------------------------------------------------------
 * What was wrong, in three constants that had never been read against each
 * other:
 *
 *   TRACK_WEATHER[3] = { rain: 0.00 }        the zenith
 *   storm = rain · T                          (the old derivation)
 *   cloud deck visible only above CANOPY_BASE
 *
 * The zenith's rain was 0, so its storm was identically 0, so the ONE band in
 * the set with a visible sky could never contain lightning. Meanwhile the
 * forest floor — which storms hard — sits under a crown layer that hides the
 * deck completely. Every strike in the set was fired at a sky nobody could see,
 * and the deck floated over a band that never struck. V3 fixed the first half
 * in `weather.js` (storm is its own authored column now, with `stormFar` saying
 * where the cells are); this file is the second half.
 *
 * The other geometry problem, and the reason V1 is a different object rather
 * than a better texture: the old deck was two additive sheets inside a group at
 * y 56, i.e. at y 72 and 82. The zenith camera flies at y 45–56 with
 * BAND_PITCH[3] = −8, tilted DOWN over the canopy. So the sheets sat 16–37
 * units overhead while the camera looked the other way. You do not fly *under*
 * a cloud deck; you fly *among* clouds. Hence a field the camera is inside,
 * with cloud below it, beside it, and out to the horizon — and the two original
 * sheets kept above it all as high cirrus, which is the right thing at that
 * height and is what lightning wants to light.
 *
 * Purity, same as `weather.js` and `fauna.js`: the schedules and the shadow
 * field are functions of `(t, seed, …)` with no three.js in them, so
 * `test/sky.mjs` can assert that a cell crosses the world, that the shadow it
 * casts travels with it, and that the harness can reproduce a given storm.
 */
import * as THREE from 'three';
import { windDir, hash01 } from './weather.js';
import { CANOPY_BASE, CANOPY_TOP } from './look.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);

// ---------- V2: the storm cell, as a pure schedule ----------
// A named, positioned, moving object rather than a global weather amount. The
// distinction is the same one K1 makes about gusts: an amount that rises
// everywhere at once reads as a fade, and a thing that crosses the world reads
// as weather. A cell ARRIVES, crosses on the prevailing wind, and leaves.
//
// Time-addressable, like `lightningAt` and for the same reason — the harness
// has to be able to photograph one on demand, and a storm you can only reach by
// waiting is a storm nobody will ever look at.
export const CELL_SLOT = 46;      // seconds per arrival roll
export const CELL_SPEED = 3.2;    // world units/s a cell travels
export const CELL_LIFE = 40;      // seconds from arrival to gone

/**
 * The storm cell at set-time t, or null.
 *
 * `far` (weather.stormFar) decides the radius it crosses at: overhead on the
 * forest floor, out on the horizon at the zenith. That one number is what lets
 * the same object be "the storm you are inside" and "the storm you are watching
 * from above", which is the image V3 was decoupled to make possible.
 */
export function cellAt(t, seed = 1, storm = 0, far = 0.5) {
  if (storm <= 0.02) return null;
  const slot = Math.floor(t / CELL_SLOT);
  let best = null;
  for (let s = slot - 1; s <= slot; s++) {
    if (hash01(Math.imul(s, 2246822519) + seed * 3266489917) >= clamp01(storm)) continue;
    const born = s * CELL_SLOT + hash01(Math.imul(s, 668265263) + seed * 374761393) * CELL_SLOT * 0.5;
    const age = t - born;
    if (age < 0 || age > CELL_LIFE) continue;
    // arrives, holds, leaves — a half-sine so nothing appears or vanishes
    const life = Math.sin(Math.PI * (age / CELL_LIFE));
    // it crosses along the prevailing wind, through a point offset to one side
    const d = windDir(t, 0);
    const bearing = hash01(Math.imul(s, 22695477) + seed * 7919) * Math.PI * 2;
    const radius = 34 + far * 150;
    const travelled = (age - CELL_LIFE / 2) * CELL_SPEED;
    const x = Math.cos(bearing) * radius + d.x * travelled;
    const z = Math.sin(bearing) * radius + d.z * travelled;
    const cand = {
      x, z,
      y: 52 + far * 12,
      intensity: clamp01(storm) * life,
      far,
      age,
      bearing: Math.atan2(z, x),
      distance: Math.hypot(x, z),
    };
    if (!best || cand.intensity > best.intensity) best = cand;
  }
  return best;
}

// ---------- V5: the shadow a cloud casts on the crown sea ----------
// One analytic field, sampled by the sky AND by the forest at its own position
// — the K1 pattern exactly, and for the K1 reason: two copies of a travelling
// pattern drift apart, and a shadow that does not agree with the cloud above it
// is worse than no shadow at all.
//
// This is the item that makes the clouds feel like they are IN the world rather
// than painted on the back of it, and it pays off at canopy altitude rather
// than at the zenith — the one V-tier item the canopy track gets.
export const SHADOW = { scale: 0.021, speed: 5.5, depth: 0.45 };

/** How much shadow is on the crowns at (x, z), 0 = full sun, 1 = under cloud. */
export function cloudShadeAt(t, x = 0, z = 0, opts = {}) {
  const cover = clamp01(opts.cover ?? 0.5);
  if (cover <= 0.001) return 0;
  const d = windDir(t, opts.drift ?? 0);
  // the pattern travels with the wind: project onto the direction and scroll
  const along = (x * d.x + z * d.z) - t * SHADOW.speed;
  const across = x * -d.z + z * d.x;
  // two coprime-ish spatial periods, so the cover never tiles visibly
  const a = Math.sin(along * SHADOW.scale) * Math.sin(across * SHADOW.scale * 0.77 + 1.3);
  const b = Math.sin(along * SHADOW.scale * 1.9 + 2.1) * 0.45;
  return clamp01((a + b) * 0.5 + 0.5 - (1 - cover) * 0.5) * SHADOW.depth * cover;
}

// ---------- the meshes ----------
/** Soft round puff, drawn once and shared by every cloud card. */
function puffTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(240,246,255,0.42)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

/**
 * V1 + V2 + V4 — the cloud field, the cell, and the rain shaft under it.
 *
 * Every cloud is a cluster of camera-facing cards, which is the cheap way to
 * get a volume that survives being flown through: parallax between the cards
 * does the work a scrolling texture cannot, and parallax is what makes altitude
 * legible in a band whose entire content is "you are above the trees".
 */
export function makeSky(rng) {
  const group = new THREE.Group();
  const tex = puffTexture();

  // ---- the field: clusters spread through the air the camera flies in ----
  const CLUSTERS = 26;
  const CARDS_PER = 7;
  const N = CLUSTERS * CARDS_PER;
  const cloudMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.NormalBlending, fog: false, side: THREE.DoubleSide,
  });
  const cloudMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), cloudMat, N);
  cloudMesh.frustumCulled = false;
  cloudMesh.instanceColor = null;
  const cards = [];
  for (let c = 0; c < CLUSTERS; c++) {
    // spread through y 40–78: below the zenith camera as well as above it, so
    // there is cloud UNDER you at the top of the set. That is the whole item.
    const cy = 40 + rng() * 38;
    const ang = rng() * Math.PI * 2;
    const rad = 40 + rng() * 190;
    const cx = Math.cos(ang) * rad;
    const cz = Math.sin(ang) * rad;
    const scale = 16 + rng() * 34;
    for (let i = 0; i < CARDS_PER; i++) {
      cards.push({
        cx, cy, cz,
        ox: (rng() - 0.5) * scale * 1.5,
        oy: (rng() - 0.5) * scale * 0.42,
        oz: (rng() - 0.5) * scale * 1.5,
        size: scale * (0.5 + rng() * 0.7),
        // each card drifts a hair differently, so a cluster breathes
        wob: rng() * 9,
        bright: 0.55 + rng() * 0.45,
      });
    }
  }

  // ---- the high cirrus: the two original sheets, kept, and now above the
  // field rather than being the whole of it. Lightning still lights them.
  const cirrusTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    for (const [at, c] of [
      [0, 'rgba(0,0,0,0)'], [0.3, 'rgba(120,148,186,0.22)'],
      [0.52, 'rgba(226,234,246,0.40)'], [0.72, 'rgba(140,164,196,0.20)'], [1, 'rgba(0,0,0,0)'],
    ]) grad.addColorStop(at, c);
    g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
    const t2 = new THREE.CanvasTexture(cv);
    t2.wrapS = THREE.RepeatWrapping;
    return t2;
  })();
  const banks = [];
  for (const [scroll, y, tilt, size] of [[0.010, 84, 0.07, 34], [0.016, 96, -0.05, 26]]) {
    const g = new THREE.PlaneGeometry(340, size, 64, 1);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 0.021) * 14);
    const t2 = cirrusTex.clone();
    t2.needsUpdate = true;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: t2, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    m.position.y = y;
    m.rotation.x = tilt;
    group.add(m);
    banks.push({ mesh: m, scroll, tex: t2 });
  }

  // ---- the cell: a dark base, an anvil, and the shaft under it (V4) ----
  const cellGroup = new THREE.Group();
  const cellMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const CELL_CARDS = 16;
  const cellMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), cellMat, CELL_CARDS);
  cellMesh.frustumCulled = false;
  const cellCards = [];
  for (let i = 0; i < CELL_CARDS; i++) {
    const up = i / CELL_CARDS;
    cellCards.push({
      ox: (rng() - 0.5) * 46 * (0.5 + up),
      oy: up * 34,
      oz: (rng() - 0.5) * 46 * (0.5 + up),
      size: 30 + rng() * 26 + up * 22,   // widens toward the anvil
      shade: 1 - up * 0.75,              // dark base, bright top
    });
  }
  cellGroup.add(cellMesh);

  // V4 — virga. From above, a rain shaft is the most legible weather object
  // there is, and K3's camera-local cylinder is by construction invisible from
  // outside itself. A soft tapered volume under the cell, same texture family.
  const virga = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 26, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#9fb6d8', transparent: true, opacity: 0, depthWrite: false,
      fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  virga.position.y = -26;
  cellGroup.add(virga);
  group.add(cellGroup);
  group.add(cloudMesh);

  const m4 = new THREE.Matrix4();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const cellColor = new THREE.Color();
  let cellNow = null;

  return {
    name: 'sky',
    group,
    /** V2 — what the sky is doing this frame, for the harness (Y3). */
    debug() {
      return cellNow ? {
        x: +cellNow.x.toFixed(1), z: +cellNow.z.toFixed(1),
        intensity: +cellNow.intensity.toFixed(3),
        distance: +cellNow.distance.toFixed(1),
        bearing: +cellNow.bearing.toFixed(3),
      } : null;
    },
    /** The cell's bearing, so a strike can come FROM it (V2). */
    cell() { return cellNow; },
    update(dt, env) {
      const camY = env.cam?.y ?? 0;
      const alt = camY / (env.worldTop ?? 62);
      const q0 = env.quality ?? 1;
      const weather = env.weather ?? {};
      const flash = env.flash ?? 0;

      // How much sky there is to see. The cirrus keeps the old gate (from under
      // the crowns there is genuinely no sky), but the FIELD does not: it
      // extends well below the crowns' underside, so its top is visible through
      // the gaps from inside the canopy — which is what "the storming track can
      // finally see its own clouds" means (V3, part 2).
      const open = clamp01((alt - CANOPY_BASE) / (CANOPY_TOP - CANOPY_BASE));
      const gaps = clamp01((alt - CANOPY_BASE * 0.55) / 0.5);
      group.visible = gaps > 0.01 || flash > 0.001;
      if (!group.visible) return;
      // Y2 — the governor's top rung. The field is the newest and heaviest
      // thing in the world, so it is the first thing sold; the cirrus and the
      // cell are cheap and stay, which means a shed frame still has a sky and
      // still has its storm. Selling the whole band would cost the picture a
      // sentence rather than an ornament.
      const fieldOn = env.sky !== false;
      cloudMesh.visible = fieldOn;

      eye.copy(env.cam ?? pos.set(0, camY, 0));

      // ---- the field ----
      if (fieldOn) {
      const drawn = Math.max(CARDS_PER * 6, Math.round(N * q0));
      if (cloudMesh.count !== drawn) cloudMesh.count = drawn;
      cloudMat.opacity = gaps * (0.30 + 0.34 * (weather.mist ?? 0.3)) + flash * 0.28;
      const windX = (env.wind ? env.wind(0, 70, 0).x : 0);
      for (let i = 0; i < drawn; i++) {
        const c = cards[i];
        // the whole field drifts downwind, slowly — cloud is the one thing up
        // here that is unambiguously moving
        const dx = Math.sin(env.t * 0.05 + c.wob) * 3;
        pos.set(c.cx + c.ox + windX * 6 + dx, c.cy + c.oy + Math.sin(env.t * 0.07 + c.wob) * 1.2, c.cz + c.oz);
        m4.lookAt(pos, eye, UP_);
        scl.set(c.size, c.size * 0.62, 1);
        m4.scale(scl);
        m4.setPosition(pos);
        cloudMesh.setMatrixAt(i, m4);
      }
      cloudMesh.instanceMatrix.needsUpdate = true;
      }

      // ---- the cirrus ----
      for (const r of banks) {
        r.tex.offset.x += dt * r.scroll * (1 + env.drift * 0.4);
        r.mesh.material.opacity = open * (0.30 + 0.35 * (env.T ?? 0)) + flash * 0.5;
      }

      // ---- the cell ----
      cellNow = cellAt(env.t, env.seed ?? 1, weather.storm ?? 0, weather.stormFar ?? 0.5);
      cellGroup.visible = !!cellNow;
      if (cellNow) {
        cellGroup.position.set(cellNow.x, cellNow.y, cellNow.z);
        const vis = cellNow.intensity * (0.45 + 0.55 * gaps);
        cellMat.opacity = clamp01(vis * 0.85 + flash * 0.5);
        // lit from inside by its own strike — the thing the upper-air comment
        // has wanted since it was written
        for (let i = 0; i < CELL_CARDS; i++) {
          const c = cellCards[i];
          // instances are LOCAL to cellGroup, so build the matrix in world
          // space for the billboard and then subtract the group's position
          pos.set(cellNow.x + c.ox, cellNow.y + c.oy, cellNow.z + c.oz);
          m4.lookAt(pos, eye, UP_);
          scl.set(c.size, c.size * 0.7, 1);
          m4.scale(scl);
          m4.setPosition(pos.x - cellNow.x, pos.y - cellNow.y, pos.z - cellNow.z);
          cellMesh.setMatrixAt(i, m4);
          cellColor.setRGB(
            c.shade * (0.30 + 0.7 * flash),
            c.shade * (0.33 + 0.66 * flash),
            c.shade * (0.42 + 0.6 * flash),
          );
          cellMesh.setColorAt(i, cellColor);
        }
        cellMesh.instanceMatrix.needsUpdate = true;
        if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
        virga.material.opacity = clamp01(cellNow.intensity * 0.30 * gaps);
      }
    },
  };
}

// scratch, module-level so the frame loop never allocates
const UP_ = new THREE.Vector3(0, 1, 0);
