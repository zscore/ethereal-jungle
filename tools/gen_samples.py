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


# ---------------------------------------------------------------------------
# Biome ambience beds (D16): one 4-bar loop per track/biome, retriggered every
# 4 bars by the pattern engine. Generated steady-state with the tail
# crossfaded into the head so the loop point is seamless, normalized quiet
# (these are beds, not instruments). Names carry an `amb` prefix so the
# remote dirt-samples pack can never shadow them (and no underscores — `_`
# is mini-notation syntax).
# ---------------------------------------------------------------------------

AMB_BARS = 4
AMB_FADE = 0.25  # seconds of tail-into-head crossfade


def amb_len(bpm=168):
    return int(SR * (60 / bpm * 4) * AMB_BARS)


def loopify(buf, n, peak=0.5):
    """Blend the extra tail into the head, truncate to exactly n, normalize."""
    nf = int(SR * AMB_FADE)
    for i in range(nf):
        w = i / nf
        buf[i] = buf[i] * w + buf[n + i] * (1 - w)
    buf = buf[:n]
    m = max(abs(s) for s in buf) or 1.0
    return [s / m * peak for s in buf]


def ambience_insects():
    """undergrowth: cricket chorus over a damp low noise floor."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out, lp = [0.0] * total, 0.0
    for i in range(total):  # damp floor
        noise = random.random() * 2 - 1
        lp += 0.015 * (noise - lp)
        out[i] = lp * 0.5
    for _ in range(5):  # cricket voices: AM sine trills in bursts
        f = 3800 + random.random() * 1600
        trill = 22 + random.random() * 18
        phase = tph = 0.0
        i = int(random.random() * SR * 0.5)
        while i < total:
            burst = int(SR * (0.2 + random.random() * 0.4))
            for j in range(burst):
                if i + j >= total:
                    break
                phase += 2 * math.pi * f / SR
                tph += 2 * math.pi * trill / SR
                a = max(0.0, math.sin(tph)) ** 2
                edge = min(1.0, j / (SR * 0.02), (burst - j) / (SR * 0.05))
                out[i + j] += math.sin(phase) * a * edge * 0.12
            i += burst + int(SR * (0.3 + random.random() * 1.2))
    return loopify(out, n)


def ambience_rain():
    """forest floor: leaf-patter — noise bed plus stochastic droplets."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out, lp = [0.0] * total, 0.0
    for i in range(total):  # steady patter bed
        noise = random.random() * 2 - 1
        lp += 0.12 * (noise - lp)
        out[i] = lp * 0.35
    t = 0
    while t < total:  # droplet transients
        d = int(SR * (0.004 + random.random() * 0.02))
        amp = 0.1 + random.random() * 0.25
        prev = 0.0
        for j in range(d):
            if t + j >= total:
                break
            noise = random.random() * 2 - 1
            hp = noise - prev
            prev = noise
            out[t + j] += hp * amp * math.exp(-j / SR * 300)
        t += int(SR * (0.01 + random.random() * 0.08))
    return loopify(out, n)


def ambience_birds():
    """canopy: airy band noise with occasional FM chirp glissandi."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out, lp1, lp2 = [0.0] * total, 0.0, 0.0
    for i in range(total):  # airy bed (crude bandpass)
        noise = random.random() * 2 - 1
        lp1 += 0.25 * (noise - lp1)
        lp2 += 0.05 * (lp1 - lp2)
        out[i] = (lp1 - lp2) * 0.12
    for _ in range(8):  # chirps
        dur = int(SR * (0.08 + random.random() * 0.18))
        start = int(random.random() * (total - dur - 1))
        f0 = 2200 + random.random() * 1800
        f1 = f0 * (0.6 + random.random() * 0.9)
        vib = 30 + random.random() * 40
        phase = 0.0
        for j in range(dur):
            fr = f0 + (f1 - f0) * j / dur + 60 * math.sin(2 * math.pi * vib * j / SR)
            phase += 2 * math.pi * fr / SR
            e = math.sin(math.pi * j / dur) ** 2
            out[start + j] += math.sin(phase) * e * 0.2
    return loopify(out, n)


def ambience_wind():
    """zenith: slowly wandering band-passed wind + faint shimmer partials."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out, lp, sm = [0.0] * total, 0.0, 0.0
    for i in range(total):  # wandering wind band
        noise = random.random() * 2 - 1
        t = i / SR
        c = 0.04 + 0.03 * math.sin(2 * math.pi * t / 7.3) + 0.02 * math.sin(2 * math.pi * t / 3.1)
        lp += c * (noise - lp)
        sm += 0.5 * (lp - sm)
        out[i] = (lp - sm) * 1.2
    for k, fbase in enumerate([1244.5, 1866.2, 2489.0]):  # detuned shimmer
        phase = 0.0
        for i in range(total):
            t = i / SR
            f = fbase * (1 + 0.002 * math.sin(2 * math.pi * t / (5 + k * 2)))
            phase += 2 * math.pi * f / SR
            a = 0.02 * (0.5 + 0.5 * math.sin(2 * math.pi * t / (9 + 3 * k) + k))
            out[i] += math.sin(phase) * a
    return loopify(out, n)


# --- accent layers: two per biome, brought in and out by the engine's slow
# --- presence walks (generators.js layerPresenceAt). Sparser and more
# --- event-like than the beds — they read as *things happening* in the biome.


def ambience_frogs():
    """undergrowth accent: sparse croak pulses, low formant AM."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out = [0.0] * total
    for _ in range(3):
        i = int(random.random() * SR * 1.5)
        f = 95 + random.random() * 60
        while i < total:
            dur = int(SR * (0.18 + random.random() * 0.15))
            phase = 0.0
            for j in range(dur):
                if i + j >= total:
                    break
                phase += 2 * math.pi * (f * (1 + 0.25 * math.exp(-j / SR * 30))) / SR
                pulse = 0.5 + 0.5 * math.sin(2 * math.pi * 38 * j / SR)
                e = math.sin(math.pi * j / dur)
                out[i + j] += math.sin(phase) * (0.6 + 0.4 * math.sin(phase * 2)) * pulse * e * 0.3
            i += dur + int(SR * (1.0 + random.random() * 2.5))
    return loopify(out, n)


def gusty_noise(fast, slow, gust_period, bright=False):
    """Shared helper: band-limited noise under a wandering gust envelope."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out, lp, sm = [0.0] * total, 0.0, 0.0
    e, tgt = 0.2, random.random()
    step = int(SR * gust_period)
    for i in range(total):
        if i % step == 0:
            tgt = random.random() ** 2
        e += (tgt - e) * (1.2 / SR)
        noise = random.random() * 2 - 1
        lp += fast * (noise - lp)
        sm += slow * (lp - sm)
        band = lp - sm
        out[i] = (noise - lp if bright else band) * e * (0.4 if bright else 1.0)
    return loopify(out, n)


def ambience_rustle():
    """undergrowth accent: leaf movement — gusty midband noise."""
    return gusty_noise(0.3, 0.08, 0.6)


def ambience_thunder():
    """forest floor accent: distant rumble swells, very low band."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out, lp1, lp2 = [0.0] * total, 0.0, 0.0
    events = [(int(random.random() * total), 1.2 + random.random() * 1.8) for _ in range(3)]
    for i in range(total):
        noise = random.random() * 2 - 1
        lp1 += 0.006 * (noise - lp1)
        lp2 += 0.5 * (lp1 - lp2)
        a = 0.0
        for st, dur in events:
            t = (i - st) / SR
            if 0 <= t < dur:
                a += math.exp(-3 * t / dur) * min(1.0, t * 12)
        out[i] = lp2 * a * 3.0
    return loopify(out, n)


def ambience_drips():
    """forest floor accent: resonant water drips (rising bloink)."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out = [0.0] * total
    t = int(SR * 0.3)
    while t < total:
        f0 = 700 + random.random() * 900
        dur = int(SR * 0.09)
        phase = 0.0
        for j in range(dur):
            if t + j >= total:
                break
            phase += 2 * math.pi * (f0 * (1 + 0.5 * j / dur)) / SR
            out[t + j] += math.sin(phase) * math.exp(-j / SR * 45) * 0.4
        t += int(SR * (0.6 + random.random() * 1.6))
    return loopify(out, n)


def ambience_calls():
    """canopy accent: slow warbling calls, lower register than the chirps."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out = [0.0] * total
    for _ in range(5):
        dur = int(SR * (0.3 + random.random() * 0.5))
        start = int(random.random() * (total - dur - 1))
        f0 = 800 + random.random() * 700
        vib = 4.5 + random.random() * 3.5
        depth = 0.06 + random.random() * 0.08
        phase = 0.0
        for j in range(dur):
            phase += 2 * math.pi * (f0 * (1 + depth * math.sin(2 * math.pi * vib * j / SR))) / SR
            e = math.sin(math.pi * j / dur) ** 1.5
            out[start + j] += math.sin(phase) * e * 0.25
    return loopify(out, n)


def ambience_leaves():
    """canopy accent: wind gusts through foliage — brighter, slower gusts."""
    return gusty_noise(0.5, 0.15, 1.5, bright=True)


def ambience_shimmer():
    """zenith accent: swelling detuned high drone partials."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out = [0.0] * total
    for k, fbase in enumerate([830.6, 1245.9, 1661.2, 2077.0, 2491.1]):
        phase = 0.0
        per = 6 + k * 2.3
        for i in range(total):
            t = i / SR
            phase += 2 * math.pi * (fbase * (1 + 0.003 * math.sin(2 * math.pi * t / (4 + k)))) / SR
            a = 0.5 + 0.5 * math.sin(2 * math.pi * t / per + k * 1.7)
            out[i] += math.sin(phase) * a * 0.12
    return loopify(out, n)


def ambience_sparkle():
    """zenith accent: sparse crystalline pings with an octave partial."""
    n = amb_len()
    total = n + int(SR * AMB_FADE)
    out = [0.0] * total
    t = int(SR * 0.4)
    while t < total:
        f0 = 2500 + random.random() * 2500
        dur = int(SR * 0.35)
        p1 = p2 = 0.0
        amp = 0.15 + random.random() * 0.2
        for j in range(dur):
            if t + j >= total:
                break
            p1 += 2 * math.pi * f0 / SR
            p2 += 2 * math.pi * f0 * 2.01 / SR
            e = math.exp(-j / SR * 14)
            out[t + j] += (math.sin(p1) + 0.4 * math.sin(p2)) * e * amp
        t += int(SR * (0.8 + random.random() * 1.7))
    return loopify(out, n)


write_wav(os.path.join(base, "amb", "insects.wav"), ambience_insects())
write_wav(os.path.join(base, "amb", "rain.wav"), ambience_rain())
write_wav(os.path.join(base, "amb", "birds.wav"), ambience_birds())
write_wav(os.path.join(base, "amb", "wind.wav"), ambience_wind())
write_wav(os.path.join(base, "amb", "frogs.wav"), ambience_frogs())
write_wav(os.path.join(base, "amb", "rustle.wav"), ambience_rustle())
write_wav(os.path.join(base, "amb", "thunder.wav"), ambience_thunder())
write_wav(os.path.join(base, "amb", "drips.wav"), ambience_drips())
write_wav(os.path.join(base, "amb", "calls.wav"), ambience_calls())
write_wav(os.path.join(base, "amb", "leaves.wav"), ambience_leaves())
write_wav(os.path.join(base, "amb", "shimmer.wav"), ambience_shimmer())
write_wav(os.path.join(base, "amb", "sparkle.wav"), ambience_sparkle())


# ---------------------------------------------------------------------------
# Seam landing impact (D18): the one-shot that resolves a 'landing' seam's
# countdown — a pitched boom dropping to D1 (the set's root, scales.js ROOT),
# a band-limited noise splash, and D/A partials swelling into a slow tail so
# the hit hands off to the ether. Triggered once, on the boundary downbeat;
# the ~3.5 s tail rings ~2.5 bars into the intro at 168 BPM.
# (Kept BELOW the ambience writes so their random-call sequence — and thus
# their rendered bytes — stay identical across regenerations.)
# ---------------------------------------------------------------------------


def impact(dur=3.5):
    n = int(SR * dur)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):  # boom: 110 Hz falling to D1 (36.7 Hz), slow decay
        f = 36.7 + 73.3 * math.exp(-i / SR * 9)
        phase += 2 * math.pi * f / SR
        out[i] += math.sin(phase) * math.exp(-i / SR * 2.2) * 0.8
    lp = 0.0
    for i in range(n):  # splash: band-limited noise, faster decay
        noise = random.random() * 2 - 1
        lp += 0.2 * (noise - lp)
        out[i] += lp * math.exp(-i / SR * 6) * 0.6
    for k, f0 in enumerate([146.83, 220.0, 293.66]):  # D3, A3, D4 afterglow
        ph = 0.0
        for i in range(n):
            t = i / SR
            ph += 2 * math.pi * f0 * (1 + 0.003 * math.sin(2 * math.pi * t / (3 + k))) / SR
            e = min(1.0, t * 2.5) * math.exp(-t * 1.4)
            out[i] += math.sin(ph) * e * 0.06
    peak = max(abs(s) for s in out) or 1.0
    return [s / peak * 0.85 for s in out]


write_wav(os.path.join(base, "amb", "impact.wav"), impact())
