# Stack Decision + Starter Scaffold Notes
 
**Decision (2026-07-26):** the project builds on **Strudel core + superdough + three.js/WebGPU**, one Electron/browser process, one clock — chosen over the deep-dive report's primary recommendation (Python/Supriya + scsynth) for its frictionless realization of the shared-bus principle. Full tradeoff analysis lives in "framework deep dive — tools & stack recommendation."
 
**The one discipline that keeps the escape hatch open:** generators emit events with abstract params; superdough is merely the current renderer. No superdough-specific calls inside composition logic (all renderer contact confined to `engine.js`). If the ether outgrows WebAudio's reverb/granular ceiling, the same patterns re-route to SuperDirt/scsynth via `@strudel/osc` untouched.
 
**Starter scaffold** (delivered as `ethereal-jungle-starter.zip`, verified building and event-flowing in headless Chromium):
 
- `src/bus.js` — the shared bus: authored tension curve T(t) as a *function of time* (golden-ratio climax, 192 s loop), Voss–McCartney 1/f drift, mulberry32 seeded RNGs, event pub/sub. Music and visuals are both functions of S; never of each other.
- `src/music/scales.js` — brightness-ordered mode ladder (locrian→lydian) over one fixed root (D), subtonic-only darks; pad voicing = degrees {1,3,5,7,9}.
- `src/music/generators.js` — break permuter (anchors 0/4/8/12 inviolate, neighbor swaps + one segment op at probability w, generate-and-test against a Barlow-weighted dissonance band), skeleton with tension-scaled anchor strength, Euclidean hats E(k(T),16), isorhythmic bass (talea E(5,16) × pentatonic walk, half-time layer), ether pads (slow attack, detuned, drowned, orbit-separated).
- `src/music/engine.js` — Strudel scheduler at 168 BPM; audio-output wrapper mirrors every hap to the bus with its audio-clock deadline *before it sounds* (visualizer clairvoyance); break re-permuted every 8-bar phrase.
- `src/visuals/scene.js` — two-stream stub: additive particle ether (palette temperature + light altitude ← mode brightness, fog ← T sampled 2 s ahead), figure flashes spent only on bd/sd (synch-point economy), kick ducks the ether and shoves the camera.
- Samples: local synthesized CC0-by-construction kit (`tools/gen_samples.py` — bd/sd/hh + one-bar 16-slice break at 168); Dirt-Samples loads as optional dev-only extra, non-fatal on failure, flagged never-redistribute. Repo licensed AGPL-3.0 (Strudel obligation).
 
**Open items:** audio-side sidechain (superdough duck params) to mirror the visual duck; contour-then-quantize lead + 80/20 motif bag; seam operator; WebMIDI/open-stage-control → bus.params; upgrade figure/ground families per the visualizer taxonomy; move ether to TSL compute particles.