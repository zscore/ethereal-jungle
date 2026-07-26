/**
 * generators.js — the machine room (music doc §4).
 *
 * Every generator is a pure function of (bus params, seeded rng) → Strudel pattern.
 * ENGINE DISCIPLINE: generators emit *events with abstract params* (sample slot,
 * note, orbit, dynamics). superdough is merely the current renderer of those
 * events — keep renderer-specific hacks out of here so the whole layer can be
 * re-pointed at SuperDirt/scsynth over OSC without touching composition logic.
 */
import { makeRng } from '../bus.js';
import { modeAt, padVoicing, bassNotes } from './scales.js';

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

/**
 * Build the full arrangement as one stacked pattern.
 * `ctx` provides the pattern-building functions (from @strudel/core controls)
 * so this module stays import-order agnostic. `p` is a bus params snapshot.
 */
export function buildArrangement(ctx, p, tension) {
  const { s, note, stack } = ctx;
  const rng = makeRng(p.seed);
  const mode = modeAt(p.modeBrightness);
  const w = Math.min(1, p.wildness * (0.5 + 0.5 * tension));

  // ---- drums: the break (figure) — sharp, dry, narrow, double-time ----
  const sigma = permuteBreak(w, rng);
  const breakPat = s('jbreak') // local synthesized break; try s('breaks165') with the remote pack
    .slice(16, sigma.join(' '))
    .sometimesBy(w * 0.4, (x) => x.ply(2))     // stochastic re-subdivision, re-rolls per cycle
    .degradeBy(w * 0.15)                        // …and deletion, kept below anchor-threat level
    .gain(0.9)
    .orbit(1);

  // ---- skeleton: the metric anchor (§1.2) — strength rises with tension ----
  const anchorStrength = 0.45 + 0.5 * tension;
  const skeleton = s('bd ~ sd ~').gain(anchorStrength).orbit(1);

  // ---- hats: E(k, 16), k breathing with tension ----
  const k = 3 + Math.round(tension * 4);
  const hatMask = euclid(k, 16, Math.floor(rng() * 16));
  const hats = s(hatMask.map((v) => (v ? 'hh' : '~')).join(' '))
    .gain(0.35 + 0.25 * tension)
    .pan(0.4 + rng() * 0.2)
    .orbit(1);

  // ---- bass: isorhythm — talea E(5,16) × pentatonic color walk (lcm cycling) ----
  const talea = euclid(5, 16, 2);
  const colors = bassNotes(mode);
  let ci = Math.floor(rng() * colors.length);
  const bassSeq = talea.map((v) => {
    if (!v) return '~';
    ci = (ci + (rng() < 0.6 ? 1 : 2)) % colors.length; // walk, not shuffle
    return colors[ci];
  });
  const bass = note(bassSeq.join(' '))
    .s('sawtooth')
    .lpf(140 + 260 * tension)
    .gain(0.5)
    .slow(2)          // half-time layer (§1.4): bass lives at the felt pulse
    .orbit(2);

  // ---- pads: the ether (ground) — slow, wide, drowned, half-time and slower ----
  const chord = padVoicing(mode);
  const pads = note(`[${chord.join(',')}]`)
    .s('sawtooth')
    .attack(1.2).release(4)
    .detune(0.12)                // §3.4: the ether is never in tune with itself
    .lpf(900 + 2600 * tension)
    .room(0.9).roomsize(8)       // low DRR: distance, the heavens
    .gain(0.32)
    .pan(0.5)
    .slow(4)
    .orbit(3);

  return stack(breakPat, skeleton, hats, bass, pads);
}
