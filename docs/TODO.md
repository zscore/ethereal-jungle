# Open issues

Known problems and loose ends, newest concerns first. Not a roadmap — this is
the list of things that are *wrong or stale right now*. Delete entries as they
land; if something turns into a real decision, it graduates to
`design_decisions.md` and leaves here.

Status as of 2026-07-27, on `main` @ `e5d5f78`.

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
7. the chords in the background are just constant for a lot of the time in the first couple section and need some effects
and some motion between notes.
8. that drum rolls filter is a bit overwhelming; maybe it needs probabilities of adding the rolls too?
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
10. that fill going into the seam is very cheesy and should be a bit better