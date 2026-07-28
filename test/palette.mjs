/**
 * D22 — the warmth axis and the four casts (docs/track_identities.md).
 *
 * Pure pattern-level test, same shape as test/seams.mjs: compile the set
 * exactly as the engine does and ask whether the *design claims* are true —
 * that the zenith is the brightest and least glad track, that the pluck really
 * migrates across stream space, that each cast's characteristic instruments
 * exist where they should and nowhere else, and that the spent gestures are
 * actually spent.
 *
 * Run: npm test  (node --import ./test/register.mjs test/palette.mjs)
 */
import { controls, stack, Pattern } from '@strudel/core';
import { miniAllStrings } from '@strudel/mini';
import {
  bus, TRACKS, SET_BARS, PHRASE_BARS, SEAM_BARS, BAR_SECONDS,
  warmthAt, trackStartBar, sectionSpans,
} from '../src/bus.js';
import { makeSetPattern } from '../src/music/generators.js';
import { MODES, ROOT, padVoicing, hasMajorThird, tune, degreeToMidi } from '../src/music/scales.js';

miniAllStrings();

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const signals = { tensionAt: (t) => bus.tensionAt(t), brightnessAt: (t) => bus.brightnessAt(t) };
const pattern = makeSetPattern({ ...controls, stack, Pattern }, { ...bus.params }, signals);
const onsets = (b, e) => pattern.queryArc(b, e).filter((h) => h.hasOnset());
const values = (b, e) => onsets(b, e).map((h) => h.value ?? {});
const soundsIn = (b, e) => new Set(values(b, e).map((v) => v.s));

/** Absolute bar of a named section in track i (phrase offset optional). */
const sectionBar = (i, name, phrase = 0) => {
  const sp = sectionSpans(TRACKS[i].bars).find((s) => s.name === name);
  return trackStartBar(i) + sp.startBar + phrase * PHRASE_BARS;
};
/** One phrase of a named section, as [begin, end) bars. */
const phraseOf = (i, name, phrase = 0) => {
  const b = sectionBar(i, name, phrase);
  return [b, b + PHRASE_BARS];
};

console.log('the two axes: brightness picks the mode, warmth picks the gladness');
{
  check(TRACKS.every((tr) => typeof tr.warmth === 'number' && tr.warmth >= 0 && tr.warmth <= 1),
    'every track authors a warmth');
  const w = TRACKS.map((tr) => tr.warmth);
  check(w[0] < w[1] && w[1] < w[2], 'warmth rises across the first three tracks');
  check(w[3] < w[0], 'and then falls BELOW the undergrowth at the zenith');
  const b = TRACKS.map((tr) => tr.brightness[1]);
  check(b.every((v, i) => i === 0 || v > b[i - 1]), 'brightness still rises monotonically to the top');
  check(b[3] === Math.max(...b) && w[3] === Math.min(...w),
    'the zenith is the brightest AND the least glad track — the axes cross there');
}

console.log('warmthAt is continuous (both media can sample it like brightness)');
{
  let maxJump = 0, prev = warmthAt(0);
  const dt = 0.05;
  for (let t = dt; t <= SET_BARS * BAR_SECONDS + 4; t += dt) {
    const v = warmthAt(t);
    maxJump = Math.max(maxJump, Math.abs(v - prev));
    prev = v;
  }
  check(maxJump < 0.02, `no instant produces a jump (max step ${maxJump.toFixed(4)} over 50 ms)`);
  const loop = SET_BARS * BAR_SECONDS;
  check(Math.abs(warmthAt(loop - 0.05) - warmthAt(loop + 0.05)) < 0.02,
    'and the set loop is continuous too — the dive back into the roots is smooth');
  const seamStart = (TRACKS[0].bars - SEAM_BARS) * BAR_SECONDS;
  check(warmthAt(seamStart + 0.5 * SEAM_BARS * BAR_SECONDS) > TRACKS[0].warmth,
    "the incoming track's warmth infiltrates the seam early (§6.1)");
}

console.log('the third is the switch: cold voicings contain no major third');
{
  let cold = 0, glad = 0;
  for (const mode of MODES) {
    for (let warmth = 0; warmth <= 1.0001; warmth += 0.05) {
      const voices = padVoicing(mode, warmth, { oct: 1 });
      if (warmth < 0.3) { cold++; if (hasMajorThird(voices)) cold = -1e9; }
      if (warmth >= 0.6) { glad++; }
    }
  }
  check(cold > 0, 'no warmth < 0.3 voicing has a major third, in ANY mode (the zenith claim)');
  // …and the glad voicing does take the third where the mode has one
  const glad3 = padVoicing(MODES[5], 0.85, { oct: 1 }); // ionian
  check(hasMajorThird(glad3), 'the glad voicing takes the third when the mode offers one (the canopy)');
  const zen = padVoicing(MODES[6], TRACKS[3].warmth, { oct: 1, tuning: TRACKS[3].tuning });
  check(!hasMajorThird(zen), 'lydian at zenith warmth is bright and third-less: quartal, not glad');
  check(zen.length === 5 && new Set(zen.map((n) => Math.round(n))).size === 5, 'and it is still a five-voice chord');
}

console.log('tuning: sag → plain → just → stretch');
{
  check(tune(ROOT, { stretch: 5 }) === ROOT, 'the root is the anchor — never retuned');
  const up = degreeToMidi(1, MODES[0], 2); // two octaves up
  check(tune(up, { stretch: 3 }) > up + 0.05, 'stretch sharpens the upper octaves (zenith)');
  check(tune(up, { stretch: -4 }) < up - 0.05, 'a negative stretch sags them (undergrowth)');
  const oct1 = degreeToMidi(1, MODES[0], 1);
  check((tune(up, { stretch: 3 }) - up) > (tune(oct1, { stretch: 3 }) - oct1),
    'and it accumulates with height (Railsback-ish, not a flat offset)');
  // the canopy's just third: 386 ¢, not 400 ¢ — the one track that locks
  const third = degreeToMidi(3, MODES[5], 1); // ionian major third
  check(Math.abs((tune(third, { just: 1 }) - third) * 100 + 13.7) < 0.1,
    'the just major third sits 13.7 ¢ flat — the canopy chord actually locks');
  check(TRACKS[2].tuning.just === 1 && !TRACKS[0].tuning.just && !TRACKS[3].tuning.just,
    'and the canopy is the ONLY track that is in tune');
  check(TRACKS[0].tuning.stretch < 0 && TRACKS[3].tuning.stretch > 0,
    'the set opens sagging and ends stretched');
}

console.log('every cast is playable offline (no palette names a sample we do not ship)');
{
  const shipped = new Set(Object.keys(
    JSON.parse((await import('node:fs')).readFileSync('public/samples/strudel.json', 'utf8'))));
  const synths = new Set(['sawtooth', 'square', 'triangle', 'sine', 'white', 'pink', 'brown', 'supersaw']);
  const named = [];
  for (const tr of TRACKS) {
    for (const slot of Object.values(tr.palette ?? {})) {
      if (slot && typeof slot === 'object' && slot.s) named.push(slot.s);
    }
  }
  check(named.length > 0 && named.every((n) => shipped.has(n) || synths.has(n)),
    `every palette sound is a synth or a shipped sample (${[...new Set(named)].join(', ')})`);
}

console.log('the four casts sound different (D12, finally)');
{
  const groove = (i) => soundsIn(...phraseOf(i, 'groove'));
  const [ug, ff, cp, zn] = [0, 1, 2, 3].map(groove);
  // the floor (orbit 2) is a different instrument in every track
  const floor = (i) => new Set(values(...phraseOf(i, 'groove')).filter((v) => v.orbit === 2).map((v) => v.s));
  check(floor(0).has('sawtooth') && floor(0).has('sine'), 'undergrowth: the Reese is a saw, split-banded with a sine sub');
  check(floor(1).has('square') && !floor(1).has('sawtooth'), 'forest floor: the floor walks on a square instead');
  check([...floor(3)].join() === 'sine', 'zenith: the floor is a bare sine — nothing underneath you');
  // the hiss stands in for the hats, so it is noise on the DRUM orbit — the
  // forest floor's breath also uses noise, but as air on the ether orbit
  const hiss = (i) => values(...phraseOf(i, 'groove')).some((v) => v.s === 'white' && v.orbit === 1);
  check(zn.has('white') && !zn.has('hh'), 'zenith: the hats are gone — a high-passed hiss on the same mask');
  check(hiss(3) && !hiss(0) && !hiss(1) && !hiss(2), 'and the hiss belongs to the zenith alone');
  // the break wears a different costume in every track (orbit 1 — the grains
  // of the zenith's granular ghost are the same sample on the ether orbit)
  const brk = (i) => values(...phraseOf(i, 'groove')).filter((v) => v.s === 'jbreak' && v.orbit === 1);
  check(brk(0).every((v) => v.crush && v.coarse), 'undergrowth break: bit-reduced and low-passed');
  check(brk(1).every((v) => v.speed > 1 && !v.crush), 'forest floor break: tuned up, no degradation');
  check(brk(2).every((v) => !v.crush && !v.hcutoff && !v.cutoff), 'canopy break: open, top end intact');
  check(brk(3).every((v) => v.hcutoff >= 700 && v.room > 0.8), 'zenith break: high-passed and drowned');
  check(brk(3).some((v) => v.speed < 0), 'zenith break: slices play backwards');
}

console.log('the migrating pluck: one instrument crossing stream space over the set');
{
  // scanned over whole tracks: by the zenith the pluck is deliberately sparse
  // enough (slow, k=2, off-grid) that a single phrase can hold none of it
  const plucks = (i) => {
    const b = trackStartBar(i);
    return values(b, b + TRACKS[i].bars).filter((v) => v.fmh === 3.5 && v.gain !== 0.5);
  };
  const rooms = [0, 1, 2, 3].map((i) => {
    const p = plucks(i);
    return p.length ? p.reduce((a, v) => a + (v.room ?? 0), 0) / p.length : null;
  });
  check(rooms.every((r) => r !== null), 'the pluck plays in all four tracks');
  check(rooms.every((r, i) => i === 0 || r > rooms[i - 1]),
    `and gets wetter every track (${rooms.map((r) => r.toFixed(2)).join(' → ')})`);
  const orbits = [0, 1, 2, 3].map((i) => new Set(plucks(i).map((v) => v.orbit)));
  check(orbits[0].has(1) && orbits[3].has(3),
    'dry on the drum orbit at the bottom, drowned on the ether orbit at the top');
}

console.log('characteristic instruments are where they belong, and nowhere else');
{
  const inTrack = (i, pred) => {
    const b = trackStartBar(i);
    return values(b, b + TRACKS[i].bars).some(pred);
  };
  const anywhereElse = (skip, pred) =>
    [0, 1, 2, 3].filter((i) => i !== skip).some((i) => inTrack(i, pred));

  const breath = (v) => v.vib > 0;
  check(inTrack(1, breath) && !anywhereElse(1, breath), 'the breath voice is the forest floor’s alone');
  const air = (v) => v.s === 'white' && v.orbit === 4;
  check(inTrack(1, air) && !anywhereElse(1, air), 'and it breathes — its own band of air, on the same envelope');
  const dubbed = (v) => v.delayfeedback > 0;
  check(inTrack(1, dubbed) && !anywhereElse(1, dubbed), 'so is the dub rail');
  const bells = (v) => v.fmh === 3.0;
  check(inTrack(2, bells) && !anywhereElse(2, bells), 'the FM bells are the canopy’s');
  const choir = (v) => v.vowel !== undefined;
  check(inTrack(2, choir) && !anywhereElse(2, choir), 'and the voice is spent there too — once in the set');
  const bowl = (v) => v.fmh === 2.76;
  check(inTrack(3, bowl) && !anywhereElse(3, bowl), 'the glass bowl only rings at the zenith');
  const ghost = (v) => v.s === 'jbreak' && v.speed !== undefined && Math.abs(v.speed) === 0.5;
  check(inTrack(3, ghost) && !anywhereElse(3, ghost), 'and only the zenith hears the set as grains');
}

console.log('the squawk is a bird, not a drum kit (D32, reversing D31)');
{
  const calls = (i) => {
    const b = trackStartBar(i);
    return onsets(b, b + TRACKS[i].bars).filter((h) => (h.value ?? {}).s === 'toucan');
  };
  const canopy = calls(2);
  const phrases = TRACKS[2].bars / PHRASE_BARS;
  check(canopy.length > 0 && [0, 1, 3].every((i) => calls(i).length === 0),
    `the toucan calls in the canopy and nowhere else (${canopy.length} of them)`);
  // the interval is the point: one call per `every` phrases, never a burst
  const perPhrase = new Map();
  for (const h of canopy) {
    const p = Math.floor(h.whole.begin.valueOf() / PHRASE_BARS);
    perPhrase.set(p, (perPhrase.get(p) ?? 0) + 1);
  }
  check([...perPhrase.values()].every((n) => n === 1),
    'exactly one call per phrase that has one — it punctuates, it never chatters');
  check(canopy.length >= phrases / 3 && canopy.length <= phrases * 0.6,
    `and it comes at an interval: ${canopy.length} calls across ${phrases} phrases`);
  // D31's failure mode, asserted against: this is a bird, not a transposition
  const speeds = canopy.map((h) => h.value.speed);
  check(speeds.every((v) => v > 0.8 && v < 1.25),
    `every call is near its own pitch (${Math.min(...speeds)}–${Math.max(...speeds)}) — the tom kit was the mistake`);
  check(new Set(speeds).size > 1 && new Set(canopy.map((h) => h.value.n)).size > 1,
    'but the croak and its pitch vary, so the interval is not a sampler firing');
  const at16 = (h) => Math.round((h.whole.begin.valueOf() % 1) * 16);
  check(canopy.every((h) => ![0, 4, 8, 12].includes(at16(h))),
    'no call lands on a beat — the bird is in the trees, not in the band');
  check(canopy.every((h) => h.value.orbit === 3 && h.value.room >= 0.4),
    'it is on the ether orbit and wet: weather, not percussion');
  // and BECAUSE it is weather it outlives the drums, which D31's toms did not
  const inSection = (name) => {
    const [b, e] = phraseOf(2, name);
    return values(b, e).some((v) => v.s === 'toucan');
  };
  check(inSection('intro') || inSection('breakdown'),
    'it keeps calling through the ether-only sections — a bird does not stop for a breakdown');
  const seamStart = trackStartBar(2) + TRACKS[2].bars - PHRASE_BARS;
  check(!values(seamStart, seamStart + PHRASE_BARS).some((v) => v.s === 'toucan'),
    'but it leaves at the late seam, like the rest of the cast');
}

console.log('the biome mix is part of the cast (D30)');
{
  const shipped = JSON.parse((await import('node:fs')).readFileSync('public/samples/strudel.json', 'utf8'));
  const beds = TRACKS.flatMap((tr) => tr.ambience ?? []);
  check(beds.length > 0 && beds.every((n) => n in shipped),
    'every biome layer names a recording we actually ship');
  // the undergrowth is the crowded one: its accents speak in more phrases
  const accents = (i) => {
    const b = trackStartBar(i);
    const names = new Set((TRACKS[i].ambience ?? []).slice(1));
    return values(b, b + TRACKS[i].bars).filter((v) => names.has(v.s));
  };
  const heard = [0, 1, 2, 3].map((i) => accents(i).length);
  check(heard[0] === Math.max(...heard),
    `the undergrowth's accents are heard in more phrases than any other biome's (${heard.join(' / ')})`);
  const phrases = TRACKS[0].bars / PHRASE_BARS;
  const frogs = accents(0).filter((v) => v.s === 'ambfrogs').length;
  check(frogs >= phrases * 0.7,
    `the frogs are in most of it: ${frogs} of ${phrases} phrases, not the odd episode`);
  // …and it is the MIX that did that, not the seed being kind. Same walk, both
  // thresholds, counted directly — this is the claim the request actually made.
  const { layerPresenceAt } = await import('../src/music/generators.js');
  const clears = (name, thr) => {
    let n = 0;
    for (let p = 0; p < phrases; p++) {
      if (layerPresenceAt(name, p, bus.params.seed) > thr) n++;
    }
    return n;
  };
  const mixed = clears('ambfrogs', TRACKS[0].ambienceMix.threshold);
  const dflt = clears('ambfrogs', 0.35);
  check(mixed > dflt, `the mix is what did it: ${mixed} phrases clear 0.25, ${dflt} would clear the default 0.35`);
  check(TRACKS[0].ambienceMix.threshold > 0.15 && TRACKS[0].ambienceMix.accent < 1.5,
    'and it sits in the middle — the first pass at these numbers was too loud');
  check(TRACKS.filter((tr) => tr.ambienceMix).length < TRACKS.length,
    'the mix is a per-track field, not a new default — the other biomes are untouched');
}

console.log('the spent gestures are spent (§5: a first appearance is an event)');
{
  // the set's first sound is a stick on wood — bar 0, and never again
  const stick = (v) => v.fmh === 3.5 && v.gain === 0.5 && (v.room ?? 0) < 0.05;
  const sticks = values(0, SET_BARS).filter(stick);
  check(sticks.length === 1, `exactly one dry stick in the whole set (found ${sticks.length})`);
  check(values(0, 1).some(stick), 'and it lands in the very first bar');
  // the hoover: one bar, one track
  const hoovers = onsets(0, SET_BARS).filter((h) => (h.value?.penv ?? 0) < 0);
  const dropBar = sectionBar(2, 'peak');
  check(hoovers.length > 0 && hoovers.every((h) => Math.floor(h.whole.begin.valueOf()) === dropBar),
    'the hoover exists only on the canopy’s drop bar');
  // the dub bloom: feedback past anything else, once
  const fbs = values(0, SET_BARS).map((v) => v.delayfeedback ?? 0);
  const bloom = fbs.filter((f) => f > 0.9);
  check(bloom.length > 0 && bloom.length < fbs.filter((f) => f > 0).length * 0.2,
    'the delay self-oscillates rarely — one bar of the forest floor’s peak');
  // the silence: the zenith's release opens with one sine and the wind
  const [sb, se] = phraseOf(3, 'release');
  const quiet = values(sb, se);
  check(!quiet.some((v) => ['jbreak', 'bd', 'sd', 'white'].includes(v.s)),
    'the silence has no drums at all — the set’s only true emptiness');
  check(quiet.some((v) => v.s === 'sine' && v.orbit === 3) && quiet.some((v) => v.s === 'ambwind'),
    'just one sine and the wind');
  const next = soundsIn(se, se + PHRASE_BARS);
  check(next.has('jbreak'), 'and the arrangement returns in the following phrase');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
