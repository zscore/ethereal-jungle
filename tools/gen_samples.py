#!/usr/bin/env python3
"""Synthesize a minimal, legally-clean (generated-from-code, CC0) sample set:
bd / sd / hh one-shots and a one-bar 16-slice synthesized break at 168 BPM.
Placeholder timbres — swap in real CC0 breaks (Sonic Pi pack, Freesound CC0,
Clean-Samples) as the project matures. Run: python3 tools/gen_samples.py
"""
import math
import os
import struct
import wave
import random

SR = 44100
random.seed(19)


def write_wav(path, samples):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(
            struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples
        )
        w.writeframes(frames)
    print(f"wrote {path} ({len(samples)/SR:.3f}s)")


def env_exp(n, decay):
    return [math.exp(-i / SR * decay) for i in range(n)]


def kick(dur=0.28):
    n = int(SR * dur)
    e = env_exp(n, 18)
    out = []
    phase = 0.0
    for i in range(n):
        f = 42 + 85 * math.exp(-i / SR * 35)  # pitch drop 127→42 Hz
        phase += 2 * math.pi * f / SR
        click = (random.random() * 2 - 1) * math.exp(-i / SR * 900) * 0.4
        out.append((math.sin(phase) * 0.95 + click) * e[i])
    return out


def snare(dur=0.2, tone=185, noise_amt=0.7):
    n = int(SR * dur)
    e = env_exp(n, 24)
    out, lp = [], 0.0
    phase = 0.0
    for i in range(n):
        phase += 2 * math.pi * tone / SR
        noise = random.random() * 2 - 1
        lp += 0.25 * (noise - lp)  # crude band-limit
        body = math.sin(phase) * (1 - noise_amt)
        out.append((body + (noise - lp) * noise_amt) * e[i])
    return out


def hat(dur=0.07):
    n = int(SR * dur)
    e = env_exp(n, 70)
    out, prev = [], 0.0
    for i in range(n):
        noise = random.random() * 2 - 1
        hp = noise - prev  # crude highpass
        prev = noise
        out.append(hp * 0.6 * e[i])
    return out


def ghost():
    return [s * 0.35 for s in snare(dur=0.12, tone=160, noise_amt=0.85)]


def mix_at(buf, snd, pos, gain=1.0):
    for i, s in enumerate(snd):
        j = pos + i
        if j < len(buf):
            buf[j] += s * gain


def make_break(bpm=168):
    bar = 60 / bpm * 4
    step = bar / 16
    buf = [0.0] * int(SR * bar)
    BD, SD, HH, GH = kick(), snare(), hat(), ghost()
    hits = [  # a classic-shaped one-bar break: anchors at 0/4/8/12, ghosts off-grid
        (BD, [(0, 1.0), (7, 0.8), (10, 0.9)]),
        (SD, [(4, 1.0), (12, 1.0)]),
        (GH, [(6, 0.6), (9, 0.5), (14, 0.7), (15, 0.4)]),
        (HH, [(i, 0.5 if i % 2 else 0.7) for i in range(16)]),
    ]
    for snd, events in hits:
        for slot, gain in events:
            mix_at(buf, snd, int(slot * step * SR), gain)
    peak = max(abs(s) for s in buf)
    return [s / peak * 0.9 for s in buf]


base = os.path.join(os.path.dirname(__file__), "..", "public", "samples")
write_wav(os.path.join(base, "bd", "bd.wav"), kick())
write_wav(os.path.join(base, "sd", "sd.wav"), snare())
write_wav(os.path.join(base, "hh", "hh.wav"), hat())
write_wav(os.path.join(base, "breaks", "break168.wav"), make_break())
