/**
 * Bar-exact seam verification (design_decisions D9). Pure pattern-level test:
 * no audio, no browser — compile the set pattern exactly as the engine does
 * and assert that seam phases switch content exactly on bar lines.
 *
 * Run: npm test  (node test/seams.mjs)
 */
import { controls, stack, Pattern, Fraction } from '@strudel/core';
import { miniAllStrings } from '@strudel/mini';
import { bus, TRACKS, SET_BARS, PHRASE_BARS, SEAM_BARS, SEAM_LATE_BARS } from '../src/bus.js';
import { makeSetPattern } from '../src/music/generators.js';

miniAllStrings();

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const signals = { tensionAt: (t) => bus.tensionAt(t), brightnessAt: (t) => bus.brightnessAt(t) };
const build = () => makeSetPattern({ ...controls, stack, Pattern }, { ...bus.params }, signals);
const pattern = build();

/** Onset haps within [begin, end). */
function onsets(begin, end) {
  return pattern.queryArc(begin, end).filter((h) => h.hasOnset());
}
const soundsIn = (b, e) => new Set(onsets(b, e).map((h) => h.value?.s));
const orbitsIn = (b, e) => new Set(onsets(b, e).map((h) => h.value?.orbit ?? 0));

// Timeline geometry: track 0 is `bars` long; the seam window is its last
// SEAM_BARS bars, the late phase its last SEAM_LATE_BARS bars.
const T0 = TRACKS[0].bars;                 // first boundary (bar index)
const lateStart = T0 - SEAM_LATE_BARS;     // drums die exactly here
const earlyStart = T0 - SEAM_BARS;

console.log('geometry');
check(TRACKS.every((tr) => tr.bars % PHRASE_BARS === 0), 'every track length is whole phrases');
check(SEAM_BARS % PHRASE_BARS === 0 && SEAM_LATE_BARS % PHRASE_BARS === 0, 'seam phases are whole phrases');

console.log('pre-seam phrase (full arrangement)');
{
  const s = soundsIn(earlyStart - PHRASE_BARS, earlyStart);
  check(s.has('jbreak'), 'break playing');
  check(s.has('bd') && s.has('sd'), 'skeleton playing');
  check(orbitsIn(earlyStart - PHRASE_BARS, earlyStart).has(2), 'bass playing');
}

console.log('early seam phrase (intensified exit)');
{
  const s = soundsIn(earlyStart, lateStart);
  check(s.has('jbreak') && s.has('bd'), 'drums still present');
  check(s.has('hh'), 'hat riser present');
}

console.log('late seam phrase (drums die, countdown)');
{
  const s = soundsIn(lateStart, T0);
  check(!s.has('jbreak'), 'break gone');
  check(!s.has('bd'), 'kick gone');
  check(!orbitsIn(lateStart, T0).has(2), 'bass gone');
  check(!orbitsIn(lateStart, T0).has(4), 'lead gone');
  const padHaps = pattern.queryArc(lateStart, T0).filter((h) => (h.value?.orbit ?? 0) === 3);
  check(padHaps.length > 0, 'pads survive (the common tone)');
  // the countdown doubles every bar: 1, 2, 4, 8 snare onsets
  const rollCounts = Array.from({ length: SEAM_LATE_BARS }, (_, j) =>
    onsets(lateStart + j, lateStart + j + 1).filter((h) => h.value?.s === 'sd').length);
  check(rollCounts.join(',') === '1,2,4,8', `snare roll doubles per bar (got ${rollCounts.join(',')})`);
}

console.log('bar-exactness at the phase edges');
{
  // no kick/break onset leaks past the lateStart bar line…
  const leaked = onsets(lateStart - 1, lateStart + 1).filter(
    (h) => (h.value?.s === 'bd' || h.value?.s === 'jbreak') && h.whole.begin.gte(Fraction(lateStart)));
  check(leaked.length === 0, 'no drum onset at/after the die-line');
  // …and the countdown's first snare lands exactly ON it
  const first = onsets(lateStart, lateStart + 1).find((h) => h.value?.s === 'sd');
  check(first && first.whole.begin.equals(Fraction(lateStart)), 'countdown starts exactly on the bar line');
  // the drop: full arrangement returns exactly on the track boundary
  const drop = onsets(T0, T0 + 1);
  const kick = drop.find((h) => h.value?.s === 'bd');
  check(kick && kick.whole.begin.equals(Fraction(T0)), 'kick returns exactly on the downbeat');
  check(drop.some((h) => h.value?.s === 'jbreak'), 'break returns at the drop');
}

console.log('the set loop seam (zenith → undergrowth)');
{
  check(!soundsIn(SET_BARS - SEAM_LATE_BARS, SET_BARS).has('bd'), 'drums die before the loop point');
  const loopKick = onsets(SET_BARS, SET_BARS + 1).find((h) => h.value?.s === 'bd');
  check(loopKick && loopKick.whole.begin.equals(Fraction(SET_BARS)), 'set loops with a clean downbeat');
}

console.log('determinism across recompiles (swap-safe setPattern)');
{
  const key = (h) => `${h.whole.begin}|${h.value?.s}|${h.value?.note}|${h.value?.orbit}`;
  const a = onsets(earlyStart - 4, T0 + 4).map(key).sort().join('\n');
  const b2 = build();
  const b = b2.queryArc(earlyStart - 4, T0 + 4).filter((h) => h.hasOnset()).map(key).sort().join('\n');
  check(a === b && a.length > 0, 'two compiles agree hap-for-hap');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
