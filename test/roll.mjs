/**
 * Pattern-level verification of the perform roll (D19). Compiles the real set
 * pattern and asserts that the stutter multiplies the drum orbit exactly,
 * leaves every other stream untouched, and stays bar-aligned.
 *
 * Run: node --import ./test/register.mjs test/roll.mjs  (included in `npm test`)
 */
import { controls, stack, Pattern } from '@strudel/core';
import { miniAllStrings } from '@strudel/mini';
import { bus } from '../src/bus.js';
import { makeSetPattern } from '../src/music/generators.js';
import { applyRoll, rollDivision, rollGain, DRUM_ORBIT, ROLL_BAR_MASKS } from '../src/perform.js';

miniAllStrings();

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const signals = { tensionAt: (t) => bus.tensionAt(t), brightnessAt: (t) => bus.brightnessAt(t) };
const base = makeSetPattern({ ...controls, stack, Pattern }, { ...bus.params }, signals);

// bars 40–44 of track 0: the peak section, where the full arrangement plays
const W = [40, 44];
const onsets = (p) => p.queryArc(...W).filter((h) => h.hasOnset());
const drums = (p) => onsets(p).filter((h) => (h.value?.orbit ?? 0) === DRUM_ORBIT);
const rest = (p) => onsets(p).filter((h) => (h.value?.orbit ?? 0) !== DRUM_ORBIT);

const baseDrums = drums(base).length;
const baseRest = rest(base).length;

console.log('the window is a fair test');
check(baseDrums > 0 && baseRest > 0, `peak section carries both drums (${baseDrums}) and other streams (${baseRest})`);

console.log('off is genuinely off');
check(applyRoll(base, 0, stack) === base, 'a knob at rest returns the very same pattern object');

// The mask is keyed to absolute cycle mod 4, and W starts on a phrase boundary,
// so bar b of the window is phrase position b.
const inBar = (haps, b) => haps.filter((h) => Math.floor(h.whole.begin.valueOf()) === W[0] + b);
const maskBits = (n) => ROLL_BAR_MASKS[n].replace(/[^01]/g, '').split('').map(Number);

console.log('division multiplies the drums, on the bars it claims');
for (const knob of [0.3, 0.6, 1]) {
  const n = rollDivision(knob);
  const rolled = applyRoll(base, knob, stack);
  const bits = maskBits(n);
  const perBar = bits.every((bit, b) =>
    inBar(drums(rolled), b).length === inBar(drums(base), b).length * (bit ? n : 1));
  check(perBar, `knob ${knob} → x${n} on ${ROLL_BAR_MASKS[n]}, dry elsewhere`);
  check(rest(rolled).length === baseRest, `knob ${knob} leaves bass/pads/lead untouched`);
}

console.log('the roll is a gesture, not a wall');
{
  const light = applyRoll(base, 0.3, stack);
  const full = applyRoll(base, 1, stack);
  check(drums(light).length < drums(full).length,
    'the low end of the travel is quieter than the top — a fill, not a texture');
  check(drums(light).length > baseDrums, 'but it is still audibly a roll');
  check(inBar(drums(applyRoll(base, 0.3, stack)), 3).length > inBar(drums(base), 3).length
     && inBar(drums(applyRoll(base, 0.3, stack)), 0).length === inBar(drums(base), 0).length,
    'x2 rolls the turnaround bar and leaves bar 0 alone');
}

console.log('energy compensation');
{
  const n = rollDivision(1);
  const rolled = applyRoll(base, 1, stack);
  const gained = drums(rolled).every((h) => (h.value.gain ?? 1) <= 1.0001);
  check(gained, 'no rolled hit is louder than an unrolled one');
  const sumBase = drums(base).reduce((s, h) => s + (h.value.gain ?? 1) ** 2, 0);
  const sumRoll = drums(rolled).reduce((s, h) => s + (h.value.gain ?? 1) ** 2, 0);
  check(Math.abs(sumRoll - sumBase) < 1e-6, `total energy is preserved by the √${n} trim`);
}

console.log('the roll stays on the grid');
{
  const rolled = applyRoll(base, 1, stack);
  const firstBase = drums(base)[0].whole.begin.valueOf();
  const firstRoll = drums(rolled)[0].whole.begin.valueOf();
  check(firstRoll === firstBase, 'the first stuttered hit lands with the original downbeat');
  check(drums(rolled).every((h) => h.whole.begin.valueOf() >= W[0] && h.whole.begin.valueOf() < W[1]),
    'no hit escapes the queried window');
}

console.log('non-drum streams keep their identity');
{
  const rolled = applyRoll(base, 1, stack);
  const key = (h) => `${h.value.s ?? h.value.note}@${h.whole.begin.valueOf()}`;
  check(JSON.stringify(rest(base).map(key).sort()) === JSON.stringify(rest(rolled).map(key).sort()),
    'the untouched half is identical hap-for-hap');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
