/**
 * Unit test for the fauna (src/visuals/fauna.js — proposal IV, tier U).
 * Same shape as test/weather.mjs and test/look.mjs: the module is pure, so the
 * claims the animals make about themselves are checkable without a GPU.
 *
 * The important block is the first one. U1's whole licence for putting animals
 * on the ground stream is that they cannot carry rhythm, and "cannot" has to be
 * a measurement — the fireflies' comment has asserted it in prose since K2 and
 * nothing has ever checked it.
 *
 * Run: node test/fauna.mjs  (included in `npm test`)
 */
import {
  periodFor, phaseFor, bandWindow, slotEvent, flushEnv, coherenceAt,
  lifeAt, slothReach, wingbeat, throatPulse, populationFor, faunaAt,
  CAST, SECTION_LIFE, hash01, GOLDEN,
} from '../src/visuals/fauna.js';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const TRACK_SECONDS = 68 * (240 / 168); // ≈97 s — one track, the window anybody watches

console.log('U1: no population in this world can synchronise');
{
  // the direct claim: over a whole track, what is the largest fraction of a
  // population that is ever in phase at once? A synchronised swarm would spike
  // this to 1; independent individuals should sit near the chance level.
  const N = 56;
  let worst = 0, worstAt = 0;
  for (let s = 0; s < 3000; s++) {
    const t = (s / 3000) * TRACK_SECONDS;
    let lit = 0;
    for (let i = 0; i < N; i++) if (phaseFor(t, i, 2.1, 5.9) < 0.08) lit++;
    if (lit / N > worst) { worst = lit / N; worstAt = t; }
  }
  check(worst < 0.35, `at most ${(worst * 100).toFixed(0)}% of a flock is ever in phase (t=${worstAt.toFixed(1)}s)`);

  // …and no two individuals share a period, which is the mechanism behind it
  const periods = Array.from({ length: 220 }, (_, i) => periodFor(i));
  let minGap = Infinity;
  const sorted = [...periods].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) minGap = Math.min(minGap, sorted[i] - sorted[i - 1]);
  check(minGap > 1e-4, `no two of 220 individuals share a period (closest pair ${minGap.toFixed(5)}s apart)`);

  // the golden stride's actual promise: even spread, for ANY population size,
  // where a random draw would sometimes clump
  let evenAtEverySize = true;
  for (const n of [7, 12, 56, 100, 220]) {
    const ps = Array.from({ length: n }, (_, i) => periodFor(i)).sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 1; i < ps.length; i++) maxGap = Math.max(maxGap, ps[i] - ps[i - 1]);
    // ideal spacing is range/(n-1); the golden sequence stays within ~2× of it
    if (maxGap > (3.8 / (n - 1)) * 2.2) evenAtEverySize = false;
  }
  check(evenAtEverySize, 'and they stay evenly spread at every population size (the low-discrepancy claim)');
  check(Math.abs(GOLDEN - (Math.sqrt(5) - 1) / 2) < 1e-12, 'the stride really is the golden-ratio conjugate');

  // starting phases are decorrelated too — without this a population begins
  // together and takes a whole track to drift apart, which LOOKS synchronised
  // for the only part of the set anybody is watching
  let lit0 = 0;
  for (let i = 0; i < 56; i++) if (phaseFor(0, i, 2.1, 5.9) < 0.08) lit0++;
  check(lit0 / 56 < 0.35, 'a population does not begin in unison either (t=0 is not special)');
}

console.log('the sloth refuses to be hurried (U2)');
{
  // Count reach EVENTS (rising edges), not samples above threshold. The reach
  // is a fixed fraction of the cycle, so a longer period spends more absolute
  // time reaching while doing it fewer times — measuring duty cycle here would
  // report the opposite of what is being claimed.
  const reaches = (T) => {
    let n = 0;
    for (let i = 0; i < 3; i++) {
      let was = false;
      for (let s = 0; s < 8000; s++) {
        const on = slothReach(s * 0.1, i, T) > 0.5;
        if (on && !was) n++;
        was = on;
      }
    }
    return n;
  };
  const cSum = reaches(0), lSum = reaches(1);
  check(lSum < cSum, `a sloth at full tension reaches LESS often, not more (${lSum} vs ${cSum} in 800s)`);
  check(slothReach(50, 0, 0) >= 0 && slothReach(50, 0, 0) <= 1, 'the reach is bounded');
  // most of a sloth's life is hanging still
  let moving = 0;
  for (let s = 0; s < 5000; s++) if (slothReach(s * 0.1, 1, 0.3) > 0.05) moving++;
  check(moving / 5000 < 0.3, `and it is motionless most of the time (${((1 - moving / 5000) * 100).toFixed(0)}% hanging)`);
}

console.log('band windows are continuous — nothing pops into existence at a boundary');
{
  for (const [name, spec] of Object.entries(CAST)) {
    let maxJump = 0;
    let prev = bandWindow(0, spec.lo, spec.hi, spec.feather);
    for (let i = 1; i <= 20000; i++) {
      const v = bandWindow(i / 20000, spec.lo, spec.hi, spec.feather);
      maxJump = Math.max(maxJump, Math.abs(v - prev));
      prev = v;
    }
    check(maxJump < 0.01, `${name}: no altitude produces a jump (max step ${maxJump.toFixed(5)})`);
  }
  // Use the flock, not the sloths: the sloth band starts at 0.05 with a 0.10
  // feather, so its lower skirt runs off the bottom of the altitude range and
  // the clamp leaves it half-present at alt 0 — which is correct (alt 0 is
  // inside the feather) and makes it the wrong creature to state this with.
  const b = CAST.bird;
  check(bandWindow(b.lo - b.feather - 0.01, b.lo, b.hi, b.feather) === 0, 'and outside the band a creature is genuinely absent');
  check(bandWindow(b.hi + b.feather + 0.01, b.lo, b.hi, b.feather) === 0, '…on the far side too');
  check(bandWindow((b.lo + b.hi) / 2, b.lo, b.hi, b.feather) === 1, '…and fully present in the middle of it');
  // the ones whose skirts genuinely run off the world: present at the extreme,
  // which is what a creature that lives on the litter or in the open sky means
  check(bandWindow(0, CAST.poolfrog.lo, CAST.poolfrog.hi, CAST.poolfrog.feather) === 1,
    'the pool frogs are fully present at the very bottom of the world');
  check(bandWindow(1, CAST.soarer.lo, CAST.soarer.hi, CAST.soarer.feather) === 1,
    'and the soarer at the very top of it');
}

console.log('episodic schedules are seeded, addressable and rare (the weather licence)');
{
  let same = true;
  for (let i = 0; i < 500; i++) {
    const t = i * 0.7;
    const a = slotEvent(t, 4, 6, 0.5), b = slotEvent(t, 4, 6, 0.5);
    if (JSON.stringify(a) !== JSON.stringify(b)) same = false;
  }
  check(same, 'asking twice gives the same answer (the harness can reproduce a startle)');

  const fires = (seed, chance) => {
    let n = 0, was = false;
    for (let i = 0; i < 20000; i++) {
      const e = slotEvent(i * 0.01, seed, 6, chance);
      const on = !!e && e.since < 0.05;
      if (on && !was) n++;
      was = on;
    }
    return n;
  };
  check(fires(2, 0.9) > fires(2, 0.2), 'a higher chance fires more often');
  check(fires(2, 0.5) !== fires(9, 0.5), 'the seed deals a different schedule');
  check(slotEvent(100, 3, 6, 0) === null, 'chance 0 never fires');

  // nothing here may know where the downbeat is — that is the whole licence.
  // A schedule aligned to the bar would show up as event times clustering at
  // one phase of the 4/4 bar; check they are spread instead.
  const BAR = 240 / 168;
  const bins = new Array(8).fill(0);
  for (let s = 0; s < 6000; s++) {
    const e = slotEvent(s * 0.05, 11, 6, 0.6);
    if (e && e.since < 0.05) bins[Math.floor(((e.at % BAR) / BAR) * 8) % 8]++;
  }
  const total = bins.reduce((a, b) => a + b, 0);
  const peak = Math.max(...bins) / total;
  check(peak < 0.30, `event times are spread across the bar, not on it (busiest eighth ${(peak * 100).toFixed(0)}%)`);
}

console.log('the flush envelope is a startle, not a mood (U5)');
{
  check(flushEnv(0) === 1, 'instant attack');
  check(flushEnv(2.3) === 0 && flushEnv(-0.1) === 0, 'and a real end');
  let decays = true;
  for (let i = 1; i <= 20; i++) if (flushEnv(i * 0.1) > flushEnv((i - 1) * 0.1)) decays = false;
  check(decays, 'monotonic decay — a bird calms down, it does not re-panic');
  check(flushEnv(1.0) < 0.1, 'and it is over quickly (a startle lasts about a second)');
}

console.log('W1: warmth is agreement, and it is monotone');
{
  const cold = coherenceAt(0), warm = coherenceAt(1);
  check(warm.alignment > cold.alignment, 'a warm world aligns');
  check(warm.cohesion > cold.cohesion, '…gathers');
  check(warm.separation < cold.separation, '…and stops pushing itself apart');
  check(warm.spread < cold.spread, 'a warm canopy agrees on one green; a cold one is a hundred');
  check(warm.consent > cold.consent, 'and a warm flock leans with the wind instead of arguing with it');

  let monotone = true;
  for (let i = 1; i <= 200; i++) {
    const a = coherenceAt((i - 1) / 200), b = coherenceAt(i / 200);
    if (b.alignment < a.alignment || b.separation > a.separation || b.spread > a.spread) monotone = false;
  }
  check(monotone, 'every channel is perceptually monotone in warmth (§9.1, for the second axis)');

  // the payoff, stated as a test: the zenith's axes diverge. Brightness (and so
  // altitude) climbs while warmth falls, so the world must get LESS coherent as
  // the camera gets higher in the last track — awe, not triumph (D22).
  const zenithStart = coherenceAt(0.85); // canopy warmth, handing over
  const zenithEnd = coherenceAt(0.10);   // zenith warmth
  check(zenithEnd.alignment < zenithStart.alignment && zenithEnd.spread > zenithStart.spread,
    'the zenith climbs into more light and less agreement — the D22 crossing, visible at last');
}

console.log('W6: the section is spent on the world');
{
  check(lifeAt('breakdown').still > lifeAt('groove').still, 'the animals go quiet in the breakdown, under the ink');
  check(lifeAt('peak').rate > lifeAt('groove').rate, 'and they are restless at the peak');
  check(lifeAt('build2').rate > lifeAt('build').rate, 'the second build is more restless than the first');
  check(lifeAt('intro').still > 0, 'the intro is an empty world on purpose');
  check(lifeAt('nonsense') === SECTION_LIFE.groove, 'an unknown section falls back to the groove rather than throwing');
  let allSane = true;
  for (const v of Object.values(SECTION_LIFE)) {
    if (v.rate <= 0 || v.still < 0 || v.still > 1) allSane = false;
  }
  check(allSane, 'every section row is in range (a zero rate would divide by zero in faunaAt)');
}

console.log('the governor can shed a population without emptying the world (Y2)');
{
  check(populationFor(CAST.bird, 1) === CAST.bird.count, 'full quality draws the whole flock');
  check(populationFor(CAST.bird, 0.4) < CAST.bird.count, 'and a shed quality draws fewer');
  check(populationFor(CAST.bird, 0) >= 1, 'but never zero — a flock that vanishes is a bug, not a saving');
  check(populationFor(CAST.soarer, 0.1) === 1, 'a population of one is never shed (the zenith keeps its bird)');
  let monotone = true;
  for (let i = 1; i <= 100; i++) {
    if (populationFor(CAST.bird, i / 100) < populationFor(CAST.bird, (i - 1) / 100)) monotone = false;
  }
  check(monotone, 'population rises monotonically with quality');
}

console.log('faunaAt composes it all without touching a renderer');
{
  const f = faunaAt({ t: 40, seed: 1, alt: 0.2, warmth: 0.15, section: 'groove', T: 0.5 });
  check(f.presence.sloth === 1, 'at altitude 0.2 the sloths are fully present');
  check(f.presence.bird === 0, '…and there are no birds down there');
  const high = faunaAt({ t: 40, seed: 1, alt: 0.62, warmth: 0.85, section: 'peak', T: 0.9 });
  check(high.presence.bird === 1 && high.presence.sloth === 0, 'and in the crowns it is the other way round');
  check(high.presence.slothCrown > 0, 'except the crown sloths, who live where sloths actually live');

  let noNaN = true;
  for (let i = 0; i < 2000; i++) {
    const g = faunaAt({ t: i * 0.7, seed: 2, alt: (i % 100) / 100, warmth: (i % 11) / 10, section: 'build', T: (i % 7) / 6 });
    for (const v of Object.values(g.presence)) if (!Number.isFinite(v)) noNaN = false;
    if (!Number.isFinite(g.coherence.alignment)) noNaN = false;
  }
  check(noNaN, 'and nothing in it is ever NaN across a full sweep');

  check(wingbeat(10, 0) !== wingbeat(10, 1), 'two birds do not flap together');
  check(throatPulse(10, 0) !== throatPulse(10, 1), 'two frogs do not call together');
  check(hash01(0) !== hash01(1) && hash01(99) === hash01(99), 'the hash is a hash');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
