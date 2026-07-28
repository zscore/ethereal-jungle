#!/usr/bin/env python3
"""Measure a recording of the finished mix (tools/spectrum_probe.mjs, D33).

Three questions, because they are the three that "it sounds wrong" usually
turns out to mean:

1. **Is something ringing?** A ring is narrow and permanent. So: average the
   magnitude spectrum, find bins standing well above their own neighbourhood,
   and then ask whether that bin is still up in the *quietest* frame of the
   recording. A hat is loud and broadband; a snare is loud and brief; a ring is
   the thing that never goes away, and only the persistence column separates it
   from the other two.
2. **Where is the energy?** Octave bands, as a level tilt.
3. **What is the shape over time?** RMS per half second, so a build and a
   wind-down are distinguishable without ears (which is the whole point of the
   seam work in D34).

Pure stdlib + an iterative FFT: this runs in the same environment as
tools/ingest_amb.py, which deliberately has no numpy.

Run: python3 tools/analyse_probe.py /tmp/jungle_probe.wav
"""
import cmath
import math
import struct
import sys
import wave

N = 4096          # FFT size — 3.9 Hz bins at 16 kHz, fine enough to call a ring
HOP = N           # no overlap; we are measuring stationarity, not transients
MIN_RING_HZ = 700  # below this a "peak" is just the bass playing a note
PEAK_OVER_DB = 7.0  # how far above the local median a bin must stand


def read(path):
    with wave.open(path) as w:
        sr, n = w.getframerate(), w.getnframes()
        data = struct.unpack(f"<{n}h", w.readframes(n))
    return [s / 32768 for s in data], sr


def fft(x):
    """Iterative radix-2 FFT (recursion blows the stack at N=4096 × frames)."""
    n = len(x)
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            x[i], x[j] = x[j], x[i]
    length = 2
    while length <= n:
        ang = -2 * math.pi / length
        wl = cmath.exp(1j * ang)
        for i in range(0, n, length):
            w = 1 + 0j
            for k in range(i, i + length // 2):
                u = x[k]
                v = x[k + length // 2] * w
                x[k] = u + v
                x[k + length // 2] = u - v
                w *= wl
        length <<= 1
    return x


def frames(a, sr):
    win = [0.5 - 0.5 * math.cos(2 * math.pi * i / N) for i in range(N)]
    for st in range(0, len(a) - N, HOP):
        seg = [complex(a[st + i] * win[i], 0) for i in range(N)]
        X = fft(seg)
        yield [abs(v) / N for v in X[: N // 2 + 1]]


def db(v):
    return 20 * math.log10(max(v, 1e-12))


def main():
    path = sys.argv[1]
    a, sr = read(path)
    df = sr / N
    spec = list(frames(a, sr))
    if not spec:
        print("recording too short to analyse")
        return
    nb = len(spec[0])
    avg = [sum(f[k] for f in spec) / len(spec) for k in range(nb)]
    # the quietest frame per bin: what is left when everything transient has gone
    floor = [min(f[k] for f in spec) for k in range(nb)]

    print(f"  {len(a) / sr:.1f}s at {sr} Hz, {len(spec)} frames, {df:.1f} Hz bins")

    # ---- 1. rings -----------------------------------------------------------
    peaks = []
    half = 40  # ±156 Hz neighbourhood
    for k in range(int(MIN_RING_HZ / df), nb - 2):
        lo, hi = max(0, k - half), min(nb, k + half)
        nbhd = sorted(avg[lo:hi])
        med = nbhd[len(nbhd) // 2]
        if med <= 0:
            continue
        prom = db(avg[k]) - db(med)
        if prom < PEAK_OVER_DB:
            continue
        if avg[k] < avg[k - 1] or avg[k] < avg[k + 1]:
            continue                      # keep only local maxima
        peaks.append((prom, k * df, db(floor[k]) - db(med), db(avg[k])))
    peaks.sort(reverse=True)
    kept, seen = [], []
    for p in peaks:                        # one entry per ~octave-ish cluster
        if all(abs(p[1] - q) > 60 for q in seen):
            kept.append(p)
            seen.append(p[1])
    print("\n  narrowband peaks (a ring is prominent AND persistent):")
    if not kept:
        print("    none above %d Hz — nothing is ringing" % MIN_RING_HZ)
    for prom, hz, persist, level in kept[:8]:
        verdict = "RING" if persist > 0 else ("resonance" if persist > -6 else "note/transient")
        print(f"    {hz:7.0f} Hz  +{prom:4.1f} dB prominent  {persist:+5.1f} dB in the quietest frame"
              f"  ({level:6.1f} dBFS)  {verdict}")

    # ---- 2. bands -----------------------------------------------------------
    edges = [0, 120, 250, 500, 1000, 2000, 4000, 8000]
    print("\n  octave bands:")
    tot = sum(v * v for v in avg) + 1e-18
    for i in range(len(edges) - 1):
        e = sum(avg[k] ** 2 for k in range(int(edges[i] / df), min(nb, int(edges[i + 1] / df))))
        print(f"    {edges[i]:5d}–{edges[i+1]:5d} Hz  {100 * e / tot:5.1f}%   {db(math.sqrt(e)):6.1f} dB")

    # ---- 3. envelope --------------------------------------------------------
    blk = int(sr * 0.5)
    env = [db(math.sqrt(sum(v * v for v in a[i:i + blk]) / blk)) for i in range(0, len(a) - blk, blk)]
    # ---- 3a. dropouts ------------------------------------------------------
    # Digital zero is not a musical event: superdough emits *something* in every
    # section of this set, so a run of exact silence means the audio thread
    # underran while the page was being software-rasterized. Reported loudly,
    # because a starved recording will otherwise be read as an arrangement that
    # stopped — which is exactly the wrong conclusion to draw about a seam.
    zeros, run, runs = 0, 0, []
    for i in range(0, len(a) - blk, blk):
        if max(abs(v) for v in a[i:i + blk]) < 1e-6:
            zeros += 1
            run += 1
        else:
            if run:
                runs.append(run)
            run = 0
    if run:
        runs.append(run)
    if runs:
        print(f"\n  !! DROPOUTS: {zeros * 0.5:.1f}s of digital silence in "
              f"{len(runs)} run(s), longest {max(runs) * 0.5:.1f}s.")
        print("     The renderer starved — re-run on a quieter machine before "
              "trusting the envelope below.")

    print("\n  level, every 0.5 s (dBFS):")
    for i in range(0, len(env), 12):
        print("    " + " ".join(f"{v:6.1f}" for v in env[i:i + 12]))
    if len(env) > 4:
        head = sum(env[: len(env) // 3]) / (len(env) // 3)
        tail = sum(env[-len(env) // 3:]) / (len(env) // 3)
        print(f"    first third {head:.1f} dB → last third {tail:.1f} dB  "
              f"({'RISING' if tail > head + 0.5 else 'FALLING' if tail < head - 0.5 else 'flat'})")


if __name__ == "__main__":
    main()
