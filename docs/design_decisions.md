# Design Decisions

Running ADR-style log. Each entry: what was decided, why, what was rejected,
and what would trigger revisiting. Dates are decision dates.

---

## D1 — Set timeline as authored tracks with one shared tension shape (2026-07-26)

**Decision.** The set is an authored array of tracks in `bus.js`
(`TRACKS`), each with `{ seconds, floor, peak, brightness: [start, end] }`.
Per-track tension = one shared breakpoint list (`SHAPE`, golden-ratio climax)
rescaled into `[floor, peak]`. The set-level story is told by choosing peaks:
the climax track (canopy) peaks at 1.0 and sits ~0.62 of the way through the
set.

**Why.** The music doc §5 asks for the *same* tension-curve shape at phrase,
track, and set scale (fractal self-similarity, "nearly free to implement —
one curve, sampled at three rates"). Reusing `SHAPE` per track and expressing
the set curve through per-track peaks implements exactly that with zero new
machinery. Authored breakpoints replace the old single analytic curve because
composing a real set needs dips and plateaus a power curve can't give.

**Rejected.** Per-track bespoke breakpoint lists (allowed later — the
`sampleBreakpoints` helper takes any list; add a `shape` field per track when
a track earns one). A generated/stochastic set structure — form is the one
thing the theory says to author, not generate.

**Revisit when** composing a real set: tracks will want individual shapes and
probably individual `SEAM_SECONDS`.

## D2 — Brightness is a timeline signal, and it drives BOTH harmony and altitude (2026-07-26)

**Decision.** `bus.brightnessAt(t)` is now a first-class authored function of
time (per-track linear walk + seam blending + manual override knob), replacing
the static `modeBrightness` param. The music quantizes it to a mode
(`modeAt`); the visuals map it to camera altitude.

**Why.** This is the double degenerate solution both theory docs argue should
be adopted *together*: one tonal center with all harmonic story on the
brightness axis (music §6.2), and one world with altitude = brightness
(visual §4.4). Making brightness a bus signal means the harmonic walk and the
camera's journey are *the same number* — coherence between media is
structural, not coordinated.

**Consequence with teeth.** During a seam, `brightnessAt` blends toward the
incoming track's opening brightness (smoothstep to full blend at the
boundary). That one line gives BOTH media their foreshadowing: the pads start
re-coloring toward the next track's mode, and the camera starts traveling
toward its biome — neither medium had to be told separately. The blend goes
all the way to 1.0 so the walk is continuous even across the set loop
(zenith 1.0 → undergrowth 0.1); anything less teleports the camera.

**Rejected.** Foreshadowing implemented separately in engine and scene
(duplicated logic, drift risk); brightness snapping at boundaries (audibly
fine — a mode change on a downbeat is legal — but visually a teleport).

## D3 — Seam operator at phrase granularity, inside `buildArrangement` (2026-07-26)

**Decision.** The seam (§6.3) is implemented as *modes of the arrangement
builder*, keyed off `bus.seamAt(t)`: early seam (progress < 0.6) =
intensified exit (w +0.25, hats E(7,16), rising gain, tension spike from the
bus); late seam = break/skeleton/bass/lead removed, doubling snare-roll
countdown, pads untouched (the common tone). Rebuild cadence was tightened
from 8 bars to 4 (~5.7 s) so a 12 s seam window spans ~2 rebuilds and both
phases actually occur.

**Why.** The engine already rebuilds the pattern every phrase; making the
seam a function of `(tension, seam)` reuses that machinery and keeps the
seam's *musical content* in generators.js where all composition lives.

**Known coarseness (accepted).** Phase edges land on rebuild boundaries, not
musical bar lines — the drums may die a phrase early/late relative to the
theoretical ideal. The alternative — Strudel `arrange()`/`slowcat` with
bar-exact seam patterns compiled ahead of time — is the correct end state but
couples the timeline to the pattern engine more deeply.

**Revisit when** seams sound sloppy in listening tests; then compile the seam
as a bar-exact arrangement and align `TRACKS[i].seconds` to whole phrases
(96 s = 42 bars at 168 BPM — *not* currently phrase-aligned; fix together).

## D4 — Audio sidechain via superdough `duckorbit`, kick-only, from the coupling knob (2026-07-26)

**Decision.** The skeleton was split into separate kick and snare patterns so
that ONLY the kick carries `.duckorbit('3:4').duckattack(0.12).duckdepth(d)`,
ducking pads (orbit 3) and lead (orbit 4). Depth `d = coupling × (0.4 + 0.6·T)`
where `coupling` is a new bus param (UI slider + MIDI CC 91). Orbits 1–4 are
pre-created at engine boot (`getSuperdoughAudioController().getOrbit(n, [0,1])`)
because superdough creates orbits lazily and ducking a nonexistent orbit
errors.

**Why.** §3.3: the sidechain is the coupling constant of the whole system —
the one audible contact between heaven and the machine — and it must be the
same constant the visual duck renders (`duck` in scene.js). Tension-scaled
depth implements "loose early, hard at the climax." Kick-only because the
theory's image is the *kick* touching heaven; snare-ducking muddies the
backbeat's role as anchor.

**Engine-discipline note.** `duckorbit` is a renderer-side (superdough)
concept, but it's expressed as an abstract event param in the pattern, which
is the boundary we committed to; an OSC/SuperDirt backend would map it to
SuperDirt's own ducking or a compressor bus.

## D5 — One-world biomes adopted; no scene switching (2026-07-26)

**Decision.** The visualizer theory's open proposal (§4.4) is accepted. The
visual system is one continuous world (`src/visuals/biomes.js`): local-rule
roots (0–12), growth floor (10–24), field canopy (22–42), self-similar sky
(40–62), bands overlapping so no altitude is empty. Transitions between
"scenes" do not exist as a mechanism; the camera travels, driven by
`brightnessAt` sampled 4 s ahead.

**Why.** It makes the entire transition problem (§4.1–4.3's distance metric,
continuity ranking, visual seam operator) *vacuous* rather than solved —
every boundary is legal by construction — and it is the visual twin of the
one-tonal-center commitment the music already made (D2). The strongest
continuity layer, camera motion signature, is continuously maintained because
the camera never cuts.

**Cost, accepted.** A biome is weaker at its family's job than a dedicated
full-screen scene would be (the sky shells will never be as engulfing as a
full raymarched fractal). The theory's answer: the *set* is the unit of
experience, and one-piece-ness beats per-scene spectacle. Radical scene
changes remain available at drops via change blindness (§5) without breaking
the world.

**Rejected.** A scene registry + distance-ranked seam transitions (the §4.1–4.3
machinery as code). Kept in the theory docs as the fallback if the one-world
render budget fails.

## D6 — One melodic cell for the whole set; 80/20 transform bag (2026-07-26)

**Decision.** `MOTIF` in generators.js is a module-level constant — the set's
single melodic cell (§6.4). The lead generator draws 80% transformations of
it (retrograde, inversion, rotation, diatonic transposition, literal recall)
and 20% fresh bounded walks; contour is generated apart from pitch and then
quantized into the current mode in octave 5+ (contour-then-quantize, §3).
The lead enters only above T ≈ 0.3, placed on sparse E(k,16), drowned in
reverb, half-time.

**Why.** Motif recall across tracks converts a sequence of tracks into an
argument; mode changes re-coloring a held shape is what "lyrical" means (§3).
Drowning it resolves the pluck ambiguity (§7.2) toward the far stream — the
lead is ether, not a soloist. The tension gate keeps the novelty budget for
sections that have earned melody.

**Revisit when** the lead needs figure moments (a dry, gridded variant at
climaxes is the other legal §7.2 resolution — worth an A/B).

## D7 — WebMIDI as a params-writer only, fixed CC map, coalesced rebuilds (2026-07-26)

**Decision.** `src/midi.js` maps a hardcoded CC table (mod wheel → wildness,
74 → brightness, 71 → tension, 91 → coupling, 93/95 → the mix knobs) onto
`bus.params`, coalescing knob twists into at most one rebuild per 250 ms.
Unmapped CCs log once, so any controller can be mapped by editing one object.
No MIDI learn, no UI.

**Why.** §9's principle: a performer writes *signals*, nothing else — MIDI is
just ui.js with hardware. The 250 ms coalescing is the "immediate
registration, quantized application" latency class (§9.2) in cheap form
(params update instantly — the *visuals* see them immediately — while the
pattern rebuild waits). MIDI learn is ergonomics, not architecture; deferred.

## D8 — Orbit map is the stream vector (2026-07-26)

**Decision.** Orbits are semantically fixed: 1 = drums (near/dry), 2 = bass
(floor, mono territory), 3 = pads (far/wet), 4 = lead (far/wet). New layers
must join an existing orbit's stream character or justify a new orbit.

**Why.** §3.1's bimodal clustering needs per-stream effect treatment (framework
checklist item 4); orbits are superdough's render layers. Keeping the map
stable is what lets the duck target "the far stream" as a set of orbit
numbers.

---

*Add new entries above this line, newest last. If a decision is reversed,
don't delete it — append the reversal as a new entry referencing the old.*
