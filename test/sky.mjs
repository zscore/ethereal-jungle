/**
 * Unit test for the sky (src/visuals/sky.js — proposal IV, tier V).
 *
 * The first block is the one that matters. V3's whole point is that the storm
 * and the sky could never meet: three constants in two files said the zenith
 * could not strike and the storming track could not see a cloud, and no test
 * anywhere would have caught it, because each constant was locally reasonable.
 * These checks are about the RELATIONSHIP between them.
 *
 * Run: node test/sky.mjs  (included in `npm test`)
 */
import {
  cellAt, cloudShadeAt, CELL_SLOT, CELL_LIFE, CELL_SPEED, SHADOW,
} from '../src/visuals/sky.js';
import { weatherAt, lightningAt, TRACK_WEATHER } from '../src/visuals/weather.js';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

console.log('V3: the strikes and the sky can reach each other now');
{
  // For each track, over a long sweep: does it ever have a cell AND a strike?
  const canStorm = TRACK_WEATHER.map((_, index) => {
    let cell = false, strike = false;
    for (let i = 0; i < 30000; i++) {
      const t = i * 0.05;
      const w = weatherAt({ t, index, T: 0.65, seed: 1 });
      if (cellAt(t, 1, w.storm, w.stormFar)) cell = true;
      if (lightningAt(t, 1, w.storm).flash > 0.5) strike = true;
      if (cell && strike) break;
    }
    return { cell, strike };
  });
  check(canStorm[3].cell && canStorm[3].strike,
    'the zenith gets both a cloud and a strike — the pair that was impossible before');
  check(canStorm[1].cell && canStorm[1].strike, 'and so does the forest floor, which always had the strike');
  check(!canStorm[0].cell || TRACK_WEATHER[0].stormFar > 0.9,
    'the undergrowth is under the crowns: if it storms at all, it is far away');
}

console.log('the cell is an object that crosses the world, not an amount that rises');
{
  // it has to MOVE — the K1 argument about gusts, applied to storms
  let moved = 0;
  let prev = null;
  for (let i = 0; i < 4000; i++) {
    const t = i * 0.05;
    const c = cellAt(t, 3, 0.9, 0.4);
    if (c && prev) moved = Math.max(moved, Math.hypot(c.x - prev.x, c.z - prev.z));
    prev = c;
  }
  check(moved > 0, 'a cell travels');

  // arrival and departure are smooth — nothing appears or vanishes
  let maxJump = 0;
  prev = null;
  for (let i = 0; i < 20000; i++) {
    const c = cellAt(i * 0.01, 3, 0.9, 0.4);
    const now = c ? c.intensity : 0;
    if (prev !== null) maxJump = Math.max(maxJump, Math.abs(now - prev));
    prev = now;
  }
  check(maxJump < 0.02, `it arrives and leaves rather than popping (max step ${maxJump.toFixed(4)} over 10 ms)`);

  check(cellAt(100, 1, 0, 0.5) === null, 'no storm, no cell');
  let same = true;
  for (let i = 0; i < 400; i++) {
    const t = i * 1.7;
    if (JSON.stringify(cellAt(t, 5, 0.7, 0.3)) !== JSON.stringify(cellAt(t, 5, 0.7, 0.3))) same = false;
  }
  check(same, 'and asking twice gives the same answer (the harness can photograph one)');

  // `stormFar` is what lets the same object be two different images
  const near = [], far = [];
  for (let i = 0; i < 8000; i++) {
    const t = i * 0.05;
    const a = cellAt(t, 3, 0.9, 0.1);
    const b = cellAt(t, 3, 0.9, 0.95);
    if (a) near.push(a.distance);
    if (b) far.push(b.distance);
  }
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  check(avg(far) > avg(near) * 2,
    `stormFar moves it away: ${avg(near).toFixed(0)} units overhead vs ${avg(far).toFixed(0)} on the horizon`);
  check(CELL_LIFE > CELL_SPEED, 'a cell lives long enough to cross something');
  check(CELL_SLOT > CELL_LIFE * 0.5, 'and cells do not stack up on top of each other');
}

console.log('V5: the cloud shadow is one field, and it travels with the cloud');
{
  check(cloudShadeAt(10, 0, 0, { cover: 0 }) === 0, 'no cover, no shadow');
  let inRange = true, anyShade = false;
  for (let i = 0; i < 6000; i++) {
    const s = cloudShadeAt(i * 0.31, ((i * 7) % 200) - 100, ((i * 13) % 200) - 100, { cover: 0.8 });
    if (s < 0 || s > 1) inRange = false;
    if (s > 0.05) anyShade = true;
  }
  check(inRange, 'the shadow stays inside 0..1 everywhere');
  check(anyShade, '…and it actually darkens something');

  // continuity in space AND time: a shadow that jumps is worse than none
  let maxT = 0, prev = cloudShadeAt(0, 12, -8, { cover: 0.7 });
  for (let i = 1; i <= 4000; i++) {
    const s = cloudShadeAt(i * 0.01, 12, -8, { cover: 0.7 });
    maxT = Math.max(maxT, Math.abs(s - prev));
    prev = s;
  }
  check(maxT < 0.02, `continuous in time (max step ${maxT.toFixed(4)})`);

  let maxX = 0;
  prev = cloudShadeAt(31.7, -100, 4, { cover: 0.7 });
  for (let i = 1; i <= 4000; i++) {
    const s = cloudShadeAt(31.7, -100 + i * 0.05, 4, { cover: 0.7 });
    maxX = Math.max(maxX, Math.abs(s - prev));
    prev = s;
  }
  check(maxX < 0.02, `and in space (max step ${maxX.toFixed(4)}) — the crowns never disagree at a seam`);

  check(SHADOW.depth < 1, 'the shadow never takes the crowns to black — it is a cloud, not an eclipse');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
