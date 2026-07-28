/**
 * Bar-exact seam verification (design_decisions D9). Pure pattern-level test:
 * no audio, no browser — compile the set pattern exactly as the engine does
 * and assert that seam phases switch content exactly on bar lines.
 *
 * Run: npm test  (node test/seams.mjs)
 */
import { controls, stack, Pattern, Fraction } from '@strudel/core';
import { miniAllStrings } from '@strudel/mini';
import {
  bus, TRACKS, SET_BARS, PHRASE_BARS, SEAM_BARS, SEAM_LATE_BARS, BAR_SECONDS,
  AMB_CHUNKS, sectionSpans, seamVariant, trackStartBar,
} from '../src/bus.js';
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
check(TRACKS.every((tr) => {
  const spans = sectionSpans(tr.bars);
  let bar = 0;
  for (const sp of spans) { if (sp.startBar !== bar) return false; bar += sp.bars; }
  return bar === tr.bars;
}), 'section spans tile every track contiguously (D15 transport targets)');

console.log('pre-seam phrase (full arrangement)');
{
  const s = soundsIn(earlyStart - PHRASE_BARS, earlyStart);
  check(s.has('jbreak'), 'break playing');
  check(s.has('bd') && s.has('sd'), 'skeleton playing');
  check(orbitsIn(earlyStart - PHRASE_BARS, earlyStart).has(2), 'bass playing');
}

console.log('early seam phrase (D36 — the exit winds down)');
{
  const s = soundsIn(earlyStart, lateStart);
  check(s.has('jbreak') && s.has('bd'), 'drums still present');
  check(s.has('hh'), 'hats still present — the exit thins, it does not cut');
  // the break fades bar by bar across the window instead of intensifying
  const brkGain = (b) => Math.max(0, ...onsets(b, b + 1)
    .filter((h) => h.value?.s === 'jbreak').map((h) => h.value?.gain ?? 0));
  const before = brkGain(earlyStart - 1);
  const ramp = Array.from({ length: SEAM_LATE_BARS }, (_, j) => brkGain(earlyStart + j));
  check(ramp[0] < before, `the break drops as the window opens (${before.toFixed(2)} → ${ramp[0].toFixed(2)})`);
  check(ramp.every((g, j) => j === 0 || g <= ramp[j - 1] + 1e-9),
    `and keeps falling, bar by bar (${ramp.map((g) => g.toFixed(2)).join(' → ')})`);
  // the hats ebb: quieter AND darker as the boundary approaches
  const hatAt = (b) => onsets(b, b + 1).filter((h) => h.value?.s === 'hh');
  const hatGain = (b) => Math.max(0, ...hatAt(b).map((h) => h.value?.gain ?? 0));
  const hatLpf = (b) => Math.max(0, ...hatAt(b).map((h) => h.value?.cutoff ?? 0));
  check(hatGain(lateStart - 1) < hatGain(earlyStart), 'the hat ebbs rather than rising (D36 reversed the ramp)');
  check(hatLpf(lateStart - 1) < hatLpf(earlyStart), 'and closes as it goes — receding, not just quieter');
}

console.log('late seam phrase (drums die, the figure lets go)');
{
  const s = soundsIn(lateStart, T0);
  check(!s.has('jbreak'), 'break gone');
  check(!s.has('bd'), 'kick gone');
  check(!orbitsIn(lateStart, T0).has(2), 'bass gone');
  check(!orbitsIn(lateStart, T0).has(4), 'lead gone');
  const padHaps = pattern.queryArc(lateStart, T0).filter((h) => (h.value?.orbit ?? 0) === 3);
  check(padHaps.length > 0, 'pads survive (the common tone)');
  // D36 — the figure now LETS GO. What is asserted is the energy, not the note
  // count: one flavor thins rhythmically, the other keeps moving while its
  // level and filter fall away, and both have to end up quieter and darker than
  // they started or the seam is still a build wearing new figures.
  const perBar = (f) => Array.from({ length: SEAM_LATE_BARS }, (_, j) =>
    Math.max(0, ...onsets(lateStart + j, lateStart + j + 1)
      .filter((h) => h.value?.s === 'sd').map(f)));
  const gains = perBar((h) => h.value?.gain ?? 0);
  const cutoffs = perBar((h) => h.value?.cutoff ?? 0);
  check(gains.every((g, j) => j === 0 || g < gains[j - 1]),
    `the figure falls away bar by bar (${gains.map((g) => g.toFixed(2)).join(' → ')})`);
  check(cutoffs.every((c, j) => j === 0 || c < cutoffs[j - 1]),
    `and closes with it (${cutoffs.join(' → ')} Hz)`);
  const rollCounts = Array.from({ length: SEAM_LATE_BARS }, (_, j) =>
    onsets(lateStart + j, lateStart + j + 1).filter((h) => h.value?.s === 'sd').length);
  check(!/^1,2,4,8$/.test(rollCounts.join(',')),
    `and it is still not a power-of-two doubling (got ${rollCounts.join(',')})`);
  // the hole: the last 16th before the new downbeat is empty, so the boundary
  // lands into space rather than into a wall of snare
  const lastSixteenth = onsets(T0 - 1 / 16, T0).filter((h) => h.value?.s === 'sd').length;
  check(lastSixteenth === 0, 'the fill leaves a hole on the last 16th before the downbeat');
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
  // the boundary (D11): the incoming track opens with its intro — the kick
  // heartbeat lands exactly on the downbeat, the break waits for the build
  const drop = onsets(T0, T0 + 1);
  const kick = drop.find((h) => h.value?.s === 'bd');
  check(kick && kick.whole.begin.equals(Fraction(T0)), 'kick returns exactly on the downbeat');
  check(!drop.some((h) => h.value?.s === 'jbreak'), 'boundary opens the intro: no break yet');
  check(soundsIn(T0 + 8, T0 + 12).has('jbreak'), 'break enters with the build section');
}

console.log('in-track sections (D11) — track 0 form');
{
  // layout for a 68-bar track: intro 0-8, build 8-16, groove 16-24,
  // breakdown 24-32, build2 32-40 (dropout bar 39), peak 40-52, release 52-60
  const intro = soundsIn(0, 4);
  check(intro.has('bd') && !intro.has('jbreak') && !intro.has('sd'), 'intro: kick heartbeat, no break/snare');
  // phrase 0 may carry the D18 landing pedal — phrase 1 is always the pure intro
  check(!orbitsIn(4, 8).has(2) && orbitsIn(0, 8).has(3), 'intro phrase 1: no bass, pads present');
  const groove = soundsIn(16, 20);
  check(groove.has('jbreak') && groove.has('sd') && orbitsIn(16, 20).has(2), 'groove: full arrangement');
  const bd = soundsIn(24, 28);
  check(!bd.has('bd') && !bd.has('jbreak') && !bd.has('hh') && !orbitsIn(24, 28).has(2), 'breakdown: drums and bass gone');
  check(orbitsIn(24, 32).has(3) && orbitsIn(24, 32).has(4), 'breakdown: pads swell, lead featured');
  const dropoutBar = soundsIn(39, 40);
  check(!dropoutBar.has('bd') && !dropoutBar.has('jbreak') && !dropoutBar.has('hh'), 'pre-drop dropout bar is ether-only');
  check(!orbitsIn(39, 40).has(2) && orbitsIn(39, 40 + 1).has(3), 'dropout: bass gone, pads survive');
  const dropKick = onsets(40, 41).find((h) => h.value?.s === 'bd');
  check(dropKick && dropKick.whole.begin.equals(Fraction(40)), 'the drop lands exactly on bar 40');
  check(soundsIn(40, 44).has('jbreak') && orbitsIn(40, 44).has(2), 'drop: break and bass slam back');
}

console.log('biome ambience beds + hat dynamics (D16)');
{
  check(soundsIn(0, 4).has('ambinsects'), 'undergrowth bed present at the top');
  check(soundsIn(earlyStart, T0).has('ambrain'), "incoming biome's bed infiltrates the seam");
  const next = soundsIn(T0, T0 + 8);
  check(next.has('ambrain') && !next.has('ambinsects'), 'crossfade completes at the boundary');
  const hh = onsets(40, 52).filter((h) => h.value?.s === 'hh'); // peak: hats never fully off
  check(hh.length > 0, 'hats present in peak');
  check(new Set(hh.map((h) => h.value?.gain)).size > 1, 'hat velocities vary (Barlow accents)');
  // accent layers: episodic presence — on the bed's grid but not always on
  const phrasesWith = (name) => {
    let c = 0;
    for (let i = 0; i < T0 / PHRASE_BARS; i++)
      if (onsets(i * PHRASE_BARS, (i + 1) * PHRASE_BARS).some((h) => h.value?.s === name)) c++;
    return c;
  };
  const nPhrases = T0 / PHRASE_BARS;
  check(phrasesWith('ambinsects') === nPhrases, 'bed plays every phrase of its track');
  const frogs = phrasesWith('ambfrogs'), rustle = phrasesWith('ambrustle');
  check(frogs + rustle > 0, 'accent layers surface during the track');
  check(frogs < nPhrases || rustle < nPhrases, 'accent layers also rest (episodic walks)');
}

console.log('ambience loops walk their 32-bar recording a phrase at a time (D26)');
{
  const bedAt = (phrase) => onsets(phrase * PHRASE_BARS, (phrase + 1) * PHRASE_BARS)
    .find((h) => h.value?.s === 'ambinsects')?.value;
  // consecutive phrases play consecutive slices, so the file advances rather
  // than repeating — this is what buys 32 bars of material off a 4-bar trigger
  const slices = [...Array(AMB_CHUNKS)].map((_, i) => bedAt(i));
  check(slices.every((v) => v), 'the bed fires on every one of the first 8 phrases');
  check(slices.every((v, i) => Math.abs(v.begin - i / AMB_CHUNKS) < 1e-9),
    'slice n starts where slice n-1 ended (contiguous audio)');
  check(slices.every((v, i) => Math.abs(v.end - (i + 1) / AMB_CHUNKS) < 1e-9),
    'each slice is exactly one phrase of the file');
  // ...and then wraps, which is the loop point the ingest crossfade smooths
  check(Math.abs(bedAt(AMB_CHUNKS).begin - 0) < 1e-9, 'phrase 8 wraps back to the top of the file');
  // the chunk must key to the ABSOLUTE phrase index, or a biome whose start is
  // not a multiple of 8 phrases would restart the recording mid-set
  const b = trackStartBar(1) / PHRASE_BARS;
  const inBed = onsets(b * PHRASE_BARS, (b + 1) * PHRASE_BARS).find((h) => h.value?.s === 'ambrain')?.value;
  check(inBed && Math.abs(inBed.begin - (b % AMB_CHUNKS) / AMB_CHUNKS) < 1e-9,
    'a new biome picks up the slice its absolute phrase index implies');
  // envelopes stay short: superdough plays on for `release` past the event end,
  // and the next slice is that same audio — a long tail would double it
  check(slices.every((v) => v.release <= 0.05), 'release is short enough not to overlap the next slice');
}

console.log('the set loop seam (zenith → undergrowth)');
{
  check(!soundsIn(SET_BARS - SEAM_LATE_BARS, SET_BARS).has('bd'), 'drums die before the loop point');
  const loopKick = onsets(SET_BARS, SET_BARS + 1).find((h) => h.value?.s === 'bd');
  check(loopKick && loopKick.whole.begin.equals(Fraction(SET_BARS)), 'set loops with a clean downbeat');
}

console.log('seam variants (D18) — every boundary is a landing or a dissolve');
{
  const seed = bus.params.seed;
  const variants = TRACKS.map((_, i) => seamVariant(i, seed));
  console.log(`        (seed ${seed}: ${variants.map((v, i) => `→${TRACKS[i].name}: ${v}`).join(', ')})`);
  check(variants.includes('landing') && variants.includes('dissolve'),
    'default seed exercises both flavors');
  check(TRACKS.every((_, i) => seamVariant(i, seed) === variants[i]), 'variant choice is deterministic');
  for (let i = 0; i < TRACKS.length; i++) {
    const into = TRACKS[i].name;
    const boundary = i === 0 ? SET_BARS : trackStartBar(i); // into track 0 = the loop point
    // the riser belongs to the OUTGOING track, so it wears that track's hat
    // costume (D22) — at the zenith that is a high-passed hiss, not an 'hh'
    const hat = TRACKS[(i - 1 + TRACKS.length) % TRACKS.length].palette?.hats?.s ?? 'hh';
    const late0 = boundary - SEAM_LATE_BARS;
    const tB = boundary * BAR_SECONDS;
    // loudest snare per countdown bar: rising = promise kept, falling = withdrawn
    const sdGains = Array.from({ length: SEAM_LATE_BARS }, (_, j) =>
      Math.max(...onsets(late0 + j, late0 + j + 1)
        .filter((h) => h.value?.s === 'sd').map((h) => h.value?.gain ?? 0)));
    const impacts = onsets(boundary, boundary + 1).filter((h) => h.value?.s === 'ambimpact');
    // D36 — BOTH flavors wind down now; what still separates them is how the
    // boundary is met. A landing arrives on something (a soft impact, a root
    // pedal under the intro); a dissolve arrives on nothing at all.
    check(sdGains.every((g, j) => j === 0 || g < sdGains[j - 1]),
      `→${into}: the figure falls away (${sdGains.map((g) => g.toFixed(2)).join(' → ')})`);
    check(Math.abs(bus.tensionAt(tB - 0.05) - bus.tensionAt(tB + 0.05)) < 0.15,
      `→${into}: no tension cliff at the boundary`);
    if (variants[i] === 'landing') {
      check(soundsIn(late0, boundary).has(hat), `→${into}: the hat ebbs all the way to the boundary`);
      check(impacts.length === 1 && impacts[0].whole.begin.equals(Fraction(boundary)),
        `→${into}: impact lands exactly on the downbeat`);
      check(impacts[0].value.gain <= 0.5, `→${into}: and it marks the arrival rather than announcing it`);
      check(orbitsIn(boundary, boundary + PHRASE_BARS).has(2), `→${into}: root pedal in the arrival phrase`);
      check(!onsets(boundary + PHRASE_BARS, boundary + 2 * PHRASE_BARS)
        .some((h) => h.value?.s === 'ambimpact' || (h.value?.orbit ?? 0) === 2),
        `→${into}: impact and pedal are arrival-phrase only`);
    } else {
      check(!soundsIn(late0, boundary).has(hat), `→${into}: hats leave with the promise`);
      check(impacts.length === 0, `→${into}: no impact on a dissolve arrival`);
      check(!orbitsIn(boundary, boundary + PHRASE_BARS).has(2), `→${into}: intro stays bass-free`);
    }
  }
}

console.log('D36 — the seam is a wind-down, and the curve says so');
{
  // The claim is about tension itself, because tension is what BOTH media read:
  // if this falls, the visuals wind down with the music for free (§0's one
  // signal, two renderers). Sampled across the whole window of every boundary.
  for (let i = 0; i < TRACKS.length; i++) {
    const boundary = i === 0 ? SET_BARS : trackStartBar(i);
    const t0 = (boundary - SEAM_BARS) * BAR_SECONDS;
    const tB = boundary * BAR_SECONDS;
    const N = 40;
    const curve = Array.from({ length: N + 1 }, (_, k) => bus.tensionAt(t0 + (k / N) * (tB - t0)));
    const start = curve[0];
    const trough = Math.min(...curve);
    const troughAt = curve.indexOf(trough) / N;
    const into = TRACKS[i].name;
    check(trough < start * 0.85,
      `→${into}: the window drains (${start.toFixed(2)} → trough ${trough.toFixed(2)})`);
    check(troughAt > 0.4, `→${into}: and the trough is late in the window (at ${(troughAt * 100).toFixed(0)}%)`);
    check(Math.max(...curve) <= start + 1e-9,
      `→${into}: nothing in the window is louder than its start — no build anywhere`);
    // the far side is an intro, and it must not be quieter than the seam's floor
    check(bus.tensionAt(tB + 0.5) >= trough - 1e-9, `→${into}: the incoming intro opens above the trough`);
  }
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
