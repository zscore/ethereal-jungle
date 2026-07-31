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
  AMB_CHUNKS, sectionSpans, seamVariant, trackStartBar, CAST_INDEX,
} from '../src/bus.js';
import {
  makeSetPattern, SEAM_FILLS, FILL_VOICES, seamFillFor, seamFillSound,
} from '../src/music/generators.js';

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

// D38 — the fill is no longer always a snare, so nothing below may assume `sd`.
// The exiting track supplies the costume, the boundary picks the material, and
// `seamFillSound` is the single source of truth for what to listen for.
const exitingTrack = (intoIndex) => TRACKS[(intoIndex - 1 + TRACKS.length) % TRACKS.length];
const fillSoundInto = (intoIndex) =>
  seamFillSound(seamFillFor(intoIndex, bus.params.seed), exitingTrack(intoIndex));
/**
 * Onsets belonging to the seam fill in [b, e).
 *
 * Scoped to the NEAR ORBIT as well as to the sound, which matters as soon as a
 * fill can be pitched: `seamFillLayer` always lands on orbit 1, but the pitched
 * voice's sound is whatever the exiting track's bass is made of, and a sawtooth
 * bass shares a name with every pad in the set. Matching on the name alone
 * quietly counted pad events as fill hits and made a falling figure look like it
 * had risen in its third bar — found when AD4's interlude, whose pad is a
 * sawtooth and whose bass does not exist, ended up the exiting track.
 */
const fillIn = (b, e, snd) => onsets(b, e).filter((h) => h.value?.s === snd && (h.value?.orbit ?? 0) === 1);

// Timeline geometry: track 0 is `bars` long; the seam window is its last
// SEAM_BARS bars, the late phase its last SEAM_LATE_BARS bars.
const T0 = TRACKS[0].bars;                 // first boundary (bar index)
const lateStart = T0 - SEAM_LATE_BARS;     // drums die exactly here
const earlyStart = T0 - SEAM_BARS;

console.log('geometry');
check(TRACKS.every((tr) => tr.bars % PHRASE_BARS === 0), 'every track length is whole phrases');
check(SEAM_BARS % PHRASE_BARS === 0 && SEAM_LATE_BARS % PHRASE_BARS === 0, 'seam phases are whole phrases');
check(TRACKS.every((tr) => {
  const spans = sectionSpans(tr);
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
  const fillSnd = fillSoundInto(1);
  const hatSnd = TRACKS[0].palette?.hats?.s ?? 'hh';
  // D38 — "the drums are gone" can no longer be spelled `!has('jbreak')`,
  // because the fill itself may BE the break, dragging to a halt. The claim is
  // the same one it always was, said about the stream instead of the sample:
  // by the die-line the near orbit is down to the fill and the ebbing hat.
  const drumStream = new Set(onsets(lateStart, T0)
    .filter((h) => (h.value?.orbit ?? 0) === 1).map((h) => h.value?.s));
  check([...drumStream].every((x) => x === fillSnd || x === hatSnd),
    `the drum stream is down to the fill and the hat (${[...drumStream].join(', ')})`);
  check(!orbitsIn(lateStart, T0).has(2), 'bass gone');
  check(!orbitsIn(lateStart, T0).has(4), 'lead gone');
  const padHaps = pattern.queryArc(lateStart, T0).filter((h) => (h.value?.orbit ?? 0) === 3);
  check(padHaps.length > 0, 'pads survive (the common tone)');
  // D36 — the figure now LETS GO. What is asserted is the energy, not the note
  // count: one flavor thins rhythmically, the other keeps moving while its
  // level and filter fall away, and both have to end up quieter and darker than
  // they started or the seam is still a build wearing new figures.
  const perBar = (f) => Array.from({ length: SEAM_LATE_BARS }, (_, j) =>
    Math.max(0, ...fillIn(lateStart + j, lateStart + j + 1, fillSnd).map(f)));
  const gains = perBar((h) => h.value?.gain ?? 0);
  const cutoffs = perBar((h) => h.value?.cutoff ?? 0);
  check(gains.every((g, j) => j === 0 || g < gains[j - 1]),
    `the figure falls away bar by bar (${gains.map((g) => g.toFixed(2)).join(' → ')})`);
  check(cutoffs.every((c, j) => j === 0 || c < cutoffs[j - 1]),
    `and closes with it (${cutoffs.join(' → ')} Hz)`);
  const rollCounts = Array.from({ length: SEAM_LATE_BARS }, (_, j) =>
    fillIn(lateStart + j, lateStart + j + 1, fillSnd).length);
  check(!/^1,2,4,8$/.test(rollCounts.join(',')),
    `and it is still not a power-of-two doubling (got ${rollCounts.join(',')})`);
  // the hole: the last 16th before the new downbeat is empty, so the boundary
  // lands into space rather than into a wall of whatever the fill is made of
  check(fillIn(T0 - 1 / 16, T0, fillSnd).length === 0,
    'the fill leaves a hole on the last 16th before the downbeat');
}

console.log('bar-exactness at the phase edges');
{
  // nothing but the fill and the ebbing hat crosses the die-line. Stated over
  // the near orbit rather than over sample names (D38): the arrangement's
  // materials and the fill's are now the same set, so only the stream separates
  // "the break is still playing" from "the fill is made of the break".
  const fillSnd = fillSoundInto(1);
  const hatSnd = TRACKS[0].palette?.hats?.s ?? 'hh';
  const leaked = onsets(lateStart - 1, lateStart + 1).filter(
    (h) => (h.value?.orbit ?? 0) === 1 && h.whole.begin.gte(Fraction(lateStart)) &&
      h.value?.s !== fillSnd && h.value?.s !== hatSnd);
  check(leaked.length === 0, 'no arrangement onset at/after the die-line');
  // …and the fill's first hit lands exactly ON it
  const first = fillIn(lateStart, lateStart + 1, fillSnd)[0];
  check(first && first.whole.begin.equals(Fraction(lateStart)), 'the fill starts exactly on the bar line');
  // the boundary (D11): the incoming track opens with its intro — the kick
  // heartbeat lands exactly on the downbeat, the break waits for the build
  const drop = onsets(T0, T0 + 1);
  const kick = drop.find((h) => h.value?.s === 'bd');
  check(kick && kick.whole.begin.equals(Fraction(T0)), 'kick returns exactly on the downbeat');
  check(!drop.some((h) => h.value?.s === 'jbreak'), 'boundary opens the intro: no break yet');
  check(soundsIn(T0 + 8, T0 + 12).has('jbreak'), 'break enters with the build section');
}

console.log('in-track sections (D11) — read from the form, not from bar numbers');
{
  // AD1 — this block used to hardcode the layout of a 68-bar track (intro 0-8,
  // …, dropout bar 39, drop on bar 40) because every track had exactly that
  // one. Four forms later those numbers are true of the canopy alone, so the
  // assertions now ASK each track's own spans where its sections are. What is
  // being tested is unchanged and is the D11 claim itself: form decides which
  // layers exist, tension only shades how they play.
  const spanOf = (i, name) => {
    const sp = sectionSpans(TRACKS[i]).find((s) => s.name === name);
    return sp && { begin: trackStartBar(i) + sp.startBar, end: trackStartBar(i) + sp.startBar + sp.bars };
  };
  const first = (i, name) => {
    const sp = spanOf(i, name);
    return sp && [sp.begin, sp.begin + PHRASE_BARS];
  };

  const intro = soundsIn(0, 4);
  check(intro.has('bd') && !intro.has('jbreak') && !intro.has('sd'), 'intro: kick heartbeat, no break/snare');
  // phrase 0 may carry the D18 landing pedal — phrase 1 is always the pure intro
  check(!orbitsIn(4, 8).has(2) && orbitsIn(0, 8).has(3), 'intro phrase 1: no bass, pads present');

  // …and the section gating holds in EVERY form, which is the AD1 claim: a
  // track that moves its breakdown moves the silence with it. Over the four
  // CASTS: AD4's interlude has neither a groove nor a breakdown nor a drop,
  // which is the entire point of it and is asserted in its own block below.
  for (const i of CAST_INDEX) {
    const g = first(i, 'groove');
    check(soundsIn(...g).has('jbreak') && orbitsIn(...g).has(2),
      `${TRACKS[i].name}: groove is the full arrangement (bar ${g[0]})`);
    const bd = first(i, 'breakdown');
    // the skeleton, the break AS DRUMS, and the floor. Scoped to the near orbit
    // rather than to the sample name, because the zenith's granular ghost is the
    // same `jbreak` on the ETHER orbit — and the breakdown is the one section
    // with no drums in it, which is precisely why R4 put the ghost here: a
    // drum-shaped texture can only be heard as weather where there are no drums.
    const near = onsets(...bd).filter((h) => (h.value?.orbit ?? 0) === 1).map((h) => h.value.s);
    check(!near.some((snd) => ['bd', 'sd', 'hh', 'jbreak'].includes(snd)) && !orbitsIn(...bd).has(2),
      `${TRACKS[i].name}: breakdown drops the drums and the bass (bar ${bd[0]})`);
    const bdSpan = spanOf(i, 'breakdown');
    check(orbitsIn(bdSpan.begin, bdSpan.end).has(3) && orbitsIn(bdSpan.begin, bdSpan.end).has(4),
      `${TRACKS[i].name}: breakdown swells the pads and features the lead`);
    // the drop lands exactly on the peak's first bar, wherever the form put it
    const pk = spanOf(i, 'peak');
    const dropKick = onsets(pk.begin, pk.begin + 1).find((h) => h.value?.s === 'bd');
    check(dropKick && dropKick.whole.begin.equals(Fraction(pk.begin)),
      `${TRACKS[i].name}: the drop lands exactly on bar ${pk.begin - trackStartBar(i)} of the track`);
    check(soundsIn(pk.begin, pk.begin + PHRASE_BARS).has('jbreak'),
      `${TRACKS[i].name}: the break slams back on the drop`);
  }

  // AD1 — the drop no longer lives at the same bar of every track, which is the
  // whole point of authoring four forms. (Two forms may still agree; four
  // identical ones is what the complaint was about.)
  const drops = CAST_INDEX.map((i) => sectionSpans(TRACKS[i]).find((s) => s.name === 'peak').startBar);
  check(new Set(drops).size > 1, `the drops are at different bars of their tracks (${drops.join(' / ')})`);
  check(new Set(TRACKS.map((tr) => tr.bars)).size > 1,
    `AD3 — and the tracks are not all the same length either (${TRACKS.map((tr) => tr.bars).join(' / ')})`);
  check(TRACKS.reduce((s, tr) => s + tr.bars, 0) === SET_BARS && SET_BARS % PHRASE_BARS === 0,
    `the set is still ${SET_BARS} whole-phrase bars, so every absolute-time alignment survives`);

  // the pre-drop dropout bar is a build2 device, and only two forms have a
  // build2 now — so it is asserted where it exists rather than everywhere
  const withBuild2 = CAST_INDEX.filter((i) => spanOf(i, 'build2'));
  check(withBuild2.length > 0 && withBuild2.length < CAST_INDEX.length,
    `build2 is now a choice, not a given (${withBuild2.map((i) => TRACKS[i].name).join(', ')})`);
  for (const i of withBuild2) {
    const b2 = spanOf(i, 'build2');
    const bar = b2.end - 1;   // §5's pre-drop denial: the final bar of build2
    const s = soundsIn(bar, bar + 1);
    check(!s.has('bd') && !s.has('jbreak') && !s.has('hh'),
      `${TRACKS[i].name}: the pre-drop dropout bar (${bar - trackStartBar(i)}) is ether-only`);
    check(!orbitsIn(bar, bar + 1).has(2) && orbitsIn(bar, bar + 1).has(3),
      `${TRACKS[i].name}: dropout drops the bass, the pads survive it`);
  }
}

console.log('AD4 — the interlude is the control group, and it is made of what is missing');
{
  const i = TRACKS.findIndex((tr) => tr.interlude);
  check(i > 0 && i < TRACKS.length - 1, `it sits between two tracks, not at either end (index ${i})`);
  const b = trackStartBar(i);
  const body = [b, b + TRACKS[i].bars - SEAM_BARS];   // its two phrases, before its own seam
  const v = onsets(...body).map((h) => h.value ?? {});

  // what it withholds: the whole near stream and the whole floor, in EVERY
  // section it has — that is what makes it a control group rather than a short
  // quiet track, and it is one flag (`palette.core`) rather than a section gate
  check(!v.some((x) => ['jbreak', 'bd', 'sd', 'hh'].includes(x.s)),
    'no break and no skeleton anywhere in it — not one drum');
  check(!v.some((x) => (x.orbit ?? 0) === 2), 'and no floor: nothing underneath at all');

  // what survives: the continuity core. The pad is the common tone across every
  // seam in the set (§6.1) and here it is the only thing naming the harmony.
  check(v.some((x) => (x.orbit ?? 0) === 3), 'the ether is still there — the common tone');
  check(v.some((x) => x.fmh === 3.5), 'and the migrating pluck, which is in every track by definition');

  // both biomes at once, which is the crossfade happening INSIDE a track rather
  // than only across its edges
  const beds = new Set(v.map((x) => x.s));
  check(beds.has('ambleaves') && beds.has('ambwind'),
    'it is made of both neighbours’ air: the canopy’s leaves under the zenith’s wind');

  // and it costs the set nothing structural
  check(TRACKS[i].bars % PHRASE_BARS === 0 && SET_BARS % PHRASE_BARS === 0,
    `whole phrases, so D9 holds by construction (${TRACKS[i].bars} bars, set ${SET_BARS})`);
  check(SET_BARS % 32 === 0,
    `and the 32-bar ambience loops still divide the set exactly (${SET_BARS} / 32)`);
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
    // loudest fill hit per countdown bar: rising = promise kept, falling = withdrawn
    const fillSnd = fillSoundInto(i);
    const sdGains = Array.from({ length: SEAM_LATE_BARS }, (_, j) =>
      Math.max(...fillIn(late0 + j, late0 + j + 1, fillSnd).map((h) => h.value?.gain ?? 0)));
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

console.log('D38 — the fill bag is materials, not four spellings of a snare roll');
{
  const seed = bus.params.seed;
  const dealt = TRACKS.map((_, i) => seamFillFor(i, seed));
  console.log(`        (seed ${seed}: ${dealt.map((f, i) =>
    `→${TRACKS[i].name}: ${f.name} [${f.voice}] on ${seamFillSound(f, exitingTrack(i))}`).join(', ')})`);

  // the bag itself
  check(new Set(SEAM_FILLS.map((f) => f.voice)).size === FILL_VOICES.length,
    `every material class is represented in the bag (${FILL_VOICES.join(', ')})`);
  check(SEAM_FILLS.filter((f) => f.voice !== 'snare').length >= 3,
    'at least three fills are not a snare at all');
  check(SEAM_FILLS.every((f) => f.gain.length === 4 && f.lpf.length === 4),
    'every fill automates one gain and one cutoff per bar');
  check(SEAM_FILLS.every((f) => f.gain.every((g, j) => j === 0 || g < f.gain[j - 1])),
    'every fill in the bag falls, whatever it is made of');
  check(SEAM_FILLS.every((f) => f.lpf.every((c, j) => j === 0 || c < f.lpf[j - 1])),
    'and closes as it falls');
  // the hole is a property of the figure, so it can be read straight off the
  // notation: split into top-level groups (one per bar) and the fourth must
  // either be a rest outright or end on one
  const barGroups = (fig) => {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of fig.trim()) {
      if (ch === '[') depth++;
      if (ch === ']') depth--;
      if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  };
  check(SEAM_FILLS.every((f) => barGroups(f.fig).length === 4), 'every figure is exactly four bars');
  check(SEAM_FILLS.every((f) => {
    const last = barGroups(f.fig)[3];
    return last === '~' || /~\]$/.test(last);
  }), 'every figure leaves the last 16th of its last bar empty');

  // the deal: rotation, not a flat draw. This is the assertion that would have
  // caught the first cut, where the default seed dealt snare rolls to three of
  // the four boundaries and the new material was effectively unreachable.
  check(new Set(dealt.map((f) => f.voice)).size === Math.min(TRACKS.length, FILL_VOICES.length),
    'no two boundaries in a set are made of the same material');
  for (const s2 of [1, 2, 7, 99, 12345]) {
    const v = TRACKS.map((_, i) => seamFillFor(i, s2).voice);
    check(new Set(v).size === Math.min(TRACKS.length, FILL_VOICES.length),
      `and that holds on seed ${s2} too (${v.join(', ')})`);
  }
  check(TRACKS.every((_, i) => seamFillFor(i, seed).name === dealt[i].name), 'the deal is deterministic');
  check(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((s2) =>
    TRACKS.map((_, i) => seamFillFor(i, s2).voice).join(','))).size > 1,
    'and a reroll moves the rotation (the seed still decides who gets what)');

  // both flavors draw from the one bag — the dissolve is a treatment now, so a
  // dissolve boundary is as likely to get the tape stop as a landing is
  const flavors = TRACKS.map((_, i) => seamVariant(i, seed));
  const nonSnareOnDissolve = TRACKS.some((_, i) =>
    flavors[i] === 'dissolve' && dealt[i].voice !== 'snare');
  const nonSnareOnLanding = TRACKS.some((_, i) =>
    flavors[i] === 'landing' && dealt[i].voice !== 'snare');
  check(nonSnareOnDissolve || nonSnareOnLanding, 'the new material reaches real boundaries on this seed');
  // and the dissolve deepens whatever it drew, rather than replacing it
  for (let i = 0; i < TRACKS.length; i++) {
    if (flavors[i] !== 'dissolve') continue;
    const boundary = i === 0 ? SET_BARS : trackStartBar(i);
    const late0 = boundary - SEAM_LATE_BARS;
    const snd = fillSoundInto(i);
    const first = fillIn(late0, late0 + 1, snd)[0];
    const fill = dealt[i];
    check(first && Math.abs((first.value?.gain ?? 0) - fill.gain[0] * 0.82) < 5e-3,
      `→${TRACKS[i].name}: the dissolve deepens ${fill.name} rather than replacing it`);
    check(first && (first.value?.room ?? 0) > 0.18,
      `→${TRACKS[i].name}: and drowns it further than a landing would`);
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
