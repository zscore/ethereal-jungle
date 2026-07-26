/**
 * ui.js — the knobs. Writes to bus.params only; the engine reads the bus.
 * (The WebMIDI layer in midi.js does exactly the same thing: write params,
 * nothing else. The bus is the single writable surface.)
 */
import { bus } from './bus.js';

export function initUI({ onChange, onToggle, onReroll }) {
  const $ = (id) => document.getElementById(id);

  const bind = (id, key, parse = parseFloat) => {
    $(id).addEventListener('input', (e) => {
      bus.params[key] = parse(e.target.value);
      onChange?.();
    });
  };

  bind('tensionMix', 'tensionMix');
  bind('tension', 'tensionManual');
  bind('brightnessMix', 'brightnessMix');
  bind('brightness', 'brightnessManual');
  bind('wildness', 'wildness');
  bind('coupling', 'coupling');
  bind('seed', 'seed', (v) => parseInt(v, 10) || 0);

  $('reroll').addEventListener('click', () => {
    bus.params.seed = Math.floor(Math.random() * 1e6);
    $('seed').value = bus.params.seed;
    onReroll?.();
  });

  $('toggle').addEventListener('click', () => {
    const playing = onToggle?.();
    $('toggle').textContent = playing ? 'stop' : 'start';
  });

  // readout: current bus state, for trust in what the knobs are doing
  const readout = $('readout');
  setInterval(() => {
    const t = bus.now();
    const { track, phase } = bus.trackAt(t);
    const seam = bus.seamAt(t);
    readout.textContent =
      `track    ${track.name} ${(phase * 100).toFixed(0)}%` +
      (seam.active ? `  → ${seam.to.name}` : '') + `\n` +
      `t        ${t.toFixed(1)}s\n` +
      `T(t)     ${bus.tensionAt(t).toFixed(2)}\n` +
      `bright   ${bus.brightnessAt(t).toFixed(2)}\n` +
      `w(T)     ${bus.wildnessAt(t).toFixed(2)}\n` +
      `drift    ${bus.drift(t).toFixed(2)}`;
  }, 250);
}
