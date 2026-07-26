/**
 * midi.js — WebMIDI → bus.params. The performance rack (music doc §9.1).
 *
 * A controller does exactly what ui.js does: write params, nothing else.
 * The bus is the single writable surface. Gestures register immediately;
 * they take effect at the next rebuild — launch quantization for free (§9.2):
 * the performer supplies intent, the phrase clock supplies timing.
 *
 * The CC map starts from the default table below, is remappable at runtime
 * via MIDI learn (the `cc` buttons in the panel, or jungle.midi.learn('key')
 * from the console), and persists in localStorage. Unmapped CCs are logged
 * once so you can discover what your controller sends.
 */
import { bus } from './bus.js';
import { PERFORM_LIVE_KEYS } from './perform.js';

const DEFAULT_CC_MAP = {
  1:  'wildness',         // mod wheel — violence of the surface
  71: 'tensionManual',    // "resonance" — the manual tension hand
  74: 'brightnessManual', // "cutoff" — the harmonic weather
  91: 'coupling',         // "reverb send" — how much the two worlds touch
  93: 'tensionMix',       // authored curve ↔ manual hand
  95: 'brightnessMix',
  16: 'lpf',              // perform rail (D17/D20) — general-purpose CCs 16–19
  17: 'echo',
  18: 'crush',
  19: 'space',
  26: 'hpf',              // the lpf's twin, added with D20
  20: 'eqLow',            // master insert + roll (D19) — CCs 20–25
  21: 'eqMid',
  22: 'eqHigh',
  23: 'gate',
  24: 'drive',
  25: 'roll',
};

const STORE_KEY = 'jungle.midi.ccmap';

function loadMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && typeof saved === 'object') {
      // D20 split the bipolar `filter` into lpf/hpf. A controller already
      // learned to the old key would otherwise write a param nobody reads —
      // silently dead, and confusing to diagnose. Point it at the lowpass.
      for (const cc of Object.keys(saved)) if (saved[cc] === 'filter') saved[cc] = 'lpf';
      return saved;
    }
  } catch { /* absent or corrupt — fall through to the default */ }
  return { ...DEFAULT_CC_MAP };
}

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

  const ccMap = loadMap();
  const persist = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ccMap)); } catch { /* private mode */ }
  };

  let learnState = null; // { key, resolve, timer } while a learn is armed

  const seenUnmapped = new Set();
  let changeTimer = null;
  const scheduleChange = () => { // coalesce knob twists into one rebuild per 250 ms
    if (changeTimer) return;
    changeTimer = setTimeout(() => { changeTimer = null; onChange?.(); }, 250);
  };

  const handle = (msg) => {
    const [status, cc, value] = msg.data;
    if ((status & 0xf0) !== 0xb0) return; // CC messages only
    if (learnState) {
      const { key, resolve, timer } = learnState;
      clearTimeout(timer);
      learnState = null;
      for (const c of Object.keys(ccMap)) if (ccMap[c] === key) delete ccMap[c]; // one CC per param
      ccMap[cc] = key;
      persist();
      console.info(`[midi] learned CC ${cc} → ${key}`);
      resolve(cc);
      // fall through: the learning twist also applies, which feels right
    }
    const key = ccMap[cc];
    if (!key) {
      if (!seenUnmapped.has(cc)) {
        seenUnmapped.add(cc);
        console.info(`[midi] unmapped CC ${cc} — hit a cc button in the panel to learn it`);
      }
      return;
    }
    bus.params[key] = value / 127;
    // Live perform keys (D17/D19) need no rebuild: the engine reads them at
    // the output tap, the filter follower and the master chain. Everything
    // else — including `roll`, which is pattern surgery — is launch-quantized.
    if (!PERFORM_LIVE_KEYS.has(key)) scheduleChange();
  };

  const attach = () => {
    for (const input of access.inputs.values()) input.onmidimessage = handle;
  };
  attach();
  access.onstatechange = attach; // hot-plug

  const names = [...access.inputs.values()].map((i) => i.name);
  console.info('[midi] listening on:', names.length ? names.join(', ') : '(no devices yet)');

  return {
    access,
    /** CC currently bound to a param key, or null. */
    ccFor(key) {
      const hit = Object.entries(ccMap).find(([, k]) => k === key);
      return hit ? Number(hit[0]) : null;
    },
    /** Arm learn mode: resolves with the next CC number, or null on 10 s timeout. */
    learn(key) {
      return new Promise((resolve) => {
        if (learnState) { clearTimeout(learnState.timer); learnState.resolve(null); }
        const timer = setTimeout(() => { learnState = null; resolve(null); }, 10000);
        learnState = { key, resolve, timer };
        console.info(`[midi] learning ${key} — move a controller knob…`);
      });
    },
  };
}
