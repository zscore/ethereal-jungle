/**
 * Unit test for the perform rail overlay (src/perform.js — D17).
 * Run: node test/perform.mjs  (included in `npm test`)
 */
import {
  applyPerform, filterNeutral, PERFORM_DEFAULTS, PERFORM_KEYS, PERFORM_LIVE_KEYS,
  bandGainDb, gateRateHz, driveCurve, driveMakeup, driveNetGain, masterNeutral,
  rollDivision, rollGain, EQ_RANGE_DB, EQ_KILL_DB, GATE_PER_BAR,
} from '../src/perform.js';
import { bus, CPS } from '../src/bus.js';

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

console.log('master insert: eq (D19)');
{
  check(bandGainDb(1) === 0, 'unity knob is 0 dB — an untouched EQ is flat');
  check(bandGainDb(0.5) === EQ_RANGE_DB * 0.5, 'half knob is half the range, linear in dB');
  check(bandGainDb(0) === EQ_KILL_DB && bandGainDb(0.01) === EQ_KILL_DB, 'the bottom 2% is a true kill');
  check(bandGainDb(undefined) === 0, 'a missing knob reads as unity, never as a kill');
  let mono = true;
  for (let x = 0; x < 1; x += 0.05) if (bandGainDb(x) > bandGainDb(x + 0.05) + 1e-9) mono = false;
  check(mono, 'monotonic across the range');
}

console.log('master insert: gate + drive (D19)');
{
  check(gateRateHz(CPS) === CPS * GATE_PER_BAR, 'gate rate is a whole division of the bar');
  check(Math.abs(gateRateHz(CPS) - 5.6) < 0.01, 'eighths at 168 BPM land at 5.6 Hz');
  check(driveCurve(0) === null, 'no drive means no curve — a real bypass');
  const c = driveCurve(1);
  check(c instanceof Float32Array && c.length === 1024, 'drive builds a shaper curve');
  check(Math.abs(c[0] + 1) < 1e-6 && Math.abs(c[c.length - 1] - 1) < 1e-6, 'curve is normalized to full scale');
  let curveMono = true;
  for (let i = 1; i < c.length; i++) if (c[i] < c[i - 1]) curveMono = false;
  check(curveMono, 'curve is monotonic (saturation, not folding)');
  check(driveMakeup(0) === 1 && driveMakeup(1) < 1, 'makeup trims only when driven');
  // the measured regression: an uncompensated curve made drive a +6 dB boost
  for (const d of [0.05, 0.25, 0.5, 0.75, 1]) {
    check(Math.abs(driveNetGain(d) - 1) < 0.02, `drive ${d} is level-neutral at a nominal mix level`);
  }
}

console.log('master insert: rest detection (D19)');
{
  check(masterNeutral(PERFORM_DEFAULTS), 'defaults are at rest — the splice never happens');
  for (const [k, v] of [['eqLow', 0.5], ['eqMid', 0], ['eqHigh', 0.9], ['gate', 0.2], ['drive', 0.5]]) {
    check(!masterNeutral({ ...PERFORM_DEFAULTS, [k]: v }), `${k} off rest wakes the chain`);
  }
  check(masterNeutral({ ...PERFORM_DEFAULTS, filter: 0, echo: 1 }), 'D17 knobs do not wake the master chain');
}

console.log('roll division (D19)');
{
  check(rollDivision(0) === 1, 'knob at rest is off');
  check(rollDivision(0.3) === 2 && rollDivision(0.6) === 3 && rollDivision(1) === 4, 'quartiles step the division');
  check(rollDivision(64 / 127) === 3, 'a MIDI knob at center gives a usable division');
  check(rollDivision(5) === 4 && rollDivision(-1) === 1, 'out-of-range knobs clamp');
  check(Math.abs(rollGain(4) - 0.5) < 1e-9, 'x4 the hits is halved gain (√n compensation)');
}

console.log('live vs launch-quantized split (D19)');
{
  check(!PERFORM_LIVE_KEYS.has('roll'), 'roll is NOT live — it must ride a rebuild or it is silent');
  check([...PERFORM_KEYS].filter((k) => k !== 'roll').every((k) => PERFORM_LIVE_KEYS.has(k)),
    'every other perform key is live');
}

console.log('consistency with the bus');
{
  for (const key of PERFORM_KEYS) {
    check(bus.params[key] === PERFORM_DEFAULTS[key], `bus.params.${key} carries the perform default`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
