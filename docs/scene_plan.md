# Scene Plan — coming up with scenes, and transitioning between them

How we generate *different scenes* and move between them, now that the
one-world proposal (visualizer theory §4.4) is **adopted** (see
design_decisions.md, D5). The short version: we don't have scenes — we have
**biomes at altitudes in one continuous world**, and a "transition" is the
camera traveling between them, driven by the same brightness walk that drives
the harmony. This document is the recipe for authoring new biomes, the
choreography of a transition, and the roadmap for making each biome real.

## 1. The commitment

Discrete scene-switching was rejected. Under switching, every pair of scenes
needs a transition authored (or a distance metric + seam operator to synthesize
one), and the crossfade failure mode (§4.3: four streams, scene confusion) is
always one lazy transition away. Under the one-world solution:

- each visualizer *family* governs an **altitude band** — the family taxonomy
  becomes geography;
- **altitude = mode brightness** — the harmonic story (a brightness walk over
  one root) is literally rendered as vertical travel;
- every transition is a camera traversal, so `d(A,B) ≡ 0` by construction and
  no per-pair transition authoring ever exists;
- the visual set inherits the musical set's one-piece-ness for free.

So "coming up with a new scene" = "designing a biome and assigning it an
altitude band," and "transitioning" = "the timeline walks brightness through
that band." Both media read the walk from `bus.brightnessAt(t)`.

## 2. The biome map (current)

| band (world y) | biome | family (§3) | palette | mode territory | musical twin |
|---|---|---|---|---|---|
| 0–12 | **roots** | local-rule texture | deep violet `#1b1030` | locrian/phrygian | tendency-free dissonance: alive, going nowhere |
| 10–24 | **forest floor** | growth (vines) | moss green `#16301f` | aeolian/dorian | brown noise: all memory, answers the arc not the beat |
| 22–42 | **canopy** | fields (particle ether) | blue-grey `#20315e` | dorian/mixolydian | drift(t) made visible; the kick ducks it |
| 40–62 | **sky** | self-similar (nested shells) | gold `#ffd9a0` | ionian/lydian | ascent without arrival; golden-ratio nesting, coprime rotation rates |

Bands deliberately **overlap by ~2 units** so no altitude ever shows a void
between worlds. The figure stream (drum flashes) is band-independent — it
spawns at the camera's altitude, because the drums are *here* wherever here is.
Two non-band elements share the whole stack: the **air** (altitude-graded
background sphere) and the **mist** (additive card stack through the floor and
lower canopy, the parallax the fog can't give).

The last family landed as the **corpus shrine** (§3.5, D25): a flickering
screen in the undergrowth playing back *this world's* own last bar, chopped by
the break's own `permuteBreak` — the one figure-affording *place* in the world,
and the only one that owns video. **Artifact operators** (§3.6) are a
post-processing layer over any band, wired to wildness `w`, and now share the
chain with the perform-rail twins and a ground-only depth of field (D24).

## 3. How a transition actually plays out

Nobody authors transitions; the timeline in `bus.js` implies them. The
choreography, per track boundary:

1. **Foreshadow (music + camera, ~12 s out).** `seamAt(t)` goes active.
   `brightnessAt` starts blending toward the incoming track's opening
   brightness (smoothstep, reaching full blend at the boundary), and the
   camera — which samples brightness *4 s ahead* — departs even earlier. The
   incoming biome's palette infiltrates before anything about it is audible:
   §4.2's rule that the new ground enters early.
2. **Intensified exit (seam progress < 0.6).** Wildness gets a +0.25 boost,
   hats go to E(7,16) with rising gain (the riser), tension ramps toward 0.95
   — the countdown.
3. **The drums die before the boundary (progress ≥ 0.6).** Break, skeleton,
   bass, and lead all leave; a doubling snare roll counts down over the pads,
   which survive untouched — the pads are the common tone (§6.1). Visually
   nothing cuts: the camera is mid-travel, the strongest continuity signal
   there is (§4.2: motion continuity is quasi-vestibular).
4. **Clean downbeat.** The next track's opening tension is low (floor ≈
   0.1–0.2), so the full arrangement slamming back after the roll IS the drop:
   maximum stream contrast, paid for by the seam's spike. The moment of
   maximum audio event is also the **cut-safe point** (§5, change blindness):
   this is where any *visual* rewrites that can't be continuous are hidden.

The set loop (zenith → undergrowth, brightness 1.0 → 0.1) is the stress test:
the smoothstep blend makes even that fall continuous — the set ends by diving
from the sky back into the roots, which is the right image.

## 4. Recipe: authoring a new biome

A biome is ~40–80 lines in `src/visuals/biomes.js`. Checklist:

1. **Pick the family** from the taxonomy and honor its affordances (§3.7).
   Ground families (growth, fields, local-rule) must never articulate rhythm —
   they answer `T`, `Tf`, `b`, `drift` only. If it needs to react to drum
   events, it's figure, and figure lives in `scene.js` under the synch-point
   economy.
2. **Claim an altitude band**, overlapping neighbors by ~2 units. Update the
   biome map above.
3. **Take one palette anchor** and add it to `BAND_COLORS` — the palette
   center of gravity is interpolated across anchors, so one color per biome
   keeps the continuity layer working.
4. **Read only `env`** `= { t, T, Tf, b, drift, duck }` — bus signals, never
   audio, never another biome's state. (Same law as the music generators.)
5. **Respect the stream vector** (§2.1): soft edges, slow motion, large
   scale, continuous change. No hard edges in the ground.
6. **Sample the future** where the biome should foreshadow (`Tf` is T at
   t+2 s) and the present where it should confirm.
7. Give motion a **1/f character**: wire `drift` in somewhere, avoid constant
   angular velocities (use pairs of near-coprime rates — the Eno theorem).

## 5. Roadmap (visual)

Ordered; each step is independently shippable.

1. **Per-point shaders / TSL compute** for roots and canopy: ✅ *roots half
   done (D14)* — the roots pulse per point in the shader (phase-gradient
   traveling waves via `PointsNodeMaterial.opacityNode`). Still open: the
   canopy ether moving by curl noise instead of whole-cloud rotation ("move
   the ether to TSL compute particles").
2. **Bloom + per-stream post-processing** (§6 checklist item 4): ✅ *done
   (D14)* — ground and figure are separate layer passes; bloom applies to the
   ground only and the kick ducks its strength; the figure composites sharp.
3. **Blooms on anchors** for the floor biome: growth's one legal relationship
   to rhythm — events on the *surface* (flowers on downbeats, at most).
4. **The corpus shrine** in the undergrowth: ✅ *done (D25)* — a screen-object
   chopping the world's own recent frames with the same σ-permutation
   machinery as the break. Not "the formalism transfers verbatim": it is the
   same function, on a ring of render targets instead of drum slices, so the
   anchors show *now* and the chop's edit rate is `w` by construction.
5. **Artifact operators** wired to `w`: ✅ *done (D14)* — feedback smear
   (afterimage, high-`w` only), chroma displacement (rgbShift), grain/scanline
   (film) over the final composited frame, amounts driven by wildness.
6. **The recurring glyph** (§5, repetition legitimizes): one silhouette that
   appears at each track's climax, transformed — the visual sibling of the
   set's single melodic cell (already in the music: `MOTIF` in generators.js).
7. **Stream fusion at the set climax**, spent once: at canopy-track climax
   (the set's golden-ratio point), let figure flashes ignite the ether —
   particles burst from flash positions; forbidden everywhere else, which is
   what makes it the climax.

## 6. Open questions

- ~~**Should altitude ever move against the harmony?**~~ **partly answered
  (D22)**. The theory (§2.2) notes brightness walks "with or against the tension
  arc — both signify." Rather than bend the brightness walk — which is also the
  camera's altitude, so bending it bends the world — a *second* axis was added:
  `warmthAt(t)`, which decides how much gladness the arrangement takes from the
  mode brightness chose. The zenith now climbs in brightness while warmth falls
  off a cliff, and that opposition is what makes the top of the set read as awe
  instead of triumph (`docs/track_identities.md`). Still unexplored: a track
  whose brightness itself *falls* while tension rises — descending into the
  roots for the hardest section — which would move the camera downward through
  the world at the moment of maximum violence.
- ~~**Camera path richness**~~ **answered (D24/I1)**: each band owns a lateral
  orbit (radius + a near-coprime rate), tent-blended by altitude and
  superimposed on the 1/f sway rather than replacing it. Because every band
  keeps its own constant rate and phase, the path is continuous in altitude
  *and* in time — the motion signature survives every boundary, and
  `test/look.mjs` sweeps 2000 altitudes and 4000 instants to prove it. What is
  still unexplored is *content-aware* pathing (orbiting a specific vine
  cluster, threading shell gaps), which needs the world to expose landmarks.
- **How much biome per track?** One track ↔ one biome band is the current
  mapping. A future set could traverse two bands in one track — nothing in
  the architecture forbids it; only the timeline authoring changes.
