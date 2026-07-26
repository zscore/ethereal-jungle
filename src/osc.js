/**
 * osc.js — OSC-over-WebSocket → bus.params (music doc §9.1, D7's principle:
 * a performer writes signals, nothing else). This is ui.js/midi.js with a
 * socket: open-stage-control (or anything speaking JSON over a WebSocket)
 * writes the same single surface, coalesced into the same rebuild cadence.
 *
 * Configure the server with `?osc=ws://host:port` in the URL (persisted) or
 * localStorage 'jungle.osc.url'. Accepted message shapes, both JSON text:
 *
 *   { "address": "/jungle/wildness", "args": [0.7] }       — OSC-style; args
 *     entries may also be {type:'f', value:0.7} objects (open-stage-control)
 *   { "param": "wildness", "value": 0.7 }                  — plain form
 *
 * The last path segment names the param; `tension` and `brightness` alias the
 * manual knobs. Values clamp to 0..1 (seed: non-negative integer).
 */
import { bus } from './bus.js';
import { PERFORM_KEYS, PERFORM_LIVE_KEYS } from './perform.js';

const ALIASES = {
  tension: 'tensionManual', brightness: 'brightnessManual',
  low: 'eqLow', mid: 'eqMid', high: 'eqHigh', // /jungle/low reads better on a fader strip
};
const WRITABLE = new Set([
  'tensionMix', 'tensionManual', 'brightnessMix', 'brightnessManual', 'wildness', 'coupling', 'seed',
  ...PERFORM_KEYS, // the perform rail: filter/echo/crush/space (D17), eq*/gate/drive/roll (D19)
]);

/**
 * Apply one decoded message to a params object. Pure — returns the param key
 * written, or null if the message named no writable param / carried no number.
 */
export function applyOscMessage(params, data) {
  if (!data || typeof data !== 'object') return null;
  let name = null, value = null;
  if (typeof data.address === 'string') {
    name = data.address.split('/').filter(Boolean).pop();
    const a = Array.isArray(data.args) ? data.args[0] : data.args;
    value = a !== null && typeof a === 'object' ? a.value : a;
  } else if (typeof data.param === 'string') {
    name = data.param;
    value = data.value;
  }
  const key = ALIASES[name] ?? name;
  if (!key || !WRITABLE.has(key) || typeof value !== 'number' || !Number.isFinite(value)) return null;
  params[key] = key === 'seed' ? Math.max(0, Math.round(value)) : Math.min(1, Math.max(0, value));
  return key;
}

export function initOsc({ onChange, url } = {}) {
  const fromQuery = new URLSearchParams(location.search).get('osc');
  if (fromQuery) {
    try { localStorage.setItem('jungle.osc.url', fromQuery); } catch { /* private mode */ }
  }
  let stored = null;
  try { stored = localStorage.getItem('jungle.osc.url'); } catch { /* private mode */ }
  url = url ?? fromQuery ?? stored;
  if (!url) {
    console.info('[osc] no server configured — add ?osc=ws://host:port to connect open-stage-control');
    return null;
  }

  let changeTimer = null;
  const scheduleChange = () => { // same 250 ms coalescing as midi.js
    if (changeTimer) return;
    changeTimer = setTimeout(() => { changeTimer = null; onChange?.(); }, 250);
  };

  let socket = null;
  let closed = false;
  let attempts = 0;

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempts = 0;
      console.info(`[osc] connected to ${url}`);
    };
    socket.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      // open-stage-control can batch: accept a single message or an array
      const messages = Array.isArray(data) ? data : [data];
      let rebuildNeeded = false;
      for (const m of messages) {
        const key = applyOscMessage(bus.params, m);
        // live perform keys (D17/D19) are read live by the engine — no rebuild
        if (key && !PERFORM_LIVE_KEYS.has(key)) rebuildNeeded = true;
      }
      if (rebuildNeeded) scheduleChange();
    };
    socket.onclose = () => {
      if (closed) return;
      const delay = Math.min(15000, 1000 * 2 ** Math.min(attempts++, 4));
      setTimeout(connect, delay); // keep trying: the server may start later
    };
    socket.onerror = () => socket.close();
  };
  connect();

  return {
    close() { closed = true; socket?.close(); },
  };
}
