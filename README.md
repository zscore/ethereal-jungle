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
            ┌──────────── src/bus.js ────────────┐
            │  T(t) · drift(t) · w · brightness  │   ← ui.js (knobs) writes here;
            │  seeds · event stream (look-ahead) │     MIDI/OSC later writes here too
            └──────┬──────────────────┬──────────┘
                   ▼                  ▼
        music/ = M(S, seed_m)   visuals/ = V(S, seed_v)     — never V(audio)
        generators.js → engine.js     scene.js
        (Strudel patterns             (three.js: ether ground stream,
         → superdough orbits)          figure flashes, ducked bloom)
```

- `bus.js` — tension curve (golden-ratio climax, authored, **a function of time**
  so both media can sample the future), 1/f drift, seedable RNGs, event pub/sub.
- `music/generators.js` — the machine room: break permuter with wildness knob +
  Barlow-weighted generate-and-test, anchor skeleton, Euclidean hats, isorhythmic
  bass (talea × color), tendency-free pad stack. Pure functions: params in, pattern out.
- `music/engine.js` — Strudel scheduler + superdough boot; wraps the audio output
  so **every event is mirrored to the bus with its audio-clock deadline before it
  sounds** (the visualizer's clairvoyance); re-permutes the break each 8-bar phrase.
- `visuals/scene.js` — two-stream stub: additive particle ether (palette/light
  altitude ← mode brightness, fog ← tension, sampled 2 s ahead) and hard-edged
  figure flashes spent only on kicks/snares, with the kick ducking the ether.

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

## Next steps

1. Sidechain in the *audio* (superdough `duck`/orbit ducking) to match the visual duck.
2. Authored tension breakpoints per track + seam operator between tracks (§5/§6).
3. Contour-then-quantize lead with the 80/20 motif bag.
4. MIDI knobs (WebMIDI → `bus.params`) / open-stage-control via WebSocket.
5. Replace figure cubes with a real family (corpus chops or growth systems);
   move the ether to TSL compute particles.
