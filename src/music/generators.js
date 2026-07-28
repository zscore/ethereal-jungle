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
import { modeAt, padVoicing, bassNotes, leadNotes, degreeToMidi, tune } from './scales.js';

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
const SEAM_FILLS = [
  {
    name: 'the hole',
    fig: '[sd ~ ~ sd] [sd ~ sd [~ sd]] [sd [sd sd] sd [sd sd]] [[sd sd sd] [sd sd sd] ~ ~]',
    gain: '[0.5 0.62 0.74 0.9]',
    lpf: '[2200 2800 3400 4200]',
  },
  {
    name: 'the drag',
    fig: '[~ ~ sd ~] [sd ~ [sd sd] ~] [[sd sd sd] ~ [sd sd sd] ~] [[sd sd sd sd sd sd] ~ [sd sd] ~]',
    gain: '[0.45 0.6 0.72 0.88]',
    lpf: '[1900 2500 3100 3900]',
  },
  {
    name: 'restraint',
    fig: '~ [~ ~ ~ sd] [~ sd ~ sd] [sd ~ [sd sd] [sd ~]]',
    gain: '[0.4 0.55 0.68 0.82]',
    lpf: '[1700 2300 2900 3600]',
  },
];

/** The dissolve's figure (D18): the same unevenness, energy inverted. */
const DISSOLVE_FILL = {
  name: 'dissolve',
  fig: '[sd ~ sd ~] [sd ~ [sd sd] ~] [[sd sd] ~ [sd sd sd] ~] [[sd sd sd] ~ ~ ~]',
  gain: '[0.7 0.55 0.4 0.26]',
  lpf: '[2600 1500 850 480]',
};

/** Dress a fill figure in the track's own snare. */
const fillFigure = (fig, snd) => (snd === 'sd' ? fig : fig.replaceAll('sd', snd));

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
function squawkLayer(ctx, sq, seed, phraseIndex) {
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
    .room(sq.room ?? 0.5).roomsize(sq.roomsize ?? 8)
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
const MOTIF = [0, 2, 1, 4, 3, 2, 4, 0]; // scale-degree offsets — the set's single cell

const TRANSFORMS = [
  (m) => m,                                        // literal recall
  (m) => [...m].reverse(),                         // retrograde
  (m) => m.map((d) => 4 - d),                      // inversion about the cell's center
  (m, rng) => { const r = 1 + Math.floor(rng() * (m.length - 1)); return m.map((_, i) => m[(i + r) % m.length]); }, // rotation
  (m, rng) => m.map((d) => d + (rng() < 0.5 ? 1 : 2)), // diatonic transposition
];

/**
 * §3 contour-then-quantize: 80% a transformation of the motif, 20% a fresh
 * smooth contour. Shape is generated apart from pitch set, so mode changes
 * re-color a held shape — motivic identity surviving harmonic change.
 */
export function leadContour(rng, w) {
  if (rng() < 0.8) {
    const tf = TRANSFORMS[Math.floor(rng() * TRANSFORMS.length)];
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
function costume(pat, bp = {}) {
  let x = pat;
  if (bp.speed) x = x.speed(bp.speed);
  if (bp.reverse) x = x.sometimesBy(bp.reverse, (y) => y.speed(-(bp.speed ?? 1)));
  if (bp.lpf) x = x.lpf(bp.lpf);
  if (bp.hpf) x = x.hpf(bp.hpf);
  if (bp.crush) x = x.crush(bp.crush);
  if (bp.coarse) x = x.coarse(bp.coarse);
  if (bp.shape) x = x.shape(bp.shape);
  if (bp.room) x = x.room(bp.room).roomsize(bp.roomsize ?? 4);
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
function pluckLayer(ctx, pk, mode, tuning, rng) {
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
    .room(pk.room ?? 0.05).roomsize(pk.roomsize ?? 3)
    .gain(pk.gain ?? 0.28)
    .pan(0.35 + rng() * 0.3)
    .orbit(pk.orbit ?? 1);
  if (pk.offGrid) pat = pat.sometimesBy(pk.offGrid, (x) => x.late(1 / 32)); // the grid lock loosens
  if (pk.slow) pat = pat.slow(pk.slow);
  return pat;
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
function breathLayer(ctx, br, mode, tuning, rng, w, tension) {
  const { note, s } = ctx;
  const contour = leadContour(rng, w); // the set's cell, not a new tune
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
    .room(0.55).roomsize(5)
    .gain(g).pan(0.45)
    .slow(4).orbit(4); // long tones under the lead's half-time
  const air = s(seq.map((x) => (x === '~' ? '~' : 'white')).join(' '))
    .attack(0.35).release(0.9)
    .hpf(900).lpf(lo + span * tension).resonance(4)
    .room(0.55).roomsize(5)
    .gain(g * (br.noise ?? 0.32)).pan(0.45)
    .slow(4).orbit(4);
  return [tone, air];
}

/**
 * The vowel choir (canopy). The voice is the strongest attractor in the mix, so
 * it is spent exactly once per set — at the golden-ratio climax, and nowhere
 * else. Formant follows brightness: 'a' opening toward 'o' as the light rises.
 */
function choirLayer(ctx, ch, chord, brightness) {
  const { note } = ctx;
  return note(`[${chord.map(fmt).join(',')}]`)
    .s('sawtooth')
    .vowel(brightness > 0.68 ? 'o' : 'a')
    .attack(2.6).release(6)
    .lpf(ch.lpf ?? 1500)
    .room(0.9).roomsize(9)
    .gain(ch.gain ?? 0.2).pan(0.5)
    .slow(4).orbit(3);
}

/**
 * The glass bowl (zenith): Chowning-ratio FM over a quartal stack in stretched
 * tuning — inharmonic partials with nothing to resolve to. One strike every two
 * phrases; the sparsest thing in the set.
 */
function bowlLayer(ctx, bw, mode, tuning) {
  const { note } = ctx;
  const voices = [1, 5, 9].map((d) => fmt(tune(degreeToMidi(d, mode, bw.oct ?? 2), tuning)));
  return note(`[${voices.join(',')}]`)
    .s('sine').fmh(bw.fmh ?? 2.76).fmi(bw.fmi ?? 1.6)
    .attack(bw.attack ?? 2.5).release(bw.release ?? 7)
    .room(0.95).roomsize(12)
    .gain(bw.gain ?? 0.17).pan(0.5)
    .slow(8).orbit(3);
}

/**
 * The granular ghost (zenith): the break itself, in grains — half speed, often
 * reversed, drowned, with no skeleton under it. §3.4's timestretch artifact
 * heard as weather, and the audio sibling of the corpus shrine (D25): at the
 * top of the set, the piece plays back its own earlier material as ether.
 */
function ghostLayer(ctx, gh, rng, breakSound) {
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
    .room(0.95).roomsize(12)
    .gain(gh.gain ?? 0.15)
    .slow(2).orbit(3);
}

/**
 * The hoover (canopy, spent once): the rave-lineage lead-weapon on the drop
 * bar. Detuned saws with a downward pitch envelope — 1992, once, never again.
 */
function hooverLayer(ctx, hv, mode, tuning) {
  const { note } = ctx;
  const root = tune(degreeToMidi(1, mode, 1), tuning);
  const voices = [root - 0.07, root, root + 0.07].map(fmt);
  return note(`[${voices.join(',')}]`)
    .s('sawtooth')
    .penv(hv.penv ?? -10).pattack(0.001).pdecay(0.35).pcurve(1)
    .attack(0.01).release(1.4)
    .lpf(2600).resonance(6)
    .room(0.35).roomsize(4)
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
        palette: ps.track.palette ?? {},
        tuning: ps.track.tuning,
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

  // ---- section state (D11) ----
  const sec = section?.name ?? 'groove';
  const lastPhraseOf = section ? section.phraseInSection === section.sectionPhrases - 1 : false;
  const firstPhraseOf = section ? section.phraseInSection === 0 : false;
  // bar-level progress through the section is secProgress + j/(4·sectionPhrases)
  const secProgress = section ? section.phraseInSection / section.sectionPhrases : 0;

  // Seam phases (§6.3), bar-exact: early seam = intensified exit (A's drums
  // peak), late seam = the drums die BEFORE the boundary (§6.1's asymmetry —
  // drums are the strongest stream and must not cross), while the incoming
  // ether is already here via brightnessAt's forward leak.
  const seamEarly = seam?.active && !seam.late;
  const seamLate = seam?.active && seam.late;
  const dissolveExit = seamLate && seam?.variant === 'dissolve';
  // D18: a 'landing' entry makes intro phrase 0 an arrival — boundary slam,
  // root pedal, impact tail — decaying into the pure intro at phrase 1.
  // The intro reads as aftermath, not absence.
  const landingArrival = sec === 'intro' && section?.phraseInSection === 0 &&
    seam?.entryVariant === 'landing';
  const wEff = Math.min(1, w + (seamEarly ? 0.25 : 0) + (sec === 'build2' ? 0.15 : 0));

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
  const leadPresent = !seamLate && !silent &&
    (sec === 'breakdown' || (tension > 0.3 && sec !== 'intro' && sec !== 'build'));
  // the characteristic layers leave with the drums at the late seam: the seam
  // strips to the common tone, whoever is currently playing it (§6.1)
  const castIn = !seamLate && !silent;

  // §5's pre-drop denial: the final bar of build2 is ether-only. The mask is
  // keyed to absolute cycle mod 4 = bar-in-phrase (same trick as the roll).
  const dropout = sec === 'build2' && lastPhraseOf;
  const gate = (pat) => (dropout ? pat.mask('[1 1 1 0]/4') : pat);

  const layers = [];

  // ---- drums: the break (figure) — sharp, dry, narrow, double-time ----
  if (breakIn) {
    const bp = pal.break ?? {};
    const thin = sec === 'build'; // degraded entry: the break fades in over the build
    const sigma = permuteBreak(wEff, rng);
    const bg = bp.gain ?? 1;      // the costume's own level (the zenith sits back)
    const gainSpec = sec === 'peak' && firstPhraseOf
      // the drop bar slams (per-bar, phrase-aligned)
      ? `[${[1, 0.9, 0.9, 0.9].map((g) => (g * bg).toFixed(3)).join(' ')}]/4`
      : (thin ? 0.75 : 0.9) * bg;
    layers.push(gate(costume(
      s(bp.s ?? 'jbreak') // local synthesized break; try s('breaks165') with the remote pack
        .slice(16, sigma.join(' '))
        .sometimesBy(thin ? 0 : wEff * 0.4, (x) => x.ply(2)) // stochastic re-subdivision
        .degradeBy((thin ? 0.4 - 0.2 * secProgress : wEff * 0.15) + (bp.thin ?? 0))
        .gain(gainSpec)
        .orbit(1),
      bp,
    )));
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
    const snd = pal.snare?.s ?? 'sd';
    if (dissolveExit) {
      // dissolve (D18): the same uneven figure with its energy inverted —
      // fading, closing, drowning as it speeds up. The drums recede into
      // weather (§3.4); the ambient arrival is what this prepares.
      layers.push(s(fillFigure(DISSOLVE_FILL.fig, snd))
        .gain(DISSOLVE_FILL.gain)
        .lpf(DISSOLVE_FILL.lpf)
        .room('[0.3 0.5 0.7 0.9]').roomsize(6)
        .slow(4).orbit(1));
    } else {
      // which fill this seam gets: keyed to the track being entered, mixed with
      // the seed, so the set varies and a reroll re-deals it. Pure — no draw
      // from `rng`, which would shift every seeded decision downstream of here.
      const fill = SEAM_FILLS[Math.abs(strHash(`fill:${seam?.toIndex ?? 0}:${p.seed}`)) % SEAM_FILLS.length];
      layers.push(s(fillFigure(fill.fig, snd))
        .gain(fill.gain)
        .lpf(fill.lpf)
        .room(0.18).roomsize(3)  // a little air, so the hole is audibly a hole
        .slow(4).orbit(1));
    }
  } else {
    if (kickIn) {
      layers.push(gate(
        s('bd ~ ~ ~')
          // landing arrival: bar 0 slams at full weight, the heartbeat decays
          // from it (per-bar gains, phrase-aligned like the drop slam)
          .gain(landingArrival ? '[1 0.72 0.6 0.52]/4' : anchorStrength)
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
    if (seam?.active || sec === 'build2') hatMode = 'riser';
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
      const k = hatMode === 'riser' ? 6 : sparse ? 2 + Math.round(tension * 2) : 3 + Math.round(tension * 3);
      const hatMask = euclid(k, 16, Math.floor(rng() * 16));
      const lvl = hp.gain ?? 1;
      let hats = s(hatMask.map((v) => (v ? (hp.s ?? 'hh') : '~')).join(' ')).pan(0.4 + rng() * 0.2);
      if (hatMode === 'riser') {
        // per-bar gain ramp: the riser climbs bar by bar, phrase-aligned (/4)
        const base = (0.26 + 0.2 * tension) * lvl;
        const prog = seam?.active
          ? (j) => seam.progress + j / SEAM_BARS
          : (j) => secProgress + j / (4 * section.sectionPhrases);
        const gains = Array.from({ length: 4 }, (_, j) => (base + 0.28 * lvl * prog(j)).toFixed(3));
        hats = hats.gain(`[${gains.join(' ')}]/4`);
      } else {
        const base = ((sparse ? 0.15 : 0.22) + 0.16 * tension) * lvl;
        const gains = hatMask.map((v, i) =>
          v ? (base * (0.55 + 0.5 * (1 - INDISPENSABILITY[i]))).toFixed(3) : '0');
        hats = hats.gain(`[${gains.join(' ')}]`); // 16 per-step velocities
      }
      if (hp.lpf) hats = hats.lpf(hp.lpf);
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
      let talea = euclid(k, 16, Math.floor(rng() * 16));
      if (anchored && !talea[0]) {
        const hit = talea.indexOf(1);
        talea = talea.map((_, i) => talea[(i + hit) % 16]);
      }
      const colors = bassNotes(mode, bp.oct ?? -1, tuning);
      // D23 — the walk was unsigned (`ci += 1 or 2`), so every bass line in the
      // set was a rising pentatonic run that wrapped: 51 distinct note
      // sequences, one contour. Steps are signed now, they leap where the grid
      // is most certain, and gravity pulls the line back toward the root — a
      // line with a shape rather than a ramp. When the figure lands on the
      // downbeat it lands on the root.
      const top = colors.length - 1;
      let ci = talea[0] ? 0 : Math.floor(rng() * colors.length);
      let first = true;
      const seq = talea.map((v, i) => {
        if (!v) return null;
        if (first) { first = false; return colors[ci]; }
        const mag = rng() < 0.18 + 0.3 * INDISPENSABILITY[i] ? 2 : 1; // leap on the strong slices
        const up = rng() < 0.55 - 0.5 * (ci / top);                   // tonic gravity
        ci = Math.max(0, Math.min(top, ci + (up ? mag : -mag)));
        return colors[ci];
      });
      const str = (off) => seq.map((n) => (n == null ? '~' : fmt(n + off))).join(' ');
      const [lo, span] = bp.lpf ?? [140, 260];
      const g = bp.gain ?? 0.5;
      const body = (offset, gain) => {
        let x = note(str(offset)).s(bp.s ?? 'sawtooth').lpf(lo + span * tension).gain(gain);
        if (bp.release) x = x.attack(0.005).decay(bp.release).sustain(0.25).release(bp.release);
        if (bp.shape) x = x.shape(bp.shape);
        return gate(x.slow(2).orbit(2)); // half-time layer (§1.4): the felt pulse
      };
      layers.push(body(0, g));
      // the Reese (undergrowth): a second saw a few cents away — the beating IS
      // the timbre. Split-band: the detune stays in the mids, the sub is clean
      // mono (§7.2's one rule with teeth — wide detune below 150 Hz smears).
      if (bp.detune) layers.push(body(bp.detune / 100, g * 0.9));
      if (bp.sub) layers.push(gate(note(str(-12)).s('sine').gain(g * 0.8).slow(2).orbit(2)));
    }
  }

  // ---- landing arrival (D18): the boundary hit and its afterglow ----
  // One impact tail exactly on the new track's downbeat (the sample rings past
  // the bar on its own), and the floor as *promise*: a one-note root pedal in
  // whole notes, fading with the heartbeat. Both exist only in intro phrase 0.
  if (landingArrival) {
    layers.push(
      s('ambimpact').gain(0.8).room(0.5).roomsize(8).pan(0.5)
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
  const chord = padVoicing(mode, warmth, { oct: pp.oct ?? 1, tuning, width: pp.width ?? 0 });
  const motion = PAD_MOTION[sec] ?? 0.4;
  if (!silent) {
    const [plo, pspan] = pp.lpf ?? [900, 2600];
    const cutoff = plo + pspan * tension + (swell ? 600 : 0);
    // The filter breathes across the phrase rather than sitting on one value.
    // Deliberately not symmetric — an even in-out is its own kind of static.
    const breath = (k) => Math.round(cutoff * (1 + motion * k));
    const drift = 0.09 * motion; // stereo wander, widest where the pad is barest
    layers.push(
      note(`[${chord.map(fmt).join(',')}]`)
        .s(pp.s ?? 'sawtooth')
        .attack(swell ? (pp.attack ?? 1.2) * 2 : (pp.attack ?? 1.2))
        .release(swell ? (pp.release ?? 4) * 1.5 : (pp.release ?? 4))
        .lpf(`[${breath(-0.2)} ${breath(0.12)} ${breath(-0.07)} ${breath(0.3)}]`)
        .room(0.9).roomsize(8)       // low DRR: distance, the heavens
        .gain((pp.gain ?? 0.32) * (swell ? 1.4 : 1))
        .pan(`[${(0.5 - drift).toFixed(3)} 0.5 ${(0.5 + drift).toFixed(3)} 0.5]`)
        // harmonic rhythm as warmth: the glad track re-voices twice as often
        .slow(pp.slow ?? 4)
        .orbit(3),
    );
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
          .room(0.93).roomsize(11)   // further away than the pad it decorates
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
        .room(0.95).roomsize(12).gain(0.22).pan(0.5)
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
    const bed = (name, g, atk = 0.01, rel = 0.01, panPos = 0.5) =>
      s(name)
        .begin(chunk / AMB_CHUNKS).end((chunk + 1) / AMB_CHUNKS)
        .gain(g).attack(atk).release(rel).pan(panPos).slow(4).orbit(3);
    const [baseBed, ...accents] = ambience.current;
    const foreground = ambient || seamLate || silent;
    // D30 — how loud, and how often, the biome is: part of the cast like
    // everything else (TRACKS[i].ambienceMix). The undergrowth turns both up,
    // because a jungle floor that goes quiet for whole phrases is not a floor.
    const mix = ambience.mix ?? {};
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
  if (leadPresent) {
    const lp = pal.lead ?? {};
    const featured = sec === 'breakdown';
    const contour = leadContour(rng, w);
    const scale = leadNotes(mode, 2, tuning);
    // sparse placement: E(k,16) with k breathing with tension — the lead is a
    // guest in the ether, not a soloist (visual doc §5's economy applies here too)
    const k = featured ? 5 : 3 + Math.round(tension * 3);
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
      .room(lp.room ?? 0.8).roomsize(lp.roomsize ?? 6) // drowned: the pluck problem's legal resolution (§7.2)
      .lpf(llo + lspan * tension)
      // featured (breakdown, D11): the ether becomes figure, tension gate waived
      .gain(featured ? 0.34 : 0.28 * Math.min(1, (tension - 0.3) / 0.3))
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
        .room(bl.room ?? 0.55).roomsize(bl.roomsize ?? 5)
        .gain((bl.gain ?? 0.19) * (featured ? 1.15 : 1)).pan(0.55)
        .slow(2).orbit(4));
    }
  }

  // ---- D22: the characteristic layers ----
  // The migrating pluck plays everywhere except the ambient sections (where the
  // ether is the figure) — and its costume is what changes across the set.
  if (pal.pluck && castIn && !ambient) {
    const pluck = pluckLayer(ctx, pal.pluck, mode, tuning, rng);
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
  if (pal.breath && castIn && sec !== 'intro') {
    for (const l of breathLayer(ctx, pal.breath, mode, tuning, rng, w, tension)) layers.push(gate(l));
  }
  if (pal.choir && castIn && !dropout) {
    layers.push(choirLayer(ctx, pal.choir, chord, brightness));
  }
  // D32: the squawk. Weather rather than percussion, so unlike D31's toms it
  // survives the ether-only sections — a bird does not stop calling because the
  // drums dropped out. It does leave at the late seam with everything else.
  if (pal.squawk && castIn) {
    const call = squawkLayer(ctx, pal.squawk, p.seed, voice.phraseIndex ?? 0);
    if (call) layers.push(call);
  }
  if (pal.bowl && castIn) layers.push(bowlLayer(ctx, pal.bowl, mode, tuning));
  if (pal.ghost && castIn && !ambient) {
    layers.push(gate(ghostLayer(ctx, pal.ghost, rng, pal.break?.s ?? 'jbreak')));
  }
  // spent once: the hoover, on the canopy's drop bar. 1992, once, never again.
  if (pal.hoover && sec === 'peak' && firstPhraseOf && !silent) {
    layers.push(hooverLayer(ctx, pal.hoover, mode, tuning));
  }

  return stack(...layers);
}
