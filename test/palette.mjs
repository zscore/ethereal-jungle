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
  warmthAt, trackStartBar, sectionSpans, CAST_INDEX,
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
const ctx = { ...controls, stack, Pattern };
const pattern = makeSetPattern(ctx, { ...bus.params }, signals);
/** AD12 — the same set compiled at another seed, for the b-side assertions. */
const patternAt = (seed) => makeSetPattern(ctx, { ...bus.params, seed }, signals);
const valuesOf = (pat, b, e) => pat.queryArc(b, e).filter((h) => h.hasOnset()).map((h) => h.value ?? {});
const onsets = (b, e) => pattern.queryArc(b, e).filter((h) => h.hasOnset());
const values = (b, e) => onsets(b, e).map((h) => h.value ?? {});
const soundsIn = (b, e) => new Set(values(b, e).map((v) => v.s));

/** Absolute bar of a named section in track i (phrase offset optional). */
const sectionBar = (i, name, phrase = 0) => {
  const sp = sectionSpans(TRACKS[i]).find((s) => s.name === name);
  return trackStartBar(i) + sp.startBar + phrase * PHRASE_BARS;
};
/** One phrase of a named section, as [begin, end) bars. */
const phraseOf = (i, name, phrase = 0) => {
  const b = sectionBar(i, name, phrase);
  return [b, b + PHRASE_BARS];
};

// AD4 — the set has five entries and four CASTS: the interlude sits between the
// canopy and the zenith and deliberately carries no cast at all, so every claim
// below about "the four tracks" indexes through here rather than through 0..3.
const [UG, FF, CP, ZN] = CAST_INDEX;

console.log('the two axes: brightness picks the mode, warmth picks the gladness');
{
  check(TRACKS.every((tr) => typeof tr.warmth === 'number' && tr.warmth >= 0 && tr.warmth <= 1),
    'every track authors a warmth');
  const w = CAST_INDEX.map((i) => TRACKS[i].warmth);
  check(w[0] < w[1] && w[1] < w[2], 'warmth rises across the first three tracks');
  check(w[3] < w[0], 'and then falls BELOW the undergrowth at the zenith');
  const b = CAST_INDEX.map((i) => TRACKS[i].brightness[1]);
  check(b.every((v, i) => i === 0 || v > b[i - 1]), 'brightness still rises monotonically to the top');
  check(b[3] === Math.max(...b) && w[3] === Math.min(...w),
    'the zenith is the brightest AND the least glad track — the axes cross there');
  // AD4 — and the interlude joins the walk without disturbing it: flat at
  // exactly the brightness the canopy ends on and the zenith begins on, so the
  // altitude walk needed no re-authoring anywhere else in the set.
  const inter = TRACKS.find((tr) => tr.interlude);
  check(inter && inter.brightness[0] === inter.brightness[1],
    'the interlude holds one brightness rather than walking');
  check(inter.brightness[0] === TRACKS[CP].brightness[1] &&
        inter.brightness[1] === TRACKS[ZN].brightness[0],
    `and it is the seam it stands in: ${TRACKS[CP].brightness[1]} on both sides`);
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
  const seamStart = (TRACKS[UG].bars - SEAM_BARS) * BAR_SECONDS;
  check(warmthAt(seamStart + 0.5 * SEAM_BARS * BAR_SECONDS) > TRACKS[UG].warmth,
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
  const zen = padVoicing(MODES[6], TRACKS[ZN].warmth, { oct: 1, tuning: TRACKS[ZN].tuning });
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
  check(TRACKS[CP].tuning.just === 1 && !TRACKS[UG].tuning.just && !TRACKS[ZN].tuning.just,
    'and the canopy is the ONLY track that is in tune');
  check(TRACKS[UG].tuning.stretch < 0 && TRACKS[ZN].tuning.stretch > 0,
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
  const [ug, ff, cp, zn] = CAST_INDEX.map(groove);
  // the floor (orbit 2) is a different instrument in every track
  const floor = (i) => new Set(values(...phraseOf(i, 'groove')).filter((v) => v.orbit === 2).map((v) => v.s));
  check(floor(UG).has('sawtooth') && floor(UG).has('sine'), 'undergrowth: the Reese is a saw, split-banded with a sine sub');
  check(floor(FF).has('square') && !floor(FF).has('sawtooth'), 'forest floor: the floor walks on a square instead');
  check([...floor(ZN)].join() === 'sine', 'zenith: the floor is a bare sine — nothing underneath you');
  // the hiss stands in for the hats, so it is noise on the DRUM orbit — the
  // forest floor's breath also uses noise, but as air on the ether orbit
  const hiss = (i) => values(...phraseOf(i, 'groove')).some((v) => v.s === 'white' && v.orbit === 1);
  check(zn.has('white') && !zn.has('hh'), 'zenith: the hats are gone — a high-passed hiss on the same mask');
  check(hiss(ZN) && !hiss(UG) && !hiss(FF) && !hiss(CP), 'and the hiss belongs to the zenith alone');
  // the break wears a different costume in every track (orbit 1 — the grains
  // of the zenith's granular ghost are the same sample on the ether orbit)
  //
  // AD14 — and the near stream now holds TWO jbreak layers where it held one,
  // so "the break" has to mean the body. The crack is the only one that is both
  // shaped and high-passed (no body costume in the set sets both) and it lands
  // only on the source's own backbeat slices, 4/16 and 12/16.
  const isCrack = (v) => v.s === 'jbreak' && v.orbit === 1 &&
    v.shape != null && v.hcutoff != null && (v.begin === 0.25 || v.begin === 0.75);
  const brk = (i) => values(...phraseOf(i, 'groove'))
    .filter((v) => v.s === 'jbreak' && v.orbit === 1 && !isCrack(v));
  check(brk(UG).every((v) => v.crush && v.coarse), 'undergrowth break: bit-reduced and low-passed');
  check(brk(FF).every((v) => v.speed > 1 && !v.crush), 'forest floor break: tuned up, no degradation');
  check(brk(CP).every((v) => !v.crush && !v.hcutoff && !v.cutoff), 'canopy break: open, top end intact');
  check(brk(ZN).every((v) => v.hcutoff >= 700 && v.room > 0.8), 'zenith break: high-passed and drowned');
  check(brk(ZN).some((v) => v.speed < 0), 'zenith break: slices play backwards');
}

console.log('the migrating pluck: one instrument crossing stream space over the set');
{
  // scanned over whole tracks: by the zenith the pluck is deliberately sparse
  // enough (slow, k=2, off-grid) that a single phrase can hold none of it
  const plucks = (i) => {
    const b = trackStartBar(i);
    return values(b, b + TRACKS[i].bars).filter((v) => v.fmh === 3.5 && v.gain !== 0.5);
  };
  const rooms = CAST_INDEX.map((i) => {
    const p = plucks(i);
    return p.length ? p.reduce((a, v) => a + (v.room ?? 0), 0) / p.length : null;
  });
  check(rooms.every((r) => r !== null), 'the pluck plays in all four tracks');
  check(rooms.every((r, i) => i === 0 || r > rooms[i - 1]),
    `and gets wetter every track (${rooms.map((r) => r.toFixed(2)).join(' → ')})`);
  const orbits = CAST_INDEX.map((i) => new Set(plucks(i).map((v) => v.orbit)));
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
    CAST_INDEX.filter((i) => i !== skip).some((i) => inTrack(i, pred));

  // AD13 amends this contract from "exactly once" to "once as a member, once as
  // a memory" — so the claims below are now about the instrument AS A MEMBER OF
  // A CAST. The transform each echo carries is what keeps them literally true:
  // the breath's memory has no vibrato (a living pitch is a body, and the
  // zenith's ghost of it has none) and the bells' memory is not at 3.0 any more.
  // The echoes' own contract is asserted in its own block below.
  const breath = (v) => v.vib > 0;
  check(inTrack(FF, breath) && !anywhereElse(FF, breath),
    'the breath voice is the forest floor’s alone — its vibrato is the tell, and a memory has none');
  const air = (v) => v.s === 'white' && v.orbit === 4;
  check(inTrack(FF, air), 'and it breathes — its own band of air, on the same envelope');
  check(!anywhereElse(FF, (v) => air(v) && v.vib > 0),
    'and nowhere else does air arrive attached to a body');
  const dubbed = (v) => v.delayfeedback > 0;
  check(inTrack(FF, dubbed) && !anywhereElse(FF, dubbed), 'so is the dub rail');
  const bells = (v) => v.fmh === 3.0;
  check(inTrack(CP, bells) && !anywhereElse(CP, bells), 'the FM bells are the canopy’s');
  const choir = (v) => v.vowel !== undefined;
  check(inTrack(CP, choir) && !anywhereElse(CP, choir), 'and the voice is spent there too — once in the set');
  const bowl = (v) => v.fmh === 2.76;
  check(inTrack(ZN, bowl) && !anywhereElse(ZN, bowl), 'the glass bowl only rings at the zenith');
  const ghost = (v) => v.s === 'jbreak' && v.speed !== undefined && Math.abs(v.speed) === 0.5;
  check(inTrack(ZN, ghost) && !anywhereElse(ZN, ghost), 'and only the zenith hears the set as grains');
}

console.log('the squawk is a bird, not a drum kit (D32, reversing D31)');
{
  const calls = (i) => {
    const b = trackStartBar(i);
    return onsets(b, b + TRACKS[i].bars).filter((h) => (h.value ?? {}).s === 'toucan');
  };
  const canopy = calls(CP);
  const phrases = TRACKS[CP].bars / PHRASE_BARS;
  check(canopy.length > 0 && CAST_INDEX.filter((i) => i !== CP).every((i) => calls(i).length === 0),
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
  // AD3 — scanned over the WHOLE of each ether-only section rather than over
  // its first phrase. The call schedule is keyed to the absolute phrase index
  // (one call every `every` phrases), and the canopy no longer starts at bar
  // 136: the tracks ahead of it are 64 and 76 bars now, so which of its phrases
  // carry a call has shifted. That the bird calls somewhere in the breakdown is
  // the claim; that it calls in the breakdown's opening phrase was the seed.
  const inSection = (name) => {
    const sp = sectionSpans(TRACKS[CP]).find((s) => s.name === name);
    const b = trackStartBar(CP) + sp.startBar;
    return values(b, b + sp.bars).some((v) => v.s === 'toucan');
  };
  check(inSection('intro') || inSection('breakdown'),
    'it keeps calling through the ether-only sections — a bird does not stop for a breakdown');
  const seamStart = trackStartBar(CP) + TRACKS[CP].bars - PHRASE_BARS;
  check(!values(seamStart, seamStart + PHRASE_BARS).some((v) => v.s === 'toucan'),
    'but it leaves at the late seam, like the rest of the cast');
}

console.log('one room per orbit, sized by the cast (D35)');
{
  // superdough keeps ONE reverb per orbit and regenerates its impulse response
  // whenever an event asks for a different size. Two sizes on one orbit is
  // therefore not a mix decision, it is a rebuild loop — this is the check that
  // stops one creeping back in.
  for (let i = 0; i < TRACKS.length; i++) {
    const b = trackStartBar(i);
    const sizes = new Map();
    for (const v of values(b, b + TRACKS[i].bars)) {
      if (v.roomsize == null) continue;
      const o = v.orbit ?? 0;
      (sizes.get(o) ?? sizes.set(o, new Set()).get(o)).add(v.roomsize);
    }
    const bad = [...sizes.entries()].filter(([, set]) => set.size > 1);
    check(bad.length === 0,
      `${TRACKS[i].name}: every orbit asks for exactly one room size (${[...sizes.entries()]
        .map(([o, set]) => `${o}:${[...set].join('/')}`).join(' ')})`);
  }
  // and the sizes are authored: the set walks from a close floor to a vast top
  const ether = TRACKS.map((tr) => tr.rooms?.[3]);
  check(ether.every((v) => typeof v === 'number'), 'every track sizes its own ether');
  check(ether[3] > ether[0], `and the set opens close and ends vast (${ether.join(' → ')})`);
  check(TRACKS[ZN].rooms[1] > TRACKS[UG].rooms[1] * 3,
    'the zenith drowns even its drums — the near orbit is as wet as the canopy’s ether');
}

console.log('the squawk carries the canopy’s room (D35, and the ask that started it)');
{
  const b = trackStartBar(CP);
  const calls = values(b, b + TRACKS[CP].bars).filter((v) => v.s === 'toucan');
  check(calls.length > 0 && calls.every((v) => v.room >= 0.8),
    `the call is sent hard into the reverb (room ${calls[0]?.room})`);
  check(calls.every((v) => v.roomsize === TRACKS[CP].rooms[3]),
    `into the canopy's own ${TRACKS[CP].rooms[3]} s ether, the biggest room any voice plays into`);
  const others = values(b, b + TRACKS[CP].bars).filter((v) => v.orbit === 3 && v.s !== 'toucan' && v.room != null);
  check(others.length > 0 && calls[0].room > Math.max(...others.map((v) => v.room)) * 0.85,
    'and it is among the wettest things on that orbit — the bird is across the canopy, not in the speaker');
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
  const heard = CAST_INDEX.map((i) => accents(i).length);
  check(heard[0] === Math.max(...heard),
    `the undergrowth's accents are heard in more phrases than any other biome's (${heard.join(' / ')})`);
  const phrases = TRACKS[UG].bars / PHRASE_BARS;
  const frogs = accents(UG).filter((v) => v.s === 'ambfrogs').length;
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
  const mixed = clears('ambfrogs', TRACKS[UG].ambienceMix.threshold);
  const dflt = clears('ambfrogs', 0.35);
  check(mixed > dflt, `the mix is what did it: ${mixed} phrases clear 0.25, ${dflt} would clear the default 0.35`);
  check(TRACKS[UG].ambienceMix.threshold > 0.15 && TRACKS[UG].ambienceMix.accent < 1.5,
    'and it sits in the middle — the first pass at these numbers was too loud');
  check(TRACKS.filter((tr) => tr.ambienceMix).length < TRACKS.length,
    'the mix is a per-track field, not a new default — the other biomes are untouched');
}

console.log('the dark sparkle (D37)');
{
  // D38 — scoped to the ether orbit, because `ambglint` is now also the material
  // the undergrowth's seam fill chops (`seamFillWeather`): those hits are on the
  // near orbit and are a drum part, not an ambience layer, and averaging them in
  // here would read a deliberate four-bar gesture as a mixing error.
  const glints = (i) => {
    const b = trackStartBar(i);
    return values(b, b + TRACKS[i].bars).filter((v) => v.s === 'ambglint' && (v.orbit ?? 0) === 3);
  };
  check(glints(UG).length > 0 && CAST_INDEX.filter((i) => i !== UG).every((i) => glints(i).length === 0),
    `the glints are the undergrowth's alone (${glints(UG).length} phrases carry them)`);
  // "dark" is the mix, not the recording: the layer is filtered top and bottom,
  // sat under its neighbours, and given the ether's room so each drip rings
  const g = glints(UG)[0];
  check(g.hcutoff > 0 && g.cutoff > 0, `it is filtered at both ends (${g.hcutoff}–${g.cutoff} Hz)`);
  check(g.room > 0 && g.roomsize === TRACKS[UG].rooms[3], 'and put in the undergrowth’s own room, so it rings rather than ticks');
  const otherAccents = values(trackStartBar(UG), trackStartBar(UG) + TRACKS[UG].bars)
    .filter((v) => ['ambfrogs', 'ambrustle'].includes(v.s) && (v.orbit ?? 0) === 3);
  const avg = (xs) => xs.reduce((s, v) => s + v.gain, 0) / xs.length;
  check(avg(glints(UG)) < avg(otherAccents),
    `it sits under the frogs and the rustle (${avg(glints(UG)).toFixed(3)} vs ${avg(otherAccents).toFixed(3)})`);
  check(!values(trackStartBar(UG), trackStartBar(UG) + TRACKS[UG].bars)
    .some((v) => v.s === 'ambinsects' && v.cutoff), 'and it is the only treated layer — the bed is untouched');
}

console.log('the spent gestures are spent (§5: a first appearance is an event)');
{
  // the set's first sound is a stick on wood — bar 0, and never again
  const stick = (v) => v.fmh === 3.5 && v.gain === 0.5 && (v.room ?? 0) < 0.05;
  const sticks = values(0, SET_BARS).filter(stick);
  check(sticks.length === 1, `exactly one dry stick in the whole set (found ${sticks.length})`);
  check(values(0, 1).some(stick), 'and it lands in the very first bar');
  // the two pitch-envelope gestures: each one bar, each one track, opposite
  // signs at opposite ends of the set. `penv < 0` alone no longer identifies
  // the hoover — P5's trapdoor dives on the same control — so they are told
  // apart by the orbit they are spent on (the hoover is a near-stream weapon,
  // the trapdoor opens under the floor).
  const dives = onsets(0, SET_BARS).filter((h) => (h.value?.penv ?? 0) < 0);
  const hoovers = dives.filter((h) => h.value.orbit === 1);
  const trapdoors = dives.filter((h) => h.value.orbit === 2);
  check(dives.length === hoovers.length + trapdoors.length,
    'every pitch dive in the set is one of the two authored gestures');
  const canopyDrop = sectionBar(CP, 'peak');
  check(hoovers.length > 0 && hoovers.every((h) => Math.floor(h.whole.begin.valueOf()) === canopyDrop),
    'the hoover exists only on the canopy’s drop bar');
  // AD12 — the trapdoor and the thunderclap are now B-SIDES, so they are
  // asserted under a seed that deals them rather than under the default one.
  // That is the change AD12 makes on purpose: the claim is no longer "this
  // gesture is in the set", it is "this gesture, when the set has it, is spent
  // in exactly one bar of exactly one track". The b-side block below proves the
  // other half — that exactly one of each pair exists on any seed.
  const undergrowthDrop = sectionBar(UG, 'peak');
  const trapSeed = 2;   // bSideFor(0, 2) === 0 → the trapdoor
  const trapDives = valuesOf(patternAt(trapSeed), 0, SET_BARS);
  const trapPat = patternAt(trapSeed).queryArc(0, SET_BARS)
    .filter((h) => h.hasOnset() && (h.value?.penv ?? 0) < 0 && h.value.orbit === 2);
  check(trapPat.length > 0 && trapPat.every((h) => Math.floor(h.whole.begin.valueOf()) === undergrowthDrop),
    `and the trapdoor only on the undergrowth’s — the same gesture, opposite end (seed ${trapSeed})`);
  check(trapDives.length > 0, 'the alternate seed compiles a whole set');
  // the thunderclap: reversed into the emptied bar, forward on the drop, and
  // nowhere else. Reversal is the tell — nothing else in the set plays backwards.
  const thunder = onsets(0, SET_BARS).filter((h) => h.value?.s === 'ambthunder' && h.value.speed != null);
  const ffTrack = [trackStartBar(FF), trackStartBar(FF) + TRACKS[FF].bars];
  check(thunder.length > 0 && thunder.every((h) => {
    const b = h.whole.begin.valueOf();
    return b >= ffTrack[0] && b < ffTrack[1];
  }), 'the thunderclap belongs to the forest floor alone');
  check(thunder.some((h) => h.value.speed < 0) && thunder.some((h) => h.value.speed > 0),
    'and it arrives backwards into the emptied bar, then forwards on the drop');
  // the dub bloom: feedback past anything else, once
  const fbs = values(0, SET_BARS).map((v) => v.delayfeedback ?? 0);
  const bloom = fbs.filter((f) => f > 0.9);
  check(bloom.length > 0 && bloom.length < fbs.filter((f) => f > 0).length * 0.2,
    'the delay self-oscillates rarely — one bar of the forest floor’s peak');
  // the silence: the zenith's release opens with one sine and the wind
  const [sb, se] = phraseOf(ZN, 'release');
  const quiet = values(sb, se);
  check(!quiet.some((v) => ['jbreak', 'bd', 'sd', 'white'].includes(v.s)),
    'the silence has no drums at all — the set’s only true emptiness');
  check(quiet.some((v) => v.s === 'sine' && v.orbit === 3) && quiet.some((v) => v.s === 'ambwind'),
    'just one sine and the wind');
  const next = soundsIn(se, se + PHRASE_BARS);
  check(next.has('jbreak'), 'and the arrangement returns in the following phrase');
}

console.log('AD13 — once as a member, once as a memory');
{
  // The amended contract, stated as a test because the amendment IS the
  // proposal: each echo exists in exactly one host track, exactly once, quieter
  // than its original, and the undergrowth has none — nothing can be a memory
  // in the first track you hear.
  const declared = TRACKS.flatMap((tr, i) => (tr.palette?.echoes ?? []).map((e) => ({ ...e, host: i })));
  check(declared.length > 0, `the set declares ${declared.length} echoes`);
  check(declared.every((e) => e.host !== 0),
    'the undergrowth hosts none — nothing can be a memory in the first track');
  check(declared.every((e) => e.from < e.host),
    'every echo remembers an EARLIER track, never a later one');
  check(new Set(declared.map((e) => `${e.from}/${e.slot}`)).size === declared.length,
    'no instrument is remembered twice');

  // the breath's memory: air with no vibrato, in the zenith's release, once
  const zen = [trackStartBar(ZN), trackStartBar(ZN) + TRACKS[ZN].bars];
  const memAir = onsets(...zen).filter((h) => {
    const v = h.value ?? {};
    return v.s === 'white' && v.orbit === 4 && !(v.vib > 0);
  });
  check(memAir.length > 0, `the breath returns at the zenith as air alone (${memAir.length} events)`);
  const relSpan = sectionSpans(TRACKS[ZN]).find((s) => s.name === 'release');
  const relBar = trackStartBar(ZN) + relSpan.startBar;
  check(memAir.every((h) => {
    const b = h.whole.begin.valueOf();
    return b >= relBar + PHRASE_BARS && b < relBar + 2 * PHRASE_BARS;
  }), 'in one phrase of the release, and that phrase is not the spent silence');

  // the bells' memory: half-speed and drowned, its FM ratio walked off 3.0
  // toward the bowl's 2.76 — the bridge, and the reason `fmh === 3.0` is still
  // a canopy-only tell
  const memBell = values(...zen).filter((v) => v.fmh === 2.9);
  check(memBell.length > 0, `the bells return at the zenith on the way to being glass (fmh 2.9, ${memBell.length} events)`);
  check(memBell.every((v) => v.room > 0.85), 'drowned past anything the canopy ever did to them');

  // memory volume: quieter than the original, both of them
  const srcBell = values(trackStartBar(CP), trackStartBar(CP) + TRACKS[CP].bars).filter((v) => v.fmh === 3.0);
  const mean = (xs) => xs.reduce((s, v) => s + v.gain, 0) / xs.length;
  check(mean(memBell) < mean(srcBell) * 0.7,
    `and quieter: ${mean(memBell).toFixed(3)} against the canopy's ${mean(srcBell).toFixed(3)}`);
  const srcAir = values(trackStartBar(FF), trackStartBar(FF) + TRACKS[FF].bars)
    .filter((v) => v.s === 'white' && v.orbit === 4);
  check(mean(memAir.map((h) => h.value)) < mean(srcAir),
    'so is the air it comes back as');
}

console.log('AD14 — the break is a body and a crack, and not every track earns one');
{
  const cracks = (i) => {
    const b = trackStartBar(i);
    return values(b, b + TRACKS[i].bars).filter((v) => v.s === 'jbreak' && v.orbit === 1 &&
      v.shape != null && v.hcutoff != null && (v.begin === 0.25 || v.begin === 0.75));
  };
  const counts = CAST_INDEX.map((i) => cracks(i).length);
  check(counts[0] === 0 && counts[3] === 0,
    'the undergrowth never earns the crack, and the zenith’s drums have no bodies to crack');
  check(counts[1] > 0 && counts[2] > 0, `the forest floor and the canopy have one (${counts.join(' / ')})`);
  const avg = (xs) => xs.reduce((s, v) => s + v.gain, 0) / xs.length;
  check(avg(cracks(FF)) > avg(cracks(CP)),
    `and the floor LEADS with it — harder than the canopy's (${avg(cracks(FF)).toFixed(3)} vs ${avg(cracks(CP)).toFixed(3)})`);
  // it is a backbeat, not a fill: every hit lands on 2 or 4, which is the whole
  // gesture being stolen (ANCHORS already named those two positions)
  const at = (i) => {
    const b = trackStartBar(i);
    return onsets(b, b + TRACKS[i].bars)
      .filter((h) => {
        const v = h.value ?? {};
        return v.s === 'jbreak' && v.orbit === 1 && v.shape != null && v.hcutoff != null &&
          (v.begin === 0.25 || v.begin === 0.75);
      })
      .map((h) => (h.whole.begin.valueOf() % 1));
  };
  check(at(FF).length > 0 && at(FF).every((x) => x === 0.25 || x === 0.75),
    'every crack lands on the backbeat — a drummer, not a figure');
  // the body steps back where there is a crack, which is the half of the split
  // that stops it being two drummers playing over each other
  const bodies = (i) => {
    const [b, e] = phraseOf(i, 'groove');
    return values(b, e).filter((v) => v.s === 'jbreak' && v.orbit === 1 &&
      !(v.shape != null && v.hcutoff != null));
  };
  check(bodies(FF).length > 0 && bodies(CP).length > 0, 'the body break is still there under both of them');
  // and it is spent by section, like every other form device: absent from the
  // build (the break is still fading in), hardest at the peak
  const inSec = (i, name) => {
    const sp = sectionSpans(TRACKS[i]).find((s) => s.name === name);
    if (!sp) return [];
    const b = trackStartBar(i) + sp.startBar;
    return values(b, b + sp.bars).filter((v) => v.s === 'jbreak' && v.orbit === 1 &&
      v.shape != null && v.hcutoff != null);
  };
  const gAt = (name) => {
    const xs = inSec(FF, name);
    return xs.length ? avg(xs) : 0;
  };
  check(gAt('peak') > gAt('groove') && gAt('groove') > gAt('build'),
    `the crack is spent by section: build ${gAt('build').toFixed(3)} < groove ${gAt('groove').toFixed(3)} < peak ${gAt('peak').toFixed(3)}`);
}

console.log('AD12 — the seed finally changes an instrument, not a 16th');
{
  // Pizzazz §1.7 measured the old answer and it was "nothing a listener would
  // name": re-seeding moved placements and left the roster identical, because
  // no palette decision read the seed. These are the four faces that now do.
  const faces = (pat) => {
    const v = valuesOf(pat, 0, SET_BARS);
    return {
      trapdoor: v.some((x) => (x.penv ?? 0) < 0 && x.orbit === 2),
      thud: v.some((x) => x.s === 'ambimpact' && x.speed != null && x.speed < 1),
      thunder: v.some((x) => x.s === 'ambthunder' && x.speed != null),
      // the throw: a spiked-feedback snare that is NOT the once-per-set bloom
      throw: v.some((x) => x.s === 'sd' && (x.delayfeedback ?? 0) > 0.7 && x.delayfeedback < 0.9),
    };
  };
  const seeds = [1, 2, 5, 11];
  const dealt = seeds.map((s) => ({ seed: s, ...faces(patternAt(s)) }));

  // exactly one of each pair, on every seed — this is what keeps the D22
  // "characteristic instruments are where they belong, and nowhere else"
  // contract true WITHIN any given set while making sets differ from each other
  check(dealt.every((d) => d.trapdoor !== d.thud),
    'exactly one of the trapdoor / the thud fills the undergrowth’s drop bar, on every seed');
  check(dealt.every((d) => d.thunder !== d.throw),
    'exactly one of the thunderclap / the dub throw is the forest floor’s, on every seed');

  // …and both faces of each pair actually occur across seeds, which is the
  // claim acceptance criterion (c) makes: two seeds A/B'd differ by an
  // instrument a listener could name, not by a placement
  check(dealt.some((d) => d.trapdoor) && dealt.some((d) => d.thud),
    `both undergrowth b-sides are reachable (${dealt.map((d) => `${d.seed}:${d.trapdoor ? 'trapdoor' : 'thud'}`).join(' ')})`);
  check(dealt.some((d) => d.thunder) && dealt.some((d) => d.throw),
    `both forest-floor b-sides are reachable (${dealt.map((d) => `${d.seed}:${d.thunder ? 'thunder' : 'throw'}`).join(' ')})`);

  // the throw must not steal the peak's self-oscillation: it is the ORDINARY
  // version of that gesture and has to stay audibly short of it
  const throwSeed = patternAt(5);
  const fbs = valuesOf(throwSeed, 0, SET_BARS).map((v) => v.delayfeedback ?? 0);
  check(fbs.some((f) => f > 0.9), 'the once-per-set bloom still runs past unity');
  check(fbs.filter((f) => f > 0.9).length < fbs.filter((f) => f > 0.7).length,
    'and the throw sits under it — a spike, not a second bloom');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
