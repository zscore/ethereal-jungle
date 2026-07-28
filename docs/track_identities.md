# Four Tracks, Four Casts — the set's emotional and instrumental arc

Ideas for giving each of the four tracks its own *identity*, in the terms the
system already speaks: modes (§2.2), streams (§3.1), the cast (§7.2), and
Klangfarbenmelodie as the cheapest variation operator there is (§7.3). This is
the design half of **D12** (per-track instrumentation palette, deferred until
D11 landed — it has, so this is now unblocked).

**Status: implemented as D22.** Everything below is built and under test —
`warmth` and the palettes are data on `TRACKS` (`src/bus.js`), the voicing and
tuning axes live in `src/music/scales.js`, the cast in `src/music/generators.js`,
and the claims this document makes are checked in `test/palette.mjs` (offline,
exact) and `tools/cast_audit.mjs` (in-browser, does it actually render). Where
the build departed from the sketch, the text below says so.

**Vocabulary.** "Section" is already taken: `SECTION_LAYOUT` in `bus.js` is the
in-track form (intro → build → groove → breakdown → build2 → peak → release).
The four things this document is about are the **tracks** — undergrowth, forest
floor, canopy, zenith. Every track still runs the full seven-section form; what
changes is *who is playing it*.

## 0. The arc, in one line

> Dark and close → wet and walking → **high and joyful** → bright, vast and
> unhappy.

The first three are the obvious ascent. The fourth is the interesting one: the
zenith should be *more* ethereal than the canopy and *less* happy. Joy peaks at
the canopy — which is where the set's climax already is (`brightness [0.55,
0.80]`, `peak: 1.00`, ~0.62 of the set: the golden-ratio point) — and the zenith
is the **afterward**: the air above the last leaves, where there is nothing to
be happy *about*. §2.2's "ascent without arrival," taken literally.

## 1. The problem: brightness is not joy

Right now `brightnessAt` is the only harmonic axis, and it drives the mode
ladder monotonically upward: zenith sits at 0.80–1.00, i.e. **ionian/lydian —
the two happiest modes in the system**. Under the current mapping, "purely
ethereal and less happy" is unreachable at the top of the set. The mode ladder
is doing two jobs (how bright, how glad) and they need to come apart.

**Proposal — a second authored axis, `warmth`.** Brightness keeps choosing the
mode. Warmth decides how much *gladness* the arrangement extracts from it:

| carries joy | carries etherealness |
|---|---|
| the **third** in the voicing (and the 6th) | quartal/sus stacks, no third |
| chords that are **in tune** (beatless) | detune, stretch, beating |
| the backbeat affirmed, hats dense | anchors thinned, rhythm as texture |
| faster harmonic rhythm | 8-bar re-voicings, or none |
| bass with a fundamental you can stand on | bass registered up, or absent |
| short room, near reverb | huge low-DRR space |

Warmth is authored per track and blended across seams by the same smoothstep as
brightness, so both media can sample it (the visuals get it for free: canopy
saturation and gold, zenith desaturated white-blue).

```
                undergrowth   forest floor    canopy      zenith
brightness      0.10→0.30     0.30→0.55     0.55→0.80   0.80→1.00   (unchanged)
warmth          0.15          0.35          0.85        0.10
tension peak    0.70          0.85          1.00        0.60        (unchanged)
```

The zenith is then the one place in the set where the two axes **move against
each other** — brightness still climbing, warmth falling off a cliff. That is
exactly the unexplored move `scene_plan.md` §6 flags as "probably potent," and
it is what makes the last track read as awe rather than triumph. The emotion to
aim at is **altitude sickness, not grief** — thin air, not sadness.

## 2. The continuity core (what never changes)

Variety is only legible against invariance. Six things run the whole set and
are never re-cast:

1. **The break's σ-machinery** — `permuteBreak`, the anchors, the wildness knob.
   The break changes *costume* per track; the permutation logic never does.
2. **The kick/snare skeleton** and its `duckorbit` sidechain — the coupling
   constant of both media (§3.3).
3. **The pad as the ether spine** — the layer that survives every seam and every
   dropout (§6.1's common tone). Its *waveform, register and tuning* change per
   track; its function does not.
4. **`MOTIF`** — one melodic cell, transformed (§6.4). New instruments state it;
   nobody gets new tunes.
5. **The ambience bed** (D16/D26) — already per-biome, already crossfaded.
6. **The migrating pluck.** One organic pluck token appears in every track and
   slowly crosses stream space: **dry and gridded in the undergrowth → wetter
   each track → fully drowned and unmetered at the zenith.** §7.2 notes a pluck
   is stream-ambiguous and has exactly two legal resolutions; this spends the
   whole set moving from one to the other. It is the single slowest-moving
   variable in the piece, and it is Klangfarbenmelodie applied to the set's own
   form rather than to a phrase.

Everything below is what gets re-cast *on top of* those six.

## 3. Tuning — the literal answer

Each track gets a tuning treatment, and the treatments themselves tell the
story. The key claim: **the canopy is the only track that is in tune.**
Consonance is spent like everything else.

| track | temperament | width | register centre |
|---|---|---|---|
| **undergrowth** | **sag**: −4 ¢ per octave above the root — the stack leans downward, the world subsides | narrow, 6 ¢ — slow muddy beating | pads oct 3–4, nothing above oct 5 |
| **forest floor** | plain 12-TET | 9 ¢, plus ±18 ¢ vibrato on the breath voice | pads oct 4–5 |
| **canopy** | **just**: major third voiced 13.7 ¢ flat (386 ¢, not 400 ¢), fifth 2 ¢ sharp — the chord actually locks | 12 ¢ on the pad only; the thirds are clean | pads oct 5, lead oct 5–6 |
| **zenith** | **stretched octaves**: ≈ +3.6 / +8.4 / +14.4 ¢ cumulative going up (Railsback/gamelan stretch) — nothing ever settles | 18 ¢ + stretch: maximal shimmer, zero lock | pads oct 5–6, no fundamental below oct 2 |

Out-of-tune-and-dark → **in-tune-and-glad** → out-of-tune-and-bright. The
listener will not name the mechanism and will absolutely feel it.

**As built**, sag and stretch are the *same parameter with opposite signs* —
`tuning.stretch`, cents per octave from the root, applied slightly
superlinearly. That is better than the two mechanisms this document originally
sketched: the undergrowth compresses the stack, the zenith expands it, and the
canopy replaces the whole business with just intonation. One number per track,
and the arc is legible in the data. (The original sketch had the undergrowth's
pad drifting −4 ¢ *across each phrase*; that needs pitch modulation inside a
held note, which the renderer cannot express — and the registral version says
the same thing better, because it is the chord's shape that sags, not its
tuning stability.) Width is applied by splitting every pad voice into a beating
pair, because superdough's `detune` control only reaches the supersaw's
`freqspread` and is silently ignored on a stock oscillator.

## 4. The four casts

Each track: a one-line identity, its break costume, what happens to the standing
layers, **two characteristic instruments** (the new faces), and **one gesture
spent exactly once** — first appearances are events, so they belong at
structural boundaries (§5, §7.3's novelty budget).

Everything characteristic below is *synthesized*, not sampled, on purpose: the
palette must degrade gracefully to the local CC0 kit with no remote pack
(README §licensing, D12's own caveat).

### 4.1 Undergrowth — "the floor that breathes"
*locrian/phrygian · warmth 0.15 · tension peak 0.70*

Dark, close, low-ceilinged, damp. Nothing in this track is allowed above
octave 5 — the world has a lid, and that lid is what the next three tracks
break through.

- **Break costume:** the most degraded of the four. `coarse(2)`, mild `crush`,
  `lpf` ~3.5 k with no top end, short room. Loose and behind the beat (*Funky
  Drummer* if the dev pack is present; `jbreak` low-passed otherwise).
- **Standing layers:** pads narrow-detuned and low; bass is the Reese below;
  hats damp and closed, `lpf` 6 k, low in the field.
- **Characteristic 1 — the Reese bass.** Two/three saws detuned ~8 ¢ in the
  bass register (`s('supersaw').unison(3).spread(0).detune(0.08)`), **split-band
  with a clean mono sine sub** on the same note (§7.2's one rule with teeth:
  wide detune below 150 Hz smears the floor). Stasis outside, seething inside —
  the thesis compiled into one patch, and the right place for it is the bottom
  of the world.
- **Characteristic 2 — the log-tap.** Hollow wooden tuned percussion: FM sine at
  an inharmonic ratio (`fmh: 3.5`, `fmi` on a fast decay envelope), 120 ms
  decay, **dry**, hard-panned pairs, struck on the break's non-anchor ghost
  positions. This is the migrating pluck at its *near/dry* extreme — tuned
  percussion locked to the grid, the legal resolution that the zenith will
  eventually abandon.
- **Spent once:** the very first bar of the set — one log-tap alone, dry, before
  any bed. The set's first sound is a stick on wood.
- **Forbidden here:** shimmer, bells, anything above oct 5, any clean third.

### 4.2 Forest floor — "water and wood"
*aeolian/dorian · warmth 0.35 · tension peak 0.85*

The floor learns to walk. Humid, rhythmically the most *aggressive* track
(tension 0.85 against undergrowth's 0.70) but still emotionally cool — the
violence arrives before the joy does.

- **Break costume:** tight and crisp, tuned up (`speed(1.02)`), much less
  degradation, a real snare crack with room on it (*Think*, or `jbreak`
  un-filtered with a hair of `shape`).
- **Standing layers:** the bass swaps from Reese to an **articulate square-ish
  pluck bass** at higher talea density (E(7,16)) — the floor walking instead of
  lying down. Pads open up an octave.
- **Characteristic 1 — the breath voice.** A bamboo/duduk-ish tone: sine plus
  band-passed noise, ±18 ¢ vibrato, slow attack, playing `MOTIF` in long tones
  at half-time in the mid register. Organic, humid, unmistakably *alive*, and
  the first thing in the set with a body. (Built as two stacked layers — tone
  and air — rather than superdough's `noise` control on the oscillator, whose
  teardown throws once per note.)
- **Characteristic 2 — the dub rail.** Water made musical: a filtered feedback
  delay at a dotted-eighth (3/16 against the 4/4 — the cross-rhythm §1.4 wants)
  on the **snare and the lead only**, feedback rising with tension, fully
  soaked in the breakdown. §9.3's historical proof of concept, and the exact
  audio twin of this biome's drips and rain bed.
- **Migrating pluck here:** the log-tap gets `room(0.4)` and loses its grid lock
  on 1 note in 3 — one step toward the far stream.
- **Spent once:** at this track's peak, the dub rail's feedback goes past unity
  for one bar and eats the snare — the only self-oscillation in the set.
- **Forbidden here:** bells, choir, anything that reads as *bright*. This track
  is wet, not lit.

### 4.3 Canopy — "the joy peak"
*dorian/mixolydian · warmth 0.85 · tension peak 1.00 · the set's climax*

Light through leaves. The one track allowed to be **glad**: thirds present and
in tune, sixths added, harmonic rhythm doubled to every 2 bars, backbeat
affirmed, hats at double-time density. Everything that has been withheld for
ten minutes is granted here — and taken back afterwards.

- **Break costume:** the fullest and cleanest of the four; the only track where
  the break plays wide open with its top end intact.
- **Standing layers:** pad voicing swaps from `{1,3,5,7,9}` to **`{1,3,5,6,9}`**
  — the added 6th is this idiom's glad chord, and the 7th's shimmer stepping
  aside for it is audible as *warmth*, not as a lost note. Thirds tuned just
  (§3). Bass gains a real fundamental and a mild `shape`.
- **Characteristic 1 — FM bells / DX e-piano.** Slightly inharmonic
  (`fmh: 3.0` with an enveloped index; a Rhodes-ish `fmh: 1.0, fmi: 2` for the
  softer bar), doubling the lead an octave up. §7.2: over a static maj7/6 pad
  the mistuning of partials reads as **light, not error**.
- **Characteristic 2 — the vowel choir.** The pad, duplicated through a formant
  filter (`vowel('a')` → `vowel('o')` as brightness climbs), wide and behind
  everything. The voice is the strongest attractor in the mix, so it is spent
  once per set — here, at the golden-ratio point, because that is where the
  system's biggest gun belongs.
- **Migrating pluck here:** the log-tap becomes a **wet kalimba/harp token**,
  `room(0.75)`, off-grid, ringing — halfway across.
- **Spent once:** the **hoover** as lead-weapon on the peak's drop bar. 1992,
  once, and never again. (§7.2's rave-lineage semiotic; the near stream's one
  moment of costume violence.)
- **Forbidden here:** nothing. This is the permissive track — which is the
  *reason* the other three read as restrained.

### 4.4 Zenith — "cold rapture"
*ionian/lydian by pitch class, but no joy · warmth 0.10 · tension peak 0.60*

Above the last leaves. Bright and empty. The mode ladder is at its top, and
every mechanism that turns brightness into gladness has been switched off.

- **The third is removed.** Voicing goes **quartal/sus** — degrees
  `{1, 2, 4, 5, 8}` stacked in fourths, with the lydian ♯4 available as an upper
  partial. The mode's brightness is entirely present in the *collection* (raised
  4th, raised 7th) and entirely absent from the chord's affect: bright, hollow,
  non-cadential. This one change does most of the work.
- **The floor is removed.** Bass registers up an octave to a bare sine, and
  drops out entirely for whole phrases. Altitude means *nothing underneath you*,
  and that is a mix decision before it is a metaphor.
- **Break costume:** present but dematerialised — high-passed (the drums lose
  their body), soaked in a long reverb, half the anchors thinned, slices
  reversed with rising probability. Hats are gone; their euclid mask now drives
  a high-passed granular hiss, so **rhythm survives as texture**.
- **Characteristic 1 — the glass bowl.** Chowning-ratio FM (`fmh: 2.76`), very
  long attack and release, `roomsize` at maximum, wandering on `drift(t)`.
  Inharmonic partials over a quartal stack, in stretched tuning: shimmer with
  nothing to resolve to.
- **Characteristic 2 — the granular ghost of the set.** Feed *the break itself*
  into a granular cloud — half-speed, reversed, drowned, no skeleton under it.
  §3.4's timestretch artifact as weather, and the **audio sibling of the corpus
  shrine** (D25): at the top of the set the piece plays back its own earlier
  material as ether. The set stops being four tracks and becomes an argument
  about one (§6.4).
- **Migrating pluck here:** fully drowned. Unmetered, `room(0.95)`, `roomsize`
  huge, one strike every few bars, unrecognisable as the dry stick from bar one
  — which is the point.
- **Spent once:** in the release, everything leaves except one sine and the wind
  bed for a full phrase — the set's only true silence — before the loop falls
  back into the roots (brightness 1.0 → 0.1, the dive the timeline already
  makes).
- **Forbidden here:** any major third, any backbeat affirmation, any dry
  transient, any warmth in the reverb. If a bar sounds *pleased*, it is wrong.

## 5. The rotation grid

Continuity and change at a glance. Rows are the standing layers, columns the
tracks; a cell that repeats is a thread the listener can hold onto.

| layer | undergrowth | forest floor | canopy | zenith |
|---|---|---|---|---|
| break | crushed, low-passed, loose | tight, tuned up, dry | full, open, clean | high-passed, reversed, drowned |
| kick/snare | as written | as written + dub rail | as written, backbeat forward | thinned to half |
| hats | damp closed | wet, drip-like | bright, double-time | granular hiss |
| bass | **Reese** + sine sub | square pluck bass | fundamental + shape | bare sine, often absent |
| pad | narrow, low, sagging | open, oct 4–5 | just thirds, +6th | quartal, stretched |
| lead | rare, low | breath voice | **FM bells** doubling | glass bowl |
| pluck | dry / gridded | half wet | wet, off-grid | drowned, unmetered |
| new face 1 | Reese | breath voice | FM bells | glass bowl |
| new face 2 | log-tap | dub rail | vowel choir | granular ghost |
| new face 3 | — | — | **the squawk** (D32) | — |
| spent once | the first stick | delay self-oscillates | the hoover | the silence |

Note the shape of the last three rows: two new faces per track, one per-track
event, and **eight new sounds across a twenty-minute set** — that is a slow
enough introduction rate for each one to register as an event rather than as
decoration (§5's novelty budget, 80/20).

**D31/D32 spend a ninth**, and only the canopy pays: the toucan is a third new
face in the track that already had the most. That is a real cost against the
budget this section is arguing for, and it is taken knowingly. D31 spent it on
a tom kit and was reversed by ear; D32 spends it on a single call every other
phrase, which is the cheaper version of the same expenditure — an event rather
than a layer, and one that shades into the biome bed it is standing in front
of. It still sharpens §7's last open question below, which was already asking
whether the canopy is too permissive.

## 6. What this costs to build

The architecture already wants this — D12 called it "orchestration downgraded
to data, so it belongs in the authored timeline (bus.js), not in generators."

1. **`bus.js`** — add `warmth` and a `palette` object to each entry of `TRACKS`,
   plus `warmthAt(t)` next to `brightnessAt(t)` (same smoothstep seam blend, so
   the palette crossfades the way the ether already does).
2. **`scales.js`** — `padVoicing(mode, warmth)`: thirds present above ~0.5,
   quartal below ~0.25, with the just/stretched cent offsets as a per-track
   table. This is the one file where "less happy" is actually implemented.
3. **`generators.js`** — replace the hardcoded `.s('sawtooth')` / `.s('triangle')`
   with reads from `p.palette`. The generators' *shape* does not change; that
   discipline is the whole point of the D12 framing.
4. **New layers** — the characteristic instruments are each ~10–20 lines beside
   `buildLead`, gated by section and track exactly like the lead already is.
5. **Order to build in** (one variable at a time, D13's rule): warmth + voicing
   first — it is the largest audible change and needs no new sounds at all —
   then the tuning table, then the eight instruments, then the spent gestures.

**Acceptance criteria.** (a) A listener dropped into a random 10 s window can
name the track. (b) Asked to rate canopy vs zenith on *bright* and on *happy*
separately, they rate zenith equally bright and much less happy — if only
"bright" moves, warmth is not doing its job. (c) A unit test in the shape of
`test/weather.mjs`: for warmth < 0.3, `padVoicing` contains no major third at
any brightness. (d) Everything still runs with the remote sample pack absent.

**Where it landed.** (c) and (d) are `test/palette.mjs`, along with checks that
warmth is continuous across every seam and the set loop, that the migrating
pluck really does get wetter each track (0.05 → 0.40 → 0.75 → 0.95 room) and
change orbit, that each characteristic instrument appears in exactly one track,
and that each spent gesture fires exactly once. (a) and (b) are listening
questions and remain open — they are the reason this was built. One thing the
build turned up that no acceptance criterion would have: the app had never
loaded superdough's AudioWorklets at all (`initAudioOnFirstClick` registers a
listener for a click that has already happened), so every worklet-backed effect
would have been dropped in silence. Nothing used one until these costumes did.

## 7. Open questions

- **Does the zenith want the root to move?** D13 is deliberately deferred, and
  this design spends its differentiation budget on warmth and palette instead —
  deliberately, so the thesis stays unspent. But if one track ever moves, the
  zenith is the candidate: up a fifth, same mode, so the collection brightens
  while the floor loses its footing. Revisit only after warmth is audible.
- **Should warmth drive the visuals directly, or only through palette?** The
  bus makes it free either way; the risk is that gold-vs-white becomes a
  literal restatement of something the music already says.
- **Does the migrating pluck survive the set loop?** After the zenith's silence
  the set dives back to the roots and the pluck must reappear dry — which reads
  either as a beautiful reset or as an error. Worth hearing before deciding.
- **Is the canopy's permissiveness too permissive?** Bells + choir + hoover +
  open break in one track is a lot of first appearances close together. The
  alternative is moving the vowel choir to the zenith and letting it be *cold* —
  formant-shifted up, which §7.2 calls the anatomical brightness axis. That
  might be the better zenith than the glass bowl.
