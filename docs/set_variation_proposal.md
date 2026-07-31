# Set Variation — the fourth telling

Status: **built — D50.** All sixteen items landed, in two sittings: the eight
S-items (AD2, AD5, AD7, AD8, AD9, AD10, AD15, AD16) in `a2d832d`, and the eight
M-items (AD1, AD3, AD4, AD6, AD11, AD12, AD13, AD14) after them. One thing in
AD12 is deferred rather than done — P6's croak needs a field-recording ingest —
and **nothing here has been heard**; D50's closing section says what that leaves
open. Item letters continue the ladder (visuals A–M, audio N–T, fauna U–Y,
materials Z–AC) at **AD**.

The brief, verbatim in spirit: *each track stands alone well, but by the fourth
hearing the bassline, the song structure, and the instrumentation are
recognizably the same machine.* This is the set-scale complaint, and it is
distinct from the one `audio_pizzazz_proposal.md` answered (D43): that document
made each track richer *inside* the shared form; this one asks why the four
tellings still share one clock, one bass grammar, one melody policy, and one
cast schedule.

**What this document does not re-propose.** D43 already shipped turnarounds
(R1), drop variants (R3), holes (R4), the moving bass root (N2), planing (N3),
harmonic rhythm (N5), voice-leading (N6), the Reese's motion (P1), and the
weather (Q3). And several still-open pizzazz items are *exactly* this
complaint's territory — this document votes for them rather than rewriting
them:

- **R6 — per-track `SECTION_LAYOUT`** (concretized below as AD1; pizzazz itself
  called it "the only device that fixes the stated complaint").
- **R7 — the set-pass ladder** (concretized as AD5).
- **R8 — σ development, not σ re-deal** (its argument is generalized to the
  bass as AD8).
- **R2 — the half-time flip** (the only felt-tempo device; unchanged, still worth it).
- **N7 — key movement (D13)** (the deepest bassline fix of all: the bass never
  leaves D for six and a half minutes; carries the `tune()` hazard documented
  there; do it as its own change with its own listen).
- **S1/R9 — the second break / the crack layer** (endorsed as AD14).

---

## 1. The residual diagnosis — what still repeats four times

After D43, count what a listener hears four times per pass:

1. **One clock.** `SECTION_LAYOUT` (`bus.js:514`) is a single table, `SHAPE`
   (`bus.js:95`) a single curve, and all four tracks are 68 bars. The weights
   sum to 15 over 15 non-seam phrases, so section timing is *identical in bars*:
   the breakdown opens at bar 24 of every track, the drop lands at bar 40 of
   every track, on a fixed 97-second period. D43 varied what these events
   *contain* (four drop variants, seven turnarounds, four fill materials); none
   of it varies *when* anything happens. Four tellings, one metronome of form.
2. **One bass grammar.** The floor is one engine — talea `E(k,16)` × a
   gravity-bent pentatonic walk, half-time, re-dealt every phrase
   (`generators.js:1439–1556`) — wearing four patches. N2 moved its harmony and
   P1 its filter, but the *kind of line* is the same everywhere: a walk. And no
   section changes the bass's behaviour — build2's floor is groove's floor with
   different shading, in every track.
3. **One melody policy.** `leadContour` (`generators.js:746`) draws uniformly
   from the same five `TRANSFORMS` in every track and every section. The cell
   is varied constantly and developed never: minute 2's variation policy is
   minute 11's, so the motif has no arc, only a distribution.
4. **One cast schedule.** Within a track, the roster event is still "the lead
   arrives at bar 16" (pizzazz §1.5); D43 added gestures, not voices. And the
   cast is invariant across seeds — pizzazz §1.7's 0.88–0.96 same-instruments
   similarity is unchanged, because no palette decision reads the seed.

Each numbered section below owns one of these. Effort tags as usual (S = small,
M = its own change).

---

## 2. The form (song structure)

### AD1. Per-track forms — R6, finished (M) — *the headline item*

`sectionSpans` (`bus.js:529`) already accepts arbitrary weights; the cost was
always UI/visual coupling, and both read `sectionSpans` rather than assuming
the layout, so the coupling is one data field: `TRACKS[i].layout ?? SECTION_LAYOUT`.

The casts already tell four different stories; the forms should tell the same
four. Concrete tables (weights over each track's 15 non-seam phrases):

| track | layout | the form's argument |
|---|---|---|
| undergrowth | intro 3 · build 2 · groove 3 · breakdown 2 · **peak 2** · release 3 | **no build2.** A single slow arch; the trapdoor drop (P5) arrives *unannounced* — you fall through the floor, you are not marched up to it. Long intro because the set opens here. |
| forest floor | intro 1 · build 2 · **groove 4** · breakdown 1 · build2 3 · peak 3 · release 1 | the strut. The most club-shaped form for the most rhythmically aggressive track: groove dominates, the breakdown is a gasp, the build2 is real work. |
| canopy | *unchanged* (2·2·2·2·2·3·2) | the reference form. The climax track is the one that keeps the promise — everything else is legible against it (the same argument the groove bags make). |
| zenith | intro 2 · groove 2 · **breakdown 4** · peak 1 · **release 6** | the afterward. No build at all; the longest breakdown and release in the set; the drop is one thinned phrase (tension peak 0.60 already says so). A form that is mostly aftermath. |

Two structural consequences worth naming: the drop stops living at bar 40 of
every track (bars ≈40 / 44 / 40 / 32 under these tables), and sections finally
get *middles* — pizzazz §1.5 observed that at 2 phrases per section,
`firstPhraseOf` and `lastPhraseOf` are the same two phrases, so no device can
live in a section's interior. Undergrowth's 3-phrase groove and zenith's
6-phrase release repair that for free.

Code notes: `SKEL_LIFT`, `HARM_RHYTHM`, `PAD_MOTION`, `TURN_LIFT`, the hats
table and `HOLES` are all keyed by section *name* with defaults, so absent
sections cost nothing. The build2-only devices (dropout bar, riser) simply
never fire in the undergrowth — which is the point. `test/palette.mjs` and the
transport UI read `sectionSpans`, so they follow the data; `test/groove.mjs`'s
anchor assertions are layout-independent.

### AD2. Per-track tension shape (S)

The other half of the clock. `tensionAt` (`bus.js:637`) samples one `SHAPE` for
every track — the golden-ratio climax is a beautiful curve heard four times at
four amplitudes. Add `track.shape ?? SHAPE`:

- **undergrowth**: late, shallow — `[[0,.10],[.3,.25],[.5,.35],[.7,1],[.85,.5],[1,.2]]`
  (the world subsides; even its climax is procrastinated).
- **forest floor**: twin peaks — `[[0,.10],[.25,.68],[.4,.32],[.618,1],[.8,.45],[1,.2]]`
  (the violence arrives early, recedes, returns — the track that struts should
  feint).
- **canopy**: the canonical curve, unchanged.
- **zenith**: early crest, long decay — `[[0,.15],[.35,1],[.6,.4],[1,.08]]`
  (altitude reached in the first third; the rest is thinning air).

The visuals inherit all of it through the bus for free — that is the M(S)/V(S)
thesis working as designed. The set-scale climax placement is untouched (it
comes from the per-track `peak` values, not from `SHAPE`).

### AD3. Unequal track lengths (S)

All four tracks are 68 bars, so the seam fires on a metronome. Proposed:
**64 · 76 · 68 · 64** — the sum is still 272, so `SET_BARS`, the set loop
period, and every absolute-time alignment survive untouched; all values are
whole phrases (D9 holds by construction). The forest floor, the walking track,
gets the extra room; the bookends tighten.

Free side effect: track phrase counts become 16 / 19 / 17 / 16, so N2's
8-phrase root cycles and N3's 5-phrase plane cycles land differently against
every track — the Eno principle applied to the largest period in the piece.
Check `test/palette.mjs` and `test/seams.mjs` for hardcoded 68s.

### AD4. The interlude (M, after AD1)

The set is four verses with no chorus, bridge, or breath between them — the
one structural fact no per-track device can change. Add a fifth `TRACKS` entry
between canopy and zenith: **16 bars** (2 phrases + seam), brightness flat at
0.80 (exactly where the canopy ends and the zenith begins — the walk stays
continuous with no re-authoring), layout `[intro 1, release 1]`, and a palette
that is *deliberately not a cast*: no new faces, no break, no bass — only the
continuity core. The pad, the migrating pluck (at its canopy costume, about to
drown), and both biomes' beds crossfading.

The thesis line that justifies it: **the interlude is the control group.** For
23 seconds the listener hears the six invariants alone, which is what makes
the four casts audible as casts (§7.3's variety-against-invariance, applied to
the set's own form). It also breaks the deepest regularity in the piece — the
set stops being A·B·C·D and becomes A·B·C·x·D.

Costs: `trackAt`/`phraseStateAt` iterate `TRACKS` generically (fine);
`test/palette.mjs`'s per-track blocks need the new index; the visuals'
track-keyed tables (biome palettes) need an entry — the cheap answer is to
alias the canopy's.

### AD5. The set-pass ladder — R7, concretized (S)

`Math.floor(idx * PHRASE_BARS / SET_BARS)` in `makeSetPattern` is the free
variable pizzazz named and nobody spent: which *pass* of the set this is. The
loop currently loops exactly. Spend it on second-telling confidence, all
deterministic, all cheap:

- turnaround lift +0.15 (the drummer has warmed up);
- groove bags rotate one neighbour (`shipped→busy`, `sparse→shipped`) via the
  existing `bagFor` override point;
- `dropVariantFor` and `seamFillFor` mix the pass into their hash — second
  pass, different drops, different boundary materials;
- the AD12 b-side slots flip.

Rationale is R7's own: "what makes minute 12 different from minute 3." The
answer should be *the piece remembers having played*.

---

## 3. The bassline

### AD6. Bass behaviour archetypes (M) — *the bassline headline*

The complaint "the bassline gets repetitive" is not about notes — N2 fixed the
harmony — it is about **syntax**: every track's floor is the same walk. Give
`palette.bass.style` three values and a switch in the bass builder:

- **`drone`** (undergrowth): the root held in 2-bar notes — the Reese finally
  *is* the "stasis outside, seething inside" patch `track_identities.md`
  promises, with P1's wobble as the only motion. The talea stops being a
  melody and becomes *articulation* (gating the held note), and the walk is
  only permitted above `tNorm ≈ 0.7` — the floor learns to walk at this
  track's peak, foreshadowing the next track's whole identity.
- **`walk`** (forest floor, zenith): the current engine, unchanged — it is the
  forest floor's identity and the zenith's absence-punctuated version already
  reads differently.
- **`riff`** (canopy): an authored 2-bar hook in degrees + 16th slots (e.g.
  slots `[0,3,6,10,14]`, degrees `[1,5,6,5,3]`), repeated with one seeded
  substitution per phrase. The only bass in the set you can *hum* — and
  memorability is a warmth device, so it belongs to the glad track alone, the
  way the thirds do.

One engine, three grammars, and the set's floor becomes: lying down → walking
→ singing → gone. That sentence is the arc the casts already tell, restated in
the register the listener feels rather than hears.

### AD7. Section-keyed bass behaviour (S)

No section changes what the floor *does* — the one arrangement axis D43 left
untouched. A small table, same shape as `SKEL_LIFT`:

- **build2 → the pulse**: straight 8ths on the root (or the phrase's centre),
  filter opening across the section — the genre's pre-drop, and the first time
  build2's floor differs from groove's. Overrides `style` in every track that
  *has* a build2 (with AD1: not the undergrowth — its floor never learns
  urgency, correctly).
- **release → gravity doubled**: the walk's pull toward the centre strengthens
  so lines audibly sag home; with the literal-recall lead (AD15) this is the
  section where everything stops arguing.
- breakdown already tacet; intro already absent. ~10 lines.

### AD8. Talea development, not talea re-deal (S) — R8's argument, cheaper

The break re-permutes per phrase and R8 wants it to *develop* instead; the
same critique applies to the floor, where the fix is far cheaper. The talea is
currently re-dealt every phrase (`euclid(k, 16, floor(rng()*16))`) — 17 unrelated
figures per track. Instead: draw the rotation **once per section** (hashed rng,
keyed `(baseSeed, trackIndex, sectionName)` — the `squawkLayer` idiom, so the
shared stream is untouched), then advance it +1 per phrase within the section.
The ear gets "the same figure, turning against the bar" — a part with a memory
— and a genuinely new deal only at section boundaries, where new deals belong.

One discipline note: the current per-phrase `rng()` draw must be *kept and
discarded* (or all downstream draws shift and the whole set re-deals — the
constraint pizzazz documented the hard way).

### AD9. The floor states the cell (S)

`MOTIF` has never sounded below octave 0 — the set's one melody and its floor
have never been the same voice. Once per track, on the drop bar
(`sec === 'peak' && firstPhraseOf`, mask `[1 0 0 0]/4`), the bass plays the
cell: MOTIF's degree offsets mapped into the pentatonic set, in the bass
register, at the talea's density. Eight notes, four times a set, thesis-pure
(§6.4: new registers, no new tunes) — and the drop gains a *melodic* signature
on top of R3's textural variants.

### AD10. The octave lift (S)

One talea onset per phrase displaced +12 — choose the highest-indispensability
non-anchor onset, probability rising with `tNorm`. The classic jungle sub-jump;
it puts a moment of light into the 120–250 Hz band T2 has been draining, and
it costs five lines. (Tier S #3, "the sub arrives late," is the sibling steal:
gate `bp.sub` on `secProgress > 0.25` in build so the floor gains weight as it
wakes.)

---

## 4. The instrumentation

### AD11. Section-scale Klangfarbenmelodie (M)

D22's whole operator is "hold the pattern, swap the player" — applied only at
track scale. Apply it one level down: `palette.lead.sections`, an optional
per-section patch override for who *carries the contour*:

- canopy: breakdown → the bells alone carry the melody (triangle silent);
  release → both, the doubling now heard as reunion;
- undergrowth: release → the contour moves to the pluck's FM patch — the
  track's last melody is played by wood;
- zenith: peak → the glass bowl doubles the sine lead for its one thin phrase.

This is the direct fix for the residue of pizzazz §1.5 (bars 32–63: identical
roster): the roster still barely changes, but the *casting* now changes at
section boundaries, which is cheaper than new voices and spends no novelty
budget — no new sounds, new assignments. The contour `seq` is already computed
once in `buildArrangement`; rendering it through a second patch is ~15 lines.

### AD12. B-side casts (M)

Pizzazz §1.7 measured it: re-seeding changes which 16th the fill lands on and
nothing a listener would name. The fix at the level listeners actually operate:
**two authored options for one palette slot per track**, chosen per set by the
`dropVariantFor` idiom (`bSideFor(trackIndex, seed)`, hashed, deterministic).
Start with the two thin tracks:

- undergrowth: the trapdoor (P5) ↔ **the croak** (P6, already specced — zero
  new generator code, one `ingest` run);
- forest floor: the thunderclap (P4) ↔ **the dub throw** (Tier S #2 — feedback
  spiked on one phrase-final snare, the ordinary version of the track's
  once-per-set self-oscillation).

Seeds become audibly different sets; the exactly-one-track invariant in
`test/palette.mjs` still holds *within* any given set.

### AD13. Echoes — amend "exactly once" to "once as a member, once as a memory" (M)

The casts never reference each other, so the set has first appearances but no
*recalls* — and recall is the cheapest variance there is, because the material
is already paid for. The amendment: a characteristic instrument may reappear
in **one later track, exactly once, transformed toward the host's stream
position**, at memory volume (−6 dB or more). Two to start:

- **the breath voice at the zenith** (release, one phrase): formant and
  register up, vibrato gone, mostly air — the cold-choir idea
  `track_identities.md` §7 already flirts with, implemented as a *ghost of
  track 1* rather than a ninth face. The first thing in the set with a body,
  returning without one: that is the zenith's thesis in a single gesture.
- **the bells at the zenith** (breakdown, once): half-speed, drowned — bells
  becoming glass is the timbral bridge the two casts already imply.

This deliberately amends the `test/palette.mjs` contract ("characteristic
instruments are where they belong, and nowhere else") — the change is the
proposal, not a side effect, and the test should encode the new rule: each
echo exists in exactly one host track, once, quieter than its original, and
the *undergrowth has none* (nothing can be a memory in the first track).

### AD14. The crack layer — S1/R9, endorsed (M)

Restated here because it is the *instrumentation* item this complaint most
wants: the break is the most-heard voice in the piece, and there is exactly
one break sample wearing four costumes. The body/crack split (soft body break
+ hard dry snare derived from `slice(16, '4 12')`, no new sample) gives every
form device above a second axis — *which drummer* — and AD1's per-track forms
somewhere to spend it: the undergrowth never earns the crack, the forest floor
leads with it.

---

## 5. The melody policy

### AD15. Transform diets per track (S)

`leadContour` draws uniformly from the same five transforms everywhere — the
motif is varied identically in minute 1 and minute 12, so the set has
variation without *development*. Author the bag per track
(`palette.motif.transforms`, indices into `TRANSFORMS`):

| track | diet | the arc |
|---|---|---|
| undergrowth | literal, rotation | exposition: the cell barely dares move |
| forest floor | + retrograde | development begins |
| canopy | the full bag | permission — everything at once, like the rest of its cast |
| zenith | inversion, **fragmentation** | dissolution: the cell remembered in pieces |

Fragmentation is one new transform (~2 lines): the first three notes,
augmented (each degree held twice) — the cell heard the way the granular ghost
hears the break. Plus the already-listed R5 item: **release pins the bag to
literal recall** in every track (§6.4's argument resolving on recall), which
this makes a one-line special case.

### AD16. The answer phrase (S)

Every phrase's contour is an independent draw — melody has variety but no
*conversation*. Pair the phrases: even phrases draw as now (hash keyed to
`floor(phraseIndex/2)`), odd phrases answer with the retrograde-inversion of
their partner at reduced density (drop the euclid k by 1). Call and response
is the oldest phrase-scale form there is, and it makes eight bars a sentence
rather than two independent utterances. Deterministic, no shared-rng draws,
~8 lines in `leadContour`'s caller.

---

## 6. Order, cost, and what to listen for

One variable at a time, a listen between each (the D13 discipline). Suggested
ladder, cheap and quiet first:

1. **AD8** talea development (S) — the floor gains a memory.
2. **AD7** section-keyed bass (S) — build2 finally differs from groove underfoot.
3. **AD15 + AD16** the melody policy (S) — development and conversation.
4. **AD2** per-track tension shapes (S) — the clock's first crack.
5. **AD10 + AD9** octave lift, the cell in the floor (S).
6. **AD5** the set-pass ladder (S) — the loop becomes a second telling.
7. **AD6** bass archetypes (M) — the bassline headline.
8. **AD1** per-track forms (M) — the structure headline; then **AD3** lengths (S).
9. **AD11** section Klangfarben (M), **AD12** b-sides (M), **AD14** the crack (M).
10. **AD13** echoes (M) — after the casts have settled, since it amends their contract.
11. **AD4** the interlude (M) — last, because AD1 must exist and it touches the visuals.
12. Then the standing endorsements on their own clocks: **R2**, and **N7** as
    its own change with its own listen.

**Acceptance criteria**, in the house style:

- (a) D22's criterion still holds (a random 10 s window names its track) — and
  a new one: told "this is a drop," a listener *cannot* infer which bar of the
  set they are at without the cast, because the forms differ (AD1/AD2/AD3).
- (b) The hum test: a listener can hum the canopy's bassline after one pass
  and cannot hum the undergrowth's (AD6 — one is a riff, the other a drone).
- (c) Two seeds, A/B'd: the listener names at least one instrument-level
  difference (AD12; today's measured answer is none).
- (d) Minute 3 vs minute 12, blind: identified better than chance (AD5, AD15).
- (e) Every unit invariant that changes, changes on purpose: the amended
  exactly-once block (AD13), per-track layouts in `test/palette.mjs` (AD1),
  anchors still never move (`test/groove.mjs`), `test/harmony.mjs`'s
  bus/generators agreement if the bass builder is touched (AD6–AD9).

**Rules this must not break** (carried from the pizzazz ladder): the six
continuity invariants in `track_identities.md` §2 — none of the above re-casts
them, and AD4 is built *out of* them; a gesture is spent, not sprinkled (AD9,
AD13 are rationed by construction); no draws added to the shared `rng`
(hashed-rng idiom everywhere above; AD8 documents its draw-parity trap);
whole-phrase arithmetic only (D9 — AD3 and AD4 are authored in whole phrases);
and D numbers are assigned at merge, not here.
