# Audio Pizzazz — the brainstorm

Status: **proposal only. Nothing here is built.** This is the audio-side
counterpart to `visuals_expansion_proposal.md` (A–E), `visuals_fancy_proposal.md`
(F–J) and `visuals_pizzaz_proposal.md` (K–M) — same ladder, so the item letters
continue at **N**. Where those three made the picture worth looking at, this one
asks the question nobody has asked with numbers: *is the music worth listening
to for six and a half minutes, twice.*

**How this was made.** Two instruments, then five parallel brainstorms.

- **Offline**: the set compiled exactly as `engine.js` compiles it —
  `makeSetPattern` queried across all 272 bars at six seeds — which yields every
  event's sound, pitch, gain, orbit and control set. Census scripts, not opinions.
- **Recorded**: `tools/spectrum_probe.mjs` (D33) on eight track×section positions
  plus two `--mute` A/Bs. This is the first time anything in the project has
  compared the four tracks' actual spectra to each other.
- Then five agents read the source in parallel — cast, harmony, effects,
  arrangement, and an outside-view pass on genre craft. Their reports are the
  raw material; this document is the synthesis and the ranking.

Everything in §1 is a measurement. Everything after it is an argument.

---

## 1. The honest diagnosis

The brief was "add interest and variety, especially to the first two tracks."
The measurements say the first two tracks are not *under-decorated* — they are
**structurally emptier than the last two**, in five separable ways. Decoration
added without fixing these will be decoration on the same problem.

### 1.1 The undergrowth fields no characteristic instrument at all

```
undergrowth    palette keys:  8   CHARACTERISTIC LAYERS: 0  → NONE
forest floor   palette keys: 10   CHARACTERISTIC LAYERS: 2  → breath, dub
canopy         palette keys: 12   CHARACTERISTIC LAYERS: 4  → bells, squawk, choir, hoover
zenith         palette keys: 11   CHARACTERISTIC LAYERS: 3  → bowl, ghost, silence
```

`track_identities.md` §4.1 promises the undergrowth two characteristic
instruments. Neither is a layer:

- **The "Reese" is a flag on the bass.** `generators.js:1176` —
  `if (bp.detune) layers.push(body(bp.detune / 100, g * 0.9))`. It is the same
  isorhythmic line duplicated 8 ¢ up, and its filter is `lo + span * tension`:
  **one number per phrase, held.** No sweep, no notch, no movement. A Reese
  without motion is a chorus.
- **The log-tap is the shared migrating pluck**, which all four tracks run. It
  is the continuity device (§2's list of six invariants), so it cannot also be
  this track's identity.

Counting exclusive layers, the undergrowth has **zero** and the forest floor
**one** (`breathLayer` — the dub rail is a `.delay()` send on layers that already
existed). `test/palette.mjs`'s "characteristic instruments are where they belong"
block tests three tracks; the undergrowth is absent from it, because there is
nothing to test.

The listener meets this piece at its thinnest point and stays there for 97
seconds.

### 1.2 There are eleven chords in six and a half minutes — and the forest floor has one

The pad calls `padVoicing(mode, warmth, …)` once per phrase and holds it for
four bars (`.slow(4)`, `generators.js:1226`). Mode is `round(brightness × 6)`,
which steps about twice per track.

| track | distinct pad chords in 68 bars |
|---|---|
| undergrowth | **2** (phrygian D–Eb–G–A–D → aeolian D–E–G–A–D at bar 52) |
| forest floor | **1** |
| canopy | 4 |
| zenith | 3 |

**Three of the set's authored mode changes are inaudible**, filtered out by the
voicing tables:

- Forest floor, bar 32, aeolian → dorian: those modes differ **only at degree 6**,
  and `neutral = [1,3,5,7,9]` does not contain degree 6. Both voice
  `D4 F4 A4 C5 E5`. **The track is one Dm11 chord for its entire length**, and
  its single authored harmonic event never reaches the speaker.
- Canopy, bar 56, mixolydian → ionian: differ only at degree 7; `glad =
  [1,3,5,6,9]` has no 7th.

Chord changes per minute across the whole set: **≈0.6**. Longest unchanged
chord: **68 bars**. The stasis thesis (theory §2.1) is not merely honoured, it is
over-honoured by roughly a factor of four — and three quarters of that is a
table bug, not a decision.

### 1.3 The bass is already moving under a pad that refuses to agree

One undergrowth groove phrase, every note below MIDI 55:

```
D3 · Bb2 · A2 · Bb2 · D3 · A2 · F2 · D3 · Bb2 · A2 · Bb2 · D3 · A2 · F2
```

That is bVI–V–bIII motion — real harmonic implication, every phrase, under a
static quartal stack that never acknowledges it. **The set's harmony is not
static because nothing moves. It is static because the layer that moves and the
layer that names the chord are never the same layer.** This is the most
important single sentence in the document: almost all the harmonic pizzazz
available here costs no new pitch material and spends none of the
single-tonal-centre thesis.

### 1.4 Nothing in the set has any top end

Recorded octave-band energy, undergrowth groove:

```
    0– 120 Hz   11.5%          1000–2000 Hz    4.6%
  120– 250 Hz   38.1%   ←      2000–4000 Hz    0.4%   ←
  250– 500 Hz   27.0%          4000–8000 Hz    0.1%   ←
  500–1000 Hz   18.2%
```

**Two to eight kilohertz is half a percent of the mix.** Every track is the same
story (forest floor 2.4%, canopy 2.7% — and the canopy's brief explicitly says
"top end intact").

Two mute A/Bs name the culprit, and the answer is nobody:

| undergrowth groove | 2–4 kHz | 4–8 kHz |
|---|---|---|
| full mix | 0.4% | 0.1% |
| `--mute=hats` | 0.4% | 0.2% |
| `--mute=break` | 0.4% | 0.6% |

**Removing the hats changes the top end by zero.** They are 198 events per track
of pure CPU — `palette.hats.lpf` says 5500 and they still contribute nothing.
The whole "hats are fatiguing" thread in `section_ideas.md` has been tuning a
layer that is inaudible.

Meanwhile the low-mids are piled up: **120–250 Hz is 38% of the undergrowth
groove, 47% of its peak, and 53% of its breakdown** — where only **0.6%** of the
energy is below 120 Hz. The undergrowth reads *boxy*, not heavy: no real sub, no
air, everything in the honk band.

And a resonance at **879 Hz rings in all four tracks** (+24 to +37 dB prominent,
still present in the quietest frame; worst in the undergrowth breakdown). 879 Hz
is A5 — the fifth of the D root, present in every pad voicing in the set. It is
the one pitch a listener will get tired of.

### 1.5 After bar 16, the cast never changes again

16-bar rosters, ambience excluded, all four tracks:

```
bars  0–15   the standing arrangement
bars 16–31   + the lead
bars 32–47   (identical)
bars 48–63   (identical)
```

One instrument arrives at bar 16 and then nothing new happens for fifty bars.
Section roster similarity agrees: `peak→release` is **1.00** in the undergrowth
and canopy; `build2→peak` is **1.00** in the forest floor and zenith. The
seven-section form collapses to three distinct casts — *intro*, *breakdown*,
and *everything else*.

Related, and found by the arrangement pass: **every section is 11.4 seconds**.
`SECTION_LAYOUT`'s weights sum to 15 and there are 15 phrases, so one weight is
one phrase and six of seven sections are exactly two phrases long. `firstPhraseOf`
and `lastPhraseOf` are therefore *the same two phrases* — there is no middle of a
section to put anything in.

And there are **no fills anywhere in the body of a track**. In 389 seconds the
only non-loop gestures are the seam fill, the peak gain slam, the build2 dropout
bar, the hoover, the dub oscillation and the D18 landing. That is **240 phrase
endings per pass with nothing on them.**

### 1.6 The drop does not drop

Summed gain per bar, undergrowth: groove 21.7 → build2 21.8 → **peak 24.3** →
release 22.0. The recordings agree: groove averages −11.4 dBFS, peak −10.7 dBFS.
**Seven tenths of a decibel.** The arrangement announces an arrival the mix does
not deliver.

### 1.7 A different seed barely changes anything

Mean pairwise similarity over six seeds (1, 7, 42, 1337, 90210, 555):

| | same instruments? | same hits in the same places? |
|---|---|---|
| undergrowth groove | **0.88** | 0.53 |
| forest floor groove | **0.88** | 0.50 |
| canopy groove | **0.95** | 0.52 |
| zenith peak | **0.96** | 0.59 |

The break re-permutes — 0.5 is healthy — and *nothing else does*. Rerolling the
seed gives the same instruments playing the same form with the drum fill
shuffled. This is why listening to random seeds feels like listening to one
piece: at the arrangement level, it is.

### 1.8 Every character control is a constant

Distinct values taken across a whole 68-bar track:

```
undergrowth    hcutoff 420 (1)   crush 8 (1)   resonance —   speed —   shape —
forest floor   hcutoff 900 (1)   resonance 4 (1)   speed 1 (1)   shape 0.15 (1)
canopy         resonance 6 (1)
```

Only `cutoff`, `gain` and `pan` ever move. Every effect that gives a track its
*character* is set once in `bus.js` and never touched again — the definition of
wallpaper. The project has `drift(t)`, `tension`, `brightness` and `warmth` all
available as functions of time, and spends **none** of them on an effect
parameter. The undergrowth uses no `delay`, no `shape`, no `speed`, no `vowel`,
no `resonance`: it is the least-processed track as well as the least-populated.

---

## 2. Free capacity found in the engine

The renderer is far more capable than the piece assumes. Verified against
`node_modules/superdough/` with file references, and cross-checked by grep for
zero uses in `src/`:

| capability | where | status |
|---|---|---|
| **Filter envelopes** `lpenv/lpattack/lpdecay/lpsustain/lprelease/fanchor` (+hp/bp twins) | superdough | **0 uses.** Every filter in the set is a constant per event. The mechanism behind most "produced" sounds in this genre, entirely absent. |
| **`.lfo()` / `.env()` / `.bmod()`** | `modulators.mjs`, targets at `superdoughdata.mjs:8` | 0 uses. Attach an LFO or ADSR to *any* control. |
| **`ir` — convolution with any loaded sample as impulse response** | `superdough.mjs:884,940`; `reverb.mjs:26` (+ `irspeed`, `irbegin`) | 0 uses. **This repo ships twelve CC0 field recordings. They are twelve impulse responses nobody has used.** |
| **`stretch` — a real phase vocoder** | `superdough.mjs:627`, worklet `phase-vocoder-processor`, param `pitchFactor` | 0 uses. Pitch and rate come apart. `section_ideas.md` still lists shimmer as blocked on "if the renderer grows the fx" — it grew them, and **D32's "we'd need a phase vocoder" rejection is stale.** |
| `distort` + `distorttype` (9 curves) | `helpers.mjs:558` | 0 uses |
| `tremolo*` (5 controls), `transient`/`transsustain`, `compressor*` | superdough | 0 uses |
| `bandf`/`bandq` + envelope + LFO | superdough | 0 uses — an entire unused filter |
| `ftype('ladder')` + `drive`, `djf` | superdough | 0 uses |
| `roomfade`/`roomlp`/`roomdim` | superdough | 0 uses. D35 gave each orbit a *size*; these give it a *character*. |
| `lpsync`/`lprate`/`lpdepth` — tempo-synced filter LFO | superdough | 0 uses |
| `s('bus')` + `bus`/`busgain` — a genuine send/return | `synth.mjs:372` | 0 uses ⚠ needs a runtime test |
| `registerZZFXSounds()` | exported, never called from `engine.js` | one line unlocks a whole one-shot zap/riser/siren synth |
| **Orbit 0, and orbits 5+** | — | orbit 0 is empty; 1–4 are the frozen stream map. Each orbit is an independent reverb + delay + djf. |
| Strudel pattern ops `rev`, `palindrome`, `iter`, `chunk`, `linger`, `bite`, `brak`, `splice`, `press`, `stut`, `off` | `@strudel/core` | 0 uses in `generators.js` |

**Two caveats that matter, both found while checking.** superdough's `nudge`
control appears only in `sampler.mjs:270,307` — it is ignored by `synth.mjs`, so
samples can swing and synth voices cannot. (Strudel's pattern-level
`.late()`/`.early()` works on anything, and `pluckLayer` already uses it.) And
`delaytime`/`delayfeedback`/`roomsize` are **orbit-global**, set by whichever
event asked last — exactly the bug class D35 fixed for `roomsize`, so any new
`delay` user on orbit 1 or 4 must match the dub rail's 3/16 or fight it.

---

## 3. What to do first

Twelve items, ordered by measured audibility per line. Every one of them is
**S effort and free** unless marked. The first six are aimed squarely at the
first two tracks.

1. **Fix the voicing tables so the authored mode changes sound** (§N1). The
   forest floor's one harmonic event in 97 seconds currently does not reach the
   speaker. ~3 lines.
2. **The moving bass root** (§N2) — per-phrase harmonic centre with a held pedal,
   so the chord *changes name* every four bars with no new pitch material. ~12
   lines, and it is the single biggest musical win in this document.
3. **The Reese breathes** (§P1) — `.lpsync(0.25).lpdepth(0.6).resonance(6)` on
   the bass that is documented as "seething inside" and is currently a static
   filter. Three calls, no new layer, the undergrowth's identity delivered.
4. **The turnaround** (§R1) — a fill bag masked `[0 0 0 1]/4` with a per-section
   lift. Fixes 240 unmarked phrase-endings per pass.
5. **Diatonic planing of the pad stack** (§N3) — three chords out of the
   undergrowth's one, containing no thirds, so warmth 0.15 is preserved exactly.
   ~6 lines.
6. **Filter envelopes on everything with a static `lpf`** (§Q1) — turns existing
   layers into instruments before a single new one is added.
7. **Drop variants** (§R3) — both `section_ideas.md` and D18's own "revisit when"
   note ask for this, and the idiom is already written in `seamFillFor`.
8. **Make `drift(t)` available to the music** (§Q3). The visuals read it five
   times over; the music reads it **zero times**. That is an asymmetry in the
   `M(S)` / `V(S)` thesis, not just a missing effect.
9. **Per-orbit room character** (§Q2) — `roomlp`/`roomdim` finish what D35
   started; the undergrowth's room becomes wet leaves rather than a small hall.
10. **The half-time flip in the undergrowth's build** (§R2) — the only device
    here that changes the *felt* tempo, in the track that needs it most.
11. **The stridulator** (§P2) — answers §1.4 with a creature rather than a
    shimmer: band-passed noise at 3.6 kHz chopped by a synced tremolo.
12. **The thunderclap** (§P4) — promote the already-shipped `ambthunder` from
    ambient accent to a gesture, reversed across the build2 dropout bar.

Two structural items are worth more than most of the list but cost more:
**per-track `SECTION_LAYOUT`** (§R6, M) is the only device that fixes the stated
complaint — every track currently plays the same seven-section shape at the same
proportions — and D11's own note flagged it long ago. And **D13, key movement**
(§N7) deserves its own change and its own listen, as the README says.

---

## Tier N — harmony: making the chords move

The governing insight is §1.3: the bass already implies harmony the pad refuses
to confirm. Everything in N1–N5 exploits that and spends **no** pitch material
outside the current mode, so the single-tonal-centre thesis is untouched.

### N1. Make the authored mode changes audible (S) — *the bug fix*
Three of the set's mode changes are filtered out by `PAD_DEGREES`
(`scales.js:74`). The forest floor's is the one that matters. Three options in
ascending cost: add degree 6 to `neutral` **voiced an octave up as degree 13**,
so it reads as colour rather than the "glad" marker the floor is not allowed;
put degree 6 into the bass gravity cycle so the change is heard in the *floor*
rather than the ether; or re-author the brightness range (worst — it moves an
authored curve to work around a table). Ship the first two.

### N2. The moving bass root — slash chords under a static pad (S) — *the big one*
`generators.js:1150-1166`. Replace the fixed tonic gravity with a per-phrase
harmonic centre drawn from a short cycle of scale degrees, and pull the walk
toward *that* degree rather than always degree 1 — plus a held pedal voice on
the centre, in whole notes (copy the D18 landing pedal at line 1191).

```js
const ROOT_CYCLE = { undergrowth: [1,1,6,1,1,3,1,5], 'forest floor': [1,1,3,1,6,1,3,2] };
const centre = ROOT_CYCLE[track][phraseIndex % cycle.length];
const up = rng() < 0.55 - 0.5 * ((ci - centreIdx) / top);   // centre gravity, not tonic gravity
```

The chord changes name every four bars, with no new pitch material, no voicing
change, and no possibility of a wrong note — every degree is in the mode. In the
undergrowth, whose pad is a third-less quartal stack, this alone converts 68 bars
of one chord into a progression.

### N3. Diatonic planing of the pad stack (S)
`scales.js:80`. Give `padDegrees` an offset and slide the whole degree list up
the mode. Because the offset is *diatonic* the collection never changes, so
there is no voice-leading problem by construction. Undergrowth, D phrygian,
`hollow [1,2,4,5,8]`:

| step | notes | over a D bass |
|---|---|---|
| 0 | D Eb G A D | today's chord |
| +1 | Eb F A Bb Eb | Ebmaj7♯11/D — huge, dark, still third-less |
| +2 | F G Bb C F | Dm11 |

Three chords, no thirds anywhere, warmth 0.15 preserved exactly. Cycle `step` on
a coprime phrase period. The same trick gives the forest floor `[3,5,7,9,11]` =
**Fmaj9**, the relative major, from a track that currently plays one chord for
97 seconds. ~6 lines.

### N4. The seam mode dip (S)
`bus.js:556`. The seam's brightness blend is currently a literal no-op at three
of four boundaries — it interpolates a value into itself. Dip one mode step
darker at the trough and recover onto the incoming value: one semitone in one
voice, arriving in D36's tension trough. Four boundaries that contain zero
harmonic events get one each. ~3 lines. Check `look.js` first — the camera
altitude will dip too, which is arguably a bonus.

### N5. Harmonic rhythm as a section device (S, but do N2 or N3 first)
The open item in `section_ideas.md`. A per-section table on the pad's `.slow()`
— 8 in intro/breakdown, 2 in build2/peak. **On its own this only changes the
attack rate**, so it is a rhythm device; its value is multiplicative with N2/N3.
Once the chord actually changes per re-voicing, doubling the rate at the peak is
a genuine harmonic accelerando.

### N6. Split the pad into a held frame and one moving voice (S) — *the voice-leading fix*
The pads today are one block chord with all five voices attacking together,
**always close position, always root position**, register set by a single `oct`
integer. So each track's one real chord change coincides with a fresh attack of
all five voices and reads as a *reset* rather than a *move*.

The pad must stay a block — it is the common tone across the seam (§6.1) — but
"block" and "all voices re-attack together" are not the same requirement. Split
it into a **held** pattern (the common tones, at `.slow(8)` or `.slow(16)`) and a
**moving** pattern: a change then becomes one voice re-attacking inside four
sustained ones. The "motion between notes" voice at `generators.js:1236` already
has the right instinct; this generalises it to the chord change itself.

Follow-ons once that exists, in order: a `voiceLead(prev, targetPCs)` helper
(required the moment you plane or modulate at all), inversion cycling per
section, drop-2 per track — careful, it fills the scooped middle §2.3 wants —
the bass approaching new roots by step, and suspensions, which are the only
tension a leading-tone-free system permits itself.

### N7. D13 — key movement across tracks (M, its own change, its own listen)
The README calls this "the last open music-side question… wanting a listen
rather than an argument." Here is the argument, so the listen can be informed.

**The reframing that wins it: the set already modulates.** The brightness walk
sweeps the parent collection from Bb major to A major — five fifths — across the
four tracks. That is a larger tonal journey than most records take. It is
inaudible for exactly one reason: **the bass never leaves D.** D13 is therefore
not "add modulation to a static piece." It is "let the tonic move so that the
collection movement already authored becomes legible." That is a much easier
argument to win against theory §2.1 than the one the README has been dreading.

**Recommended: roots by ascending fourths, D → G → C → F.** Register
compensation via `pad.oct` and `bass.oct`.

| track | root | pad chord |
|---|---|---|
| undergrowth | D3 (50) | D Eb G A D — *unchanged from today* |
| forest floor | G3 (55) | G Bb D F A (Gm9) |
| canopy | C4 (60) | C E G A D (C6/9) |
| zenith | F4 (65) | F G B C F (F lydian sus) |

The argument that wins it: a root up a fourth is a −1 move on the circle of
fifths, and a mode one step brighter is a +1 move. Across a track plus its seam
the two **cancel**. Measured over the whole set, the parent collection
oscillates inside a three-fifth band (Bb ↔ C) instead of marching five fifths.
**Scheme D buys four genuine tonal centres while spending less pitch-class drift
than the current design already spends** — strictly more music for strictly less
thesis. And because the mode index does not change across a seam, each boundary
flattens exactly one pitch class (E→Eb, three times), which is the correct
harmony for D36's wind-down.

Adjacent pad chords share three tones, and up-a-fourth is the plagal,
non-functional direction — which matters in a system that has spent four years
refusing leading tones.

**Rivals, and why each loses.** *Ascending minor thirds* doubles an axis that is
already saturated, which is the anti-D22 move; the cycle is symmetric, so no
track is home, and collections wander −4 to +6 fifths. *The descending lament
bass* (D–C–Bb–A) is the most attractive on paper, but the A→D set loop is a real
V→i with a G♯ leading tone arriving out of lydian, and A lydian contains no D at
all — the set's founding pitch would vanish at the top. *Motif-derived roots*
(D–F–E–A) is the most on-thesis and the least musical: a contour stretched 400×
is a fact about a spreadsheet, not a percept, and it fixes an ordering the
transform bag deliberately scrambles.

**Seam staging.** Bars 1–4, nothing moves. Bars 5–8, the **bass** moves to the
incoming root under the **held old pad** — Gm♭13, C13sus4, Fmaj9(6), all rule-3
sonorities with no dominants in them. The pad snaps at the downbeat. The D18
landing pedal at `generators.js:1191` is already 90% of this machinery.
`rootAt` must be a **step function, never lerped** — a glissando between keys is
the one thing that would sound like a bug.

**The one real code hazard**, and it is easy to miss: `tune()` measures *both*
the stretch pivot and the just lattice from `ROOT` (`scales.js:63-65`). If the
root moves and `tune` does not follow it, the canopy — the only track in the set
that locks — locks to the wrong lattice, and the single most carefully authored
consonance in the piece quietly goes out of tune.

**A footnote from the same census:** locrian never sounds. `modeAt` needs
brightness < 0.0833 and the authored floor is 0.10, so the darkest mode in the
ladder is unreachable. Whether that is a bug or a mercy is a judgement call, but
it should be a deliberate one.

---

## Tier P — the cast: new voices, eleven of them for tracks 0 and 1

The §1.1 gap is the target: give the undergrowth three exclusive layers and one
real gesture, and the forest floor two more plus an audible spent-once. That
evens the D22 novelty budget rather than blowing it — the additions land where
the count is currently **zero and one**, so the *rate* of first appearances
becomes even across the set instead of back-loaded into the canopy.

- **P1. The Reese breathes** — undergrowth, all sections · **S**. See §3 item 3.
  Best line-for-line change in the set, and it adds no brightness. A real Reese
  is *held* — a drone with movement in the filter — with the notch as the growl
  and three non-symmetric detunes (−13 / 0 / +5 ¢); the existing talea gets
  demoted to articulation.
- **P2. The stridulator** — undergrowth, groove/peak/build2 · **S**. `bandf` 3.6 k
  / `bandq` 22 noise chopped by `tremolosync(14)`: a cricket with a rhythm. The
  first use of the band-pass filter, and it answers §1.4's dead top end with a
  creature rather than a shimmer — which is the only way to put 4 kHz into a
  track whose brief forbids anything above octave 5.
- **P3. The stab** — forest floor, build/groove/peak · **M**. The missing jungle
  signifier, and the first use of `lpenv` + `lpdecay` + `resonance`. Plays the
  pad's own chord on offbeat sixteenths, so it reads as *hard*, not *lit* — which
  is what "wet, not lit" requires.
- **P4. The thunderclap** — forest floor, build2 dropout and peak · **S**.
  Promote the already-shipped `ambthunder` from ambient accent to gesture:
  reversed across the dropout bar, forward on the drop. Lands in the one bar the
  form deliberately empties, so it crowds nothing.
- **P5. The trapdoor** — undergrowth, its own peak · **S**. `penv: -24` on a saw
  for one bar: the hoover's opposite sign at the opposite end of the set. The
  undergrowth is the only track with no spent gesture at its own peak.
- **P6. The croak** — undergrowth, all sections · **M**. The undergrowth's
  punctuation, which it entirely lacks. `squawkLayer` is already fully generic,
  so the cost is one `oneshots` entry in `tools/amb_sources.json` and an
  `ingest_toms.py`-style run — **zero new generator code**.
- Then, as texture: the crackle floor, the rimshot rail (states the 3/16
  cross-rhythm out loud), the counter-knock, the reverse swell, the hollow reed
  via `s('pulse')`, the gurgle, the wobble (free once P1 exists). Plus three
  lower-priority ideas for the last two tracks.

**One non-instrument fix worth more than half this list.** The undergrowth's
lead is *mathematically almost silent*: `leadPresent` requires tension > 0.3 and
gain is `0.28 · min(1, (T−0.3)/0.3)`, but track 0's tension runs ≈0.16 / 0.34 /
0.28 / 0.70 / 0.43 / 0.22 — so outside the peak the lead sits at gain ≤ 0.12 and
is gated off entirely in intro and build. **The darkest track having no melody is
a bug, not an aesthetic.** Give `palette.lead` a per-track gate.

---

## Tier Q — effects: the wallpaper problem

§1.8 is the target. The repo uses roughly **30 of the ~150 controls superdough
implements** (three chains: per-event at `superdough.mjs:543–927`, per-orbit at
`superdoughoutput.mjs:19–130`, and this repo's master insert).

- **Q1. Filter envelopes on everything with a static `lpf`** · **S** · free.
  Every filter in the set is a constant. This one change turns existing layers
  into instruments.
- **Q2. Give each orbit a *character*, not just a size** · **S** · free.
  `roomlp` / `roomdim` / `roomfade` are the same per-orbit shape D35 already
  established for `roomsize`. The undergrowth's room becomes wet leaves
  (`roomlp 2600`, `roomdim 300`) rather than a small hall. Highest identity per
  line in the effects list.
- **Q3. Make `drift(t)` available to the music** · **S** · free — *the headline
  automation item.* Add `driftAt` to the `signals` object at `engine.js:116` and
  assign it per track: undergrowth break grit, forest-floor dub feedback, breath
  vibmod, ghost grain scatter. The governing rule, which is worth writing into
  the ADR: **tension is the authored will, section progress is the form's clock,
  and drift is the weather.**
- **Q4. Transient shaping on the break** · **S**. `transient(-0.9)` is what
  "dematerialised" actually means — a better tool for the zenith than `hpf(700)`.
- **Q5. `ftype('ladder')` + `drive` on the bass**, **`distorttype: 'asym'` on the
  break**, **`tremolo` anywhere** — three unused effects, three lines each.
- **Q6. The tuned comb on the undergrowth's pluck** · **M**. Built from an
  `.FX()` feedback delay tuned to the *mode's* root, so it re-tunes with the
  harmony. The undergrowth's signature. (Note: superdough does **not** implement
  `comb` despite it being registered in `@strudel/core`; and a delay-based comb
  is clamped to ~375 Hz max.)
- **Q7. One-shots** — uplifter, reverse reverb (`dry(0)` + `roomfade` on a spare
  orbit), the tape-stop promoted out of the seam into peak→release, the dub
  siren, the filtered noise sweep with a real envelope. All reuse the existing
  `seamFillLayer` / `SEAM_FILLS` / `.mask('[1 0 0 0]/4')` machinery and are built
  only from the shipping kit.
- **Q8. Convolve the drums through the biome** (`ir`) · **M**. One control, an
  entirely new class of sound, and the most *ethereal jungle* idea available —
  the drums are literally in the forest. At the zenith, convolve the granular
  ghost of the set through the **undergrowth's** bed: Lucier pointed at the
  set's own form.
- **Q9. The master bus.** `masterchain.js` can instantiate any superdough worklet
  by name — same AudioContext, module already loaded — which makes a **shimmer
  reverb** (pitch-shifter + `ctx.createReverb`, send driven by brightness) the
  one custom-node effect worth the trouble. Also cheap and worth it: mid/side
  width, and a safety limiter. **Not worth it:** a real sidechain compressor
  (the scheduled `duckorbit` is better here), a granular buffer (`ghostLayer`
  already does it), spectral freeze.
- **Q10. The mischief layer** (README "Next steps" #1) · **M**. Eight specific
  jokes proposed in the full report; the recommended trigger is
  seeded-and-rationed — one per set, drawn like `seamFillFor` — with a
  perform-rail override.

**Landmines, before implementing any of the above.** `.FX(room())` regenerates
an impulse response *per event* (`reverbGen.mjs:26`) — the D35 trap in a new
costume. superdough's phaser is one notch stage. `FXrelease` is mandatory for
any tail longer than the note. And there is a trap list of ~25 controls
registered in `@strudel/core` that superdough silently ignores.

---

## Tier R — arrangement and form

§1.5 and §1.6 are the targets.

- **R1. The turnaround** · **S** — *the single biggest structural win.* A
  `TURNAROUNDS` bag masked `[0 0 0 1]/4` with a per-section lift, drawn from a
  hashed rng. 240 unmarked phrase-endings per pass is the bug.
- **R2. The half-time flip** in the undergrowth's build and release · **S**. The
  only device that changes the felt tempo. Hats stay at sixteenths to hold the
  grid. There is currently **no half-time anywhere** — the break is `slice(16, σ)`
  at speed 1 in every section, and the `.slow(2)`/`.slow(4)` layers are constants,
  never devices.
- **R3. Drop variants** · **S** — slam / break-first / floor-first / stumble,
  drawn by a `dropVariantFor(trackIndex, seed)` sharing D18's idiom. Fixes §1.6.
- **R4. The hole at the top of release** · **S** — generalise `gate()` from its
  one caller into a `HOLES` table. Mini-notation nests, so sub-bar holes
  (`[1 1 1 [1 1 0 0]]/4`) are free. One line, four times per pass. The set's
  entire silence budget is currently **≈6 seconds in 389**.
- **R5. The retrograde bar**, **beat-repeat into the dropout**, **triplet `ply`**,
  **the intro pedal**, **the answering drummer**, **swing from `drift(t)`**,
  **the flam**, **literal motif recall in release** — all S, all listed in the
  full report with code sketches. Several are open items in `section_ideas.md`
  that this finishes the argument on.
- **R6. Per-track `SECTION_LAYOUT`** · **M** — the only device that fixes the
  actual complaint rather than decorating it. `sectionSpans` tolerates arbitrary
  weights today; the cost is UI and visual coupling.
- **R7. The set-pass ladder** · **S** — the answer to "what makes minute 12
  different from minute 3." `Math.floor(idx / 68)` is a free unused variable
  that says which pass of the set we are on.
- **R8. σ development, not σ re-deal** · **M** — the break currently re-permutes
  from scratch each phrase. Developing σ instead would make the drum part have a
  memory, which is what §1.7 is really asking for.
- **R9. A second break sample** · **M**. There is only one (`jbreak`), so §7.2's
  "swap breaks between sections" has never been available.

**Two implementation constraints every device above must respect**, found the
hard way by the arrangement pass: do not add draws to the shared `rng` (it
re-deals the whole set downstream — use the hashed-rng idiom from
`squawkLayer`), and `.late()` loses one event per phrase line because the
compiler dispatches per-bar into per-phrase patterns.

Also: **the granular breakdown ghost the backlog asks for is already written.**
`ghostLayer` exists but is gated `!ambient`, which excludes it from the
breakdown — the one section it was designed for. Two lines.

---

## Tier S — genre craft not yet stolen

The outside view, translated into this engine.

1. **The second break** · **M** — *highest audibility in the genre report.* Every
   record this descends from (Omni Trio, Foul Play, Bukem) stacks a soft body
   break with a hard dry snare on 2 and 4. `ANCHORS = {0,4,8,12}` already names
   the backbeats: derive a `crack` layer by `slice(16, '4 12')` on its own orbit,
   dry and slightly sharp, then push the body break back. **No new sample.**
2. **Dub throws, positionally** · **S** — `dub()` is a constant send; a *throw*
   spikes feedback on one hit and stops the source. Phrase-final snare, and into
   every breakdown. The forest floor's once-per-set self-oscillation only reads
   as an extreme if the ordinary version exists.
3. **The sub arrives late** · **S** — the sub currently plays the same rhythm as
   the mid bass. In this genre it does not.
4. **Nothing reverses into the one** · **S** — the cheapest on-thesis fix is to
   reverse the *incoming* biome bed for the bar before a landing, which makes
   §6.1's infiltrating ether a gesture rather than a crossfade.
5. **Two-step vs rolling is not differentiated** between the two tracks that most
   want it · **S**.
6. **The break's edit vocabulary is stochastic where the genre's is positional** —
   the crab, the bar-4 turnaround. §5's own argument, unapplied to the one layer
   that randomises.
7. **The intro is a kick heartbeat, not a filtered break** · **S**.
8. **Vinyl crackle ducked by the break** · **S** — gain staging you can hear, not
   nostalgia.
9. **The ragga/MC texture with no licensing problem** — *the best idea only this
   project can have.* Window `ambfrogs` / `ambcalls` with `begin`/`end` onto the
   sixteenth grid, pitch them down with `stretch`, answer with the dub rail.
   `seamFillLayer`'s `'weather'` voice already implements the mechanism; this
   promotes it from a four-bar seam fill to an instrument. **The forest is the MC.**
10. Non-jungle steals worth taking: Reich phasing on the log-tap, gamelan
    colotomy as an audible slow clock, Eno's coprime loops taken from the
    presence walks down to the audio itself, and dub's actual practice — the
    *version*, not the delay.

---

## Tier T — the mix

Not glamorous, and it gates everything above. §1.4 and §1.6 are the findings.

- **T1. Something must live above 2 kHz.** Currently nothing does, in any track.
  The hats are the obvious candidate and they are provably inaudible — either
  raise them and open them, or accept that they are decoration and put the top
  end somewhere that belongs to the world (P2's stridulator, the croak, the
  crackle floor). The undergrowth's "lid" is a good idea executed as a total ban.
- **T2. Clear 120–250 Hz.** It is 38–53% of the undergrowth's energy, and muting
  the break *raises* it — so it is the bass and the pad, stacked in the same
  octave. The pad sits at oct 0 with `lpf [700, 2000]` while the bass sits at
  oct −1 with a sub: they are fighting over the same band. Moving the pad up or
  high-passing it would buy real weight for free.
- **T3. The 879 Hz ring.** Present in all four tracks at +24 to +37 dB, worst in
  the undergrowth breakdown. It is A5, the fifth of the root, in every voicing in
  the set. N3's planing would move it on its own; a narrow cut on the ether orbit
  is the direct fix.
- **T4. Make the drop measurable.** 0.7 dB is not an arrival. Combined with R3
  and R4 (a hole before it), this is mostly free.
- **T5. Real sub.** 11.5% below 120 Hz in the undergrowth groove, 0.6% in its
  breakdown. A jungle record's floor lives at 40–80 Hz.

---

## Corrections to existing docs, found along the way

- **`track_identities.md` §4.1** says the undergrowth's break is "loose and
  behind the beat." Nothing in `buildArrangement` delays anything, and the grid
  census confirms it — one groove bar has 1–6 off-grid onsets out of ~35.
  `nudge` and `.late()` both exist, so this can become true rather than be
  deleted.
- **`section_ideas.md`** claims per-event timing nudge is unavailable. Strudel's
  `late`/`early`/`swingBy` are registered and `pluckLayer` already uses `.late()`.
  What is genuinely unavailable: superdough's `nudge` on *synth* voices, and real
  tempo change (CPS is set once, and `bus.js` converts through a constant
  `BAR_SECONDS`, so metric modulation must be implied rather than performed).
- **`section_ideas.md`** lists shimmer as blocked on the renderer growing the fx.
  It grew them (`stretch`, `superdough.mjs:627`).
- **D32** rejected an idea on the grounds that it would need a phase vocoder.
  There is one.

## Rules this must not break

Carried over from the visuals ladder, because they apply to both media, plus one
earned here:

- The six continuity invariants in `track_identities.md` §2 — the break's
  σ-machinery, the kick/snare skeleton and its `duckorbit`, the pad as ether
  spine, `MOTIF`, the ambience bed, and the migrating pluck — are what make
  variety legible. Nothing above re-casts them.
- **A gesture is spent, not sprinkled.** The visuals' hardest-won rule. Six new
  voices across the first two tracks is a real expenditure of the D22 novelty
  budget; the defence is that it *evens the rate* of first appearances rather
  than raising it, because the count there is currently zero and one.
- One variable at a time, with a listen between — the discipline D13 has been
  waiting on.
- Anything touching palettes needs `test/palette.mjs` extended (the
  "characteristic instruments are where they belong, and nowhere else" block is
  the contract), and `tools/cast_audit.mjs` re-run: the palettes are the first
  thing here to use worklet-backed effects, and superdough drops those silently.

## Verified vs unverified

**Verified by measurement or by reading the source**: every number in §1; the
whole of §2 except where marked; the `nudge` sampler/synth split; that
superdough's `stretch` control has zero uses in `src/` (the nine hits are
`tuning.stretch`, an unrelated parameter in `scales.js`); that Strudel's
`.splice()` is never called.

**Flagged unverified by the agents that proposed them**: the `.lfo()`/`.env()`
`__ids` bookkeeping at runtime; whether `s('bus')` can hold a gap-free return;
`bmod`-as-sidechain (raw audio into a gain param is ring modulation, not
ducking); the CPU cost of a per-event feedback comb; and the load cost of `ir`.

**One measurement I would not lean on**: all eight recordings show the level
falling from the first third to the last third of the window (3–5 dB). That may
be a real tendency of the phrase envelope or it may be an artifact of the
probe's seek and re-anchor. It wants a longer recording before anyone acts on it.
