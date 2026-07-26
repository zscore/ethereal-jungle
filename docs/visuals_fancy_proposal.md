# Visuals Expansion II — the fancy tier

Status: **implemented** (F1, G1–G3, H1, I1–I2, J1–J2 all landed; see
design_decisions D19/D20). Successor to
`visuals_expansion_proposal.md` (tiers A–E, all shipped except D1/D2), which
stays the record of how the world got built. Same rules, same § references to
the visualizer theory doc. Item letters continue at **F** so nothing collides.

**Where we are.** One-world biome stack with real dynamics (Gray–Scott roots,
advected canopy ether, growing floor, aurora sky, shafts, graded air), altitude
= brightness walk, a two-word figure vocabulary plus the recurring glyph,
per-stream post chain with artifact operators on `w`, stream fusion spent once
at the canopy climax, bar-exact seams with seeded landing/dissolve flavors on
the bus (D18), adaptive pixel-ratio governor, `?altitude=`/`?biome=` debug
surface, two-backend screenshot harness.

**What's still missing, and it's the interesting list.** (1) The corpus family
— §3.5, the one visualizer family with no representative in the world, and the
only *figure-affording generator* in the taxonomy. (2) The perform rail (D17)
has no visual twin: the hand can filter, echo, crush and wash the audio and the
picture doesn't move — the old D2 "mischief twins" item, which was blocked on a
music-side mischief layer that doesn't exist, but the perform rail is the same
shape of signal and it *does* exist. (3) The dictionary's DRR → depth-of-field
row (§2) has never been rendered. (4) The bus knows each seam's flavor and the
camera doesn't read it. (5) The camera's path is pure vertical + sway
(scene_plan §6's open question).

**Ground rules carried forward** (non-negotiable): visuals read the bus, never
audio; two streams, bimodally clustered; synch points spent only on anchors;
ground families never articulate rhythm; every effect states its stream before
it is built; and — new, earned the hard way — **anything that costs frames must
be a tier the governor can drop**.

---

## Tier F — the missing family: corpus (§3.5)

### F1. The self-corpus shrine (L)
The theory's fifth family, and the one place the world is allowed to be
figure-affording *as a place*. Open decision #2 from the last proposal is
hereby called: **self-corpus**, not found footage. The shrine films *this
world* — a fixed shrine-eye camera captures the ground stream into a ring of
low-res render targets on the 16th-note grid — and replays it chopped by
`permuteBreak(w, rng)`, **the same σ machinery, imported from the music
generators**, re-permuted every bar exactly as the break is. The formalism of
§1.1 transfers verbatim because it is literally the same function.

Consequences worth stating, since they're why this is the right call:
- No licensing surface at all, and no asset pipeline (the last proposal's
  reason for putting D1 last is deleted rather than solved).
- Thematically exact: the jungle dreaming of itself, one bar behind.
- The anchors (0, 4, 8, 12) are never permuted, so the shrine's cuts *land on
  the metric anchors* — the corpus family paying into the synch-point economy
  (§2.2) rather than spending from it. A visual downbeat is a metric anchor.
- The capture camera sees layer 0 only, so it films the ground and never the
  figure or itself: no feedback recursion, and the recording carries the
  weather without the drums.

Placement: the undergrowth, per §4.4's map — a small screen a few units off the
root lattice, fading out above the roots band, dark and dead everywhere else.
The screen is figure stream (sharp, near, discrete, no bloom); its cuts are
the sharpest attack in the visual repertoire and they only fire in the one
biome that owns them.

*Accept:* the shrine shows the world's recent past, not its present; the frame
changes only on 16th boundaries; visible only near the roots; capture stops
(zero cost) when out of band or when the quality governor drops the tier.

## Tier G — optics: the camera as an instrument

### G1. Depth of field = DRR, rendered (M)
§2's dictionary has always said `DRR/reverb → fog density, depth of field` and
we only ever built the fog half. Add a bokeh DoF over **the ground pass only** —
the figure composites sharp on top, which is the visual restatement of "no
reverb on the drum bus". Focus distance rides the camera's own look-at target,
so the world is focused where the camera is looking; focal length (how far
before an object is fully out of focus) closes as the `space` knob washes and
as the perform filter dives (F2 below).
*Accept:* at rest the frame is indistinguishable from today's; a `space` sweep
visibly pushes the world out of focus without touching the figure.

### G2. The look module (S, architectural)
Every post uniform is currently computed inline in the frame loop. Move the
whole mapping — bus params + env → post uniforms + fog — into a **pure module**
`src/visuals/look.js` with no three.js import and a node unit test, exactly the
treatment `perform.js` got for the audio seam (D17). The renderer seam deserves
the same auditability as the mixer seam: the interesting claims (monotonicity,
idle-is-identity, continuity across biome boundaries) become assertions.
*Accept:* `npm test` covers the look mapping; scene.js contains no mapping math.

### G3. Volumetric mist (S)
Stacked additive haze cards through the floor and canopy bands, parallaxing as
the camera travels — the cheapest real volume in the book, and the floor's air
currently reads thinner than the canopy's. Ground stream: density from `T`,
warmth from the palette, and the kick's duck compresses it (the coupling
constant, rendered once more).

## Tier H — the performer, rendered

### H1. Perform-rail twins (M)
The old D2, unblocked: the four DJ color-FX knobs (D17) are bus params, so
their twins are legal by the same law that licenses everything else — read the
bus, same frame, never the audio. Each mapping is the *visual statement of the
same sentence* the audio effect states (§8.2's grammar, one sense-organ over):

| knob | audio | picture |
|---|---|---|
| `filter` ↓ (LP kill) | underwater, behind a wall | defocus (G1), desaturate, cool tint, fog thickens |
| `filter` ↑ (HP kill) | phone speaker, all floor removed | vignette closes, world dims and thins, cold pale tint |
| `echo` | dub echo, dotted eighth | frame afterimage + chroma displacement — the picture echoes |
| `crush` | bit depth collapses | posterize + grain: the *medium* failing, not the world moving |
| `space` | reverb wash, everything far | bloom swells, fog deepens, the far world softens — distance |

Note the theoretical division of labor this exposes: filter and space move *the
world*, crush degrades *the medium*, echo repeats *the frame*. Three different
objects, which is why they read as three different jokes.

Two rendering rules the first implementation got wrong and now states: the tint
rides luminance (mixing a flat color into the frame lifts the blacks and turns
a filter kill into a grey card), and the posterize runs in gamma space with
half-step rounding (quantizing a dark linear frame with `floor` costs exposure,
not color resolution). The HP kill's dimming is a *subtraction* — with the
floor removed there is less picture — not a wash.
*Accept:* rail at rest ⇒ identical to today's frame; each knob is
perceptually monotone (§9.1) and visible within a frame of the gesture.

## Tier I — choreography

### I1. Per-biome camera waypoints (S)
scene_plan §6's open question, answered conservatively: a lateral orbit whose
radius and rate are per-band constants, **interpolated continuously with
altitude** so no boundary can produce a jump, and superimposed on the existing
1/f sway rather than replacing it. The motion signature — the strongest
continuity element there is (§4.2) — survives by construction, and the world
gains parallax: the roots orbit tight and slow, the canopy drifts wide, the sky
barely moves.

### I2. Seam variants, staged (S)
The bus has published each boundary's flavor since D18 and the camera has been
ignoring it. Render the difference:
- **landing** — the push-in tightens, and the boundary bar releases as an
  *arrival*: an exposure spike and a fast vignette open, decaying over ~1 s.
  The countdown resolves onto an event.
- **dissolve** — no flash, ever. The camera decelerates through the late
  window, the fog opens and the focus widens: the tension exhales and the new
  world is simply *already there*.
*Accept:* both flavors reachable from the transport buttons and visibly
different on the boundary frame; the flash never fires on a dissolve.

## Tier J — plumbing (pays for the tiers above)

- **J1. Quality tiers, not just pixels (S).** The E1 governor scales pixel
  ratio only; it now also picks a **chain tier** (DoF on/off) and publishes a
  `quality` scalar in `env` that the expensive biomes and the shrine read. Frame
  cost becomes something the system can shed, in the order *we* choose, instead
  of dropping frames.
- **J2. Harness coverage (S).** `tools/visual_check.mjs` grows shots for the
  shrine, a full perform-rail sweep, and both seam flavors; `npm test` grows
  `test/look.mjs`.

---

## Order and rationale

**G2 → J1 → H1 → G1 → G3 → I1 → I2 → F1 → J2.**

The look module first because everything after it writes through it; the
quality tiers second because F1 and G1 both need something to be droppable;
then the cheap-and-visible perform twins; then the optics; then choreography;
then the shrine, which is the largest and most likely to need iteration; then
the harness, which certifies the lot on both backends.

## Deliberately not in this pass

- **A music-side mischief layer** (theory §8). It is a music item that happens
  to have visual consequences, and H1 already proves the twin mechanism works;
  when §8 lands, its events ride the same look module.
- **Found-footage corpus.** F1 chooses self-corpus; a curated CC0 pack remains
  possible later behind the same interface (the shrine takes a frame source).
- **Reflections / SSR / real volumetrics.** Cost class above what the governor
  can currently shed, and the mist card stack buys most of the read.
