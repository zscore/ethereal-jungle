/**
 * engine.js — boots the Strudel scheduler + superdough, owns pattern rebuilds,
 * and mirrors every scheduled event onto the shared bus (look-ahead included):
 * the output wrapper publishes each hap with its audio-clock deadline BEFORE
 * it sounds, so subscribers (the visualizer) get their clairvoyance.
 */
import { controls, stack, repl } from '@strudel/core';
import { miniAllStrings } from '@strudel/mini';
import {
  getAudioContext,
  initAudioOnFirstClick,
  webaudioOutput,
  registerSynthSounds,
  samples,
} from '@strudel/webaudio';
import { bus } from '../bus.js';
import { buildArrangement } from './generators.js';

const BPM = 168;
const CPS = BPM / 60 / 4; // one cycle = one 4/4 bar

let scheduler = null;
let rebuildTimer = null;

export async function initEngine() {
  miniAllStrings(); // let plain strings act as mini-notation inside s()/note()

  initAudioOnFirstClick();
  const ctx = getAudioContext();

  await registerSynthSounds(); // sawtooth etc.

  // Local synthesized CC0 kit — always available, offline-safe (tools/gen_samples.py).
  await samples('/samples/strudel.json');

  // Optional richer pack for development listening only (unclear provenance —
  // never vendor/redistribute; see README §licensing). Failure is non-fatal.
  try {
    await samples('github:tidalcycles/dirt-samples');
  } catch (err) {
    console.warn('[engine] remote sample pack unavailable, using local kit only:', err.message);
  }

  // Wrap the audio output so every event is mirrored to the bus with its
  // scheduled time — the one and only tap point.
  const output = (hap, deadline, hapDuration, cps, targetTime) => {
    const v = hap.value ?? {};
    bus.publish({
      type: 'hap',
      sound: v.s ?? null,
      note: v.note ?? null,
      orbit: v.orbit ?? 0,
      gain: v.gain ?? 1,
      when: ctx.currentTime + deadline, // absolute audio-clock time it will sound
      dur: hapDuration,
    });
    return webaudioOutput(hap, deadline, hapDuration, cps, targetTime);
  };

  ({ scheduler } = repl({
    defaultOutput: output,
    getTime: () => ctx.currentTime,
  }));
  scheduler.setCps(CPS);

  bus.start(() => ctx.currentTime);
  rebuild();

  // The permutation is seeded & static per build; re-permute each phrase so the
  // break keeps developing (§1.1: theme and variations). 8 bars ≈ one phrase.
  const phraseSeconds = (8 / CPS) | 0;
  rebuildTimer = setInterval(rebuild, phraseSeconds * 1000);

  scheduler.start();
  return scheduler;
}

/** Rebuild the arrangement from the current bus state. Called on knob changes. */
export function rebuild() {
  if (!scheduler) return;
  const t = bus.now();
  const tension = bus.tensionAt(t);
  const p = { ...bus.params, seed: bus.params.seed + Math.floor(t / 16) }; // phrase-varying seed
  const pattern = buildArrangement({ ...controls, stack }, p, tension);
  scheduler.setPattern(pattern, false);
  bus.publish({ type: 'rebuild', tension, when: getAudioContext().currentTime });
}

export function toggle() {
  if (!scheduler) return false;
  if (scheduler.started) { scheduler.stop(); return false; }
  scheduler.start(); return true;
}

export function stopEngine() {
  if (rebuildTimer) clearInterval(rebuildTimer);
  scheduler?.stop();
}
