# Procedural Ethereal Jungle — Tools & Framework Deep Dive
 
*A concrete companion to "Ethereal Jungle as a Formal System" and "The Visualizer as a Formal System." All facts checked against the projects' current state as of July 2026. Target machine: 2021 MacBook Pro, Apple M1 Pro, 16GB RAM, macOS. Constraints: fully open source, everything scriptable and version-controllable, autonomous engine steered by high-level parameters, no Haskell, no Lisp.*
 
---
 
## 0. The short version
 
Build the **brain in Python** and rent the **body from SuperCollider's server**:
 
- **Audio engine:** `scsynth` 3.14 (SuperCollider's synthesis server, run headless as a bare process — no sclang, no IDE) plus the **sc3-plugins** pack for JPverb/Greyhole reverbs and extra granular UGens.
- **Control layer:** **Supriya** (MIT-licensed Python client, release 26.3, actively maintained) — patterns, tempo-aware clocks, buses, groups, effect chains, and SynthDef compilation, all in plain Python. Your entire theory doc — tension curve, wildness knob, Barlow indispensability, generate-and-test — becomes ordinary Python code with numpy available.
- **Knobs:** any class-compliant MIDI controller via `mido`, or **open-stage-control** (GPL, active) for OSC faders on a tablet — the parameters land in the same Python process that owns `T(t)`.
- **Visualizer (later phase):** **three.js with the WebGPU renderer** in Electron, subscribed to the engine's OSC/WebSocket bus — with **Godot 4.6** as the strong native alternative. Sync via "Link for time, OSC for meaning."
 
Every piece is open source, everything is text in a git repo, and the whole stack idles at a few percent of one M1 core. The rest of this document is the evidence, the runners-up, and the honest caveats.
 
---
 
## 1. The machine is not the constraint
 
Worth saying first: an M1 Pro with 16GB is *massively* over-provisioned for this. A community benchmark put scsynth at roughly **20,000 simultaneous sine oscillators** on one M1 Pro core before saturation. A full jungle arrangement — a chopped break, skeleton drums, granular ambience, isorhythmic bass, pads, three or four lush reverbs, sidechain compression, analysis taps — is a few hundred to low thousands of unit generators, i.e. single-digit percent of one performance core. Sample buffers for breaks are megabytes; 16GB is effectively infinite here. Even the heaviest visualizer option (WebGPU compute with a million particles plus reaction-diffusion at full resolution) sits comfortably inside the M1 Pro's GPU at 1080p–1440p. Framework choice is therefore purely about **ergonomics, licensing, and architecture** — never about performance rescue.
 
## 2. The rubric
 
Your theory doc's §7 already wrote the evaluation checklist, so I used it directly: (1) patterns as first-class, transformable values; (2) continuous control signals sampled into patterns (for `T(t)` and drift); (3) seedable randomness; (4) per-layer effect routing (the stream vector demands independent reverb/dynamics per stream); (5) one phase-locked scheduler. The visualizer doc's §6 adds the mirror list for the eye, of which the two decisive clauses are **external control signals as first-class inputs** (never FFT estimation) and **an event stream with look-ahead** (foreshadowing requires reading the future). I added three project-level criteria: open-source license health, 2026 maintenance reality (several famous projects turn out to be quieter than their reputations), and honest fit with a *code-first, autonomous* workflow — which is where several otherwise-great tools fall down.
 
---
 
## 3. The audio candidates, in order of verdict
 
### 3.1 SuperCollider server + Supriya (Python) — the recommendation
 
SuperCollider is really two programs: **scsynth**, a synthesis server that speaks nothing but OSC, and **sclang**, the odd little Smalltalk-descendant language that usually drives it. The architectural fact that decides this whole deep dive: *the server neither knows nor cares what client controls it*. Every synth, bus, group, and buffer operation is a documented OSC message. Driving scsynth from Python isn't a hack — it's the sanctioned architecture, with the wire protocol in the official Server Command Reference.
 
That would historically leave you hand-rolling OSC, because only sclang could compile SynthDefs (the DSP graph definitions). **Supriya** closes that gap: it compiles SynthDefs natively in Python, and layers on the things your theory doc actually needs — `EventPattern`/`MonoEventPattern` (the Pbind lineage), `BusPattern` and `FxPattern` (a pattern routed into a private bus with an effect chain attached — your per-stream reverb requirement as a one-liner), tempo- and meter-aware clocks, and **non-realtime rendering** through the same API, so the engine that plays live can also batch-render stems faster than realtime. It's MIT-licensed, at release 26.3b0 (March 2026), Python 3.10–3.14, and under active development.
 
Timing deserves a paragraph, because "Python is too slow/jittery for music" is the obvious objection and it's wrong here. The client schedules events slightly ahead and sends **timestamped OSC bundles**; scsynth executes them sample-accurately on the audio clock. Python's GC pauses and the GIL never touch the audio path — the same latency-scheduling trick sclang itself uses. Your pattern code has a ~100–200ms deadline per event, not a 5ms one.
 
Against the checklist: patterns as values ✓ (and where Supriya's pattern library ends, you write plain Python generators — arguably *better* than a DSL for your generate-and-test dissonance targeting, since you get numpy, dataclasses, and unit tests). Continuous signals ✓ (sample `T(t)` in the clock callback; or run drift as a server-side LFO on a control bus). Seedable ✓ (`random.Random(seed)` per generator — addressable variation for free). Per-layer routing ✓ (buses/groups/order-of-execution, plus core `Compander` for the sidechain: feed the drum bus into the pads' compressor control input — the coupling constant of §3.3 is a stock idiom here). One clock ✓. And the analysis path for the future visualizer is built in: `Amplitude`, `Onsets`, FFT descriptors on the server, streamed to any subscribed client via `SendReply` — though per your visualizer doc, the *engine's* event bus matters more than the audio analysis, and Python owns that completely.
 
Sound-wise this is the strongest option for the aesthetic: `Warp1`, `TGrains`, `GrainBuf`, and `PitchShift` cover timestretch-ghost and granular-shimmer territory in core; **sc3-plugins** (3.13.0, universal binary, works fine under bare scsynth) adds **JPverb** and **Greyhole** — the standard answers to "lush ethereal reverb in SC" and exactly the sound of §3.4.
 
Honest caveats. Supriya is effectively a one-maintainer project versioned as CalVer betas — the API can drift between releases, so pin your version. SC core's release cadence is slow (3.14.1, Nov 2024), which in a 25-year-old project reads as stability rather than decay, but it's worth knowing. Some sc3-plugins UGens may need small hand-written Python binding stubs (minutes of boilerplate each). And scsynth is GPL-3 while Supriya is MIT — fine for an open-source project, and the process boundary keeps your own code's licensing simple.
 
### 3.2 The all-JavaScript stack: Strudel core + superdough — the serious runner-up
 
Strudel is the official TidalCycles port to JavaScript, and it is the most active project in this whole survey (v1.2.x through 2025–26; note the whole Tidal ecosystem migrated from GitHub to **Codeberg** in 2025 — the GitHub mirrors are stale). Crucially for you, it's a **monorepo of npm libraries**, not just the browser REPL: `@strudel/core` is a dependency-light pattern engine — patterns as pure functions from time spans to events, the real Tidal semantics, no Haskell anywhere — and it runs headless in Node or embedded in your own app. Audio comes from **superdough** (WebAudio: sample slicing, supersaw, 24dB ladder filter, convolution reverb with controllable IRs, and — added in 1.2.3 — sidechain ducking), or the pattern layer can emit OSC or MIDI instead.
 
The genuinely compelling argument for this stack arrives in the *next* phase: your visualizer doc notes the browser "has a thumb on the scale," because if music and visuals share one process, the shared bus and the one-clock requirement dissolve — pattern engine, audio engine, and three.js visualizer in a single Electron app, one AudioContext clock, look-ahead scheduling shared natively, zero transport. That is the lowest-friction realization of the shared-bus principle that exists.
 
Why it's the runner-up anyway: WebAudio is an adequate but ceiling-limited engine — convolution reverb is decent, but there is no JPverb-class algorithmic lushness, granular work means custom AudioWorklets (where the browser's 128-sample quantum and JS GC live), and overall fidelity sits below scsynth. Strudel is **AGPL-3.0**, the strongest copyleft (fine for your open-source intent, but it's a commitment). And the Tidal mini-notation is optimized for terse live-coding, whereas your architecture — generate-and-test against dissonance bands, Barlow weights, long-running autonomous state — wants a general-purpose language with a real standard library wrapped *around* the pattern engine, which tilts back toward Python. Middle path worth knowing: any OSC-speaking client can target **SuperDirt** (alive, GPL, commits June 2026), so a JS or Python brain with SC-grade sound is also constructible — at the cost of adopting SuperDirt's event vocabulary rather than owning your synth graph.
 
### 3.3 SignalFlow + isobar — the all-Python dark horse
 
Daniel Jones (ideoforms) maintains a matched pair: **isobar** (MIT, v0.2.1, Aug 2025, self-described mature) — a Python pattern/timeline library with Euclidean rhythms, Markov chains, L-systems, and outputs to MIDI/OSC/callables — and **SignalFlow** (MIT via Python, v0.5.0, beta) — a C++ DSP engine with a first-class Python API whose node list reads like it was written for this project: `SegmentedGranulator` (onset-based break slicing), `Granulator`, `Stutter`, comb/allpass networks, a full FFT/phase-vocoder chain, `FFTConvolve` reverb. Jones built these for autonomous generative installations — *Variable 4* ran for years on weather data — which is precisely your "autonomous engine + knobs" shape, and his architecture (pattern timeline → synthesis graph → OSC out) is worth imitating regardless of what you build on.
 
Why it's third rather than first: both are single-maintainer projects with small communities; SignalFlow is explicitly beta; timing runs on isobar's Python-side clock rather than a server's sample-accurate scheduler; and the algorithmic-reverb cupboard is thinner than SC's (convolution is the flagship). It would *work*, and it's the simplest possible install (`pip install` and done). But Supriya gives you the same Python ergonomics with a 25-year-old battle-tested engine underneath.
 
### 3.4 Csound — maximum DSP maturity, idiosyncratic on-ramp
 
Csound (LGPL, ~40 years old, Csound 7 still in beta as of 2025 — use stable 6.18) embeds beautifully: the maintained **libcsound** Python binding (v0.13.1, May 2026) lets Python own the performance loop and inject score events in real time, and Csound's "instrument instance at time T with p-fields" event model maps one-to-one onto pattern-generated events. Its granular/timestretch opcodes — `partikkel`, `mincer`, `sndwarp`, `flooper2` — are the deepest toolbox in this survey, and its scheduler is sample-accurate. The cost is learning the Csound orchestra language, an idiosyncratic 1980s-lineage syntax, for the entire DSP layer — a second language for the project with none of sclang's pattern heritage to show for it. A respectable choice; not the best one here.
 
### 3.5 The rest, quickly
 
**Pure Data / plugdata** (BSD / GPL-app; Pd 0.56 in 2025, plugdata 0.9.3 in 2026) is healthy and permissively licensed, but it's a patch-first environment: `.pd` files version-control mechanically while diffing as noise, and expressing your generate-and-test logic in boxes-and-wires is genuine pain. Viable only demoted to a dumb OSC-controlled DSP rack — and scsynth is simply a better dumb DSP rack. **Sonic Pi** (MIT, v4.6.0, June 2024, quiet since) is a wonderful instrument but the wrong foundation: Ruby DSL, GUI-tethered, external control requires scraping a session token from a logfile, and headless operation is unsupported — and since it drives scsynth internally anyway, going direct removes the wrapper. **Rust** (cpal + fundsp, both active; glicol dormant since ~2024) offers the best performance ceiling nobody needs and weeks-to-months of infrastructure before the first breakbeat — the engine would become the product. **Faust** (GPL compiler, but generated code is yours to license) is not a competitor but an *ingredient*: a DSP-graph language that compiles to C++/wasm, ideal later if you ever want a bespoke shimmer-reverb as a compiled plugin; it sequences nothing. **Tone.js** (MIT, stable but slow-moving) is a fine WebAudio framework subsumed by the Strudel option. **Elementary Audio** (MIT since v2, v4.0 Dec 2024, one quiet maintainer) is elegant JS-driven native DSP but you'd rebuild all the sampler machinery. **Vortex**, the official Python Tidal port, describes itself as "free as in free puppies… not for serious work" — experimental as of a Dec 2025 commit; watch it, don't build on it.
 
---
 
## 4. The visualizer side (surveyed now, built later)
 
Your visualizer doc's checklist disqualifies most of the famous tools before performance is even discussed: **TouchDesigner** and **vvvv gamma** are closed-source (vvvv is Windows-only besides), **KodeLife** closed, **VEDA** dead with Atom. Among the open, code-first survivors, two candidates clear the full six-point checklist:
 
**three.js with the WebGPU renderer (in Electron) — the front-runner.** MIT, extremely active, and by 2026 the WebGPU renderer is production-ready on Metal via Chrome/Electron's Dawn, with **TSL** (its JS shader node language) compiling to WGSL and giving you real **compute passes** — GPU particle/flow fields and reaction-diffusion as first-class citizens, seedable via uniforms. Multi-scene rendering to render-targets composited by your own passes gives exactly "independent render layers with per-layer post" (the pmndrs `postprocessing` library adds 20+ canned effects on the WebGL path; the node-based post system covers WebGPU). Raymarched fractals, instanced L-system geometry, and a continuous navigable one-world scene with an authored camera path are home turf. Weak spots: frame-accurate *video chopping* (the corpus family) is the platform's soft point — no HAP codec, `requestVideoFrameCallback` mitigates; OSC needs the Node side of Electron (UDP), or plain WebSockets. **Hydra** (AGPL, `hydra-synth` on npm, embeddable with `makeGlobal: false` and a manual render loop) deserves a special mention not as the visualizer but as a *component*: a four-buffer feedback video-synth rendered to an offscreen canvas and used as a texture — essentially your artifact-operator family as a library.
 
**Godot 4.6 — the native alternative.** MIT, very active, and since 4.4 it has a **native Metal backend** on Apple Silicon with full compute shader support. SubViewports are literally "independent render layers"; GDScript is Python-ish, all text, hot-reloadable; camera paths, 3D world-building, and particle systems are built in. Its gaps are exactly where the browser is strong: no maintained OSC plugin (gdosc is dead — you'd roll ~an afternoon of `PacketPeerUDP` code or use its first-class WebSockets), no Ableton Link binding, and stock video playback is Theora-only. Choose it if the one-world 3D jungle becomes the dominant ambition and you want an engine-grade scene editor; choose three.js if the shared-process argument or shader-centric workflow wins.
 
**openFrameworks** (MIT, 0.12.1, slow-cadence) remains capable but is capped at deprecated OpenGL 4.1 on macOS — **no compute shaders**, ping-pong FBOs only — which is a strategic dead end for the compute-heavy families. **Processing/p5.js** hit performance and architecture ceilings below this ambition (p5's WebGPU is experimental as of 2026). **cables.gl** is now fully MIT including a standalone Electron editor — impressive, but node-based patches serialized as JSON fail the code-first test. **Bevy** (Rust) is capable and churning pre-1.0; same verdict as Rust audio.
 
**Wiring, concretely.** The shared-bus principle needs transport and a clock, and the practical recipe from the sync research is: continuous curves (`T(t)`, drift, mode-brightness) broadcast at 30–60Hz as plain OSC and slewed on receipt; discrete events sent as **timetagged bundles at least a beat ahead** (your clairvoyance requirement — the visualizer queues them and fires on its own clock); and tempo/phase shared either via a periodic beat-heartbeat message or **Ableton Link** (GPLv2+, v4.0 May 2026 — `aalink` for asyncio Python, native addons for Node, `LinkClock` inside SuperCollider itself). The slogan that fell out of the research: **Link for time, OSC for meaning** — Link carries only tempo/beat/phase, so semantic state (sections, seams, wildness) always rides the OSC bus. On localhost, UDP OSC transit is tens of microseconds; jitter lives in event loops, which look-ahead timestamps neutralize entirely. And if you ever choose the all-JS stack, all of this plumbing evaporates into one process — that is the one architectural argument that could legitimately flip the audio recommendation, so the decision is really "best audio engine + good plumbing" (Python/SC) versus "adequate audio engine + no plumbing" (JS). For an *audio-first* project, I weight the engine.
 
---
 
## 5. Supporting cast
 
**Knobs.** `mido` (MIT, 1.3.3) + `python-rtmidi` (MIT, arm64 wheels) read any class-compliant controller — a used Korg nanoKONTROL2 maps eight faders to eight bus parameters in an afternoon. The open-hardware route is the **16n faderbank** (fully open design, 16 faders, MIDI + I2C) or an **OpenDeck**-based build. For touchscreen control, **open-stage-control** (GPL-3, v1.30.4 July 2026 — development moved to Framagit) serves OSC faders to any browser/tablet and speaks directly to your engine with no MIDI layer at all. TouchOSC and the resurrected Lemur are both proprietary — open-stage-control is the libre answer.
 
**Samples — the one legal landmine.** The Amen break is *not* public domain: the recording is federally protected until **2067** (Music Modernization Act), and the myth rests on non-enforcement, not license. An open-source repo should never ship the Winstons recording (nor Think, Apache, Funky Drummer). The clean path is well-paved: **Sonic Pi's bundled samples are all CC0** (including its re-created amen-style loop) and can be vendored wholesale; **Freesound** filtered to CC0 supplies re-performed breaks; **Clean-Samples** (the TidalCycles community's provenance-verified successor to the murky Dirt-Samples pack — which you should *not* redistribute) provides both material and a metadata format worth copying. A "bring-your-own-break" loader for unshippable classics keeps the repo clean while keeping the culture available locally.
 
**Recording.** scsynth records itself sample-accurately (`DiskOut` streaming to disk), and Supriya's NRT mode renders the same score faster than realtime for stems — no loopback needed for fidelity. **BlackHole** (GPL-3, v0.6.1, Apple Silicon native) is the loopback driver for the day you route audio into OBS next to the visualizer.
 
**Prior art worth mining.** Nick Collins' **BBCut2** — the canonical algorithmic breakbeat-cutting library — is unmaintained as code but his papers ("Algorithmic Composition Methods for Breakbeat Science" especially) are a direct scholarly companion to your §1, and its cut-procedure taxonomy is worth reimplementing in Python. **Livecut** is the open-source VST descendant of those ideas. And ideoforms' installation architecture (isobar timelines driving long-running autonomous systems) is the closest existing shape to what you're building even on a Supriya foundation.
 
---
 
## 6. Proposed architecture
 
```
                        ┌────────────────────────────────────────┐
                        │        Python engine (the will)        │
   MIDI (mido) ────────▶│  T(t) · drift · w · mode · seeds       │
   OSC (open-stage-  ──▶│  generators: break-permuter, skeleton, │
        control)        │  isorhythm bass, pads, contour lead    │
                        │  scheduler: Supriya clock (look-ahead) │
                        └──────────┬──────────────┬──────────────┘
                 timestamped OSC   │              │   OSC bus: curves @ 30Hz,
                 (sample-accurate) │              │   events ≥1 beat ahead
                                   ▼              ▼
                        ┌────────────────┐   ┌──────────────────────┐
                        │ scsynth 3.14   │   │  visualizer process  │
                        │ + sc3-plugins  │   │  (three.js/WebGPU in │
                        │ buses: drums │ │   │   Electron — later)  │
                        │ ether │ bass   │   │  Link for time,      │
                        │ sidechain ✕    │   │  OSC for meaning     │
                        └────────────────┘   └──────────────────────┘
```
 
One process owns the signals; two renderers — one for the ear, one for the eye — subscribe. That is your §4 and the visualizer doc's §1, drawn as boxes.
 
**Suggested first milestones:** (1) `pip install supriya`, boot scsynth, one SynthDef, one `EventPattern` playing a CC0 break slice — an evening. (2) Break-permuter with wildness knob and Barlow-weighted dissonance scoring against anchor skeleton — the first *real* test of the theory. (3) Two-stream mix: drum bus dry/narrow, ether bus wide/wet through JPverb, `Compander` sidechain between them. (4) `T(t)` as an authored curve modulating everything; MIDI knob overrides. (5) Only then, the OSC bus and the first three.js sketch.
 
---
 
## 7. Version & license reference
 
| Component | Version (date) | License | Role |
|---|---|---|---|
| SuperCollider / scsynth | 3.14.1 (Nov 2024) | GPL-3 | synthesis server |
| sc3-plugins | 3.13.0 (Feb 2024) | GPL | JPverb, Greyhole, granular |
| Supriya | 26.3b0 (Mar 2026) | MIT | Python control layer |
| mido / python-rtmidi | 1.3.3 / 1.5.8 | MIT | MIDI knobs |
| open-stage-control | 1.30.4 (Jul 2026) | GPL-3 | OSC touch faders |
| Ableton Link (+ aalink) | 4.0 (May 2026) / 0.2.1 | GPLv2+ / GPL-3 | cross-process tempo |
| three.js | r18x (2026, monthly) | MIT | visualizer front-runner |
| Godot | 4.6.3 (2026) | MIT | visualizer alternative |
| hydra-synth | current | AGPL-3 | embeddable glitch/feedback layer |
| Strudel (`@strudel/core`) | 1.2.6 (2026, Codeberg) | AGPL-3 | runner-up stack / pattern reference |
| SignalFlow / isobar | 0.5.0 / 0.2.1 | MIT | dark-horse all-Python stack |
| Csound + libcsound | 6.18 / 0.13.1 (May 2026) | LGPL | maturity alternative |
| BlackHole | 0.6.1 (Feb 2025) | GPL-3 | macOS loopback |
| Sonic Pi samples | — | CC0 | legally clean break sources |
 
*Notable licensing note for the open-sourcing plan: the Python/SC stack lets your own code be MIT/BSD if you want (GPL components run as separate processes or standard dependencies); the Strudel path commits the project to AGPL.*