/**
 * fauna.js — the animals, as pure functions (proposal IV, tier U).
 *
 * Same treatment as `look.js`, `weather.js` and `perform.js`: schedules, gaits,
 * band windows and the coherence curve are functions of `(t, seed, env)` with
 * no three.js, no DOM and no state. `biomes.js` builds meshes and moves values;
 * everything a creature *claims* about itself is asserted in `test/fauna.mjs`
 * instead of being a paragraph in a design doc.
 *
 * ---------------------------------------------------------------------------
 * U1 — the rule every animal obeys. Read this before adding a creature.
 * ---------------------------------------------------------------------------
 *
 * The world had thirteen systems and one animal (the fireflies, K2), and the
 * reason is in §3.7's affordance table: rhythm affordance and ground affordance
 * are nearly disjoint, and every family this world is built from sits on the
 * ground side. An animal is the first thing that wants to be on both sides at
 * once — continuous like weather, and *discrete* when it moves — so it is the
 * first thing that can break §2.1's rule that the ground stream carries no
 * rhythm.
 *
 * The fireflies already met this and their comment says how: each carries its
 * own blink period on an irrational stride so the swarm NEVER synchronises,
 * "the physics is wrong on purpose and the discipline is why". Generalised,
 * that is three tiers, and every behaviour below declares which one it is in:
 *
 *   CONTINUOUS (ground)   locomotion, breathing, sway, wind response.
 *                         Aperiodic across individuals, no common multiple
 *                         inside a track. Free: costs no synch points, may run
 *                         at any density.
 *   EPISODIC (weather)    rare behaviours on a seeded slot schedule — a
 *                         startle, a call, a descent. Licensed exactly the way
 *                         lightning is: nothing about the schedule knows where
 *                         the downbeat is, which is what makes it legal.
 *   ANCHORED (figure)     bound to a published bus event, and therefore priced
 *                         by the synch-point economy (§2.2). Spend only on
 *                         events that are ALREADY rare.
 *
 * **A creature may take at most one anchored behaviour.** Everything else is
 * continuous or episodic. That single rule is what lets the world be full of
 * animals without becoming a drum machine, which is the whole risk of this tier.
 * Today exactly one anchored behaviour exists in the set: the toucan flush (U5),
 * on a call that fires once every two phrases.
 *
 * Note what is NOT here: no timers, no counters, no per-frame accumulators.
 * Every schedule is addressable at any instant, past or future, for the same
 * reason `lightningAt` is — the harness has to be able to photograph a startle
 * on demand, and a behaviour you can only reach by waiting is a behaviour
 * nobody will ever test.
 */

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);

/** Deterministic integer hash → [0,1). Same shape as weather.js's. */
export function hash01(n) {
  let x = (n | 0) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

// ---------- the desynchronisation discipline ----------
// The golden-ratio conjugate. An additive recurrence with this stride is the
// optimal low-discrepancy sequence in one dimension, which is the actual reason
// to use it rather than a vibe about nature: it *guarantees* the periods spread
// evenly across their range for any population size, where a random draw would
// occasionally cluster two individuals close enough to beat visibly.
//
// It is also already in this world — `makeFloor` puts its leaves on the same
// number (137.507°, phyllotaxis). One constant, two arguments for it.
export const GOLDEN = 0.6180339887498949;

/**
 * The period of individual `i`, spread across [lo, hi] with no two agreeing.
 *
 * This is the fireflies' trick, generalised and given a better stride. Every
 * continuous behaviour in this module goes through it, so "no creature in this
 * world can synchronise" is one function and one test rather than a promise
 * repeated in five places.
 */
export function periodFor(i, lo = 2.1, hi = 5.9) {
  return lo + ((i * GOLDEN) % 1) * (hi - lo);
}

/**
 * Phase 0..1 of individual `i`'s cycle at time t. `spread` decorrelates the
 * starting phases too — without it a population would all begin together and
 * take a whole track to drift apart, which looks exactly like synchrony for the
 * only part of the set anybody is watching.
 */
export function phaseFor(t, i, lo, hi, seed = 0) {
  const p = periodFor(i, lo, hi);
  const start = hash01(i * 2654435761 + seed * 97);
  return ((t / p + start) % 1 + 1) % 1;
}

// ---------- band windows ----------
/**
 * How present a creature is at altitude `a`: 1 inside [lo, hi], falling to 0
 * across `feather` on each side. Smoothstepped, because the one thing a
 * creature must never do is pop into existence at a boundary — the same
 * continuity argument `tentWeight` makes for the grades and the orbits, and the
 * reason `test/fauna.mjs` sweeps altitude looking for a jump.
 */
export function bandWindow(a, lo, hi, feather = 0.08) {
  const x = clamp01(a);
  if (x < lo - feather || x > hi + feather) return 0;
  if (x < lo) return smooth((x - (lo - feather)) / feather);
  if (x > hi) return smooth(((hi + feather) - x) / feather);
  return 1;
}

// ---------- episodic schedules (the weather licence) ----------
/**
 * A seeded slot schedule, generalising `lightningAt`'s: each `slot` seconds
 * rolls once against `chance`, and a winning slot places its event at a hashed
 * offset inside itself. Returns how long ago it fired (`since`, seconds) or
 * null, so the caller can run any envelope it likes over the top.
 *
 * Checks the previous slot too, so an event near a slot edge keeps decaying —
 * the same fix `lightningAt` needed for the same reason.
 */
export function slotEvent(t, seed, slot = 6, chance = 0.5) {
  const now = Math.floor(t / slot);
  let best = null;
  for (let s = now - 1; s <= now; s++) {
    if (hash01(Math.imul(s, 374761393) + seed * 668265263) >= chance) continue;
    const at = s * slot + hash01(Math.imul(s, 1103515245) + seed * 12345) * slot;
    const since = t - at;
    if (since >= 0 && (best === null || since < best.since)) {
      best = { since, at, roll: hash01(Math.imul(s, 22695477) + seed * 7919) };
    }
  }
  return best;
}

/**
 * The startle envelope (U5): instant attack, fast decay back into flocking.
 * Deliberately shorter than the flash envelope — a bird that takes 1.5 s to
 * stop panicking reads as a bird on a wire in the wind, not a bird that was
 * startled.
 */
export function flushEnv(since, dur = 2.2) {
  if (since < 0 || since > dur) return 0;
  return Math.exp(-since * 2.6);
}

// ---------- W1: warmth, rendered as agreement ----------
// D22 added warmth as a full second harmonic axis and no pixel has ever read
// it. What it means in the music is the third in the chord, whether the tuning
// locks, whether the drums affirm the backbeat — and the common factor of those
// is AGREEMENT: how much the parts consent to each other.
//
// So warmth must not be rendered as colour temperature. `BAND_GRADES` already
// owns warm-vs-cool as a function of altitude (L6), and a second contradictory
// warm/cool would fight it. It is rendered as COHERENCE instead, which is a
// property nothing else in the picture is currently using.
//
// The payoff is the zenith, and it is the reason this function exists. Up there
// brightness keeps climbing while warmth falls off a cliff (bus.js says so in
// as many words), so the camera ascends into more and more light while the
// world stops agreeing with itself. That is awe rather than triumph, and until
// now the eye could not see it at all.
export function coherenceAt(warmth = 0.4) {
  const w = clamp01(warmth);
  return {
    // flocking weights: cold scatters, warm gathers and aligns
    separation: 2.6 - 1.4 * w,
    alignment: 0.35 + 0.75 * w,
    cohesion: 0.03 + 0.09 * w,
    // how much every individual agrees with the shared wind direction, versus
    // wandering on its own. This is the one that reads at a glance in a flock.
    consent: 0.25 + 0.7 * w,
    // colour variance across a population (crowns, leaves): a cold canopy is
    // a hundred different greens, a warm one agrees on a single green
    spread: 0.5 - 0.42 * w,
  };
}

// ---------- W6: the section, spent on the world ----------
// `sectionAt` (D11) reaches the visuals and, since D42 deleted the recurring
// form, drives exactly one thing: the ink style. The styles doctrine resists a
// fifth style and is right to — so the section is spent on the WORLD instead,
// where "spent, not sprinkled" does not apply because a restless animal is not
// a new effect, it is the same animal.
//
// `still` is the interesting one. The breakdown is already the section that
// strips the picture back to its lines (the ink is bound to it); the world
// emptying out UNDER that is the arrangement's own argument, borrowed by the
// eye a second time.
export const SECTION_LIFE = {
  intro: { rate: 0.5, still: 0.35 },   // an empty world, on purpose rather than by accident
  build: { rate: 1.3, still: 0 },
  groove: { rate: 1.0, still: 0 },
  breakdown: { rate: 0.35, still: 0.8 }, // the animals go quiet under the ink
  build2: { rate: 1.7, still: 0 },
  peak: { rate: 2.0, still: 0 },
  release: { rate: 0.9, still: 0.1 },
  seam: { rate: 0.7, still: 0.2 },
};

/** Episodic-rate multiplier and stillness for a section name. */
export function lifeAt(section) {
  return SECTION_LIFE[section] ?? SECTION_LIFE.groove;
}

// ---------- gaits (all CONTINUOUS tier) ----------
/**
 * The sloth's limb cycle, 0..1, for individual `i`.
 *
 * Slow on purpose and slow by argument: this is the thesis of §3.1 rendered as
 * an animal — an integrative motion with all memory and no rhythm, incapable of
 * dancing at 168 BPM and therefore incapable of breaking the ground-stream rule
 * even by accident. The one creature in the world that cannot get this wrong.
 *
 * Note the tension term is INVERSE and weak. A sloth at the drop is not a
 * faster sloth. Refusing to accelerate where everything else in the frame is
 * accelerating is the joke, and it only works if it is exact.
 */
export function slothReach(t, i, T = 0) {
  const period = periodFor(i, 44, 96) * (1 + 0.18 * clamp01(T));
  const start = hash01(i * 40503 + 7);
  const ph = ((t / period + start) % 1 + 1) % 1;
  // most of the cycle is hanging; the reach is a brief, smooth quarter of it
  return ph < 0.75 ? 0 : smooth((ph - 0.75) / 0.25);
}

/** Wingbeat phase for bird `i` — fast, and desynchronised like everything else. */
export function wingbeat(t, i) {
  return phaseFor(t, i, 0.17, 0.29, 3);
}

/**
 * A frog's throat, 0..1. Real frog choruses DO synchronise, and a synchronised
 * chorus is rhythm on the ground stream — so this is the fireflies' deliberate
 * wrongness again, one organ over. Chorus *density* may ride tension; the
 * individual periods may never agree.
 */
export function throatPulse(t, i, seed = 0) {
  const ph = phaseFor(t, i, 1.6, 4.3, seed + 5);
  return Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 3);
}

// ---------- the cast ----------
// Where each creature lives, as data — the same move `TRACK_WEATHER` makes, and
// for the same reason: placement is an authored decision and should be readable
// in one table rather than inferred from five call sites.
//
// The altitude spans are not decorative. `look.js` computes that the four
// tracks' brightness walks land at alt 0.12→0.29, 0.29→0.51, 0.51→0.73 and
// 0.73→0.90, so each band below is written to overlap the track it belongs to
// and to feather out before the next one starts.
export const CAST = {
  // U2 — the undergrowth's gaze CLIMBS (BAND_PITCH[0] = 5.0: "the eye goes to
  // what it does not have", and down there that is light). So the camera spends
  // the first 97 seconds looking up into a band containing trunks and nothing
  // else. A shape hanging in that gaze is the best-placed object in the world.
  // Hung OVERHEAD, not at eye level. The undergrowth camera travels y 7.4–18
  // and its gaze climbs, so a sloth level with the lens is a sloth nobody looks
  // at; from 15–23 it is in the part of the frame that band is already about.
  sloth: { count: 3, lo: 0.05, hi: 0.34, feather: 0.10, y: [16, 22] },
  // …and one more where a sloth actually lives, high in the crowns during the
  // canopy track. Same system, one constant apart.
  slothCrown: { count: 2, lo: 0.48, hi: 0.80, feather: 0.10, y: [34, 43] },
  // U3 — the dart frogs, on the trunks. The brief asked for frogs on the forest
  // floor; the ground there is 20–30 units below the lens and out of frame, so
  // they live on the bark at eye level, which is where a jungle frog is anyway.
  //
  // The band now spans TWO tracks rather than one, and the y range spans the
  // camera's whole climb through them, because these are the only frogs that
  // can be seen for any length of time: the pond chorus below is fenced in by
  // the undergrowth's upward pitch (see `poolfrog`), so if the frogs are to be
  // a presence in this world rather than a detail in one shot, it is this
  // system that has to carry it. `creatures.js` keeps them in the near field as
  // the camera climbs, so the y range is a clamp on the perch, not a scatter.
  treefrog: { count: 12, lo: 0.10, hi: 0.58, feather: 0.09, y: [6, 37] },
  // …and the chorus at the water, which is where `ambfrogs` actually sounds
  // (D16) and where the pool's ripple machinery already is.
  //
  // **This band is short, and it is short for a reason that is not tuning.**
  // The undergrowth's gaze CLIMBS (BAND_PITCH[0] = 5.0), so the bottom of the
  // frame sits ~13° below horizontal, and anything on the ground falls out of
  // it the moment the camera leaves the ground. Projected through the real
  // camera, a chorus on the water reads at 4 frogs of 10 at camera y 2, 0.2 at
  // y 4, and **zero from y 6 up** — and no distance rescues it, because the
  // range that would put a low frog back inside the frame (>20 units) is past
  // the point where the fog has eaten it. Searching the whole placement space
  // (height × radius) against the camera's real travel tops out at 4%.
  //
  // Sitting them from the waterline onto the root arches (y to 5) is what buys
  // the band back: 3.8 frogs at camera y 2 and 2.3 at y 4. The old 0.30 was
  // therefore not a wider band, it was nine animals drawn into a frame that
  // could not contain them — and the ones the eye is meant to find higher up
  // are the dart frogs above, whose band starts exactly where this one stops.
  poolfrog: { count: 10, lo: 0.00, hi: 0.08, feather: 0.06, y: [0.8, 5] },
  // U4 — the canopy flock. 56, not 220: a flock reads as a flock at small
  // counts, and a cloud of 220 birds reads as insects.
  bird: { count: 56, lo: 0.44, hi: 0.82, feather: 0.10, y: [33, 46] },
  // …and one bird alone at the top, circling. The zenith's ambience has no
  // animal in it and its whole argument is scale; a single distant shape is the
  // cheapest way to say how big the air is.
  soarer: { count: 1, lo: 0.68, hi: 1.00, feather: 0.12, y: [48, 58] },
};

/** Population of a cast entry under the quality governor (Y2). */
export function populationFor(spec, quality = 1, floor = 1) {
  return Math.max(Math.min(floor, spec.count), Math.round(spec.count * clamp01(quality)));
}

/**
 * Everything the fauna need from one call, so `biomes.js` samples the schedules
 * once per frame rather than each system re-deriving them.
 *
 * `flush` is the anchored channel (U5) and is passed IN rather than computed
 * here, because it originates in a bus event: this module never subscribes to
 * anything, which is what keeps it pure and testable.
 */
export function faunaAt(env = {}) {
  const { t = 0, seed = 1, alt = 0, warmth = 0.4, section = 'groove', T = 0 } = env;
  const life = lifeAt(section);
  const coh = coherenceAt(warmth);
  // the flock changes its mind on a slot schedule, faster in a build (W6)
  const waypoint = slotEvent(t, seed * 13 + 5, 26 / Math.max(0.3, life.rate), 0.75);
  return {
    life,
    coherence: coh,
    alt,
    T,
    waypoint,
    // one lookup per creature, so a caller can ask "how much sloth is there
    // here" without knowing the table
    presence: {
      sloth: bandWindow(alt, CAST.sloth.lo, CAST.sloth.hi, CAST.sloth.feather),
      slothCrown: bandWindow(alt, CAST.slothCrown.lo, CAST.slothCrown.hi, CAST.slothCrown.feather),
      treefrog: bandWindow(alt, CAST.treefrog.lo, CAST.treefrog.hi, CAST.treefrog.feather),
      poolfrog: bandWindow(alt, CAST.poolfrog.lo, CAST.poolfrog.hi, CAST.poolfrog.feather),
      bird: bandWindow(alt, CAST.bird.lo, CAST.bird.hi, CAST.bird.feather),
      soarer: bandWindow(alt, CAST.soarer.lo, CAST.soarer.hi, CAST.soarer.feather),
    },
  };
}
