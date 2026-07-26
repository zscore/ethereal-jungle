/**
 * midi.js — WebMIDI → bus.params. The performance rack (music doc §9.1).
 *
 * A controller does exactly what ui.js does: write params, nothing else.
 * The bus is the single writable surface. Gestures register immediately;
 * they take effect at the next rebuild — launch quantization for free (§9.2):
 * the performer supplies intent, the phrase clock supplies timing.
 *
 * Default CC map (remap here; unmapped CCs are logged once so you can
 * discover what your controller sends):
 */
import { bus } from './bus.js';

const CC_MAP = {
  1:  'wildness',         // mod wheel — violence of the surface
  71: 'tensionManual',    // "resonance" — the manual tension hand
  74: 'brightnessManual', // "cutoff" — the harmonic weather
  91: 'coupling',         // "reverb send" — how much the two worlds touch
  93: 'tensionMix',       // authored curve ↔ manual hand
  95: 'brightnessMix',
};

export async function initMidi({ onChange } = {}) {
  if (!navigator.requestMIDIAccess) {
    console.info('[midi] WebMIDI unavailable in this browser');
    return null;
  }
  let access;
  try {
    access = await navigator.requestMIDIAccess();
  } catch (err) {
    console.info('[midi] access denied or failed:', err.message);
    return null;
  }

  const seenUnmapped = new Set();
  let changeTimer = null;
  const scheduleChange = () => { // coalesce knob twists into one rebuild per 250 ms
    if (changeTimer) return;
    changeTimer = setTimeout(() => { changeTimer = null; onChange?.(); }, 250);
  };

  const handle = (msg) => {
    const [status, cc, value] = msg.data;
    if ((status & 0xf0) !== 0xb0) return; // CC messages only
    const key = CC_MAP[cc];
    if (!key) {
      if (!seenUnmapped.has(cc)) {
        seenUnmapped.add(cc);
        console.info(`[midi] unmapped CC ${cc} — add it to CC_MAP in src/midi.js`);
      }
      return;
    }
    bus.params[key] = value / 127;
    scheduleChange();
  };

  const attach = () => {
    for (const input of access.inputs.values()) input.onmidimessage = handle;
  };
  attach();
  access.onstatechange = attach; // hot-plug

  const names = [...access.inputs.values()].map((i) => i.name);
  console.info('[midi] listening on:', names.length ? names.join(', ') : '(no devices yet)');
  return access;
}
