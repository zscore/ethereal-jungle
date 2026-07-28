#!/usr/bin/env python3
"""Cut the toucan one-shots that become the canopy's tom kit (D31).

The manifest's `oneshots` entries name the same kind of source as the ambience
loops (tools/amb_sources.json — archive.org / radio-aporee-maps, CC0 or Public
Domain Mark), but the job is the opposite one: instead of the longest window
that loops invisibly, we want the few loudest *isolated* events in the file.

Pipeline per one-shot:
  1. download the source (cached under tools/.amb_cache/, gitignored)
  2. find call onsets — 10 ms RMS blocks, a noise floor taken from the 20th
     percentile, and a threshold well above it; runs closer than GAP are one
     call (a toucan croak is several pulses, and cutting between them would
     leave half a bird)
  3. keep the `count` loudest calls that do not overlap, in time order
  4. render each: trim to the call plus its decay, highpass out the rumble the
     pitch-shift would otherwise drag into the sub, short fades so the sample
     starts and ends at zero, peak-normalise to -1 dBFS
  5. write 16-bit mono WAV. Not Ogg, deliberately: these are transients, they
     are tiny (~100 kB the lot), and every codec puts its own priming delay in
     front of the attack — a tom that is late by a few milliseconds is a tom
     that is out of time.

The pitch-shifting is NOT done here. One sample per call goes to the engine,
which plays it at several `speed` values (src/music/generators.js `tomLayer`)
so the kit stays a knob rather than a rendering decision.

Run: python3 tools/ingest_toms.py            # all one-shots
     python3 tools/ingest_toms.py toucan     # just one
     python3 tools/ingest_toms.py --report   # detect only, cut nothing
"""
import json
import math
import os
import struct
import sys
import wave

from ingest_amb import CACHE, ROOT, fetch, run

MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "amb_sources.json")
OUT = os.path.join(ROOT, "public", "samples", "tom")

ANALYSIS_SR = 22050
BLOCK = 0.010        # onset analysis block, seconds
PRE = 0.020          # keep this much before the onset — the attack matters most
HIGHPASS = 110       # Hz — the pitch-shift drops this to ~55 Hz at the low tom
PEAK_DB = -1.0

# Detection defaults. Every one of these is overridable per manifest entry,
# because what counts as "one call" is a fact about the animal: the Casanare
# toucan croaks in bursts of 3–7 pulses about 60 ms apart, and the tom we want
# is ONE pulse — a gap of 0.25 s would glue the whole burst into a rattle.
DEFAULTS = {
    "gap": 0.06,      # events closer than this are one call
    "min_call": 0.08,  # anything shorter is a click, not a bird
    "max_call": 0.36,  # anything longer has caught its neighbour
    "over": 10.0,      # dB above the noise floor to count as a call
    "tail": 3.0,       # dB above the floor to still count as its decay
}


def envelope(src):
    """Mono RMS per BLOCK, in dB."""
    wav = os.path.join(CACHE, "_toms_analysis.wav")
    run(["ffmpeg", "-y", "-i", src, "-ac", "1", "-ar", str(ANALYSIS_SR),
         "-c:a", "pcm_s16le", wav])
    with wave.open(wav) as w:
        n = w.getnframes()
        data = struct.unpack(f"<{n}h", w.readframes(n))
    step = int(ANALYSIS_SR * BLOCK)
    out = []
    for i in range(0, n - step, step):
        blk = data[i:i + step]
        rms = math.sqrt(sum(s * s for s in blk) / step) / 32768 + 1e-9
        out.append(20 * math.log10(rms))
    return out


def find_calls(db, cfg):
    """Every isolated event in the envelope, as (start_s, dur_s, peak_db)."""
    floor = sorted(db)[len(db) // 5]                     # 20th percentile
    hot, warm = floor + cfg["over"], floor + cfg["tail"]
    calls, i, n = [], 0, len(db)
    while i < n:
        if db[i] < hot:
            i += 1
            continue
        start = i
        while start > 0 and db[start - 1] >= warm:       # back up over the attack
            start -= 1
        end, quiet = i, 0
        while end < n and quiet * BLOCK < cfg["gap"]:    # extend through the decay
            quiet = quiet + 1 if db[end] < warm else 0
            end += 1
        peak = max(db[start:end])
        dur = (end - quiet - start) * BLOCK
        if cfg["min_call"] <= dur <= cfg["max_call"]:
            calls.append((start * BLOCK, dur, peak))
        i = end
    return calls, floor


def render(src, start, dur, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    fade = min(0.04, dur / 4)
    chain = (
        f"highpass=f={HIGHPASS},"
        f"afade=t=in:st=0:d=0.004,"
        f"afade=t=out:st={max(0.0, dur - fade):.3f}:d={fade:.3f}"
    )
    run(["ffmpeg", "-y", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src,
         "-af", chain, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", dst])
    # peak-normalise in a second pass: the level is only knowable after the trim
    p = run(["ffmpeg", "-i", dst, "-af", "volumedetect", "-f", "null", "-"])
    peak = next((float(l.split("max_volume:")[1].split("dB")[0])
                 for l in p.stderr.splitlines() if "max_volume:" in l), 0.0)
    tmp = dst + ".tmp.wav"
    run(["ffmpeg", "-y", "-i", dst, "-af", f"volume={PEAK_DB - peak:.2f}dB",
         "-c:a", "pcm_s16le", tmp])
    os.replace(tmp, dst)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    report = "--report" in sys.argv
    man = json.load(open(MANIFEST))
    names = args or list(man["oneshots"])

    for name in names:
        entry = man["oneshots"][name]
        print(f"\n{name}  <- {entry['archive']}  ({entry.get('title', '')[:50]})")
        src = fetch(entry)
        cfg = {**DEFAULTS, **{k: entry[k] for k in DEFAULTS if k in entry}}
        db = envelope(src)
        calls, floor = find_calls(db, cfg)
        print(f"  noise floor {floor:.1f} dB, {len(calls)} isolated calls")
        for t, d, pk in calls:
            print(f"    {t:6.2f}s  {d:.2f}s  peak {pk:6.1f} dB")
        if report:
            continue
        want = entry.get("count", 3)
        # loudest first, then back into time order so toucan1 is the first bird
        best = sorted(sorted(calls, key=lambda c: -c[2])[:want])
        if not best:
            print("  !! no call cleared the threshold — skipping")
            continue
        for i, (t, d, pk) in enumerate(best, 1):
            dst = os.path.join(OUT, f"{name}{i}.wav")
            render(src, max(0.0, t - PRE), d + PRE, dst)
            kb = os.path.getsize(dst) / 1e3
            print(f"  wrote {dst}  ({d + PRE:.2f}s, {kb:.0f} kB, source peak {pk:.1f} dB)")


if __name__ == "__main__":
    main()
