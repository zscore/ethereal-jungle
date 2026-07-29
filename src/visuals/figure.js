/**
 * figure.js — the FIGURE stream (visual doc §2.1): hard-edged, fast, near,
 * small, discrete. The eye's drums. Everything here is spent only on
 * anchor-priced positions (synch-point economy §2.2) — scene.js fires these
 * from bus events, never from audio analysis.
 *
 * Vocabulary (proposal B1): kick = expanding shockwave ring at the camera's
 * altitude (the sidechain's visible wavefront); snare = a scatter of
 * hard-edged shards, one-frame attack, fast decay. Both stay white-hot and
 * live on the figure render layer (no bloom, no softness).
 *
 * The third member is the recurring FORM (proposal B2, second attempt). The
 * first attempt was a moth silhouette and D28 removed it; the slot it left is
 * filled here by a rule instead of a drawing — see `motif.js`, which owns the
 * growth and the argument, and holds neither three.js nor state. Everything
 * below is assignment.
 */
import * as THREE from 'three';
import { growMotif, segmentCount, revealCount } from './motif.js';

export function initFigure(scene, layer) {
  // ---- kick rings ----
  const RINGS = 8;
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  for (let i = 0; i < RINGS; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.layers.set(layer);
    scene.add(m);
    rings.push({ mesh: m, life: 0 });
  }
  let ringIdx = 0;

  // ---- snare shards ----
  const BURSTS = 8, PER = 12;
  const shardMesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.16),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    BURSTS * PER,
  );
  shardMesh.layers.set(layer);
  shardMesh.frustumCulled = false;
  scene.add(shardMesh);
  const shardVel = new Float32Array(BURSTS * PER * 3);
  const shardPos = new Float32Array(BURSTS * PER * 3);
  const burstLife = new Float32Array(BURSTS).fill(0);
  let burstIdx = 0;
  const m4 = new THREE.Matrix4();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < BURSTS * PER; i++) shardMesh.setMatrixAt(i, ZERO);

  // ---- the recurring form (B2 again; D28's slot) ----
  // One buffer, allocated for the deepest costume and never reallocated — every
  // appearance is a rewrite of the same vertices and a draw range over them.
  // The reveal is that draw range: because motif.js emits breadth-first, a
  // prefix of the buffer is the same form at a coarser depth, so the form grows
  // trunk-first instead of fading in. Fading in would make it weather; growing
  // makes it a thing that arrives.
  const MAX_DEPTH = 8;
  const formGeo = new THREE.BufferGeometry();
  formGeo.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(segmentCount(MAX_DEPTH) * 6), 3));
  formGeo.setDrawRange(0, 0);
  const formMesh = new THREE.LineSegments(formGeo, new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
  }));
  formMesh.frustumCulled = false;
  formMesh.visible = false;
  formMesh.layers.set(layer);   // figure pass: white-hot, unbloomed, sharp
  scene.add(formMesh);
  let formKey = '';             // the (cell, depth) currently in the buffer

  return {
    /** Kick: shockwave ring at altitude y. During fusion it runs gold. */
    kick(x, y, z, gain, fusion) {
      const r = rings[ringIdx++ % RINGS];
      r.mesh.visible = true;
      r.life = 1;
      r.mesh.position.set(x, y - 1.2, z);
      r.mesh.material.color.set(fusion ? '#ffd9a0' : '#ffffff');
      r.gain = gain;
    },

    /**
     * The recurring form. `state` is whatever `formAt` returned this frame,
     * `amount` the caller's smoothed 0..1 presence, and `cam` the camera the
     * form hangs in front of. Called every frame from the frame loop — never
     * from an event, which is the whole of D28's second constraint.
     */
    form(state, amount, cam) {
      if (amount <= 0.001) { formMesh.visible = false; return; }
      const depth = Math.min(MAX_DEPTH, state.depth);
      const key = `${state.cell.join(',')}|${depth}`;
      if (key !== formKey) {
        // the cell or the costume changed: one regrow per track, not per frame
        const segs = growMotif(state.cell, { depth, length: 1 });
        // Centre it on its own bounding box before upload, so `state.pos` means
        // where the FORM goes rather than where its base does. The rule grows
        // upward from the origin and its height depends on the cell, so a base
        // offset that frames one transform hangs the next one out of shot —
        // which is exactly what the first pass did at 9×, where the figure was
        // 23 units tall and every one of them was above the top of the frame.
        let lo = Infinity, hi = -Infinity, lx = Infinity, hx = -Infinity;
        for (let i = 0; i < segs.length; i += 3) {
          if (segs[i + 1] < lo) lo = segs[i + 1];
          if (segs[i + 1] > hi) hi = segs[i + 1];
          if (segs[i] < lx) lx = segs[i];
          if (segs[i] > hx) hx = segs[i];
        }
        const cy = (lo + hi) / 2, cx = (lx + hx) / 2;
        for (let i = 0; i < segs.length; i += 3) { segs[i] -= cx; segs[i + 1] -= cy; }
        formGeo.attributes.position.array.set(segs);
        formGeo.attributes.position.needsUpdate = true;
        formKey = key;
      }
      formGeo.setDrawRange(0, revealCount(depth, amount) * 2); // vertices, not segments
      formMesh.visible = true;
      formMesh.position.set(cam.x + state.pos.x, cam.y + state.pos.y, cam.z + state.pos.z);
      formMesh.rotation.y = state.spin;
      formMesh.scale.setScalar(state.scale);
      // opacity trails the reveal so the last twigs are not hard-edged the
      // instant they exist; the form is never fully solid, because a figure
      // that opaque at 9× would be a wall rather than a drawing
      formMesh.material.opacity = Math.pow(amount, 1.4) * 0.85;
    },

    /** What the form is actually drawing: segments on screen, not intent. */
    formDrawn() {
      return {
        visible: formMesh.visible,
        segments: formMesh.visible ? formGeo.drawRange.count / 2 : 0,
        opacity: +formMesh.material.opacity.toFixed(3),
      };
    },

    /** Snare: shard scatter — one-frame attack, fast decay. */
    snare(x, y, z, gain) {
      const b = burstIdx++ % BURSTS;
      burstLife[b] = 1;
      for (let i = 0; i < PER; i++) {
        const j = b * PER + i;
        shardPos[j * 3] = x; shardPos[j * 3 + 1] = y; shardPos[j * 3 + 2] = z;
        const th = Math.random() * Math.PI * 2;
        const up = Math.random() * 0.9 + 0.2;
        const sp = (4 + Math.random() * 5) * (0.6 + gain * 0.5);
        shardVel[j * 3] = Math.cos(th) * sp;
        shardVel[j * 3 + 1] = up * sp * 0.7;
        shardVel[j * 3 + 2] = Math.sin(th) * sp;
      }
    },

    update(dt) {
      for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.life -= dt * 2.4;
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        const p = 1 - r.life;
        r.mesh.scale.setScalar(1 + Math.pow(p, 0.55) * 13 * (0.7 + (r.gain ?? 1) * 0.4));
        r.mesh.material.opacity = Math.pow(r.life, 1.6) * 0.9;
      }
      let any = false;
      for (let b = 0; b < BURSTS; b++) {
        if (burstLife[b] <= 0) continue;
        burstLife[b] -= dt * 2.2;
        const dead = burstLife[b] <= 0;
        for (let i = 0; i < PER; i++) {
          const j = b * PER + i;
          if (dead) { shardMesh.setMatrixAt(j, ZERO); continue; }
          shardPos[j * 3] += shardVel[j * 3] * dt;
          shardPos[j * 3 + 1] += shardVel[j * 3 + 1] * dt;
          shardPos[j * 3 + 2] += shardVel[j * 3 + 2] * dt;
          shardVel[j * 3 + 1] -= dt * 14; // gravity: shards fall, hard
          m4.makeScale(burstLife[b], burstLife[b], burstLife[b]);
          m4.setPosition(shardPos[j * 3], shardPos[j * 3 + 1], shardPos[j * 3 + 2]);
          shardMesh.setMatrixAt(j, m4);
        }
        any = true;
      }
      if (any || burstLife.some((v) => v > -1)) shardMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
