# Visuals Expansion III — nature, and other kinds of picture

Status: **implemented** (K1–K7, L1–L6, L8, M2 all landed; see design_decisions
D21). Successor to `visuals_fancy_proposal.md` (tiers F–J, all shipped), which
stays the record of how the optics and the perform twins got built. Same rules,
same § references to the visualizer theory doc. Item letters continue at **K**.

**Where we were, and the honest diagnosis.** The world had four good biome
systems, real optics, the perform twins, seam staging and a corpus shrine — and
it still read as a stack of dioramas rather than a place. Two structural
reasons, neither of which was "not enough stuff":

1. **Nothing shared an atmosphere.** The mist scrolled, the shafts flickered,
   the ether advected, the aurora drifted — four systems, four private sines.
   There was no wind, so nothing that happened to one biome ever happened to
   another, and the eye reads shared causation as *place*.
2. **There was no near field.** Everything lived 12–90 units out. The depth of
   field pass built in G1 had nothing close enough to blur, so the frame had no
   parallax gradient and therefore no depth.

Fixing those two made every effect already in the world read better before a
single new one was added. That is the order the tiers below are in, and it is
not an accident.

**Ground rules carried forward** (non-negotiable): visuals read the bus, never
audio; two streams, bimodally clustered; synch points spent only on anchors;
ground families never articulate rhythm; every effect states its stream before
it is built; anything that costs frames must be a tier the governor can drop.
And one new one, earned in this pass: **a style is spent, not sprinkled** — an
effect that changes what kind of picture this is must be bound to a place in
the set that already means something, or it is wallpaper.

---

## Tier K — nature, continued

### K1. One wind field, shared (M) — *the structural one*
`src/visuals/weather.js`: a prevailing direction that turns slowly, plus gusts
modelled as a **plane wave travelling along it** at 16 units/s. Every biome
samples `env.wind(x, y, z)` at its own position and nothing else. The floor
grove leans, the leaves twist about their stems, the shafts tip off plumb, the
mist shears and thins, the ether is displaced downwind, the aurora ripples, the
rain leans and stretches along its fall vector, the near-field fronds move at
the lens. One gust, forty units of depth, everything agreeing.

The travelling part is the whole point: a gust that arrives everywhere at once
is a global multiplier and reads as a fade. Two mutually irrational crest
periods, so the pattern never repeats (the Eno theorem, §7, again). Wind grows
monotonically with altitude — the canopy sways, the roots do not — which makes
the camera's climb *also* a climb into more weather.
*Accept:* the field is continuous in space and time, bounded by a stated
ceiling, and a crest measurably arrives downwind later than upwind. All four
are assertions in `test/weather.mjs`.

### K2. Fireflies (S–M)
Real boids — separation, alignment, cohesion, wander, wind, and a soft box that
keeps the swarm a resident of its band. This is §3.2's *other* argument: the
canopy ether is a field sampled by particles that don't know each other exist,
and a flock banks where a field merely flows. Neighbour rules re-read every
third frame; a flock has latency anyway.

The blink is the discipline. Each agent's period is drawn from an irrational
spread so the swarm **never synchronises** — real fireflies do, and a
synchronised swarm would be rhythm on the ground stream, which is forbidden
(§2.1). The physics is wrong on purpose.

### K3. Rain, and the surface it lands on (M)
The forest floor has played `ambrain` since D16 with nothing falling. Streaks
fall in a cylinder that follows the camera and recycle at the top. They are
ground stream despite being fast and hard-edged, because there are hundreds and
no single one is ever an event — precisely the §2.1 distinction, and why rain
can be dense without spending a synch point.

Plus a black pool among the roots: two caustic layers scrolling at coprime
rates, and ripple rings from falling drops. The ripples are the only expanding
rings in the world that are *not* figure — stochastic, soft, slow, never on a
kick. Counterfeiting the kick's shockwave would devalue it (§2.2).

### K4. Leaves (S)
Instanced blades at the floor's branch tips on the **phyllotaxis spiral**
(137.507°, the same golden angle the sky's shells use for their radii). They
unfold over the last stretch of the track's growth arc — a branch exists before
its leaves do — and flutter on the shared wind. The floor was a wireframe of
branches; it is now a forest.

### K5. The near field (S) — *the other structural one*
Two parts. **Motes**: world-space dust in a box that wraps around the camera,
so it parallaxes hard against a world that barely moves, and brightens as it
nears the lens. **Fronds**: silhouettes parented to the camera, framing three
corners and swaying on the same gust that bends the grove 40 units away. That
agreement across depth is the whole illusion.

Two things this got wrong first, both recorded because they are easy to repeat:
the fronds were sized to *fill* rather than frame (a 1.7-unit blade at z=-1.35
covers the entire frustum — you end up photographing a hedge), and they were
built with a dark sprite as a colour `map`, which sends the silhouette through
the colour-space gauntlet and comes out as a pale card. They are an `alphaMap`
now: shape from the mask, colour from the material.

### K6. The mycelial net (M)
Local-rule (§3.3) at a second scale. The roots run a real Gray–Scott sim whose
morphology is the pattern family's argument; this is the same family's other
argument — a network with signals on it. Filaments join nearby anchors, each
carrying a pulse that departs on its own dwell and travels at its own speed, so
the net is always signalling somewhere and never everywhere. The pulse is a
gaussian in arc-length written into vertex colours: one draw call, no shader.

### K7. Lightning (S)
The forest floor's ambience has carried a distant-thunder accent since D16 with
no picture. Strikes live on a **seeded slot schedule**: each 3.5 s slot rolls
once against the storm intensity and places its strike at a hashed offset
inside itself. Pure and time-addressable — `lightningAt(t)` can be asked about
any instant, which is the same clairvoyance every other bus signal has, and is
not a timer that has to be stepped to stay correct.

A strike lights the *air* (so the canopy reads as a silhouette for one frame),
adds a second hard light from the bearing the storm chose, brightens the sky
shells from inside, and blows out the bloom and the lens streak. It is the one
hard-edged ground event in the world, licensed as weather rather than meter.

## Tier L — other kinds of picture

### L1. Anamorphic streak (S)
The bloom says *bright*; the streak says *bright through a lens*, which is the
whole difference between a glow and a light. Rides the same envelope as the
bloom — tension, the wash, the arrival, the strike — so the two never disagree
about what is hot, and the kick dips it like everything else.

### L2. God rays (M)
Screen-space radial scatter from the sun's projected position. The one effect
here that is a function of **place** rather than time: it peaks in the canopy
band and is absent among the roots (nothing above to shaft through) and at the
zenith (nothing below to shaft onto). Fades out when the sun leaves the frame —
a light source you cannot see does not scatter toward you.

### L3. Ink (M) — bound to breakdown sections
Sobel outlines over a wash, on paper lit by the scene's own luminance, so a
dark jungle stays a dark drawing and a lit one blooms into rice paper. The
first attempt used gains tuned for an ordinary image (5× edge, 1.5× paper) and
produced a slightly desaturated dark frame that read as nothing at all: a Sobel
on a scene at luminance 0.03 returns gradients near zero, and a page needs a
floor to be a page. 14× and a 0.14 floor.

Bound to breakdowns because that is the one section already about stripping the
music back to its lines. Smoothed over ~1 s — a medium that changes on a frame
reads as a dropped frame.

### L4. Halftone (S–M) — bound to the far end of `crush`
Past the 0.55 knee the medium stops being a frame buffer and becomes print:
duotone dots whose second ink is the biome's own palette, so the print is in
the colour of the place it is a print of. `crush` already degrades the medium;
this is the same sentence one register louder, which is why it is the crush
knob's tail and not a knob of its own.

`DotScreenNode` returns `luminance*10 − 5 + pattern`; clamping that raw gives a
three-tone threshold with dots visible in a sliver of the range. Scaled down
first, so the screen actually dithers. Halftone without visible dots is just
posterize again, and the frame already has one of those.

### L5. Kaleidoscopic fold (S) — spent once, at the fusion climax
Six-segment polar fold on the ground pass only; the figure composites over it
unfolded, for the same reason it escapes the depth of field. Squared and capped
well under a full fold: the climax is a glimpse of symmetry, not a screensaver,
and a full fold would destroy the world at the exact moment the world is the
point. Spent alongside the ether ignition (§5) and nowhere else, ever.

### L6. Per-track colour grade (S)
A lift/gain/gamma triple per band — the roots cool-violet and contrasty, the
sky warm and lifted — blended by the same tent window as the camera orbits, so
one continuity proof covers both. The palette lerp moves the *world's* colour;
this moves the *picture's*, which is the difference between a scene lit
differently and a scene shot differently.

### L8. Heat shimmer (S)
Refraction is the air becoming visible, so it belongs to the two moments the
air is doing the most work: the fusion climax, and the top of a tension curve.
Ground-only, like the fold.

## Tier M — the second axis

### M2. A weather axis on the bus (M)
`weatherAt()` gives each track a character — `{mist, rain, wind, storm}` —
crossfaded across seams on the same smoothstep the brightness walk uses, so the
incoming track's air arrives before its downbeat. Each row is the visual half
of that biome's ambience bed: the undergrowth is dampest and stillest, the
forest floor is the rainiest (it is the track whose bed is `ambrain`), the
canopy is the windiest, the zenith is clear. Rain arrives in **episodes** on a
slow seeded walk — a track that rains from bar 1 to bar 68 is a texture, not
weather — and storms need tension, which answers section_ideas' open item about
tying accent walks to the climax, on the visual side first.

## Plumbing

- **The governor grew a rung.** Three chain tiers, sold in order of how little
  they mean: styles first (ornament — the set survives without ever showing an
  ink frame), optics second (depth of field is the dictionary's DRR row and
  losing it costs a sentence), pixels last, the groove never. Bought back in
  reverse, so the frame never wears styles without optics.
- **The harness can pin what the governor sheds.** `setStyles`, `setWeather`
  and `strike` on `window.jungle.visuals`, plus `debugStyle()`. The style pin
  is load-bearing: on a software rasterizer the governor drops the tier within
  seconds, so the first style sweep photographed a chain that had already
  dropped it while the boot log still said `styles=true`. A screenshot cannot
  tell you a uniform was zero; the harness now asserts it.

---

## What is NOT done

- **M1. Dolly zoom on landings** (FOV widening against a push-in) — the only
  proposed item not built. It belongs with I2's seam staging and is a small
  change to the same code; it was cut for time, not for a reason.
- **The near field never bokehs.** K5's fronds sit at 2.8–3.4 units and the
  focus rides the look-at target ~14 units out, but at rest the focal length is
  1200 (G1's "off"), so the pass is a no-op and the fronds render sharp. Making
  them blur at rest means giving the world a real resting aperture, which
  contradicts F–J's "at rest the frame is indistinguishable from today's" and
  is therefore a decision, not a bug fix.
- **Fireflies are O(n²) with a 3-frame stride.** Fine at 220 agents; a spatial
  hash is the obvious move if the population ever grows.
- **Only WebGL2 has been looked at.** The style tier builds and runs on both
  backends (the harness certifies that), but the WebGPU screenshots are black
  on this headless chromium — a known limitation predating this pass. **The
  style tier has not been seen by a human eye on WebGPU.** Do that in a real
  browser window before trusting it there.
- **Perf on real hardware is unmeasured.** Every new biome respects the quality
  dial and every style is droppable, but the whole pass was developed against
  swiftshader, where the governor sits at the bottom of its ladder by design.

## Deliberately not in this pass

- **Volumetric god rays / real light shafts.** L2's radial blur is a screen-space
  fake that cannot honour depth; the cost class of the real thing is still above
  what the governor can shed.
- **A fifth style.** Three is already enough that the *what does seeing this
  tell me?* table has to be consulted before adding one. That table is the
  point; the styles are just its current rows.
