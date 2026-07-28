# Design Decisions

Running ADR-style log. Each entry: what was decided, why, what was rejected,
and what would trigger revisiting. Dates are decision dates.

**Numbering.** Unique, but not ascending in file order — entries are in date
order, and one renumbering crossed it. D19–D21 were each assigned twice, on
two long-lived parallel branches (`perform-fx` and the visuals/music line)
that could not see each other's numbering. The perform-branch entries kept
D19–D21; the four visuals-branch entries were renumbered into the next free
slots as **D24–D27**, each noting its original number under the heading so
older references stay traceable. D22 and D23 were written after that merge and
keep their numbers, which is why they sit last by date but below D24–D27.

Assign the next `D` number **at merge time, not on the branch** — nothing else
prevents this recurring, since it is a structural consequence of parallel
branches rather than carelessness.

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

## D9 — Bar-exact seams: cycle-keyed set compiler, bar-quantized timeline (2026-07-26)

**Decision.** D3's accepted coarseness is resolved. The timeline is now
expressed in whole bars (`TRACKS[i].bars`, multiples of `PHRASE_BARS`; the
seam window is 2 phrases, its late phase the final phrase), with `BPM`/`CPS`
moved into bus.js as the one shared clock constant. The engine no longer
rebuilds on a drifting `setInterval`; `makeSetPattern` (generators.js)
returns ONE pattern covering the looping set, keyed to the scheduler's
absolute cycle count: a dispatcher `Pattern` splits each query at exact bar
lines (`spanCycles`, Fraction math), maps bar → phrase index, and lazily
compiles that phrase's arrangement with a deterministic per-phrase seed.
`phraseStateAt(i)` (bus.js) computes seam phase per phrase in integer bar
arithmetic. The snare countdown is now a 4-bar accelerating roll
(`[sd sd*2 sd*4 sd*8].slow(4)`, gain ramp per bar) landing exactly on the
incoming downbeat; the hat riser ramps per bar the same way.

**Why.** Cycle-keying makes seam edges sample-exact *by construction*: the
scheduler's cycle grid IS the music's bar grid, so no swap timing, timer
drift, or lookahead race can displace a phase edge. Determinism per phrase
index means `setPattern` swaps (knob changes) are seamless — old and new
patterns agree about any overlapping span. Re-permutation per phrase now
falls out of the phrase-indexed seed instead of a timer; the rebuild timer
is deleted entirely.

**Consequences.** Tracks are 68 bars (≈97 s). Stop/start restarts the set
from the top (the Cyclist resets its cycle counter on stop; toggle re-pins
bus t=0 so both clocks agree — pause-and-resume would silently desync them).
Knob changes still take effect immediately (fresh compile, cache dropped),
which remains the performance gesture, not a bug.

**Verification.** `npm test` (test/seams.mjs) queries the compiled pattern at
the hap level and asserts: drums/bass/lead vanish exactly at the die-line
bar, countdown doubles 1/2/4/8, kick returns exactly on the boundary
Fraction, the set loop gets the same treatment, and two independent compiles
agree hap-for-hap. (Node needs a resolve hook for @kabelsalat/web's broken
`main`; see test/hooks.mjs.)

**Rejected.** Strudel `arrange()`/`slowcat` over pre-built seam sections —
those rebase inner cycle time per section, which would break the half-time
layers' absolute cycle parity; the dispatcher queries phrases at absolute
time instead.

## D10 — MIDI learn + OSC-over-WebSocket, both as params-writers (2026-07-26)

**Decision.** D7's deferred ergonomics are in. midi.js keeps its default CC
table but the map is now mutable at runtime — `learn(key)` arms one-shot
binding (next CC wins, one CC per param, 10 s timeout) — and persists in
localStorage. ui.js grows small `cc` buttons beside each slider once WebMIDI
resolves; they display the live binding. New src/osc.js connects to a
WebSocket named by `?osc=ws://host:port` (persisted) or localStorage and
accepts open-stage-control-style JSON (`{address, args}` with plain or typed
args, batched arrays) plus a plain `{param, value}` form; the last address
path segment names the param, `tension`/`brightness` alias the manual knobs;
values clamp; unknown params and non-numbers are ignored. Same 250 ms rebuild
coalescing as MIDI. Reconnects with capped backoff so the o-s-c server can
start after the page.

**Why.** Both are ui.js with a different transport (§9.1) — they write
`bus.params` and call the same coalesced rebuild, nothing else. The decoder
(`applyOscMessage`) is a pure function so it's unit-tested in node
(test/osc.mjs) without a socket.

**Rejected.** Implementing o-s-c's full session protocol (its widget sync is
server-driven; we only need param writes). Binary OSC framing — o-s-c speaks
JSON over its WebSocket, and anything else can too.

## D11 — In-track sections: tension gates the arrangement, not just the knobs (2026-07-26)

**Decision.** Each track now has an internal section form, computed bar-exactly
from `barInTrack` (new `sectionAt` in bus.js, surfaced via
`phraseStateAt(i).section`): **intro** (ether only — pads, no drums/bass/lead)
→ **build** (thin degraded break, reduced anchor, bass enters, no lead) →
**groove** (the full arrangement, previous behavior) → **breakdown** (drums and
bass out, pads swell, lead featured — placed at the tension curve's authored
dip) → **build2** (full arrangement intensified, hat riser, and a one-bar
ether-only dropout in its final bar — §5's pre-drop denial) → **drop/peak**
(everything slams back at full anchor strength, landing at ~0.59 of the track,
the golden-ratio prior) → **release** → the existing 2-phrase **seam**.
Sections are allocated in whole phrases by proportional weights
(`SECTION_LAYOUT`), so every edge lands on a phrase line and inherits D9's
bar-exactness for free. `buildArrangement` takes the section and gates which
layers exist; continuous tension/brightness modulation is unchanged.

**Why.** Listening verdict on the D9-era engine: tracks were ~97 s of the full
stack playing continuously, so the authored tension arc (D1) was nearly
inaudible — tension only turned continuous knobs (lpf, gain, hat density),
never *what plays*. The theory already demanded this fix: §5's drop is
expectation arithmetic (riser + countdown + withheld arrival), the breakdown
rule is "skeleton off ⇒ reduce w," and ambient sections are where the ether
becomes figure. Deriving sections from bar arithmetic (not from thresholding
the tension value) keeps them deterministic, phrase-cached, and identical
across recompiles — the same properties D9 bought for seams.

**Rejected.** Thresholding `tensionAt` into states (edges would move when the
tension knobs move — sections are form, and form is authored, D1). A separate
section timer/state object in the engine (the phrase compiler is already the
one place arrangement state lives). Sections expressed as Strudel `arrange()`
(same absolute-cycle-parity objection as D9).

**Revisit when** tracks earn bespoke forms — `SECTION_LAYOUT` is one shared
shape like `SHAPE`; a per-track `layout` field is the natural extension.

## D12 — Per-track instrumentation palette (2026-07-26)

**Status: delivered, as part of D22 (2026-07-27).** `TRACKS[i].palette` in
`bus.js` carries the break costume, hat character, bass kind, pad width and
lead patch, and generators read it without their shapes changing. The palette's
own licensing caveat is resolved too: every sound a palette names is either a
superdough synth or a sample this repo ships, so the cast survives the remote
pack being unavailable. Design and rationale: `docs/track_identities.md`. The
deferral note below is kept as the record of why it waited.

**Decision.** Give each track an identity by varying *sounds* over
the fixed machinery (§7: "the half that keeps a twenty-minute generative set
from feeling like one very long track"): a per-track palette object on
`TRACKS[i]` — break sample (Think/Apache/etc. via the remote dirt-samples
pack, with `jbreak` as the offline fallback), pad/bass waveform and register,
hat character, lead patch. Same σ-permuter, same isorhythm, same voicing
logic — a different *performer* per track. This is orchestration downgraded
to data, so it belongs in the authored timeline (bus.js), not in generators.

**Why deferred.** D11 (sections) gives the most audible payoff per line and
had to land first — palette changes on top of an undifferentiated wall would
still sound like one long track. Also the richer break palette depends on the
remote sample pack, which is dev-only (licensing, README) — the palette
design must degrade gracefully to the local synthesized kit.

## D13 — Key movement across tracks (open question, deliberately unresolved) (2026-07-26)

**Status.** The single tonal center (`ROOT = 50`, D — §2.1 rule 1, strong
version) is a founding commitment: the set's harmonic story lives entirely on
the brightness/mode axis (D2), and "maximal harmonic stasis" is half the
genre thesis. Listening feedback says tracks blur together; mode color alone
may be too subtle a differentiator once D11/D12 land — or may be exactly
enough. **Option on the table:** per-track root offsets (e.g. movement by
fourths, returning home for the set loop), applied at the seam so the
boundary carries the modulation — §6's "transitions are modulation at macro
scale" supports this without new machinery (a `root` field per track,
threaded through scales.js). **Decision deferred** until D11 + D12 are
audible: change one variable at a time, and key movement is the one that
spends the thesis.

**Update 2026-07-27 — unblocked, still open, and the case is weaker.** The gate
has been passed: D11 (sections) and D12 (palette) both landed. But two further
decisions have since attacked *the same complaint* from other directions —
D22 gave each track a warmth value, a tuning and a cast, and D23 broke the
one-bar groove. "Tracks blur together" was the motivation for this entry and
for both of those.

So the question is no longer "is mode color alone too subtle?" but "is anything
still blurred once warmth, tuning, cast and groove are all per-track?" If the
answer is no, D13 stays closed **on purpose** rather than by default — which is
the better outcome, since the single tonal center is half the genre thesis and
per-track roots are the one change that spends it.

This needs ears, not analysis: listen through a full set before deciding. Until
then the entry stays open with its option unchanged, and the founding
commitment (`ROOT = 50`, D) stands.

## D14 — Per-stream post chain + artifact operators + roots per-point pulse (2026-07-26)

*(Renumbered from a duplicate "D11" — written concurrently with the music-side
D11 above; any code comments citing D11 for the post chain mean this entry.)*

**Decision.** scene_plan roadmap items 2 and 5, plus the roots half of item 1.
The figure stream moved to render layer 1; two cameras (synced from the main
camera each frame, split by layer) drive two TSL `pass()` nodes through
`THREE.PostProcessing`. Bloom applies to the ground pass only, with
`strength = (0.4 + 0.5·Tf) · (1 − duck·0.6)` — the sidechain rendered a third
way, and lit ahead of the sound like everything else. The figure pass
composites over the bloomed ground additively, clinically sharp. The
artifact operators then run over the final frame: afterimage (feedback smear,
damp = max(0, w−0.55)·1.8 so it exists only in high-w stasis, §5), rgbShift
(amount = w²·0.004), film grain (0.05 + 0.3·w). The roots biome upgraded from
whole-cloud opacity to a per-point shader pulse: `PointsNodeMaterial` with
`opacityNode = base + sin(t·0.9 + phase)·amp`, phase being the pre-existing
spatial gradient attribute — traveling waves, alive, going nowhere. All
uniforms are bus signals (`env.t`, T, drift), never wall time.

**Why layers, not MRT masks.** Two cheap scene passes avoid per-material
`mrtNode` compatibility questions across the WebGPU/WebGL2 backends, and the
ground/figure split by camera layer is the literal implementation of §2.1's
bimodal stream clustering. The whole chain is wrapped in try/catch with a
direct-render fallback; verified live under the WebGL2 (swiftshader) backend:
post chain builds, frame renders, figure sharp with visible chroma fringe.

**Still open from roadmap 1.** The canopy ether still rotates as a whole
cloud; curl-noise TSL compute particles remain the end state.

## D15 — Transport: seek to any track or section by moving the playhead (2026-07-26)

**Decision.** `seekToBar(bar)` in engine.js jumps the set to an absolute bar:
it points the Cyclist's next query window at the target cycle
(`scheduler.lastEnd = bar`) and resets `num_ticks_since_cps_change` so the
scheduler re-anchors its wall-time↔cycle mapping on the next tick — the exact
mechanism `setCps` already uses — then re-pins bus t=0 with an offset
(`bus.start(nowFn, atSeconds)`) so both clocks agree "now" is that bar. No
rebuild, no pattern swap: because the set is one cycle-keyed pattern (D9),
the right phrase, section, and seam state follow from the cycle count by
construction. ui.js grows track buttons (jump to a track's top) and section
buttons (jump to that section of the *current* track), driven by the shared
allocator `sectionSpans` (bus.js) — the same function `sectionAt` now reads,
so the buttons and the compiler can never disagree about where a section
starts. Seeking while stopped starts playback at the target; a `seek` event
is published on the bus for any subscriber that wants to react discontinuously
(the camera will teleport, since brightness is a function of set-time).

**Why.** D11 made sections exist; auditioning them by waiting ~97 s per track
is not a workflow. Seeking by moving the playhead (rather than by rebuilding
patterns with faked state) keeps one source of truth — everything downstream
is already a function of (cycle, params), which is also why the whole feature
is ~15 lines of engine code.

**Accepted roughness.** Haps already scheduled within the ~latency window
(~100 ms) from the old position still sound at the moment of the jump — below
the threshold of caring for a monitoring control. The camera teleports on
seek; if that ever matters, the `seek` event is the hook for a visual cut
(change blindness at drops, D5, would even endorse it).

## D16 — Hat breathing + Barlow accents; per-biome ambience beds (2026-07-26)

**Decision.** Two listening-feedback fixes, one entry. (1) **Hats**: presence
is now drawn per phrase from a section-weighted table (full / sparse / off —
groove rests ~15% of phrases, release ~40%, peak never), velocities follow
*inverse* indispensability (the same Barlow table the permuter prices
positions with — accents push against the grid the skeleton holds down),
base level dropped ~35% and density capped at E(6,16); seam/build2 keep
their per-bar risers at the lower base. (2) **Ambience**: each track owns a
*layer stack* of synthesized 4-bar loops (`TRACKS[i].ambience = [bed,
...accents]`, generated in tools/gen_samples.py). The bed is always on —
cricket chorus / leaf-patter / chirps-over-air / wandering wind — and two
accent layers per biome (frogs + rustle, thunder + drips, warble-calls +
foliage gusts, shimmer drone + crystalline sparkle) drift in and out on slow
seeded presence walks (`layerPresenceAt`: smoothstep value noise over the
absolute phrase index, one cell ≈ 3 phrases → episodes of ~30–50 s, resting
below a 0.35 threshold; long attack/release envelopes turn the per-phrase
gain steps into fades). All layers retrigger phrase-aligned (`slow(4)` at
absolute cycles, loop point crossfaded in the sample itself), ride the ether
orbit (3, so the kick ducks them — the biome breathes with the music), sit
at 0.35/0.3 where the ether is figure (intro/breakdown/late seam), 0.15/0.12
under the full stack; during seams the *incoming* biome's bed crossfades in
early — §6.1's infiltrating ether made literal, and the audio twin of the
camera's biome traversal (D5). Walks key to the *unmixed* base seed and the
absolute phrase index, so they are deterministic across recompiles but never
loop with the set.

**Why.** Hats-always-on at one velocity was the fatigue complaint — and §7's
coprime-presence principle already said layers should rest. The beds are the
first slice of D12 (orchestration as timeline data) and give each track a
place-identity even before the palette lands. Names carry the `amb` prefix
(remote dirt-samples can't shadow them) and no underscores (mini-notation
syntax). See docs/section_ideas.md for the wider backlog these came from.

**Rejected.** Field recordings (licensing discipline — same rule as the
breaks; synthesized beds are CC0-by-construction and swappable later). A
dedicated ambience orbit (D8: it joins the far stream's character; a fifth
orbit would need its own duck wiring for no audible gain).

## D17 — The perform rail: DJ color FX at the renderer seam (2026-07-26)

*(Numbering note, resolved at merge: D16 landed as hat breathing + ambience
beds, and the seam variants that followed on main took D18.)*

**Decision.** Four new 0–1 params form a *perform rail*, modeled on the DJ
mixer canon (Pioneer's Sound Color FX: Filter, Dub Echo, Crush, Space):
`filter` (bipolar LP/HP, 0.5 = bypass, double-click snaps home), `echo`
(dotted-eighth dub echo whose feedback rises with the knob), `crush` (bit
depth 12→2), `space` (reverb wash). They live in `bus.params` like every
knob — slider, MIDI-learnable (default CCs 16–19), OSC-writable — but they
are **not composition inputs** and never touch the generators. Two
mechanisms, both at the renderer seam (engine.js, the one sanctioned
superdough-contact file), mappings in `src/perform.js`:

- `filter` drives superdough's per-orbit `djf` worklet — the literal DJ
  filter the renderer already ships (0 = LP kill, 1 = HP kill, 0.49–0.51
  bypass band). A 30 Hz follower in engine.js slews each orbit's AudioParam
  toward the knob with a 60 ms linear ramp: continuous sweeps, alive during
  silence, no zipper. Worklets are created lazily on first departure from
  center, so an untouched rail leaves the graph untouched.
- `echo`/`crush`/`space` overlay each hap's value at the existing output tap
  (`applyPerform` — pure, identity when idle): `delay`/`delaysync`/
  `delayfeedback`, `crush`, `room`, each composed with whatever the
  generators authored via max/min so the rail can only push an effect
  further, never cancel the composition.

**Why not the rebuild path.** The latent knobs are *intent* — launch-
quantized by D7's "immediate registration, quantized application," and that
is right for them: wildness is a decision about the next phrase. A mixer
gesture is the opposite — the hand IS the timing. Routing these through
`rebuild()` would stair-step sweeps at the 250 ms coalesce and freeze the
filter during silence. So ui.js binds them without onChange, and midi.js/
osc.js skip the rebuild for `PERFORM_KEYS`: the overlay reads `bus.params`
at scheduling time (inside the ~100 ms latency window) and the filter node
follows the bus at 30 Hz — the same read-pull relationship the visualizer
has always had.

**Rejected.**
- Pattern-route `.djf()` — 250 ms steps, frozen while silent; the whole
  point of a DJ filter is the sweep.
- Noise (the fourth Pioneer color FX) — a source, not a transform; if it
  ever arrives it belongs to the generators (a riser layer), not the rail.
- Roll/beat-repeat, backspin, tape stop — pattern-domain or playback-rate
  gestures the per-orbit graph can't express; roll also overlaps wildness's
  jurisdiction. Revisit as momentary *pattern* gestures on the D7 side of
  the line (launch-quantized), where they'd feel right anyway.
- A params registry (`{key, range, cc, …}` driving html/ui/midi/osc/tests)
  — this change added four params across seven declaration sites, so the
  smell is now measured, not hypothetical. Deferred until the next batch of
  knobs; `PERFORM_DEFAULTS` spreading into `bus.params` is the first step.

**Verification.** `test/perform.mjs` pins the overlay algebra: identity
(same object) when idle, max/min composition, authored `delaytime`
respected, `filter` never touching event values, the MIDI center value
(64/127) landing inside the bypass band, and `PERFORM_DEFAULTS` ⊆
`bus.params`. `test/osc.mjs` grew the four keys and a writable check.

## D18 — Seeded seam variants: the landing and the dissolve (2026-07-26)

**Decision.** The seam→intro arrival was the awkward moment of the set: §6.3
promises `clean_downbeat(B)` as "the payoff," §5 says "every seam is a small
drop," but every track opened with `intro` — the emptiest section — while
`tensionAt` fell off a cliff (≈0.95 → the incoming floor). The countdown
promised a drop and delivered a void. Fix (docs/seam_landing_proposal.md,
Option D): every boundary now draws one of two flavors, seeded per (set seed,
incoming track index) via `seamVariant` in bus.js — §5's "predictable time,
withheld content" applied to the seams themselves.

- **Landing** (deliver the payoff): the countdown stays as designed; bar 0 of
  the new track is an *arrival* — the heartbeat kick slams at gain 1 with a
  deepened duck and decays per-bar across the phrase, a one-note root pedal
  (whole notes, fading) makes the floor a promise, the biome bed answers at
  full voice, and a synthesized impact one-shot (`ambimpact`: boom falling to
  D1 + noise splash + D/A partial afterglow, ~3.5 s tail) lands exactly on
  the downbeat. Intro phrase 0 is aftermath; phrase 1 is the pure intro. The
  tension cliff remains but is *covered* by the event.
- **Dissolve** (withdraw the promise): the same accelerating roll with its
  energy inverted — gains fall, lpf closes, wet rises (the drums recede into
  weather, §3.4) — the hats leave with the promise, and `tensionAt`'s late
  phase smoothsteps down into the incoming track's opening tension instead of
  spiking. The ambient arrival is what the gesture prepared.

Variant choice keys to the UN-mixed seed (like the presence walks) so it is
stable across recompiles; `bus.seamAt` returns it so the visuals can stage
the boundary the same way the music resolves it. Because the set loops,
*every* intro follows a seam (zenith wraps into undergrowth) — the cold-open
pure intro exists only on a fresh start or a seek, which is where it belongs.
Default seed 1 happens to draw landing into the climax track (canopy) and
dissolve into the comedown (zenith).

**Why.** The two flavors are duals — deliver the payoff or withdraw the
promise — and either alone would be heard four times per set loop; seeding
the choice per boundary is the same move as the planned peak drop variants.
Keeping the selection in one exported function preserves the bus contract:
both media read the flavor from S, never from each other.

**Rejected.** Reordering `SECTION_LAYOUT` so tracks open at `build`/`groove`
(makes every boundary a drop, competing with the per-track peak, and breaks
§6.1's drums-don't-cross asymmetry). A non-deterministic or time-dependent
choice (breaks D9's recompile-swap identity). Guaranteeing both flavors per
set (a ~12% chance a seed draws all-same; accepted — the seed knob exists).

**Revisit when** the peak drop variants land (share the variant-drawing
idiom), or if listening says a third flavor (e.g. tape-stop, §8) earns a slot.

## D19 — The master insert: EQ kills, gater, drive, and a roll (2026-07-26)

**Decision.** Six more perform sliders, completing the mixer: `eqLow`/`eqMid`/
`eqHigh` (isolator-style band kills, unity at the top), `gate` (bar-locked
square gater at eighths), `drive` (master saturation), and `roll` (drum
stutter, ×2/×3/×4). D17 established two mechanisms; these need two more.

*The master insert* (`music/masterchain.js`) splices a chain between
superdough's `destinationGain` and the speakers —
`low ▸ mid ▸ high ▸ saturate ▸ makeup ▸ gate` — driven by the same 30 Hz
follower that already slews the djf filter. This is the "master bus as an
addressable target" the README has carried as an open item since D10. The EQ
is a shelf/peak/shelf *series*, not a crossover split: three parallel bands
summed would need Linkwitz-Riley alignment to stay flat, whereas a series of
shelves is flat by construction when every knob sits at unity — which is the
state the rail is in for all but a few seconds of a set. The gater's LFO is a
square wave through an 80 Hz lowpass (rounding its edges to ~4 ms so the gate
thuds instead of clicking), summed into the gain node's AudioParam over a
base of 1, and *started on the next bar line* from the bus clock — the gate
inherits D9's bar-exactness rather than landing wherever the hand fell.

*Roll* is the exception that proves D17's rule: it is the one perform knob
that is launch-quantized, because a stutter that doesn't land on the grid
isn't a stutter. It is pattern surgery at rebuild — `ply(n)` over the drum
orbit only (D8's frozen map), stacked back with the untouched streams, with
a `1/√n` gain trim so quadrupling the hits doesn't quadruple the energy. The
generators never learn it happened. `PERFORM_LIVE_KEYS` now names the subset
that skips the rebuild; anything outside it (today just `roll`) must ride one
or it is silently inaudible, which is the kind of trap worth a named set.

**Why lazy.** Every stage builds on the knob's first departure from rest, as
the djf worklets do. An ordinary listen never gets an extra filter, shaper,
or oscillator in its path — the graph superdough built stays the graph
superdough built. `masterNeutral()` is the predicate, and it is tested.

**Rejected.**
- *Boost.* Real isolators go to +6 dB. On a generative master with no limiter
  that is a clipping trap, so the EQ range is unity-to-kill only.
- *Per-event tremolo/phaser* (superdough ships both). They are per-voice, so
  a gate would chop sustained pads and barely touch a hi-hat one-shot — the
  opposite of a master gater. The insert is the honest home for time-domain
  FX.
- *A gate-rate slider.* Eighths at 168 BPM (5.6 Hz) is the usable chop; a
  second knob per effect is how a performance rail becomes a synth.
- *`ply(8)`.* Measured at 824 drum haps per 4 bars — a buzz, not a roll, and
  a voice-allocation risk. Divisions cap at 4.

**Measured, not assumed.** The first cut of `drive` normalized its tanh curve
to full scale, which meant everything below full scale got *louder*: a 0.25
sine came back at 0.50 on the meter, +6 dB, on the master bus. The trim is
now derived — it cancels the gain the curve actually applies at a nominal mix
level — and `driveNetGain` is asserted within 2% of unity across the knob.
Drive changes timbre and deliberately not loudness.

**Verification.** `test/perform.mjs` covers the pure mappings (EQ dB curve and
its true-kill floor, gate rate as a whole bar division, shaper curve
monotonic and normalized, drive level-neutrality, roll quartiles and √n trim,
rest detection, and the live/launch-quantized split). `test/roll.mjs` compiles
the real set pattern and asserts the stutter multiplies drum onsets *exactly*
×2/×3/×4, leaves bass/pads/lead identical hap-for-hap, preserves total energy,
and keeps the downbeat. The Web Audio surgery itself was verified in a
headless browser by stopping the transport and injecting known 90 Hz and
9 kHz tones: each band kill measurably removes its own tone, unity restores
the signal, the gater chops a steady tone to 8% and reopens on release, and
drive returns the same RMS it was given.

## D20 — Two filter dials, replacing D17's bipolar knob (2026-07-26)

**Decision.** D17's single `filter` knob (0 = LP kill, 0.5 = bypass, 1 = HP
kill, riding superdough's per-orbit `djf` worklet) is retired. In its place:
`lpf` (1 = wide open, sweep down to close) and `hpf` (0 = wide open, sweep up
to thin), each two cascaded biquads at 24 dB/oct with mild resonance on the
first stage, living in the D19 master insert between the EQ and the drive.
This is a reversal of D17's filter mechanism only — the echo/crush/space
overlay it introduced is untouched, and the "a mixer gesture's timing is the
hand's" principle is what motivated the change.

**Why.** A bipolar knob cannot be swept in two directions at once, and one
`djf` AudioParam per orbit physically cannot hold two cutoffs, so independent
dials were not a skin over the old control — they required owning the filter.
Which turned out to be the cheaper thing anyway: the D19 insert already
existed, and the D17 filter was *already* a master filter in everything but
name (it wrote the same value to all four orbits). Consequences that fall
out of the move: the two compose into a bandpass, the 0.49–0.51 dead zone and
its double-click-to-recentre affordance are gone (each dial's home is now an
end of its own travel), and the cutoff law is ours — an exponential sweep in
octaves rather than the worklet's `(v·11)⁴`, whose useful range crowded into
the last third of the knob.

**Cost, accepted.** Four more biquads on the master path, and the loss of
per-orbit filtering, which nothing used. The insert stays lazy: at rest the
dials are not in the signal path at all.

**Migration.** A controller that learned the old `filter` key would otherwise
write a param nobody reads — inert, and miserable to diagnose. `loadMap` in
midi.js rewrites a persisted `filter` binding to `lpf` on load.

**Verification.** `test/perform.mjs` pins the cutoff law (transparent at each
home, closed at each far end, geometric-mean midpoint, monotonic, clamped,
and a passband rather than silence when both sit at half travel); the OSC test
asserts the retired `filter` address is now rejected rather than silently
accepted. In a headless browser, with the transport stopped and 90 Hz and
9 kHz tones injected at the head of the chain: `lpf` at half travel passes the
low tone (0.190 of 0.194) and removes the high one (0.000 of 0.179), `hpf` at
half does the exact mirror, both engaged leave a band that excludes both test
tones, and returning both dials home is transparent to within 2%. The D19
stages were re-measured through the reordered chain and still hold.

## D21 — Filter dials: a rotary control, and a sweep the hand can hear (2026-07-26)

**Decision.** Two corrections to D20, which got the routing right and the
*control* wrong in both senses of the word.

*The gesture.* `lpf`/`hpf` are now rotary dials (`src/knob.js`), not the
horizontal sliders every other param uses. The knob is progressive
enhancement over the existing `<input type="range">`: the input stays in the
DOM as the source of truth and the dial writes to it and dispatches the same
`input` event a drag would, so ui.js's bindings, the MIDI learn buttons that
anchor to the label, the `value` attribute that documents the default, and
keyboard access all keep working untouched — the knob is an affordance, not a
second control path. The gesture is a vertical drag rather than a circular
one: a filter sweep wants a decisive throw, and tracing an arc is a wrist
motion you run out of halfway through a build. Each dial carries a live Hz
readout, because a filter position is a number a performer wants to see.

*The law.* The cutoff sweep gains a skew: `f = open · (closed/open)^(amount^0.7)`.
A pure exponential — constant octaves per degree — is the right first guess,
since the ear hears filter sweeps in octaves, and it is what D20 shipped. It
sounds dead anyway, because the top octaves carry almost no musical energy:
the first fifth of the lpf's throw moved the corner from 20 kHz to 5.4 kHz,
which on a jungle mix is very close to nothing, and every audible thing
happened in the last third. The skew spends travel where the ear notices —
the corner is at 5.8 kHz by a tenth of a turn and 2.7 kHz by a fifth. The hpf
gets the same treatment (139 Hz by a fifth of a turn, where D20 needed half
the throw to reach 450 Hz). Ranges tightened to 40 Hz–20 kHz and 20 Hz–8 kHz.

**Consequence, accepted.** Two aggressive dials now overlap: both at noon is
silence rather than a token passband, and D20's test asserting otherwise was
replaced. That is what independent LP/HP filters do on real hardware — it is
how you filter something out completely — and a usable band still lives
off-centre (hpf at a third, lpf at two-thirds gives 264 Hz–758 Hz).

**Rejected.** A circular drag gesture (wrist runs out, and it fights the
panel's vertical scroll). Making the whole rail rotary — the latent knobs are
set-and-leave, and a fader is the honest shape for those; only the filters are
ridden continuously. Special-casing a bypass band at each dial's home: the
skew already reaches transparency at the endpoint, and D17's 0.49–0.51 dead
zone is exactly the affordance D20 was written to delete.

**Verification.** `test/perform.mjs` now pins the fix rather than the old
curve: the corner must be under 6 kHz by a tenth of a turn and under 3 kHz by
a fifth, the hpf must be past 120 Hz by a fifth, and — the general form of the
bug — *no* tenth of either throw may move the corner less than half an octave.
The dial itself was driven in a headless browser: a 60 px drag lands within
0.003 of the predicted value and reaches `bus.params` through the hidden
input, the Hz readout tracks, the arc renders only when off home, double-click
snaps home, the wheel nudges, the master chain splices on the first turn, and
the label still wraps the control so MIDI learn keeps its anchor. The rendered
panel was inspected, not just asserted on.

---

## D24 — The look module: the renderer seam gets the perform rail's treatment (2026-07-26)

*(was D19 on the visuals branch)*

**Decision.** All mapping from bus state to post-chain state moves out of the
frame loop into `src/visuals/look.js` — a pure module with no three.js import,
no state and no DOM, tested by `test/look.mjs`. `look(params, env)` returns
every uniform the chain wants (bloom, smear, chroma shift, grain, saturation,
posterize steps, tint + amount, dim, vignette, focus/focal/bokeh, fog density);
`orbitAt`, `seamPush`, `seamFlashes` and `seamExhale` return the camera's. This
is exactly what D17 did for the audio seam with `perform.js`, and for the same
reason: the mapping is where the claims live, and claims deserve assertions.

Three things become checkable rather than assertable, and all three are theory:
**idle is identity** (the rail at rest reproduces the frame we already had —
so the fancy tier can never silently tax the default look); **perceptual
monotonicity** (§9.1: each knob moves exactly one nameable percept in one
direction, swept 0→1 in the test); and **continuity of the motion signature**
(§4.2: the camera's per-band orbit is sampled across 2000 altitudes and 4000
instants, and the largest step in either is bounded).

Built on it, three visual features that were previously blocked or missing:

- **The perform twins (H1).** The four D17 knobs get pictures, read from
  `bus.params` in the same frame — the old D2 "mischief twins" item, which was
  blocked on a music-side mischief layer that still doesn't exist. The twins
  are deliberately about three *different objects*: `filter`/`space` move the
  world (defocus, fog, vignette, dim), `crush` degrades the medium (posterize
  + grain), `echo` repeats the frame (afterimage + chroma displacement). That
  split is why they read as three jokes instead of three amounts.
- **Depth of field (G1).** The dictionary's `DRR → depth of field` row (§2),
  finally rendered: a bokeh DoF over the **ground pass only**, focus riding the
  camera's own look-at distance. The figure composites sharp on top — the eye's
  "no reverb on the drum bus."
- **Seam flavors, staged (I2).** D18 has published each boundary's flavor since
  it landed and the camera ignored it. A landing now resolves onto an *event*
  (exposure spike + vignette open, released on the boundary bar, decaying ~1 s);
  a dissolve never flashes — the fog opens, the focus widens, the push-in
  decelerates. Plus per-biome camera waypoints (I1), answering scene_plan §6.

**Two rendering details that were bugs before they were decisions.** The tint
is applied *scaled by luminance*, because mixing a flat color into the frame
lifts the blacks and turns a filter kill into a grey card. And the posterize
runs in gamma space with half-step rounding, because quantizing a dark linear
frame with `floor` costs exposure rather than color resolution — crush must
degrade the medium, not turn the lights off.

**Rejected.** Computing the look inline (status quo — untestable, and the
mapping is the interesting part). A uniform-per-effect registry (premature;
`look()`'s return object already is the registry). Driving any of it from
audio analysis — the rail is a bus param; inferring it from the signal would
be inference of the known (§1).

**Verification.** `test/look.mjs` (in `npm test`): idle identity, monotonicity
per knob, the twin semantics (LP submerges and defocuses, HP subtracts and
never defocuses, crush leaves exposure alone, echo moves nothing in the world),
timeline ownership (Tf raises bloom, duck dips it, fusion ignites), seam
staging by flavor, and the two continuity sweeps. `tools/visual_check.mjs`
grew a rail sweep and both seam flavors, on both backends.

**Revisit when** a music-side mischief layer (§8) lands — its events ride this
same module — or if the DoF pass proves too expensive on some backend, in
which case the governor's optics tier (D25) already knows how to drop it.

## D25 — The corpus shrine is self-corpus: the world films itself (2026-07-26)

*(was D20 on the visuals branch)*

**Decision.** The fifth visualizer family (§3.5) arrives as `shrine.js`: a
screen in the undergrowth showing **this world's** recent past, chopped by
`permuteBreak` imported from `music/generators.js` — the same σ, the same
anchors, the same per-bar re-permutation, the same `w`. A shrine-eye camera
records the ground stream into a ring of sixteen 256×144 render targets on the
16th-note grid; the screen displays slice σ(i) instead of slice i.

The long-open question (visuals proposal, open decision #2) was curated CC0
footage vs. self-corpus. **Self-corpus wins on four counts**: no licensing
surface, no asset pipeline (the reason D1 was scheduled last simply
evaporates), the thematically exact image — the jungle dreaming of itself, one
bar behind — and, decisively, the formalism stops being an analogy. §1.1 is a
theory of resequencing an ordered tuple under a recognizability constraint; the
break is one tuple of sixteen slices and the ring buffer is another, so the
*same function* runs on both.

Three properties fall out of that reuse:
- ANCHORS (0, 4, 8, 12) are never permuted, so on the downbeat and the
  backbeats the shrine shows **now** and agrees with the world, and lies only
  between them. The corpus family pays *into* the synch-point economy (§2.2)
  instead of spending from it — a visual downbeat is a metric anchor (§1.2).
- Edit rate = `w` by construction: identity at 0 (a quiet window onto the
  jungle), breakcore at 1. No second wildness mapping to keep in sync.
- The capture camera is restricted to layer 0, so it can film neither the
  figure stream nor the shrine itself: no feedback recursion, and the recording
  carries the weather without the drums.

Stream: figure (sharp, near, discrete, unbloomed), but figure confined to one
*place* — it fades out above the roots band, so the one biome that owns video
is the one you leave.

**Cost, and how it is paid (J1).** The shrine is one extra low-res scene render
per 16th (~11 Hz), gated on being in band, and the frame-time governor now has
three levers instead of one: a `quality` scalar the heavy biomes read (roots
sim steps, ether population, mist density), the **optics tier** (rebuild the
post chain without DoF — `PostProcessing.outputNode` is swappable, so a tier is
a rebuild, not a branch), and pixel ratio last. Spend order is by how little
each costs in meaning. The shrine drops out below quality 0.5, and
`?shrine=0` / `?dof=0` force either off.

**Rejected.** Found footage (licensing + a curation pipeline, for a strictly
weaker theoretical fit). Recording the composited frame (that includes the
shrine — recursion, and it would smuggle the figure stream into the ground
recording). A GPU ring texture with a compute copy (three's RenderTarget ring
is simpler and the cost is the scene render, not the copy). Chopping on the
figure's event stream instead of the grid (the corpus family's whole value is
that it articulates the *grid*, and the bar-exact clock already knows it).

**Revisit when** the ring's 16 frames prove too short to read as "the past" at
low `w` (a 32-slot two-bar ring is a one-line change), or if a curated CC0 pack
ever arrives — the shrine takes a frame source, so found footage remains a
drop-in behind the same interface.

## D26 — The biome beds become field recordings (2026-07-26)

*(was D20 on the visuals branch)*

**Decision.** The twelve synthesized ambience loops of D16 are replaced by
twelve **public-domain field recordings**, 32 bars (45.7 s) long and in stereo:
night insects on a Californian ridge, Greek night frogs, dry leaves; light rain
in a Kiel forest, a Dutch thunderstorm, cave drips at Fleury-sur-Orne; morning
birds over an Indiana trail, a Breton blackbird, wind through Colombian guadua
bamboo; wind singing in a pipe at 5 200 m on Chacaltaya, wind in Cretan power
lines, water drips in Takapuna. Every source is an archive.org
*radio aporee ::: maps* item under CC0 or the Public Domain Mark;
`tools/amb_sources.json` lists item, recordist and place, so the build input
*is* the attribution record. `tools/ingest_amb.py` (ffmpeg) downloads into a
gitignored cache, scores every candidate window for level, dropouts,
stationarity and — weighted hardest — **head/tail match**, then highpasses,
loudness-matches every layer to −23 LUFS and crossfades the tail into the head.
Output is Ogg Opus at 128 k: the sources are already lossy, so WAV would only
turn the same audio into 8 MB files. All twelve total 8 MB — about what the old
5.7 s mono WAVs cost, for 8× the material in stereo.

**The engine change this forced.** A 32-bar loop cannot be a 32-bar *event*. A
track is 68 bars, which is not a multiple of 32, so `slow(32)` would only fire
on cycles 0, 32, 64… — the biome change at bar 68 would sit silent until bar 96,
and the seam's incoming-bed crossfade (§6.1, D16) would never get an onset
inside its 8-bar window at all. So the trigger period stays one phrase and the
*file* is walked instead: phrase `n` plays slice `n mod 8` via `begin`/`end`
(`AMB_CHUNKS` in bus.js). Consecutive phrases play consecutive audio, so the
recording advances rather than repeating, and the audible loop period is 32 bars
off a 4-bar trigger. Because the chunk keys to the **absolute** phrase index,
every biome picks up wherever the set has got to. The envelopes had to come down
with it (0.5 s/2 s → ~0.01 s): superdough keeps the source playing for `release`
past the event end, and the next slice is that same audio, so any real release
would sum the recording with itself. The presence walks are unaffected — their
level curve is already continuous through the threshold, which is what the long
attack was doing anyway.

**Why.** The synthesized beds read as *synthesis* — sine trills and filtered
noise, not a place. Place-identity was the whole point of D16, and a real
recording carries room, distance and incident (a bird crossing, a gust arriving)
that no 4-bar generated loop reproduces. Length compounds it: at 5.7 s the ear
locks onto the loop within one phrase, and biomes run ~97 s.

**Reverses D16's "Rejected: field recordings."** That entry rejected them on
licensing discipline — the same rule as the breaks — and said the synthesized
beds were "swappable later." The rule is intact, not waived: CC0/PDM sources
only, provenance tracked in-repo, nothing of unclear origin vendored. What
changed is that a filterable public-domain corpus made the licensing-clean
version *also* the good-sounding one, so the tradeoff D16 accepted no longer
exists. D16's rejection of a fifth ambience orbit still stands.

**Rejected.** Freesound (its API needs an account key, so the build stops being
reproducible from a clean checkout). WAV output (105 MB of git for decoded lossy
audio). Ogg Vorbis (Homebrew's ffmpeg ships no libvorbis; Opus is better on
noise-like material anyway, and Chromium is the documented target). Retuning the
track length to a power of two so `slow(32)` would work — 68 bars is load-bearing
structure (D9), and the sample layer is not the thing that gets to move it.

## D27 — One atmosphere, and styles that are spent (2026-07-26)

*(was D21 on the visuals branch)*

**The world was four systems, not one place.** Every biome breathed on its own
private sine — the mist scrolled, the shafts flickered, the ether advected, the
aurora drifted — and nothing that happened to one ever happened to another. The
eye reads shared causation as place, and there was none. Second, everything
lived 12–90 units out, so the depth-of-field pass built in G1 had nothing close
enough to blur and the frame had no parallax gradient at all.

**Decision: a shared analytic wind field, and a near field.** `weather.js` is
pure (no three.js, no state, no DOM) for the same reason `look.js` and
`perform.js` are: the claims become assertions in `test/weather.mjs` rather than
paragraphs here. Gusts are a **plane wave travelling** along the prevailing
direction, not a global multiplier — a gust that arrives everywhere at once
reads as a fade. Wind grows monotonically with altitude, so climbing the world
is also climbing into more weather. Every biome samples `env.wind(x, y, z)` at
its own position and nothing else; any new biome should sample the field rather
than invent a clock.

**Decision: weather is a second authored axis (M2), not a knob.** Per-track
character crossfaded across seams on the same smoothstep the brightness walk
uses, so the incoming air arrives before the incoming downbeat (§6.1). Each row
is the visual half of a D16 ambience bed — the forest floor is the rainiest
because it is the track whose bed is `ambrain`, and its long-silent
`ambthunder` accent finally has lightning in front of it.

**Decision: lightning is weather, not meter.** Strikes are a seeded slot
schedule, so `lightningAt(t)` is time-addressable like every other bus signal —
askable about any instant, not a timer that must be stepped to stay correct.
This is what lets a hard-edged, high-contrast event live on the ground stream
without spending a synch point: it is caused by the sky, not by the bar.

**Decision: a style is spent, not sprinkled.** The new rule, and the reason
there are only three. An effect that changes *what kind of picture this is* —
ink, halftone, a kaleidoscopic fold — must be bound to a place in the set that
already carries meaning, so that seeing it is information: ink to breakdowns
(the section already about stripping back to lines), halftone to the far end of
`crush` (the medium degrading one register louder), the fold to the fusion
climax alone. A style visible at any moment is wallpaper, and §5's whole
argument about spending the climax applies verbatim. Adding a fourth means
answering *what does seeing this tell me?* first.

**Decision: the governor sheds ornament before it sheds sentences.** Three
chain tiers now — styles, then optics, then pixels, and never the groove. Depth
of field is the dictionary's DRR row and losing it costs a statement; the ink
pass costs nothing the set depends on. Bought back in reverse order.

**Learned the hard way, recorded so it is not relearned.** (1) `Object3D.copy()`
clones children by default, and since K5 the camera *has* children — the
per-frame `groundCam.copy(camera)` was grafting three more frond meshes onto
each pass camera every frame. Harmless for as long as the camera was childless,
which is why it survived F–J. (2) A dark sprite used as a colour `map` runs the
colour-space gauntlet (an unmanaged `CanvasTexture` is treated as linear data,
not sRGB) and a silhouette comes out as a pale card; `alphaMap` plus a material
colour states the intent and has no such failure mode. (3) The quality governor
drops the style tier within seconds on a software rasterizer, so the harness has
to *pin* it, not merely switch it on — the first style sweep photographed a
chain that had already dropped the tier while the boot log still said
`styles=true`. A screenshot cannot tell you a uniform was zero, so
`debugStyle()` exists and the harness asserts it.

**Rejected.** Real volumetrics for the god rays (still above what the governor
can shed; the radial-blur fake cannot honour depth and says so). Synchronised
fireflies — real ones synchronise, and a synchronised swarm is rhythm on the
ground stream (§2.1), so the physics is wrong on purpose. Ripple rings on kicks
(the pool's rings would counterfeit the figure's shockwave and devalue it,
§2.2). Making the near field bokeh at rest, which would need a real resting
aperture and contradicts F–J's "at rest, the frame is indistinguishable."

## D22 — Warmth is a second harmonic axis; four tracks, four casts (2026-07-27)

**The mode ladder was doing two jobs.** `brightnessAt` walks monotonically
upward across the set, so the zenith sits in ionian/lydian — the two *happiest*
modes in the system. The set therefore had no way to end anywhere but glad, and
"more ethereal than the canopy, and less happy" was not a setting the machine
could express. Brightness was answering both *how bright* and *how glad*, and
those are different questions.

**Decision: split them.** `warmthAt(t)` is authored per track alongside
brightness, blended across seams by the same smoothstep, and it decides how much
gladness the arrangement extracts from whatever mode brightness chose: the third
in the voicing (glad 6th / neutral 7th / third-less quartal), whether the chord
is in tune, how hard the backbeat leans, how often the pads re-voice. It has
**no knob** — unlike tension and brightness it is form, not performance, so it is
read straight from the timeline rather than mixed with a manual value.

    undergrowth   forest floor   canopy    zenith
    b  0.10→0.30   0.30→0.55    0.55→0.80  0.80→1.00   (unchanged)
    w  0.15        0.35         0.85       0.10

The zenith is the one place the axes move **against** each other — brightness
still climbing, warmth falling off a cliff. That is the move `scene_plan.md` §6
flagged as unexplored, and it is what makes the last track read as awe rather
than triumph: lydian, voiced quartal, in stretched tuning, with the floor
removed. The emotion to aim at is altitude sickness, not grief.

**And D12 finally lands.** Per-track `palette` and `tuning` objects on `TRACKS`
are the rest of the identity — break costume, hat character, bass kind, pad
width, plus two characteristic instruments and one spent-once gesture per track
(design and rationale: `docs/track_identities.md`). Generators read the palette;
their *shape* did not change. That is the whole discipline: variation by
re-casting, not re-coding (§7.3). One thread deliberately crosses all four —
**the migrating pluck**, a stream-ambiguous token (§7.2) that spends the set
walking from dry/gridded/drum-orbit to drowned/unmetered/ether-orbit, which is
the set's slowest-moving variable.

**Tuning is one number.** `tuning.stretch` is cents per octave from the root,
applied superlinearly: negative sags the stack (undergrowth), positive stretches
it (zenith), and `tuning.just` blends toward 5-limit intervals for the canopy —
**the only track in the set that is in tune**. Consonance is spent like every
other resource. The alternative (a per-phrase downward pitch drift) needs
modulation inside a held note, which the renderer cannot express.

**Found while building it: the AudioWorklets were never loaded.** `engine.js`
called `initAudioOnFirstClick()`, which registers a `mousedown` listener — but
`initEngine` is itself called *from* the overlay click, so the listener was
always installed one gesture too late and its promise never resolved. Nothing
noticed because nothing in the project had used a worklet-backed effect yet.
The D22 costumes use three (`crush`, `coarse`, `shape`), and they failed to
construct, loudly. Now `initEngine` awaits `initAudio()` directly, which is the
correct call from inside a user gesture anyway. Lesson recorded because it is a
whole *class* of failure the pattern tests cannot see: the pattern was perfect
and the sound was missing — hence `tools/cast_audit.mjs`, which walks every
track × section in a real browser and fails on any console error.

**Rejected.** A warmth knob on the perform rail (it is form; the rail is colour,
D17). Key movement to make the zenith strange — D13 stays deferred on purpose,
one variable at a time, and warmth turned out to be enough. superdough's
`detune` on the pads (it only reaches the supersaw's `freqspread` and is
silently ignored on a stock oscillator — the old `.detune(0.12)` on the pad was
doing nothing, so width is now explicit voice-splitting) and its `noise` control
on the breath voice (its `drywet` teardown disconnects an already-released
oscillator: one console error per note, so the air is its own layer).

## D23 — The groove was one bar, repeated (2026-07-27)

**The complaint:** the bass and the break sound the same for the whole set.
Measured against the compiled pattern, they did. Three constants sat underneath
D22's re-casting, and D22 could not see them because it varies *who plays*, not
*what is played*:

1. **The skeleton never moved.** `s('bd ~ ~ ~')` and `s('~ ~ sd ~')` were
   literal strings, identical across all four casts and all 68 phrases, with
   only `.gain()` varying.
2. **The bass talea was `euclid(k, 16, 2)`** — `rot` hardcoded, `k` per-track,
   never re-rolled. Three of the four tracks share `k = 5`, so E(5,16) — a
   near-isochronous dotted-quarter pulse — played for 51 of 68 phrases. The
   colour walk was `ci += 1 or 2`, unsigned, so every bass line in the set was a
   rising pentatonic run that wrapped: 51 distinct note sequences, one contour.
3. **The permuter barely permuted** — 4.1 of 16 slices displaced on average,
   always weak ones. `dissonance` returns a raw value spanning `[0.05, 0.278]`,
   but the band tested against it (`0.15 + w*0.45`, ±0.18) was written as though
   it spanned `[0, 1]`. The band was wider than the entire reachable range, so
   the first candidate always passed and generate-and-test selected nothing.

**Decision: vary the figures, keep the anchors.** §1.2's anchor rule is right —
beat 1 and beat 3 are the metric reference and the break's 0/4/8/12 stay pinned.
What was missing is that *nothing else* varied either.

- **Skeleton.** The anchor kick and snare are untouched. Extra kicks and ghost
  snares are drawn per phrase from a palette-weighted bag, with a four-bar
  `/4` mask deciding which bars of the phrase get them — otherwise the fix
  reproduces the bug one scale up. The extras deliberately **do not duck**: the
  sidechain is the coupling constant between the two media (§3.3) and the visual
  duck is on beat 1, so there stays one pump per bar in both worlds. Ghosts stay
  off the dub rail — the 3/16 feedback answers one transient per bar, not six.
- **Bass.** `k` breathes with tension (`kSpan` per track), the rotation is drawn
  per phrase, and the drop and the landing rotate the figure back onto the
  downbeat — the floor is restored *whole*. The walk is signed, leaps on the
  strong slices, and has tonic gravity.
- **Permuter.** `dissonance` is normalized against its real range so the band
  means what it looks like it means; σ must displace at least one **pickup**
  (the strong non-anchor slices, where a rearrangement is actually audible);
  the move probabilities carry a floor, because a band can only reject, never
  create movement the generator never proposed; and the search keeps its closest
  near-miss instead of falling back to the identity, so σ is never the untouched
  break. Result: ~5 slices displaced at rest, ~7 at the seam.

`test/groove.mjs` measures all three against the compiled pattern rather than
the source, and fails if the set collapses back to one bar repeated.

## D28 — The glyph is removed; the slot it filled is not (2026-07-27)

**Decision.** `figure.js` no longer draws the recurring glyph — the long-tailed
moth of proposal **B2**, a line-figure that appeared in each track's `peak`
section under a per-track costume. Removed: `GLYPH_COSTUME`, `mothWing`,
`mothBody`, the glyph group and material, and `updateGlyph`, along with its
call in `scene.js` and the `peak-glyph` shot in `tools/visual_check.mjs`. The
figure stream keeps B1 — kick shockwave rings and snare shard scatters — which
was always the part that carries rhythm.

**Why.** It looked bad. That is a sufficient reason and worth stating plainly:
the moth was authored as a couple of dozen hand-placed line segments, and a
literal creature outline drawn that way reads as clip-art rather than as a
motif, at every one of its four scales. No amount of costume tuning fixes a
silhouette that is wrong at the level of the drawing.

**What this does NOT overturn.** The argument for the slot still stands, and
`visualizer_theory.md` §5 makes it: the set's single melodic cell (`MOTIF` in
`generators.js`) wants a visual sibling, and three appearances under
transformation are what make a recurring form an institution rather than a
decoration. Removing the moth empties that slot; it does not close it. Anything
put there later should clear the bar the moth did not:

- it must read at 2.5× and at 9× scale, which argues against a literal outline
  and for something whose *rule* scales — a lattice, a contour, a growth;
- it must be figure by edge and not by rhythm (the ground/figure split, §2.1),
  which is why the moth's slow drift was right even though the moth was not;
- it should be generated by the same machinery it is a sibling to, rather than
  hand-authored beside it. The music's motif is data run through a transform
  bag; a hand-placed point list was never really the same kind of object.

**Rejected.** Keeping it until a replacement exists. A weak recurring form is
worse than none: repetition is what legitimizes, so repeating something that
looks like clip-art legitimizes clip-art. Better to run without the slot filled
and notice its absence honestly.

**Revisit when** there is a candidate that satisfies the three constraints
above — most likely alongside the mischief layer (§8), which is the other
place where a recurring visual character would earn its keep.

## D29 — The groove bag is part of the cast (2026-07-28)

**Decision.** Which placements a track draws from is now a property of the
track, named in `TRACKS[i].palette` beside the density that scales it:

    kick:  { extras: 0.82, gain: 0.6,  bag: 'pushed' }
    snare: { ghosts: 0.85, gain: 0.36, bag: 'busy'   }

`KICK_BAGS` / `SNARE_BAGS` in `generators.js` are the library — `shipped`,
`sparse`, `busy`, `pushed`, `laidback` — and a track names one. Unnamed means
`shipped`, so nothing changes for a track that has not been auditioned.

**Why this and not one better bag.** D23 gave every cast the same two bags, so
the only per-track variation in the floor was *how often* it fired, never
*where the weight sat*. That is the one axis D22 had not yet been extended to,
and it is the audible one: `pushed` and `laidback` are the same number of hits
in the same bar and feel like different music. Making it data is the same move
D12/D22 made for instrumentation — orchestration downgraded to authoring.

**How the values were chosen: by ear, which is the point.** TODO §5's complaint
was that these numbers came from idiom and had never been heard. `lab.html`
boots the real engine with no scene (~3 s vs ~2 min under software rendering)
and swaps the bags at runtime through `GROOVE_BAGS`, so candidates are judged
in the actual arrangement. Two verdicts so far, and both agree with the cast
they landed in:

- **canopy → `pushed` + `busy`.** The glad, in-tune, fullest track. Leaning
  forward and chattering under the backbeat is what that track already does
  harmonically (warmth 0.85, just intonation, the affirmed backbeat).
- **zenith → `sparse` + `sparse`.** "Letting everything breathe." Agrees with
  every other decision in that cast: the bass is absent 45% of phrases, the
  hats are already gone to high-passed hiss, the break is thinned and reversed.

**Still open.** `undergrowth` and `forest floor` have not been auditioned and
remain on `shipped`. Two of twenty pairings per track have been heard; this is
a first pass, not a settled floor.

**Rejected.** Applying one winning bag globally. The first verdict was written
"nice on canopy" and the second contradicts it outright — sparse is the
opposite of busy — which is the whole argument for per-track casts restated
from the listening side rather than the theory side.

**Revisit when** the remaining two tracks are auditioned, or if a bag turns out
to want to change *within* a track — sections already scale density via
`SKEL_LIFT`, and a per-section bag would be the natural next axis if the peak
and the intro turn out to want different feels.

## D30 — The biomes move to the tropics, and the mix joins the cast (2026-07-28)

**Decision.** Four of the twelve D26 recordings are replaced by Neotropical
sources, and how loud/how often a biome speaks becomes a per-track field,
`TRACKS[i].ambienceMix = { bed, accent, threshold }`.

| layer | was | is |
|---|---|---|
| `ambbirds` (canopy bed) | morning birds, Indiana bike trail | rainforest atmosphere, Reserva Nacional Tambopata, Peru |
| `ambcalls` (canopy accent) | blackbird, Vallée des Traouiero, Brittany | two screaming pihas, Tauary, Amazonas |
| `ambinsects` (undergrowth bed) | night insects, Los Gatos, California | rainforest by night, El Tintal, Petén |
| `ambfrogs` (undergrowth accent) | night frogs, Sithonia, Greece | night amazon frogs, Yarinacocha, Ucayali |

Every replacement is the same kind of source under the same rule — archive.org
*radio aporee ::: maps*, Public Domain Mark 1.0 — so D26's licensing discipline
is untouched. The retired entries move to `alternates` in
`tools/amb_sources.json` with a `retired` note, because the manifest is the
attribution record and deleting a source erases the credit for audio that
shipped.

**Why.** Two complaints, one cause. *"The birds in the canopy sound like
seagulls"* — the canopy was a coastal Breton blackbird over an Indiana dawn
chorus, which is a temperate woodland, and a temperate woodland heard through a
jungle is a gull-haunted one. *"Add more frogs and jungle insect noise in the
undergrowth"* — the frogs were Mediterranean marsh frogs (one chirping species,
no depth) and the insects a Californian garden. The piece is called ethereal
*jungle*; four of its twelve places had never been to one. Nothing about the
engine was wrong: D26 built the right machine and pointed it at the nearest
available recordings.

**The mix had to move with them.** Swapping the file is not enough when the
layer is inaudible. Accent layers ride a presence walk and rest below a fixed
0.35 threshold — on the shipped seed the screaming piha, the one recording
anybody would name as "a jungle bird", cleared it in **6 of the canopy's 17
phrases** and at a gain averaging 0.012. So `ambienceMix` joins `warmth`,
`tuning`, `palette` and the groove bag as cast data:

    undergrowth: { bed: 1.3, accent: 1.5, threshold: 0.15 }   // the crowded floor
    canopy:      {           accent: 1.25, threshold: 0.25 }  // let the piha speak

At 0.15 the undergrowth's frogs are in 16 of that track's 17 phrases and the
rustle in 15, instead of the odd episode, and half again as loud — which is
what "more frogs" means when the frogs already existed. The other two biomes
name no mix and are bit-identical.

**Rejected.** A global threshold drop (the forest floor's thunder and the
zenith's shimmer are *meant* to be rare — an accent that is always there is a
bed, and D16's whole point was that the two are different roles). Promoting the
frogs to `ambience[0]` (there is one bed per biome and it is what the seam
crossfades; two beds would need the crossfade to become a mix). Re-cutting the
loops to hunt for frog-dense windows (the window scorer already optimises for
stationarity and head/tail match; asking it for *content* is asking it for the
thing only ears can judge). Keeping the Kaunas dry-leaves `ambrustle` was
deliberate, not an oversight — it is a leaf texture rather than a place, it
reads correctly under the floor, and no PDM tropical-foliage recording in the
collection beat it.

**Unverified by ear, and knowingly so.** Every source here was chosen from its
title, description, license and a spectral profile (the piha window has a 12 dB
crest — isolated calls over a quiet bed, exactly what an accent layer wants; the
Petén window has a 1.2 dB crest — a stationary wall of night insects, exactly
what a bed wants). That is evidence about *shape*, not about whether it sounds
good. Same standing as D29's groove bags before `lab.html`: a candidate, not a
verdict.

**Revisit when** they have been heard. If the piha reads as a car alarm at the
climax, `ambcalls` has a second Amazonian candidate already vetted and sitting
in `alternates` (the Crested Oropendola's metallic gurgle, Yarinacocha).

## D31 — The toucan toms: one bird, tuned into a drum kit (2026-07-28)

**Decision.** The canopy gains a percussion voice made from a toucan.
`tools/ingest_toms.py` cuts the three loudest isolated croaks out of a single
public-domain recording (Hato Corozal, Casanare, Colombia — PDM 1.0, in the same
manifest as the beds) and ships them as `public/samples/tom/toucan{1,2,3}.wav`.
`tomLayer` in `generators.js` plays them at four `speed` ratios —
`[0.34, 0.26, 0.2, 0.15]`, which put the croak's ~1450 Hz fundamental at roughly
490 / 375 / 290 / 220 Hz — so one bird becomes a high-tom-to-floor-tom kit. The
cast entry is `TRACKS[2].palette.toms`.

**Why the pitch shift lives in the engine.** Rendering four pre-tuned toms would
freeze the tuning into the samples; as a `speed` array it stays a knob, and
re-voicing the kit costs an edit to `bus.js` rather than a re-run of the ingest.
It also makes the kit *one* instrument in the data, which is what it is.

**Ratios, not scale degrees.** The toms do not transpose with the harmony.
Every other tuned layer in the set reads `mode` and `tuning`; this one refuses
to, because a tom kit is tuned once and then played — the moment it follows the
chord it stops being percussion and becomes a fifth melodic voice, and the
canopy already has four.

**What "process them" turned into.** Per voice, and derived from the
transposition rather than authored beside it: the lower the tom the longer its
`decay` (0.16 s → 0.42 s) and the darker its filter (3200 Hz → 1760 Hz), because
that is what a bigger drum does; `shape` 0.25 across the kit, since a bird has
no drumhead and the drive is what supplies one; pan spread high-left to
floor-right. Each strike also draws one of the three croaks at random, so a
repeated hit is never the identical file — the machine-gun tell.

**Placement.** 16th positions, never on an anchor (0/4/8/12), from a six-figure
bag; successive strikes descend through the kit and wrap, which is what makes a
row of toms read as a phrase instead of a repeated drum; and a descending run
takes the phrase's last bar half the time. Density scales with `SKEL_LIFT`, the
same per-section appetite the kick extras use, and `presence` 0.75 means the
toms rest often. They are percussion, so they obey the skeleton's rules: absent
from the ether-only sections, gone at the late seam, gated by the pre-drop
dropout.

**A superdough trap worth recording.** The first version set `release`, and
every tom came out the same short tick no matter how it was tuned. In
`sampler.mjs` a sample's duration falls back to the *hap's* duration whenever
`release`, `clip` or `loop` is set — a 16th at 168 BPM is 89 ms — and only
otherwise runs for the sample. Leaving `release` unset and shaping the tail with
`decay` into `sustain(0)` is what lets the transposition actually be heard.

**Rejected.** A synthesized tom (trivial, and it would have been the fifth
sine-with-a-pitch-envelope in a piece whose whole argument is that its material
comes from its world — D25's corpus shrine and the zenith's granular ghost are
the same move). Cutting the croak *bursts* whole (a toucan croaks in bursts of
3–7 pulses ~60 ms apart; the burst is a rattle, and the tom is one pulse — which
is why `ingest_toms.py` has a `gap` of 60 ms rather than the 250 ms that
"one call" would suggest). Ogg for the one-shots: they are transients, they are
100 kB the lot, and every codec puts its own priming delay in front of the
attack.

**Unverified by ear.** Same standing as D30 — the pitch and envelope numbers are
chosen from the measured fundamental, not from listening.

**Revisit when** they have been heard. The obvious knobs are `speeds` (the kit's
tuning), `presence`/`run` (how often), and whether the toms want to appear in
the forest floor too — the argument against is that the canopy is the one track
whose cast is *bright*, and a kit made of a bird belongs there.

> **Reversed the same day by D32.** They were heard, and the verdict was
> "horrendous". The material and the pipeline survive; the tom kit does not.

## D32 — The toms are reversed: the toucan is a squawk (2026-07-28)

**Decision.** D31's tom kit is removed. `tomLayer`, `TOM_SPEEDS`, `TOM_FIGURES`
and `TOM_RUN` are gone from `generators.js`, and `TRACKS[2].palette.toms` becomes
`palette.squawk`. The same three croaks now play as **one bird call every two
phrases** — near their own pitch (`speeds` 0.86–1.18), off the beat, drowned
(`room` 0.5, `roomsize` 8), on the **ether orbit** rather than the drums.

**Why D31 failed.** Transposing a 1450 Hz croak down to 220 Hz is a 6.6×
stretch, and `speed` on an `AudioBufferSourceNode` is varispeed — the formants
travel with the pitch. What arrives is not a drum with a bird's timbre; it is a
bird played at a sixth of its speed, which is a growl. Everything D31 measured
about it was true — the fundamentals really do land in tom register, the decays
really do scale with the transposition — and none of it was the question. That
is the whole lesson of the entry: the numbers were right and the sound was
wrong, and only ears can tell you which one you are looking at.

**Why a squawk works where the kit did not.** Near speed 1 the sample is the
recording, so it reads as an animal instead of as a sampler. And the role fits
what the material already is: the canopy is where the *biome* is bird song
(D30's Tambopata bed, the screaming pihas), so a foreground call is the same
world one step closer — the piece is a jungle, and a jungle punctuates.

**What that changes about its rules.** The toms were percussion and obeyed the
skeleton: gone from the ether-only sections, gated by the pre-drop dropout,
scaled by `SKEL_LIFT`. The squawk is weather (§3.4), so it does the opposite —
it keeps calling through the intro and the breakdown, where a bird obviously
would, and only leaves at the late seam with the rest of the cast.

**Determinism detail.** The call draws from its own hashed rng
(`makeRng(strHash('squawk:<phrase>:<seed>'))`), like `SEAM_FILLS`, not from the
arrangement's stream. Two reasons, one structural and one audible: five draws
off the shared stream would shift every seeded decision made after it, and
drawing at a fixed point in a per-phrase stream turned out to correlate across
phrases — the first version put four of eight calls on the same 16th.

**Rejected.** Keeping both (a kit *and* a call from the same bird is one idea
twice, and the kit was the bad half). Pitch-shifting properly, with formant
correction — a real fix for the growl, but it needs a phase vocoder in a project
whose renderer is superdough, and the destination was never worth the machinery.
Triggering the call on a probability instead of an interval: "at intervals" was
the request, and a steady period with a drawn position inside it is more legible
than a Poisson bird.

**Also in this pass:** the undergrowth's `ambienceMix` comes down from
`{ bed: 1.3, accent: 1.5, threshold: 0.15 }` to
`{ bed: 1.15, accent: 1.2, threshold: 0.25 }` — halfway back to the default on
every field, on the same verdict ("too loud again, somewhere in the middle").
The frogs still clear the threshold in 16 of 17 phrases against 13 at the
default, so D30's argument survives its own levels being wrong.

---

*Add new entries above this line, newest last. If a decision is reversed,
don't delete it — append the reversal as a new entry referencing the old.*
