# Seam → intro landing proposal

> **Status: implemented as D18** (Option D — seeded variants, which folds in
> A+B as the 'landing' flavor and C as the 'dissolve' flavor). See
> design_decisions.md D18; verified in test/seams.mjs.

## The problem

The seam's exit grammar is §5's countdown: early phase intensifies A's drums
(`wEff + 0.25`), the hats become a riser, `tensionAt` spikes toward 0.95, and
the late phase plays an accelerating snare roll (`[sd sd*2 sd*4 sd*8]`,
gain rising to 0.88) — a gesture whose entire theoretical job is to make the
arrival time maximally predictable *and promise a payoff*. §6.3 spells the
promise out: `clean_downbeat(B)` is annotated "§5: the payoff lands on
silence's far side," and §5 says "every seam in a set is a small drop."

But D11's form starts **every** track at `intro` — kick heartbeat + ether,
the lowest-energy section of the whole layout — and `tensionAt` falls off a
cliff at the boundary (≈0.95 → the incoming floor, 0.05–0.20). So the
countdown resolves onto the emptiest 8 bars in the set. §5's pre-drop denial
works at one-bar scale (the dropout bar); ~11 s of ambience after a full
countdown doesn't read as denial, it reads as a wrong cue. The spec and the
form are in collision: the seam promises a drop, the section layout schedules
a void.

Two coherent resolutions exist, and they're duals:

1. **Deliver the payoff** — make bar 0 of the new track an *event*, then let
   the intro be its aftermath.
2. **Withdraw the promise** — reshape the seam exit into a dissolve, so an
   ambient arrival is what the gesture prepared all along.

The options below are ordered by audibility-per-effort; A+B is the
recommended first move, C/D are follow-ons.

## Option A — the arrival hit (smallest change, biggest fix)

One bar of punctuation at `barInTrack === 0` of every track:

- a single slammed kick (full `anchorStrength`, sidechain pumping hard
  against the loud ambience bed — the duck itself becomes the landing
  gesture, in both media),
- a low root pedal (whole note, incoming mode's root, octave 1–2), and
- an impact tail: a synthesized crash/boom with a long reverb tail
  (`ambimpact` in `tools/gen_samples.py`, or the incoming bed retriggered
  with a fast attack and high gain that decays over the bar).

The countdown then functions as a *fill into a downbeat* rather than a riser
into nothing, and the intro's emptiness reads as space after an impact —
aftermath, not absence. This makes `clean_downbeat(B)` literal, and satisfies
§5's payoff in miniature: maximum stream contrast is one hit against silence.

## Option B — intro as decay, not void

Differentiate the intro's first phrase after a seam (`sec === 'intro' &&
phraseInSection === 0`):

- kick heartbeat at full anchor strength (not the tension-scaled ~0.5),
- the one-note bass pedal from the section_ideas backlog (root, whole
  notes) — the floor as *promise*,
- ambience bed at full gain,

then thin to the current pure intro over phrase 1. The intro becomes a
diminuendo from the landing instead of a flat low state — the same shape as
the breakdown but entered from above. Pairs with A: A is the transient, B is
its envelope.

## Option C — the dissolve seam (withdraw the promise)

Invert the late-phase roll's dynamics: keep the rhythmic acceleration but
kill the energy — gain *falls* across the bars (`[0.8 → 0.4]`), lpf closes,
wet rises (`room` toward 0.9) so the roll recedes into weather (§3.4's
artifact aesthetic — the drums heard as atmosphere as they leave). And shape
`tensionAt` so the late seam phase ramps *down* toward the incoming floor
instead of spiking through the boundary — removing the cliff both media
currently see.

Trade-off: this abandons "every seam is a small drop"; seams become exhales.
As the *only* behavior it would flatten the set (four identical exhales), but
as one voice in Option D it's the strongest contrast available.

## Option D — seeded seam variants (§5: predictable time, withheld content)

The same move already proposed for the peak's drop variants: each seam picks
per (set seed, track index) between

- **(a) the landing** — A+B: countdown → hit → decay, and
- **(b) the dissolve** — C: unwinding roll → ambient arrival,

so every boundary arrives at the same predictable instant but with withheld
content. Over a looping set this is the difference between a trick heard four
times and a form heard once.

## The tension cliff (applies regardless of option)

`tensionAt`'s boundary discontinuity (spike → floor) is currently visible to
both media. Under A the cliff is *covered* by an event (the visuals get the
impact + duck at the same instant, per the bus contract). Under C it's
*smoothed* (late phase lerps toward the incoming floor). Either is fine;
leaving it uncovered and unsmoothed is what currently makes the boundary feel
like a dropout in the visuals too.

## Implementation sketch

- `src/music/generators.js` — seam-late branch (~line 266): roll variant
  selection (D); `buildArrangement` layer gating (~lines 229–235): arrival
  phrase for intro (B); new one-bar landing layer keyed to
  `barInTrack === 0` (A).
- `src/bus.js` — `tensionAt` (~line 276): late-phase shaping (C / cliff
  smoothing); expose the seam variant choice on the bus so visuals can read
  it.
- `tools/gen_samples.py` — `ambimpact` (filtered noise burst + pitched boom,
  long tail), same synthesis discipline as the D16 beds.
- `test/seams.mjs` — assert the landing bar emits its events sample-exactly
  on the boundary downbeat, and that variant selection is deterministic per
  seed.

Note on the set loop: the set wraps zenith → undergrowth, so even "track 0's
intro" follows a seam. There is no boundary where the pure cold-open intro
survives unless the transport seeks to bar 0 — which is exactly where the
current pure intro belongs, and it can stay the behavior for a fresh start
(`bus.now() < one phrase` or an explicit seek target).
