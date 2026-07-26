/**
 * main.js — wiring. One process, one clock, two renderers:
 * the pattern engine renders the bus for the ear, the scene renders it for the eye.
 */
import { bus } from './bus.js';
import { initEngine, rebuild, toggle } from './music/engine.js';
import { initScene } from './visuals/scene.js';
import { initUI } from './ui.js';
import { initMidi } from './midi.js';
import { initOsc } from './osc.js';

window.jungle = { bus }; // console access for poking the running system

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
  });
  // non-fatal if WebMIDI is unavailable; learn buttons appear once it is
  initMidi({ onChange: () => rebuild() }).then((midi) => { if (midi) ui.enableLearn(midi); });
  initOsc({ onChange: () => rebuild() }); // silent no-op without ?osc=ws://…
}, { once: false });
