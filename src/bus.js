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
export const TRACKS = [
  { name: 'undergrowth', bars: 68, floor: 0.10, peak: 0.70, brightness: [0.10, 0.30], ambience: ['ambinsects', 'ambfrogs', 'ambrustle'] },
  { name: 'forest floor', bars: 68, floor: 0.15, peak: 0.85, brightness: [0.30, 0.55], ambience: ['ambrain', 'ambthunder', 'ambdrips'] },
  { name: 'canopy',      bars: 68, floor: 0.20, peak: 1.00, brightness: [0.55, 0.80], ambience: ['ambbirds', 'ambcalls', 'ambleaves'] }, // set climax (~0.62 of set)
  { name: 'zenith',      bars: 68, floor: 0.05, peak: 0.60, brightness: [0.80, 1.00], ambience: ['ambwind', 'ambshimmer', 'ambsparkle'] },
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
  if (remaining > SEAM_SECONDS) return { active: false, progress: 0, from: track, to: track };
  return {
    active: true,
    progress: 1 - remaining / SEAM_SECONDS,
    from: track,
    to: TRACKS[(index + 1) % TRACKS.length],
    boundaryIn: remaining, // seconds until the downbeat of the next track
  };
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
    if (seam.active) T = Math.max(T, lerp(T, 0.95, seam.progress)); // tension_spike: the countdown
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

  /** Effective wildness: the knob, breathing with the tension curve. */
  wildnessAt(t) {
    const w = this.params.wildness * (0.5 + 0.5 * this.tensionAt(t));
    return Math.min(1, w);
  },

  trackAt(t) { return trackAt(t); },
  seamAt(t) { return seamAt(t); },

  // ---------- event stream (published by the music scheduler, ahead of time) ----------
  _subs: new Set(),
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  publish(evt) { for (const fn of this._subs) fn(evt); },
};
