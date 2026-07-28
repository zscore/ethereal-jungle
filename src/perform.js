/**
 * perform.js — the perform rail: classic DJ color FX (music doc §9.1's
 * performance rack, the mixer half). Modeled on the DJ-mixer canon —
 * Pioneer's Sound Color FX (filter, dub echo, crush, space), the channel
 * EQ kills every DJ actually transitions with, a gater, drive, and a roll.
 *
 * These are NOT composition inputs. The latent knobs (tension, wildness…)
 * change what the generators write and take effect at the next rebuild —
 * launch-quantized intent (D7). The perform rail is mostly the opposite:
 * hands on the mixer, effective now. Four mechanisms, none of which reaches
 * into the generators (this file is pure — the plumbing lives in engine.js
 * and music/masterchain.js, which is what keeps all of it testable):
 *
 *   echo/crush/space     — overlay on each hap's value at the output tap as
 *                          it is scheduled (~latency window, no rebuild; D17).
 *   lpf/hpf, eq bands,   — a master insert spliced between superdough's
 *   gate, drive            destination gain and the speakers (D19, D20).
 *   roll                 — pattern surgery at rebuild: the ONE perform knob
 *                          that is launch-quantized, because a stutter has to
 *                          land on the grid to be a stutter at all (D19).
 */

export const PERFORM_DEFAULTS = {
  // live rail — read continuously, never rebuilt (D17)
  lpf: 1,      // sweep DOWN to take the top off; 1 = wide open (D20)
  hpf: 0,      // sweep UP to take the bottom out; 0 = wide open (D20)
  echo: 0,     // dub echo send, dotted-eighth, feedback rises with the knob
  crush: 0,    // bit crush: 12 bits (subtle) down to 2 (destroyed)
  space: 0,    // reverb wash: pushes every stream's room send toward 0.9
  // master insert — 1 = unity for the EQ, 0 = off for the rest (D19)
  eqLow: 1,    // isolator-style band kills: unity at the top, −40 dB at the
  eqMid: 1,    // bottom. Defaults sit at unity so an untouched rail is
  eqHigh: 1,   // literally not in the signal path.
  gate: 0,     // bar-locked square gater, depth 0..1 at eighths
  drive: 0,    // master saturation (tanh) with makeup trim
  // launch-quantized (D19)
  roll: 0,     // drum stutter: off / ×2 / ×3 / ×4 by quartile
};

export const PERFORM_KEYS = new Set(Object.keys(PERFORM_DEFAULTS));

/**
 * The subset that takes effect without a rebuild. midi.js/osc.js skip their
 * rebuild coalesce for these; anything here that is NOT in this set (today:
 * `roll`) must go through rebuild() or it will never be heard.
 */
export const PERFORM_LIVE_KEYS = new Set([...PERFORM_KEYS].filter((k) => k !== 'roll'));

const EPS = 0.01; // below this a knob is at rest — the rail costs nothing

// ---------- master insert (D19, D20) ----------

// The two filter dials (D20). Independent, so they compose: sweep `lpf` down
// for the classic "underwater" close, sweep `hpf` up to thin a track out for a
// transition, or bring both toward each other for a telephone/bandpass. Each
// is two cascaded biquads (24 dB/oct — a 12 dB slope leaves too much behind to
// read as a kill), with mild resonance on the first stage only.
export const LPF_MIN_HZ = 40;
export const LPF_MAX_HZ = 20000;  // at the top the stage is transparent
export const HPF_MIN_HZ = 20;     // at the bottom the stage is transparent
export const HPF_MAX_HZ = 8000;
export const FILTER_Q = 1.2;      // a little emphasis at the corner, no whistle
export const FILTER_Q2 = 0.707;   // second stage stays flat

/**
 * Skew on the sweep (D21). Exponential alone — constant octaves per degree of
 * travel — is the right first guess, since the ear hears filter sweeps in
 * octaves. But it sounds dead at the open end, because the top octaves
 * (10–20 kHz) carry almost no musical energy: the first fifth of the throw
 * moved the corner from 20 kHz to 5 kHz and you could barely tell. An exponent
 * below 1 spends travel where the ear actually notices, so the corner is down
 * at ~5.8 kHz by a tenth of a turn and the dial bites immediately.
 */
export const FILTER_SKEW = 0.7;

/**
 * Corner frequency for a dial `amount` away from its open position (0 = home,
 * 1 = fully closed), sweeping from `open` Hz to `closed` Hz.
 */
const sweep = (amount, open, closed) =>
  open * Math.pow(closed / open, Math.pow(Math.min(1, Math.max(0, amount)), FILTER_SKEW));

/** Lowpass corner for a 0..1 dial — 1 is wide open, 0 closes to a rumble. */
export function lpfCutoff(x) {
  return sweep(1 - (x ?? 1), LPF_MAX_HZ, LPF_MIN_HZ);
}

/** Highpass corner for a 0..1 dial — 0 is wide open, 1 leaves only air. */
export function hpfCutoff(x) {
  return sweep(x ?? 0, HPF_MIN_HZ, HPF_MAX_HZ);
}

// Crossover-free 3-band EQ: a shelf/peak/shelf series, flat by construction
// when all three sit at unity. Frequencies are the DJ-mixer convention.
export const EQ_LOW_HZ = 250;
export const EQ_MID_HZ = 1200;
export const EQ_MID_Q = 0.7;   // wide enough to actually own the midrange
export const EQ_HIGH_HZ = 4000;
export const EQ_RANGE_DB = -40; // knob at 0 → −40 dB (inaudible under a mix)
export const EQ_KILL_DB = -60;  // …and the last 2% is a true kill

export const GATE_PER_BAR = 8;  // eighth notes — the classic chop at 168 BPM
export const GATE_SMOOTH_HZ = 80; // lowpass on the LFO: rounds the square's
                                  // edges (~4 ms) so the gate thuds, not clicks

/** Band gain in dB for a 0..1 knob: 1 → 0 dB (unity), 0 → a kill. */
export function bandGainDb(x) {
  const v = Math.min(1, Math.max(0, x ?? 1));
  if (v <= 0.02) return EQ_KILL_DB;
  return EQ_RANGE_DB * (1 - v);
}

/** Gate LFO frequency for a given cycles-per-second (one cycle = one bar). */
export function gateRateHz(cps) {
  return cps * GATE_PER_BAR;
}

/**
 * Saturation transfer curve for a 0..1 drive knob, or null for "no curve"
 * (a WaveShaperNode with a null curve passes audio through untouched, which
 * is how the drive stage costs nothing at rest). tanh normalized so full
 * scale still maps to full scale.
 */
export function driveCurve(drive, samples = 1024) {
  const d = Math.min(1, Math.max(0, drive ?? 0));
  if (d <= EPS) return null;
  const k = driveK(d);
  const norm = Math.tanh(k);
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

const driveK = (d) => 1 + d * 11;
export const DRIVE_NOMINAL = 0.3; // assumed operating level of the finished mix

/**
 * Makeup trim for the drive stage. The curve is normalized so full scale still
 * maps to full scale, which means everything BELOW full scale gets loud — at
 * drive 0.9 a 0.25 sine came back at 0.5 on the meter, a +6 dB jump nobody
 * wants on a master bus. So the trim is not a guess: it cancels the gain the
 * curve actually applies at a nominal mix level, leaving drive to change the
 * timbre and (deliberately) not the loudness.
 */
export function driveMakeup(drive) {
  const d = Math.min(1, Math.max(0, drive ?? 0));
  if (d <= EPS) return 1; // curve is null here — the stage is a true bypass
  const k = driveK(d);
  const shaped = Math.tanh(k * DRIVE_NOMINAL) / Math.tanh(k);
  return DRIVE_NOMINAL / shaped;
}

/** Net gain the drive stage applies to a nominal-level signal — should stay ~1. */
export function driveNetGain(drive) {
  const d = Math.min(1, Math.max(0, drive ?? 0));
  if (d <= EPS) return 1;
  const k = driveK(d);
  return (Math.tanh(k * DRIVE_NOMINAL) / Math.tanh(k)) * driveMakeup(d) / DRIVE_NOMINAL;
}

/** True when every master-insert knob is at rest (so the splice can be skipped). */
export function masterNeutral(p) {
  return (p.eqLow ?? 1) >= 1 - EPS && (p.eqMid ?? 1) >= 1 - EPS && (p.eqHigh ?? 1) >= 1 - EPS
    && (p.gate ?? 0) <= EPS && (p.drive ?? 0) <= EPS
    && (p.lpf ?? 1) >= 1 - EPS && (p.hpf ?? 0) <= EPS;
}

// ---------- roll (D19) ----------

export const DRUM_ORBIT = 1;             // D8's frozen orbit map
export const ROLL_DIVISIONS = [1, 2, 3, 4]; // 1 = off; 3 gives the triplet stutter

/** Roll division for a 0..1 knob — quartiles, so a slider snaps sensibly. */
export function rollDivision(x) {
  const v = Math.min(1, Math.max(0, x ?? 0));
  const i = Math.min(ROLL_DIVISIONS.length - 1, Math.floor(v * ROLL_DIVISIONS.length));
  return ROLL_DIVISIONS[i];
}

/** Energy compensation: n× the hits is n× the energy, so back off by √n. */
export function rollGain(n) {
  return 1 / Math.sqrt(n);
}

/**
 * HOW MUCH of the phrase rolls, per division. The knob used to answer only
 * "how fine", and then stuttered every drum hit in every bar for as long as it
 * was up — which is a wall, not a gesture. A drum roll is a thing that
 * *arrives*, so the low end of the travel is now a turnaround fill and only the
 * top is the wall. Same `/4` trick as SKEL_MASKS in generators.js: track
 * lengths are whole phrases (D9), so absolute cycle mod 4 IS bar-in-phrase.
 */
export const ROLL_BAR_MASKS = {
  2: '[0 0 0 1]/4', // the turnaround only — reads as a fill
  3: '[0 1 0 1]/4', // every other bar — a lean
  4: '[1 1 1 1]/4', // the wall, for when you actually want it
};

/** The complement: bars the roll does NOT take, which play dry. */
const ROLL_DRY_MASKS = {
  2: '[1 1 1 0]/4',
  3: '[1 0 1 0]/4',
  4: null, // nothing left dry at the top of the travel
};

/** Which bars of the phrase a given knob position rolls, or null when off. */
export function rollMask(roll) {
  return ROLL_BAR_MASKS[rollDivision(roll)] ?? null;
}

/**
 * Stutter the drum orbit n-fold on the bars this division claims, leaving every
 * other stream — and every unclaimed bar — alone. Pure pattern surgery;
 * `stack` is injected so this file never imports strudel (and so the test can
 * drive it). Returns the pattern unchanged when off.
 */
export function applyRoll(pattern, roll, stack) {
  const n = rollDivision(roll);
  if (n <= 1) return pattern;
  const g = rollGain(n);
  const isDrum = (v) => (v?.orbit ?? 0) === DRUM_ORBIT;
  const drums = pattern.filterValues(isDrum);
  const parts = [
    drums.ply(n).withValue((v) => ({ ...v, gain: (v.gain ?? 1) * g })).mask(ROLL_BAR_MASKS[n]),
    pattern.filterValues((v) => !isDrum(v)),
  ];
  if (ROLL_DRY_MASKS[n]) parts.push(drums.mask(ROLL_DRY_MASKS[n]));
  return stack(...parts);
}

/**
 * Overlay the event-scoped perform FX onto one hap value. Pure: returns the
 * SAME object when the rail is idle (the common case allocates nothing), a
 * shallow-augmented copy when any knob is live. Every mapping composes with
 * whatever the generators authored via max/min — the rail can only push an
 * effect further, never cancel the composition. The filters are deliberately
 * absent here: they are master-insert nodes (D20), not event params.
 */
export function applyPerform(value, perf) {
  const echo = (perf.echo ?? 0) > EPS ? perf.echo : 0;
  const crush = (perf.crush ?? 0) > EPS ? perf.crush : 0;
  const space = (perf.space ?? 0) > EPS ? perf.space : 0;
  if (!echo && !crush && !space) return value;

  const v = { ...value };
  if (echo) {
    v.delay = Math.max(v.delay ?? 0, echo * 0.8); // send level
    // dotted eighth (one cycle = one bar), unless the composition authored a time
    if (v.delaytime == null && v.delaysync == null) v.delaysync = 3 / 16;
    v.delayfeedback = Math.max(v.delayfeedback ?? 0, 0.35 + 0.5 * echo);
  }
  if (crush) {
    v.crush = Math.min(v.crush ?? Infinity, 12 - 10 * crush); // bit depth: lower = harsher
  }
  if (space) {
    v.room = Math.max(v.room ?? 0, space * 0.9);
  }
  return v;
}
