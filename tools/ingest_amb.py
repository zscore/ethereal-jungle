#!/usr/bin/env python3
"""Turn public-domain field recordings into the biome ambience loops (D26).

Replaces the synthesized beds of D16 (tools/gen_samples.py) with real
recordings. Sources are listed in tools/amb_sources.json — each entry names an
archive.org item from the `radio-aporee-maps` collection, all under CC0 or the
Public Domain Mark, so the set stays legally clean and the manifest doubles as
the attribution record.

Pipeline per layer:
  1. download the item's Ogg (cached under tools/.amb_cache/, gitignored)
  2. pick the best LOOP_SECONDS window — unless the manifest pins `start` —
     by scoring 100 ms RMS/brightness blocks for level, dropouts, stationarity
     and, most importantly, head/tail match (a window whose end already sounds
     like its beginning crossfades invisibly)
  3. render: highpass out the rumble, EBU R128 loudness-match every layer so
     the engine's gains mean the same thing across biomes, then crossfade the
     tail into the head so the 32-bar retrigger is seamless
  4. encode to Ogg Vorbis — the sources are already lossy, so storing WAV would
     just make 8 MB files out of the same audio (see D26 in design_decisions)

Run: python3 tools/ingest_amb.py            # all layers
     python3 tools/ingest_amb.py ambrain    # just one
     python3 tools/ingest_amb.py --audition  # 3 best windows each, to /tmp
"""
import json
import math
import os
import struct
import subprocess
import sys
import urllib.request
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, ".amb_cache")
OUT = os.path.join(ROOT, "public", "samples", "amb")
MANIFEST = os.path.join(HERE, "amb_sources.json")

BPM = 168
BARS = 32
LOOP_SECONDS = 60 / BPM * 4 * BARS  # 45.714 s
FADE = 2.0                          # tail-into-head crossfade, seconds
HIGHPASS = 35                       # Hz — kill handling/wind rumble
LUFS = -23.0                        # every layer matched; engine gains do the mix
ANALYSIS_SR = 8000
BLOCK = 0.1                         # analysis block, seconds
ANALYSIS_MAX = 420                  # only scan the first 7 min of a source —
                                    # some aporee items run half an hour, and
                                    # scoring every window of one in pure
                                    # Python costs far more than it finds


def run(args, **kw):
    p = subprocess.run(args, capture_output=True, text=True, **kw)
    if p.returncode != 0:
        tail = "\n".join(p.stderr.strip().splitlines()[-6:])
        raise RuntimeError(f"{args[0]} failed ({p.returncode}):\n{tail}")
    return p


def fetch(entry):
    """Download the source audio into the cache; return its path.
    Most aporee items carry an Ogg, a few only an MP3 — keep the real
    extension so ffmpeg picks the right demuxer."""
    os.makedirs(CACHE, exist_ok=True)
    ext = os.path.splitext(entry["file"])[1] or ".ogg"
    path = os.path.join(CACHE, f"{entry['archive']}{ext}")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    url = f"https://archive.org/download/{entry['archive']}/{entry['file']}"
    print(f"  fetching {url}")
    tmp = path + ".part"
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 16):
            f.write(chunk)
    os.replace(tmp, path)
    return path


# ---------------------------------------------------------------------------
# window selection
# ---------------------------------------------------------------------------


def envelope(src):
    """Mono 8 kHz RMS + zero-crossing-rate per BLOCK. Cheap stand-ins for
    level and brightness — enough to compare candidate windows."""
    wav = os.path.join(CACHE, "_analysis.wav")
    run(["ffmpeg", "-y", "-t", str(ANALYSIS_MAX), "-i", src, "-ac", "1",
         "-ar", str(ANALYSIS_SR), "-c:a", "pcm_s16le", wav])
    with wave.open(wav) as w:
        n = w.getnframes()
        data = struct.unpack(f"<{n}h", w.readframes(n))
    step = int(ANALYSIS_SR * BLOCK)
    rms, zcr = [], []
    for i in range(0, n - step, step):
        blk = data[i:i + step]
        rms.append(math.sqrt(sum(s * s for s in blk) / step) / 32768 + 1e-9)
        zcr.append(sum(1 for j in range(1, step) if (blk[j] < 0) != (blk[j - 1] < 0)) / step)
    return rms, zcr


def score_windows(rms, zcr, duration):
    """Rank every start offset. Lower is better."""
    span = int((LOOP_SECONDS + FADE) / BLOCK)
    nf = int(FADE / BLOCK)
    if len(rms) < span + 2:
        return []
    db = [20 * math.log10(v) for v in rms]
    out = []
    for st in range(0, len(rms) - span, int(1.0 / BLOCK)):  # 1 s granularity
        w = db[st:st + span]
        wz = zcr[st:st + span]
        mean = sum(w) / len(w)
        if mean < -60:
            continue                                  # essentially silence
        # A quiet block is not automatically a fault: drips and sparse bird
        # calls are mostly gap. Only reject a window that is *mostly* silence,
        # which is what a recording edit or a stopped take looks like.
        if sum(1 for x in w if x < -70) > 0.2 * len(w):
            continue
        var = math.sqrt(sum((x - mean) ** 2 for x in w) / len(w))
        head, tail = w[:nf], w[-nf:]
        headz, tailz = wz[:nf], wz[-nf:]
        # the crossfade is invisible when the tail already matches the head,
        # in both level and brightness
        seam = abs(sum(head) / nf - sum(tail) / nf)
        seam_z = abs(sum(headz) / nf - sum(tailz) / nf) * 120
        out.append((3.0 * seam + 2.0 * seam_z + 0.8 * var - 0.5 * mean, st * BLOCK))
    out.sort()
    return out


# ---------------------------------------------------------------------------
# render
# ---------------------------------------------------------------------------


def render(src, start, dst, gain_db=0.0):
    """Cut LOOP_SECONDS+FADE at `start`, clean it up, loudness-match, then
    crossfade the tail into the head so the result loops seamlessly.

    Layout: [ crossfade(tail, head) ][ body ]. In the source the tail runs
    straight into what follows and the head runs straight into the body, so
    both joins are continuous — the loop point is the only edit, and it is a
    2 s equal-power blend of material that already matches.
    """
    total = LOOP_SECONDS + FADE
    body = LOOP_SECONDS - FADE
    chain = (
        f"[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,"
        f"highpass=f={HIGHPASS},volume={gain_db}dB,"
        f"loudnorm=I={LUFS}:TP=-3:LRA=14,asplit=3[h][b][t];"
        f"[h]atrim=0:{FADE},asetpts=PTS-STARTPTS[head];"
        f"[b]atrim={FADE}:{FADE + body},asetpts=PTS-STARTPTS[bodyseg];"
        f"[t]atrim={LOOP_SECONDS}:{total},asetpts=PTS-STARTPTS[tail];"
        f"[tail][head]acrossfade=d={FADE}:c1=tri:c2=tri[xf];"
        f"[xf][bodyseg]concat=n=2:v=0:a=1[out]"
    )
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    run(["ffmpeg", "-y", "-ss", f"{start}", "-t", f"{total}", "-i", src,
         "-filter_complex", chain, "-map", "[out]",
         "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", dst])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    audition = "--audition" in sys.argv
    man = json.load(open(MANIFEST))
    names = args or list(man["sources"])

    for name in names:
        entry = man["sources"][name]
        print(f"\n{name}  <- {entry['archive']}  ({entry.get('title', '')[:50]})")
        src = fetch(entry)

        start = entry.get("start")
        if start is None or audition:
            rms, zcr = envelope(src)
            ranked = score_windows(rms, zcr, 0)
            if not ranked:
                print("  !! no usable window (too short or too quiet) — skipping")
                continue
            if audition:
                for i, (sc, st) in enumerate(ranked[:3]):
                    dst = f"/tmp/audition_{name}_{i}_{int(st)}s.ogg"
                    render(src, st, dst, entry.get("gain_db", 0.0))
                    print(f"  audition {i}: start={st:6.1f}s score={sc:6.2f} -> {dst}")
                continue
            start = ranked[0][1]
            print(f"  auto window: start={start:.1f}s (score {ranked[0][0]:.2f})")
        else:
            print(f"  pinned window: start={start:.1f}s")

        dst = os.path.join(OUT, f"{name}.ogg")
        render(src, start, dst, entry.get("gain_db", 0.0))
        mb = os.path.getsize(dst) / 1e6
        print(f"  wrote {dst} ({LOOP_SECONDS:.2f}s, {mb:.2f} MB)")


if __name__ == "__main__":
    main()
