/**
 * Unit test for the shared atmosphere (src/visuals/weather.js — pizzaz K1/K7/M2).
 * Same shape as test/look.mjs and test/perform.mjs: the module is pure, so the
 * claims the weather makes about itself are checkable without a GPU.
 * Run: node test/weather.mjs  (included in `npm test`)
 */
import {
  windAt, windDir, gustAt, windCeiling, weatherAt, episode,
  lightningAt, flashEnv, hash01, WIND, TRACK_WEATHER, STRIKE_SLOT,
} from '../src/visuals/weather.js';
import { TRACKS, CAST_INDEX } from '../src/bus.js';

// AD4 — the set has five entries and four biomes; the weather rows are per
// ENTRY (they are indexed by track index at runtime), so the biome claims below
// index through the casts.
const [UG, FF, CP, ZN] = CAST_INDEX;

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

console.log('the wind is one field, and it is continuous (K1)');
{
  let maxJump = 0;
  let prev = windAt(0, 3, 20, -7);
  for (let i = 1; i <= 4000; i++) {
    const w = windAt(i * 0.01, 3, 20, -7);
    maxJump = Math.max(maxJump, Math.hypot(w.x - prev.x, w.y - prev.y, w.z - prev.z));
    prev = w;
  }
  check(maxJump < 0.02, `no instant produces a jump (max step ${maxJump.toFixed(4)} over 10 ms)`);

  let maxSpaceJump = 0;
  prev = windAt(31.7, -45, 20, 0);
  for (let i = 1; i <= 4000; i++) {
    const w = windAt(31.7, -45 + i * 0.0225, 20, 0);
    maxSpaceJump = Math.max(maxSpaceJump, Math.hypot(w.x - prev.x, w.y - prev.y, w.z - prev.z));
    prev = w;
  }
  check(maxSpaceJump < 0.02, 'and no place does either — biomes sampling it never disagree at a seam');

  let bounded = true;
  for (let i = 0; i < 6000; i++) {
    const w = windAt(i * 0.37, ((i * 7) % 90) - 45, (i % 62), ((i * 13) % 90) - 45);
    if (Math.hypot(w.x, w.y, w.z) > windCeiling(1) + 1e-9) bounded = false;
  }
  check(bounded, 'the field never exceeds its stated ceiling (nothing can be blown out of its band)');
}

console.log('gusts travel — the property that makes it weather and not a fade');
{
  // a crest that passes upwind first must arrive downwind LATER: find the
  // offset that best correlates the two samples and check it is ~d/speed
  const d = windDir(0, 0); // direction is near-constant over a few seconds
  const A = { x: 0, z: 0 };
  const B = { x: d.x * 32, z: d.z * 32 };
  const expected = 32 / WIND.speed;
  let best = 0, bestScore = -Infinity;
  for (let lag = 0; lag <= 4; lag += 0.01) {
    let score = 0;
    for (let i = 0; i < 400; i++) {
      const t = i * 0.02;
      score += gustAt(t, A.x, A.z) * gustAt(t + lag, B.x, B.z);
    }
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  check(Math.abs(best - expected) < 0.35,
    `the crest reaches 32 units downwind ${best.toFixed(2)}s later (expected ${expected.toFixed(2)}s)`);

  let calm = 0, samples = 0;
  for (let i = 0; i < 20000; i++) { samples++; if (gustAt(i * 0.01, 5, 5) < 0.05) calm++; }
  check(calm / samples > 0.4, 'gusts are events: the field is calm most of the time');
  let peak = 0;
  for (let i = 0; i < 20000; i++) peak = Math.max(peak, gustAt(i * 0.01, 5, 5));
  check(peak > 0.6, '…and they actually arrive (a real crest, not a ripple)');
}

console.log('altitude gradient: the canopy sways, the roots do not');
{
  const t = 88.4;
  const low = windAt(t, 0, 2, 0).amp;
  const high = windAt(t, 0, 58, 0).amp;
  check(high > low * 2, 'wind grows with altitude');
  let monotone = true;
  for (let y = 1; y <= 62; y++) {
    if (windAt(t, 0, y, 0).amp < windAt(t, 0, y - 1, 0).amp - 1e-9) monotone = false;
  }
  check(monotone, 'and it grows monotonically — no band is windier than the one above it');
  check(windAt(t, 0, 30, 0, { strength: 0 }).amp === 0, 'a windless track is actually windless');
}

console.log('the weather axis crossfades across seams (M2)');
{
  const at = (blend) => weatherAt({ t: 10, index: 1, toIndex: 2, blend, T: 0.5, seed: 3 });
  let maxJump = 0;
  let prev = at(0);
  for (let i = 1; i <= 1000; i++) {
    const w = at(i / 1000);
    maxJump = Math.max(maxJump, Math.abs(w.mist - prev.mist) + Math.abs(w.wind - prev.wind) + Math.abs(w.rain - prev.rain));
    prev = w;
  }
  check(maxJump < 0.01, 'no boundary produces a weather cut');
  check(at(0).rain > at(1).rain, 'and the rain really does hand over (floor → canopy is a drying)');

  const dry = weatherAt({ t: 10, index: ZN, T: 0.5 });
  check(dry.rain === 0, 'the zenith is clear, and clear means zero rain');
  const floor = weatherAt({ t: 10, index: 1, T: 1 });
  check(floor.rain > 0.2 && floor.storm > 0.2, 'the forest floor rains — the twin of its ambrain bed');
  check(weatherAt({ t: 10, index: 1, T: 0 }).storm === 0,
    'storms need tension: no thunder in a calm section');
  check(weatherAt({ t: 10, index: 1, T: 1 }).storm > weatherAt({ t: 10, index: 1, T: 0.4 }).storm,
    'and they are likelier toward the climax');
  let allInRange = true;
  for (let i = 0; i < 3000; i++) {
    const w = weatherAt({ t: i * 1.7, index: i % 4, toIndex: (i + 1) % 4, blend: (i % 10) / 10, T: (i % 7) / 6 });
    for (const k of ['mist', 'rain', 'wind', 'storm', 'stormFar']) if (w[k] < 0 || w[k] > 1) allInRange = false;
  }
  check(allInRange, 'every weather channel stays inside 0..1');
}

// V3 — the item this tier exists for. The old `storm = rain · T` meant the one
// band with a visible sky could never strike, and the band that struck had no
// visible sky. These four checks are the ones that would have caught that.
console.log('storm is not rain (V3): the sky and the strikes can finally meet');
{
  // over a whole track, at its own peak tension, does the zenith ever storm?
  let zenithPeak = 0;
  for (let i = 0; i < 4000; i++) zenithPeak = Math.max(zenithPeak, weatherAt({ t: i * 0.5, index: ZN, T: 0.6 }).storm);
  check(zenithPeak > 0.2, `the zenith storms while staying dry (peak ${zenithPeak.toFixed(2)}, rain 0)`);
  check(weatherAt({ t: 10, index: ZN, T: 0.6 }).rain === 0, '…and it is still not raining up there');

  let struck = 0;
  for (let i = 0; i < 40000; i++) {
    if (lightningAt(i * 0.01, 1, weatherAt({ t: i * 0.01, index: ZN, T: 0.6 }).storm).flash > 0.5) { struck++; break; }
  }
  check(struck > 0, 'and lightning actually fires there — the thing that was impossible before');

  check(TRACK_WEATHER[FF].stormFar < TRACK_WEATHER[ZN].stormFar,
    'the floor is under its storm; the zenith is watching one on the horizon');
  check(TRACK_WEATHER[FF].storm === Math.max(...TRACK_WEATHER.map((w) => w.storm)),
    'the forest floor is still the stormiest — it is the track whose bed is ambthunder');

  // storm and rain must be independently reachable, or the decoupling is a lie
  const someRainNoStorm = weatherAt({ t: 10, index: 1, T: 0 });
  check(someRainNoStorm.rain > 0 && someRainNoStorm.storm === 0,
    'rain without thunder is expressible (a calm downpour)');
  check(dryStormExists(), 'thunder without rain is expressible (a dry storm seen from above)');

  function dryStormExists() {
    for (let i = 0; i < 4000; i++) {
      const w = weatherAt({ t: i * 0.5, index: ZN, T: 0.6 });
      if (w.storm > 0.1 && w.rain === 0) return true;
    }
    return false;
  }

  let lo = 1, hi = 0;
  for (let i = 0; i < 4000; i++) { const e = episode(i * 0.5, 2); lo = Math.min(lo, e); hi = Math.max(hi, e); }
  check(lo < 0.2 && hi > 0.8, 'rain arrives in episodes — it stops, and it comes back');
}

console.log('lightning is seeded, addressable, and rare (K7)');
{
  check(lightningAt(500, 1, 0).flash === 0, 'no storm, no strikes');
  const sample = (seed, storm, n = 40000) => {
    let strikes = 0, wasLit = false, peak = 0;
    for (let i = 0; i < n; i++) {
      const f = lightningAt(i * 0.01, seed, storm).flash;
      peak = Math.max(peak, f);
      if (f > 0.5 && !wasLit) strikes++;
      wasLit = f > 0.5;
    }
    return { strikes, peak, seconds: n * 0.01 };
  };
  const heavy = sample(1, 1);
  check(heavy.strikes > 5, `a full storm strikes (${heavy.strikes} times in ${heavy.seconds}s)`);
  check(heavy.peak > 0.95, 'and a strike reaches full brightness');
  const light = sample(1, 0.25);
  check(light.strikes < heavy.strikes, 'a lighter storm strikes less often');
  check(sample(7, 1).strikes !== heavy.strikes || sample(7, 1).peak !== heavy.peak,
    'the seed deals a different storm');

  let same = true;
  for (let i = 0; i < 500; i++) {
    const t = i * 0.7;
    if (lightningAt(t, 4, 0.8).flash !== lightningAt(t, 4, 0.8).flash) same = false;
  }
  check(same, 'and asking twice gives the same answer (pure, so the harness can reproduce a strike)');

  // the flash must decay to nothing well inside a slot, or strikes would smear
  check(flashEnv(0) === 1 && flashEnv(1.6) === 0 && flashEnv(-0.1) === 0, 'the envelope has an instant attack and a real end');
  let decays = true;
  for (let i = 1; i <= 15; i++) if (flashEnv(i * 0.1) > flashEnv((i - 1) * 0.1) + 0.5) decays = false;
  check(decays, 'and it never re-brightens past its own attack (flicker, not a second strike)');
  check(STRIKE_SLOT > 1.5, 'slots are long enough that a decaying strike cannot overlap two rolls');
}

console.log('the weather rows are the ambience beds, one sense-organ over (D16)');
{
  check(TRACK_WEATHER.length === TRACKS.length,
    `one row per entry of the set, AD4's interlude included (${TRACK_WEATHER.length})`);
  check(TRACK_WEATHER[FF].rain === Math.max(...TRACK_WEATHER.map((w) => w.rain)),
    'the forest floor is the rainiest — it is the track whose bed is ambrain');
  check(TRACK_WEATHER[CP].wind === Math.max(...TRACK_WEATHER.map((w) => w.wind)),
    'the canopy is the windiest — it is the track whose bed is ambbirds over gusts');
  check(TRACK_WEATHER[UG].mist === Math.max(...TRACK_WEATHER.map((w) => w.mist)),
    'the undergrowth is the dampest — closest air, shortest sightline');
  check(hash01(0) !== hash01(1) && hash01(99) === hash01(99), 'the hash is a hash');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
