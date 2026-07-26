/**
 * Unit test for the perform rail overlay (src/perform.js — D17).
 * Run: node test/perform.mjs  (included in `npm test`)
 */
import {
  applyPerform, PERFORM_DEFAULTS, PERFORM_KEYS, PERFORM_LIVE_KEYS,
  bandGainDb, gateRateHz, driveCurve, driveMakeup, driveNetGain, masterNeutral,
  rollDivision, rollGain, EQ_RANGE_DB, EQ_KILL_DB, GATE_PER_BAR,
  lpfCutoff, hpfCutoff, LPF_MIN_HZ, LPF_MAX_HZ, HPF_MIN_HZ, HPF_MAX_HZ,
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
  check(applyPerform(v, { ...PERFORM_DEFAULTS, lpf: 0, hpf: 1 }) === v, 'filters never touch events (they are master nodes)');
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

console.log('the two filter dials (D20)');
{
  check(lpfCutoff(1) === LPF_MAX_HZ && hpfCutoff(0) === HPF_MIN_HZ, 'each dial is transparent at its home');
  check(lpfCutoff(0) === LPF_MIN_HZ && hpfCutoff(1) === HPF_MAX_HZ, 'each dial closes fully at its far end');
  check(lpfCutoff(undefined) === LPF_MAX_HZ && hpfCutoff(undefined) === HPF_MIN_HZ,
    'a missing dial reads as open — never as a filter nobody asked for');
  let mono = true;
  for (let x = 0; x < 1; x += 0.05) {
    if (lpfCutoff(x) > lpfCutoff(x + 0.05)) mono = false;
    if (hpfCutoff(x) > hpfCutoff(x + 0.05)) mono = false;
  }
  check(mono, 'both dials are monotonic');
  check(lpfCutoff(5) === LPF_MAX_HZ && hpfCutoff(-3) === HPF_MIN_HZ, 'out-of-range dials clamp');

  // The regression that made these dials feel broken (D21): a pure exponential
  // spent the first fifth of the throw between 20 kHz and 5 kHz, where there is
  // nothing to hear. Pin the corner into the audible band early in the travel.
  check(lpfCutoff(0.9) < 6000, 'a tenth of a turn puts the lpf corner where the ear lives');
  check(lpfCutoff(0.8) < 3000, 'a fifth of a turn is unmistakably filtered');
  check(hpfCutoff(0.2) > 120, 'a fifth of a turn on the hpf is already thinning the low end');
  check(hpfCutoff(0.3) > 240, 'and a third of a turn has taken the body out');
  // no segment of the throw should be a dead zone — half an octave minimum
  let deadZone = null;
  for (let i = 0; i < 10; i++) { // integer steps: 0.1 accumulation overshoots 1.0
    const x = i / 10;
    const lo = Math.log2(lpfCutoff(x + 0.1) / lpfCutoff(x));
    const hi = Math.log2(hpfCutoff(x + 0.1) / hpfCutoff(x));
    if (lo < 0.5 || hi < 0.5) deadZone = x.toFixed(1);
  }
  check(deadZone === null, `every tenth of the throw moves the corner at least half an octave${deadZone ? ` (dead at ${deadZone})` : ''}`);

  // Independent dials overlap: like real dual-filter hardware, closing both
  // mutes rather than leaving a token band. A usable band lives off-centre.
  check(hpfCutoff(0.5) > lpfCutoff(0.5), 'both dials at noon overlap into silence, as the hardware does');
  check(hpfCutoff(0.3) < lpfCutoff(0.6), 'moderate settings still leave a passband to sweep');
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
  check(!masterNeutral({ ...PERFORM_DEFAULTS, lpf: 0.5 }), 'lpf off rest wakes the chain');
  check(!masterNeutral({ ...PERFORM_DEFAULTS, hpf: 0.5 }), 'hpf off rest wakes the chain');
  check(masterNeutral({ ...PERFORM_DEFAULTS, echo: 1, crush: 1 }), 'event-overlay knobs do not wake the master chain');
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
