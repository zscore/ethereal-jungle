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

## D12 — Per-track instrumentation palette (planned, not yet implemented) (2026-07-26)

**Decision (planned).** Give each track an identity by varying *sounds* over
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

## D17 — The perform rail: DJ color FX at the renderer seam (2026-07-26)

*(Numbering: D16 — hat breathing + ambience beds — exists in a working tree
that hasn't merged into this branch yet; this entry takes D17 to leave it
room. If D16 lands under another number, note it here.)*

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

## D19 — The master insert: EQ kills, gater, drive, and a roll (2026-07-26)

*(Numbering: this branch's log jumps D17 → D19 because D16 and D18 live on
the main line and arrive at merge. D18 is the seam-variants entry, not a gap.)*

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

---

*Add new entries above this line, newest last. If a decision is reversed,
don't delete it — append the reversal as a new entry referencing the old.*
