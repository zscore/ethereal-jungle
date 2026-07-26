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
  getSuperdoughAudioController,
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

  // Pre-create the orbits (superdough makes them lazily on first use) so the
  // kick's duck can target the pad/lead orbits before they've ever sounded.
  const controller = getSuperdoughAudioController();
  for (const orbit of [1, 2, 3, 4]) controller.getOrbit(orbit, [0, 1]); // stereo channel pair

  bus.start(() => ctx.currentTime);
  rebuild();

  // The permutation is seeded & static per build; re-permute each phrase so the
  // break keeps developing (§1.1: theme and variations). 4 bars keeps seam
  // phases responsive (the 12 s seam window spans ~2 rebuilds at 168 BPM).
  const phraseSeconds = 4 / CPS;
  rebuildTimer = setInterval(rebuild, phraseSeconds * 1000);

  scheduler.start();
  return scheduler;
}

/** Rebuild the arrangement from the current bus state. Called on knob changes. */
export function rebuild() {
  if (!scheduler) return;
  const t = bus.now();
  const tension = bus.tensionAt(t);
  const brightness = bus.brightnessAt(t);
  const seam = bus.seamAt(t);
  const { index } = bus.trackAt(t);
  // seed varies per phrase AND per track, so each track is a different telling
  const p = { ...bus.params, seed: bus.params.seed + Math.floor(t / 16) + index * 7919 };
  const pattern = buildArrangement({ ...controls, stack }, p, tension, brightness, seam);
  scheduler.setPattern(pattern, false);
  bus.publish({ type: 'rebuild', tension, brightness, seam: seam.active, when: getAudioContext().currentTime });
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
