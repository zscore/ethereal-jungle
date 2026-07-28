/**
 * engine.js — boots the Strudel scheduler + superdough, owns pattern rebuilds,
 * and mirrors every scheduled event onto the shared bus (look-ahead included):
 * the output wrapper publishes each hap with its audio-clock deadline BEFORE
 * it sounds, so subscribers (the visualizer) get their clairvoyance.
 */
import { controls, stack, repl, Pattern } from '@strudel/core';
import { miniAllStrings } from '@strudel/mini';
import {
  getAudioContext,
  initAudio,
  webaudioOutput,
  registerSynthSounds,
  samples,
  getSuperdoughAudioController,
} from '@strudel/webaudio';
import { bus, CPS, BAR_SECONDS } from '../bus.js';
import { applyPerform, applyRoll } from '../perform.js';
import { createMasterChain } from './masterchain.js';
import { makeSetPattern } from './generators.js';

let scheduler = null;
let masterChain = null;

export async function initEngine() {
  miniAllStrings(); // let plain strings act as mini-notation inside s()/note()

  // initEngine is called FROM the overlay click, so we are already inside a
  // user gesture: initialise directly and await it. (initAudioOnFirstClick
  // registers its own mousedown listener, which is installed too late to catch
  // the click that got us here — so its promise never resolved, superdough's
  // AudioWorklets were never loaded, and every worklet-backed effect failed to
  // construct. Nothing used one until the D22 costumes did: crush, coarse and
  // shape are all worklets.)
  await initAudio();
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
    // Perform rail (D17): overlay echo/crush/space onto the event as it is
    // scheduled — reads bus.params live, so mixer gestures land within the
    // latency window with no rebuild. Identity (no copy) while the rail idles.
    const v = applyPerform(hap.value ?? {}, bus.params);
    if (v !== hap.value) hap.value = v; // never mutate the pattern's own value object
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

  // The master insert (D19): EQ kills, gater, drive on the finished mix. The
  // gater starts on a bar line, so hand it our clock rather than wall time.
  const nextBarTime = () => {
    const t = bus.now();
    return ctx.currentTime + (Math.ceil(t / BAR_SECONDS) * BAR_SECONDS - t);
  };
  masterChain = createMasterChain(ctx, controller.output, nextBarTime);

  // The perform follower (D17/D19/D20): one 30 Hz tick drives everything that
  // must respond to a hand rather than to a rebuild. The chain builds its nodes
  // lazily on the first knob to leave rest, so an untouched rail leaves the
  // graph superdough built exactly as it was.
  setInterval(() => masterChain.update(bus.params), 33);

  // bus t=0 and scheduler cycle 0 are pinned to the same instant: the set
  // compiler keys content to absolute cycles, the bus keys curves to seconds,
  // and CPS is the shared conversion — bar-exact by construction (D9).
  bus.start(() => ctx.currentTime);
  rebuild();
  scheduler.start();
  return scheduler;
}

/**
 * Compile the whole set as one cycle-keyed pattern (D9). Phrase content —
 * including per-phrase break re-permutation and seam phases — is a function of
 * the scheduler's cycle count, so no rebuild timer exists; this is called only
 * when knobs change (the fresh compile snapshots the new params).
 */
export function rebuild() {
  if (!scheduler) return;
  const pattern = makeSetPattern(
    { ...controls, stack, Pattern },
    { ...bus.params },
    { tensionAt: (t) => bus.tensionAt(t), brightnessAt: (t) => bus.brightnessAt(t) },
  );
  // Roll (D19) is the one perform knob that IS launch-quantized: a stutter
  // has to land on the grid, and it is pattern surgery, not a node. Applied
  // outside the generators so the composition never learns it happened.
  scheduler.setPattern(applyRoll(pattern, bus.params.roll, stack), false);
  const t = bus.now();
  bus.publish({
    type: 'rebuild',
    tension: bus.tensionAt(t),
    brightness: bus.brightnessAt(t),
    seam: bus.seamAt(t).active,
    when: getAudioContext().currentTime,
  });
}

/**
 * Jump the playhead to an absolute set bar (D15). The set pattern is keyed to
 * the scheduler's cycle count (D9), so seeking is: point the scheduler's next
 * query window at the target cycle and reset the tick counter so it re-anchors
 * its wall-time↔cycle mapping on the next tick (the same path setCps uses),
 * then re-pin bus t=0 so both clocks agree that "now" is that bar. The right
 * content follows from the cycle-keyed compiler — no rebuild needed.
 * Returns true if playing afterwards (seeking while stopped starts playback).
 */
export function seekToBar(bar) {
  if (!scheduler) return false;
  const ctx = getAudioContext();
  bus.start(() => ctx.currentTime, bar * BAR_SECONDS);
  scheduler.lastEnd = bar;                    // next query begins at the target cycle
  scheduler.num_ticks_since_cps_change = 0;   // re-anchor time↔cycle at next tick
  if (!scheduler.started) scheduler.start();
  bus.publish({ type: 'seek', bar, when: ctx.currentTime });
  return true;
}

export function toggle() {
  if (!scheduler) return false;
  if (scheduler.started) { scheduler.stop(); return false; }
  // stop() reset the scheduler's cycle counter, so restart the set from the
  // top: re-pin bus t=0 to now and recompile so both clocks agree again.
  bus.start(() => getAudioContext().currentTime);
  rebuild();
  scheduler.start();
  return true;
}

export function stopEngine() {
  scheduler?.stop();
}

/** The master insert (D19) — exposed for console poking and for metering. */
export function getMasterChain() {
  return masterChain;
}

/**
 * The finished mix, as a node anything may fan out from — the audio sibling of
 * the bus's event stream, and the tap `tools/spectrum_probe.mjs` records
 * through (D33). Returns superdough's destination gain while the master insert
 * is idle, and the insert's own output once a knob has spliced it, so a probe
 * always hears exactly what the speakers do.
 *
 * Connecting another destination to a node does not disturb its existing
 * connections, so a listener here is genuinely passive.
 */
export function getAudioTap() {
  if (!scheduler) return null;
  return {
    ctx: getAudioContext(),
    node: masterChain?.output ?? getSuperdoughAudioController().output.destinationGain,
  };
}
