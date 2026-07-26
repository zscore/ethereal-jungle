/**
 * shrine.js — the corpus family (§3.5), and the last one to arrive.
 *
 * A small screen in the undergrowth showing the world's own recent past,
 * chopped by `permuteBreak` — THE SAME σ machinery the break uses, imported
 * from the music generators, re-permuted every bar exactly as the drums are.
 * §1.1's formalism doesn't "transfer" here; it is literally the same function
 * applied to a different tuple:
 *
 *   B = (b₀ … b₁₅)   sixteen slices of a drum bar   → the break
 *   B = (f₀ … f₁₅)   sixteen frames of this world   → the shrine
 *
 * **Self-corpus, not found footage** (fancy proposal F1). A shrine-eye camera
 * records the ground stream into a ring of low-res render targets on the
 * 16th-note grid, and the screen plays back slice σ(i) instead of slice i.
 * No licensing surface, no asset pipeline, and the thematically exact image:
 * the jungle dreaming of itself, one bar behind.
 *
 * Three properties fall out of using the real permuter, and they are the
 * reason for doing it this way:
 *   - ANCHORS (0, 4, 8, 12) are never permuted, so on the downbeat and the
 *     backbeats the shrine shows *now* and agrees with the world; between them
 *     it lies. The corpus family pays INTO the synch-point economy (§2.2)
 *     instead of spending from it — a visual downbeat is a metric anchor.
 *   - edit rate = `w`, for free and by construction: identity at w=0 (a quiet
 *     window onto the jungle), breakcore at w=1.
 *   - the capture camera sees layer 0 only. It cannot film the figure stream
 *     and it cannot film the shrine, so there is no feedback recursion and the
 *     recording carries the weather without the drums.
 *
 * Stream: FIGURE (sharp, near, discrete, unbloomed) — the cut is the hardest
 * attack in the visual repertoire. But it is figure confined to one *place*,
 * the undergrowth, and it fades to nothing as the camera climbs out of the
 * roots: the one biome that owns video is the one you leave.
 */
import * as THREE from 'three';
import { permuteBreak } from '../music/generators.js';
import { makeRng, BAR_SECONDS } from '../bus.js';

const SLICES = 16;                       // one bar of sixteenths — the break's grid
const STEP_SECONDS = BAR_SECONDS / SLICES;
const CAP_W = 256, CAP_H = 144;          // the corpus is degraded by design
const TOP = 22;                          // above this altitude the shrine is gone

export function initShrine(renderer, scene, layer, seed = 1) {
  const group = new THREE.Group();

  // the ring: sixteen frames of the world, overwritten forever
  const targets = [];
  for (let i = 0; i < SLICES; i++) {
    const rt = new THREE.RenderTarget(CAP_W, CAP_H, { depthBuffer: true });
    rt.texture.minFilter = THREE.LinearFilter;
    rt.texture.magFilter = THREE.NearestFilter; // pixels, not smoothing: a screen
    rt.texture.generateMipmaps = false;
    targets.push(rt);
  }

  const screenMat = new THREE.MeshBasicMaterial({
    map: targets[0].texture, transparent: true, opacity: 0,
    // a lit screen in a dark jungle: additive, so the recording's black is
    // simply absent and its highlights glow the way a CRT does
    blending: THREE.AdditiveBlending,
    toneMapped: false, fog: false, depthWrite: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), screenMat);
  group.add(screen);

  // the object around the picture: a hard white frame, so it reads as a thing
  // in the world rather than a hole in it
  const fw = 4.1, fh = 2.35;
  const frameGeo = new THREE.BufferGeometry().setFromPoints([
    [-fw, -fh], [fw, -fh], [fw, -fh], [fw, fh], [fw, fh], [-fw, fh], [-fw, fh], [-fw, -fh],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0.01)));
  const frameMat = new THREE.LineBasicMaterial({
    color: 0xdfe8ff, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  group.add(new THREE.LineSegments(frameGeo, frameMat));

  // Left of the world axis and just above the camera's downward gaze in the
  // roots. Close enough to the axis that the 1/f sway and the band's orbit
  // (I1) can't carry it out of frame, far enough off-center that it never
  // stands in front of the world — it is a place you pass, not a HUD.
  group.position.set(-5.5, 3.5, -2);
  group.traverse((o) => o.layers?.set(layer)); // figure stream: no bloom, no fog
  scene.add(group);

  // the shrine's eye: ground stream only (layer 0), so it can film neither the
  // drums nor itself. It circles the world slowly at the camera's own altitude.
  const eye = new THREE.PerspectiveCamera(52, CAP_W / CAP_H, 0.5, 220);
  eye.layers.set(0);

  let sigma = Array.from({ length: SLICES }, (_, i) => i);
  let bar = -1;
  let step = -1;
  let enabled = true;
  let opacity = 0;

  return {
    group,
    /** Quality governor hook (J1): drop the whole tier, keep the world. */
    setEnabled(v) { enabled = v; if (!v) { screenMat.opacity = 0; frameMat.opacity = 0; } },
    get recording() { return enabled && opacity > 0.02; },

    /**
     * env: { t, w, b, cam, quality }. Called after the world has been updated
     * for this frame, before the post chain renders — the capture is a render
     * of the *current* world, which is what makes the ring a memory.
     */
    update(dt, env) {
      // altitude gate: undergrowth only, and it fades out on the way up
      const camY = env.cam?.y ?? 0;
      const want = enabled ? Math.max(0, Math.min(1, (TOP - camY) / 10)) : 0;
      opacity += (want - opacity) * Math.min(1, dt * 1.5);
      const live = opacity > 0.02;
      group.visible = live;
      if (!live) return;

      // face the camera: the shrine turns to whoever is in the roots
      if (env.cam) group.rotation.y = Math.atan2(env.cam.x - group.position.x, env.cam.z - group.position.z);

      // a screen's flicker — 1/f, plus rare dropout frames (the medium failing)
      const flick = 0.88 + 0.12 * Math.sin(env.t * 7.3 + Math.sin(env.t * 2.1) * 2);
      const dropout = Math.sin(env.t * 0.7) > 0.995 ? 0.15 : 1;
      screenMat.opacity = opacity * flick * dropout * 1.6; // the picture is the light source
      frameMat.opacity = opacity * 0.5 * dropout;

      // σ is re-permuted every bar, from the wildness knob — the same rebuild
      // granule and the same edit distance as the drums
      const barNow = Math.floor(env.t / BAR_SECONDS);
      if (barNow !== bar) {
        bar = barNow;
        sigma = permuteBreak(env.w ?? 0, makeRng(((seed ^ 0x5417) + bar * 2654435761) >>> 0), SLICES);
      }

      // one cut per sixteenth, never between: the edit lands on the grid
      const stepNow = Math.floor(env.t / STEP_SECONDS);
      if (stepNow === step) return;
      step = stepNow;
      const slot = ((stepNow % SLICES) + SLICES) % SLICES;

      // Record the present into this slot. When the governor is squeezing us
      // we record at half rate — but then only the even slots hold anything,
      // so playback has to round σ down to a recorded one or the screen shows
      // frames that were never taken (black). The cut still lands on every
      // 16th; the corpus just has half the vocabulary.
      const halfRate = (env.quality ?? 1) < 1;
      if (!halfRate || slot % 2 === 0) {
        // the eye circles the band the viewer is actually in: the shrine
        // dreams of *here*, from outside, a bar ago
        const a = env.t * 0.021;
        eye.position.set(Math.cos(a) * 26, camY + 5, Math.sin(a) * 26);
        eye.lookAt(0, camY + 1, 0);
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(targets[slot]);
        renderer.render(scene, eye);
        renderer.setRenderTarget(prev);
      }

      // …and play back the permuted slice: identity on the anchors (now),
      // somewhere in the last bar everywhere else
      screenMat.map = targets[halfRate ? sigma[slot] & ~1 : sigma[slot]].texture;
      screenMat.needsUpdate = true;
    },
  };
}
