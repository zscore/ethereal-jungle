/**
 * generators.js — the machine room (music doc §4).
 *
 * Every generator is a pure function of (bus params, seeded rng) → Strudel pattern.
 * ENGINE DISCIPLINE: generators emit *events with abstract params* (sample slot,
 * note, orbit, dynamics). superdough is merely the current renderer of those
 * events — keep renderer-specific hacks out of here so the whole layer can be
 * re-pointed at SuperDirt/scsynth over OSC without touching composition logic.
 *
 * Orbit map (the stream vector, §3.1): 1 = drums (near/dry), 2 = bass (floor),
 * 3 = pads (far/wet), 4 = lead (far/wet). The kick ducks orbits 3 & 4 — the
 * sidechain is the coupling constant of the whole system (§3.3).
 */
import { makeRng } from '../bus.js';
import { modeAt, padVoicing, bassNotes, leadNotes } from './scales.js';

// ---------- Euclidean helper: E(k, n) as a boolean array (Bjorklund) ----------
export function euclid(k, n, rot = 0) {
  const pattern = [];
  let bucket = 0;
  for (let i = 0; i < n; i++) {
    bucket += k;
    if (bucket >= n) { bucket -= n; pattern.push(1); } else pattern.push(0);
  }
  return pattern.map((_, i) => pattern[(i + rot + n) % n]);
}

// ---------- Barlow-ish indispensability weights for a 16-grid ----------
// (true Barlow for 4/4 sixteenths; used to price positions for the permuter)
const INDISPENSABILITY = [
  15, 0, 4, 8, 12, 1, 5, 9, 14, 2, 6, 10, 13, 3, 7, 11,
].map((v) => v / 15);

const ANCHORS = new Set([0, 4, 8, 12]); // downbeat + backbeats: never touched

/**
 * §1.1 verbatim: σ starts as identity; non-anchor positions swap to neighbors
 * with probability w; one segment operation at probability w; generate-and-test
 * against a dissonance band derived from w.
 */
export function permuteBreak(w, rng, slices = 16) {
  const target = 0.15 + w * 0.45; // dissonance band center rises with wildness
  for (let attempt = 0; attempt < 24; attempt++) {
    const sigma = Array.from({ length: slices }, (_, i) => i);
    for (let i = 0; i < slices; i++) {
      if (ANCHORS.has(i)) continue;
      if (rng() < w) {
        const hop = rng() < 0.5 ? -1 : 1;
        const j = Math.min(slices - 1, Math.max(0, i + hop * (1 + Math.floor(rng() * 2))));
        sigma[i] = ANCHORS.has(j) ? sigma[i] : j;
      }
    }
    if (rng() < w) { // one segment op: reverse or rotate a non-anchor run
      const start = 1 + Math.floor(rng() * (slices - 6));
      const len = 2 + Math.floor(rng() * 3);
      const seg = sigma.slice(start, start + len);
      sigma.splice(start, len, ...(rng() < 0.5 ? seg.reverse() : [...seg.slice(1), seg[0]]));
    }
    const d = dissonance(sigma);
    if (Math.abs(d - target) < 0.18) return sigma;
  }
  return Array.from({ length: slices }, (_, i) => i); // fallback: the identity
}

/** §1.2: penalize displaced strong positions, reward activity in weak ones. */
function dissonance(sigma) {
  let d = 0;
  for (let i = 0; i < sigma.length; i++) {
    const displaced = sigma[i] !== i;
    if (displaced) d += INDISPENSABILITY[i]; // violation felt hardest on strong slots
    else d += (1 - INDISPENSABILITY[i]) * 0.1;
  }
  return d / sigma.length;
}

// ---------- the lead: contour-then-quantize + the 80/20 motif bag (§3, §5) ----------
// ONE melodic cell for the whole set (§6.4): recalled under transformation
// across tracks, it converts a sequence of tracks into an argument.
const MOTIF = [0, 2, 1, 4, 3, 2, 4, 0]; // scale-degree offsets — the set's single cell

const TRANSFORMS = [
  (m) => m,                                        // literal recall
  (m) => [...m].reverse(),                         // retrograde
  (m) => m.map((d) => 4 - d),                      // inversion about the cell's center
  (m, rng) => { const r = 1 + Math.floor(rng() * (m.length - 1)); return m.map((_, i) => m[(i + r) % m.length]); }, // rotation
  (m, rng) => m.map((d) => d + (rng() < 0.5 ? 1 : 2)), // diatonic transposition
];

/**
 * §3 contour-then-quantize: 80% a transformation of the motif, 20% a fresh
 * smooth contour. Shape is generated apart from pitch set, so mode changes
 * re-color a held shape — motivic identity surviving harmonic change.
 */
export function leadContour(rng, w) {
  if (rng() < 0.8) {
    const tf = TRANSFORMS[Math.floor(rng() * TRANSFORMS.length)];
    return tf(MOTIF, rng);
  }
  // fresh material: a bounded smooth walk (novelty budget, §5)
  const out = [];
  let v = Math.floor(rng() * 5);
  for (let i = 0; i < 8; i++) {
    v = Math.max(0, Math.min(6, v + Math.floor(rng() * 3) - 1));
    out.push(v);
  }
  return out;
}

function buildLead(ctx, rng, mode, tension, w) {
  const { note } = ctx;
  const contour = leadContour(rng, w);
  const scale = leadNotes(mode); // quantize: shape → current mode, octave 5 (§2.3)
  // sparse placement: E(k,16) with k breathing with tension — the lead is a
  // guest in the ether, not a soloist (visual doc §5's economy applies here too)
  const k = 3 + Math.round(tension * 3);
  const mask = euclid(k, 16, Math.floor(rng() * 16));
  let ci = 0;
  const seq = mask.map((v) => {
    if (!v) return '~';
    const deg = contour[ci++ % contour.length];
    return scale[Math.max(0, Math.min(scale.length - 1, deg))];
  });
  return note(seq.join(' '))
    .s('triangle')
    .attack(0.05).release(1.5)
    .room(0.8).roomsize(6)      // drowned: the pluck problem's legal resolution (§7.2)
    .lpf(1200 + 2400 * tension)
    .gain(0.28 * Math.min(1, (tension - 0.3) / 0.3)) // enters only past T ≈ 0.3
    .pan(0.5)
    .slow(2)                     // half-time layer: lyrical, not rhythmic
    .orbit(4);
}

/**
 * Build the full arrangement as one stacked pattern.
 * `ctx` provides the pattern-building functions (from @strudel/core controls)
 * so this module stays import-order agnostic. `p` is a bus params snapshot.
 * `brightness` comes from the bus's authored walk; `seam` is bus.seamAt(now)
 * — when active the arrangement becomes the seam operator (§6.3).
 */
export function buildArrangement(ctx, p, tension, brightness, seam) {
  const { s, note, stack } = ctx;
  const rng = makeRng(p.seed);
  const mode = modeAt(brightness);
  const w = Math.min(1, p.wildness * (0.5 + 0.5 * tension));

  // Seam phases (§6.3), at phrase granularity: early seam = intensified exit
  // (A's drums peak), late seam = the drums die BEFORE the boundary (§6.1's
  // asymmetry — drums are the strongest stream and must not cross), while the
  // incoming ether is already here via brightnessAt's forward leak.
  const seamEarly = seam?.active && seam.progress < 0.6;
  const seamLate = seam?.active && seam.progress >= 0.6;
  const wEff = seamEarly ? Math.min(1, w + 0.25) : w;
  const leadPresent = tension > 0.3 && !seamLate;

  const layers = [];

  // ---- drums: the break (figure) — sharp, dry, narrow, double-time ----
  if (!seamLate) {
    const sigma = permuteBreak(wEff, rng);
    layers.push(
      s('jbreak') // local synthesized break; try s('breaks165') with the remote pack
        .slice(16, sigma.join(' '))
        .sometimesBy(wEff * 0.4, (x) => x.ply(2))  // stochastic re-subdivision
        .degradeBy(wEff * 0.15)                     // …and deletion, below anchor-threat level
        .gain(0.9)
        .orbit(1),
    );
  }

  // ---- skeleton: the metric anchor (§1.2) — strength rises with tension ----
  // Kick and snare split so ONLY the kick carries the sidechain: the audio
  // duck now mirrors the visual duck — one coupling constant, both media.
  const anchorStrength = 0.45 + 0.5 * tension;
  const duckDepth = p.coupling * (0.4 + 0.6 * tension);
  if (!seamLate) {
    layers.push(
      s('bd ~ ~ ~').gain(anchorStrength)
        .duckorbit('3:4').duckattack(0.12).duckdepth(duckDepth) // engine pre-creates orbits
        .orbit(1),
      s('~ ~ sd ~').gain(anchorStrength).orbit(1),
    );
  } else {
    // clean_downbeat countdown: a bare snare roll, doubling — §5's accelerating
    // fill; the last thing to sound before the new world's downbeat.
    layers.push(s('[sd*2 sd*2 sd*4 sd*8]').slow(2).gain(0.5 + 0.4 * seam.progress).orbit(1));
  }

  // ---- hats: E(k, 16), k breathing with tension; riser during the seam ----
  const k = seam?.active ? 7 : 3 + Math.round(tension * 4);
  const hatMask = euclid(k, 16, Math.floor(rng() * 16));
  layers.push(
    s(hatMask.map((v) => (v ? 'hh' : '~')).join(' '))
      .gain(0.35 + 0.25 * tension + (seam?.active ? 0.2 * seam.progress : 0))
      .pan(0.4 + rng() * 0.2)
      .orbit(1),
  );

  // ---- bass: isorhythm — talea E(5,16) × pentatonic color walk (lcm cycling) ----
  if (!seamLate) { // the floor leaves with the drums; the drop restores it whole
    const talea = euclid(5, 16, 2);
    const colors = bassNotes(mode);
    let ci = Math.floor(rng() * colors.length);
    const bassSeq = talea.map((v) => {
      if (!v) return '~';
      ci = (ci + (rng() < 0.6 ? 1 : 2)) % colors.length; // walk, not shuffle
      return colors[ci];
    });
    layers.push(
      note(bassSeq.join(' '))
        .s('sawtooth')
        .lpf(140 + 260 * tension)
        .gain(0.5)
        .slow(2)          // half-time layer (§1.4): bass lives at the felt pulse
        .orbit(2),
    );
  }

  // ---- pads: the ether (ground) — slow, wide, drowned, half-time and slower ----
  // Survives the seam untouched: the continuity layer, the common tone (§6.1).
  const chord = padVoicing(mode);
  layers.push(
    note(`[${chord.join(',')}]`)
      .s('sawtooth')
      .attack(1.2).release(4)
      .detune(0.12)                // §3.4: the ether is never in tune with itself
      .lpf(900 + 2600 * tension)
      .room(0.9).roomsize(8)       // low DRR: distance, the heavens
      .gain(0.32)
      .pan(0.5)
      .slow(4)
      .orbit(3),
  );

  // ---- lead: the set's one melodic cell, transformed (80/20) ----
  if (leadPresent) layers.push(buildLead(ctx, rng, mode, tension, w));

  return stack(...layers);
}
