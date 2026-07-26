/**
 * Unit test for the OSC bridge's pure message decoder (src/osc.js).
 * Run: node test/osc.mjs  (included in `npm test`)
 */
import { applyOscMessage } from '../src/osc.js';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const fresh = () => ({ tensionMix: 0, tensionManual: 0.4, brightnessMix: 0, brightnessManual: 0.7, wildness: 0.35, coupling: 0.6, seed: 1, filter: 0.5, echo: 0, crush: 0, space: 0, eqLow: 1, eqMid: 1, eqHigh: 1, gate: 0, drive: 0, roll: 0 });

console.log('address form');
{
  const p = fresh();
  check(applyOscMessage(p, { address: '/jungle/wildness', args: [0.8] }) === 'wildness' && p.wildness === 0.8, 'plain args array');
  check(applyOscMessage(p, { address: '/coupling', args: [{ type: 'f', value: 0.25 }] }) === 'coupling' && p.coupling === 0.25, 'open-stage-control typed args');
  check(applyOscMessage(p, { address: '/anything/nested/tension', args: [0.9] }) === 'tensionManual' && p.tensionManual === 0.9, 'last path segment + tension alias');
  check(applyOscMessage(p, { address: '/brightness', args: [0.1] }) === 'brightnessManual' && p.brightnessManual === 0.1, 'brightness alias');
  check(applyOscMessage(p, { address: '/jungle/filter', args: [0.2] }) === 'filter' && p.filter === 0.2, 'perform rail is writable (D17)');
  check(applyOscMessage(p, { address: '/jungle/low', args: [0] }) === 'eqLow' && p.eqLow === 0, 'eq band alias kills the lows (D19)');
  check(applyOscMessage(p, { address: '/high', args: [0.5] }) === 'eqHigh' && p.eqHigh === 0.5, 'high alias');
  check(applyOscMessage(p, { param: 'roll', value: 1 }) === 'roll' && p.roll === 1, 'roll is writable');
}

console.log('param form');
{
  const p = fresh();
  check(applyOscMessage(p, { param: 'tensionMix', value: 1 }) === 'tensionMix' && p.tensionMix === 1, 'direct param/value');
}

console.log('clamping and typing');
{
  const p = fresh();
  applyOscMessage(p, { param: 'wildness', value: 3.5 });
  check(p.wildness === 1, 'clamps above 1');
  applyOscMessage(p, { param: 'wildness', value: -2 });
  check(p.wildness === 0, 'clamps below 0');
  applyOscMessage(p, { param: 'seed', value: 41.7 });
  check(p.seed === 42, 'seed rounds to integer');
  applyOscMessage(p, { param: 'seed', value: -5 });
  check(p.seed === 0, 'seed floors at 0');
}

console.log('rejection');
{
  const p = fresh();
  const before = JSON.stringify(p);
  check(applyOscMessage(p, { address: '/jungle/volume', args: [0.5] }) === null, 'unknown param rejected');
  check(applyOscMessage(p, { param: 'wildness', value: 'loud' }) === null, 'non-numeric rejected');
  check(applyOscMessage(p, { param: 'wildness', value: NaN }) === null, 'NaN rejected');
  check(applyOscMessage(p, { address: '/wildness' }) === null, 'missing args rejected');
  check(applyOscMessage(p, null) === null && applyOscMessage(p, 'hi') === null, 'garbage rejected');
  check(JSON.stringify(p) === before, 'rejected messages write nothing');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
