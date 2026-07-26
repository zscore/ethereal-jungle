# Section distinction ideas

A working backlog of musical devices to make the D11 sections (and the four
tracks) read as *places*, not parameter settings. Each idea names the theory
it leans on (music doc §; design decisions D). Items marked **[done]** are
implemented; everything else is fair game, roughly ordered by expected
audibility-per-effort within each group.

## Global devices (work in any section)

- **Layer presence cycling on coprime periods** (§7's Eno principle): give
  each optional layer (hats, ghost percussion, a texture bed) its own phrase
  period — hats every phrase but resting every 3rd, shaker every 4th — so the
  full stack aligns only at lcm distances. Non-repetition from tiny material.
  **[done for hats]** — presence draws full/sparse/off per phrase, weighted by
  section.
- **Timbre unlock ladder** (§7: `violence(patch) ≤ f(T(t))`): harder timbres
  become *legal* only above tension thresholds — square bass over sawtooth
  past T≈0.6, a dry lead doubling past T≈0.8. Sections then differ in what
  sounds they're even allowed to contain.
- **Harmonic rhythm as intensity**: pads re-voice every 4 bars normally, every
  2 bars in peak, every 8 in intro/breakdown. Faster harmonic rhythm reads as
  drive without any new notes (§2's stasis stays intact — same mode, same
  root, just re-voiced).
- **The global low-pass sweep** (§8): build2's last phrase sweeps a master
  filter down; the drop releases it. Scene-collapse as a camera move, and the
  release is a free drop. (Needs a master-bus filter in superdough — check
  `postgain`/orbit fx support first.)

## Per-section ideas

- **intro**: kick heartbeat only **[done]**; add one-note bass pedal (the
  root, whole notes) so the floor exists as *promise*; vinyl-crackle bed at
  full gain (it then *ducks under* the entering break at build — the oldest
  jungle trick).
- **build**: break enters degraded **[done]**; additionally low-pass the
  break itself, opening across the section (2 kHz → open) — the drummer
  walking toward you; bass enters at half density (talea E(3,16)) then full
  E(5,16) at groove.
- **groove**: the reference state — keep it the *only* section where the
  full-density break plays un-filtered, so everything else is legible against
  it. Ghost-snare fills on phrase-final bars (§1's ghost logic, w-scaled).
- **breakdown**: pads swell + featured lead **[done]**; granular/halfspeed
  break ghost (§3.4's timestretch artifact — the drums heard as *weather*):
  play the break at 0.5 speed, wet, quiet, no skeleton; shimmer the pads
  (+12 pitch in the verb tail, §7) if the renderer grows the fx.
- **build2**: riser + dropout bar **[done]**; snare-roll acceleration in the
  final two bars (borrow the seam countdown at half depth: `sd sd*2`);
  stutter/beat-repeat the last half-bar before the dropout (§8's mischief
  move, w-gated).
- **peak**: drop slam **[done]**; drop *variants* chosen per track by seeded
  rng — (a) full slam, (b) break-only bar then bass floods in, (c) bass+kick
  only bar then break returns — same arrival, different content each time
  (§5: predictable time, withheld content); double-time hats (E(k,16)→E(k,8)
  feel) as the only section allowed ride-density metal.
- **release**: tension curve already falls **[done via gains]**; thin the
  break to its anchors + ghosts only (σ pinned near identity, low w
  override); lead recalls the motif *literally* (transform bag pinned to
  identity — §6.4's "argument" resolving on recall).
- **seam**: as designed (D9) — plus the ambience crossfade **[done]**; the
  seam→intro landing problem (the countdown resolved onto the emptiest
  section) **[done as D18]** — seeded landing/dissolve variants per boundary,
  see `seam_landing_proposal.md` and design_decisions D18.

## Per-biome ambience (D16) **[done — first slice of D12]**

Every track owns a synthesized ambience bed (`TRACKS[i].ambience`), looping
per 4 bars on the ether orbit, loud in ambient sections (intro/breakdown/seam)
and tucked under the full arrangement elsewhere. During seams the incoming
biome's bed crossfades in early — §6.1's "the incoming ether infiltrates
first," now literal:

- **undergrowth → `ambinsects`**: cricket chorus (AM sine trills ~4–5 kHz)
  over a damp low noise floor.
- **forest floor → `ambrain`**: leaf-patter — band-limited noise bed plus
  stochastic droplet transients.
- **canopy → `ambbirds`**: airy band noise with occasional FM chirp
  glissandi.
- **zenith → `ambwind`**: slowly wandering band-passed wind with faint
  detuned shimmer partials.

Each biome also carries two **accent layers** on slow seeded presence walks
(episodes of ~30–50 s, fading in and out per phrase) **[done]**:
undergrowth adds frogs + leaf-rustle, forest floor adds distant thunder +
water drips, canopy adds warbling calls + foliage gusts, zenith adds a
shimmer drone + crystalline sparkle.

Next steps for ambience: tie accent walks to tension (thunder more likely
near the climax); a per-section density *choice* per bed; real
field-recording CC0 replacements when the palette matures (same licensing
rule as the breaks, README §licensing).

## Hats specifically (the fatigue complaint)

- Presence cycling per phrase (full/sparse/off) **[done]**.
- Barlow-weighted accents — velocity follows *inverse* indispensability, so
  hats push against the grid the skeleton holds down (§1.2 applied to
  dynamics) **[done]**.
- Lower base level and a density cap (k ≤ 6, was 7) **[done]**.
- Still open: an open-hat variant sample on the last euclid onset of peak
  phrases; hat *timbre* rotation per track (D12 territory); swing/humanize
  micro-timing from `drift(t)` (§4 — wire the 1/f source into note-level
  nudge once superdough exposes per-event timing offsets).
