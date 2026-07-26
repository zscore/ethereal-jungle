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
  sectionSpans, seamVariant, trackStartBar,
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
    const late0 = boundary - SEAM_LATE_BARS;
    const tB = boundary * BAR_SECONDS;
    // loudest snare per countdown bar: rising = promise kept, falling = withdrawn
    const sdGains = Array.from({ length: SEAM_LATE_BARS }, (_, j) =>
      Math.max(...onsets(late0 + j, late0 + j + 1)
        .filter((h) => h.value?.s === 'sd').map((h) => h.value?.gain ?? 0)));
    const impacts = onsets(boundary, boundary + 1).filter((h) => h.value?.s === 'ambimpact');
    if (variants[i] === 'landing') {
      check(sdGains.every((g, j) => j === 0 || g > sdGains[j - 1]), `→${into}: countdown gains rise`);
      check(soundsIn(late0, boundary).has('hh'), `→${into}: hat riser runs to the boundary`);
      check(impacts.length === 1 && impacts[0].whole.begin.equals(Fraction(boundary)),
        `→${into}: impact lands exactly on the downbeat`);
      check(orbitsIn(boundary, boundary + PHRASE_BARS).has(2), `→${into}: root pedal in the arrival phrase`);
      check(!onsets(boundary + PHRASE_BARS, boundary + 2 * PHRASE_BARS)
        .some((h) => h.value?.s === 'ambimpact' || (h.value?.orbit ?? 0) === 2),
        `→${into}: impact and pedal are arrival-phrase only`);
      check(bus.tensionAt(tB - 0.05) > 0.85, `→${into}: tension spikes into the boundary`);
    } else {
      check(sdGains.every((g, j) => j === 0 || g < sdGains[j - 1]), `→${into}: roll dissolves (gains fall)`);
      check(!soundsIn(late0, boundary).has('hh'), `→${into}: hats leave with the promise`);
      check(impacts.length === 0, `→${into}: no impact on a dissolve arrival`);
      check(!orbitsIn(boundary, boundary + PHRASE_BARS).has(2), `→${into}: intro stays bass-free`);
      check(Math.abs(bus.tensionAt(tB - 0.05) - bus.tensionAt(tB + 0.05)) < 0.15,
        `→${into}: no tension cliff at the boundary`);
    }
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
