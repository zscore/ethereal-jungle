/**
 * ui.js — the knobs. Writes to bus.params only; the engine reads the bus.
 * (The WebMIDI layer in midi.js does exactly the same thing: write params,
 * nothing else. The bus is the single writable surface.)
 */
import { bus, TRACKS, BAR_SECONDS, sectionSpans, sectionAt, trackStartBar } from './bus.js';
import { lpfCutoff, hpfCutoff } from './perform.js';
import { makeKnob } from './knob.js';

export function initUI({ onChange, onToggle, onReroll, onSeek }) {
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

  // Perform rail (D17): writes params only, NO onChange — a rebuild would add
  // nothing. The engine's output tap and filter follower read the bus live.
  const bindPerform = (id, key) => {
    $(id).addEventListener('input', (e) => { bus.params[key] = parseFloat(e.target.value); });
  };
  for (const id of ['lpf', 'hpf', 'echo', 'crush', 'space', 'eqLow', 'eqMid', 'eqHigh', 'gate', 'drive']) {
    bindPerform(id, id);
  }
  // …and the visuals' own live knob (bus.js VISUAL_LIVE_KEYS), on the same
  // no-rebuild path and for a stronger version of the same reason: no pattern
  // reads it at all, so a rebuild would recompile the whole set to thin the rain.
  bindPerform('rainDensity', 'rainDensity');
  // roll is the exception (D19): pattern surgery, so it rides the rebuild.
  bind('roll', 'roll');

  // double-click a perform slider to snap it home, DJ-mixer style
  for (const [id, home] of [['echo', 0], ['crush', 0], ['space', 0],
    ['eqLow', 1], ['eqMid', 1], ['eqHigh', 1], ['gate', 0], ['drive', 0]]) {
    $(id).addEventListener('dblclick', (e) => {
      e.target.value = home;
      bus.params[id] = home;
    });
  }

  // The two filters are rotary dials (D21): they are the controls a hand rides
  // continuously, and a knob reads its position at a glance. The <input> under
  // each one stays the source of truth, so the bindings above are unaffected.
  // The Hz readout makes the sweep legible — the whole point of D21's remap.
  const showHz = (hz) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`);
  makeKnob($('lpf'), { onDraw: (v) => { $('lpfHz').textContent = v >= 1 ? 'open' : `${showHz(lpfCutoff(v))} Hz`; } });
  makeKnob($('hpf'), { onDraw: (v) => { $('hpfHz').textContent = v <= 0 ? 'open' : `${showHz(hpfCutoff(v))} Hz`; } });

  $('reroll').addEventListener('click', () => {
    bus.params.seed = Math.floor(Math.random() * 1e6);
    $('seed').value = bus.params.seed;
    onReroll?.();
  });

  $('toggle').addEventListener('click', () => {
    const playing = onToggle?.();
    $('toggle').textContent = playing ? 'stop' : 'start';
  });

  // transport (D15): skip to any track, or to a section of the CURRENT track.
  // These write no params — they move the playhead, and seeking while stopped
  // starts playback (onSeek returns the playing state, like onToggle).
  const seek = (bar) => {
    if (onSeek?.(bar)) $('toggle').textContent = 'stop';
  };
  TRACKS.forEach((tr, i) => {
    const btn = document.createElement('button');
    btn.textContent = tr.name;
    btn.title = `skip to the top of ${tr.name}`;
    btn.addEventListener('click', () => seek(trackStartBar(i)));
    $('tracks').appendChild(btn);
  });
  for (const { name } of sectionSpans(TRACKS[0].bars)) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.title = `skip to the ${name} of the current track`;
    btn.addEventListener('click', () => {
      const { track, index } = bus.trackAt(bus.now());
      const sp = sectionSpans(track.bars).find((s) => s.name === name);
      if (sp) seek(trackStartBar(index) + sp.startBar);
    });
    $('sections').appendChild(btn);
  }

  // MIDI learn: once WebMIDI is up (it arrives async), grow a `cc` button per
  // slider — click, twist a hardware knob, done. Buttons show the live binding.
  const LEARNABLE = [
    ['tensionMix', 'tensionMix'], ['tension', 'tensionManual'],
    ['brightnessMix', 'brightnessMix'], ['brightness', 'brightnessManual'],
    ['wildness', 'wildness'], ['coupling', 'coupling'], ['rainDensity', 'rainDensity'],
    ['lpf', 'lpf'], ['hpf', 'hpf'], ['echo', 'echo'], ['crush', 'crush'], ['space', 'space'],
    ['eqLow', 'eqLow'], ['eqMid', 'eqMid'], ['eqHigh', 'eqHigh'],
    ['gate', 'gate'], ['drive', 'drive'], ['roll', 'roll'],
  ];
  function enableLearn(midi) {
    for (const [id, key] of LEARNABLE) {
      const btn = document.createElement('button');
      btn.className = 'learn';
      const show = () => {
        const cc = midi.ccFor(key);
        btn.textContent = cc == null ? 'cc?' : `cc${cc}`;
      };
      show();
      btn.title = `MIDI learn: click, then move a controller knob`;
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        btn.textContent = '…';
        await midi.learn(key);
        show();
      });
      $(id).parentElement.appendChild(btn);
    }
  }

  // readout: current bus state, for trust in what the knobs are doing
  const readout = $('readout');
  setInterval(() => {
    const t = bus.now();
    const { track, phase, tLocal } = bus.trackAt(t);
    const seam = bus.seamAt(t);
    const sec = sectionAt(Math.floor(tLocal / BAR_SECONDS), track.bars);
    readout.textContent =
      `track    ${track.name} ${(phase * 100).toFixed(0)}%` +
      (seam.active ? `  → ${seam.to.name}` : '') + `\n` +
      `section  ${sec.name} ${sec.phraseInSection + 1}/${sec.sectionPhrases}\n` +
      `t        ${t.toFixed(1)}s\n` +
      `T(t)     ${bus.tensionAt(t).toFixed(2)}\n` +
      `bright   ${bus.brightnessAt(t).toFixed(2)}\n` +
      `w(T)     ${bus.wildnessAt(t).toFixed(2)}\n` +
      `drift    ${bus.drift(t).toFixed(2)}`;
  }, 250);

  return { enableLearn };
}
