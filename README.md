# ethereal jungle

Starter scaffold for the procedural ethereal jungle set: **Strudel core** (pattern
engine) + **superdough** (WebAudio renderer) + **three.js/WebGPU** (visualizer), one
process, one clock, one shared control bus.

## Run

```sh
npm install
npm run dev        # open the printed localhost URL, click once to wake audio
```

Chrome/Chromium/Arc recommended (WebGPU on Metal). Safari 26+ also works; the
renderer falls back to WebGL2 automatically anywhere WebGPU is missing.

## Architecture (the part that matters)

```
            ┌────────────── src/bus.js ──────────────┐
            │  T(t) · brightness(t) · drift(t) · w   │   ← ui.js (knobs) and
            │  set timeline · seams · coupling       │     midi.js (CCs) write here
            │  seeds · event stream (look-ahead)     │
            └──────┬──────────────────┬──────────────┘
                   ▼                  ▼
        music/ = M(S, seed_m)   visuals/ = V(S, seed_v)     — never V(audio)
        generators.js → engine.js     scene.js + biomes.js
        (Strudel patterns             (one-world jungle: biome per family,
         → superdough orbits,          camera altitude = brightness walk,
         kick ducks the far orbits)    figure flashes, ducked ether)
```

- `bus.js` — the authored set timeline: tracks with tension breakpoints (one
  shared golden-ratio shape, rescaled per track), a brightness walk that drives
  **both** the mode ladder and the camera's altitude, a **warmth** walk that
  decides how much gladness the arrangement takes from that mode (D22), seam
  windows, 1/f drift, seedable RNGs, event pub/sub. It also holds each track's
  **cast** as data — `palette` and `tuning` (D12/D22) — because orchestration is
  authoring, not machinery. Everything is **a function of time**, so both media
  can sample the future.
- `music/generators.js` — the machine room: break permuter with wildness knob +
  Barlow-weighted generate-and-test, anchor skeleton (kick carries the audio
  sidechain via `duckorbit`), Euclidean hats, isorhythmic bass (talea × color),
  tendency-free pads, contour-then-quantize lead over one set-wide motif
  (80/20 transform bag), and the seam operator (intensified exit → drums die →
  snare-roll countdown → clean drop). Pure functions: params in, pattern out.
  Every layer wears the current track's costume; the shapes never change, only
  who plays them — Reese and log-tap in the undergrowth, breath voice and dub
  rail on the forest floor, FM bells and a vowel choir at the canopy, glass bowl
  and a granular ghost of the set at the zenith.
- `music/scales.js` — the two harmonic axes: the mode ladder (brightness) and
  the voicing/tuning ladder (warmth). Where "bright but not glad" is actually
  implemented — the third is present, added-6th glad, or absent entirely — plus
  per-track temperament: the stack sags in the roots, **locks in just intonation
  at the canopy** (the only in-tune track), and stretches at the zenith.
- `music/engine.js` — Strudel scheduler + superdough boot; wraps the audio output
  so **every event is mirrored to the bus with its audio-clock deadline before it
  sounds** (the visualizer's clairvoyance); re-permutes each 4-bar phrase.
- `visuals/biomes.js` + `visuals/scene.js` — the one-world solution: local-rule
  roots, growth-vine floor, particle-ether canopy, self-similar sky, mist and
  graded air, stacked in altitude; track transitions are camera traversals
  (brightness sampled 4 s ahead) with a per-band lateral orbit that keeps the
  motion signature continuous. Figure flashes spent only on kicks/snares; the
  kick ducks the ether. Plus the living layer: flocking fireflies, phyllotaxis
  leaves, rain and a caustic pool, a signalling mycelial net, and a near field
  of dust and fronds at the lens (the parallax gradient the frame lacked).
- `visuals/weather.js` — the shared atmosphere, pure and tested
  (`test/weather.mjs`): one analytic wind field that **every** biome samples at
  its own position, so a gust crosses the floor, tips the shafts, shears the
  mist and bends the ether as one event moving through a place; a per-track
  weather axis (mist/rain/wind/storm) crossfaded across seams; and lightning on
  a seeded, time-addressable slot schedule. Weather is never rhythm — that is
  what makes it legal on the ground stream.
- `visuals/shrine.js` — the corpus family: a screen in the undergrowth playing
  back the world's own last bar, chopped by `permuteBreak` — the break's σ, the
  break's anchors, the break's wildness, on frames instead of drum slices.
- `visuals/look.js` — the renderer seam, pure and tested (`test/look.mjs`): bus
  params + frame state → every post-chain uniform (ground-only depth of field,
  bloom, anamorphic streak, god rays, shimmer, the perform-rail twins, artifact
  operators) plus the camera's orbit, the per-band colour grade, each seam
  flavor's staging, and `styleAt` — which decides what *kind* of picture the
  frame is. `perform.js` is its audio-side sibling.
- `perform.js` + `music/masterchain.js` + `knob.js` — the perform rail
  (D17/D19/D20/D21): the DJ half of the panel. Independent lpf/hpf rotary
  dials (the two controls a hand rides), echo, crush, space, three
  EQ kills, a bar-locked gater, drive, and a drum roll. `perform.js` is pure
  mappings (so the whole rail is testable); `masterchain.js` owns the master
  insert spliced between superdough's destination gain and the speakers.
  Everything but `roll` acts live, without a rebuild — a mixer gesture's
  timing is the hand's.
- `midi.js` — WebMIDI → `bus.params`, same single writable surface as the UI.

Design rationale for all of the above: `docs/design_decisions.md`. How scenes
are authored and transitioned: `docs/scene_plan.md`. What each track is *for*,
emotionally and instrumentally: `docs/track_identities.md` (D22 — the arc runs
dark and close → wet and walking → high and joyful → bright, vast and unhappy).
What got built in the
"make it fancy" passes, with acceptance criteria: `docs/visuals_expansion_proposal.md`
(tiers A–E), `docs/visuals_fancy_proposal.md` (F–J) and
`docs/visuals_pizzaz_proposal.md` (K–M: the shared atmosphere, the living
layer, and the style tiers — its *What is NOT done* section is the open list).

**Three rules the visuals will not break**, in case a change seems to need it:
visuals read the bus and never the audio; the ground stream never articulates
rhythm (which is why the fireflies refuse to synchronise and the pool's ripples
never land on a kick); and **a style is spent, not sprinkled** — ink, halftone
and the kaleidoscopic fold are each bound to one place in the set that already
means something, so that seeing one is information.

**Engine discipline (the escape hatch):** generators emit events with abstract
params; superdough is just the current renderer. If the ether outgrows WebAudio,
route the same patterns to SuperDirt/scsynth via `@strudel/osc` without touching
composition code. Keep renderer-specific tricks inside `engine.js` only.

## Licensing / samples — read before publishing

- Dependencies: Strudel is **AGPL-3.0** — this repo is marked AGPL accordingly.
  three.js is MIT.
- `engine.js` currently loads the **Dirt-Samples** pack from GitHub *at runtime*
  for development convenience. That pack has unclear provenance — **do not vendor
  or redistribute it**. Before publishing recordings or bundling samples, swap to
  CC0 sources (Sonic Pi's bundled samples are all CC0; Freesound filtered to CC0;
  the TidalCycles *Clean-Samples* packs) via a local `public/samples/strudel.json`
  map. The original Amen recording is copyrighted until 2067 — ship re-performed
  breaks only.
- **Biome ambience** (`public/samples/amb/*.ogg`) is safe to ship: twelve
  32-bar field recordings, every one from archive.org's *radio aporee ::: maps*
  collection under CC0 or the **Public Domain Mark 1.0**. `tools/amb_sources.json`
  is both the build input and the attribution record — it names the archive.org
  item, recordist and place for each layer. Rebuild them with
  `python3 tools/ingest_amb.py` (needs `ffmpeg`); it re-downloads the sources
  into a gitignored cache, so the repo carries only the finished loops.
  `amb/impact.wav` is still synthesized (`tools/gen_samples.py`, CC0 by
  construction) because it is a tuned one-shot, not a recording.

## Tests

```sh
npm test           # seams, OSC, the perform rail, look + weather (no browser)
npm run smoke      # headless browser boot: audio + visuals + bus events
node tools/visual_check.mjs                     # screenshot sweep, WebGL2
node tools/visual_check.mjs --backend=webgpu    # …and the other backend
```

The screenshot sweep captures every biome band, the glyph, the climax, the
corpus shrine, one shot per perform-rail knob, both seam flavors, the weather
(rain, a held lightning strike), each new nature biome in isolation, and each
style tier, into `shots/<backend>-<name>.png`. Run it on **both** backends
before trusting a visual change — that is how the WebGPU point-size bug got
away from us. Note what the WebGPU pass actually proves: on this headless
chromium the WebGPU device is lost a few seconds in (it reproduces on a
baseline from before any of the visual work, so it is the environment), the
PNGs come out black, and the run *does* print errors. It certifies that the
chain compiles and the world boots on that backend, and nothing more —
appearance and frame rate there need a real browser window.

Escape hatches while looking: `?altitude=0.6`, `?biome=canopy`, `?shrine=0`,
`?dof=0`, `?style=0`, `?weather={"rain":1}`, and `window.jungle.visuals` in the
console — `setAltitude(a, snap)`, `setLateral(x)` (pins the sway + band orbit so
a shot repeats), `isolate(biome)`, `shrine(true|false|null)`,
`setStyles(true|false|null)`, `setWeather({mist,rain,wind,storm}|null)`,
`strike(0..1|null)`, and the readouts `debugStyle()` / `debugNearField()` /
`debugShrine()`. `null` hands a tier back to the quality governor.

**The pins matter.** The governor sheds the style tier within seconds on a
software rasterizer, so anything photographing ink/halftone/the fold must call
`setStyles(true)` first and check `debugStyle().stylesOn` after — a screenshot
cannot tell you a uniform was zero, and an inert style shot looks a lot like a
subtle one.

## Next steps

(1–4 of the original list — audio sidechain, tension timeline + seams, the
lead, WebMIDI — are done, and so are bar-exact seams (D9) and MIDI learn +
OSC-over-WebSocket (D10, `?osc=ws://host:port`); see
`docs/design_decisions.md`.)

1. The mischief layer (theory §8): master-bus jokes. The master bus itself is
   now an addressable target (D19's insert chain), and the visual twins are
   free too — the perform rail's twins (D24) prove the mechanism and `look.js`
   is where the events would land. What's left is authoring the jokes and
   deciding what fires them.
2. Per-point shaders / TSL compute for roots and the canopy ether
   (`docs/scene_plan.md` roadmap 1) — the CPU advection is behind a stable
   interface, so this is a swap.
3. Per-track instrumentation palette (D12) and key movement across tracks (D13),
   both still open on the music side.
