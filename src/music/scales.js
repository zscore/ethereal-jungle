/**
 * scales.js — the brightness axis (music doc §2.2) and the warmth axis (D22).
 *
 * The seven diatonic modes, totally ordered by brightness. Each adjacent step
 * changes exactly one degree by a semitone, so `modeBrightness` behaves as a
 * continuous-feeling one-dimensional affect knob over a fixed root.
 *
 * Rule 2 of §2.1 is enforced structurally: these interval sets contain no
 * raised 7th in the dark modes — the subtonic, never the leading tone.
 *
 * D22 adds the second axis. Brightness picks the mode; **warmth** decides how
 * much gladness the voicing extracts from it, and the per-track tuning decides
 * whether the chord locks or shimmers. The two are what let the zenith be the
 * brightest AND the least happy track in the set — see docs/track_identities.md.
 */

export const MODES = [
  { name: 'locrian',    intervals: [0, 1, 3, 5, 6, 8, 10] },
  { name: 'phrygian',   intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'aeolian',    intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'dorian',     intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'ionian',     intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'lydian',     intervals: [0, 2, 4, 6, 7, 9, 11] },
]; // index 0 = darkest … 6 = brightest

export const ROOT = 50; // D — one tonal center per set (§2.1 rule 1, strong version)

export function modeAt(brightness) {
  const i = Math.max(0, Math.min(6, Math.round(brightness * 6)));
  return MODES[i];
}

/** Scale degree (1-based, can exceed 7 for extensions) → MIDI note. */
export function degreeToMidi(degree, mode, octaveShift = 0) {
  const d = degree - 1;
  const oct = Math.floor(d / 7) + octaveShift;
  return ROOT + mode.intervals[((d % 7) + 7) % 7] + 12 * oct;
}

// ---------- tuning: one number per track, and it tells the story (D22) ----------
// 5-limit just deviations from 12-TET, in cents, indexed by semitones above the
// root. Blending toward these makes a chord *lock* — beatless, and audibly glad.
const JUST_CENTS = [0, 11.7, 3.9, 15.6, -13.7, -2.0, -9.8, 2.0, 13.7, -15.6, 17.6, -11.7];

/**
 * Retune one voice, returning a fractional MIDI note (superdough converts
 * note→frequency, so cents are just decimals).
 *
 * `stretch` is cents per octave away from ROOT, applied slightly superlinearly
 * (Railsback/gamelan-ish): **positive stretches the stack** — the zenith, where
 * nothing ever settles — and **negative sags it** — the undergrowth, where the
 * chord leans downward and the world sounds like it is subsiding. One parameter,
 * opposite signs, opposite ends of the set.
 *
 * `just` ∈ [0,1] blends toward 5-limit just intervals over the root. The canopy
 * is the only track that gets it: consonance is spent like everything else.
 */
export function tune(midi, tuning) {
  if (!tuning) return midi;
  const { stretch = 0, just = 0 } = tuning;
  if (!stretch && !just) return midi;
  const oct = (midi - ROOT) / 12;
  let cents = stretch * oct * (1 + 0.2 * Math.abs(oct));
  if (just) cents += just * JUST_CENTS[(((Math.round(midi) - ROOT) % 12) + 12) % 12];
  return midi + cents / 100;
}

// ---------- voicings: the warmth axis (D22) ----------
// Brightness chose the mode; these choose how much of its gladness we take.
// The third is the switch: present and low in `glad`, present in `neutral`,
// ABSENT in `hollow` — which is how a lydian chord can be maximally bright and
// carry no joy at all (the zenith).
export const PAD_DEGREES = {
  glad:    [1, 3, 5, 6, 9], // warmth ≥ 0.6 — the added 6th, this idiom's glad chord
  neutral: [1, 3, 5, 7, 9], // the standing voicing: lush, high, tendency-free
  hollow:  [1, 2, 4, 5, 8], // warmth < 0.3 — quartal/sus, no third anywhere
};

/**
 * The degree each voicing is BLIND to — and it is the one the mode ladder moves.
 *
 * Adjacent modes differ by exactly one degree, which is what makes brightness
 * behave as a continuous knob (see MODES above). But a voicing that does not
 * contain that degree cannot express the change, and three of the set's mode
 * changes were landing on a degree their own stack omits: the forest floor's
 * aeolian→dorian moves degree 6 and `neutral` has none, the canopy's
 * mixolydian→ionian moves degree 7 and `glad` has none. Measured over a whole
 * set, that left the forest floor voicing ONE chord — D F A C E — for all 68
 * of its bars, with its single authored harmonic event inaudible.
 *
 * So each stack gains the degree it is missing, an octave above itself, as a
 * single **colour voice**: high enough to read as light rather than as a
 * changed chord quality, and deliberately excluded from `width` so it is the
 * one voice in the pad that does not beat. `hollow` needs none — it already
 * contains degrees 2 and 4, which are exactly what phrygian→aeolian and
 * ionian→lydian move.
 */
export const PAD_COLOUR = { glad: 14, neutral: 13, hollow: null };

/**
 * N3 — `step` planes the whole stack up the mode, diatonically.
 *
 * Because the offset is applied to *degrees* rather than semitones, the pitch
 * collection never changes and there is no voice-leading problem by
 * construction: this is the theory doc's "nothing clashes with a pedal tone"
 * argument, generalised from one note to the whole chord. It is also the one
 * harmonic device that costs the warmth axis nothing — planing a third-less
 * quartal stack produces more third-less quartal stacks.
 *
 * The undergrowth, D phrygian, `hollow`:
 *
 *   step 0   1 2 4 5 8    D  Eb G  A  D    the standing chord
 *   step +1  2 3 5 6 9    Eb F  A  Bb Eb   Ebmaj7#11 over a D floor
 *   step +2  3 4 6 7 10   F  G  Bb C  F    Dm11
 *
 * Three chords, no third anywhere, warmth 0.15 preserved exactly.
 */
export function padDegrees(warmth = 0.4, step = 0) {
  const base = warmth >= 0.6 ? PAD_DEGREES.glad
    : warmth < 0.3 ? PAD_DEGREES.hollow
      : PAD_DEGREES.neutral;
  return step ? base.map((d) => d + step) : base;
}

/** The colour voice's degree for this warmth, or null where the stack sees the change already. */
export function padColour(warmth = 0.4) {
  if (warmth >= 0.6) return PAD_COLOUR.glad;
  if (warmth < 0.3) return PAD_COLOUR.hollow;
  return PAD_COLOUR.neutral;
}

/**
 * The ethereal chord vocabulary: high lushness, zero tendency (§2.1 rule 3),
 * now warmth-gated and per-track tuned. `width` (cents) splits every voice into
 * a beating pair — the pad's own chorus, and the reason the plain `detune`
 * control is not used (superdough maps it to the supersaw's freqspread, which a
 * stock oscillator does not have).
 */
export function padVoicing(mode, warmth = 0.4, { oct = 1, tuning, width = 0, step = 0 } = {}) {
  const voices = padDegrees(warmth, step).map((deg) => tune(degreeToMidi(deg, mode, oct), tuning));
  const colour = padColour(warmth);
  // the colour voice is appended AFTER the width split, so it stays single and
  // beatless — one clean tone on top of a chorusing stack (see PAD_COLOUR)
  const stack = width ? voices.flatMap((n) => [n - width / 200, n + width / 200]) : voices;
  if (colour == null) return stack;
  // the colour voice deliberately does NOT take `step`: it stays put while the
  // stack planes underneath it, which keeps the register lid where each track's
  // brief put it and buys an upper pedal for free
  return [...stack, tune(degreeToMidi(colour, mode, oct), tuning)];
}

/**
 * Pentatonic subset for the bass color loop (maximally even E(5,12) inside the
 * mode). Exported as degrees too, because N2's `palette.bass.roots` cycle is
 * authored in scale degrees and has to index into this exact set.
 */
export const BASS_DEGREES = [1, 2, 3, 5, 6];

export function bassNotes(mode, oct = -1, tuning) {
  return BASS_DEGREES.map((deg) => tune(degreeToMidi(deg, mode, oct), tuning));
}

/** Lead pitch set: one octave of the mode, registered high (§2.3: ether ≥ octave 4). */
export function leadNotes(mode, oct = 2, tuning) {
  return [1, 2, 3, 4, 5, 6, 7].map((deg) => tune(degreeToMidi(deg, mode, oct), tuning));
}

/** True if any voice sits a major third (mod octave) above the root — the joy test. */
export function hasMajorThird(voices) {
  return voices.some((n) => (((Math.round(n) - ROOT) % 12) + 12) % 12 === 4);
}
