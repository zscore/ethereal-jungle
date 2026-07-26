/**
 * bus.js — the shared control bus. THE architectural core.
 *
 * Both media are functions of these signals, never of each other:
 *   music   = M(S, seed_m)
 *   visuals = V(S, seed_v)      never V(audio)
 *
 * S = { T(t), drift(t), wildness, modeBrightness, events... }
 *
 * T(t) is a *function of time* — so the visualizer can sample the FUTURE
 * (clairvoyance: it may begin its ascent before the drop is audible).
 * Discrete events are published with their scheduled audio-clock time,
 * slightly ahead of when they sound (the scheduler's look-ahead window).
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

// ---------- the authored tension curve ----------
// Default: one arc over SET_SECONDS with its climax at the golden-ratio point,
// looping. Replace with an authored array of breakpoints when composing a real set.
export const SET_SECONDS = 192;
const CLIMAX = 0.618;

function defaultTension(phase) {
  // phase in [0,1). Rise to 1 at CLIMAX (slow start, accelerating), then release.
  if (phase < CLIMAX) {
    const p = phase / CLIMAX;
    return Math.pow(p, 1.6);
  }
  const p = (phase - CLIMAX) / (1 - CLIMAX);
  return 1 - Math.pow(p, 0.8) * 0.85; // release, but land above zero (the set continues)
}

// ---------- the bus ----------
export const bus = {
  // knobs (UI / MIDI-writable). tensionMix blends authored curve vs manual knob.
  params: {
    tensionMix: 0,      // 0 = authored curve, 1 = manual knob
    tensionManual: 0.4,
    wildness: 0.35,     // base w; effective w also breathes with T
    modeBrightness: 0.7, // 0 = locrian … 1 = lydian
    seed: 1,
  },

  _t0: 0,               // audio-clock time at which the set started
  _now: () => performance.now() / 1000, // replaced with AudioContext clock at boot
  drift: makeDrift(1),

  start(nowFn) {
    this._now = nowFn;
    this._t0 = nowFn();
    this.drift = makeDrift(this.params.seed);
  },

  now() { return this._now() - this._t0; },

  /** Tension at set-time t (seconds). Sample t > now() for foreshadowing. */
  tensionAt(t) {
    const phase = ((t / SET_SECONDS) % 1 + 1) % 1;
    const authored = defaultTension(phase);
    const p = this.params;
    return authored * (1 - p.tensionMix) + p.tensionManual * p.tensionMix;
  },

  /** Effective wildness: the knob, breathing with the tension curve. */
  wildnessAt(t) {
    const w = this.params.wildness * (0.5 + 0.5 * this.tensionAt(t));
    return Math.min(1, w);
  },

  // ---------- event stream (published by the music scheduler, ahead of time) ----------
  _subs: new Set(),
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
  publish(evt) { for (const fn of this._subs) fn(evt); },
};
