/**
 * masterchain.js — the master insert (D19). The third perform mechanism:
 * a chain spliced between superdough's destination gain and the speakers,
 * so EQ kills, the gater and drive act on the finished mix rather than on
 * individual events. This is the "master bus as an addressable target" the
 * roadmap has been carrying as an open item since D10.
 *
 *   destinationGain → low ▸ mid ▸ high ▸ hp ▸ hp ▸ lp ▸ lp
 *                   ▸ saturate ▸ makeup ▸ gate → destination
 *
 * The filters sit after the EQ and before the drive, so sweeping them changes
 * what the saturation has to chew on — which is what makes a filtered build
 * sound like it is being pushed rather than merely dimmed.
 *
 * Renderer contact is deliberate and confined: engine.js owns the superdough
 * handles and hands them here, as it does for the orbit nodes the kick ducks.
 *
 * Everything is lazy. Until a knob leaves its rest position the splice never
 * happens and the graph superdough built is untouched — no extra filters, no
 * waveshaper, no oscillator in the path of an ordinary listen.
 */
import { CPS } from '../bus.js';
import {
  EQ_LOW_HZ, EQ_MID_HZ, EQ_MID_Q, EQ_HIGH_HZ, GATE_SMOOTH_HZ,
  FILTER_Q, FILTER_Q2, LPF_MAX_HZ, HPF_MIN_HZ,
  bandGainDb, gateRateHz, lpfCutoff, hpfCutoff,
  driveCurve, driveMakeup, masterNeutral,
} from '../perform.js';

const SLEW = 0.02; // setTargetAtTime constant — fast enough to feel like a hand

/**
 * @param ctx           the AudioContext
 * @param sdOutput      superdough's SuperdoughOutput (owns destinationGain)
 * @param nextBarTime   () => audio-clock time of the next bar line, so the
 *                      gater engages on the grid (D9's bar-exactness ethos)
 */
export function createMasterChain(ctx, sdOutput, nextBarTime) {
  let nodes = null;   // the splice, built on first use
  let lfo = null;     // the gater's oscillator, built on first gate
  let curDrive = null;

  function splice() {
    const low = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: EQ_LOW_HZ });
    const mid = new BiquadFilterNode(ctx, { type: 'peaking', frequency: EQ_MID_HZ, Q: EQ_MID_Q });
    const high = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: EQ_HIGH_HZ });
    // Two cascaded stages each: 24 dB/oct, resonance on the first only.
    const hp1 = new BiquadFilterNode(ctx, { type: 'highpass', frequency: HPF_MIN_HZ, Q: FILTER_Q });
    const hp2 = new BiquadFilterNode(ctx, { type: 'highpass', frequency: HPF_MIN_HZ, Q: FILTER_Q2 });
    const lp1 = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: LPF_MAX_HZ, Q: FILTER_Q });
    const lp2 = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: LPF_MAX_HZ, Q: FILTER_Q2 });
    const saturate = new WaveShaperNode(ctx, { oversample: '2x' }); // null curve = passthrough
    const makeup = new GainNode(ctx, { gain: 1 });
    // The gater's base gain stays 1 and the LFO sums into it, so the mix is
    // never silenced by a gate that hasn't started oscillating yet.
    const gate = new GainNode(ctx, { gain: 1 });

    const src = sdOutput.destinationGain;
    src.disconnect(); // was wired straight to ctx.destination
    src.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(hp1);
    hp1.connect(hp2);
    hp2.connect(lp1);
    lp1.connect(lp2);
    lp2.connect(saturate);
    saturate.connect(makeup);
    makeup.connect(gate);
    gate.connect(ctx.destination);
    nodes = { low, mid, high, hp1, hp2, lp1, lp2, saturate, makeup, gate };
  }

  function startLfo() {
    const osc = new OscillatorNode(ctx, { type: 'square', frequency: gateRateHz(CPS) });
    const smooth = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: GATE_SMOOTH_HZ, Q: 0.7 });
    const depth = new GainNode(ctx, { gain: 0 });
    const dc = new ConstantSourceNode(ctx, { offset: 0 });
    // gate.gain = 1 (base) + dc(−d/2) + square(±1)·(d/2)  ⇒  swings 1−d … 1
    osc.connect(smooth);
    smooth.connect(depth);
    depth.connect(nodes.gate.gain);
    dc.connect(nodes.gate.gain);
    const at = nextBarTime();
    osc.start(at);
    dc.start(at);
    lfo = { osc, depth, dc };
  }

  return {
    /** Push the current params at the chain. Cheap and idempotent — called at 30 Hz. */
    update(p) {
      if (!nodes) {
        if (masterNeutral(p)) return; // still untouched: stay out of the signal path
        splice();
      }
      const t = ctx.currentTime;
      nodes.low.gain.setTargetAtTime(bandGainDb(p.eqLow), t, SLEW);
      nodes.mid.gain.setTargetAtTime(bandGainDb(p.eqMid), t, SLEW);
      nodes.high.gain.setTargetAtTime(bandGainDb(p.eqHigh), t, SLEW);

      // The dials sweep continuously — this is the one place where a slew that
      // is too slow reads as lag in the hand, and too fast reads as zipper.
      const lp = lpfCutoff(p.lpf);
      const hp = hpfCutoff(p.hpf);
      nodes.lp1.frequency.setTargetAtTime(lp, t, SLEW);
      nodes.lp2.frequency.setTargetAtTime(lp, t, SLEW);
      nodes.hp1.frequency.setTargetAtTime(hp, t, SLEW);
      nodes.hp2.frequency.setTargetAtTime(hp, t, SLEW);

      const drive = Math.min(1, Math.max(0, p.drive ?? 0));
      if (drive !== curDrive) {
        nodes.saturate.curve = driveCurve(drive); // null when off — true bypass
        nodes.makeup.gain.setTargetAtTime(driveMakeup(drive), t, SLEW);
        curDrive = drive;
      }

      const g = Math.min(1, Math.max(0, p.gate ?? 0));
      if (g > 0 && !lfo) startLfo();
      if (lfo) {
        lfo.depth.gain.setTargetAtTime(g / 2, t, SLEW);
        lfo.dc.offset.setTargetAtTime(-g / 2, t, SLEW);
      }
    },
    /** Test/debug: has the splice happened yet? */
    get spliced() { return nodes != null; },
    /** Test/debug: the chain's last node, for metering what the speakers get. */
    get output() { return nodes?.gate ?? null; },
    /** Test/debug: the chain's head, for injecting a known signal. */
    get input() { return nodes?.low ?? null; },
  };
}
