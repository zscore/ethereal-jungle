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
import { makeRng, phraseStateAt, PHRASE_BARS, SEAM_BARS } from '../bus.js';
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

// ---------- ambience presence walks (D16) ----------
function strHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Slow 0..1 walk per (layer, seed), sampled at phrase scale: smoothstep value
 * noise with one cell ≈ 3 phrases, so accent layers surface in episodes of
 * ~30–50 s and fade over phrases rather than switching. Keyed to the absolute
 * phrase index — deterministic across recompiles, never looping with the set.
 */
export function layerPresenceAt(name, phraseIndex, seed) {
  const cell = (i) => makeRng(((seed ^ strHash(name)) + i * 131) >>> 0)();
  const x = phraseIndex / 3;
  const i = Math.floor(x), f = x - i, sm = f * f * (3 - 2 * f);
  return cell(i) * (1 - sm) + cell(i + 1) * sm;
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

function buildLead(ctx, rng, mode, tension, w, featured = false) {
  const { note } = ctx;
  const contour = leadContour(rng, w);
  const scale = leadNotes(mode); // quantize: shape → current mode, octave 5 (§2.3)
  // sparse placement: E(k,16) with k breathing with tension — the lead is a
  // guest in the ether, not a soloist (visual doc §5's economy applies here too)
  const k = featured ? 5 : 3 + Math.round(tension * 3);
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
    // featured (breakdown, D11): the ether becomes figure, tension gate waived
    .gain(featured ? 0.34 : 0.28 * Math.min(1, (tension - 0.3) / 0.3))
    .pan(0.5)
    .slow(2)                     // half-time layer: lyrical, not rhythmic
    .orbit(4);
}

/**
 * The set compiler (D9 — bar-exact seams). Returns ONE pattern that covers the
 * whole looping set, keyed to the scheduler's absolute cycle count: cycle c is
 * bar c of the set (mod SET_BARS), phrase floor(c/4). Each phrase's arrangement
 * is compiled lazily and deterministically (seeded by phrase index), so seam
 * phase edges land sample-exactly on phrase lines regardless of when
 * setPattern is called — swapping in a freshly built pattern with the same
 * params yields identical events. `signals` = { tensionAt, brightnessAt }.
 */
export function makeSetPattern(ctx, p, signals) {
  const { Pattern } = ctx;
  const cache = new Map(); // phraseIndex → compiled 1-cycle pattern
  const phrasePattern = (idx) => {
    let pat = cache.get(idx);
    if (!pat) {
      const ps = phraseStateAt(idx);
      const tSample = ps.tStart + 0.01; // just inside the phrase
      const tension = signals.tensionAt(tSample);
      const brightness = signals.brightnessAt(tSample);
      // seed varies per phrase AND per track: each track is a different telling,
      // and the break re-permutes every phrase (§1.1 theme-and-variations)
      const seed = p.seed + idx * 101 + ps.trackIndex * 7919;
      // ambience.seed is the UN-mixed base seed: the presence walks must be
      // continuous across phrases, not re-rolled per phrase like the rng
      pat = buildArrangement(ctx, { ...p, seed }, tension, brightness, ps.seam, ps.section,
        { current: ps.track.ambience, incoming: ps.seam.to?.ambience, phraseIndex: idx, seed: p.seed });
      cache.set(idx, pat);
      if (cache.size > 32) cache.delete(cache.keys().next().value); // bounded over long runs
    }
    return pat;
  };
  return new Pattern((state) => {
    const haps = [];
    for (const span of state.span.spanCycles) { // split at exact bar lines (Fraction math)
      const idx = Math.floor(span.begin.valueOf() / PHRASE_BARS);
      // query at ABSOLUTE time — half-time layers keep their cycle parity
      haps.push(...phrasePattern(idx).query(state.setSpan(span)));
    }
    return haps;
  });
}

/**
 * Build one phrase's arrangement as a stacked 1-cycle pattern.
 * `ctx` provides the pattern-building functions (from @strudel/core controls)
 * so this module stays import-order agnostic. `p` is a bus params snapshot.
 * `brightness` comes from the bus's authored walk; `seam` and `section` come
 * from phraseStateAt — the seam makes the arrangement the seam operator
 * (§6.3), the section (D11) gates which layers exist at all: form is what
 * plays, tension only shades how it plays. `ambience` = { current, incoming }
 * biome bed names (D16) — incoming is used for the seam crossfade.
 */
export function buildArrangement(ctx, p, tension, brightness, seam, section, ambience) {
  const { s, note, stack } = ctx;
  const rng = makeRng(p.seed);
  const mode = modeAt(brightness);
  const w = Math.min(1, p.wildness * (0.5 + 0.5 * tension));

  // ---- section state (D11) ----
  const sec = section?.name ?? 'groove';
  const lastPhraseOf = section ? section.phraseInSection === section.sectionPhrases - 1 : false;
  // bar-level progress through the section is secProgress + j/(4·sectionPhrases)
  const secProgress = section ? section.phraseInSection / section.sectionPhrases : 0;

  // Seam phases (§6.3), bar-exact: early seam = intensified exit (A's drums
  // peak), late seam = the drums die BEFORE the boundary (§6.1's asymmetry —
  // drums are the strongest stream and must not cross), while the incoming
  // ether is already here via brightnessAt's forward leak.
  const seamEarly = seam?.active && !seam.late;
  const seamLate = seam?.active && seam.late;
  const wEff = Math.min(1, w + (seamEarly ? 0.25 : 0) + (sec === 'build2' ? 0.15 : 0));

  // Which layers exist. intro = kick heartbeat + ether; breakdown = ether only
  // (skeleton off ⇒ the break must go too — the anchor rule, §1.2 inverted).
  const ambient = sec === 'intro' || sec === 'breakdown';
  const breakIn = !seamLate && !ambient;
  const kickIn = !seamLate && sec !== 'breakdown';
  const snareIn = !seamLate && !ambient;
  const bassIn = !seamLate && !ambient;
  const leadPresent = !seamLate &&
    (sec === 'breakdown' || (tension > 0.3 && sec !== 'intro' && sec !== 'build'));

  // §5's pre-drop denial: the final bar of build2 is ether-only. The mask is
  // keyed to absolute cycle mod 4 = bar-in-phrase (same trick as the roll).
  const dropout = sec === 'build2' && lastPhraseOf;
  const gate = (pat) => (dropout ? pat.mask('[1 1 1 0]/4') : pat);

  const layers = [];

  // ---- drums: the break (figure) — sharp, dry, narrow, double-time ----
  if (breakIn) {
    const thin = sec === 'build'; // degraded entry: the break fades in over the build
    const sigma = permuteBreak(wEff, rng);
    layers.push(gate(
      s('jbreak') // local synthesized break; try s('breaks165') with the remote pack
        .slice(16, sigma.join(' '))
        .sometimesBy(thin ? 0 : wEff * 0.4, (x) => x.ply(2)) // stochastic re-subdivision
        .degradeBy(thin ? 0.4 - 0.2 * secProgress : wEff * 0.15)
        .gain(sec === 'peak' && section?.phraseInSection === 0
          ? '[1 0.9 0.9 0.9]/4'  // the drop bar slams (per-bar, phrase-aligned)
          : thin ? 0.75 : 0.9)
        .orbit(1),
    ));
  }

  // ---- skeleton: the metric anchor (§1.2) — strength rises with tension ----
  // Kick and snare split so ONLY the kick carries the sidechain: the audio
  // duck now mirrors the visual duck — one coupling constant, both media.
  const anchorStrength =
    Math.min(1, 0.45 + 0.5 * tension + (sec === 'peak' ? 0.15 : 0)) * (sec === 'build' ? 0.7 : 1);
  const duckDepth = p.coupling * (0.4 + 0.6 * tension);
  if (seamLate) {
    // clean_downbeat countdown: a bare snare roll doubling every bar across the
    // late phrase — §5's accelerating fill, bar-exact into the new downbeat.
    // slow(4) keys the roll to absolute cycle mod 4, which IS the bar-in-phrase
    // because track lengths are whole phrases (D9).
    layers.push(s('[sd sd*2 sd*4 sd*8]').gain('[0.55 0.65 0.75 0.88]').slow(4).orbit(1));
  } else {
    if (kickIn) {
      layers.push(gate(
        s('bd ~ ~ ~').gain(anchorStrength)
          .duckorbit('3:4').duckattack(0.12).duckdepth(duckDepth) // engine pre-creates orbits
          .orbit(1),
      ));
    }
    if (snareIn) layers.push(gate(s('~ ~ sd ~').gain(anchorStrength).orbit(1)));
  }

  // ---- hats: breathing presence + Barlow accents (D16) ----
  // A flat 16-grid at one gain was fatiguing. Presence now draws per phrase
  // (full / sparse / off, section-weighted — the hats *rest*), velocities
  // follow inverse indispensability (accents push against the grid the
  // skeleton holds down), and levels sit lower with density capped at 6.
  if (!ambient) {
    let hatMode;
    if (seam?.active || sec === 'build2') hatMode = 'riser';
    else {
      const table = {
        build: [['sparse', 1]],
        groove: [['full', 0.45], ['sparse', 0.4], ['off', 0.15]],
        peak: [['full', 0.7], ['sparse', 0.3]],
        release: [['sparse', 0.6], ['off', 0.4]],
      }[sec] ?? [['full', 1]];
      let r = rng();
      for (const [m, wgt] of table) { if ((r -= wgt) <= 0) { hatMode = m; break; } }
      hatMode ??= table[table.length - 1][0];
    }
    if (hatMode !== 'off') {
      const sparse = hatMode === 'sparse';
      const k = hatMode === 'riser' ? 6 : sparse ? 2 + Math.round(tension * 2) : 3 + Math.round(tension * 3);
      const hatMask = euclid(k, 16, Math.floor(rng() * 16));
      let hats = s(hatMask.map((v) => (v ? 'hh' : '~')).join(' ')).pan(0.4 + rng() * 0.2);
      if (hatMode === 'riser') {
        // per-bar gain ramp: the riser climbs bar by bar, phrase-aligned (/4)
        const base = 0.26 + 0.2 * tension;
        const prog = seam?.active
          ? (j) => seam.progress + j / SEAM_BARS
          : (j) => secProgress + j / (4 * section.sectionPhrases);
        const gains = Array.from({ length: 4 }, (_, j) => (base + 0.28 * prog(j)).toFixed(3));
        hats = hats.gain(`[${gains.join(' ')}]/4`);
      } else {
        const base = (sparse ? 0.15 : 0.22) + 0.16 * tension;
        const gains = hatMask.map((v, i) =>
          v ? (base * (0.55 + 0.5 * (1 - INDISPENSABILITY[i]))).toFixed(3) : '0');
        hats = hats.gain(`[${gains.join(' ')}]`); // 16 per-step velocities
      }
      layers.push(gate(hats.orbit(1)));
    }
  }

  // ---- bass: isorhythm — talea E(5,16) × pentatonic color walk (lcm cycling) ----
  if (bassIn) { // the floor leaves with the drums; the drop restores it whole
    const talea = euclid(5, 16, 2);
    const colors = bassNotes(mode);
    let ci = Math.floor(rng() * colors.length);
    const bassSeq = talea.map((v) => {
      if (!v) return '~';
      ci = (ci + (rng() < 0.6 ? 1 : 2)) % colors.length; // walk, not shuffle
      return colors[ci];
    });
    layers.push(gate(
      note(bassSeq.join(' '))
        .s('sawtooth')
        .lpf(140 + 260 * tension)
        .gain(0.5)
        .slow(2)          // half-time layer (§1.4): bass lives at the felt pulse
        .orbit(2),
    ));
  }

  // ---- pads: the ether (ground) — slow, wide, drowned, half-time and slower ----
  // Survives the seam AND the dropout untouched: the continuity layer, the
  // common tone (§6.1). In the breakdown it swells — the ether becomes figure.
  const swell = sec === 'breakdown';
  const chord = padVoicing(mode);
  layers.push(
    note(`[${chord.join(',')}]`)
      .s('sawtooth')
      .attack(swell ? 2.4 : 1.2).release(swell ? 6 : 4)
      .detune(0.12)                // §3.4: the ether is never in tune with itself
      .lpf(900 + 2600 * tension + (swell ? 600 : 0))
      .room(0.9).roomsize(8)       // low DRR: distance, the heavens
      .gain(swell ? 0.45 : 0.32)
      .pan(0.5)
      .slow(4)
      .orbit(3),
  );

  // ---- ambience: the biome's noise floor, layered (D16, first slice of D12) ----
  // ambience.current = [bed, ...accents]: 4-bar synthesized loops retriggered
  // phrase-aligned (slow(4) at absolute cycles). The bed is always on — loud
  // where the ether is figure (intro/breakdown/seam), tucked under the full
  // arrangement elsewhere. Accent layers ride their own slow presence walks:
  // below threshold they rest; above it their gain follows the walk, and long
  // envelopes smooth the per-phrase steps into fades. During the seam the
  // INCOMING biome's bed crossfades in early — §6.1's infiltrating ether.
  if (ambience?.current?.length) {
    const bed = (name, g, atk = 0.5, rel = 2, panPos = 0.5) =>
      s(name).gain(g).attack(atk).release(rel).pan(panPos).slow(4).orbit(3);
    const [baseBed, ...accents] = ambience.current;
    const baseG = ambient || seamLate ? 0.35 : sec === 'build' || sec === 'release' ? 0.25 : 0.15;
    const inBed = ambience.incoming?.[0];
    const x = seam?.active && inBed && inBed !== baseBed ? Math.min(1, seam.progress + 0.25) : 0;
    layers.push(bed(baseBed, baseG * (1 - x)));
    if (x > 0) layers.push(bed(inBed, 0.35 * x));
    accents.forEach((name, li) => {
      const v = layerPresenceAt(name, ambience.phraseIndex ?? 0, ambience.seed ?? p.seed);
      const lvl = Math.max(0, (v - 0.35) / 0.65); // rest below the threshold
      if (lvl <= 0.02) return;
      const g = (ambient || seamLate ? 0.3 : 0.12) * lvl * (1 - x);
      layers.push(bed(name, g, 1.5, 3, 0.35 + 0.3 * li)); // slower fades, spread in the field
    });
  }

  // ---- lead: the set's one melodic cell, transformed (80/20) ----
  if (leadPresent) layers.push(buildLead(ctx, rng, mode, tension, w, sec === 'breakdown'));

  return stack(...layers);
}
