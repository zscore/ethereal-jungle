/**
 * perform.js — the perform rail: classic DJ color FX (music doc §9.1's
 * performance rack, the mixer half). Modeled on the DJ-mixer canon
 * (Pioneer's Sound Color FX): filter (bipolar LP/HP), echo (dub echo),
 * crush, space (reverb wash).
 *
 * These are NOT composition inputs. The latent knobs (tension, wildness…)
 * change what the generators write and take effect at the next rebuild —
 * launch-quantized intent (D7). The perform rail is the opposite: hands on
 * the mixer, effective now. Two mechanisms, neither touching the generators:
 *
 *   filter           — superdough's per-orbit `djf` worklet AudioParam,
 *                      slewed toward the knob continuously by engine.js.
 *   echo/crush/space — an overlay applied to each hap's value at the output
 *                      tap as it is scheduled (~latency window, no rebuild).
 */

export const PERFORM_DEFAULTS = {
  filter: 0.5, // bipolar DJ filter: 0 = LP kill, 0.5 = bypass, 1 = HP kill
  echo: 0,     // dub echo send, dotted-eighth, feedback rises with the knob
  crush: 0,    // bit crush: 12 bits (subtle) down to 2 (destroyed)
  space: 0,    // reverb wash: pushes every stream's room send toward 0.9
};

export const PERFORM_KEYS = new Set(Object.keys(PERFORM_DEFAULTS));

const EPS = 0.01; // below this a knob is at rest — the rail costs nothing

/** True when the knob sits in the djf worklet's own bypass band (0.49–0.51). */
export function filterNeutral(x) {
  return Math.abs(x - 0.5) < EPS;
}

/**
 * Overlay the event-scoped perform FX onto one hap value. Pure: returns the
 * SAME object when the rail is idle (the common case allocates nothing), a
 * shallow-augmented copy when any knob is live. Every mapping composes with
 * whatever the generators authored via max/min — the rail can only push an
 * effect further, never cancel the composition. `filter` is deliberately
 * absent here: it lives on the orbit nodes (engine.js), not on events.
 */
export function applyPerform(value, perf) {
  const echo = (perf.echo ?? 0) > EPS ? perf.echo : 0;
  const crush = (perf.crush ?? 0) > EPS ? perf.crush : 0;
  const space = (perf.space ?? 0) > EPS ? perf.space : 0;
  if (!echo && !crush && !space) return value;

  const v = { ...value };
  if (echo) {
    v.delay = Math.max(v.delay ?? 0, echo * 0.8); // send level
    // dotted eighth (one cycle = one bar), unless the composition authored a time
    if (v.delaytime == null && v.delaysync == null) v.delaysync = 3 / 16;
    v.delayfeedback = Math.max(v.delayfeedback ?? 0, 0.35 + 0.5 * echo);
  }
  if (crush) {
    v.crush = Math.min(v.crush ?? Infinity, 12 - 10 * crush); // bit depth: lower = harsher
  }
  if (space) {
    v.room = Math.max(v.room ?? 0, space * 0.9);
  }
  return v;
}
