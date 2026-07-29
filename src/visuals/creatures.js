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
import { shadedColor } from './shade.js';
import {
  populationFor, slothReach, wingbeat, throatPulse, slotEvent, flushEnv,
} from './fauna.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const UP = new THREE.Vector3(0, 1, 0);
const NO_WIND = { x: 0, y: 0, z: 0, gust: 0, amp: 0 };
const windAtOr = (env, x, y, z) => (env.wind ? env.wind(x, y, z) : NO_WIND);
const SOAR_SCALE = new THREE.Vector3(2.6, 2.6, 2.6);


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
function makeCreatureMat(props, shadeOpts = {}) {
  const m = new MeshBasicNodeMaterial({
    transparent: true, opacity: 0, depthWrite: false, ...props,
  });
  m.colorNode = shadedColor({ worldTop: 62, ...shadeOpts });
  return m;
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
  const mat = makeCreatureMat({ color: '#4a5942', fog: true }, { worldTop: 62 });
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
  const CAM = { x: 0, z: 12 };
  const candidates = trees
    .map((tr, idx) => ({ tr, idx, d: Math.hypot(tr.x - CAM.x, tr.z - CAM.z) }))
    .filter((c) => c.d > 4 && c.d < 17 && c.tr.h > spec.y[1] + 3)
    .sort((a, b) => a.d - b.d);

  const beasts = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const host = candidates.length ? candidates[i % candidates.length].tr : null;
    const hy = spec.y[0] + rng() * (spec.y[1] - spec.y[0]);
    // the branch points back toward the camera's side of the trunk, so the
    // sloth travels ACROSS the view rather than away down it
    const toCam = host ? Math.atan2(CAM.z - host.z, CAM.x - host.x) : 0;
    const theta = toCam + (rng() < 0.5 ? 1 : -1) * (0.5 + rng() * 0.7);
    const len = 7 + rng() * 4;
    const bx = host ? host.x : (rng() - 0.5) * 12;
    const bz = host ? host.z : 2 - rng() * 8;
    const r0 = host ? host.rad * 0.9 : 0;

    const branch = new THREE.Mesh(branchGeo, barkMat);
    // built along +Y then laid down along theta, with a slight droop
    const droop = 0.11 + rng() * 0.07;
    branch.scale.y = len;
    branch.rotation.order = 'YZX';
    branch.rotation.set(0, -theta, Math.PI / 2 - droop);
    branch.position.set(
      bx + Math.cos(theta) * (r0 + len * 0.5),
      hy - len * 0.5 * Math.sin(droop),
      bz + Math.sin(theta) * (r0 + len * 0.5),
    );
    group.add(branch);

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
      g, head, limbs, i, sway: rng() * 9, headRest: 0,
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
        u: +b.u.toFixed(3), dir: b.dir, y: +b.hy.toFixed(1),
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

      for (const b of beasts) {
        const wind = windAtOr(env, b.bx, b.hy, b.bz);

        // CONTINUOUS: the reach — slow, and slower still at high tension. A
        // sloth at the drop is not a faster sloth, and refusing to accelerate
        // where everything else in the frame is accelerating is the joke.
        const reach = slothReach(env.t, b.i, env.T ?? 0) * (1 - still * 0.7);

        // …and the reach is what MOVES it. This is the animation the first pass
        // was missing: the sloth used to reach in place, so it was a fixed
        // object with a moving arm. Travel is driven by the same envelope, so
        // it advances in pulses — hand, then body, then hand — and is
        // motionless in between, which is what hanging locomotion looks like.
        // A full traverse of a 10-unit branch takes something over two minutes.
        b.u += dt * 0.016 * (0.12 + reach) * b.dir * (1 - still * 0.8);
        if (b.u > 0.92) { b.u = 0.92; b.dir = -1; }
        else if (b.u < 0.08) { b.u = 0.08; b.dir = 1; }

        // where that puts it: along the branch ray, hanging under it
        const along = b.u * b.len;
        const drop = 1.75;
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
 * Tree frogs, on leaves at EYE LEVEL for the forest-floor camera (y 18–32).
 *
 * The brief asked for frogs on the forest floor. Three things said undergrowth:
 * `ambfrogs` is track 0's bed, the pool fades out by camera y ≈ 26, and the
 * litter is 20–30 units below this track's lens and out of frame. A tree frog
 * is the frog that answers all three without overruling the brief — it lives
 * exactly where this camera is looking.
 *
 * Real frog choruses DO synchronise, and a synchronised chorus is rhythm on the
 * ground stream. So this is the fireflies' deliberate wrongness one organ over:
 * chorus DENSITY rides tension, individual periods may never agree, and
 * `throatPulse` goes through `phaseFor` to guarantee it.
 */
export function makeTreeFrogs(rng, spec, name) {
  const n = spec.count;
  // Not additive, and not a glowing orb. The first pass used additive blending
  // at 0.30 units and photographed as green lanterns hanging in the trunks —
  // this world is full of glow already (fireflies, motes, the ether) and one
  // more emissive blob reads as another particle system rather than an animal.
  // A frog is a small WET BODY: normal blending, a body colour, and only the
  // throat brightens when it calls.
  const mat = makeCreatureMat({ color: '#5a9160' });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.20, 10, 7), mat, n);
  mesh.frustumCulled = false;
  const frogs = [];
  for (let i = 0; i < n; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 6 + rng() * 13;
    frogs.push({
      x: Math.cos(ang) * rad, z: Math.sin(ang) * rad,
      y: spec.y[0] + rng() * (spec.y[1] - spec.y[0]),
      // where a jump would take it — chosen once, so a jump is a move between
      // two real perches rather than a teleport to a fresh random point
      jx: Math.cos(ang + 0.7) * (rad + 2.5), jz: Math.sin(ang + 0.7) * (rad + 2.5),
      jy: 0,
      i,
    });
  }
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const base = new THREE.Color('#7cc47f');

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
      mat.opacity = presence;

      // chorus density rides tension — MORE frogs calling, never faster ones
      const density = 0.25 + 0.75 * clamp01(env.T ?? 0) * (1 - life.still);

      for (let k = 0; k < drawn; k++) {
        const f = frogs[k];
        // EPISODIC: a jump between two perches. The one hard-edged motion in
        // this tier, licensed as weather exactly the way a strike is.
        const jump = slotEvent(env.t, (f.i + 3) * 5501, 19 / Math.max(0.3, life.rate), 0.45 * (1 - life.still));
        const j = jump ? clamp01(jump.since / 0.55) : 0;
        const arc = jump && jump.since < 0.55 ? Math.sin(j * Math.PI) * 1.4 : 0;
        const at = jump ? (jump.since < 0.55 ? j : 1) : 0;
        const x = f.x + (f.jx - f.x) * at;
        const z = f.z + (f.jz - f.z) * at;
        const wind = windAtOr(env, x, f.y, z);

        // CONTINUOUS: the throat. Desynchronised by construction.
        const call = throatPulse(env.t, f.i, 1) * density;
        const s = 1 + call * 0.45;   // the throat swells; the frog does not inflate
        m4.makeScale(s, s * 0.85, s);
        m4.setPosition(x + wind.x * 0.12, f.y + arc + wind.y * 0.1, z + wind.z * 0.12);
        mesh.setMatrixAt(k, m4);
        col.copy(base).multiplyScalar(presence * (0.55 + call * 0.9));
        mesh.setColorAt(k, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

/**
 * The chorus at the water, in the undergrowth — where `ambfrogs` actually
 * sounds (D16). Nearly free, because `makePool` already recycles ten rings on a
 * free index: a call drops one in, so the frogs and the water are the same
 * event rather than two things that happen to be near each other.
 */
export function makePoolFrogs(rng, spec, name, pool) {
  const n = spec.count;
  const mat = makeCreatureMat({ color: '#649c74' });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 7), mat, n);
  mesh.frustumCulled = false;
  const frogs = [];
  for (let i = 0; i < n; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 8 + rng() * 20;
    frogs.push({
      x: Math.cos(ang) * rad, z: Math.sin(ang) * rad,
      y: spec.y[0] + rng() * (spec.y[1] - spec.y[0]),
      i, wasCalling: false,
    });
  }
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const base = new THREE.Color('#8fd49b');

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
      mat.opacity = presence * 0.9;
      const density = 0.3 + 0.7 * clamp01(env.T ?? 0) * (1 - life.still);

      for (let k = 0; k < drawn; k++) {
        const f = frogs[k];
        const call = throatPulse(env.t, f.i, 7) * density;
        const s = 1 + call * 0.5;
        m4.makeScale(s, s * 0.8, s);
        m4.setPosition(f.x, f.y + call * 0.12, f.z);
        mesh.setMatrixAt(k, m4);
        col.copy(base).multiplyScalar(presence * (0.6 + call * 1.0));
        mesh.setColorAt(k, col);

        // the call lands on the water: one ring, on the rising edge only
        const calling = call > 0.55;
        if (calling && !f.wasCalling) pool?.ripple?.(f.x, f.z, 0.55);
        f.wasCalling = calling;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
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
