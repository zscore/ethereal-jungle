/**
 * D23 — the groove audit. The complaint that produced this file was that the
 * bass and the break sounded the same for the whole set; these checks measure
 * that claim against the compiled pattern rather than against the source, and
 * fail if the set ever collapses back to one bar repeated.
 *
 * Run: node --import ./test/register.mjs test/groove.mjs
 */
import { controls, stack, Pattern } from '@strudel/core';
import { miniAllStrings } from '@strudel/mini';
import { bus, SET_BARS, PHRASE_BARS, phraseStateAt, makeRng } from '../src/bus.js';
import { makeSetPattern, permuteBreak } from '../src/music/generators.js';

miniAllStrings();
let failures = 0;
const check = (c, l) => { c ? console.log(`  ok    ${l}`) : (failures++, console.error(`  FAIL  ${l}`)); };

const signals = { tensionAt: (t) => bus.tensionAt(t), brightnessAt: (t) => bus.brightnessAt(t) };
const pattern = makeSetPattern({ ...controls, stack, Pattern }, { ...bus.params }, signals);
const onsets = (b, e) => pattern.queryArc(b, e).filter((h) => h.hasOnset());

/** Onset positions (in 16ths of a bar) of sound `snd` within bar `b`. */
const hitsIn = (b, snd) => [...new Set(onsets(b, b + 1)
  .filter((h) => (h.value ?? {}).s === snd)
  .map((h) => Math.round((h.whole.begin.valueOf() - b) * 16)))].sort((x, y) => x - y);

// The late seam replaces the skeleton with the countdown roll (§5's
// accelerating fill), which is a different instrument wearing the same sample —
// it is excluded from the skeleton checks rather than being counted as one.
const BARS = [...Array(SET_BARS).keys()]
  .filter((b) => !phraseStateAt(Math.floor(b / PHRASE_BARS)).seam.late);

console.log('the skeleton varies, and its anchor does not (D23)');
{
  const kickBars = BARS.map((b) => hitsIn(b, 'bd')).filter((h) => h.length);
  const snareBars = BARS.map((b) => hitsIn(b, 'sd')).filter((h) => h.length);
  check(kickBars.every((h) => h.includes(0)), 'every kick bar still lands on beat 1 — the anchor never moves');
  check(snareBars.every((h) => h.includes(8)), 'every snare bar still lands on beat 3');
  const kShapes = new Set(kickBars.map((h) => h.join(',')));
  const sShapes = new Set(snareBars.map((h) => h.join(',')));
  console.log(`        kick shapes ${kShapes.size}, snare shapes ${sShapes.size}, over ${kickBars.length}/${snareBars.length} sounding bars`);
  check(kShapes.size >= 5, 'the kick plays more than one figure across the set');
  check(sShapes.size >= 5, 'so does the snare');
  const bare = kickBars.filter((h) => h.length === 1).length / kickBars.length;
  check(bare > 0.05 && bare < 0.7, `the bare heartbeat is neither gone nor the default (${(bare * 100).toFixed(0)}%)`);
  // the regression this file exists to catch, one scale up: a phrase whose four
  // bars are identical is the same bug the per-phrase draw was meant to fix.
  // Only the sections that are supposed to groove are counted — a bare intro is
  // form, not monotony (D11: form is what plays, tension only shades how).
  const GROOVING = new Set(['groove', 'peak', 'build2']);
  const phrases = [...new Set(BARS.map((b) => Math.floor(b / PHRASE_BARS)))]
    .filter((p) => GROOVING.has(phraseStateAt(p).section?.name));
  const varied = phrases.filter((p) => {
    const shapes = new Set([0, 1, 2, 3].map((j) => hitsIn(p * PHRASE_BARS + j, 'bd').join(',')));
    return shapes.size > 1;
  }).length / phrases.length;
  check(varied > 0.5, `grooving phrases whose four bars are not one bar repeated: ${(varied * 100).toFixed(0)}%`);
}

console.log('\nthe bass is a line, not a ramp (D23)');
{
  const perBar = BARS.map((b) => onsets(b, b + 1)
    .filter((h) => (h.value ?? {}).orbit === 2 && (h.value ?? {}).note != null)
    .map((h) => ({ at: Math.round((h.whole.begin.valueOf() - b) * 16), n: h.value.note }))
    .sort((x, y) => x.at - y.at));
  const sounding = perBar.filter((h) => h.length);
  const rhythms = new Set(sounding.map((h) => h.map((x) => x.at).join(',')));
  console.log(`        ${rhythms.size} distinct bass rhythms over ${sounding.length} sounding bars`);
  check(rhythms.size >= 20, 'the talea is re-cast, not one figure for the whole set');
  // direction: the old walk could only ascend
  let up = 0, down = 0;
  for (const bar of sounding) {
    for (let i = 1; i < bar.length; i++) {
      const d = bar[i].n - bar[i - 1].n;
      if (d > 0.5) up++; else if (d < -0.5) down++;
    }
  }
  console.log(`        intervals: ${up} up, ${down} down`);
  check(down > 0.25 * (up + down), 'the line descends as well as rises');
}

console.log('\nthe break permuter moves what can actually be heard (D23)');
{
  const PICKUPS = [3, 7, 11, 15];
  let moved = 0, total = 0, displaced = 0, ident = 0;
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const rng = makeRng(9000 + i * 37);
    const w = 0.18 + (i % 7) * 0.05;
    const sigma = permuteBreak(w, rng);
    total++;
    if (PICKUPS.some((j) => sigma[j] !== j)) moved++;
    displaced += sigma.filter((v, j) => v !== j).length;
    if (sigma.every((v, j) => v === j)) ident++;
    seen.add(sigma.join(','));
  }
  console.log(`        ${(displaced / total).toFixed(2)} of 16 slices displaced, ${seen.size}/${total} distinct`);
  check(moved === total, 'every σ displaces at least one pickup');
  check(ident === 0, 'σ is never the untouched break');
  check(displaced / total > 5.5, 'and it is a rearrangement, not a dither');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
