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
 * The glyph (proposal B2, §5 "repetition legitimizes"): ONE silhouette — a
 * long-tailed moth drawn in line segments — appearing only in each track's
 * peak section, transformed per track: small and violet among the roots, vast
 * and slow at the canopy climax, a constellation outline in zenith. Three
 * appearances make it an institution; it is the visual sibling of the music's
 * single melodic cell.
 */
import * as THREE from 'three';

// per-track glyph costume: scale, vertical offset from camera, color
const GLYPH_COSTUME = [
  { scale: 2.5, dy: -3, color: '#c9a8ff' }, // undergrowth: small, violet, below
  { scale: 4.5, dy: -1, color: '#a8ffc9' }, // forest floor: mid, mossy
  { scale: 9,   dy: 3,  color: '#dce8ff' }, // canopy: vast and slow overhead
  { scale: 6.5, dy: 6,  color: '#ffe9b8' }, // zenith: a constellation outline
];

function mothWing(sign) {
  // one wing outline as a line strip (authored once — THE silhouette)
  const pts = [
    [0, 0], [1.2, 0.9], [2.2, 1.4], [3.0, 1.2], [3.3, 0.6], [2.6, 0.1],
    [3.1, -0.6], [2.3, -1.1], [1.2, -1.0], [0, -0.3],
  ].map(([x, y]) => new THREE.Vector3(sign * x, y, 0));
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function mothBody() {
  const pts = [
    [0, -0.6, 0], [0, 0.8, 0],            // body
    [0, 0.8, 0], [0.4, 1.4, 0],           // antennae
    [0, 0.8, 0], [-0.4, 1.4, 0],
    [0, -0.6, 0], [0.5, -2.4, 0],         // tail streamers
    [0, -0.6, 0], [-0.5, -2.4, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return new THREE.BufferGeometry().setFromPoints(pts);
}

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

  // ---- the glyph ----
  const glyph = new THREE.Group();
  const glyphMat = new THREE.LineBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, // reads against the fusion glow
    fog: false, // figure stream: sharp and near, never atmospheric
  });
  const wingL = new THREE.Line(mothWing(-1), glyphMat);
  const wingR = new THREE.Line(mothWing(1), glyphMat);
  const body = new THREE.LineSegments(mothBody(), glyphMat);
  glyph.add(wingL, wingR, body);
  glyph.traverse((o) => o.layers?.set(layer));
  glyph.visible = false;
  scene.add(glyph);
  let glyphOpacity = 0;

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

    /**
     * The glyph appears only during `peak` sections; costume by track.
     * Motion is slow and drift-driven — it is figure by edge, not by rhythm.
     */
    updateGlyph(dt, env, camX, camY, active) {
      const c = GLYPH_COSTUME[env.trackIndex % GLYPH_COSTUME.length];
      glyphOpacity += ((active ? 0.85 : 0) - glyphOpacity) * Math.min(1, dt * 0.8);
      glyph.visible = glyphOpacity > 0.01;
      if (!glyph.visible) return;
      glyphMat.opacity = glyphOpacity;
      glyphMat.color.set(c.color);
      glyph.scale.setScalar(c.scale);
      // distance grows with costume scale: vast reads as far, never engulfing
      glyph.position.set(camX + env.drift * 4, camY + c.dy + Math.sin(env.t * 0.23) * 1.5, -14 - c.scale * 4);
      const flap = 0.35 + 0.3 * Math.sin(env.t * (env.trackIndex === 2 ? 0.6 : 1.7)); // vast = slow
      wingL.rotation.y = flap;
      wingR.rotation.y = -flap;
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
