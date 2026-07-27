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

## 2. Two ADR statuses are stale

- **D12** ("Per-track instrumentation palette") is still titled *"planned, not
  yet implemented"*, but D22 explicitly says "And D12 finally lands." Update the
  heading, or append a short entry marking it delivered.
- **D13** ("Key movement across tracks") says **"Decision deferred until D11 +
  D12 land."** Both have now landed. D13 is unblocked and worth revisiting —
  especially since its motivation was listening feedback that *"tracks blur
  together"*, which is the same complaint that produced D22 and D23. Worth
  re-listening before deciding: the blur may now be sufficiently addressed by
  warmth + groove variation, which would let D13 stay closed on purpose rather
  than by default.

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

## 4. The smoke test is flaky, and it's the only real gate

`smoke.mjs` failed 1 of 4 consecutive runs with a Playwright click race:

    locator('#overlay') — element was detached from the DOM, retrying
    waiting for "http://localhost:5199/" navigation to finish...
    TimeoutError

It recovered on retry, so it's a race during page load, not a product bug.
Worth hardening (wait for a settled load state before clicking, or retry the
click) **before** it becomes a release gate — a flaky gate trains you to ignore
it.

Why it matters more than it looks: `npm test` asserts pattern-level design
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
  merge. Delete it once you're confident in `e5d5f78`: `git tag -d pre-d23-main`.
- Branch hygiene going forward: short-lived topic branches off `main`, merged
  and deleted promptly. `main` is staging; production is a tag that only ever
  moves forward to a commit that passed `npm test && npm run build && npm run smoke`.
]
7. the chords in the background are just constant for a lot of the time in the first couple section and need some effects
and some motion between notes.
8. that drum rolls filter is a bit overwhelming; maybe it needs probabilities of adding the rolls too?
9. the butterfly visualization thing looks stupid and should be removed
10. that fill going into the seam is very cheesy and should be a bit better