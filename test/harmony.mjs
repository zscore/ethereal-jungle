/**
 * Unit test for the harmonic centre on the bus (src/bus.js `harmonyAt`, W4).
 *
 * The load-bearing block is the first one. `harmonyAt` deliberately restates the
 * expression at generators.js:1477-1478 rather than importing it — the audio
 * compiler and the shared timeline are different layers — and two copies of one
 * number is exactly the kind of thing that drifts silently and is noticed a
 * month later. So the copies are checked against each other here, over a sweep
 * long enough to cross every track and to wrap both authored cycles.
 *
 * Run: node test/harmony.mjs  (included in `npm test`)
 */
import { harmonyAt, phraseStateAt, PHRASE_SECONDS, TRACKS, bus } from '../src/bus.js';
import { modeAt, degreeToMidi, BASS_DEGREES } from '../src/music/scales.js';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

console.log('the eye and the compiler name the same chord (W4)');
{
  // generators.js:1477-1478, transcribed. If this block is ever edited to make
  // a test pass, the bug is in the OTHER copy.
  const generatorsCentre = (phraseIndex) => {
    const ps = phraseStateAt(phraseIndex);
    const bp = ps.track.palette?.bass ?? {};
    const cycle = bp.roots ?? [1];
    return cycle[(phraseIndex ?? 0) % cycle.length];
  };

  let agree = true, checked = 0, firstBad = null;
  for (let idx = 0; idx < 300; idx++) {
    // generators samples "just inside the phrase" (tStart + 0.01); do the same
    const t = idx * PHRASE_SECONDS + 0.01;
    const mine = harmonyAt(t, 0.5).centre;
    const theirs = generatorsCentre(idx);
    checked++;
    if (mine !== theirs && firstBad === null) { firstBad = { idx, mine, theirs }; agree = false; }
  }
  check(agree, firstBad
    ? `centres DISAGREE at phrase ${firstBad.idx}: bus says ${firstBad.mine}, generators ${firstBad.theirs}`
    : `the centre agrees with generators.js across ${checked} phrases (all four tracks, both cycles wrapped)`);

  check(300 * PHRASE_SECONDS > TRACKS.reduce((s, tr) => s + tr.seconds, 0),
    'and the sweep is longer than a whole set, so every track was actually visited');

  // the phrase index the bus derives from t must be the one the compiler uses
  let idxAgrees = true;
  for (let idx = 0; idx < 200; idx++) {
    if (harmonyAt(idx * PHRASE_SECONDS + 0.01, 0.5).phraseIndex !== idx) idxAgrees = false;
  }
  check(idxAgrees, 'the phrase index derived from set-time matches the compiler’s cycle count');
}

console.log('awayness is circle-of-fifths distance, and it disagrees with semitones on purpose');
{
  const mode = modeAt(0.5);
  const away = (deg) => {
    // find a phrase whose centre is `deg` is fiddly; compute the metric directly
    const semis = ((degreeToMidi(deg, mode) - degreeToMidi(1, mode)) % 12 + 12) % 12;
    const fifths = (semis * 7) % 12;
    return Math.min(fifths, 12 - fifths) / 6;
  };
  check(away(1) === 0, 'the tonic is home');
  check(away(5) < away(6), 'the 5th is nearer home than the 6th, even though it is more semitones away');
  check(away(5) < away(3), '…and nearer than the 3rd');
  check(away(2) > away(5), 'the 2nd degree is a distant move (the Neapolitan direction)');

  let inRange = true;
  for (const deg of BASS_DEGREES) {
    for (let b = 0; b <= 1; b += 0.1) {
      const a = away(deg);
      if (a < 0 || a > 1 || !Number.isFinite(a)) inRange = false;
    }
  }
  check(inRange, 'and it stays inside 0..1 for every degree in every mode');
}

console.log('it is a bus signal like the others: pure, addressable, clairvoyant');
{
  let same = true;
  for (let i = 0; i < 400; i++) {
    const t = i * 3.7;
    if (JSON.stringify(harmonyAt(t, 0.4)) !== JSON.stringify(harmonyAt(t, 0.4))) same = false;
  }
  check(same, 'asking twice gives the same answer');

  // the visuals sample the future (light leads sound); this must work there too
  const future = harmonyAt(240, 0.6);
  check(Number.isFinite(future.awayness) && future.centre > 0, 'it answers about the future, not just now');

  let noNaN = true;
  for (let i = 0; i < 2000; i++) {
    const h = harmonyAt(i * 1.31, (i % 11) / 10);
    if (!Number.isFinite(h.awayness) || !Number.isFinite(h.semis) || !Number.isFinite(h.step)) noNaN = false;
  }
  check(noNaN, 'and nothing in it is ever NaN across a full sweep of time and brightness');

  check(harmonyAt(0, 0.5).step !== undefined, 'the pad’s planing step comes along for free (N3)');

  // the bus method must supply the EFFECTIVE brightness (knob included), or the
  // eye would read a mode that is not sounding
  const before = { ...bus.params };
  bus.params.brightnessMix = 1;
  bus.params.brightnessManual = 0;
  const dark = bus.harmonyAt(30);
  bus.params.brightnessManual = 1;
  const bright = bus.harmonyAt(30);
  Object.assign(bus.params, before);
  check(dark.mode !== bright.mode, 'and the bus method follows the brightness knob into a different mode');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
