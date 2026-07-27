/**
 * bus.js — the shared control bus. THE architectural core.
 *
 * Both media are functions of these signals, never of each other:
 *   music   = M(S, seed_m)
 *   visuals = V(S, seed_v)      never V(audio)
 *
 * S = { T(t), brightness(t), drift(t), wildness, seam info, events... }
 *
 * T(t) and brightness(t) are *functions of time* — so the visualizer can
 * sample the FUTURE (clairvoyance: it may begin its ascent before the drop
 * is audible). Discrete events are published with their scheduled
 * audio-clock time, slightly ahead of when they sound.
 */
import { PERFORM_DEFAULTS } from './perform.js';

// ---------- seedable RNG (mulberry32) ----------
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1/f drift (Voss–McCartney pink noise, time-indexed) ----------
// A deterministic-ish pink walk: several octaves of value noise summed.
// Smooth, slow, seedable — suitable for filter drift, pan wander, camera sway.
function valueNoise1D(rng) {
  const grid = new Map();
  const at = (i) => {
    if (!grid.has(i)) grid.set(i, rng() * 2 - 1);
    return grid.get(i);
  };
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f); // smoothstep
    return at(i) * (1 - s) + at(i + 1) * s;
  };
}

export function makeDrift(seed, octaves = 5) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(valueNoise1D(makeRng(seed * 31 + o)));
  return (t) => {
    let v = 0, amp = 1, freq = 1 / 32, norm = 0; // slowest layer: ~32 s period
    for (const layer of layers) {
      v += amp * layer(t * freq);
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return v / norm; // roughly -1..1, 1/f-weighted
  };
}

// ---------- musical time: ONE clock constant, shared by timeline and engine ----------
// One cycle = one 4/4 bar. Everything structural is expressed in whole bars so
// that track boundaries and seam phases land exactly on the pattern engine's
// bar lines (design_decisions D9 — bar-exact seams).
export const BPM = 168;
export const CPS = BPM / 60 / 4;               // cycles (bars) per second
export const BAR_SECONDS = 1 / CPS;
export const PHRASE_BARS = 4;                  // the rebuild/variation granule
export const PHRASE_SECONDS = PHRASE_BARS * BAR_SECONDS;

// Ambience loops are 32-bar field recordings (D20). They are NOT triggered as
// 32-bar events: a track is 68 bars, which is not a multiple of 32, so a
// slow(32) event would only start on cycles 0, 32, 64… and a biome change at
// bar 68 would sit silent until bar 96 — and the seam's incoming-bed crossfade
// (§6.1) would never get an onset inside its 8-bar window at all. Instead each
// phrase plays the NEXT PHRASE_BARS-long slice of the file via begin/end, so
// the retrigger period stays 4 bars (every alignment above keeps working)
// while the audible repeat period becomes the full 32 bars.
export const AMB_BARS = 32;
export const AMB_CHUNKS = AMB_BARS / PHRASE_BARS; // 8 slices per loop

// ---------- the authored set timeline ----------
// A set is a sequence of tracks; each track has authored tension breakpoints
// (music doc §5) and a brightness walk (§2.2). The SAME breakpoint shape is
// reused at track scale, rescaled per track into [floor, peak] — fractal
// self-similarity (§5): one curve, sampled at several scales. The set's own
// climax is the track whose peak is 1.0, placed near the set's golden ratio.
//
// Each track: { name, bars (whole phrases), floor, peak, brightness: [start, end] }
// The brightness walk doubles as the visual altitude (visual doc §4.4):
// phrygian roots → lydian sky. One axis, two media.

const SHAPE = [ // the shared tension shape: slow rise, dip, golden-ratio climax, release
  [0, 0.1], [0.2, 0.4], [0.35, 0.3], [0.618, 1.0], [0.75, 0.55], [1, 0.2],
];

// `ambience` lists each biome's synthesized layers (tools/gen_samples.py,
// D16) — the first per-track palette field (D12's direction: orchestration as
// data). ambience[0] is the always-on bed; the rest are accent layers that
// drift in and out on slow presence walks (generators.js layerPresenceAt).
//
// D22 completes that direction: `warmth`, `tuning` and `palette` are the rest
// of the per-track identity, and they are DATA — the generators' shape does not
// change, only who is playing it (docs/track_identities.md, §7.3's
// Klangfarbenmelodie: hold the pattern, swap the player).
//
//   brightness  chooses the mode                      (unchanged, §2.2)
//   warmth      chooses how much gladness we take from it — the third in the
//               voicing, whether the chord is in tune, how the drums affirm
//   tuning      { stretch: cents/octave, just: 0..1 } — the arc is
//               sag → plain → just → stretch, i.e. out-of-tune-and-dark,
//               in-tune-and-glad, out-of-tune-and-bright
//
// Palette fields are read by generators.js; every sound named here is either a
// superdough synth or a sample this repo ships (public/samples/strudel.json),
// so the whole cast survives the remote pack being unavailable (README
// §licensing — the caveat D12 raised about its own palette).
export const TRACKS = [
  {
    name: 'undergrowth', bars: 68, floor: 0.10, peak: 0.70, brightness: [0.10, 0.30],
    ambience: ['ambinsects', 'ambfrogs', 'ambrustle'],
    warmth: 0.15,                    // dark AND cold: the floor of both axes
    tuning: { stretch: -4 },         // the sag — the stack leans downward
    palette: {
      // the most degraded break of the four: no top end, bit-reduced, close
      break: { lpf: 3200, crush: 8, coarse: 2, room: 0.1, roomsize: 2 },
      hats: { s: 'hh', lpf: 5500, gain: 0.85 },
      // D23 — the skeleton's appetite. The undergrowth is the heaviest floor
      // of the four: the second kick is almost always there, the ghosts are
      // buried under it.
      kick: { extras: 0.92, gain: 0.68 },
      snare: { ghosts: 0.55, gain: 0.24 },
      // the Reese (§7.2): two saws a few cents apart in the bass register —
      // slow phase-cancellation sweep — split-banded with a clean mono sub
      bass: { s: 'sawtooth', oct: -1, k: 5, kSpan: 2, detune: 8, sub: true, lpf: [130, 220], gain: 0.46 },
      pad: { s: 'sawtooth', oct: 0, width: 6, lpf: [700, 2000], attack: 1.4, release: 4, gain: 0.32 },
      lead: { s: 'triangle', lpf: [1000, 2000], room: 0.8, roomsize: 6 },
      // the migrating pluck at its near/dry extreme: wooden tuned percussion,
      // struck on the break's non-anchor positions and locked to the grid
      pluck: { fmh: 3.5, fmi: 2.4, oct: 0, k: 3, decay: 0.12, room: 0.05, roomsize: 2, offGrid: 0, gain: 0.3, orbit: 1 },
    },
  },
  {
    name: 'forest floor', bars: 68, floor: 0.15, peak: 0.85, brightness: [0.30, 0.55],
    ambience: ['ambrain', 'ambthunder', 'ambdrips'],
    warmth: 0.35,
    tuning: {},                      // plain 12-TET: the neutral middle of the arc
    palette: {
      break: { speed: 1.02, shape: 0.15, room: 0.18, roomsize: 3 }, // tight, tuned up, dry
      hats: { s: 'hh', lpf: 9000, gain: 1 },
      // the busiest skeleton in the set — this is the track that struts
      kick: { extras: 0.95, gain: 0.6 },
      snare: { ghosts: 0.9, gain: 0.34 },
      bass: { s: 'square', oct: -1, k: 7, kSpan: 4, lpf: [180, 320], release: 0.22, gain: 0.42 }, // the floor walks
      pad: { s: 'sawtooth', oct: 1, width: 9, lpf: [900, 2600], attack: 1.2, release: 4, gain: 0.32 },
      lead: { s: 'triangle', lpf: [1200, 2400], room: 0.8, roomsize: 6 },
      pluck: { fmh: 3.5, fmi: 2.2, oct: 0, k: 3, decay: 0.16, room: 0.4, roomsize: 4, offGrid: 0.33, gain: 0.28, orbit: 1 },
      // characteristic 1: bamboo/duduk-ish breath — sine + noise, living pitch
      breath: { vib: 4.5, vibmod: 0.18, noise: 0.32, oct: 1, lpf: [1600, 900], gain: 0.26 },
      // characteristic 2: the dub rail — water made musical. A dotted-eighth
      // (3/16) feedback delay on the SNARE and the LEAD only (§9.3)
      dub: { send: 0.45, sync: 3 / 16, feedback: [0.34, 0.3] },
    },
  },
  {
    name: 'canopy', bars: 68, floor: 0.20, peak: 1.00, brightness: [0.55, 0.80], // set climax (~0.62 of set)
    ambience: ['ambbirds', 'ambcalls', 'ambleaves'],
    warmth: 0.85,                    // the one glad track: thirds, in tune, affirmed
    tuning: { just: 1 },             // the only track that actually locks
    palette: {
      break: { room: 0.15, roomsize: 3 }, // full, open, top end intact
      hats: { s: 'hh', lpf: 12000, gain: 1.12 },
      // open and affirmed: fewer extra kicks than the floor, but the ghosts
      // are audible — warmth leans into the backbeat, here and in `backbeat`
      kick: { extras: 0.82, gain: 0.6 },
      snare: { ghosts: 0.85, gain: 0.36 },
      bass: { s: 'sawtooth', oct: -1, k: 5, kSpan: 3, shape: 0.2, lpf: [160, 340], gain: 0.5 },
      pad: { s: 'sawtooth', oct: 1, width: 12, lpf: [1100, 2800], attack: 1.1, release: 4, gain: 0.34, slow: 2 },
      lead: { s: 'triangle', lpf: [1400, 2600], room: 0.7, roomsize: 6 },
      pluck: { fmh: 3.5, fmi: 1.8, oct: 1, k: 3, decay: 0.35, room: 0.75, roomsize: 7, offGrid: 0.6, gain: 0.26, orbit: 4 },
      // characteristic 1: FM bells doubling the lead an octave up — inharmonic
      // partials over a glad chord read as light, not error (§7.2)
      bells: { fmh: 3.0, fmi: 2.2, oct: 1, decay: 0.6, room: 0.55, roomsize: 5, gain: 0.19 },
      // characteristic 2: the vowel choir. The voice is the strongest attractor
      // in the mix, so it is spent once per set — here, at the golden ratio
      choir: { gain: 0.2, lpf: 1500 },
      // spent once: the hoover on the peak's drop bar. 1992, once, never again
      hoover: { gain: 0.3, penv: -10 },
    },
  },
  {
    name: 'zenith', bars: 68, floor: 0.05, peak: 0.60, brightness: [0.80, 1.00],
    ambience: ['ambwind', 'ambshimmer', 'ambsparkle'],
    warmth: 0.10,                    // brightest AND coldest: the axes cross here
    tuning: { stretch: 3 },          // stretched octaves — nothing ever settles
    palette: {
      // dematerialised: high-passed (the drums lose their body), drowned,
      // thinned, slices reversed
      break: { hpf: 700, room: 0.85, roomsize: 9, reverse: 0.35, thin: 0.25, gain: 0.7 },
      // hats are gone; their euclid mask now drives a high-passed hiss, so
      // rhythm survives as texture
      hats: { s: 'white', hpf: 4500, release: 0.05, gain: 0.5 },
      // the skeleton is dematerialising with everything else: the heartbeat is
      // nearly bare, and what few ghosts there are barely register
      kick: { extras: 0.3, gain: 0.45 },
      snare: { ghosts: 0.3, gain: 0.2 },
      // the floor is removed: bare sine, an octave up, absent for whole phrases
      bass: { s: 'sine', oct: 0, k: 5, kSpan: 1, lpf: [400, 400], gain: 0.3, absence: 0.45 },
      pad: { s: 'sawtooth', oct: 1, width: 18, lpf: [1400, 2400], attack: 2.2, release: 6, gain: 0.3 },
      lead: { s: 'sine', lpf: [2000, 1500], room: 0.9, roomsize: 9 },
      pluck: { fmh: 3.5, fmi: 1.4, oct: 1, k: 2, decay: 0.9, room: 0.95, roomsize: 12, offGrid: 1, gain: 0.22, orbit: 3, slow: 2 },
      // characteristic 1: the glass bowl — a Chowning-ratio FM shimmer with
      // nothing to resolve to, one strike every two phrases
      bowl: { fmh: 2.76, fmi: 1.6, oct: 2, attack: 2.5, release: 7, gain: 0.17 },
      // characteristic 2: the granular ghost of the set — the break itself,
      // half-speed, reversed, drowned, no skeleton under it (§3.4). The audio
      // sibling of the corpus shrine (D20): at the top of the set the piece
      // plays back its own earlier material as ether.
      ghost: { grains: 5, speed: 0.5, reverse: 0.4, lpf: 2200, gain: 0.15 },
      // spent once: the silence — release phrase 0 keeps one sine and the bed
      silence: true,
    },
  },
];
for (const tr of TRACKS) tr.seconds = tr.bars * BAR_SECONDS; // ≈97 s per track

// Seam window at the end of every track (§6.3), in whole phrases: two phrases
// of window, of which the LAST phrase is the late phase (drums die, countdown).
export const SEAM_BARS = 2 * PHRASE_BARS;
export const SEAM_LATE_BARS = PHRASE_BARS;
export const SEAM_SECONDS = SEAM_BARS * BAR_SECONDS;

export const SET_BARS = TRACKS.reduce((s, tr) => s + tr.bars, 0);
export const SET_SECONDS = TRACKS.reduce((s, tr) => s + tr.seconds, 0);

function lerp(a, b, x) { return a + (b - a) * x; }

/** Piecewise-linear sample of a [[phase, v]...] breakpoint list. */
export function sampleBreakpoints(points, phase) {
  if (phase <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (phase <= points[i][0]) {
      const [p0, v0] = points[i - 1];
      const [p1, v1] = points[i];
      return lerp(v0, v1, (phase - p0) / (p1 - p0 || 1));
    }
  }
  return points[points.length - 1][1];
}

/** Which track is playing at set-time t (looped), with local phase. */
export function trackAt(t) {
  const tSet = ((t % SET_SECONDS) + SET_SECONDS) % SET_SECONDS;
  let acc = 0;
  for (let i = 0; i < TRACKS.length; i++) {
    const tr = TRACKS[i];
    if (tSet < acc + tr.seconds) {
      return { track: tr, index: i, tLocal: tSet - acc, phase: (tSet - acc) / tr.seconds, startsAt: t - (tSet - acc) };
    }
    acc += tr.seconds;
  }
  return { track: TRACKS[0], index: 0, tLocal: 0, phase: 0, startsAt: t };
}

/**
 * Seam info at set-time t (§6.3). Active in the last SEAM_SECONDS of a track.
 * progress ∈ [0,1) across the window; `to` is the incoming track.
 */
export function seamAt(t) {
  const { track, index, tLocal } = trackAt(t);
  const remaining = track.seconds - tLocal;
  if (remaining > SEAM_SECONDS) return { active: false, progress: 0, from: track, to: track, toIndex: index };
  return {
    active: true,
    progress: 1 - remaining / SEAM_SECONDS,
    from: track,
    to: TRACKS[(index + 1) % TRACKS.length],
    toIndex: (index + 1) % TRACKS.length,
    boundaryIn: remaining, // seconds until the downbeat of the next track
  };
}

/**
 * D22 — warmth at set-time t: the second harmonic axis. Brightness picks the
 * mode; warmth picks how much gladness the arrangement extracts from it. It is
 * a pure function of the authored timeline (no knob, deliberately — this is
 * form, not performance), blended across seams by the same smoothstep as
 * brightness so the palette crossfades the way the ether already does.
 *
 * The zenith is the one place the two axes move AGAINST each other — brightness
 * still climbing, warmth falling off a cliff — which is what makes the last
 * track read as awe rather than triumph (scene_plan §6's unexplored move).
 */
export function warmthAt(t) {
  const { track } = trackAt(t);
  const w = track.warmth ?? 0.4;
  const seam = seamAt(t);
  if (!seam.active) return w;
  const s = seam.progress * seam.progress * (3 - 2 * seam.progress);
  return lerp(w, seam.to.warmth ?? 0.4, s);
}

/**
 * D18 — seam flavor for the boundary INTO TRACKS[intoIndex], seeded per set:
 * 'landing' (countdown → arrival hit → intro as decaying aftermath) or
 * 'dissolve' (the roll unwinds, tension exhales — the ambient arrival is what
 * the gesture prepared). §5's "predictable time, withheld content" applied to
 * the seams themselves; both media read the choice from this one function.
 */
export function seamVariant(intoIndex, seed) {
  return makeRng(((seed ^ 0xd17) + intoIndex * 7919) >>> 0)() < 0.5 ? 'landing' : 'dissolve';
}

// ---------- in-track sections (D11) ----------
// One shared section form per track (like SHAPE, D1): proportional phrase
// weights over the track's non-seam phrases. Edges snap to whole phrases, so
// sections inherit D9's bar-exactness. The seam (last 2 phrases) is owned by
// the seam machinery and never allocated here.
export const SECTION_LAYOUT = [
  ['intro', 2],      // ether only: pads establish the world
  ['build', 2],      // thin break, reduced anchor, floor enters
  ['groove', 2],     // the full arrangement
  ['breakdown', 2],  // drums+bass out at the tension dip; pads swell, lead featured
  ['build2', 2],     // intensified; final bar is the pre-drop dropout (§5)
  ['peak', 3],       // the drop: full slam at ~golden ratio of the track
  ['release', 2],    // full arrangement, tension curve falling
];

/**
 * Section spans for a track of trackBars bars: [{ name, startBar, bars }] in
 * order, seam last, tiling the track exactly. This is the one place the
 * proportional allocation runs — sectionAt and the transport UI both read it.
 */
export function sectionSpans(trackBars) {
  const nAlloc = (trackBars - SEAM_BARS) / PHRASE_BARS; // whole by construction (D9)
  const totalW = SECTION_LAYOUT.reduce((s, [, w]) => s + w, 0);
  const spans = [];
  let start = 0, accW = 0;
  for (const [name, w] of SECTION_LAYOUT) {
    accW += w;
    const end = Math.round((accW / totalW) * nAlloc);
    if (end > start) spans.push({ name, startBar: start * PHRASE_BARS, bars: (end - start) * PHRASE_BARS });
    start = end;
  }
  spans.push({ name: 'seam', startBar: trackBars - SEAM_BARS, bars: SEAM_BARS });
  return spans;
}

/**
 * Section for the phrase containing barInTrack (integer bar arithmetic only).
 * Returns { name, phraseInSection, sectionPhrases }. Phrases inside the seam
 * window return name 'seam' — callers should keep using seam phase info.
 */
export function sectionAt(barInTrack, trackBars) {
  for (const sp of sectionSpans(trackBars)) {
    if (barInTrack < sp.startBar + sp.bars) {
      return {
        name: sp.name,
        phraseInSection: Math.floor((barInTrack - sp.startBar) / PHRASE_BARS),
        sectionPhrases: sp.bars / PHRASE_BARS,
      };
    }
  }
}

/** First absolute set-bar of TRACKS[index] — transport targets. */
export function trackStartBar(index) {
  let acc = 0;
  for (let i = 0; i < index; i++) acc += TRACKS[i].bars;
  return acc;
}

/**
 * Bar-exact phrase state for the phrase starting at bar phraseIndex*PHRASE_BARS.
 * Integer bar arithmetic only — no float drift at boundaries. This is what the
 * engine compiles patterns from: because SEAM_BARS and SEAM_LATE_BARS are whole
 * phrases and track lengths are whole phrases, every seam phase edge lands
 * exactly on a phrase line (D9). `tStart` is the phrase's set-time (unwrapped,
 * matching the scheduler's absolute cycle clock).
 */
export function phraseStateAt(phraseIndex) {
  const setBar = ((phraseIndex * PHRASE_BARS) % SET_BARS + SET_BARS) % SET_BARS;
  let acc = 0;
  for (let i = 0; i < TRACKS.length; i++) {
    const tr = TRACKS[i];
    if (setBar < acc + tr.bars) {
      const barInTrack = setBar - acc;
      const barsRemaining = tr.bars - barInTrack;
      const active = barsRemaining <= SEAM_BARS;
      return {
        track: tr,
        trackIndex: i,
        barInTrack,
        section: sectionAt(barInTrack, tr.bars), // D11: in-track form
        tStart: phraseIndex * PHRASE_BARS * BAR_SECONDS,
        seam: {
          active,
          late: barsRemaining <= SEAM_LATE_BARS,
          // progress at the phrase's first bar; per-bar ramps add j/SEAM_BARS
          progress: active ? 1 - barsRemaining / SEAM_BARS : 0,
          to: TRACKS[(i + 1) % TRACKS.length],
          toIndex: (i + 1) % TRACKS.length,
        },
      };
    }
    acc += tr.bars;
  }
}

// ---------- the bus ----------
export const bus = {
  // knobs (UI / MIDI-writable). *Mix knobs blend authored curve vs manual knob.
  params: {
    tensionMix: 0,       // 0 = authored timeline, 1 = manual knob
    tensionManual: 0.4,
    brightnessMix: 0,    // 0 = authored brightness walk, 1 = manual knob
    brightnessManual: 0.7,
    wildness: 0.35,      // base w; effective w also breathes with T
    coupling: 0.6,       // sidechain depth — how much the two worlds touch (§3.3)
    seed: 1,
    // the perform rail (D17): DJ color FX applied at the renderer seam,
    // never composition inputs — filter, echo, crush, space (src/perform.js)
    ...PERFORM_DEFAULTS,
  },

  _t0: 0,               // audio-clock time at which the set started
  _now: () => performance.now() / 1000, // replaced with AudioContext clock at boot
  drift: makeDrift(1),

  /** Pin set-time: now maps to atSeconds (0 = the top; a seek passes the target). */
  start(nowFn, atSeconds = 0) {
    this._now = nowFn;
    this._t0 = nowFn() - atSeconds;
    this.drift = makeDrift(this.params.seed);
  },

  now() { return this._now() - this._t0; },

  /** Tension at set-time t. Sample t > now() for foreshadowing. */
  tensionAt(t) {
    const { track, phase } = trackAt(t);
    let T = lerp(track.floor, track.peak, sampleBreakpoints(SHAPE, phase));
    const seam = seamAt(t);
    if (seam.active) {
      if (seamVariant(seam.toIndex, this.params.seed) === 'landing') {
        T = Math.max(T, lerp(T, 0.95, seam.progress)); // tension_spike: the countdown
      } else {
        // dissolve (D18): a softer spike through the early phase, then the
        // late phase exhales into the incoming track's opening tension — no
        // cliff at the boundary for either medium.
        const lateStart = 1 - SEAM_LATE_BARS / SEAM_BARS;
        const tOpen = lerp(seam.to.floor, seam.to.peak, sampleBreakpoints(SHAPE, 0));
        if (seam.progress < lateStart) {
          T = Math.max(T, lerp(T, 0.8, seam.progress / lateStart));
        } else {
          const x = (seam.progress - lateStart) / (1 - lateStart);
          T = lerp(Math.max(T, 0.8), tOpen, x * x * (3 - 2 * x));
        }
      }
    }
    const p = this.params;
    return T * (1 - p.tensionMix) + p.tensionManual * p.tensionMix;
  },

  /**
   * Mode brightness at set-time t — the harmonic weather AND the camera's
   * altitude (visual doc §4.4). During a seam the incoming track's opening
   * brightness leaks in early: the new ether infiltrates before the boundary
   * (§6.1), and BOTH media inherit the foreshadowing from this one function.
   */
  brightnessAt(t) {
    const { track, phase } = trackAt(t);
    let b = lerp(track.brightness[0], track.brightness[1], phase);
    const seam = seamAt(t);
    // smoothstep to FULL blend at the boundary: the walk stays continuous even
    // across the set loop, so the camera's traversal never teleports
    if (seam.active) {
      const s = seam.progress * seam.progress * (3 - 2 * seam.progress);
      b = lerp(b, seam.to.brightness[0], s);
    }
    const p = this.params;
    return b * (1 - p.brightnessMix) + p.brightnessManual * p.brightnessMix;
  },

  // D22 — the warmth axis, for symmetry with brightnessAt. (The identifier
  // inside resolves to the module-scope function above, not to this property.)
  warmthAt: (t) => warmthAt(t),

  /** Effective wildness: the knob, breathing with the tension curve. */
  wildnessAt(t) {
    const w = this.params.wildness * (0.5 + 0.5 * this.tensionAt(t));
    return Math.min(1, w);
  },

  trackAt(t) { return trackAt(t); },
  // decorated with the D18 flavor so visual subscribers can stage the
  // boundary the same way the music will resolve it
  seamAt(t) {
    const s = seamAt(t);
    return { ...s, variant: seamVariant(s.toIndex, this.params.seed) };
  },

  // ---------- event stream (published by the music scheduler, ahead of time) ----------
  _subs: new Set(),
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  publish(evt) { for (const fn of this._subs) fn(evt); },
};
