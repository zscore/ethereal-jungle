# Open issues

Known problems and loose ends, newest concerns first. Not a roadmap — this is
the list of things that are *wrong or stale right now*. Delete entries as they
land; if something turns into a real decision, it graduates to
`design_decisions.md` and leaves here.

Status as of 2026-07-28, on `main` @ `d36f92f`.

---

## 1. ~~The ADR log has duplicate numbers~~ ✅ resolved 2026-07-27

The four visuals-branch entries were renumbered into the next free slots —
look module → **D24**, corpus shrine → **D25**, biome beds → **D26**, one
atmosphere → **D27** — each keeping its original number in a note under the
heading. The perform-branch D19–D21 were left alone, and D22/D23 were left
alone too: renumbering those would have churned 55 references that were
already correct and unambiguous, buying only monotonic ordering.

Two things this entry got wrong, recorded because the next audit will hit the
same trap. The real count was **152 reference lines across 25 files**, not
~19 — it omitted the docs and the knock-on cost of moving D22/D23. And its
disambiguation table misattributed sites: `src/visuals/look.js:15,40` and
`test/look.mjs:59` were listed as the corpus shrine, but all three actually
read "the two filter dials" and needed no change. Every site was reclassified
from its own text.

The prevention note (assign the next `D` at merge time, not on the branch) has
graduated to the header of `design_decisions.md`.

## 2. ~~Two ADR statuses are stale~~ ✅ statuses fixed; one listening call left

- **D12** — retitled and marked delivered as part of D22. Verified against the
  code first, not taken from D22's word: `TRACKS[i].palette` carries the break
  costume, hat character, bass kind, pad width and lead patch, and the
  licensing caveat D12 raised for itself is resolved (every sound a palette
  names ships in this repo). `README.md` had also listed D12 as still open —
  fixed.
- **D13** — status corrected: the "deferred until D11 + D12 land" gate has been
  passed, and the entry now records that D22 and D23 have since attacked the
  same "tracks blur together" complaint from two other directions. **The
  decision itself is still open, and deliberately needs ears rather than
  analysis** — see §5, which wants the same listening pass. If nothing sounds
  blurred once warmth, tuning, cast and groove are all per-track, D13 closes on
  purpose instead of by default.

## 3. ~~There is no remote~~ — backed up; CI and deploy still open

**Done 2026-07-27:** `origin` is `git@github.com:zscore/ethereal-jungle` (private,
SSH). `main` and the `pre-d23-main` tag are pushed; full history including
`docs/` now exists off-disk.

**Still open**, in order:

- **CI running the gate on push** — `npm test && npm run build && npm run smoke`.
  Blocked on §4: `smoke.mjs` is flaky, and a flaky gate is worse than no gate.
- **Tags driving a static deploy** — plain Vite build, so Pages / Netlify /
  Vercel is a single config file. Only then does "production" mean anything
  more than a local `dist/`.

## 4. ~~The smoke test is flaky~~ ✅ rewritten 2026-07-27

**The diagnosis in this entry was wrong.** It read the `element was detached
from the DOM` message as a click race during page load. Instrumenting the page
showed no reload at all (`navigations: 1` every run) — instead the JS main
thread was stalling for 8+ seconds at a time, continuously, for over a minute.
`--use-gl=swiftshader` is a *software* rasterizer, so the renderer competes for
CPU with everything else on the box. Under load, `DOMContentLoaded` arrived at
15 s and Playwright simply could not get a thread slot.

So the real defect was that **every wait was a fixed sleep** — `waitForTimeout(2500)`
then click, `waitForTimeout(25000)` then measure. Those are bets on machine
speed, and they lose whenever the machine is busy. That is the "1 in 4".

What the rewrite changed:

- **No step waits for a duration.** Boot waits for `window.jungle.bus`; sound
  waits for the first `hap`. Deliberately not `load` or `networkidle` — the page
  pulls ~7 MB of ogg and then keeps streaming, so neither ever settles cleanly.
- **The click escalates.** A real click twice (it proves the overlay is visible
  and hit-testable), then a dispatched click, which needs one main-thread slot
  instead of many. The output records which one worked, because a run that
  needed the fallback is telling you the machine was too loaded to trust.
- **It asserts what it exists to prove.** The old script exited on console
  errors alone and merely *printed* `overlayHidden` and the event counts — a
  page that booted and made no sound passed the gate. It now fails on a silent
  page.
- **It counts cumulatively, not in a window.** This was a second real defect,
  present in the old script too and worth understanding: `bus.js` publishes
  "ahead of time", so the scheduler emits a burst per phrase and then goes
  quiet. A fixed 5 s sample can land wholly inside a gap and report silence for
  a perfectly healthy engine — observed on 3 of 3 runs, each with a logged
  `first hap` proving sound was flowing. One persistent subscription from the
  moment audio starts cannot miss a burst. The old 25 s pre-wait only ever
  hid this by making a hit more likely.
- **It survives a mid-run reload.** Vite re-optimizes its dependency cache when
  the config changes and does a full page reload to pick it up — which wipes the
  in-page accumulator and stops the audio. The first version of this rewrite
  guarded the *click* against that and then crashed on the *measurement*
  (`Cannot read properties of undefined`). Start-and-measure is now one
  retryable unit, and the sound predicate also resolves on the accumulator
  vanishing, so a reload is caught in seconds rather than burning the full
  120 s timeout.
- **It prints the load average** and warns when the box is too busy, so the next
  slow run diagnoses itself instead of looking like a product bug.

Verified: **7 of 7 consecutive passes** at load averages from 8.3 to 31.8 on 10
CPUs — conditions well past those that produced the original 1-in-4 failure, and
where the previous script failed outright. Runtime scales with the machine:
~26 s when it is merely busy, ~160–240 s when a game is eating three cores.

**Note for CI:** a hosted runner is usually 2 vCPUs, which is *worse* than the
loaded laptop this was fixed on. Expect a slow run there, and prefer a runner
with 4+ cores. If it proves too slow, the honest fix is a way to boot the
engine without the scene, not shorter timeouts.

Why this mattered more than it looked: `npm test` asserts pattern-level design
claims but never instantiates audio. `smoke.mjs` is the only check that proves
the page boots and actually makes sound. For a generative audio piece those are
genuinely different questions.

## 5. The D23 groove placements are unverified by ear

`KICK_EXTRAS` / `SNARE_GHOSTS` in `src/music/generators.js` and the per-track
`kick.extras` / `snare.ghosts` densities in `bus.js` were chosen from idiom, not
from listening. `test/groove.mjs` proves the figures *vary* and that the anchors
never move — it says nothing about whether they sound good.

These are the easiest thing in the system to tune by ear; the bags are plain
data. Listen through a full set and adjust before treating the numbers as
settled.

**A bench for it now exists: `lab.html`.** Run `npm run dev` and open
`/lab.html`. It boots the real engine — same generators, same casts, same
seeded draw — with **no scene**, which is why it starts in ~3 s instead of the
main app's ~2 min under software rendering. Pick a bag for the kick extras and
one for the snare ghosts, hear them in the actual arrangement, mark each
pairing, and copy the summary out.

- Five candidates per instrument: **shipped** (today's idiom), **sparse**,
  **busy**, **pushed** (everything on the "a" before the beat) and **laid back**
  (everything just after it). Pushed vs laid back is the real question — the
  shipped bag mixes both, which may be why nothing has a clear feel.
- `GROOVE_BAGS` in `generators.js` is the swap point. Production reads the same
  reference but never writes it; `test/groove.mjs` still asserts the defaults.
- **Force density** is on by default: shipped densities × the intro's 0.2 lift
  means most phrases draw nothing, which is correct musically and useless for
  auditioning. Turn it off to hear the real hit rate.
- Verdicts persist in localStorage, so the tab can be closed mid-session.

**First verdicts are in, and applied — see D29.** The bag is now part of the
cast (`TRACKS[i].palette.kick.bag` / `.snare.bag`), because the two verdicts
contradicted each other in the most useful possible way:

| track | kick | snare | from |
|---|---|---|---|
| undergrowth | `shipped` | `shipped` | not yet auditioned |
| forest floor | `shipped` | `shipped` | not yet auditioned |
| **canopy** | `pushed` | `busy` | *"this was nice on canopy"* |
| **zenith** | `sparse` | `sparse` | *"nice letting everything breathe"* |

Sparse is the opposite of busy, so there was never going to be one winning bag
— which is D22's per-track-cast argument arriving from the listening side
instead of the theory side.

**Still open:** `undergrowth` and `forest floor`, both still on `shipped`. Two
pairings of twenty per track have been heard, so this is a first pass and not a
settled floor. The lab now defaults to a **per-track cast** option that plays
what actually ships, so applied verdicts can be checked in place.

## 6. Housekeeping

- Tag `pre-d23-main` (at `4d711e5`) is the pre-merge safety net for the D22/D23
  merge. **Safe to delete now** — `4d711e5` is an ancestor of `main`, so the tag
  is only a pointer and no commits depend on it. It is also pushed, so it exists
  in two places. Confidence criteria are met: `npm test`, `npm run build` and
  `npm run smoke` all pass well past `e5d5f78`. Needs a hand to run, since
  deleting a remote tag is destructive:

      git tag -d pre-d23-main
      git push origin :refs/tags/pre-d23-main

  To restore either one: `git tag pre-d23-main 4d711e5`.
- Branch hygiene going forward: short-lived topic branches off `main`, merged
  and deleted promptly. `main` is staging; production is a tag that only ever
  moves forward to a commit that passed `npm test && npm run build && npm run smoke`.
]
7. ~~the chords in the background are just constant for a lot of the time in the
   first couple section and need some effects and some motion between notes.~~
   🎧 **candidate landed — needs your ear.** Two changes in the pad block of
   `generators.js`, both scaled by a new `PAD_MOTION` table that is *inverted
   against density*: the bare early sections get the most movement (intro 1.0,
   build 0.9) and the full ones the least (peak 0.25), because a wandering pad
   under a full arrangement is just mud.
   - **Effects motion:** the filter now breathes across the phrase instead of
     sitting on one cutoff, and the pad drifts in the stereo field. Deliberately
     asymmetric — an even in-out is its own kind of static.
   - **Motion between notes:** the block chord *stays* a block, because it is
     the common tone across the seam (§6.1) and cannot start arpeggiating. The
     movement goes to a separate quiet voice an octave up, walking the same
     chord tones one at a time — same harmony, but something is audibly moving.
     Only present where `PAD_MOTION > 0.5`, i.e. the sections you complained
     about.
8. ~~that drum rolls filter is a bit overwhelming; maybe it needs probabilities
   of adding the rolls too?~~
   🎧 **candidate landed — needs your ear.** The roll knob answered only "how
   fine" and then stuttered *every* drum hit in *every* bar for as long as it
   was up, which is a wall rather than a gesture. It now also chooses **how much
   of the phrase rolls** (`ROLL_BAR_MASKS` in `perform.js`): ×2 takes the
   turnaround bar only, so it reads as a fill; ×3 takes every other bar; ×4 is
   still the full wall, for when you actually want it.
   I used a per-bar mask rather than literal probability — same musical effect,
   but deterministic, so a set is reproducible from its seed and `test/roll.mjs`
   can assert it. Say the word if you'd rather it were genuinely random.
9. ~~the butterfly visualization thing looks stupid and should be removed~~
   ✅ **done 2026-07-27 — it was a moth, and it is gone.** The "butterfly" was
   the recurring glyph (proposal B2) in `src/visuals/figure.js`: a long-tailed
   moth drawn as hand-placed line segments, shown in each track's `peak`
   section. Removed along with its `scene.js` call and its `visual_check.mjs`
   screenshot. The rest of the figure stream (kick rings, snare shards) is
   untouched — that is B1, and it is what carries rhythm.
   Recorded as **D28**, not deleted silently, because `visualizer_theory.md` §5
   argues the *slot* is load-bearing: the set's single melodic cell wants a
   visual sibling. The slot is now empty and stays open. D28 lists the three
   constraints a replacement has to clear, the first being that it must read at
   both 2.5× and 9× — which a literal creature outline never did.
10. ~~that fill going into the seam is very cheesy and should be a bit better~~
    🎧 **candidate landed — needs your ear.** The countdown was
    `sd sd*2 sd*4 sd*8` under a rising gain ramp: a pure power-of-two doubling,
    the stock build in dance music. Three things were wrong and `SEAM_FILLS` in
    `generators.js` fixes all three.
    - **It doubled cleanly**, so the ear predicted the whole figure from its
      first two bars. The replacements accelerate unevenly — triplet groupings
      and syncopations — so the arrival is still a surprise.
    - **It ran solid into the downbeat.** Two of the three new figures stop
      early: the hole is what makes the drop land. `test/seams.mjs` now asserts
      the last 16th before the boundary is empty.
    - **It was identical every seam** for eleven minutes. The figure is now
      keyed to the track being entered, mixed with the seed, so the set varies
      and a reroll re-deals it. Three to hear: *the hole*, *the drag*,
      *restraint*. The dissolve variant (D18) got the same treatment with its
      energy still inverted.
    Fills also wear the track's own snare costume now, instead of a bare `sd`.


11. ~~can you replace the birds in the canopy one that sound like seagulls with
    jungle style birds and also have like some toucan toms as an instrument
    pitch shift them and process them so you can make multiple toms~~
    🎧 **candidates landed — needs your ear.** Two changes, recorded as **D30**
    and **D31**.
    - **The birds are Amazonian now.** The gull was a coastal Breton blackbird
      (`ambcalls`) over an Indiana dawn chorus (`ambbirds`) — a temperate
      woodland, which is what it sounded like. The canopy is now a Tambopata
      rainforest bed under two screaming pihas from Tauary. Same rule as D26:
      *radio aporee ::: maps*, Public Domain Mark, credited in
      `tools/amb_sources.json`; the retired sources move to `alternates` rather
      than being deleted, since they shipped. The piha also gets heard: on this
      seed it cleared the presence threshold in only 6 of the canopy's 17
      phrases, so `ambienceMix` is now cast data and the canopy names one.
    - **The toms were built, heard, and reversed** — your verdict was
      "horrendous", and it was right: `speed` is varispeed, so dragging a
      1450 Hz croak down to 220 Hz takes the formants with it and you get a
      growl rather than a drum with a bird's timbre. **D31 is reversed by
      D32**; `tomLayer` and the whole kit are gone.
    - **What replaced it: the squawk** — `TRACKS[2].palette.squawk`. The same
      three croaks (`tools/ingest_toms.py`, PD), but *as a bird*: one call
      every two phrases, near its own pitch (0.86–1.18), never on a beat,
      drowned and on the ether orbit. Because it is weather rather than
      percussion it keeps calling through the intro and the breakdown, and
      leaves at the late seam with the rest of the cast. Knobs in `bus.js`:
      `every` (busier canopy), `gain` (nearer bird), `speeds`.
    - **What has still NOT been verified by ear:** the four recordings. They
      were chosen from title, description, license and a spectral profile — the
      piha window has a 12 dB crest (isolated calls over a quiet bed), the
      Petén window 1.2 dB (a stationary insect wall). That is evidence about
      shape, not about whether it sounds good. If the piha reads as a car alarm
      at the climax, `alternates.ambcalls` holds a vetted second Amazonian
      candidate (a Crested Oropendola's metallic gurgle).
12. ~~please add more frogs and jungle insect noise in the ground floor, can
    also add in a bit of rustling ambience too~~
    🎧 **candidate landed — needs your ear.** The undergrowth (**D30**). Two
    things were wrong and they compounded: the frogs were Mediterranean marsh
    frogs and the insects a Californian garden — neither had been to a jungle —
    and both were *accent* layers resting below a 0.35 presence threshold, so
    they surfaced in about two phrases out of three and quietly.
    - New sources: night amazon frogs (Yarinacocha, Peru — the deep Neotropical
      bullfrog "whoop" is the one you will notice) and rainforest by night from
      a Maya pyramid in Petén for the always-on insect bed.
    - `ambienceMix` on the undergrowth alone. The first pass
      (`{ bed: 1.3, accent: 1.5, threshold: 0.15 }`) was too loud; it is now
      **`{ bed: 1.15, accent: 1.2, threshold: 0.25 }`** — halfway back to the
      default on every field, per "somewhere in the middle". The frogs are
      still in **16 of the track's 17 phrases** (13 at the default) and the
      rustle in 14, but they sit under the arrangement rather than on it. The
      other biomes name no mix and are bit-identical — the forest floor's
      thunder is *meant* to be rare.
    - The rustle keeps its recording (dry leaves, Kaunas). It is a leaf texture
      rather than a place, it reads correctly under the floor, and no
      public-domain tropical-foliage recording in the collection beat it. Say
      the word and it can be re-sourced. 