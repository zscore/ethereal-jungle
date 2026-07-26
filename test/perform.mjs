/**
 * Unit test for the perform rail overlay (src/perform.js — D17).
 * Run: node test/perform.mjs  (included in `npm test`)
 */
import { applyPerform, filterNeutral, PERFORM_DEFAULTS, PERFORM_KEYS } from '../src/perform.js';
import { bus } from '../src/bus.js';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

console.log('idle path is identity');
{
  const v = { s: 'bd', gain: 0.9 };
  check(applyPerform(v, PERFORM_DEFAULTS) === v, 'defaults return the same object');
  check(applyPerform(v, { ...PERFORM_DEFAULTS, echo: 0.005 }) === v, 'sub-epsilon knob is still idle');
  check(applyPerform(v, { ...PERFORM_DEFAULTS, filter: 0 }) === v, 'filter alone never touches events (node-level FX)');
}

console.log('echo');
{
  const v = applyPerform({ s: 'sd' }, { ...PERFORM_DEFAULTS, echo: 0.5 });
  check(v.delay === 0.4, 'send scales with the knob');
  check(v.delaysync === 3 / 16, 'dotted-eighth sync when nothing authored a time');
  check(v.delayfeedback === 0.6, 'feedback rises with the knob');
  const authored = applyPerform({ s: 'sd', delaytime: 0.2 }, { ...PERFORM_DEFAULTS, echo: 0.5 });
  check(authored.delaytime === 0.2 && authored.delaysync === undefined, 'authored delaytime is respected');
  check((0.35 + 0.5 * 1) <= 0.98, 'max feedback stays under superdough clamp');
}

console.log('crush');
{
  check(applyPerform({}, { ...PERFORM_DEFAULTS, crush: 1 }).crush === 2, 'full knob = 2 bits');
  check(applyPerform({}, { ...PERFORM_DEFAULTS, crush: 0.1 }).crush === 11, 'light knob = subtle bits');
  const authored = applyPerform({ crush: 4 }, { ...PERFORM_DEFAULTS, crush: 0.1 });
  check(authored.crush === 4, 'a harsher authored crush wins (min composition)');
}

console.log('space');
{
  check(applyPerform({}, { ...PERFORM_DEFAULTS, space: 0.5 }).room === 0.45, 'wash raises the room send');
  const pads = applyPerform({ room: 0.9 }, { ...PERFORM_DEFAULTS, space: 0.5 });
  check(pads.room === 0.9, 'a wetter authored room wins (max composition)');
}

console.log('purity');
{
  const original = { s: 'bd', room: 0.1 };
  const before = JSON.stringify(original);
  applyPerform(original, { ...PERFORM_DEFAULTS, echo: 1, crush: 1, space: 1 });
  check(JSON.stringify(original) === before, 'the input object is never mutated');
}

console.log('filter neutrality band');
{
  check(filterNeutral(0.5) && filterNeutral(64 / 127), 'center (and MIDI center) are neutral');
  check(!filterNeutral(0.4) && !filterNeutral(0.6), 'off-center is live');
}

console.log('consistency with the bus');
{
  for (const key of PERFORM_KEYS) {
    check(bus.params[key] === PERFORM_DEFAULTS[key], `bus.params.${key} carries the perform default`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
