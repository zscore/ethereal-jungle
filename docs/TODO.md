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
   ✅ **Emptied a second time, 2026-07-29 — D42.** You called the replacement
   "that floating golden L-system hedge" and asked for it gone, so it is gone,
   along with `src/visuals/motif.js` and its test. Worth recording *what the
   second failure taught*, since the first one bought us three constraints and
   this one buys a fourth: the growth met all three of D28's demands by
   construction and still read as an object stuck in front of the camera. So the
   missing constraint is **placement** — a figure that hangs at a fixed offset
   from the lens for a whole section reads as an overlay however it is drawn.
   The slot is open again and should stay open until someone has a form that
   lives *somewhere in the world* and gets approached. See item 19.
   The D40 write-up is kept below for that reason.
   👁 ~~**The slot is filled again — needs your eye. D40.**~~ Not another drawing:
   `src/visuals/motif.js` grows the figure from a **rule**, and each of D28's
   three constraints is answered by construction rather than by taste.
   - **It is the music's cell.** The same eight notes as `MOTIF` in
     `generators.js`, wearing four of the music's own five transforms — one per
     track, and no two tracks ever get the same one on any seed. The visuals
     still import nothing from the music, so the two copies are bound by a test
     that fails if they ever drift.
   - **Depth is zoom, not a redraw.** Segments come out breadth-first, so
     growing it one level deeper never moves a line that was already there. That
     is what lets the same figure be 2.5× among the litter and 9× over the
     canopy — D28's own two numbers, spent as the costume's extremes — with two
     more generations of the rule resolved at the big end.
   - **It grows in, trunk first**, over about four seconds, and it is drawn by
     revealing a prefix of one buffer. It takes no event and never will: the
     test walks it at 100 Hz for 40 s and the largest step it makes is 0.003
     world units, which is a stronger statement than "we didn't call it from the
     drum handler".
   - **What has NOT been checked is the only thing that killed the last one:
     whether it looks good, in motion.** The stills are in `shots/` —
     `form-small` (undergrowth) and `form-vast` (canopy). Jump to it with the
     transport: any track, then the `peak` button. If it reads as a plant the
     branch angle is one constant; if it reads as clip-art it should go the way
     of the moth and the slot reopens, which is what D28 was written to allow.
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
13. ~~remove the unpleasant high ring from the zenith~~
    ✅ **found by measurement, not by guessing — D33/D34.** It was the **glass
    bowl**. Its FM ratio is 2.76, so a carrier at 590 Hz throws a sideband at
    2219 Hz and one at 1330 Hz throws 5001 Hz — and both showed up in a
    recording of the zenith breakdown as narrowband peaks that were *still up*
    in the quietest frame. Muting the bowl dropped every one of them to −65 dB
    or below, which is the A/B that settles it.
    - The bowl was the only voice in the set with **no filter of any kind**,
      playing inharmonic partials two octaves up into a twelve-second reverb
      with a seven-second release.
    - Fixed four ways, because each does something different: an octave down,
      the FM index cut from 1.6 to 0.7 (that is what governs how many sidebands
      exist), a low-pass at 2200 Hz, and a shorter tail so two strikes cannot
      overlap into a drone. The zenith's pluck got a ceiling too — same shape of
      problem, one level quieter.
    - After: worst persistent peak −65 dB (was −1.0), and the 4–8 kHz share of
      the mix fell from 2.5% to 0.6%, with the bowl still audibly there. If it
      now reads as too dark, `lpf` and `oct` in `TRACKS[3].palette.bowl` are the
      two knobs.
14. ~~add a bit more reverb to the toucan in canopy to make it more cooler~~
    ✅ **done — and it turned up a real bug (D35).** The send went from 0.5 to
    0.82, the wettest thing on that orbit.
    - The bug: `roomsize` is a property of the **orbit**, not of the event —
      superdough keeps one reverb per orbit and rebuilds its impulse response
      whenever an event asks for a different size. Every track was asking for
      two or three sizes on the same orbit (the canopy's ether alternated 8, 9
      and 11 about five hundred times a track), so the engine was regenerating
      up to twelve seconds of noise over and over, and the reverb tail depended
      on whichever layer had spoken last.
    - So the room is now cast data: `TRACKS[i].rooms = { 1, 3, 4 }`, and
      instruments keep only their send. The set walks from a close, low
      undergrowth (2 / 7 / 6) through a big bright canopy (3 / 11 / 7) to a
      zenith that drowns even its drums (9 / 12 / 9). `test/palette.mjs` fails
      if any orbit is ever asked for two sizes again.
15. ~~can you turn the seams into a wind-down instead of a build-up since it's
    going back to the intro of the next track~~
    ✅ **done — D36, and you were right about why.** The seam built to 0.95
    tension and then handed over to eight bars of ether with a bare kick in it:
    the loudest moment of every boundary was immediately followed by its
    quietest.
    - **The curve first.** `bus.tensionAt` now drains through the early phase to
      a trough and settles onto the incoming track's opening tension. The
      visuals never learn about any of this — they read the same function, so
      the camera winds down with the music for free.
    - **Then everything that follows tension:** the exit *loses* wildness
      instead of gaining it, the break fades bar by bar and degrades further,
      the hats got an `ebb` mode that falls and closes (9000 → 2500 Hz) where
      they used to climb, and the fill bag decelerates — dense first bar,
      thinning after it, still uneven, still leaving the hole.
    - **The landing survives, softer.** Both flavors descend now; what separates
      them is that a landing still arrives on something (a halved impact, the
      root pedal, the visual dolly zoom) and a dissolve arrives on nothing.
    - Measured: −11.4 dB falling continuously to −18 dB across the boundary,
      no cliff.
16. ~~in the undergrowth it would be good to also add a bit of dark sparkle to
    the ambience thanks~~
    ✅ **done — D37.** A fourth layer, `ambglint`: water dripping inside an
    ice-filled lava tube (PDM, same rule as every other bed).
    - The first source tried was resonating drains under a shaded path — perfect
      on paper, and it measured 37% of its energy below 150 Hz with a 3.9 dB
      crest. Dark, but a wash. The ice cave measures 83% above 800 Hz, a 9.8 dB
      crest and **15 countable events per loop**: glints rather than texture.
    - "Dark" is then the mix, not the recording: everything below 420 Hz gone,
      the fizz above 5 kHz rolled off, sat under the frogs and the rustle, and
      given the undergrowth's own room so each drip rings instead of ticking.
      Per-layer treatment is new — `ambienceMix.layers` — and this is the only
      layer in the set that uses it.

**New in this pass, and the reason 13 could be answered at all: the project can
now listen to itself.** `node tools/spectrum_probe.mjs --track=3
--section=breakdown` boots the engine headless, records the master output and
reports what is ringing, where the energy sits, and whether a passage rises or
falls. `--mute=bowl` A/Bs a cast member out of the mix. It records `lab.html`
(no scene) because the renderer starves the audio thread badly enough to punch
multi-second holes of digital silence into a recording — the analyser now counts
those and says so, since a starved recording reads exactly like an arrangement
that stopped.
  
17. ~~can you make three more unique seam variations? don't make them all those
    snare drum things~~
    🎧 **candidates landed — needs your ear. D38.** The three are not snares,
    and the point of the entry is that they are not even *drums*: the bag went
    from four figures to four **materials**, one of which happens to be a snare.
    - **the tape stop** — the track's own break, decelerating. Per-bar `speed`
      falls 1 → 0.38, so the last bar is five semitones down and two and a half
      times too slow: a machine being switched off rather than a drummer playing
      quieter. Nothing else in the set automates `speed` over time.
    - **the descent** — pitched. A line falling through the mode to the root, in
      the register between the bass and the pad that the late seam has just
      emptied. Four notes, two, one, one — the rhythm decelerates with it.
    - **the downpour** — the outgoing biome's own texture, chopped onto the grid
      and let go, so the undergrowth leaves through its drips and the zenith
      through its sparkle. It takes each biome's *last* ambience layer on
      purpose: in all four that is the texture and the middle ones are the
      creatures, and D31 already proved what gating a bird onto a 16th grid
      sounds like.
    - **The deal rotates rather than draws**, which matters more than the
      figures. The first cut just added three fills to the bag, and on the
      default seed that dealt snare rolls to three of the four boundaries — your
      complaint arriving again by luck. Now `toIndex` walks the four material
      classes from a seed-chosen offset, so **no two boundaries in a set are
      made of the same thing, on any seed**; the seed still decides where the
      rotation starts and which snare figure it is.
    - **The dissolve lost its private figure** (a change you should veto if you
      disagree): both flavors draw from the one bag now and the dissolve is a
      *treatment* on top — quieter, darker, drowning further. D36 had already
      made both flavors wind down, so the figure was no longer what separated
      them. With two bags, half the boundaries would never have heard any of
      this. The old dissolve figure is still in the bag as *the withdrawal*, at
      levels that put it back exactly where D18 had it.
    - **Measured, not auditioned.** `--seam=3` (the descent) falls −12.6 →
      −15.7 dB and `--seam=2` (the tape stop) −9.4 → −16.1 dB, both continuous,
      no cliff. But the probe's frames are 0.5 s and the hole is a 16th, so it
      *structurally cannot* tell you whether the tape stop smears — at 0.38× a
      slice plays 0.235 s, and the arithmetic says the last one ends a full
      second before the downbeat, which is an argument rather than evidence.
      That one is for your ears. Jump to it with the transport: track 3, then
      the `seam` section button.

18. ~~implement the rest of the visual stuff — anything that's left over~~
    👁 **the leftovers are done — needs your eye. D40 and D41.** The three
    proposal docs (tiers A–E, F–J, K–M) were all shipped and D39 had just
    rebuilt the world as one forest, so "left over" was a short and specific
    list. The big one is item 9 above (the recurring form). The other three:
    - **The world has a resting aperture now.** K5 hung leaves 3 units from the
      lens and they had rendered *sharp* the whole time, because the
      depth-of-field pass idled at "off" and only woke when a hand touched the
      rail — the pizzaz doc listed this under *what is not done* and called it a
      decision rather than a bug. It is: the focal plane now sits on the trunks
      (~26 units) so the leaf at the lens is a smear, which is what a forest at
      eye level actually looks like. It is spent **only where there is a near
      field** — above the last leaf nothing is within 40 units of the camera,
      the focal length goes back to exactly what it was, and the top band keeps
      the horizon D39 built it for. If the understory now reads as too soft,
      `APERTURE_REST` in `look.js` is the one number.
    - **The fireflies stopped being quadratic.** A spatial hash, one cell per
      interaction radius, rebuilt each frame in preallocated arrays. The boid
      rules are untouched and every candidate faces the same radius test, so it
      is the same swarm — about a twentieth of the distance tests.
    - **Two lights that lit nothing are gone.** Every material in this world is
      `MeshBasicMaterial`, which is unlit by definition, so the
      `DirectionalLight` and `AmbientLight` had never reached a pixel — and the
      frame loop was spending three lines a frame moving one of them. D39
      spotted this and declined to fix it. The one job they were really doing
      has an heir: a lightning strike used to set that light's position from the
      bearing the storm chose, and that bearing now moves the **god-ray origin**
      instead, so a strike comes *from* somewhere for the first time.
    - **Still not done, and not fixable from here:** none of this has been seen
      on **WebGPU** by a human eye. The headless chromium on this machine loses
      the WebGPU device a few seconds into every run — it does that on a
      baseline predating all the visual work too, so it is the environment — and
      the style tier and now the aperture have only ever been photographed on
      the software rasterizer. Open it in a real browser window before trusting
      appearance or frame rate there.19. ~~remove some of the visual elements: the rectangular TV screen at the
    beginning, the spiky black thing that just sits in the foreground, and that
    floating golden L-system hedge~~
    ✅ **done 2026-07-29 — all three deleted, not gated. D42.**
    - **The TV screen** was the **corpus shrine** (D25): a plane in the
      undergrowth playing back the world's own last bar, chopped by the break's
      own σ-permutation. The idea was that the visuals should quote themselves
      the way the music does; what it looks like is a monitor propped up in the
      litter, and the quotation isn't legible at the size the frame gives it.
      `src/visuals/shrine.js` is gone, and with it `?shrine=0`, the governor
      tier and the `shrine` screenshot. The σ machinery in `bus.js` — which the
      *break* uses — is untouched.
    - **The spiky black thing** was K5's **fronds**: three dark leaf
      silhouettes parented to the camera, framing three corners, swaying on the
      shared wind. They were the near end of the parallax gradient, and they
      were also in the same corners forever, which is why they read as dirt on
      the lens. **The near-field dust stays** — same job, but it wraps around
      the camera and moves *past* you, which is the part that says you are
      inside something.
    - **The hedge** was the recurring form — see item 9 for what its removal
      taught, which is the useful part.
    - **What this costs:** roadmap items 4 and 6 in `scene_plan.md` go back to
      open, and the visual set now has no self-quotation and no recurring form.
      §5 says both are what turn four tracks into an argument, so that is a real
      loss taken deliberately. Both slots are better empty than filled with what
      was in them.
    - **Unchanged on purpose:** `nearFieldAt` and the D41 resting aperture. The
      curve describes the world's near *content* — trunks, undergrowth, dust —
      and the fronds were one item of it, not its definition.

---

## 7. The sloth needs a human eye, in motion (opened 2026-07-29, D45)

The four creature systems and the sky (D44–D46) are built, tested and
photographed, and every one of them reads in a still frame at the altitude it
belongs to. One is not settled.

**The question.** Does the sloth read as an *animal*, or as a shape hanging
under a bar? A still frame cannot answer it: what is supposed to sell it is the
gait — a ~60 s limb cycle that gets *slower* at high tension, on the argument
that the one creature in the set that refuses to hurry is a joke worth making —
and nobody has watched it move.

**Why this is worth flagging rather than assuming.** There are two precedents in
this repo for a figure that met every stated constraint and still had to be
removed by eye: D28 (the moth) and D40/D42 (the recurring form). Both were
argued for, both were built, neither survived being looked at. The sloth's four
screenshot passes (D45) fixed *visibility* — it was literally invisible twice,
for two different reasons — which is not the same as legibility.

**If it fails**, the fallback is already written down in
`visuals_fauna_proposal.md` §Open decisions #3, and it is the more interesting
option anyway: **motion-only.** The animal is a disturbance you infer from what
moves rather than a body you see, which is exactly what `ambrustle` — the
undergrowth's third ambience layer — is doing in the audio with no picture in
front of it.

**How to look:** `npm run dev`, then in the console
`jungle.visuals.setAltitude(0.18, true)` and watch for a minute. The reach is
slow on purpose; `jungle.bus.params.tensionManual = 1` with `tensionMix = 1`
should make it slower, not faster, and if that reads as a bug rather than as a
joke then the joke does not work.

## 8. Frame cost on real hardware is still unmeasured (opened 2026-07-29)

Inherited from the pizzaz pass and now more pointed. V1's cloud field adds ~180
camera-facing billboards that the camera flies *through*, and the whole pass was
developed against swiftshader where the governor already sits near the bottom of
its ladder. The clouds are the governor's **top** rung (Y2), so the designed
failure mode is "the sky thins out" rather than "the groove drops" — but nobody
has confirmed the governor actually sheds them in time on a real GPU, and
`quality` sat at 0.8 for the whole headless sweep, which tells you nothing.

Same note as before applies to WebGPU: the chain compiles and boots there, and
that is all the harness certifies.

## 9. The dev server re-inits the UI mid-sweep (opened 2026-07-29, minor)

Observed while photographing D44–D46, not caused by it. The transport in the
later frames of a `visual_check` run shows **each track and section button
twice** — `initUI` appends without clearing and is called once from `main.js`,
so seeing doubles means the module was evaluated twice against the same DOM.

The cause is the docs plugin: it regenerates `docs/api/index.html` at dev-server
start, vite's watcher sees the write, and hot-updates the client. Harmless to
the shots (`errors: none`, the bus keeps running, and the world renders
correctly in every frame), and invisible in `npm run build`. Worth fixing at
some point in one of two places — have the docs plugin write outside the watched
tree or mark it `hmr: false`, or have `initUI` clear `#tracks`/`#sections`
before it fills them. The second is one line and would make the symptom
impossible regardless of what triggers a re-init.

## 10. `isolate()` does not work on anything that writes its own visibility (opened 2026-07-29, minor)

Found while A/B-ing the material change. `world.isolate(name)` sets
`group.visible` on every biome, but the creature systems — and the fireflies
before them — write `group.visible = presence > 0.01` on **every frame**, so
they reappear on the next tick and an "isolated" shot quietly contains them.
That cost real time during D47: an isolated-forest comparison was actually a
forest-plus-sloths comparison, and the sloths were the thing that had gone
wrong.

Fix is small — have `isolate` set a latch the per-frame writes respect
(`visible = wanted && presence > 0.01`), the way `setVisible` used to for the
fronds. Worth doing before the next visual A/B rather than after it.

## 11. `faceDirection` is not trusted on this backend (opened 2026-07-29, D47)

The birds and the soarer were the only two materials in the world using TSL's
`faceDirection` to flip a double-sided normal, and they were the only two that
came back white. Dropped rather than debugged, because a bird seen from tens of
units away does not need a face-corrected normal — but that means **nothing in
this project currently exercises `faceDirection`**, and anything that wants
genuinely two-sided shading later (leaves lit from behind is the obvious one)
should expect to have to establish whether it works here first, on both
backends, before designing around it.

