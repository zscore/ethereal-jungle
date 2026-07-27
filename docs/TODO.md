# Open issues

Known problems and loose ends, newest concerns first. Not a roadmap — this is
the list of things that are *wrong or stale right now*. Delete entries as they
land; if something turns into a real decision, it graduates to
`design_decisions.md` and leaves here.

Status as of 2026-07-27, on `main` @ `e5d5f78`.

---

## 1. The ADR log has duplicate numbers (from the branch merges)

`design_decisions.md` was appended to independently on two long-lived branches
(`perform-fx` and the visuals/music line), and neither could see the other's
numbering. Main now permanently carries:

| number | entries | file lines |
|---|---|---|
| **D19** | The master insert / The look module | 514, 676 |
| **D20** | Two filter dials / The corpus shrine / The biome beds | 580, 738, 793 |
| **D21** | Filter dials rotary / One atmosphere | 622, 849 |

This is not cosmetic — **~19 cross-references in code now resolve ambiguously.**
`D20` alone means three different decisions depending on the file:

    tools/ingest_amb.py:2,20     D20 = biome beds → field recordings
    tools/gen_samples.py:389     D20 = biome beds
    src/visuals/look.js:15,40    D20 = the corpus shrine
    test/look.mjs:59             D20 = the corpus shrine
    test/perform.mjs:61          D20 = two filter dials
    test/osc.mjs:23              D20 = two filter dials

**Suggested fix:** renumber the second (visuals/music) group so the log is
monotonic and unique again — look module → D22, corpus shrine → D23, biome beds
→ D24, one atmosphere → D25, then warmth → D26 and groove → D27. Keep each
heading's original number in parentheses (`(was D20 on the visuals branch)`) so
old references stay traceable, and update the ~19 call sites. Roughly a
30-minute mechanical pass.

**Alternative** if that feels like too much churn: leave the numbers alone and
add a disambiguation table at the top of `design_decisions.md`. Cheaper, but
every future reader pays the cost instead of paying it once.

**Prevention:** assign the next `D` number *at merge time*, not on the branch.
Nothing else stops this recurring — it's a structural consequence of long-lived
parallel branches, not carelessness.

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

## 3. There is no remote — nothing is backed up

`git remote -v` is empty. The entire project, including all the design history
in `docs/`, exists on one disk. Until this is fixed, "production" can't mean
anything more than a local `dist/` (which is gitignored anyway).

This is the highest-value item on the list even though it's the least
interesting. Suggested order: add a private remote → CI running the gate below
on push → tags driving a static deploy (it's a plain Vite build, so any of
Pages / Netlify / Vercel is a single config file).

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