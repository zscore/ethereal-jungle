/**
 * generators.js — the machine room (music doc §4).
 *
 * Every generator is a pure function of (bus params, seeded rng) → Strudel pattern.
 * ENGINE DISCIPLINE: generators emit *events with abstract params* (sample slot,
 * note, orbit, dynamics). superdough is merely the current renderer of those
 * events — keep renderer-specific hacks out of here so the whole layer can be
 * re-pointed at SuperDirt/scsynth over OSC without touching composition logic.
 *
 * Orbit map (the stream vector, §3.1): 1 = drums (near/dry), 2 = bass (floor),
 * 3 = pads (far/wet), 4 = lead (far/wet). The kick ducks orbits 3 & 4 — the
 * sidechain is the coupling constant of the whole system (§3.3).
 *
 * D22 — the shapes below are the same for every track; WHO plays them comes
 * from `TRACKS[i].palette` / `.warmth` / `.tuning` in bus.js. That split is the
 * point: variation by re-casting, not by re-coding (§7.3, docs/track_identities.md).
 */
import { makeRng, phraseStateAt, seamVariant, warmthAt, PHRASE_BARS, SEAM_BARS, AMB_CHUNKS } from '../bus.js';
import { modeAt, padVoicing, bassNotes, BASS_DEGREES, leadNotes, degreeToMidi, tune } from './scales.js';

// ---------- Euclidean helper: E(k, n) as a boolean array (Bjorklund) ----------
export function euclid(k, n, rot = 0) {
  const pattern = [];
  let bucket = 0;
  for (let i = 0; i < n; i++) {
    bucket += k;
    if (bucket >= n) { bucket -= n; pattern.push(1); } else pattern.push(0);
  }
  return pattern.map((_, i) => pattern[(i + rot + n) % n]);
}

// ---------- Barlow-ish indispensability weights for a 16-grid ----------
// (true Barlow for 4/4 sixteenths; used to price positions for the permuter)
const INDISPENSABILITY = [
  15, 0, 4, 8, 12, 1, 5, 9, 14, 2, 6, 10, 13, 3, 7, 11,
].map((v) => v / 15);

const ANCHORS = new Set([0, 4, 8, 12]); // downbeat + backbeats: never touched

// D23 — the PICKUPS: the strongest non-anchor slices, the "a" before each beat.
// Displacing one of these is what makes a break sound rearranged rather than
// merely dithered; displacing only the weak slices is inaudible. σ is required
// to move at least one, and they are likelier to be chosen in the first place.
const PICKUPS = [...Array(16).keys()].filter((i) => !ANCHORS.has(i) && INDISPENSABILITY[i] >= 0.5);

// The reachable range of `dissonance`'s raw sum, computed once so the band
// below can be stated in NORMALIZED terms (see permuteBreak on why that mattered).
const D_IDENTITY = INDISPENSABILITY.reduce((a, v) => a + (1 - v) * 0.1, 0) / 16;
const D_MAX = (
  INDISPENSABILITY.reduce((a, v, i) => a + (ANCHORS.has(i) ? (1 - v) * 0.1 : v), 0)
) / 16;

/**
 * §1.1: σ starts as identity; non-anchor positions swap to neighbors with
 * probability w; one segment operation; generate-and-test against a dissonance
 * band derived from w.
 *
 * D23 — this used to test a normalized-looking band (`0.15 + w*0.45`, ±0.18)
 * against a RAW dissonance that only ever spans [0.05, 0.278]. The band was
 * wider than the entire reachable range, so the very first candidate passed
 * every time and σ settled at ~4 of 16 slices nudged by one step — always weak
 * ones, since the anchors are exempt and the pickups were no likelier than the
 * rest. The break sounded like the same break for the whole set. Three fixes:
 * the band is normalized against the real range, at least one pickup must have
 * moved, and the search keeps its closest candidate instead of falling back to
 * the identity — so σ is never the untouched break.
 *
 * The move probabilities carry a FLOOR rather than being `w` outright. A band
 * can only reject; it cannot create movement the generator never proposes, and
 * at a typical w ≈ 0.25 twelve non-anchor slices at p = w proposed about three
 * moves — under the band's own lower edge, so the first candidate always
 * passed. With the floor, σ displaces ~5 slices at rest and ~7 at the seam:
 * still theme-and-variations, but a chop rather than a dither.
 */
export function permuteBreak(w, rng, slices = 16) {
  const target = 0.40 + w * 0.50; // normalized band center rises with wildness
  const band = 0.15;
  let best = null;
  let bestErr = Infinity;
  for (let attempt = 0; attempt < 48; attempt++) {
    const sigma = Array.from({ length: slices }, (_, i) => i);
    for (let i = 0; i < slices; i++) {
      if (ANCHORS.has(i)) continue;
      // the pickups are pulled toward moving: that is where a rearrangement
      // is actually heard, and it is the one place the old permuter never went
      const pMove = INDISPENSABILITY[i] >= 0.5
        ? Math.min(1, 0.45 + w * 1.0)
        : Math.min(1, 0.30 + w * 0.8);
      if (rng() < pMove) {
        const hop = rng() < 0.5 ? -1 : 1;
        const j = Math.min(slices - 1, Math.max(0, i + hop * (1 + Math.floor(rng() * 2))));
        sigma[i] = ANCHORS.has(j) ? sigma[i] : j;
      }
    }
    if (rng() < Math.min(1, w * 1.5)) { // one segment op: reverse or rotate a non-anchor run
      const start = 1 + Math.floor(rng() * (slices - 6));
      const len = 2 + Math.floor(rng() * 3);
      const seg = sigma.slice(start, start + len);
      sigma.splice(start, len, ...(rng() < 0.5 ? seg.reverse() : [...seg.slice(1), seg[0]]));
    }
    if (!PICKUPS.some((i) => sigma[i] !== i)) continue; // inaudible: reject outright
    const err = Math.abs(dissonance(sigma) - target);
    if (err < band) return sigma;
    if (err < bestErr) { bestErr = err; best = sigma; }
  }
  // no fallback to the identity: the closest near-miss still rearranges something
  return best ?? Array.from({ length: slices }, (_, i) => i);
}

/**
 * §1.2: penalize displaced strong positions, reward activity in weak ones,
 * normalized to 0 (the identity) … 1 (every non-anchor slice displaced) so the
 * band in permuteBreak means what it looks like it means.
 */
function dissonance(sigma) {
  let d = 0;
  for (let i = 0; i < sigma.length; i++) {
    const displaced = sigma[i] !== i;
    if (displaced) d += INDISPENSABILITY[i]; // violation felt hardest on strong slots
    else d += (1 - INDISPENSABILITY[i]) * 0.1;
  }
  return (d / sigma.length - D_IDENTITY) / (D_MAX - D_IDENTITY);
}

// ---------- D23: the skeleton's variations ----------
// Beat 1 (kick) and beat 3 (snare) are the metric anchor and never move
// (§1.2) — what varies is what is placed AROUND them. Until now they were two
// literal strings, `bd ~ ~ ~` and `~ ~ sd ~`, identical for all four casts and
// all 68 phrases, with only their gain moving: the groove was one bar repeated
// for eleven minutes. These bags are drawn from once per phrase, weighted by
// section and scaled by the track's own appetite, so the floor varies while
// the anchor everything else is measured against stays exactly where it was.
//
// Positions are 16ths; 0/4/8/12 are the beats, and nothing here occupies the
// two the anchor owns.
/**
 * The named bags, as a library the cast can point at.
 *
 * Each keeps the D23 contract — 16th positions, never on an anchor — and what
 * varies between them is WHERE the weight sits relative to the beat. That was
 * the open question in docs/TODO.md §5, and it is not answerable offline:
 * `test/groove.mjs` proves the figures vary and that the anchors hold still,
 * and says nothing about whether any of it sounds good. `lab.html` auditions
 * these; a track then names the one it wants.
 *
 * `shipped` is the original idiom-chosen bag and remains the default for any
 * track that has not been auditioned yet.
 */
export const KICK_BAGS = {
  shipped: [
    [10],      // the 'and of 3' — the second kick this idiom is built on
    [14],      // a late pickup, leaning into the next bar
    [6],       // pushing the backbeat
    [3, 10],
    [10, 14],
    [6, 11],
    [2, 10],
  ],
  sparse: [[10], [14], [6], [10], [3], [11], [10]],
  busy: [[3, 10], [6, 11], [2, 10, 14], [10, 14], [3, 6, 11], [6, 10, 14], [2, 6, 11]],
  // everything on the 'a' before a beat: leans forward, pulls the bar early
  pushed: [[3], [7], [11], [15], [3, 11], [7, 15], [3, 7, 11]],
  // everything just after a beat: drags, sits behind the anchor
  laidback: [[1], [5], [9], [13], [1, 9], [5, 13], [9, 13]],
};

export const SNARE_BAGS = {
  shipped: [[13], [7], [7, 13], [3, 11], [11, 14], [5, 13], [7, 10, 13]],
  sparse: [[13], [7], [11], [13], [5], [7], [13]],
  busy: [[7, 10, 13], [3, 7, 11], [5, 7, 13], [7, 11, 14], [3, 7, 11, 14], [5, 9, 13], [7, 10, 13, 15]],
  pushed: [[3], [11], [3, 11], [7, 15], [3, 7, 11], [11, 15], [3, 15]],
  laidback: [[5], [9], [13], [9, 13], [1, 5, 9], [5, 9], [9, 14]],
};

// back-compatible names for the shipped bags
export const KICK_EXTRAS = KICK_BAGS.shipped;
export const SNARE_GHOSTS = SNARE_BAGS.shipped;

/**
 * The lab's override. Null means "use the track's own bag", which is what
 * production always does — a track names its bag in `TRACKS[i].palette`, next
 * to the density that scales it. `lab.html` sets these to force ONE bag across
 * every track so candidates can be A/B'd without the cast getting in the way.
 */
export const GROOVE_BAGS = { kick: null, snare: null };

/** Resolve which bag a track draws from: lab override, else its cast, else shipped. */
const bagFor = (library, override, name) => override ?? library[name] ?? library.shipped;

// How much filling-in each section wants: the intro keeps the heartbeat bare,
// the peak fills in. Form decides, tension only shades — same rule as D11.
const SKEL_LIFT = { intro: 0.2, build: 0.5, groove: 0.95, build2: 0.85, peak: 1, release: 0.7 };

// WHICH bars of the phrase get the extras. Without this the placement drawn
// for a phrase lands in all four of its bars and the fix reproduces the bug it
// was meant to solve, one scale up: the same bar, four times. `[0 0 0 1]/4` is
// the turnaround, `[0 1 0 1]/4` the every-other-bar lean. Same /4 trick the
// drop slam and the countdown roll use — absolute cycle mod 4 is bar-in-phrase.
const SKEL_MASKS = [
  '[1 1 1 1]/4', '[0 1 0 1]/4', '[0 0 0 1]/4',
  '[1 0 1 1]/4', '[0 1 1 1]/4', '[1 1 0 1]/4',
];

// ---------- the seam fill ----------
// The countdown into a clean downbeat used to be `sd sd*2 sd*4 sd*8` under a
// rising gain ramp: a pure power-of-two doubling, which is the most generic
// build in dance music and reads as a stock preset rather than as this set's
// own gesture. Three things were wrong with it, and the bags below fix all
// three:
//
//   1. **It doubled cleanly.** Every subdivision was 2^n, so the ear predicted
//      the whole figure from its first two bars. These accelerate unevenly —
//      triplet groupings, syncopations — so the arrival is still a surprise.
//   2. **It was solid to the very last 16th.** A wall of snare straight into
//      the downbeat leaves the drop nothing to do. §5's expectation machinery
//      wants a *hole*: two of these three stop early, and the silence is what
//      makes the next bar land.
//   3. **It was the same every time.** One figure, every seam, for eleven
//      minutes. The choice is now keyed to which track we are entering, mixed
//      with the seed, so a set has variety and a reroll re-deals it.
//
// Each entry is four top-level groups — one per bar under `.slow(4)` — so the
// figure stays bar-exact into the new downbeat (D9).
// D36 — and then the whole bag was turned around. These used to ACCELERATE
// into the boundary, because the seam was a build; the figures below decelerate,
// because it is now a wind-down (bus.js `tensionAt` carries the argument). Each
// still obeys the two rules the D10 rewrite established — nothing doubles
// cleanly, and the last 16th before the downbeat is empty — but the energy runs
// the other way: dense first bar, thinning bars after it, gains falling,
// filters closing. The figure is a hand coming off the fader, not onto it.
// D38 — and then a fourth thing was wrong, which no amount of re-figuring a
// snare roll could fix: **every one of them was a snare roll.** Four different
// rhythms played on the same drum for the whole set is one gesture with four
// spellings, and by the third boundary the ear has stopped hearing the figure
// and started hearing the instrument. So the bag is no longer a set of figures;
// it is a set of *materials*, and the three added here are not percussion:
//
//   - **the tape stop** — the break itself, decelerating. The loudest thing in
//     the arrangement is the thing that dies, and it dies by slowing down
//     rather than by thinning out. Nothing else in the set changes `speed` over
//     time, which is exactly why it reads as an ending.
//   - **the descent** — pitched. A line falling through the mode to the root,
//     in the drums' own near room. The one fill that says where we are going
//     harmonically instead of only that we are leaving.
//   - **the downpour** — the biome's own texture, chopped. The band walks off
//     and the *place* is what is left holding the rhythm; it is the outgoing
//     track's ambience accent (§3.4's weather promoted to figure for four
//     bars), so the undergrowth leaves through its leaf rustle and the zenith
//     through its sparkle.
//
// Each entry declares its `voice`, and `seamFillLayer` knows how to dress it.
// The rules the earlier rewrites established still bind every entry, whatever
// it is made of: nothing doubles cleanly, the last 16th before the downbeat is
// empty, and gains and filters fall bar by bar.
//
// `fig` is four top-level groups — one per bar under `.slow(4)` — so the figure
// stays bar-exact into the new downbeat (D9). `x` is a hit; for the pitched
// voice the integers are degrees of the mode, high to low.
/**
 * R1 — the turnaround: what happens in the last bar of a phrase.
 *
 * The gap this closes is embarrassing once counted. In 389 seconds the only
 * non-loop gestures anywhere are the seam fill, the peak's gain slam, the
 * build2 dropout bar, the hoover, the dub bloom and the D18 landing. Every
 * other phrase simply stops and the next one starts: **240 phrase endings per
 * pass with nothing on any of them.** Phrase-final fills are the most ordinary
 * device in this music and the set had none.
 *
 * These are one-bar snare figures in the same notation `SEAM_FILLS` uses, so
 * `hits()` dresses them and the same reading applies. They are drawn per phrase
 * from a hashed rng (never the shared one — a draw there re-deals every layer
 * downstream), and gated by a per-section appetite: the groove turns around
 * rarely because it is the reference state everything else is legible against,
 * build2 and release almost always, because one is pushing and the other is
 * letting go and both are about arriving somewhere else.
 */
export const TURNAROUNDS = [
  { name: 'the nudge',    fig: '~ ~ ~ [x x]',            gain: 0.5,  lpf: 3200 },
  { name: 'the double',   fig: '~ ~ [x x] [x x]',        gain: 0.55, lpf: 3600 },
  { name: 'the stumble',  fig: '~ [x ~ x] ~ [x x x]',    gain: 0.5,  lpf: 3000 },
  { name: 'the pull',     fig: '~ ~ [~ x] [x [x x]]',    gain: 0.58, lpf: 4000 },
  { name: 'the roll',     fig: '~ ~ ~ [x x x x]',        gain: 0.52, lpf: 2600 },
  { name: 'the answer',   fig: '~ [~ ~ x] ~ [x ~ x ~]',  gain: 0.46, lpf: 3400 },
  { name: 'the drag',     fig: '~ ~ [x ~ ~ x] [~ x ~ ~]', gain: 0.44, lpf: 2400 },
];

/**
 * R3 — drop variants. `section_ideas.md` asks for these by name and D18's own
 * "revisit when" note points at them: *same arrival, different content* (§5 —
 * predictable time, withheld content). The drop bar was one thing, a full slam,
 * in all four tracks and on every seed.
 *
 * Which layers are allowed into the drop bar itself. The skeleton is never
 * masked — the pulse is the promise being kept, and withholding it would read
 * as a fault rather than as a choice. What gets withheld is content.
 *
 *   slam         everything at once (what the set did before)
 *   break-first  the drums land, the floor floods in a bar later
 *   floor-first  the bass lands naked, the break answers it
 *   late         kick alone for a bar, then the whole arrangement
 *
 * Drawn per track per set, so a listener who hears the set twice hears the same
 * four drops — the same idiom as `seamVariant`, and for the same reason: a
 * variant that changes every pass is noise, not form.
 */
export const DROP_VARIANTS = [
  { name: 'slam',        break: null,          bass: null },
  { name: 'break-first', break: null,          bass: '[0 1 1 1]/4' },
  { name: 'floor-first', break: '[0 1 1 1]/4', bass: null },
  { name: 'late',        break: '[0 1 1 1]/4', bass: '[0 1 1 1]/4' },
];

export function dropVariantFor(trackIndex, seed) {
  const rng = makeRng(((seed ^ 0xd80b) + trackIndex * 6151) >>> 0);
  return DROP_VARIANTS[Math.floor(rng() * DROP_VARIANTS.length)];
}

/**
 * R4 — where the set shuts up. One entry per section, applied to everything
 * `gate()` touches (the drums, the floor, the cast — never the pad, which is
 * the continuity layer and survives every hole by design).
 */
const HOLES = {
  // Both land in the LAST QUARTER of an inner bar, and that placement is not
  // arbitrary. It has to miss two things: beat 3, because the backbeat is an
  // anchor and a form whose anchors come and go is not legible (§1.2 — and
  // test/groove.mjs enforces it); and bar 3, because that is where R1 puts the
  // turnaround. So the phrase gets a gap and then a fill answering it, rather
  // than a fill falling into its own hole.
  release: '[1 1 [1 1 1 0] 1]/4',
  build2:  '[1 [1 1 1 0] 1 1]/4',
};

/**
 * T4 — near-stream level per section. Not a mastering move: it is the shape of
 * the form stated in the one dimension a listener reads without being taught,
 * and it is what makes the peak an arrival rather than a label.
 */
const SECTION_WEIGHT = {
  intro: 1, build: 0.88, groove: 0.9, breakdown: 1,
  build2: 0.95, peak: 1.1, release: 0.86,
  // the seam matches the release it follows: D36 made this window a wind-down,
  // and a break that steps UP on the way into it undoes that in one bar
  seam: 0.86,
};

/** How often a section wants its phrases turned around, and how hard. */
const TURN_LIFT = {
  intro: 0, build: 0.45, groove: 0.3, breakdown: 0.15,
  build2: 0.9, peak: 0.6, release: 0.85, seam: 0,
};

/**
 * Draw a phrase's turnaround, or null. Deterministic in (seed, phraseIndex) and
 * hashed away from the shared stream, the `squawkLayer` idiom.
 */
export function turnaroundFor(phraseIndex, seed, sec) {
  const lift = TURN_LIFT[sec] ?? 0.3;
  if (lift <= 0) return null;
  const rng = makeRng(((seed ^ 0x7a17) + phraseIndex * 2311) >>> 0);
  if (rng() > lift) return null;
  return TURNAROUNDS[Math.floor(rng() * TURNAROUNDS.length)];
}

export const SEAM_FILLS = [
  {
    name: 'the outbreath', voice: 'snare',
    fig: '[x [x x] x [x x]] [x ~ [x x] x] [~ x ~ [x ~]] [x ~ ~ ~]',
    gain: [0.86, 0.66, 0.48, 0.3],
    lpf: [4000, 2800, 1800, 1000],
  },
  {
    name: 'the stagger', voice: 'snare',
    fig: '[[x x x] ~ [x x] x] [~ x [x x] ~] [x ~ ~ x] [~ ~ x ~]',
    gain: [0.8, 0.62, 0.46, 0.28],
    lpf: [3600, 2500, 1600, 900],
  },
  {
    name: 'letting go', voice: 'snare',
    fig: '[x [x x] [x x x] ~] [x ~ x ~] [~ ~ [x x] ~] ~',
    gain: [0.82, 0.58, 0.36, 0.2],
    lpf: [3400, 2200, 1300, 700],
  },
  {
    // was DISSOLVE_FILL — see `seamFillFor`. Its levels are written here at
    // landing strength; the dissolve's own deepening puts them back where D18
    // had them (0.7 → 0.26, 2600 → 480 Hz).
    name: 'the withdrawal', voice: 'snare',
    fig: '[x ~ x ~] [x ~ [x x] ~] [[x x] ~ [x x x] ~] [[x x x] ~ ~ ~]',
    gain: [0.85, 0.67, 0.49, 0.32],
    lpf: [4700, 2700, 1550, 870],
  },
  {
    // Slice indices into the outgoing track's own break costume. The figure
    // thins AND the transport drags: by the last bar the loop is playing at
    // 0.38× — five semitones down and two and a half times too slow — which is
    // a machine being switched off, not a drummer playing quieter.
    //
    // Bar 1 is all sixteen slices because that is the only density at which the
    // break is CONTINUOUS: a slice of a one-bar recording is 1/16 of a bar, so
    // at speed 1 a 16-step bar plays gapless and anything sparser is isolated
    // stabs with silence between them. The first cut of this figure was four
    // slices a bar and read as a broken loop rather than a running one — you
    // cannot hear a machine slow down if it was never up to speed. Hits then
    // go 16 → 7 → 3 → 1 (no clean doubling), and because the slots stay 1/16
    // while `speed` falls, each slice starts overrunning the next: 0.089 s of
    // audio in an 0.089 s slot at bar 1, 0.235 s of it by bar 4. The smear IS
    // the drag, and the thinning is what keeps it out of the hole.
    name: 'the tape stop', voice: 'break',
    fig: '[0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15] '
       + '[0 ~ 2 3 ~ 5 ~ ~ 8 9 ~ ~ 12 ~ ~ ~] '
       + '[0 ~ ~ ~ ~ 5 ~ ~ ~ ~ ~ 11 ~ ~ ~ ~] '
       + '[2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~]',
    speed: [1, 0.82, 0.6, 0.38],
    gain: [0.8, 0.62, 0.44, 0.26],
    lpf: [5200, 3300, 1900, 950],
  },
  {
    // Degrees of the mode (indices into leadNotes at octave 0 — between the
    // bass and the pad, so it occupies a register the seam has just emptied),
    // walking down to the root and arriving on it in the last bar. The rhythm
    // decelerates with the pitch: four notes, two, one, one.
    name: 'the descent', voice: 'pitch',
    fig: '[6 5 ~ 4] [~ 3 ~ 2] [~ ~ 1 ~] [0 ~ ~ ~]',
    gain: [0.5, 0.4, 0.32, 0.24],
    lpf: [2400, 1500, 900, 520],
  },
  {
    // Grains of the outgoing biome's accent recording, gated onto the grid and
    // then let go. `begin` moves per bar so the four bars are four different
    // moments of the field recording rather than one 200 ms stutter.
    name: 'the downpour', voice: 'weather',
    fig: '[x ~ [x x] x] [x ~ ~ x] [~ x ~ ~] [x ~ ~ ~]',
    begin: [0.07, 0.61, 0.29, 0.83],
    gain: [0.62, 0.46, 0.32, 0.18],
    lpf: [6000, 3400, 1900, 1000],
  },
];

/** Per-bar automation under `.slow(4)`: one value per bar of the fill. */
const perBar = (arr) => `[${arr.join(' ')}]`;

/** Dress a figure's hits in a sound. */
const hits = (fig, snd) => fig.replaceAll('x', snd);

/**
 * The biome texture a `weather` fill chops: the outgoing track's LAST ambience
 * layer. Two reasons it is the last one and not the bed or a middle accent.
 *
 * Not the bed, because the bed is already foregrounded through the late seam
 * (`foreground` below) — chopping it would only double what is already there,
 * where an accent may well have been resting, which is what makes it arrive as
 * a gesture.
 *
 * Not a middle accent, because in every one of the four biomes the last layer
 * is the **texture** and the middle ones are the **creatures** — glint, drips,
 * leaves, sparkle against frogs, thunder, the piha, the shimmer. D31 is the
 * standing lesson here: gating an animal onto a 16th grid is how you turn a
 * recording of a bird into a sampler playing a bird, and the verdict on that
 * was "horrendous". Textures survive being cut up; creatures do not.
 */
export const seamFillWeather = (ambience = []) =>
  ambience.slice(1).pop() ?? ambience[0] ?? 'ambwind';

/** The material classes, in the order they rotate through a set. */
export const FILL_VOICES = ['snare', 'break', 'pitch', 'weather'];

/**
 * Which fill a boundary gets: keyed to the track being entered, mixed with the
 * seed, so the set varies and a reroll re-deals it. Pure — no draw from the
 * phrase `rng`, which would shift every seeded decision downstream.
 *
 * **The material rotates; only the figure is drawn.** A flat draw over the bag
 * is the wrong shape for this decision: with four snare figures in seven, the
 * default seed dealt snare rolls to three of the set's four boundaries, which
 * is the complaint the new material exists to answer arriving again by luck.
 * Rotating `toIndex` through the voices instead guarantees that no two
 * boundaries in a set are made of the same thing — a four-track set hears the
 * break stop, a line fall, the biome chopped and exactly one snare roll — and
 * the seed still chooses where the rotation starts and which snare figure it is.
 *
 * D38 — BOTH flavors draw from this one bag now. D18 gave the dissolve its own
 * private figure, but D36 already took the figure-level difference away when it
 * made both flavors wind down: what separates a landing from a dissolve is how
 * the boundary is *met* (an impact and a root pedal, versus nothing at all),
 * not which snare roll got there. Keeping a second bag would have meant half
 * the boundaries in a set never hearing the new material.
 */
export const seamFillFor = (toIndex, seed) => {
  const rot = Math.abs(strHash(`fillvoice:${seed}`)) % FILL_VOICES.length;
  const voice = FILL_VOICES[(((toIndex + rot) % FILL_VOICES.length) + FILL_VOICES.length) % FILL_VOICES.length];
  const bag = SEAM_FILLS.filter((f) => f.voice === voice);
  return bag[Math.abs(strHash(`fill:${toIndex}:${seed}`)) % bag.length];
};

/**
 * The sound a fill's figure will be made of, given the track that is exiting.
 * Exported because it is the only way to know what to listen for: the test and
 * the probe both need it, and re-deriving it would be a second source of truth.
 */
export function seamFillSound(fill, track = {}) {
  const pal = track.palette ?? {};
  switch (fill.voice) {
    case 'break': return pal.break?.s ?? 'jbreak';
    case 'pitch': return pal.bass?.s ?? 'sawtooth';
    case 'weather': return seamFillWeather(track.ambience);
    default: return pal.snare?.s ?? 'sd';
  }
}

/**
 * Render a fill. The dissolve is a *treatment* applied here rather than a
 * separate figure (D38): quieter, darker, and drowning further as it goes,
 * where a landing keeps a little air so the hole is audibly a hole.
 */
function seamFillLayer(ctx, fill, { snd, notes, brk = {}, rs, deep }) {
  const { s, note } = ctx;
  const gain = perBar(fill.gain.map((v) => +(v * (deep ? 0.82 : 1)).toFixed(3)));
  const lpf = perBar(fill.lpf.map((v) => Math.round(v * (deep ? 0.55 : 1))));
  let pat;
  switch (fill.voice) {
    case 'break': {
      // the costume's TEXTURE only — its speed, filter and room are per-track
      // constants and this figure automates all three itself
      let x = s(snd).slice(16, fill.fig)
        .speed(perBar(fill.speed.map((v) => +(v * (brk.speed ?? 1)).toFixed(3))));
      if (brk.crush) x = x.crush(brk.crush);
      if (brk.coarse) x = x.coarse(brk.coarse);
      if (brk.shape) x = x.shape(brk.shape);
      if (brk.hpf) x = x.hpf(brk.hpf);
      pat = x;
      break;
    }
    case 'pitch':
      pat = note(fill.fig.replace(/\d+/g, (d) => fmt(notes[Math.min(notes.length - 1, +d)])))
        .s(snd).attack(0.004).decay(0.5).sustain(0.12).release(0.5);
      break;
    case 'weather':
      pat = s(hits(fill.fig, snd)).begin(perBar(fill.begin)).attack(0.004).release(0.09);
      break;
    default:
      pat = s(hits(fill.fig, snd));
  }
  return pat
    .gain(gain).lpf(lpf)
    .room(deep ? '[0.3 0.5 0.7 0.9]' : 0.18).roomsize(rs(1)).roomlp(rs.lp(1)).roomdim(rs.dim(1)).roomfade(rs.fade(1))
    .slow(4).orbit(1);
}

// ---------- D35: one room per orbit ----------
// `roomsize` is a property of the ORBIT, not of the event: superdough keeps one
// reverb per orbit and REGENERATES its impulse response whenever an event asks
// for a different size (superdoughoutput.mjs `getReverb`). Every track was
// asking for two or three sizes on the same orbit — the canopy's ether orbit
// alternated 8, 9 and 11 about five hundred times a track — so the reverb was
// rebuilding an impulse of up to twelve seconds of noise, over and over, and
// the tail length depended on whichever layer had spoken last.
//
// So the size of the space is per orbit and per track, and instruments keep
// only their `room` SEND, which is per-event and free. The orbit map is the
// stream vector (§3.1), and this makes it literal: four streams, four rooms,
// each at its own distance.
const ROOM_SIZE = { 1: 3, 2: 3, 3: 9, 4: 6 }; // drums near, ether far

/**
 * Q2 — and what the room is MADE of, which D35 left undone.
 *
 * D35 gave each orbit a size, because superdough rebuilds an impulse response
 * whenever `roomsize` changes and events on one orbit were each demanding a
 * different one. `roomlp`, `roomdim` and `roomfade` are orbit-global in exactly
 * the same way (`superdoughoutput.getReverb` takes all four), so they need the
 * same discipline — and they are what makes a reverb sound like somewhere.
 *
 *   roomlp   the tail's ceiling: how much air the room has
 *   roomdim  damping — high frequencies dying faster than low ones, i.e. how
 *            soft the surfaces are. Leaves and litter are very soft.
 *   roomfade the tail's own attack: how long the reflections take to arrive
 *
 * The default set reads as: drums in a close damped space, the floor tighter
 * still, the ether wide open and slow to arrive. A track overrides any of it
 * with `TRACKS[i].roomChar` — which is where the undergrowth stops being in a
 * small hall and starts being under wet leaves.
 */
const ROOM_CHAR = {
  1: { lp: 6500, dim: 900, fade: 0.12 },  // near: damped, arrives at once
  2: { lp: 4200, dim: 1400, fade: 0.08 }, // the floor: tightest, darkest
  3: { lp: 9500, dim: 260, fade: 0.45 },  // the ether: open, slow, undamped
  4: { lp: 8000, dim: 420, fade: 0.30 },  // the lead's air, between the two
};

/**
 * The room a track puts an orbit in: cast data (`TRACKS[i].rooms`) or default.
 * `rs(orbit)` is still the size, so every existing call site reads the same;
 * `rs.lp/.dim/.fade` carry Q2's character. They hang off the same function on
 * purpose — the layer builders already take `rs`, and a room whose size and
 * surfaces are decided in two different places is how they drift apart.
 */
const roomsFor = (voice) => {
  const rs = (orbit) => voice.rooms?.[orbit] ?? ROOM_SIZE[orbit] ?? 4;
  const char = (key) => (orbit) => voice.roomChar?.[orbit]?.[key] ?? ROOM_CHAR[orbit]?.[key] ?? ROOM_CHAR[3][key];
  rs.lp = char('lp');
  rs.dim = char('dim');
  rs.fade = char('fade');
  return rs;
};

// ---------- D32: the squawk (was D31's tom kit) ----------
// The same three croaks (tools/ingest_toms.py), and nothing else survives of
// D31: transposing a 1450 Hz bird down to 220 Hz to make a tom sounded, in the
// verdict that killed it, horrendous — a growl, not a drum. What the material
// is actually good at is being a bird, so it is one: a single call over the
// canopy at a steady interval, near its own pitch, at the back of the room.
//
// Speeds stay close to 1: this is a bird that is *near or far*, not a bird that
// has been detuned. A hair up reads as a smaller bird, a hair down as a larger
// one, and that is the whole range the ear will accept before it hears a
// sampler instead of an animal.
const SQUAWK_SPEEDS = [0.86, 0.94, 1.0, 1.09, 1.18];

// Where in the bar a call may land: off the beat, always. A bird that lands on
// the downbeat is playing in the band, and this one is in the trees.
const SQUAWK_AT = [3, 5, 6, 7, 10, 11, 13, 14];

/**
 * The squawk (canopy). One call every `every` phrases — a steady interval, so
 * it reads as punctuation — but the bar it lands in, the 16th inside that bar,
 * which croak, its pitch and its position in the field are all drawn per
 * phrase, so the interval never becomes a metronome.
 *
 * On the ether orbit and drowned, not on the drums: it is weather (§3.4), which
 * is also why it keeps playing through the intro and the breakdown where the
 * percussion does not. Returns null on the phrases between calls.
 */
function squawkLayer(ctx, sq, seed, phraseIndex, rs) {
  const { s } = ctx;
  const every = Math.max(1, sq.every ?? 2);
  if (((phraseIndex % every) + every) % every !== 0) return null;
  // Its OWN rng, hashed from the phrase, rather than draws off the arrangement's
  // stream — the same trick SEAM_FILLS uses. Two reasons: a call that took five
  // draws would shift every seeded decision made after it, and drawing at a
  // fixed point in a per-phrase stream correlates across phrases (the first
  // version put four of eight calls on the same 16th).
  const rng = makeRng(strHash(`squawk:${phraseIndex}:${seed}`));
  const bar = Math.floor(rng() * PHRASE_BARS);
  const at = SQUAWK_AT[Math.floor(rng() * SQUAWK_AT.length)];
  const speeds = sq.speeds ?? SQUAWK_SPEEDS;
  const speed = speeds[Math.floor(rng() * speeds.length)];
  const n = Math.floor(rng() * (sq.samples ?? 3));
  const bars = Array.from({ length: PHRASE_BARS }, (_, i) => (i === bar ? 1 : 0));
  return steps(s, sq.s ?? 'toucan', [at])
    .n(n)
    .speed(speed.toFixed(3))
    // No release and sustain 1: superdough hands a sample the *hap's* duration
    // whenever `release` is set (89 ms at this tempo), which would clip the call
    // in half. Left alone the call plays out, and the ingest already put a fade
    // on its tail.
    .attack(0.004).decay(0.1).sustain(1)
    .lpf(sq.lpf ?? 5200)                       // distance takes the top off
    .room(sq.room ?? 0.5).roomsize(rs(sq.orbit ?? 3)).roomlp(rs.lp(sq.orbit ?? 3)).roomdim(rs.dim(sq.orbit ?? 3)).roomfade(rs.fade(sq.orbit ?? 3))
    .pan(0.15 + rng() * 0.7)                   // anywhere in the canopy
    .gain(sq.gain ?? 0.3)
    .mask(`[${bars.join(' ')}]/4`)             // absolute cycle mod 4 = bar-in-phrase
    .orbit(sq.orbit ?? 3);
}

// ---------- pad motion ----------
// How much the ether moves, by section. The complaint this answers is that the
// background chords sit still for minutes at a time in the opening sections —
// which is exactly where the arrangement is thinnest, so a static pad is most
// exposed there and least excusable. Inverted against density on purpose: the
// bare sections get the most movement, the full ones the least, because by the
// peak there is plenty else going on and a wandering pad would just be mud.
const PAD_MOTION = {
  intro: 1, build: 0.9, breakdown: 0.8, release: 0.6, build2: 0.4, groove: 0.35, peak: 0.25,
};

/**
 * N5 — chord changes per phrase, by section. Faster harmonic rhythm reads as
 * drive without a single new note (§2's stasis survives: same mode, same root).
 * The ambient sections stay at one and the two sections that are supposed to
 * push get two, which is the whole shape of the device — a phrase that changes
 * chord twice arrives somewhere, and a phrase that does not is waiting.
 */
const HARM_RHYTHM = {
  intro: 1, build: 1, groove: 1, breakdown: 1, build2: 2, peak: 2, release: 1, seam: 1,
};

/** Draw a placement set and the bars it falls on, or null for a bare phrase. */
function placements(bag, density, lift, rng) {
  if (density <= 0 || rng() > density * lift) return null;
  return {
    at: bag[Math.floor(rng() * bag.length)],
    mask: SKEL_MASKS[Math.floor(rng() * SKEL_MASKS.length)],
  };
}

/** A 16-step pattern sounding `snd` at the given positions and nowhere else. */
function steps(s, snd, positions) {
  const set = new Set(positions);
  return s(Array.from({ length: 16 }, (_, i) => (set.has(i) ? snd : '~')).join(' '));
}

// ---------- ambience presence walks (D16) ----------
function strHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Slow 0..1 walk per (layer, seed), sampled at phrase scale: smoothstep value
 * noise with one cell ≈ 3 phrases, so accent layers surface in episodes of
 * ~30–50 s and fade over phrases rather than switching. Keyed to the absolute
 * phrase index — deterministic across recompiles, never looping with the set.
 */
export function layerPresenceAt(name, phraseIndex, seed) {
  const cell = (i) => makeRng(((seed ^ strHash(name)) + i * 131) >>> 0)();
  const x = phraseIndex / 3;
  const i = Math.floor(x), f = x - i, sm = f * f * (3 - 2 * f);
  return cell(i) * (1 - sm) + cell(i + 1) * sm;
}

// ---------- the lead: contour-then-quantize + the 80/20 motif bag (§3, §5) ----------
// ONE melodic cell for the whole set (§6.4): recalled under transformation
// across tracks, it converts a sequence of tracks into an argument. Every
// characteristic instrument added by D22 states THIS cell — new faces, no new
// tunes; that is what keeps four casts sounding like one piece.
// Exported only so it can be *checked against* — `src/visuals/motif.js` keeps
// its own copy (the visuals import nothing from the music) and `test/motif.mjs`
// fails if the two ever drift apart. Nothing reads this at runtime.
export const MOTIF = [0, 2, 1, 4, 3, 2, 4, 0]; // scale-degree offsets — the set's single cell

const TRANSFORMS = [
  (m) => m,                                        // literal recall
  (m) => [...m].reverse(),                         // retrograde
  (m) => m.map((d) => 4 - d),                      // inversion about the cell's center
  (m, rng) => { const r = 1 + Math.floor(rng() * (m.length - 1)); return m.map((_, i) => m[(i + r) % m.length]); }, // rotation
  (m, rng) => m.map((d) => d + (rng() < 0.5 ? 1 : 2)), // diatonic transposition
  // AD15 — fragmentation: the first three notes, augmented — the cell
  // remembered in pieces, the way the granular ghost remembers the break.
  // Diet-only: no track draws it unless its palette asks (the zenith's does).
  (m) => m.slice(0, 3).flatMap((d) => [d, d]),
];

// AD15 — the standard bag: everything except fragmentation, which is a
// dissolution device and must be asked for by name.
const TRANSFORM_DIET = [0, 1, 2, 3, 4];

/**
 * §3 contour-then-quantize: 80% a transformation of the motif, 20% a fresh
 * smooth contour. Shape is generated apart from pitch set, so mode changes
 * re-color a held shape — motivic identity surviving harmonic change.
 *
 * AD15 — `diet` (indices into TRANSFORMS) authors the variation POLICY per
 * track: the cell was varied identically in minute 1 and minute 11, so the
 * motif had a distribution but no arc. Undergrowth barely dares move it,
 * the canopy is permitted everything, the zenith remembers it in pieces —
 * exposition, development, permission, dissolution.
 */
export function leadContour(rng, w, diet = TRANSFORM_DIET) {
  if (rng() < 0.8) {
    const tf = TRANSFORMS[diet[Math.floor(rng() * diet.length)] ?? 0];
    return tf(MOTIF, rng);
  }
  // fresh material: a bounded smooth walk (novelty budget, §5)
  const out = [];
  let v = Math.floor(rng() * 5);
  for (let i = 0; i < 8; i++) {
    v = Math.max(0, Math.min(6, v + Math.floor(rng() * 3) - 1));
    out.push(v);
  }
  return out;
}

// ---------- D22: the per-track cast ----------
// Small helpers, all of the same shape: a palette slice in, one pattern out.
// Nothing here knows which track it is playing for — that is the whole idea.

const fmt = (n) => n.toFixed(3); // fractional MIDI: cents are just decimals

/**
 * The break's costume (palette.break). Same σ, same slices, different drummer:
 * degradation and room for the undergrowth, speed and snap for the forest
 * floor, nothing at all for the canopy, and a high-passed reversed drowning for
 * the zenith, where the drums stop having bodies.
 */
function costume(pat, bp = {}, rs, weather = 0) {
  let x = pat;
  if (bp.speed) x = x.speed(bp.speed);
  if (bp.reverse) x = x.sometimesBy(bp.reverse, (y) => y.speed(-(bp.speed ?? 1)));
  if (bp.lpf) x = x.lpf(Math.round(bp.lpf * (1 + (bp.lpfDrift ?? 0) * weather)));
  if (bp.hpf) x = x.hpf(bp.hpf);
  // Q3 — the grit wanders. A constant `crush` is a decision about the sample
  // rate; a crush that drifts between 6.5 and 9.5 bits over half a minute is a
  // room whose air is changing. Nothing here is rhythmic, which is the rule
  // that makes weather legal on a near-stream layer.
  if (bp.crush) x = x.crush(Math.max(4, bp.crush + (bp.crushDrift ?? 0) * weather));
  if (bp.coarse) x = x.coarse(bp.coarse);
  if (bp.shape) x = x.shape(bp.shape);
  if (bp.room) x = x.room(bp.room).roomsize(rs(1)).roomlp(rs.lp(1)).roomdim(rs.dim(1)).roomfade(rs.fade(1));
  return x;
}

/**
 * The dub rail (forest floor): a dotted-eighth feedback delay against the 4/4
 * (§1.4's cross-rhythm, §9.3's dub). Applied to the SNARE and the LEAD only —
 * the two layers whose transients can afford to be answered.
 */
function dub(pat, spec, tension, boost = 0) {
  if (!spec) return pat;
  const [base, span] = spec.feedback ?? [0.34, 0.3];
  const fb = Math.min(0.96, base + span * tension + boost);
  return pat.delay(spec.send ?? 0.45).delaysync(spec.sync ?? 3 / 16).delayfeedback(fb);
}

/**
 * The migrating pluck (§7.2's stream-ambiguous token). One instrument in every
 * track, walking across stream space over the whole set: dry, gridded and on
 * the drum orbit in the undergrowth; drowned, unmetered and on the ether orbit
 * at the zenith. The set's slowest-moving variable.
 */
function pluckLayer(ctx, pk, mode, tuning, rng, rs) {
  const { note } = ctx;
  const scale = leadNotes(mode, pk.oct ?? 0, tuning);
  const mask = euclid(pk.k ?? 3, 16, Math.floor(rng() * 16));
  // strikes land on the break's NON-anchor positions: the pluck fills the holes
  // the skeleton leaves, and never competes with it
  const seq = mask.map((v, i) =>
    (!v || ANCHORS.has(i) ? '~' : fmt(scale[Math.floor(rng() * scale.length)])));
  if (!seq.some((x) => x !== '~')) return null;
  let pat = note(seq.join(' '))
    .s('sine').fmh(pk.fmh ?? 3.5).fmi(pk.fmi ?? 2.2)   // inharmonic ratio = wooden
    .attack(0.002).decay(pk.decay ?? 0.12).sustain(0).release(pk.release ?? 0.14)
    .room(pk.room ?? 0.05).roomsize(rs(pk.orbit ?? 1)).roomlp(rs.lp(pk.orbit ?? 1)).roomdim(rs.dim(pk.orbit ?? 1)).roomfade(rs.fade(pk.orbit ?? 1))
    .gain(pk.gain ?? 0.28)
    .pan(0.35 + rng() * 0.3)
    .orbit(pk.orbit ?? 1);
  // D34 — an optional ceiling. `fmh` 3.5 puts sidebands at 4.5× the fundamental,
  // and in the drowned casts they arrive in a twelve-second room with nothing
  // above them: that is where a wooden knock turns into a ring.
  if (pk.lpf) pat = pat.lpf(pk.lpf);
  if (pk.offGrid) pat = pat.sometimesBy(pk.offGrid, (x) => x.late(1 / 32)); // the grid lock loosens
  if (pk.slow) pat = pat.slow(pk.slow);
  return pat;
}

/**
 * P3 — the stab (forest floor): the genre signifier this set never had.
 *
 * Every layer in the first two tracks is continuous — a break, a walk, a pad,
 * a breath. Nothing punctuates. The stab is the oldest fix in the idiom: the
 * chord already on the pad, struck short on the syncopated eighths, with a
 * filter envelope that snaps shut.
 *
 * That envelope is the point. It is the first use of `lpenv`/`lpdecay` in this
 * project, and it is the mechanism behind most of what "produced" means in this
 * genre — a sound whose brightness has a *shape* rather than a value. Because
 * the decay is short and the resonance is up, the stab reads as **hard** rather
 * than **lit**, which is what lets the forest floor have punctuation without
 * breaking its "wet, not lit" rule (§4.2's forbidden list).
 *
 * It takes the pad's own chord, so it spends no new pitch material and follows
 * N3's planing for free.
 */
function stabLayer(ctx, sb, chord, tension, rng, rs) {
  const { note } = ctx;
  // the syncopated eighths: off the anchors the skeleton holds down, so the
  // stab lands in the holes rather than doubling the backbeat
  const slots = [3, 6, 10, 14];
  const k = Math.max(1, Math.round((sb.k ?? 2) + tension * 1.5));
  const chosen = [];
  for (const i of slots) if (chosen.length < k && rng() < 0.75) chosen.push(i);
  if (!chosen.length) return null;
  const voices = chord.slice(0, sb.voices ?? 4).map(fmt).join(',');
  const seq = [...Array(16).keys()].map((i) => (chosen.includes(i) ? `[${voices}]` : '~')).join(' ');
  return note(seq)
    .s(sb.s ?? 'sawtooth')
    .attack(0.004).decay(sb.decay ?? 0.16).sustain(0).release(0.1)
    // the filter envelope: opens to `lpenv` octaves above the cutoff and shuts
    // inside 90 ms. `fanchor` 0 anchors the sweep at the bottom, so the note
    // starts dark and cracks open rather than starting bright and dulling.
    .lpf(sb.lpf ?? 900).resonance(sb.resonance ?? 11)
    .lpenv(sb.lpenv ?? 2.6).lpattack(0.002).lpdecay(sb.lpdecay ?? 0.09).lpsustain(0).fanchor(0)
    // the NEAR orbit, not the floor's: a stab is a struck, close, dry thing
    // that wants the drums' short room, and the bass orbit is spoken for
    .room(sb.room ?? 0.22).roomsize(rs(1)).roomlp(rs.lp(1)).roomdim(rs.dim(1)).roomfade(rs.fade(1))
    .gain((sb.gain ?? 0.2) * (0.7 + 0.3 * tension))
    .pan(`[0.42 0.58]`)
    .orbit(1);
}

/**
 * P2 — the stridulator (undergrowth): a cricket with a rhythm.
 *
 * The undergrowth's problem was measurable rather than aesthetic: 2–8 kHz was
 * half a percent of the mix, and muting the hats changed that number by zero.
 * The track's brief forbids anything above octave 5, which rules out putting a
 * shimmer up there — so the top end has to arrive as a *creature*, which the
 * lid was never meant to exclude.
 *
 * Band-passed noise at ~3.6 kHz with a very high Q is one stridulating insect;
 * chopping it with a tempo-synced tremolo gives it the pulse a real one has.
 * The first use of superdough's band-pass filter and of `tremolo*` anywhere in
 * this project. It rides `layerPresenceAt`, so it comes and goes in episodes
 * rather than sitting on top of the arrangement — a chorus you notice stopping.
 */
function stridulateLayer(ctx, st, phraseIndex, seed, rs) {
  const { s } = ctx;
  // presence walk, same machinery the ambience accents ride (D16): this is a
  // creature, and creatures are not session players
  if (layerPresenceAt('stridulate', phraseIndex, seed) < (st.threshold ?? 0.42)) return null;
  const mask = euclid(st.k ?? 5, 8, phraseIndex % 8);
  // pink rather than white on purpose: through a Q-22 band-pass the two are
  // indistinguishable, and it leaves "white on the drum orbit is the zenith's
  // hiss and nothing else" true — an invariant test/palette.mjs checks
  const fig = mask.map((v) => (v ? 'pink' : '~')).join(' ');
  if (!mask.some(Boolean)) return null;
  return s(fig)
    .bandf(st.bandf ?? 3600).bandq(st.bandq ?? 22)
    .tremolosync(st.rate ?? 14).tremolodepth(st.depth ?? 0.85)
    .attack(0.01).decay(st.decay ?? 0.18).sustain(0).release(0.12)
    .room(st.room ?? 0.25).roomsize(rs(1)).roomlp(rs.lp(1)).roomdim(rs.dim(1)).roomfade(rs.fade(1))
    .gain(st.gain ?? 0.16)
    .pan(`[${st.pan ?? 0.28} ${1 - (st.pan ?? 0.28)}]`)
    .orbit(1);
}

/**
 * The breath voice (forest floor): bamboo/duduk-ish — a tone with living pitch
 * (vibrato) plus its own band of air on the same envelope. The first thing in
 * the set with a body. Returns [tone, air].
 *
 * The air is a separate layer rather than superdough's `noise` control on the
 * oscillator: that control routes through `drywet`, whose teardown disconnects
 * an oscillator the voice has usually already released — one console error per
 * note. Stacking our own noise costs nothing and lets it be filtered apart.
 */
function breathLayer(ctx, br, mode, tuning, rng, w, diet, tension, rs) {
  const { note, s } = ctx;
  const contour = leadContour(rng, w, diet); // the set's cell, not a new tune
  const scale = leadNotes(mode, br.oct ?? 1, tuning);
  const mask = euclid(3, 8, Math.floor(rng() * 8));
  let ci = 0;
  const seq = mask.map((v) => {
    if (!v) return '~';
    const deg = contour[ci++ % contour.length];
    return fmt(scale[Math.max(0, Math.min(scale.length - 1, deg))]);
  });
  const [lo, span] = br.lpf ?? [1600, 900];
  const g = br.gain ?? 0.26;
  const tone = note(seq.join(' '))
    .s('sine').vib(br.vib ?? 4.5).vibmod(br.vibmod ?? 0.18)
    .attack(0.3).release(1.1)
    .lpf(lo + span * tension)
    .room(0.55).roomsize(rs(4)).roomlp(rs.lp(4)).roomdim(rs.dim(4)).roomfade(rs.fade(4))
    .gain(g).pan(0.45)
    .slow(4).orbit(4); // long tones under the lead's half-time
  const air = s(seq.map((x) => (x === '~' ? '~' : 'white')).join(' '))
    .attack(0.35).release(0.9)
    .hpf(900).lpf(lo + span * tension).resonance(4)
    .room(0.55).roomsize(rs(4)).roomlp(rs.lp(4)).roomdim(rs.dim(4)).roomfade(rs.fade(4))
    .gain(g * (br.noise ?? 0.32)).pan(0.45)
    .slow(4).orbit(4);
  return [tone, air];
}

/**
 * The vowel choir (canopy). The voice is the strongest attractor in the mix, so
 * it is spent exactly once per set — at the golden-ratio climax, and nowhere
 * else. Formant follows brightness: 'a' opening toward 'o' as the light rises.
 */
function choirLayer(ctx, ch, chord, brightness, rs) {
  const { note } = ctx;
  return note(`[${chord.map(fmt).join(',')}]`)
    .s('sawtooth')
    .vowel(brightness > 0.68 ? 'o' : 'a')
    .attack(2.6).release(6)
    .lpf(ch.lpf ?? 1500)
    .room(0.9).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3))
    .gain(ch.gain ?? 0.2).pan(0.5)
    .slow(4).orbit(3);
}

/**
 * The glass bowl (zenith): Chowning-ratio FM over a quartal stack in stretched
 * tuning — inharmonic partials with nothing to resolve to. One strike every two
 * phrases; the sparsest thing in the set.
 */
function bowlLayer(ctx, bw, mode, tuning, rs) {
  const { note } = ctx;
  const voices = [1, 5, 9].map((d) => fmt(tune(degreeToMidi(d, mode, bw.oct ?? 2), tuning)));
  return note(`[${voices.join(',')}]`)
    .s('sine').fmh(bw.fmh ?? 2.76).fmi(bw.fmi ?? 1.6)
    .attack(bw.attack ?? 2.5).release(bw.release ?? 7)
    // D34 — the bowl is the one voice in the set that had NO ceiling, and a
    // 2.76 ratio throws its sidebands to nearly four times the fundamental.
    // Measured (tools/spectrum_probe.mjs): peaks at 2219 and 5001 Hz that were
    // still up 1 dB in the quietest frame of the breakdown — the ring.
    .lpf(bw.lpf ?? 2200)
    .room(0.95).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3))
    .gain(bw.gain ?? 0.17).pan(0.5)
    .slow(8).orbit(3);
}

/**
 * The granular ghost (zenith): the break itself, in grains — half speed, often
 * reversed, drowned, with no skeleton under it. §3.4's timestretch artifact
 * heard as weather, and the audio sibling of the corpus shrine (D25): at the
 * top of the set, the piece plays back its own earlier material as ether.
 */
function ghostLayer(ctx, gh, rng, breakSound, rs) {
  const { s } = ctx;
  const mask = euclid(gh.grains ?? 5, 16, Math.floor(rng() * 16));
  const grid = { snd: [], begin: [], end: [], speed: [], pan: [] };
  for (const v of mask) {
    const b = rng() * 0.88;
    const rev = rng() < (gh.reverse ?? 0.4);
    grid.snd.push(v ? breakSound : '~');
    grid.begin.push(b.toFixed(3));
    grid.end.push((b + 0.05).toFixed(3));
    grid.speed.push(((gh.speed ?? 0.5) * (rev ? -1 : 1)).toFixed(2));
    grid.pan.push(rng().toFixed(2));
  }
  return s(grid.snd.join(' '))
    .begin(grid.begin.join(' ')).end(grid.end.join(' '))
    .speed(grid.speed.join(' ')).pan(grid.pan.join(' '))
    .attack(0.08).release(0.7)
    .lpf(gh.lpf ?? 2200)
    .room(0.95).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3))
    .gain(gh.gain ?? 0.15)
    .slow(2).orbit(3);
}

/**
 * The hoover (canopy, spent once): the rave-lineage lead-weapon on the drop
 * bar. Detuned saws with a downward pitch envelope — 1992, once, never again.
 */
function hooverLayer(ctx, hv, mode, tuning, rs) {
  const { note } = ctx;
  const root = tune(degreeToMidi(1, mode, 1), tuning);
  const voices = [root - 0.07, root, root + 0.07].map(fmt);
  return note(`[${voices.join(',')}]`)
    .s('sawtooth')
    .penv(hv.penv ?? -10).pattack(0.001).pdecay(0.35).pcurve(1)
    .attack(0.01).release(1.4)
    .lpf(2600).resonance(6)
    .room(0.35).roomsize(rs(1)).roomlp(rs.lp(1)).roomdim(rs.dim(1)).roomfade(rs.fade(1))
    .gain(hv.gain ?? 0.3).pan(0.5)
    .mask('[1 0 0 0]/4') // bar 0 of the phrase = the drop
    .orbit(1);
}

/**
 * The set compiler (D9 — bar-exact seams). Returns ONE pattern that covers the
 * whole looping set, keyed to the scheduler's absolute cycle count: cycle c is
 * bar c of the set (mod SET_BARS), phrase floor(c/4). Each phrase's arrangement
 * is compiled lazily and deterministically (seeded by phrase index), so seam
 * phase edges land sample-exactly on phrase lines regardless of when
 * setPattern is called — swapping in a freshly built pattern with the same
 * params yields identical events. `signals` = { tensionAt, brightnessAt }.
 */
export function makeSetPattern(ctx, p, signals) {
  const { Pattern } = ctx;
  const cache = new Map(); // phraseIndex → compiled 1-cycle pattern
  const phrasePattern = (idx) => {
    let pat = cache.get(idx);
    if (!pat) {
      const ps = phraseStateAt(idx);
      const tSample = ps.tStart + 0.01; // just inside the phrase
      const tension = signals.tensionAt(tSample);
      const brightness = signals.brightnessAt(tSample);
      // D22: warmth has no knob — it is form, not performance — so it is read
      // straight from the timeline rather than threaded through `signals`.
      const warmth = (signals.warmthAt ?? warmthAt)(tSample);
      // seed varies per phrase AND per track: each track is a different telling,
      // and the break re-permutes every phrase (§1.1 theme-and-variations)
      const seed = p.seed + idx * 101 + ps.trackIndex * 7919;
      // ambience.seed is the UN-mixed base seed: the presence walks must be
      // continuous across phrases, not re-rolled per phrase like the rng
      // D18: seam flavors key to the UN-mixed seed + boundary — `variant` is
      // how this track's seam will exit, `entryVariant` how it was arrived at
      const seamInfo = {
        ...ps.seam,
        variant: seamVariant(ps.seam.toIndex, p.seed),
        entryVariant: seamVariant(ps.trackIndex, p.seed),
      };
      // D22: who is playing this phrase (data from bus.js TRACKS)
      const voice = {
        warmth,
        // Q3 — the weather, sampled once per phrase. Roughly -1..1, 1/f-weighted,
        // slowest layer ~32 s: it wanders across several phrases rather than
        // flickering per bar, which is the difference between weather and noise.
        drift: (signals.driftAt ?? (() => 0))(tSample),
        palette: ps.track.palette ?? {},
        tuning: ps.track.tuning,
        rooms: ps.track.rooms,          // D35 — one reverb size per orbit
        roomChar: ps.track.roomChar,    // Q2 — …and what its surfaces are made of

        // P0 — the track's own tension range, so gates can ask "how far into
        // THIS track's arc are we" instead of comparing a rescaled curve to an
        // absolute number (see `leadPresent` in buildArrangement)
        floor: ps.track.floor,
        ceiling: ps.track.peak,

        trackIndex: ps.trackIndex,
        barInTrack: ps.barInTrack,
        phraseIndex: idx,
        baseSeed: p.seed,
      };
      pat = buildArrangement(ctx, { ...p, seed }, tension, brightness, seamInfo, ps.section,
        {
          current: ps.track.ambience, incoming: ps.seam.to?.ambience,
          mix: ps.track.ambienceMix, phraseIndex: idx, seed: p.seed,
        },
        voice);
      cache.set(idx, pat);
      if (cache.size > 32) cache.delete(cache.keys().next().value); // bounded over long runs
    }
    return pat;
  };
  return new Pattern((state) => {
    const haps = [];
    for (const span of state.span.spanCycles) { // split at exact bar lines (Fraction math)
      const idx = Math.floor(span.begin.valueOf() / PHRASE_BARS);
      // query at ABSOLUTE time — half-time layers keep their cycle parity
      haps.push(...phrasePattern(idx).query(state.setSpan(span)));
    }
    return haps;
  });
}

/**
 * Build one phrase's arrangement as a stacked 1-cycle pattern.
 * `ctx` provides the pattern-building functions (from @strudel/core controls)
 * so this module stays import-order agnostic. `p` is a bus params snapshot.
 * `brightness` comes from the bus's authored walk; `seam` and `section` come
 * from phraseStateAt — the seam makes the arrangement the seam operator
 * (§6.3), the section (D11) gates which layers exist at all: form is what
 * plays, tension only shades how it plays. `ambience` = { current, incoming }
 * biome bed names (D16) — incoming is used for the seam crossfade. `voice`
 * (D22) is the track's cast: warmth, tuning and palette.
 */
export function buildArrangement(ctx, p, tension, brightness, seam, section, ambience, voice = {}) {
  const { s, note, stack } = ctx;
  const rng = makeRng(p.seed);
  const mode = modeAt(brightness);
  const w = Math.min(1, p.wildness * (0.5 + 0.5 * tension));
  const warmth = voice.warmth ?? 0.4;
  const pal = voice.palette ?? {};
  const tuning = voice.tuning;
  // D35 — one reverb size per orbit, from the cast. Instruments still choose
  // their own SEND (`room`); what they no longer do is each demand a different
  // room and make superdough rebuild the impulse response between them.
  const rs = roomsFor(voice);
  // Q3 — the weather for this phrase: the 1/f walk, roughly -1..1, sampled once
  // per phrase in makeSetPattern. Spent only on parameters where a slow
  // unrepeating wander reads as *air*, never on anything rhythmic.
  const weather = voice.drift ?? 0;

  // ---- section state (D11) ----
  const sec = section?.name ?? 'groove';
  const lastPhraseOf = section ? section.phraseInSection === section.sectionPhrases - 1 : false;
  const firstPhraseOf = section ? section.phraseInSection === 0 : false;
  // bar-level progress through the section is secProgress + j/(4·sectionPhrases)
  const secProgress = section ? section.phraseInSection / section.sectionPhrases : 0;

  // Seam phases (§6.3), bar-exact: the early seam is the EXIT — D36 turned it
  // from an intensification into a wind-down, so the break loosens and the hats
  // ebb instead of rising — and the late seam is where the drums die BEFORE the
  // boundary (§6.1's asymmetry: drums are the strongest stream and must not
  // cross), while the incoming ether is already here via brightnessAt's
  // forward leak.
  const seamEarly = seam?.active && !seam.late;
  const seamLate = seam?.active && seam.late;
  const dissolveExit = seamLate && seam?.variant === 'dissolve';
  // D18: a 'landing' entry makes intro phrase 0 an arrival — boundary slam,
  // root pedal, impact tail — decaying into the pure intro at phrase 1.
  // The intro reads as aftermath, not absence.
  const landingArrival = sec === 'intro' && section?.phraseInSection === 0 &&
    seam?.entryVariant === 'landing';
  // D36 — the exit calms rather than boils. A seam used to add 0.25 of
  // wildness, which chopped the break hardest exactly where the arrangement is
  // now supposed to be letting go; build2 keeps its lift, because a pre-drop
  // IS a build and that is the one place in the form that should still climb.
  const wEff = Math.min(1, Math.max(0, w - (seamEarly ? 0.15 : 0) + (sec === 'build2' ? 0.15 : 0)));

  // D22, spent once: **the silence**. The zenith's release opens with one sine
  // and the wind — the set's only true emptiness — before the loop dives back
  // into the roots. Everything else in this phrase simply does not exist.
  const silent = !!pal.silence && sec === 'release' && firstPhraseOf && !seam?.active;

  // Which layers exist. intro = kick heartbeat + ether; breakdown = ether only
  // (skeleton off ⇒ the break must go too — the anchor rule, §1.2 inverted).
  const ambient = sec === 'intro' || sec === 'breakdown';
  const breakIn = !seamLate && !ambient && !silent;
  const kickIn = !seamLate && sec !== 'breakdown' && !silent;
  const snareIn = !seamLate && !ambient && !silent;
  const bassIn = !seamLate && !ambient && !silent;
  // P0 — tension, normalised into THIS track's own authored range. The set's
  // tension curve is already rescaled per track into [floor, peak], so a gate
  // written against an absolute number silently means something different in
  // every track. It meant the most in the undergrowth, whose peak is 0.70: with
  // a `tension > 0.3` gate and a gain of `(tension - 0.3) / 0.3`, the darkest
  // track in the set sat at gain ≤ 0.12 everywhere except its own peak and was
  // gated off entirely in intro and build. The darkest track having no melody
  // is a bug, not an aesthetic.
  const tSpan = (voice.ceiling ?? 1) - (voice.floor ?? 0);
  const tNorm = tSpan > 0 ? Math.max(0, Math.min(1, (tension - (voice.floor ?? 0)) / tSpan)) : tension;
  const leadPresent = !seamLate && !silent &&
    (sec === 'breakdown' || (tNorm > 0.28 && sec !== 'intro' && sec !== 'build'));
  // the characteristic layers leave with the drums at the late seam: the seam
  // strips to the common tone, whoever is currently playing it (§6.1)
  const castIn = !seamLate && !silent;

  // §5's pre-drop denial: the final bar of build2 is ether-only. The mask is
  // keyed to absolute cycle mod 4 = bar-in-phrase (same trick as the roll).
  const dropout = sec === 'build2' && lastPhraseOf;
  // R3 — which drop this track gets, and therefore what is withheld from its
  // drop bar. Null everywhere except the peak's first phrase.
  const drop = (sec === 'peak' && firstPhraseOf && !silent)
    ? dropVariantFor(voice.trackIndex ?? 0, voice.baseSeed ?? p.seed)
    : null;
  /** Apply a drop variant's mask for one layer family, if it has one. */
  const held = (pat, family) => (drop?.[family] ? pat.mask(drop[family]) : pat);
  /**
   * R4 — holes. `gate` used to serve exactly one caller: the build2 dropout
   * bar. It is a general device and the set's entire silence budget was about
   * six seconds in 389, so it now also carries a per-section HOLES table.
   *
   * Mini-notation nests, so sub-bar holes cost nothing: `[1 1 1 [1 1 0 0]]/4`
   * empties the second half of the phrase's last bar. The release gets one,
   * because a track that is letting go should occasionally stop talking, and
   * the hole lands where R1 would otherwise have put a turnaround — the two
   * read as one gesture, a fill that falls into a gap.
   */
  const hole = HOLES[sec];
  const gate = (pat) => {
    let x = dropout ? pat.mask('[1 1 1 0]/4') : pat;
    if (hole && !seam?.active) x = x.mask(hole);
    return x;
  };

  const layers = [];

  // ---- drums: the break (figure) — sharp, dry, narrow, double-time ----
  if (breakIn) {
    const bp = pal.break ?? {};
    const thin = sec === 'build'; // degraded entry: the break fades in over the build
    const sigma = permuteBreak(wEff, rng);
    // T4 — the drop has to be measurably a drop. Before this the peak summed to
    // 24.3 gain/bar against the groove's 21.7, and the recordings put them 0.7 dB
    // apart: the arrangement announced an arrival the mix did not deliver. The
    // fix is relative, and it is mostly the OTHER sections coming down — a peak
    // that is loud because everything around it is not is how records do this.
    const bg = (bp.gain ?? 1) * (SECTION_WEIGHT[sec] ?? 1);
    // D36 — the exit fades bar by bar. The break is the loudest thing in the
    // arrangement, so a seam that winds down has to be visible here first;
    // `seam.progress + j/SEAM_BARS` is the window's own clock, which keeps the
    // ramp falling across the phrase line rather than restarting at it.
    const exitFade = (j) => 0.86 - 0.5 * Math.min(1, seam.progress + j / SEAM_BARS);
    const gainSpec = sec === 'peak' && firstPhraseOf
      // the drop bar slams (per-bar, phrase-aligned)
      ? `[${[1, 0.9, 0.9, 0.9].map((g) => (g * bg).toFixed(3)).join(' ')}]/4`
      : seamEarly
        ? `[${Array.from({ length: 4 }, (_, j) => (exitFade(j) * bg).toFixed(3)).join(' ')}]/4`
        : (thin ? 0.75 : 0.9) * bg;
    layers.push(gate(held(costume(
      s(bp.s ?? 'jbreak') // local synthesized break; try s('breaks165') with the remote pack
        .slice(16, sigma.join(' '))
        .sometimesBy(thin ? 0 : wEff * 0.4, (x) => x.ply(2)) // stochastic re-subdivision
        .degradeBy((thin ? 0.4 - 0.2 * secProgress : wEff * 0.15) + (bp.thin ?? 0) + (seamEarly ? 0.18 : 0))
        .gain(gainSpec)
        .orbit(1),
      bp, rs, weather,
    ), 'break')));
  }

  // ---- skeleton: the metric anchor (§1.2) — strength rises with tension ----
  // Kick and snare split so ONLY the kick carries the sidechain: the audio
  // duck now mirrors the visual duck — one coupling constant, both media.
  // D22: warmth affirms the backbeat — the canopy's snare leans in, the
  // zenith's is thinned toward absence. Same skeleton, different conviction.
  const anchorStrength =
    Math.min(1, 0.45 + 0.5 * tension + (sec === 'peak' ? 0.15 : 0)) * (sec === 'build' ? 0.7 : 1);
  const backbeat = anchorStrength * (0.75 + 0.5 * warmth);
  const duckDepth = p.coupling * (0.4 + 0.6 * tension);
  if (seamLate) {
    // clean_downbeat countdown: a bare snare roll doubling every bar across the
    // late phrase — §5's accelerating fill, bar-exact into the new downbeat.
    // slow(4) keys the roll to absolute cycle mod 4, which IS the bar-in-phrase
    // because track lengths are whole phrases (D9).
    // D38 — one bag for both flavors, and it is no longer four snare rolls:
    // the fill may be the break dragging to a halt, a pitched line falling to
    // the root, or the biome's own texture chopped onto the grid. The dissolve
    // is the deepening applied on top, not a separate figure.
    // the UN-mixed seed, for the same reason D18's seam flavors use it: `p.seed`
    // here has the phrase index and the track index folded in, so keying to it
    // would re-roll the rotation at every boundary and the guarantee that a set
    // hears four different materials would quietly stop holding.
    const fill = seamFillFor(seam?.toIndex ?? 0, voice.baseSeed ?? p.seed);
    const track = { palette: pal, ambience: ambience?.current };
    layers.push(seamFillLayer(ctx, fill, {
      snd: seamFillSound(fill, track),
      notes: leadNotes(mode, 0, tuning), // between the bass and the pad
      brk: pal.break ?? {},
      rs,
      deep: dissolveExit,
    }));
  } else {
    if (kickIn) {
      layers.push(gate(
        s('bd ~ ~ ~')
          // landing arrival: bar 0 slams at full weight, the heartbeat decays
          // from it (per-bar gains, phrase-aligned like the drop slam)
          // D36 — a landing still lands, but it is the bottom of a breath now,
          // not a slam: the arrival bar sits under where the outgoing track was
          // rather than above it, and decays from there.
          .gain(landingArrival ? '[0.8 0.66 0.56 0.48]/4' : anchorStrength)
          .duckorbit('3:4').duckattack(0.12) // engine pre-creates orbits
          .duckdepth(landingArrival ? Math.max(duckDepth, 0.8 * p.coupling) : duckDepth)
          .orbit(1),
      ));
      // D23: the extra kicks deliberately do NOT duck. The sidechain is the
      // coupling constant between the two media (§3.3) and the visual duck is
      // on beat 1 — one pump per bar in both worlds, whatever else the floor
      // is doing down there.
      const kx = placements(bagFor(KICK_BAGS, GROOVE_BAGS.kick, pal.kick?.bag), pal.kick?.extras ?? 0.6, SKEL_LIFT[sec] ?? 0.5, rng);
      if (kx) {
        layers.push(gate(
          steps(s, pal.kick?.s ?? 'bd', kx.at)
            .gain(anchorStrength * (pal.kick?.gain ?? 0.62))
            .mask(kx.mask)
            .orbit(1),
        ));
      }
    }
    // the dub rail answers the snare (forest floor); at that track's peak it is
    // spent once — feedback past unity for the drop bar, and it eats the snare
    if (snareIn) {
      const snare = () => s('~ ~ sd ~').gain(backbeat).orbit(1);
      // spent once (forest floor): at its peak the rail's feedback goes past
      // unity for the drop bar and eats the snare — the set's only self-oscillation
      if (pal.dub && sec === 'peak' && firstPhraseOf) {
        layers.push(gate(dub(snare(), pal.dub, tension, 0.5).mask('[1 0 0 0]/4')));
        layers.push(gate(dub(snare(), pal.dub, tension).mask('[0 1 1 1]/4')));
      } else {
        layers.push(gate(dub(snare(), pal.dub, tension)));
      }
      // R1 — the turnaround: the phrase's last bar gets a figure instead of
      // simply stopping. Masked to bar 3 of the phrase, on the snare, off the
      // dub rail for the same reason the ghosts are (one answered transient per
      // bar, not seven). Skipped in the dropout bar, which is already a
      // gesture, and at the seam, which has a much bigger one of its own.
      const turn = (!dropout && !seamLate && !seamEarly)
        ? turnaroundFor(voice.phraseIndex ?? 0, voice.baseSeed ?? p.seed, sec)
        : null;
      if (turn) {
        layers.push(gate(
          s(hits(perBar(turn.fig.split(' ')), pal.snare?.s ?? 'sd'))
            .gain(turn.gain * (pal.snare?.gain ? pal.snare.gain / 0.3 : 1) * (0.75 + 0.35 * tNorm))
            .lpf(turn.lpf)
            .room(0.18).roomsize(rs(1)).roomlp(rs.lp(1)).roomdim(rs.dim(1)).roomfade(rs.fade(1))
            .pan(0.5)
            .mask('[0 0 0 1]/4')   // the last bar of the phrase, and only that
            .orbit(1),
        ));
      }
      // D23: ghosts stay OFF the dub rail. The 3/16 feedback is answering one
      // transient per bar (§9.3); answering six would be mud, and the rail's
      // job is to be heard as an echo, not as a texture.
      const gh = placements(bagFor(SNARE_BAGS, GROOVE_BAGS.snare, pal.snare?.bag), pal.snare?.ghosts ?? 0.5, SKEL_LIFT[sec] ?? 0.5, rng);
      if (gh) {
        layers.push(gate(
          steps(s, pal.snare?.s ?? 'sd', gh.at)
            .gain(backbeat * (pal.snare?.gain ?? 0.3))
            .mask(gh.mask)
            .orbit(1),
        ));
      }
    }
  }

  // ---- hats: breathing presence + Barlow accents (D16) ----
  // A flat 16-grid at one gain was fatiguing. Presence now draws per phrase
  // (full / sparse / off, section-weighted — the hats *rest*), velocities
  // follow inverse indispensability (accents push against the grid the
  // skeleton holds down), and levels sit lower with density capped at 6.
  // D22: the hat is a costume too — damp and closed in the undergrowth, bright
  // at the canopy, and at the zenith not a hat at all but a high-passed hiss on
  // the same mask: rhythm surviving as texture.
  if (!ambient && !dissolveExit && !silent) { // D18: on a dissolve the hats leave with the promise
    const hp = pal.hats ?? {};
    let hatMode;
    // D36 — a seam now EBBS and only build2 rises. Same machinery, opposite sign.
    if (seam?.active) hatMode = 'ebb';
    else if (sec === 'build2') hatMode = 'riser';
    else {
      const table = {
        build: [['sparse', 1]],
        groove: [['full', 0.45], ['sparse', 0.4], ['off', 0.15]],
        peak: [['full', 0.7], ['sparse', 0.3]],
        release: [['sparse', 0.6], ['off', 0.4]],
      }[sec] ?? [['full', 1]];
      let r = rng();
      for (const [m, wgt] of table) { if ((r -= wgt) <= 0) { hatMode = m; break; } }
      hatMode ??= table[table.length - 1][0];
    }
    if (hatMode !== 'off') {
      const sparse = hatMode === 'sparse';
      const k = hatMode === 'riser' ? 6
        // the ebb starts near the riser's density and is thinned bar by bar by
        // its gain ramp; going sparse here too would empty the exit at a stroke
        : hatMode === 'ebb' ? 5
        : sparse ? 2 + Math.round(tension * 2) : 3 + Math.round(tension * 3);
      const hatMask = euclid(k, 16, Math.floor(rng() * 16));
      const lvl = hp.gain ?? 1;
      let hats = s(hatMask.map((v) => (v ? (hp.s ?? 'hh') : '~')).join(' ')).pan(0.4 + rng() * 0.2);
      if (hatMode === 'riser') {
        // per-bar gain ramp: the riser climbs bar by bar, phrase-aligned (/4)
        const base = (0.26 + 0.2 * tension) * lvl;
        const prog = (j) => secProgress + j / (4 * section.sectionPhrases);
        const gains = Array.from({ length: 4 }, (_, j) => (base + 0.28 * lvl * prog(j)).toFixed(3));
        hats = hats.gain(`[${gains.join(' ')}]/4`);
      } else if (hatMode === 'ebb') {
        // D36 — the same ramp, downward, and keyed to the seam's own progress so
        // it keeps falling across BOTH phrases of the window rather than
        // resetting at the phrase line. It also closes: a hat that only gets
        // quieter still sounds present, and one that also gets darker recedes.
        const top = (0.3 + 0.2 * tension) * lvl;
        const prog = (j) => Math.min(1, seam.progress + j / SEAM_BARS);
        const gains = Array.from({ length: 4 }, (_, j) => (top * (1 - 0.85 * prog(j))).toFixed(3));
        hats = hats.gain(`[${gains.join(' ')}]/4`);
        const close = Array.from({ length: 4 }, (_, j) => Math.round(9000 - 6500 * prog(j)));
        hats = hats.lpf(`[${close.join(' ')}]/4`);
      } else {
        // T1 — lifted. A --mute=hats A/B showed removing the hats changed the
        // 2–4 kHz band by 0.0 percentage points: 198 events a track that could
        // not be heard. Raised here, and high-passed below (`hats.hpf`) so what
        // they contribute is air rather than more of the 120–250 Hz pileup.
        const base = ((sparse ? 0.2 : 0.3) + 0.2 * tension) * lvl;
        const gains = hatMask.map((v, i) =>
          v ? (base * (0.55 + 0.5 * (1 - INDISPENSABILITY[i]))).toFixed(3) : '0');
        hats = hats.gain(`[${gains.join(' ')}]`); // 16 per-step velocities
      }
      if (hp.lpf && hatMode !== 'ebb') hats = hats.lpf(hp.lpf); // the ebb owns its own closing filter
      if (hp.hpf) hats = hats.hpf(hp.hpf);
      if (hp.release) hats = hats.attack(0.002).decay(hp.release).sustain(0).release(hp.release);
      layers.push(gate(hats.orbit(1)));
    }
  }

  // ---- bass: isorhythm — talea E(k,16) × pentatonic color walk (lcm cycling) ----
  if (bassIn) { // the floor leaves with the drums; the drop restores it whole
    const bp = pal.bass ?? {};
    // the zenith's floor is absent for whole phrases (altitude = nothing
    // underneath you), on the same slow walk the ambience accents ride
    const absent = bp.absence &&
      layerPresenceAt('floor', voice.phraseIndex ?? 0, voice.baseSeed ?? p.seed) < bp.absence;
    if (!absent) {
      // D23 — the talea is re-cast every phrase. It used to be euclid(k, 16, 2)
      // with `rot` hardcoded and `k` per-track, which meant three of the four
      // tracks played the SAME two-bar figure — E(5,16), a near-isochronous
      // dotted-quarter pulse — for the whole set. `k` now breathes with tension
      // and the rotation moves the figure against the bar: same density, same
      // cast, a different relationship to the downbeat every phrase.
      const kSpan = bp.kSpan ?? 2;
      const k = Math.max(3, Math.min(13, (bp.k ?? 5) + Math.round((tension - 0.5) * kSpan)));
      // the drop and the landing restore the floor whole: the figure is rotated
      // so it starts ON the downbeat rather than wherever the phrase seed fell
      const anchored = landingArrival || (sec === 'peak' && firstPhraseOf);
      // AD8 — the talea develops instead of re-dealing. Seventeen unrelated
      // figures per track was variety without memory; the rotation is now drawn
      // once per SECTION (hashed away from the shared stream, the squawkLayer
      // idiom) and advances one step per phrase inside it: the same figure,
      // turning against the bar. A genuinely new deal happens only at section
      // boundaries, where new deals belong. The shared draw is kept and burned
      // so every layer downstream keeps its deal — the D43 constraint: adding
      // or removing a draw here re-deals the whole phrase after this point.
      void Math.floor(rng() * 16);
      const taleaRng = makeRng(strHash(
        `talea:${voice.baseSeed ?? p.seed}:${voice.trackIndex ?? 0}:${sec}`));
      const taleaRot = (Math.floor(taleaRng() * 16) + (section?.phraseInSection ?? 0)) % 16;
      let talea = euclid(k, 16, taleaRot);
      if (anchored && !talea[0]) {
        const hit = talea.indexOf(1);
        talea = talea.map((_, i) => talea[(i + hit) % 16]);
      }
      const colors = bassNotes(mode, bp.oct ?? -1, tuning);
      // N2 — the moving harmonic centre. The census that motivated this found
      // the bass ALREADY walking bVI–V–bIII every phrase under a pad that never
      // acknowledged it: the set's harmony was static not because nothing moved,
      // but because the layer that moves and the layer that names the chord were
      // never the same layer. So the walk's gravity centre now advances on an
      // authored cycle (`palette.bass.roots`, scale degrees) instead of always
      // being the tonic. Nothing new is played — every degree is already in the
      // mode, so there is no wrong note by construction — but the chord changes
      // NAME every four bars, which is what a listener hears as a progression.
      //
      // The cycle is 8 phrases against a 17-phrase track, so it never lands the
      // same way twice inside a set (§7's Eno principle, applied to harmony).
      // Deterministic in `phraseIndex`, so it costs the shared rng no draws —
      // one of those would re-deal every layer downstream of it.
      const cycle = bp.roots ?? [1];
      const centreDeg = cycle[(voice.phraseIndex ?? 0) % cycle.length];
      const centreIdx = Math.max(0, BASS_DEGREES.indexOf(centreDeg));
      // D23 — the walk was unsigned (`ci += 1 or 2`), so every bass line in the
      // set was a rising pentatonic run that wrapped: 51 distinct note
      // sequences, one contour. Steps are signed now, they leap where the grid
      // is most certain, and gravity pulls the line back toward the root — a
      // line with a shape rather than a ramp. When the figure lands on the
      // downbeat it lands on the root.
      const top = colors.length - 1;
      let ci = talea[0] ? centreIdx : Math.floor(rng() * colors.length);
      let first = true;
      // AD7 — the release lets go: gravity toward the centre doubles, so the
      // lines audibly sag home instead of wandering right up to the seam
      const gravity = sec === 'release' ? 0.9 : 0.45;
      const seq = talea.map((v, i) => {
        if (!v) return null;
        if (first) { first = false; return colors[ci]; }
        const mag = rng() < 0.18 + 0.3 * INDISPENSABILITY[i] ? 2 : 1; // leap on the strong slices
        // N2 — gravity toward the phrase's centre, not always toward the tonic.
        // Reduces to the old `0.55 - 0.5 * (ci / top)` when the centre IS the
        // tonic, which is most phrases: this bends the line, it does not replace it.
        const up = rng() < 0.5 - gravity * ((ci - centreIdx) / top);
        ci = Math.max(0, Math.min(top, ci + (up ? mag : -mag)));
        return colors[ci];
      });
      // AD10 — the octave lift: at most once per phrase, the strongest
      // non-anchor onset jumps +12 — the classic jungle sub-jump. The whole
      // split-band stack follows (every body copy and the sub read this seq),
      // which is what makes it a jump rather than a harmony. Probability rises
      // with the track's own arc; hashed rng, so the shared stream never
      // notices it happened.
      const liftRng = makeRng(strHash(
        `lift:${voice.phraseIndex ?? 0}:${voice.baseSeed ?? p.seed}`));
      if (liftRng() < 0.2 + 0.55 * tNorm) {
        let liftAt = -1;
        for (let i = 0; i < 16; i++) {
          if (seq[i] == null || ANCHORS.has(i)) continue;
          if (liftAt < 0 || INDISPENSABILITY[i] > INDISPENSABILITY[liftAt]) liftAt = i;
        }
        if (liftAt >= 0) seq[liftAt] += 12;
      }
      // AD7 — build2 is the one section that changes what the floor DOES. The
      // walk is replaced by the pulse: driving eighths on the phrase's centre
      // (16 slots under the half-time slow(2)), filter opening across the
      // section — the genre's pre-drop, and the first time build2's floor
      // differs from groove's underfoot. The walk above is still computed and
      // discarded: its draws keep the shared stream aligned for every layer
      // after the bass (the same D43 constraint AD8 cites).
      const pulse = sec === 'build2';
      const line = pulse ? Array.from({ length: 16 }, () => colors[centreIdx]) : seq;
      const str = (off) => line.map((n) => (n == null ? '~' : fmt(n + off))).join(' ');
      const [lo, span] = bp.lpf ?? [140, 260];
      const g = bp.gain ?? 0.5;
      const bassCut = pulse
        ? Math.round(lo + span * Math.min(1, 0.45 + 0.7 * secProgress))
        : lo + span * tension;
      const body = (offset, gain) => {
        let x = note(str(offset)).s(bp.s ?? 'sawtooth').lpf(bassCut).gain(gain);
        // P1 — the Reese finally moves. `track_identities.md` §4.1 describes
        // this patch as "stasis outside, seething inside", but its cutoff was
        // one number per phrase, held: a Reese without motion is a chorus. A
        // tempo-synced filter LFO (`lpsync` is cycles per BAR, so 0.25 is one
        // sweep per phrase) with resonance on it puts the growl back, and the
        // notch moving under a held note is the whole sound.
        if (bp.wobble) {
          const wb = bp.wobble;
          // Q3 — the growl's depth breathes on the 1/f walk, so two passes of
          // the same phrase are never the same amount of seething
          const depth = (wb.depth ?? 0.55) * (1 + (wb.drift ?? 0.4) * weather);
          x = x.lpsync(wb.sync ?? 0.25).lpdepth(Math.max(0.05, depth));
          if (wb.resonance) x = x.resonance(wb.resonance);
        }
        if (bp.release) x = x.attack(0.005).decay(bp.release).sustain(0.25).release(bp.release);
        if (bp.shape) x = x.shape(bp.shape);
        return gate(held(x.slow(2).orbit(2), 'bass')); // half-time layer (§1.4): the felt pulse
      };
      // the Reese (undergrowth): saws a few cents away — the beating IS the
      // timbre. Split-band: the detune stays in the mids, the sub is clean mono
      // (§7.2's one rule with teeth — wide detune below 150 Hz smears).
      //
      // P1 — `detune` accepts a LIST of cents offsets now. A symmetric pair
      // beats at one rate and reads as a chorus; three voices at unequal
      // distances beat at three rates that never line up, which is what makes
      // the classic patch sound alive rather than doubled. Gains fall across
      // the stack so the total sits where the single pair used to.
      const detunes = bp.detune == null ? [] : [].concat(bp.detune);
      const spread = [1, 0.75, 0.6];
      layers.push(body(0, g * (detunes.length > 1 ? spread[0] : 1)));
      detunes.forEach((cents, i) => {
        layers.push(body(cents / 100, g * (detunes.length > 1 ? spread[(i + 1) % spread.length] : 0.9)));
      });
      if (bp.sub) layers.push(gate(held(note(str(-12)).s('sine').gain(g * 0.8).slow(2).orbit(2), 'bass')));
      // N2 — the pedal, and it only sounds when there is news. On tonic phrases
      // the walk already says D and a drone under it would just be more of the
      // 120–250 Hz the mix has too much of; on the phrases where the centre has
      // MOVED, a held whole-note states the new root so the change has a floor
      // to stand on. Same idiom as D18's landing pedal below.
      if (centreIdx > 0) {
        layers.push(gate(
          note(fmt(colors[centreIdx]))
            .s(bp.s ?? 'sawtooth')
            .attack(0.06).release(2.4)
            .lpf(lo * 0.9)
            .gain(g * 0.5)
            .slow(4)                 // one tone per phrase: the harmony, not a riff
            .orbit(2),
        ));
      }
      // AD9 — spent once per track: the floor states the cell. MOTIF had never
      // sounded below octave 0 — the set's one melody and its floor were never
      // the same voice. On the drop bar the bass plays the cell as driving
      // eighths in its own register (the degree offsets 0–4 map straight onto
      // the pentatonic set), so the drop gains a MELODIC signature on top of
      // R3's textural variants — and respects them: a variant that withholds
      // the floor from the drop bar withholds this too (`held`).
      if (sec === 'peak' && firstPhraseOf) {
        const cell = MOTIF.map((d) => colors[Math.max(0, Math.min(top, d))]);
        const cellSeq = Array.from({ length: 16 },
          (_, i) => (i % 2 ? '~' : fmt(cell[i / 2]))).join(' ');
        layers.push(gate(held(
          note(cellSeq)
            .s(bp.s ?? 'sawtooth')
            .attack(0.004).decay(0.22).sustain(0.3).release(0.15)
            .lpf(lo + span)          // the drop opens the floor's filter fully
            .gain(g * 0.9)
            .mask('[1 0 0 0]/4')     // the drop bar, and nowhere else in the track
            .orbit(2),
          'bass')));
      }
    }
  }

  // ---- landing arrival (D18): the boundary hit and its afterglow ----
  // One impact tail exactly on the new track's downbeat (the sample rings past
  // the bar on its own), and the floor as *promise*: a one-note root pedal in
  // whole notes, fading with the heartbeat. Both exist only in intro phrase 0.
  if (landingArrival) {
    layers.push(
      // D36 — halved: the impact marks the boundary, it no longer announces it
      s('ambimpact').gain(0.42).room(0.6).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3)).pan(0.5)
        .mask('[1 0 0 0]/4') // bar 0 of the phrase = the boundary downbeat
        .orbit(3),
    );
    layers.push(
      note(fmt(bassNotes(mode, pal.bass?.oct ?? -1, tuning)[0]))
        .s(pal.bass?.s ?? 'sawtooth')
        .attack(0.02).release(1.2)
        .lpf(150)
        .gain('[0.5 0.42 0.35 0.3]/4')
        .orbit(2),
    );
  }

  // ---- pads: the ether (ground) — slow, wide, drowned, half-time and slower ----
  // Survives the seam AND the dropout untouched: the continuity layer, the
  // common tone (§6.1). In the breakdown it swells — the ether becomes figure.
  // D22: warmth chooses the voicing (glad 6th / neutral 7th / third-less
  // quartal) and the track's tuning decides whether it locks or shimmers —
  // this is where "bright but not happy" is actually implemented.
  const pp = pal.pad ?? {};
  const swell = sec === 'breakdown';
  // N3 — the plane cycle. `palette.pad.plane` lists diatonic step offsets and
  // advances one per phrase; because the offset is in DEGREES the collection
  // never changes, so the undergrowth's third-less quartal stack planes into
  // more third-less quartal stacks and warmth 0.15 costs nothing. Cycle lengths
  // are coprime with the 2-phrase sections and with N2's 8-phrase root cycle,
  // so the pad, the floor and the form align only at lcm distances (§7, Eno).
  const plane = pp.plane ?? [0];
  const step = plane[(voice.phraseIndex ?? 0) % plane.length];
  const chord = padVoicing(mode, warmth, { oct: pp.oct ?? 1, tuning, width: pp.width ?? 0, step });
  // N5 — harmonic rhythm as a section device (the open item in
  // section_ideas.md). On its own a faster `.slow()` would only re-ATTACK the
  // same chord, which is a rhythm device wearing a harmony costume. So the
  // extra changes borrow the NEXT entries of the plane cycle: at the peak the
  // pad previews where it is going, and doubling the rate becomes a genuine
  // harmonic accelerando rather than a louder metronome. Multiplicative with
  // N3 — without a plane cycle this collapses back to one repeated chord.
  const changes = HARM_RHYTHM[sec] ?? 1;
  // walk the cycle forward to the next step that is actually DIFFERENT — the
  // cycles contain repeated entries on purpose (a chord that stays is how a
  // phrase says "still waiting"), but a section asking for two changes should
  // get two chords, not the same one struck twice. With no plane authored this
  // finds nothing and the device correctly degrades to a re-attack.
  const stepsForPhrase = [step];
  for (let j = 1; j < changes; j++) {
    const from = (voice.phraseIndex ?? 0) + j - 1;
    let next = stepsForPhrase[j - 1];
    for (let d = 1; d <= plane.length; d++) {
      const cand = plane[(from + d) % plane.length];
      if (cand !== stepsForPhrase[j - 1]) { next = cand; break; }
    }
    stepsForPhrase.push(next);
  }
  const chords = changes > 1
    ? stepsForPhrase.map((st) => padVoicing(mode, warmth, {
      oct: pp.oct ?? 1, tuning, width: pp.width ?? 0, step: st,
    }))
    : [chord];
  const motion = PAD_MOTION[sec] ?? 0.4;
  if (!silent) {
    const [plo, pspan] = pp.lpf ?? [900, 2600];
    // Q3 — and the ether's own filter sits on the walk: a pad whose brightness
    // is identical every phrase is the sound of a held parameter
    const cutoff = (plo + pspan * tension + (swell ? 600 : 0)) * (1 + (pp.drift ?? 0.1) * weather);
    // The filter breathes across the phrase rather than sitting on one value.
    // Deliberately not symmetric — an even in-out is its own kind of static.
    const breath = (k) => Math.round(cutoff * (1 + motion * k));
    const drift = 0.09 * motion; // stereo wander, widest where the pad is barest
    // one pad voice-group: the same costume, a different note string and rate
    const padVoice = (noteStr, slowVal, gainMul = 1, relMul = 1) =>
      note(noteStr)
        .s(pp.s ?? 'sawtooth')
        .attack(swell ? (pp.attack ?? 1.2) * 2 : (pp.attack ?? 1.2))
        .release((swell ? (pp.release ?? 4) * 1.5 : (pp.release ?? 4)) * relMul)
        .lpf(`[${breath(-0.2)} ${breath(0.12)} ${breath(-0.07)} ${breath(0.3)}]`)
        // T2 — the ether gets out of the floor's way. Measured, 120–250 Hz was
        // 38% of the undergrowth's groove and 53% of its breakdown, against
        // 11% and 0.6% below 120: not heavy, boxy. Muting the break RAISED the
        // figure, so the pileup is the pad and the bass in the same octave.
        .hpf(pp.hpf ?? 150)
        .room(0.9).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3))   // low DRR: distance, the heavens
        .gain((pp.gain ?? 0.32) * (swell ? 1.4 : 1) * gainMul)
        .pan(`[${(0.5 - drift).toFixed(3)} 0.5 ${(0.5 + drift).toFixed(3)} 0.5]`)
        .slow(slowVal)
        .orbit(3);
    const asChord = (c) => `[${c.map(fmt).join(',')}]`;
    const phraseSlow = pp.slow ?? 4;

    if (chords.length > 1) {
      // N6 — the held frame and the moving voices. The pad must stay a block —
      // it is the common tone across the seam (§6.1) — but "a block" and "every
      // voice re-attacks together" are not the same requirement, and the second
      // one is why a chord change used to read as a reset rather than a move.
      // So the tones the phrase's chords SHARE are held for the whole phrase
      // and only the tones that differ re-articulate. One or two voices moving
      // inside four sustained ones is what voice leading sounds like.
      const same = (a, b) => Math.abs(a - b) < 0.01;
      const common = chords[0].filter((n) => chords.every((c) => c.some((m) => same(m, n))));
      const moving = chords.map((c) => c.filter((n) => !common.some((m) => same(m, n))));
      if (common.length) layers.push(padVoice(asChord(common), phraseSlow, 1, 1.25));
      if (moving.some((c) => c.length)) {
        layers.push(padVoice(
          `<${moving.map((c) => (c.length ? asChord(c) : '~')).join(' ')}>`,
          Math.max(1, phraseSlow / chords.length),
        ));
      }
    } else {
      // harmonic rhythm as warmth: the glad track re-voices twice as often
      layers.push(padVoice(asChord(chord), phraseSlow));
    }
    // ---- motion between notes ----
    // The block chord is the continuity layer and must stay a block — it is the
    // common tone across the seam (§6.1), so it cannot start arpeggiating. The
    // movement therefore goes to a SEPARATE quiet voice an octave up, walking
    // the same chord tones one at a time. Same harmony, but something is
    // audibly moving. Loudest exactly where the complaint was — the early
    // sections, where the arrangement is otherwise a held pad and a heartbeat.
    if (motion > 0.5) {
      const tones = padVoicing(mode, warmth, { oct: (pp.oct ?? 1) + 1, tuning, width: 0 });
      layers.push(
        note(`<${tones.map(fmt).join(' ')}>`)
          .s(pp.s ?? 'sawtooth')
          .attack(0.9).release(2.6)
          .lpf(breath(0.4))
          .room(0.93).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3)) // one room per orbit (D35); distance is the SEND
          .gain((pp.gain ?? 0.32) * 0.34 * motion)
          .pan(`[0.4 0.6]`)
          .slow(2)                   // one tone per two cycles: a walk, not a riff
          .orbit(3),
      );
    }
  } else {
    // the silence: one sine on the root, and the wind. Nothing else.
    layers.push(
      note(fmt(tune(degreeToMidi(1, mode, 1), tuning)))
        .s('sine').attack(3).release(8)
        .room(0.95).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3)).gain(0.22).pan(0.5)
        .slow(4).orbit(3),
    );
  }

  // ---- ambience: the biome's noise floor, layered (D16; recordings D26) ----
  // ambience.current = [bed, ...accents]: 32-bar field recordings played one
  // phrase-long slice at a time — chunk `c` advances with the phrase index, so
  // consecutive phrases play consecutive audio and the loop only repeats every
  // AMB_BARS. Retriggers stay phrase-aligned (slow(4) at absolute cycles), which
  // is what keeps biome changes and the seam crossfade landing on their bars.
  // The bed is always on — loud where the ether is figure (intro/breakdown/seam),
  // tucked under the full arrangement elsewhere. Accent layers ride slow presence
  // walks: below threshold they rest, above it their gain follows the walk (the
  // walk is continuous through the threshold, so entries fade rather than pop).
  // During the seam the INCOMING biome's bed crossfades in early — §6.1's
  // infiltrating ether.
  // Envelopes are deliberately near-instant: superdough keeps the source playing
  // for `release` past the event end, and since the next chunk starts on that
  // same audio, any real release would sum the recording with itself.
  if (ambience?.current?.length) {
    const chunk = ((ambience.phraseIndex ?? 0) % AMB_CHUNKS + AMB_CHUNKS) % AMB_CHUNKS;
    // D30 — how loud, and how often, the biome is: part of the cast like
    // everything else (TRACKS[i].ambienceMix). The undergrowth turns both up,
    // because a jungle floor that goes quiet for whole phrases is not a floor.
    const mix = ambience.mix ?? {};
    // D37 — and one layer may be treated differently from its neighbours.
    // A recording is raw material, not a finished part: the ice-cave glints are
    // the undergrowth's *dark* sparkle only because the mix filters and drowns
    // them. Every field is optional and the default is the untouched layer.
    const layerFx = mix.layers ?? {};
    const bed = (name, g, atk = 0.01, rel = 0.01, panPos = 0.5) => {
      const fx = layerFx[name] ?? {};
      let pat = s(name)
        .begin(chunk / AMB_CHUNKS).end((chunk + 1) / AMB_CHUNKS)
        .gain(g * (fx.gain ?? 1)).attack(atk).release(rel)
        .pan(fx.pan ?? panPos).slow(4).orbit(3);
      if (fx.hpf) pat = pat.hpf(fx.hpf);
      if (fx.lpf) pat = pat.lpf(fx.lpf);
      if (fx.room) pat = pat.room(fx.room).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3));
      return pat;
    };
    const [baseBed, ...accents] = ambience.current;
    const foreground = ambient || seamLate || silent;
    const bedMix = mix.bed ?? 1;
    const accentMix = mix.accent ?? 1;
    const thr = mix.threshold ?? 0.35;
    const baseG = (landingArrival ? 0.45 // the biome answers the hit at full voice
      : foreground ? 0.35 : sec === 'build' || sec === 'release' ? 0.25 : 0.15) * bedMix;
    const inBed = ambience.incoming?.[0];
    const x = seam?.active && inBed && inBed !== baseBed ? Math.min(1, seam.progress + 0.25) : 0;
    layers.push(bed(baseBed, baseG * (1 - x)));
    if (x > 0) layers.push(bed(inBed, 0.35 * x));
    accents.forEach((name, li) => {
      const v = layerPresenceAt(name, ambience.phraseIndex ?? 0, ambience.seed ?? p.seed);
      const lvl = Math.max(0, (v - thr) / (1 - thr)); // rest below the threshold
      if (lvl <= 0.02) return;
      const g = (foreground ? 0.3 : 0.12) * accentMix * lvl * (1 - x);
      layers.push(bed(name, g, 0.02, 0.01, 0.35 + 0.3 * li)); // spread in the field
    });
  }

  // ---- lead: the set's one melodic cell, transformed (80/20) ----
  // AD15 — the melody policy is authored per track (palette.motif.transforms,
  // indices into TRANSFORMS), and the release pins every track's bag to
  // literal recall: §6.4's argument resolving on recall, four times a set.
  const diet = sec === 'release' ? [0] : pal.motif?.transforms;
  if (leadPresent) {
    const lp = pal.lead ?? {};
    const featured = sec === 'breakdown';
    // AD16 — the answer phrase. Contours were independent draws: variety with
    // no conversation. Phrases now pair — the even phrase of each pair states
    // a contour (from a hashed stream keyed to the PAIR, so both members see
    // the same statement), and the odd phrase answers with its
    // retrograde-inversion at reduced density. Eight bars become a sentence.
    // The old shared-rng call is burned so every later layer keeps its deal.
    const pairIdx = Math.floor((voice.phraseIndex ?? 0) / 2);
    const answering = ((voice.phraseIndex ?? 0) % 2 + 2) % 2 === 1;
    const pairRng = makeRng(strHash(
      `contour:${pairIdx}:${voice.baseSeed ?? p.seed}:${voice.trackIndex ?? 0}`));
    let contour = leadContour(pairRng, w, diet);
    if (answering) contour = [...contour].reverse().map((d) => 4 - d);
    void leadContour(rng, w, diet);
    const scale = leadNotes(mode, 2, tuning);
    // sparse placement: E(k,16) with k breathing with tension — the lead is a
    // guest in the ether, not a soloist (visual doc §5's economy applies here
    // too); the answer sits one onset thinner than its statement
    const k = Math.max(2, (featured ? 5 : 3 + Math.round(tension * 3)) - (answering ? 1 : 0));
    const mask = euclid(k, 16, Math.floor(rng() * 16));
    let ci = 0;
    const seq = mask.map((v) => {
      if (!v) return '~';
      const deg = contour[ci++ % contour.length];
      return fmt(scale[Math.max(0, Math.min(scale.length - 1, deg))]);
    });
    const [llo, lspan] = lp.lpf ?? [1200, 2400];
    let lead = note(seq.join(' '))
      .s(lp.s ?? 'triangle')
      .attack(0.05).release(1.5)
      .room(lp.room ?? 0.8).roomsize(rs(4)).roomlp(rs.lp(4)).roomdim(rs.dim(4)).roomfade(rs.fade(4)) // drowned: the pluck problem's legal resolution (§7.2)
      .lpf(llo + lspan * tension)
      // featured (breakdown, D11): the ether becomes figure, tension gate waived
      // P0 — the ramp reads the track's own arc too, and floors at a level that
      // is actually audible rather than tapering to nothing
      .gain(featured ? 0.34 : 0.28 * (0.55 + 0.45 * Math.min(1, (tNorm - 0.28) / 0.32)))
      .pan(0.5)
      .slow(2)                     // half-time layer: lyrical, not rhythmic
      .orbit(4);
    if (lp.fmh) lead = lead.fmh(lp.fmh).fmi(lp.fmi ?? 1.5);
    layers.push(dub(lead, pal.dub, tension));
    // canopy: FM bells double the lead an octave up — inharmonic partials over
    // a glad chord read as light, not error (§7.2)
    if (pal.bells) {
      const bl = pal.bells;
      const up = seq.map((x) => (x === '~' ? '~' : fmt(parseFloat(x) + 12 * (bl.oct ?? 1)))).join(' ');
      layers.push(note(up).s('sine').fmh(bl.fmh ?? 3).fmi(bl.fmi ?? 2.2)
        .attack(0.005).decay(bl.decay ?? 0.6).sustain(0.08).release(1.2)
        .room(bl.room ?? 0.55).roomsize(rs(4)).roomlp(rs.lp(4)).roomdim(rs.dim(4)).roomfade(rs.fade(4))
        .gain((bl.gain ?? 0.19) * (featured ? 1.15 : 1)).pan(0.55)
        .slow(2).orbit(4));
    }
  }

  // ---- D22: the characteristic layers ----
  // The migrating pluck plays everywhere except the ambient sections (where the
  // ether is the figure) — and its costume is what changes across the set.
  if (pal.pluck && castIn && !ambient) {
    const pluck = pluckLayer(ctx, pal.pluck, mode, tuning, rng, rs);
    if (pluck) layers.push(gate(pluck));
  }
  // spent once: the set's first sound is a stick on wood.
  if (voice.trackIndex === 0 && voice.barInTrack === 0 && pal.pluck) {
    layers.push(
      note(fmt(tune(degreeToMidi(1, mode, pal.pluck.oct ?? 0), tuning)))
        .s('sine').fmh(pal.pluck.fmh ?? 3.5).fmi(3)
        .attack(0.001).decay(0.22).sustain(0).release(0.2)
        .room(0.02).gain(0.5).pan(0.5)
        .mask('[1 0 0 0]/4') // the very first bar of the set, and nowhere else
        .orbit(1),
    );
  }
  // P2 — the undergrowth's own top end. Weather rather than percussion (D32's
  // rule for the squawk), so it survives the ether-only sections: an insect
  // does not stop because the drums dropped out.
  if (pal.stridulate && castIn) {
    const chirp = stridulateLayer(ctx, pal.stridulate, voice.phraseIndex ?? 0, voice.baseSeed ?? p.seed, rs);
    if (chirp) layers.push(chirp);
  }
  if (pal.breath && castIn && sec !== 'intro') {
    for (const l of breathLayer(ctx, pal.breath, mode, tuning, rng, w, diet, tension, rs)) layers.push(gate(l));
  }
  // P3 — the stab, on its OWN rng. Drawing from the shared one here would
  // re-deal every layer built after it (the squawk's hashed-rng idiom, applied
  // for the same reason). It takes the pad's chord, so N3's planing comes free.
  if (pal.stab && castIn && !ambient) {
    const stab = stabLayer(ctx, pal.stab, chord, tension,
      makeRng((p.seed ^ 0x57ab) >>> 0), rs);
    if (stab) layers.push(gate(stab));
  }
  if (pal.choir && castIn && !dropout) {
    layers.push(choirLayer(ctx, pal.choir, chord, brightness, rs));
  }
  // D32: the squawk. Weather rather than percussion, so unlike D31's toms it
  // survives the ether-only sections — a bird does not stop calling because the
  // drums dropped out. It does leave at the late seam with everything else.
  if (pal.squawk && castIn) {
    const call = squawkLayer(ctx, pal.squawk, p.seed, voice.phraseIndex ?? 0, rs);
    if (call) layers.push(call);
  }
  if (pal.bowl && castIn) layers.push(bowlLayer(ctx, pal.bowl, mode, tuning, rs));
  // R4 — the granular ghost, in the section it was written for. The backlog's
  // "granular/halfspeed break ghost — the drums heard as *weather*" is exactly
  // this layer, and it was gated `!ambient`, which excludes the breakdown: the
  // one section with no drums, and therefore the only one where a drum-shaped
  // texture can be heard as weather rather than as drums. The gate stays for
  // the intro (nothing has been stated yet, so there is nothing to ghost).
  if (pal.ghost && castIn && sec !== 'intro') {
    const inBreakdown = sec === 'breakdown';
    const g = ghostLayer(ctx, pal.ghost, rng, pal.break?.s ?? 'jbreak', rs);
    // in the breakdown it is the figure rather than a haze under one, so it
    // comes up and slows down — the timestretch artifact §3.4 asks for
    layers.push(gate(inBreakdown ? g.gain((pal.ghost.gain ?? 0.15) * 1.9).slow(2) : g));
  }
  // spent once: the hoover, on the canopy's drop bar. 1992, once, never again.
  if (pal.hoover && sec === 'peak' && firstPhraseOf && !silent) {
    layers.push(hooverLayer(ctx, pal.hoover, mode, tuning, rs));
  }
  // P5 — spent once: the trapdoor, on the UNDERGROWTH's drop bar. The hoover's
  // opposite sign at the opposite end of the set: a pitch envelope diving two
  // octaves instead of screaming up one, on the only track that had no gesture
  // of its own at its own peak. `penv` is negative, so `pattack` is the fall.
  if (pal.trapdoor && sec === 'peak' && firstPhraseOf && !silent) {
    const td = pal.trapdoor;
    layers.push(
      note(fmt(tune(degreeToMidi(1, mode, td.oct ?? 0), tuning)))
        .s(td.s ?? 'sawtooth')
        .penv(td.penv ?? -24).pattack(td.pattack ?? 0.5).pcurve(1)
        .attack(0.004).decay(1.6).sustain(0).release(0.9)
        .lpf(td.lpf ?? 700).resonance(td.resonance ?? 9)
        .room(td.room ?? 0.35).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3))
        .gain(td.gain ?? 0.34).pan(0.5)
        .mask('[1 0 0 0]/4')       // the drop bar, and nowhere else in the set
        .orbit(2),
    );
  }
  // P4 — spent once: the thunderclap. `ambthunder` already ships as one of the
  // forest floor's ambience accents, where it is weather you half-notice; this
  // promotes it to a gesture. It lands reversed across the build2 dropout bar —
  // the one bar the form deliberately empties, so it crowds nothing — and
  // forward on the drop. A roll into a hole, then the hole fills.
  if (pal.thunder && !silent) {
    const th = pal.thunder;
    if (dropout) {
      layers.push(
        s('ambthunder').speed(-(th.speed ?? 0.85))   // reversed: it arrives backwards
          .begin(0).end(th.end ?? 0.22)
          .room(th.room ?? 0.6).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3))
          .gain(th.gain ?? 0.5).pan(0.5)
          .mask('[0 0 0 1]/4')     // the emptied bar itself
          .orbit(3),
      );
    } else if (sec === 'peak' && firstPhraseOf) {
      layers.push(
        s('ambthunder').speed(th.speed ?? 0.85)
          .begin(0).end(th.end ?? 0.22)
          .room(0.35).roomsize(rs(3)).roomlp(rs.lp(3)).roomdim(rs.dim(3)).roomfade(rs.fade(3))
          .gain((th.gain ?? 0.5) * 1.15).pan(0.5)
          .mask('[1 0 0 0]/4')
          .orbit(3),
      );
    }
  }

  return stack(...layers);
}
