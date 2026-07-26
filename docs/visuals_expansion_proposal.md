# Visuals Expansion Proposal

Status: **proposal** — nothing here is committed to. Companion to
`scene_plan.md` (which stays the authoring recipe) and the visualizer theory
doc (§ references). This is the "make it fancy" plan: what to build next in
the visual system, tiered by visible-payoff-per-effort, with acceptance
criteria so each item is verifiable by screenshot or flythrough.

**Where we are.** One-world biome stack (instanced glow clouds after the
WebGPU point-size fix), altitude = brightness walk, per-stream post chain
(ducked bloom on ground, sharp figure pass, artifact operators wired to `w`),
bar-exact seams and in-track sections on the bus (D9/D11), figure stream =
placeholder white cubes.

**Ground rules carried forward** (non-negotiable, from the theory):
visuals read the bus, never audio; two streams, bimodally clustered; synch
points spent only on anchors; ground families never articulate rhythm; every
effect must state which stream it belongs to before it's built.

---

## Tier A — motion & materiality (biggest visible win per effort)

The biomes currently *exist*; this tier makes them *move like themselves*.
Each biome's family has a native dynamics we're only gesturing at.

### A1. Canopy: curl-noise compute particles (M)
Replace the rotating instanced cloud with a real flow field: 50–200k
particles advected by curl noise in a TSL compute pass (WebGPU), the curl
field's low-frequency component driven by `drift(t)`, speed breathing with
`T`. The kick's duck injects a brief global downdraft — the ether *flinches*
instead of dimming. Keep the current instanced cloud as the WebGL2 fallback
path (the backend split is already proven).
*Accept:* canopy reads as weather, not a rotating object; 60 fps at 100k on
an M-series GPU; fallback still renders.

### A2. Roots: real Gray–Scott reaction–diffusion (M)
The theory's local-rule biome deserves the actual math (§3.3): a Gray–Scott
sim in a ping-pong compute texture, sampled by the root glows for their
brightness (replacing the sine-wave pulse). Map `(F, k)` to a slow path
through pattern space — spots → labyrinths — driven by brightness, so the
roots' *species* changes with the harmonic weather, exactly like a modal
shift re-coloring a drone.
*Accept:* visible pattern morphology (not noise), morphing over ~30 s, no
rhythm articulation.

### A3. Floor: living growth (M)
Vines currently exist statically and sway. Make growth *happen*: space-
colonization growth that advances with the track's tension arc (grown-ness ≈
integral of T over the track, reset at track boundaries via regrow-in-fog),
plus the one legal rhythm contact per §3.1: small blooms that open on
downbeats only — anchor-priced, from the event stream's look-ahead so they
open *on* the beat, not after it.
*Accept:* watching the floor for 60 s shows visible growth; blooms land on
downbeats within a frame.

## Tier B — a real figure stream (the cubes must die)

The figure stream is the placeholder-est part of the system, and it's the
stream the eye is invited to watch.

### B1. Kick/snare vocabulary (S)
Replace cubes with a two-word vocabulary: kicks = expanding ground-plane
shockwave ring at the camera's altitude (the sidechain's *visible wavefront*
— it can even be what triggers the ether flinch in A1); snares = a brief
scatter of hard-edged shards with one-frame attack and fast decay. Both stay
white-hot and unbloomed (figure pass).
*Accept:* drums are watchable with the sound off; nothing fires on break
interior hits.

### B2. The recurring glyph (M)
§5's repetition budget: ONE silhouette — proposal: a long-tailed moth/bird
line-figure, drawn as a few dozen line segments so it reads at any scale —
that appears only in each track's `peak` section (the bus now knows sections,
D11), transformed per track: among the roots it's small and violet; at the
canopy climax it's vast and slow overhead; in zenith it's a constellation
outline in the shell lattice. Three appearances make it an institution; it is
the visual sibling of the music's `MOTIF`.
*Accept:* same silhouette recognizable in all four tracks; absent outside
peak sections.

### B3. Stream fusion at the set climax (S, spent once)
At the canopy track's golden-ratio bar (computable exactly from the
timeline), the one forbidden effect: figure ignites ground — shockwave rings
spawn particle bursts, the ether takes the figure's color for ~8 bars, then
the streams re-segregate. Forbidden everywhere else, which is what makes it
the climax (§5).
*Accept:* occurs exactly once per set loop, at the same bar every loop.

## Tier C — atmosphere & light

### C1. Volumetric shafts (M)
Godray shafts through the canopy band — billboard light blades or a cheap
raymarched cone from the directional light, density from fog, angle from the
light's brightness-driven altitude. The undergrowth gets thin blue-green
shafts; zenith gets full golden flood.
*Accept:* screenshot at canopy shows readable shafts; cost < 2 ms.

### C2. Altitude-graded atmosphere (S)
Replace single FogExp2 with a height-graded fog (violet floor haze → clear
canopy → golden bloom at zenith) — one shader chunk, big compositional win:
each biome gets its own *air*.

### C3. Zenith aurora (S)
A drift-driven ribbon shader above the shells — slow, wide, never repeating
(coprime UV scroll rates). Zenith is currently the sparsest biome and it's
the afterglow track; it needs one more ground element.

## Tier D — narrative machinery

### D1. Corpus shrine (L)
§3.5 made literal: a small flickering screen-object in the undergrowth
chopping CC0 footage with the *same* σ-permutation code as the break
(import `permuteBreak`, apply to video segments), edit rate = `w`. The one
place the world admits video. Needs a curated CC0 clip pack first (jungle
footage, degraded).
*Accept:* shrine visible only in undergrowth; cuts land on the 16-grid.

### D2. Mischief twins (S–M, blocked on music-side mischief layer)
When the music-side mischief layer (theory §8) lands, each master-bus joke
gets its visual twin, driven by the same bus event: LPF sweep = defocus +
desaturate (underwater); tape stop = frame-hold with afterimage smear decaying
to black; stutter = frame-buffer retrigger of the last beat's frames; sudden
dry = fog and bloom vanish for one bar. The post chain already has the nodes
for most of these.
*Accept:* joke audible ⇒ joke visible, same bar, from the bus event — never
inferred from audio.

### D3. Seam travel choreography (S)
Seams currently ride the brightness blend. Add per-seam camera flourish:
during `seamLate`, a slow push-in toward the next biome's band with slight
roll, released exactly on the boundary bar (bar-exact seams make this a
lookup, not an estimate). Motion signature stays continuous — it's a
*flourish on* the travel, not a cut.

## Tier E — plumbing (buys headroom for everything above)

- **E1. Adaptive quality (S):** frame-time governor that scales particle
  counts / pixel ratio / shaft samples; biomes read a `quality` scalar.
  Prevents the fancy tiers from ever costing the 60 fps groove.
- **E2. Flythrough/debug mode (S):** free camera + biome isolation toggles +
  `?altitude=` param; makes every later item reviewable in seconds. Build
  this FIRST — it pays for itself during A1 review.
- **E3. Screenshot harness (S):** extend the biome-sweep script into a repo
  tool (`tools/visual_check.mjs`) capturing all bands + a seam + the climax
  bar, both backends. The WebGPU point-size bug survived because we only
  looked at one backend; this makes that class of miss structural to catch.

---

## Suggested order

**E2 → E3 → A1 → B1 → C2 → A3 → B2 → C1 → A2 → C3 → D3 → B3 → D2 → D1.**
Rationale: tooling first (cheap, de-risks everything), then the two most
visible upgrades (ether motion, real drum figures), then atmosphere, then the
narrative pieces once the world moves well. D1 last — it's the largest and
needs an asset pipeline decision.

Rough total: E+A+B ≈ a focused week of sessions; C+D on top ≈ another.

## Open decisions (need a call before their item starts)

1. **Glyph identity (B2):** moth? bird-of-paradise? something abstract? It
   recurs all set — worth choosing deliberately, ideally with the music
   agent so the motif and glyph feel like the same character.
2. **Corpus footage source (D1):** curated CC0 pack vs. procedurally
   degraded renders of our own world (self-corpus — no licensing surface at
   all, and thematically strong: the jungle dreaming of itself).
3. **WebGL2 fallback policy for compute tiers (A1/A2):** maintain parallel
   simple paths (current approach) or declare WebGPU required for "fancy
   mode" and auto-degrade to today's visuals otherwise.
