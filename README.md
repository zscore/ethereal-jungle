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
  **both** the mode ladder and the camera's altitude, seam windows, 1/f drift,
  seedable RNGs, event pub/sub. Everything is **a function of time**, so both
  media can sample the future.
- `music/generators.js` — the machine room: break permuter with wildness knob +
  Barlow-weighted generate-and-test, anchor skeleton (kick carries the audio
  sidechain via `duckorbit`), Euclidean hats, isorhythmic bass (talea × color),
  tendency-free pads, contour-then-quantize lead over one set-wide motif
  (80/20 transform bag), and the seam operator (intensified exit → drums die →
  snare-roll countdown → clean drop). Pure functions: params in, pattern out.
- `music/engine.js` — Strudel scheduler + superdough boot; wraps the audio output
  so **every event is mirrored to the bus with its audio-clock deadline before it
  sounds** (the visualizer's clairvoyance); re-permutes each 4-bar phrase.
- `visuals/biomes.js` + `visuals/scene.js` — the one-world solution: local-rule
  roots, growth-vine floor, particle-ether canopy, self-similar sky, stacked in
  altitude; track transitions are camera traversals (brightness sampled 4 s
  ahead). Figure flashes spent only on kicks/snares; the kick ducks the ether.
- `midi.js` — WebMIDI → `bus.params`, same single writable surface as the UI.

Design rationale for all of the above: `docs/design_decisions.md`. How scenes
are authored and transitioned: `docs/scene_plan.md`.

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

## Tests

```sh
npm test           # pattern-level seam verification (no browser, no audio)
npm run smoke      # headless browser boot: audio + visuals + bus events
```

## Next steps

(1–4 of the original list — audio sidechain, tension timeline + seams, the
lead, WebMIDI — are done, and so are bar-exact seams (D9); see
`docs/design_decisions.md`.)

1. Per-point shaders / TSL compute for roots + canopy; bloom with per-stream
   post-processing (`docs/scene_plan.md` roadmap 1–2).
2. The corpus shrine + artifact operators wired to `w` (roadmap 4–5).
3. The mischief layer (theory §8): master-bus jokes — needs the master bus as
   an addressable target.
4. open-stage-control via WebSocket alongside WebMIDI; MIDI learn.
