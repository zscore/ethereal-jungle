/**
 * main.js — wiring. One process, one clock, two renderers:
 * the pattern engine renders the bus for the ear, the scene renders it for the eye.
 */
import { bus, TRACKS } from './bus.js';
import { initEngine, rebuild, toggle, seekToBar, getMasterChain, getAudioTap } from './music/engine.js';
import { initScene } from './visuals/scene.js';
import { initUI } from './ui.js';
import { initMidi } from './midi.js';
import { initOsc } from './osc.js';

// Console access for poking the running system. `getAudioTap` is how
// tools/spectrum_probe.mjs records the finished mix, and TRACKS + rebuild are
// what let it A/B a cast member out of the mix to find which one is ringing
// (D33) — the audio equivalent of soloing a channel.
window.jungle = { bus, TRACKS, getMasterChain, getAudioTap, seekToBar, rebuild };

const overlay = document.getElementById('overlay');
const canvas = document.getElementById('scene');

// Visuals boot immediately (no user-gesture requirement for GPU)...
initScene(canvas).catch((err) => console.error('[visuals]', err));

// ...audio waits for the click, per browser autoplay policy.
overlay.addEventListener('click', async () => {
  overlay.style.display = 'none';
  try {
    await initEngine();
  } catch (err) {
    console.error('[engine]', err);
    overlay.style.display = 'flex';
    overlay.querySelector('p').textContent = `engine failed: ${err.message} (see console)`;
    return;
  }
  const ui = initUI({
    onChange: () => rebuild(),
    onReroll: () => rebuild(),
    onToggle: () => toggle(),
    onSeek: (bar) => seekToBar(bar),
  });
  // non-fatal if WebMIDI is unavailable; learn buttons appear once it is
  initMidi({ onChange: () => rebuild() }).then((midi) => { if (midi) ui.enableLearn(midi); });
  initOsc({ onChange: () => rebuild() }); // silent no-op without ?osc=ws://…
}, { once: false });
