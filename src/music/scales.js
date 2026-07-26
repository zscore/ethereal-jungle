/**
 * scales.js — the brightness axis (music doc §2.2).
 *
 * The seven diatonic modes, totally ordered by brightness. Each adjacent step
 * changes exactly one degree by a semitone, so `modeBrightness` behaves as a
 * continuous-feeling one-dimensional affect knob over a fixed root.
 *
 * Rule 2 of §2.1 is enforced structurally: these interval sets contain no
 * raised 7th in the dark modes — the subtonic, never the leading tone.
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

/** The ethereal chord vocabulary: high lushness, zero tendency (§2.1 rule 3). */
export function padVoicing(mode) {
  // stack of degrees {1,3,5,7,9}, registered high (octaves 4-6 territory)
  return [1, 3, 5, 7, 9].map((deg) => degreeToMidi(deg, mode, 1));
}

/** Pentatonic subset for the bass color loop (maximally even E(5,12) inside the mode). */
export function bassNotes(mode) {
  return [1, 2, 3, 5, 6].map((deg) => degreeToMidi(deg, mode, -1));
}

/** Lead pitch set: one octave of the mode, registered high (§2.3: ether ≥ octave 4). */
export function leadNotes(mode) {
  return [1, 2, 3, 4, 5, 6, 7].map((deg) => degreeToMidi(deg, mode, 2));
}
