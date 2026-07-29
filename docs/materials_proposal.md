# Materials — giving the world a surface response

Status: **proposal only. Nothing here is built.** Written against `fc7e056`
(D44–D46 merged).

This continues the ladder set by `visuals_expansion_proposal.md` (A–E),
`visuals_fancy_proposal.md` (F–J), `visuals_pizzaz_proposal.md` (K–M),
`audio_pizzazz_proposal.md` (N–T) and `visuals_fauna_proposal.md` (U–Y). That
exhausts the single letters, so this one takes **Z** and then continues
spreadsheet-style at **AA, AB, AC**. Say so once here rather than have the next
reader wonder.

**How this was made.** A census of every material in `src/visuals/`, read
against how each object is actually shaded today, plus a check of what the
renderer already ships. No screenshots were taken for it; the two claims that
want a photograph are marked in §Verified vs unverified.

---

## 1. The honest diagnosis

### 1.1 There are 23 materials, and 18 of them must never be lit

```
23 × MeshBasicMaterial      2 × LineBasicMaterial
22 × depthWrite: false      12 × AdditiveBlending
```

The instinct behind "upgrade our material types" is `MeshBasicMaterial` →
`MeshStandardMaterial`, plus lights. That is the wrong move here, and the
numbers say why: **this world is overwhelmingly built from additive,
depth-non-writing billboards**, and for those the glow *is* the material.
Lighting a firefly, a mist card, a light shaft, a rain streak or a caustic
ripple is a category error — they are emissive by construction, they have no
meaningful surface normal, and shading them would replace the thing they are.

Sorting the census by what could actually receive light:

| | object | material today | lit? |
|---|---|---|---|
| **solid** | trunks | `vertexColors`, opaque, DoubleSide | **yes — the prime candidate** |
| **solid** | crowns | `alphaMap` + `alphaTest: 0.42`, `depthWrite: true` | **yes** |
| **solid** | sloths + branch | `vertexColors`, normal-blended | **yes** |
| **solid** | frogs (both) | normal-blended spheres | yes |
| **solid** | birds, soarer | normal-blended, DoubleSide | yes |
| emissive | fireflies, roots, dust, floor blooms, leaves | additive glow | never |
| emissive | mist, shafts, rain, pool, ripples, mycelium | additive | never |
| emissive | clouds, cirrus, virga | soft billboards | never |
| emissive | figure rings and shards | additive, the figure stream | never |
| environment | the air sphere | `BackSide`, `vertexColors` | it *is* the light |

**Five families, not twenty-three.** And the five are exactly the world's
structure — the forest and the animals in it — which is where a surface response
would be worth the most. That is the useful shape of this task: it is not a
sweep, it is five targeted upgrades and one firm rule about the other eighteen.

### 1.2 The world already has a lighting model. What it lacks is a surface response

This is the crux, and it is why D39 was right to delete the lights rather than
fix them.

`look.js` contains a real, physically-argued lighting model: `canopyLight(a)` is
Beer–Lambert extinction through a two-layer leaf-area profile, calibrated to
field measurements of understory PAR (~2% of open sky on the litter), with the
crown layer's two altitudes read out of the tracks' own brightness spans. Every
exposure, fog density, shaft visibility and grade in the frame comes off it.

What it produces is **one number per object per frame**. So the light is
correct and the *surface* is not lit at all:

- a trunk gets a single flat colour up its whole length;
- a sphere gets a single flat colour, which is why it renders as a filled
  circle;
- a crown is either `SHADE` or `SUNLIT`, chosen by **where the camera is**.

The last one is the sharpest example and it is worth stating plainly.
`makeForest` does:

```js
const above = clamp((camY − (CROWN_Y1 − 4)) / 9);
crownMesh.material.color.copy(SHADE).lerp(SUNLIT, above);
```

Every crown in the world shares one colour, chosen by the camera's height. So
**the canopy cannot currently be lit on top and dark underneath at the same
time** — the single fact that most defines what a canopy looks like. From below
the whole sea is silhouette; from above the whole sea is sunlit; passing through
the crown layer, all of it crossfades together. A per-pixel normal makes that
correct for free, and it is the biggest single visual win available here.

### 1.3 Four workarounds have accumulated where the surface response should be

Each of these is a local fix for the same missing thing, and each is documented
as a deliberate choice rather than a mistake — which is how you can tell the
gap is structural:

1. **Trunks bake it into vertex colours** (D39).
2. **Crowns lerp by camera altitude** (§1.2).
3. **Sloths bake a fake lambert into vertex colours** — `shadeGeometry()` in
   `creatures.js`, added in D45 after the first pass "photographed as two pale
   saucers with sticks coming out of them", because an unlit sphere is a disc.
4. **Crown instance colours carry a grey multiplier** for the cloud shadow (V5)
   and the warmth spread (W1) — real per-surface information smuggled through a
   channel meant for tint.

D45's own conclusion was: *in an unlit world, form comes from baked vertex
colour and from context objects, not from geometry.* That is a true observation
about the current constraint and a good argument for changing it. A real
shading path retires (1) and (3) outright and turns (2) into physics.

### 1.4 The renderer already ships what this needs, and it is unused

The project renders through `three/webgpu` with a TSL post chain
(`src/visuals/scene.js` imports 9 TSL display nodes). three r182 therefore
already provides, unused:

```
MeshBasicNodeMaterial   MeshLambertNodeMaterial   MeshStandardNodeMaterial
MeshPhysicalNodeMaterial  MeshToonNodeMaterial  SpriteNodeMaterial  …
```

and the TSL vocabulary the shading needs — `normalWorld`, `positionWorld`,
`cameraPosition`, `Fn`, `uniform`, `mix`, `smoothstep`, `dot`, `pow`.

**`MeshBasicNodeMaterial` is the important one**, and it is the pivot of this
whole proposal: it keeps the *unlit pipeline* — no light objects, no scene
lighting cost, no shadow maps, no change to how the two-camera layer split
works — while letting the colour be an arbitrary node graph that can read the
surface normal. So the world can keep being "lit analytically, and that is a
decision rather than an omission" (D39, verbatim) and simply evaluate that
analysis **per pixel, with a normal**, instead of once per object on the CPU.

That is the difference between this proposal and the one D39 declined to price.

### 1.5 The blast radius is the largest available in this project

Stated up front because it governs the whole plan. Every other visual change so
far has been additive — a new system, a new style, a new creature — and could be
judged in the frames that contain it. **A material change alters every frame at
every altitude**, including the four band shots that D39 established as the
set's identity. And this repo has two precedents for work that met every stated
constraint and still had to be removed by eye (D28/D40 the recurring form,
D42 the shrine and the fronds).

So the plan is staged one family per commit, each with a before/after at all four
altitudes, and it carries one hard invariant (§AC2): the four bands' luminance
*order* must not change. The forest's identity is the extinction curve, and no
material may be allowed to flatten it.

---

## 2. What "upgrade" must not mean

Four non-goals, each a real temptation:

- **Not `MeshStandardMaterial` + lights.** PBR wants an environment map, real
  light objects and a physically-scaled exposure chain. This world's light is
  an authored curve tied to the musical timeline, and its exposure is already
  compressed by a cube root because "a literal 2% frame is a black frame". PBR
  would either fight that or force it to be rebuilt.
- **Not shadow maps.** The shadowing that matters — the canopy intercepting
  nearly all the light — is *already modelled*, analytically, and better than a
  shadow map would do it at this scale. Cloud shadow (V5) is likewise already an
  analytic field. Adding real shadows would be a second, disagreeing model.
- **Not lighting the emissive eighteen.** §AB makes this a written rule so that
  a later reader does not "finish the job".
- **Not a look change smuggled in as a refactor.** Each stage should be
  defensible as *the same world, better surfaced*. Where a stage genuinely
  improves the look (the crowns will), that should be stated and shown, not
  discovered.

---

## 3. What to do first

1. **Z1** — the shading function, pure, tested, and not yet wired to anything.
2. **Z2** — wire it to the trunks only, behind `?mat=0`. One family, one shot
   set, one commit. This is the smallest change that proves the whole idea.
3. **AA1** — the crowns. The biggest win and the biggest risk, on its own.
4. **AC1/AC2** — the baseline compare tool and the band-order invariant, before
   going further; after two families the eye stops being able to tell.
5. **AA2/AA3** — the fauna, which retires `shadeGeometry`.
6. **AB** — write the rule down.

---

## Tier Z — the shading function

### Z1. `shade.js` — the extinction curve, per pixel (M) — *the structural one*

A new pure module beside `look.js`, in the same spirit: no three.js *state*, one
exported TSL factory plus a plain-JS mirror of the same maths so the claims are
testable without a GPU (the pattern `weather.js`, `fauna.js` and `look.js` all
follow).

The model, and the argument for each term:

- **A hemisphere term, not a sun lambert.** Under a canopy the light is not
  directional — it is diffuse skylight arriving through gaps, from a hemisphere
  overhead. So the primary term is `n·up` remapped to `[0,1]`, which is the
  standard hemispherical model and happens to be both cheaper and more correct
  than a directional light here. This one term is what makes a crown lit on top
  and dark underneath, and a trunk brighter on its upper curve.
- **Scaled by `canopyLight(worldY / WORLD_TOP)`**, evaluated at the *surface's*
  altitude rather than the camera's. The curve stays exactly as it is; this only
  changes where it is sampled and how often. Note this fixes a latent oddity for
  free: a 40-unit trunk currently has one brightness, though its base is at 2%
  light and its crown is at 40%.
- **Tinted by the sky it is lit by.** `makeAir` is already the world's
  environment — a `BackSide` vertex-coloured sphere whose colours are
  `BAND_COLORS`. The hemisphere term should be tinted by `paletteAt()` at the
  surface's altitude, so the forest is lit by the sky the camera can see. Same
  "one field, sampled by everyone" idiom as the wind (K1) and the cloud shadow
  (V5), and it means the sky and the light on the trees can never disagree.
- **A weak directional term, from the sun the frame already has.** `scene.js`
  computes a `SUN` world position every frame for the god rays (L2) — and since
  D44 it points at the storm cell during a strike. Feeding the same vector in as
  a low-weight `n·l` gives the crowns a lit *side* near the top of the world and
  makes a strike briefly rake the forest from the bearing it came from. Weak,
  because a rainforest interior genuinely has almost no direct sun.
- **A vertical AO proxy.** A forest floor is dark partly by occlusion, not only
  by extinction. `canopyLight` already covers most of that, so this is a small
  term and may not survive first contact with a screenshot; it is listed so the
  option is on the record.

Signature, roughly:

```js
// shade.js
export function shadeNode({ tint, sunDir, sunAmt, hemi, ao }) → TSL colour node
export function shadeAt(normalY, worldY, opts) → number   // the plain-JS mirror
```

### Z2. The trunks, and nothing else (S) — *the proof*

`makeForest`'s trunk material is already `vertexColors: true` and opaque, which
makes it the cheapest possible first customer. Replace `MeshBasicMaterial` with
`MeshBasicNodeMaterial` whose `colorNode` is `shadeNode(...)`, delete the baked
vertex-colour pass, and keep D39's cap (a trunk is lit by what reaches the
*forest*, not by the camera's altitude — keying that to the camera made the
trunks glow when seen from above, and the comment explaining it should survive
the port verbatim).

Ship it behind `?mat=0` so the old path is one query param away for A/B, and
delete the flag once the crowns land — a permanently flagged renderer path is
two renderers.

---

## Tier AA — the solid families, one at a time

### AA1. The crowns (M) — *the biggest win in the document*

Per §1.2, the crown layer currently has one colour chosen by camera height. With
a normal it gets the thing a canopy is actually made of: **a lit top and a dark
underside, simultaneously, on the same crown.** The `above` lerp and its
`SHADE`/`SUNLIT` constants retire; the silhouette-from-below reading it exists
to produce falls out of the hemisphere term instead, and stays correct while the
camera is *inside* the layer, which is the one place the current model is
visibly wrong.

Two details this must not lose:
- The crowns are `DoubleSide` with `alphaTest`. Double-sided normals flip, so
  the shading must use the face-corrected normal or the undersides will read as
  tops. This is the single most likely bug in the whole proposal.
- The V5 cloud shadow and W1 warmth spread currently ride the instance colour.
  They should become explicit multipliers on the shaded result, not be left in a
  channel that now means something else.

### AA2. The fauna (S)

Sloths, frogs, birds, the soarer. This is where `shadeGeometry()` — D45's baked
fake lambert — gets deleted, which is the clearest possible statement of what
this tier is for: the stopgap existed because there was no surface response, and
now there is one.

Expect to re-tune the sloth's fur multiplier when it lands. Its current value
(`0.18 + 1.2 · lit`) was found empirically against a *flat* shape; a shaded one
will read brighter at the same number. TODO #7's open question — whether the
sloth reads as an animal in motion — should be re-asked after this, not before,
because form is exactly what it was short of.

### AA3. The near-field dust and the floor's growth (S, optional)

Both are additive and belong in §AB by the rule. Listed here only to record that
the call was made deliberately: the dust is a parallax cue and the vines are a
growth system, and neither is a surface.

---

## Tier AB — the eighteen that stay emissive, as a rule

Write this into `shade.js`'s header so it is found by whoever tries next:

> **A material is a candidate for shading only if it writes depth and is not
> additively blended.** Everything else in this world — fireflies, motes, dust,
> blooms, leaves, mist, shafts, rain, the pool and its ripples, the mycelial
> net, the clouds, the cirrus, the virga, and both figure streams — is emissive
> by construction. Its glow is not an approximation of a lit surface; it *is*
> the object. Shading it would not improve it, it would delete it.

Two consequences worth stating with the rule:

- **The figure stream must stay unlit, always.** §2.1's whole point is that the
  figure is sharp, near and clinical while the ground is soft and atmospheric —
  which is also why it escapes the depth of field and the shimmer. A lit drum
  hit is a drum hit that has joined the ether.
- **The air sphere is the environment, not a surface.** It is what Z1's tint
  samples. If it is ever shaded it will start lighting itself.

---

## Tier AC — plumbing, and the safety rail

### AC1. `tools/shot_diff.mjs` — the compare tool `shots-baseline/` implies (S)

`.gitignore` has carried a `shots-baseline/` entry since the pizzaz pass and
there is no tool that reads it. For every change so far that was survivable,
because each was additive and could be judged in the frames containing it. A
material change is the first one where **every** frame moves, and eyeballing 40
PNG pairs is not a review.

Minimum useful version: per-shot mean and per-quadrant luminance, plus a
flagged list sorted by delta. Not a perceptual metric — just enough to answer
"which frames changed most, and did anything change that should not have".

### AC2. The band-order invariant (S) — *the hard rail*

`test/look.mjs` already asserts the four bands' light order. Extend it to the
shading function: **for any surface normal, at any altitude, the shaded result
must preserve the ordering undergrowth < understory < canopy < open air.** The
forest's identity is one extinction curve, and the one thing a per-pixel model
could plausibly destroy is the monotonicity that makes the ascent legible. This
is cheap to assert in the plain-JS mirror and would catch the worst outcome.

### AC3. The governor rung (S)

Per-pixel shading is a fragment cost. The chain's sell order is currently
clouds → styles → optics → pixels → never the groove. Shading should sit
**between optics and pixels**: a flat-shaded forest is a real loss of a
sentence, but it is a smaller loss than dropping resolution. `shadeNode` should
therefore have a cheap variant (hemisphere only, no sun, no AO) rather than an
on/off, so the governor degrades the model instead of removing it.

### AC4. The WebGL2 fallback (S)

`renderer.init()` falls back to WebGL2 when WebGPU is absent, and three compiles
TSL to both — but the harness's own note is that the WebGPU device is lost a few
seconds into every headless run, so **the WebGPU path has never been seen by a
human eye**. A node material is the first change where the two backends could
plausibly differ in appearance rather than merely in whether they boot. Both
need a look in a real browser window.

---

## Open decisions — a call is needed before the item starts

1. **Hemisphere only, or hemisphere plus a weak sun?** Hemisphere alone is more
   correct for a rainforest interior and is one term cheaper. The sun term buys
   the top of the world a lit side and lets a lightning strike rake the forest
   from its bearing — which is a real image, and D44 just went to some trouble
   to give strikes a direction. Recommend: build hemisphere first, add the sun
   in the same stage as the crowns, decide by A/B.
2. **Do the crowns get true two-sided shading?** This is the item that changes
   the canopy's appearance most, and the canopy is the set's climax track.
   Recommend yes, on its own commit, with the four band shots before and after.
3. **Does the sloth keep a baked-vertex-colour fallback?** Keeping it means two
   shading paths for one object forever. Recommend no — delete it with AA2 and
   let the node material be the only answer.
4. **How far does the tint go?** Tinting the hemisphere by `paletteAt` is
   elegant and could also be too much of a good thing: the world's colour
   already walks with altitude in `BAND_COLORS`, and the *picture's* colour
   walks the other way in `BAND_GRADES` (L6, deliberately). A third colour walk
   in the shading could flatten the difference those two were built to express.
   Recommend starting at a low tint weight and treating it as a look decision.

---

## Rules this must not break

1. **The world stays lit analytically.** No light objects, no shadow maps. The
   curve in `look.js` remains the single source of what light there is.
2. **`visuals = V(S, seed_v)`.** Unchanged and untouched by this work.
3. **The figure stream is never shaded** (§AB).
4. **The four bands keep their order** (§AC2).
5. **Purity where a claim is made.** The shading maths gets a plain-JS mirror
   and a test, or it is not allowed to make claims.
6. **One family per commit, with before/after shots.** The blast radius rule.

---

## Verified vs unverified

**Verified — census and arithmetic on the current source:**

- 23 `MeshBasicMaterial` + 2 `LineBasicMaterial`; 22 `depthWrite: false`;
  12 `AdditiveBlending`.
- Exactly five families are opaque or normal-blended: trunks, crowns, sloths
  (+branch), frogs, birds/soarer.
- The crown colour is one material-level lerp driven by `camY`, so all crowns
  share one colour every frame.
- `shadeGeometry()` exists in `creatures.js` and bakes a fake lambert.
- three r182 ships `MeshBasicNodeMaterial` and every TSL helper named in Z1.
- `shots-baseline/` is in `.gitignore` and no tool reads it.

**Unverified — wants a screenshot or a real GPU:**

- **That per-pixel shading is affordable at this scene's overdraw.** The world
  is mostly additive billboards with heavy overdraw; the shaded families are a
  minority of the *materials* but the trunks and crowns are a large share of the
  *pixels*. This is the number that decides whether AC3's cheap variant is a
  nicety or the default.
- **That two-sided crown shading looks better rather than merely more correct.**
  §1.2 argues it will. The canopy is the climax track and D42 is a standing
  reminder that correct and good are different verdicts.
- Whether the WebGPU and WebGL2 paths agree in appearance once a node material
  is in the scene.

---

## Deliberately not in this pass

- **PBR, IBL, shadow maps** — §2.
- **Subsurface scattering on the leaves.** A leaf lit from behind glowing green
  is the single most characteristic thing about a canopy, `MeshSSSNodeMaterial`
  exists, and the crowns are exactly where it would pay. It is a real candidate
  for a later tier and it should not be attempted in the same pass that
  introduces the shading path at all.
- **Normal or roughness maps.** There are no texture assets in this project by
  policy (everything is canvas-drawn or procedural); adding them is a different
  argument about what this world is made of.
- **Re-lighting the emissive families "just a little"** — §AB exists to prevent
  exactly this.
