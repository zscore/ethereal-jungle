# Visuals Expansion IV — the fauna, the sky, and the signals the eye never reads

Status: **built — D44, D45, D46.** Written against `db8c767`, re-validated
against `5df0ceb` after D42 (the shrine, the recurring form and the fronds
removed) and D43 (the audio pass, N–T) landed, then implemented. Every §1
diagnosis survived that re-check; two items moved on the way — W4 got authored
harmony to read instead of published notes, and W6 lost one of its two existing
readers.

**What shipped, against what was proposed.** Every item in tiers U, V, W, X and
Y is built. Four things changed shape once a screenshot was available, and the
ADRs are where the arguments live:

| item | as proposed | as built |
|---|---|---|
| U2 | sloths as near-black silhouettes | **lit off the extinction curve**, on a branch, vertex-shaded — a dark shape on a 2%-light background is an absence, not a silhouette (D45) |
| U3 | tree frogs, additive | normal-blended bodies — additive green read as lanterns in a world already full of glow |
| V1 | billboard impostor clouds | as proposed, and the premise §V1 flagged as unverified **was confirmed**: the old deck sat overhead and out of frame |
| W2 | chroma shift at 0.0022 | 0.0009 — the first value rainbow-edged the snare shards |

The one item whose *verdict* is still open is the sloth: it reads as a hanging
mass under a branch in a still frame at three altitudes, and whether it reads as
an animal to a human eye in motion is unverified. See D45's closing note and
§Open decisions #3, which is now the live question rather than a hypothetical.

This continues the ladder set
by `visuals_expansion_proposal.md` (A–E), `visuals_fancy_proposal.md` (F–J),
`visuals_pizzaz_proposal.md` (K–M) and `audio_pizzazz_proposal.md` (N–T), so the
item letters continue at **U**.

The brief was four animals, some clouds, some thunderclouds, and "more different
kinds of visual effects linked to the parameters for the music." Three of those
four asks turned out to have a measured problem underneath them, and the fourth
— the effects — turned out to be the largest single piece of unspent capacity in
the project. That is what §1 is about.

**How this was made.** By reading the source, not by looking at screenshots:
`biomes.js` (the thirteen systems and what each one reads), `scene.js` (the frame
loop and the event queue), `look.js` (the whole post chain and the light budget),
`weather.js` (the shared atmosphere), `bus.js` (the signal surface), `engine.js`
(what is published and when), and `perform.js` (the rail). Where a claim below is
arithmetic on constants that are in the repo, it is stated as fact. Where it is a
geometric inference that nobody has photographed, it says so, and the last
section lists every one of them.

---

## 1. The honest diagnosis

### 1.1 The world has thirteen systems and one animal

`buildWorld` (biomes.js:1534) builds: air, roots, mycelium, pool, floor, forest,
canopy, upper air, shafts, mist, fireflies, rain, near field. Thirteen. Twelve
of them are weather, geology, or vegetation. The fireflies are the only living
thing in the jungle, and they were built (K2) as a demonstration of *agents* —
the boid rules — rather than as an animal.

This is not an oversight so much as a consequence. §3.7's affordance table says
rhythm affordance and ground affordance are nearly disjoint, and every family
this world is built from sits on the ground side of that table. An animal is the
first thing that wants to be on both sides at once — it is continuous like
weather and it is *discrete* when it moves — which is exactly why the world
does not have any yet, and exactly why adding them is a real design problem
rather than a modelling exercise. §U1 is that problem, and it is the item
everything else in Tier U depends on.

### 1.2 The soundtrack is already full of animals

The ambience beds (D16/D30) and the palette:

| track | what you hear | what is on screen |
|---|---|---|
| undergrowth | `ambinsects`, **`ambfrogs`**, `ambrustle`, `ambglint` | fireflies |
| forest floor | `ambrain`, `ambthunder`, `ambdrips` | rain, pool ripples |
| canopy | **`ambbirds`**, **`ambcalls`**, `ambleaves`, + the **`toucan` squawk** | — |
| zenith | `ambwind`, `ambshimmer`, `ambsparkle` | — |

The canopy has a screaming piha calling over a Tambopata bed, and a toucan
squawking once every two phrases into an 11-second ether, and there is not one
bird in the picture. This is precisely the argument K3 used to earn the rain
("the forest floor has been playing `ambrain` since D16 with nothing falling"),
and it applies with more force here, because a bird call is a *louder* promise
than rain is: rain is texture, a call is somebody.

Note also what the table says about the brief. **The frogs are in the
undergrowth, not on the forest floor** — `ambfrogs` is track 0's bed. The forest
floor's bed has no animal in it at all. See the open decision in §U3; it has a
good answer, but it is a decision.

### 1.3 The only band with a sky is the only band that can never have a storm

Three constants, in two files, that have never been read against each other:

```
weather.js:112   TRACK_WEATHER[3] = { mist: 0.15, rain: 0.00, wind: 0.60 }   // zenith
weather.js:159   storm = clamp01(rain * clamp01(T * 1.15))
biomes.js:836    open  = (alt − CANOPY_BASE) / (CANOPY_TOP − CANOPY_BASE)    // clamped
```

The zenith's rain is 0, so its storm is 0, so `lightningAt` returns zero flash
for the entire track: **the zenith can never have lightning.** Meanwhile the
cloud deck is gated on `open`, which is zero below the crowns' underside — so
during the forest floor, the one track that *does* storm (rain 0.90), the clouds
are invisible. The strikes happen where there is no cloud, and the cloud lives
over a band that never strikes.

The user asked for thunderclouds. The machinery for them is already written,
already seeded, already time-addressable, already tested (`test/weather.mjs`) —
and it is wired so that its two halves can never meet. §V3 is one table edit and
one gate; it is the cheapest item in this document and probably the largest
single visible win.

### 1.4 The event stream publishes five fields and the eye reads two

`engine.js:59` mirrors **every** event the set plays onto the bus:

```js
bus.publish({ type: 'hap', sound, note, orbit, gain, when, dur })
```

`scene.js:281` keeps this much of it:

```js
if (evt.type === 'hap' && (evt.sound === 'bd' || evt.sound === 'sd')) pending.push(evt);
```

Two sound names. The pluck, the bells, the bowl, the choir, the hoover, the
breath, the granular ghost, the bass, the pad, the lead and the toucan all
arrive on the bus, ahead of time, with their pitch, their orbit and their
duration attached, and are dropped on the floor. `note` has never reached a
pixel. `orbit` has never reached a pixel — and `orbit` is the *room* the sound is
in (D35 gives every track a reverb size per orbit), which is to say the bus has
been publishing **how far away each sound is** since D35 and the eye, whose
entire doctrine is that fog *is* distance, has not once looked at it.

This is the free capacity the effects half of the brief should be spent on
before anything new is invented. It is already wired, already clairvoyant,
already on the right side of the shared-bus rule.

### 1.5 The warmth axis has never reached a pixel

`grep -rn warmth src/visuals/` returns one comment, about the sun, meaning
something else. D22 added warmth as a full second harmonic axis — an authored
per-track curve, blended across seams by the same smoothstep as brightness, with
`bus.warmthAt(t)` sitting next to `brightnessAt` for symmetry — and the visuals
have never called it.

What that costs is specific and it is the best moment in the set. From bus.js:

> The zenith is the one place the two axes move AGAINST each other — brightness
> still climbing, warmth falling off a cliff — which is what makes the last
> track read as awe rather than triumph.

Brightness is rendered: it is the camera's altitude, the whole ascent. Warmth is
not rendered at all. So the eye sees the zenith as *only* the climb — triumph,
the exact reading D22 was written to avoid. The music makes the argument (cold
thirds, stretched octaves, the drums dematerialised) and the picture nods along
underneath it. §W1 is the fix, and it is the most interesting item here.

### 1.6 The perform rail has eleven knobs; the eye renders five

`PERFORM_DEFAULTS` (perform.js:23): `lpf`, `hpf`, `echo`, `crush`, `space`,
`eqLow`, `eqMid`, `eqHigh`, `gate`, `drive`, `roll`. `look.js` reads `params.lpf`,
`params.hpf`, `params.echo`, `params.crush`, `params.space`. That is all of them.

H1's promise, in look.js's own header, is that the twins "say the same sentence
the audio effect says, one sense-organ over." It says it about five of eleven,
and the six it is silent about include the two most *visual* gestures on the
whole rail: `gate`, which is a bar-locked square gater and is therefore
literally a strobe, and `roll`, which is a stutter and is therefore literally a
repeated frame. Tier X.

### 1.7 The coupling knob moves the ears and not the eyes

scene.js's header says "one coupling constant, everywhere," and lists the four
places the sidechain is rendered. But:

```js
generators.js:978   const duckDepth = p.coupling * (0.4 + 0.6 * tension);   // audio
scene.js:303        duck = 1;                                              // visual
```

The audio duck is scaled by `params.coupling`; the visual duck is assigned a
flat 1 and then decays. Turn coupling to 0 and the sidechain leaves the mix
while the camera keeps flinching, the bloom keeps dipping, the mist keeps
pressing down and the pool keeps darkening. The knob is documented as "how much
the two worlds touch"; today it governs one world. §X5 — a one-line fix, listed
because the header currently makes a claim the code does not keep.

---

## 2. Free capacity, before anything new is built

Worth stating plainly, because five of the items below cost far less than they
look like they cost:

- **The event stream is already clairvoyant.** Events arrive with `when` on the
  audio clock, ahead of time, and `scene.js` already has the queue-and-fire
  machinery. A new event-driven creature behaviour is a filter and a handler,
  not a scheduler.
- **The pool already has a recycling ripple pool** (`RIPPLES = 10`,
  biomes.js:1291) with a free-list index. A frog call that puts a ring on the
  water is four lines against machinery that exists.
- **The wind is a shared analytic field** any new system can sample at its own
  position (K1). Fauna get to move in the same air as the leaves for free, which
  is the single strongest thing that will make them look like they belong.
- **`lightningAt` is pure and time-addressable** — askable about any instant,
  past or future. Thunderclouds do not need a state machine.
- **The governor already has three tiers and a `quality` dial** every system
  reads. A creature budget is a fourth rung, not new architecture.
- **`hash01` and `episode`** (weather.js) give seeded, reproducible,
  time-addressable schedules with no per-frame state. Every animal's rare
  behaviour should be built on them, for the same reason the strikes are.

---

## 3. What to do first

Ordered by (visible win) ÷ (effort), with dependencies respected:

1. **V3** — let the storm reach the sky (S). One table row, one gate. Unblocks
   every thundercloud item and fixes a system that is already built and tested.
2. **U1** — the rule every animal obeys (S, architectural). Nothing in Tier U
   should be written before this is agreed, or the four creatures will each
   answer the rhythm question differently.
3. **W1** — warmth, rendered (M). The set's best moment is currently invisible.
4. **U2 + U4** — the sloth and the birds (M each). The two creatures whose
   bands the camera actually looks at.
5. **V1/V2** — clouds as volume, and the storm cell (M–L). The biggest picture
   change in the document, and the one most likely to need a real GPU.
6. **W3 + W2** — orbit as distance, tuning as register (S each). Cheap, and
   they make the existing figure stream mean more than it does.
7. **U3, U5, X**, then the rest.

---

## Tier U — the fauna

### U1. The rule every animal obeys (S, architectural) — *do this first*

The problem, stated once so that four creatures can share the answer: **an
animal that moves on the beat is rhythm on the ground stream, which §2.1
forbids.** The fireflies already met this and the code says how — each carries
its own blink period on an irrational stride so the swarm *never* synchronises,
and the comment notes that real fireflies do synchronise and the physics is
wrong on purpose.

That precedent generalises into three tiers, and every creature below declares
which tier each of its behaviours is in:

- **Continuous (ground).** Locomotion, breathing, sway, the wind response.
  Aperiodic, per-agent phases, no common multiple inside a track. Free — it
  costs no synch points and may run at any density.
- **Episodic (weather-licensed).** Rare behaviours on a seeded slot schedule via
  `hash01`, exactly as `lightningAt` does it: a startle, a call, a descent. Not
  rhythm, because nothing about the schedule knows where the downbeat is. Cheap,
  and this is where most of "doing some stuff" lives.
- **Anchored (figure).** Bound to a published event, and therefore priced by the
  synch-point economy (§2.2). Spend only on events that are *already* rare. The
  toucan squawk is the obvious one — `every: 2` phrases — and §U5 spends it.

A creature may take at most one anchored behaviour. Everything else is
continuous or episodic. If that rule holds, fauna can be dense without ever
becoming a drum machine, which is the entire risk this tier carries.

### U2. Sloths — the undergrowth (M)

Sitting where the brief asks, the sloth is *the thesis of §3.1 rendered as an
animal*: an integrative motion with all memory and no rhythm, incapable of
dancing at 168 BPM and therefore incapable of breaking the ground-stream rule
even by accident. The one creature that cannot get this wrong.

The geometry is better than expected. The undergrowth track spans altitude
0.12–0.29 (look.js:104), i.e. camera y ≈ 7.4–18, and `BAND_PITCH[0] = 5.0` —
the gaze in this band *climbs*, because "the eye goes to what it does not have"
and down there the unreachable thing is the light. So the camera spends the
first 97 seconds of the set looking up into a band that currently contains
trunks and nothing else. A shape hanging in that upward gaze is the single
best-placed object in the world.

- Two or three individuals, hanging from lianas and low branches at y 10–16,
  silhouetted against the light gaps — near-black against the shafts (C1),
  which is how you actually see one.
- **Continuous**: a limb reaches and re-grips on a ~40–90 s cycle, per-animal
  phase, plus a slow sway that samples `windAt` at its own position. Its speed
  scales with `T` only weakly and *inversely* — a sloth at the drop is not a
  faster sloth, and refusing to accelerate is a legible joke about the one
  animal in the world that will not be hurried.
- **Episodic**: a head turn on a `hash01` slot schedule. That is the whole
  animation vocabulary. It does not need more.
- Algae-green fur, which is real, and which lets the grade (`BAND_GRADES[0]`,
  scotopic and crushed) do most of the work.

Cost is low — three instanced articulated shapes, no simulation. Effort is M
rather than S only because "reads as a sloth and not as a sack" is a modelling
problem, and the fallback if it does not read is stated in §Open decisions.

### U3. Frogs — the forest floor as asked, and the pool as a bonus (M)

**The open decision, stated first.** Frogs were asked for on the forest floor.
Three separate things say the undergrowth: `ambfrogs` is track 0's bed (§1.2);
the pool with its ripple machinery fades out by camera y ≈ 26 (biomes.js:1311),
so it is an undergrowth-track object; and the forest floor's camera is at
y 18–32, some 20–30 units above the litter, looking roughly level — a frog on the
ground there is out of frame.

The answer is not to overrule the brief, because there is a frog that lives at
y 18–32: **tree frogs.** On a leaf at eye level between the trunks, which is
exactly where the forest floor's camera is pointed. So:

- **Forest floor (as asked)** — tree frogs, a handful, on leaves and trunk
  buttresses at eye level. Continuous: throat pulse on per-animal irrational
  periods. Episodic: a jump between leaves on a seeded slot, which is the one
  hard-edged motion in Tier U and is licensed as weather exactly the way a
  strike is. Rain (0.90 on this track) darkens and beads them.
- **Undergrowth (nearly free, recommended)** — the pool chorus. Frogs at the
  water's edge, and each call drops a ring into the *existing* ripple pool. This
  is where `ambfrogs` actually sounds, and it costs almost nothing because
  `makePool` already recycles ten rings on a free index.

Discipline note: real frog choruses *do* synchronise, and a synchronised chorus
is rhythm on the ground stream. Same treatment as the fireflies — irrational
per-animal periods, chorus *density* riding `T`, and the physics deliberately
wrong. Write that in a comment when it is built, because the next reader will
otherwise think it is a bug.

### U4. Birds — the canopy (M)

The canopy track is camera y 31.6–45.3, inside the crowns, gaze near level: a
flock crossing between crowns is dead centre of frame for 97 seconds.

The temptation is to clone the fireflies. Resist it — the flock should differ
from the swarm in the one way §3.2's comment already names: *a flock banks; a
field merely flows.* The firefly boid rules produce a cloud; birds need roll
into the turn (bank angle from lateral acceleration), which is nearly free once
velocity is already integrated and is the whole difference between "particles
with wings" and "birds."

- Reuse the spatial hash from K2/D41 wholesale — same grid, same counting sort,
  different weights (higher alignment, lower separation, much higher speed).
- 40–80 individuals, not 220. A flock reads as a flock at small counts; a cloud
  of 220 birds reads as insects.
- **Continuous**: wingbeat on per-animal irrational periods (the fireflies'
  blink discipline, one organ over), and the shared wind at their own position,
  which is the windiest band in the set (`wind: 1.00`).
- **Episodic**: the flock changes its mind — a new waypoint on a `hash01` slot
  schedule, so the whole group swings across the frame every 20–40 s.
- **Anchored**: exactly one, and it is §U5.

Zenith note, since the brief left the top band to the clouds: one bird up there,
alone, circling on a thermal at y 45–56 — no flock, no wingbeat, just a long
slow arc. The zenith's ambience has no animal in it and its whole argument is
scale; a single distant shape is the cheapest way to say how big the air is. Two
instances of the same system, one constant apart.

### U5. The toucan flush — the event nobody is watching (S) — *best ratio in Tier U*

The canopy palette contains `squawk: { s: 'toucan', every: 2, ... }` — one call
every two phrases, into the highest reverb send in the set. It publishes to the
bus like everything else (§1.4). Nothing sees it.

Bind it: on a `toucan` hap, the nearest birds **flush** — a startle burst away
from a point, decaying back into flocking over ~2 s. That is one anchored
behaviour on an event that fires roughly every 8 bars, which is precisely what
"anchor-priced" means in §2.2, and it produces the strongest thing this whole
document can offer: a sound and a picture that are visibly the same event
without the picture having listened to any audio. `V(S)`, exactly as written.

The handler is ~15 lines. The event queue, the clairvoyance and the audio-clock
firing already exist for `bd`/`sd`; this widens one filter.

---

## Tier V — the sky

### V1. Clouds that are volumes (M–L)

Today the deck is two additive `PlaneGeometry` sheets with a gradient texture,
at y 16 and 26 inside a group at y 56, scrolling at near-coprime rates
(biomes.js:800). As a *deck seen from below* it is good. As the content of the
band the brief calls "flying above," it has a geometry problem:
`group.position.y = 56` puts both sheets at y 72 and 82, while the zenith camera
is at y 45–56 with `BAND_PITCH[3] = −8.0` — tilted **down**, over the canopy. So
the sheets sit 16–37 units overhead while the camera looks the other way.

**This is an inference from constants, not something anybody has photographed**
— see §Verified vs unverified, and note that `?altitude=0.85` plus
`tools/visual_check.mjs` settles it in one shot. If it holds, the fix is not a
better texture, it is a different object: you do not fly *under* a cloud deck,
you fly *among* clouds.

- Billboard-impostor cumulus — clusters of soft camera-facing cards with
  depth-graded opacity — distributed through y 40–75, so the camera is *inside*
  the field, with clouds below it, beside it, and behind the horizon.
- Parallax does the work the texture scroll is doing today, and parallax is what
  makes altitude legible. It is also what gives the band a horizon, which
  look.js's `aerial` term (≈10× clearer air up there) has already paid for and
  the band has nothing to spend on.
- Keep the two existing sheets as the *high* deck above the new field. They are
  cheap, they are the right thing at that height, and lightning still wants
  them.
- Cost: this is the one item that could actually threaten the frame budget.
  Governor rung, LOD by distance, and it must be droppable — see §Y2.

### V2. The storm cell — thunderclouds you bring in (M)

A named, positioned, moving object rather than a global weather amount. One cell
with a world position, an anvil, a dark base, and virga underneath, that
*arrives* across the sky on the prevailing wind (`windDir` — already shared) and
leaves.

- Its schedule is `hash01` on slots, like the strikes, so it is seeded and
  time-addressable and the harness can photograph one on demand.
- Its intensity is `weather.storm`, so it is already tension-linked
  (`storm = rain · T`) — which means the cell *builds as the track builds*
  without a single new curve.
- Strikes fire **inside the cell**, and `lightningAt`'s azimuth becomes the
  bearing *to the cell* rather than a free hash. The strike then lights that
  cloud from inside, which is what the upper-air comment already says it wants
  to do, and the god-ray origin (`SUN`, scene.js:656 — already moved to the
  strike bearing) finally points at a visible object instead of an empty
  direction.
- "Bring one in" becomes a real gesture: `window.jungle.visuals.storm(...)` for
  the harness, and on the authored timeline it is the forest floor's second half.

### V3. Where lightning actually lives (S) — *do this first*

The §1.3 fix, in two parts:

1. **Give the zenith a storm.** Either a small `rain` (which is wrong — rain at
   the zenith contradicts "clear and high") or, better, decouple them: add
   `storm` as its own row in `TRACK_WEATHER` instead of deriving it from rain.
   The zenith gets a distant storm — cells on the horizon, below and beside the
   camera, lighting from within — which is a *better* zenith image than rain
   could ever be and needs no rain at all. Distant lightning over a cloud field
   you are flying above is one of the few genuinely awe-shaped images available,
   and awe is precisely what D22 says this track is for (§1.5).
2. **Let the storming track see its own clouds.** The `open` gate is correct for
   the high deck (from under the crowns there is no sky) but it also hides the
   *cell*, which is a tall object whose top is visible from below through gaps.
   The cell's visibility should key on the gaps, not on being above them.

One row, one gate, and the forest floor's `ambthunder` — sounding since D16 —
gets a picture for the first time.

### V4. Virga and the rain shaft, seen from above (S)

Once V1 and V2 exist: rain as a visible *shaft* under the cell rather than only
as the 700 camera-local streaks of K3. From above, a rain shaft is the most
legible weather object there is, and K3's snow-globe cylinder is by construction
invisible from outside itself. Cheap: a soft tapered volume under the cell,
same texture family as the clouds.

### V5. The crown sea under cloud shadow (S)

The canopy sea already exists in `makeForest` (the fill and far crowns). A cloud
that passes between the sun and the crowns should darken them — a moving dark
patch travelling on the wind direction across the canopy. This is one multiplier
on the crown vertex colours driven by cloud position, and it is the thing that
will make the clouds feel like they are *in the world* rather than painted on
the back of it. It is also the only item in this tier that pays off at canopy
altitude rather than at the zenith.

---

## Tier W — the signals the eye never reads

This is the effects half of the brief. Every item binds to a bus signal that
exists today, is authored, and has never touched a pixel — which is why this
tier is cheaper per unit of visible change than inventing new effects would be.

### W1. Warmth, rendered as agreement (M) — *the one to build*

The §1.5 gap. The question is what warmth *looks* like, and the answer must not
be colour temperature, because `BAND_GRADES` already owns warm-vs-cool as a
function of altitude (L6) and a second, contradictory warm/cool would fight it.

Warmth in the music is the third in the chord, whether the tuning locks, whether
the drums affirm the backbeat. Its common factor is **agreement** — how much the
parts consent to each other. So render it as coherence, across systems that
already have a coherence parameter sitting in them:

| system | cold (warmth → 0) | warm (warmth → 1) |
|---|---|---|
| flock / swarm | separation up, alignment down — the group scatters | tight, aligned, banking together |
| wind | direction incoherent, gusts fight | one prevailing direction, everything leans the same way |
| crowns | colour variance across the sea widens | the canopy agrees on one green |
| leaves (K4) | phyllotaxis spiral opens, sparse | closed, dense, regular |

The zenith then does what D22 wrote it to do: the camera keeps climbing into
more light while the world stops agreeing with itself — brightness up, coherence
falling. That is awe rather than triumph, in the picture, for the first time.

Implementation is a pure function in `look.js` or the new `fauna.js`
(`coherenceAt(warmth)`), one `bus.warmthAt(t)` call in the frame loop, one more
field on `env`, and a handful of systems reading `env.warmth`. Testable in
`test/look.mjs` the way everything pure here is.

### W2. Tuning as chromatic register (S) — *cheapest interesting item in the document*

Every track carries a `tuning` field and no pixel has ever read it:

```
undergrowth  { stretch: −4 }   the sag — the stack leans downward
forest floor { }               plain 12-TET
canopy       { just: 1 }       the only track that actually locks
zenith       { stretch: +3 }   stretched octaves — nothing ever settles
```

`rgbShift` is already in the chain (scene.js:243), currently driven only by
wildness and echo. Bind a small persistent chroma displacement to
`|stretch|`, and drive it to *zero* where `just: 1`. Then the canopy — the one
glad, locked, in-tune track — is the one band where the picture's colour
channels are in register, and the two out-of-tune tracks are visibly, slightly,
out of register in opposite directions.

That is a genuine synaesthetic mapping (beating ↔ misregistration) rather than a
decorative one, it costs one uniform that already exists, and it says something
true about the set that nothing else in the picture says.

### W3. Orbit as distance (S)

`orbit` is published on every event and D35 gave every track a reverb size per
orbit (`rooms: { 1: 2, 3: 7, 4: 6 }` and so on). `fire()` currently spawns every
ring and shard at a uniform random offset:

```js
const x = camera.position.x + (Math.random() - 0.5) * 8;
const z = camera.position.z - 7 - Math.random() * 5;
```

Bind the spawn distance to the room size of the event's orbit. The undergrowth's
2-second near orbit spawns rings in your face; the canopy's 11-second ether
spawns them far back. "Reverb is distance" is already this project's doctrine —
it is why fog is what it is — and this applies it to the one stream that has
been ignoring it. It also, for free, makes the zenith's drowned drums
(`rooms: {1: 9}`) *look* dematerialised instead of merely being described that
way.

Two lines and a lookup. Note it also removes two `Math.random()` calls from the
frame path, which are the only nondeterminism in the figure stream and are the
reason a figure shot cannot be reproduced exactly today.

### W4. Note, used once and honestly (S–M)

`note` is published and unread. The temptation is pitch→height, which is dead on
arrival: height is already brightness, and a second meaning for the world's main
axis would destroy the first. The temptation after that is pitch→hue, which is
the oldest cliché in the genre and says nothing.

The honest use is **interval, not pitch** — and D43 has since made this much
easier than it was when this item was written. N2 gave every track an authored
harmonic-centre cycle in its palette (`bass.roots`, scale degrees, 8 phrases
against a 17-phrase track) and N3 gave the pad a planing cycle (`pad.plane`, 5
phrases). The current chord's *name* is therefore now a pure function of the
phrase index, already authored, already on the same data the bus owns:

```js
generators.js:1477   const cycle = bp.roots ?? [1];
generators.js:1478   const centreDeg = cycle[(voice.phraseIndex ?? 0) % cycle.length];
```

So W4 becomes **the harmonic centre, rendered**, and it needs no event
subscription at all: how far the current centre sits from the tonic is a scalar
the eye can sample at any time, including ahead of itself, like every other bus
signal. That is strictly better than accumulating sounding notes — it is
clairvoyant, it is deterministic, and it is the *authored* harmony rather than a
reconstruction of it.

Implementation note: this must not become a second copy of the formula above.
Add `harmonyAt(t)` to `bus.js` (where `TRACKS` already lives), and assert in a
test that it agrees with the generators' expression for a sweep of phrase
indices — the project's own idiom, and the reason `nearFieldAt` has one reader
and not two.

### W5. The Gray–Scott plane as the two-dimensional mode knob (S)

§3.3 of the theory doc, verbatim:

> The Gray–Scott parameter plane is a two-dimensional mode knob — small moves in
> `(F, k)` change the pattern's *species*.

`makeRoots` currently does this (biomes.js:325):

```js
const F = 0.030 + 0.016 * env.b;
const k = 0.062 - 0.005 * env.b;
```

Both coordinates move, but both are functions of the *same* scalar — so the sim
walks the parameter plane along a single straight line. A two-dimensional mode
knob is being used as a one-dimensional one, and the bus has exactly two
harmonic axes to offer it. Bind `k` to warmth instead (or to W4's consonance)
and the roots get the whole plane: the morphology becomes a readout of the
harmonic state in both of its dimensions, which is what the family was chosen
for and is currently half-used.

Cheap, and it interacts well with W1 — the zenith's diverging axes would drive
the roots somewhere on that plane the set has literally never visited.

### W6. The section, past the ink (S)

`sectionAt` (D11) reaches the visuals and, since D42 deleted the recurring form,
now drives exactly one thing: the ink style. The styles doctrine is explicit
that a fifth style should be resisted, and it is right — so spend the section on
the *world* instead, where the "spent, not sprinkled" rule does not apply:

- `build` / `build2` — fauna grow restless (episodic rates up, flock waypoints
  more frequent). Accumulation without a new effect.
- `breakdown` — the animals go quiet and still. The ink is already stripping the
  picture to its lines; the world should empty out under it.
- `peak` — the flush (U5) is allowed to fire on more than the toucan.
- `intro` — nothing. The intro is ether and a bare heartbeat; an empty world is
  the correct picture and is currently accidental rather than chosen.

---

## Tier X — the rail's missing twins

Six knobs, no eye (§1.6). Each of these is small; the tier is listed together
because they share one rule: **idle must remain identity.** Every item below is
zero at the knob's rest position, which is what lets H1's promise survive.

### X1. The gater, rendered (S)

`gate` is a bar-locked square gater at eighths. Its twin is a strobe — the
frame's exposure gated on the same square wave, at the same depth. This is the
one place in the entire visual system where hard rhythmic flashing is legal,
because it is a *hand on a mixer*, not the composition: the rail is explicitly
"never a composition input" (D17), so it cannot violate the ground stream's
no-rhythm rule. It is also, by some distance, the most dramatic thing available
for one uniform.

Caution: this is a photosensitivity concern in a way nothing else here is. Depth
should be capped well below full black and the cap stated in the code.

### X2. Drive (S)

Master saturation with makeup trim. Its twin is the picture pushed into its own
ceiling: highlight compression plus a bloom lift — the frame clipping the way the
mix is clipping. Note this is *not* `dim`, which is subtraction; drive adds and
then refuses to go further, which is a visibly different thing.

### X3. The EQ kills (S)

Three isolator bands, unity at rest, −40 dB at the bottom. The mapping that
works is by spatial frequency, because that is what "band" means to an eye:
`eqLow` → the large soft structures (fog, mist, the sky's gradient),
`eqMid` → the mid-scale world (trunks, crowns), `eqHigh` → fine detail (grain,
sparkle, the streak). Killing the low band should take the *body* out of the
picture the way it takes the body out of the mix.

### X4. Roll (S)

`roll` is launch-quantized drum stutter (×2/×3/×4 by quartile). Its twin is the
frame stutter: hold-and-repeat the composite at the same subdivision. The
`afterImage` node is already in the chain and already has a smear amount; this is
a harder-edged sibling of it. It is the most literal twin on the rail and it is
missing.

### X5. Coupling, honestly rendered (S) — *the §1.7 fix*

`duck = 1` becomes `duck = params.coupling` (or the same `0.4 + 0.6·T` shape the
audio uses, which would be exact). One line. Makes scene.js's header true.

---

## Tier Y — plumbing

### Y1. `fauna.js`, pure

Same treatment as `look.js`, `weather.js` and `perform.js`: the schedules, the
gaits, the flush envelope, the band windows, the coherence curve — all pure
functions of `(t, seed, env)`, no three.js, no state. `biomes.js` imports them
and moves values. The reason is the one this project keeps proving: the claims
then become assertions in `test/fauna.mjs` instead of paragraphs here.

### Y2. The creature budget, and a governor rung

Every creature system reads `env.quality` and scales its population, exactly as
the fireflies do (`Math.max(60, N * quality)`). The clouds (V1) get their own
rung, above styles in the sell order — they are the newest and heaviest thing
and the set survives without them. The sell order becomes: clouds, styles,
optics, pixels, and the groove never.

### Y3. Debug surface and harness assertions

The pizzaz pass learned this the hard way and wrote it down: *a screenshot cannot
tell you a uniform was zero.* So, on `window.jungle.visuals`:

- `setFauna(spec)` / `debugFauna()` — populations, band windows, what each
  creature is doing this frame.
- `flush()` — fire the toucan startle on demand, since waiting two phrases per
  attempt makes it untestable by hand.
- `storm(f)` / `debugSky()` — pin a cell in frame; the same reason `strike()`
  exists.
- Query params for the repeatable shots: `?fauna=0`, `?storm=1`.

And the pins must genuinely pin against the governor, for the same reason
`setStyles` had to.

### Y4. Tests

`test/fauna.mjs`, following `test/weather.mjs`'s example: schedules are seeded
and reproducible; no two individuals share a period (the desynchronisation
discipline, asserted rather than commented); band windows are continuous in
altitude so no creature can pop at a boundary; flush envelopes are bounded; the
population respects the quality dial. Plus, in `test/look.mjs`: warmth at rest
is identity, and every new rail twin is zero at its knob's rest value.

---

## Open decisions — a call is needed before the item starts

1. **Frogs: forest floor, undergrowth, or both?** §U3 recommends both, with the
   forest floor getting tree frogs at eye level (as asked) and the undergrowth
   getting the pool chorus (where `ambfrogs` actually sounds, and nearly free).
   If only one, the forest floor one is the one that was asked for and the
   undergrowth one is the one that is cheaper and better motivated.
2. **Sloths: hanging where asked, or where they live?** The brief says
   undergrowth and §U2 agrees with it on camera grounds (the gaze in that band
   climbs). Ecologically a sloth is a canopy animal, and a second one high in the
   crowns during the canopy track is the same system with one constant changed.
   Cheap to do both; needs a call on whether the doubling reads as a motif or as
   a repetition.
3. **How representational should an animal be?** This world is soft, additive,
   near-abstract — glow clouds, cards, instanced shapes. A recognisable sloth
   silhouette is a sharper object than anything currently in the ground stream,
   and D28/D40 removed the recurring glyph twice for looking wrong. Two ways out
   if it does not read: silhouette-only (near-black against the shafts, no
   interior detail), or motion-only (the animal is a disturbance — a shape you
   infer from what moves — which is what `ambrustle` is doing in the audio and
   is arguably the more honest answer for this world).
4. **Does the zenith storm at all?** §V3 argues for distant cells on the horizon,
   which needs `storm` decoupled from `rain` in `TRACK_WEATHER`. The alternative
   is to leave the zenith clear and put every thundercloud on the forest floor,
   which is more literal and less interesting.
5. **Is it night or day?** The undergrowth has fireflies and a night-insect bed;
   the zenith has an open sky at full brightness. Both are defensible (a
   rainforest floor is genuinely at 2% of open-sky light at noon, and fireflies
   fly at dusk), but the cloud work in Tier V will force the question, because a
   cloud has to be lit by something. Recommend: late afternoon throughout, which
   keeps the shafts, keeps the fireflies plausible at the bottom, and gives the
   clouds a low warm source that agrees with `BAND_GRADES[3]`.

---

## Rules this must not break

Restated because Tier U is the most tempting place in the project to break the
first two:

1. **`visuals = V(S, seed_v)`, never `V(audio)`.** No FFT, no analyser, ever. An
   event-driven behaviour reads the *published bus event*, which is a scheduled
   fact, not a signal that was listened to.
2. **No rhythm on the ground stream.** §U1's three tiers, and one anchored
   behaviour per creature at most.
3. **Idle is identity on the rail.** Every Tier X twin is zero at its knob's
   rest position.
4. **The governor sells ornament before meaning, and never sells the groove.**
5. **Bar-exactness is the bus's job.** Nothing here re-derives a boundary; seams
   are read from `seamAt`.
6. **Purity where a claim is made.** If it can be a pure function in `fauna.js`
   with a test, it is not allowed to be a paragraph in this document.

---

## Verified vs unverified

**Verified — arithmetic on constants in the repo:**

- The zenith's storm is identically zero (`rain: 0.00`, `storm = rain · T`).
- The cloud deck is gated on `open`, which is zero below `CANOPY_BASE`.
- `scene.js` filters the event stream to `bd` and `sd`.
- `note` and `orbit` are published and read nowhere in `src/visuals/`.
- `warmth` is read nowhere in `src/visuals/`.
- `look.js` reads 5 of the 11 `PERFORM_DEFAULTS` keys.
- The audio duck scales with `params.coupling`; the visual duck is a flat 1.
- `makeRoots` drives both `F` and `k` from brightness alone, so the Gray–Scott
  plane is traversed along one line.
- The pool fades out by camera y ≈ 26; the forest floor's camera is at y 18–32.
- `BAND_PITCH` is `[5.0, 1.5, −1.0, −8.0]` — the undergrowth looks up, the
  zenith looks down.

**Settled since, by photograph:**

- ~~**That the zenith's cloud sheets are substantially out of frame**~~ ✅
  **confirmed, and fixed.** The `sky-clouds` shot at altitude 0.90 on the old
  build contained no cloud whatever; the deck was at y 72–82 above a camera at
  y 45–56 tilted 8° down. V1 replaced it with a field the camera flies inside.
- ~~**Whether 40–80 birds at canopy distance read as birds or as specks.**~~
  They read — but only where they cross something bright, which is the correct
  behaviour for a silhouette and is exactly why the sloths could not use the
  same treatment (D45).

**Still unverified:**

- **Whether the sloth reads as an animal in motion.** Four passes got it from
  invisible to a legible hanging mass; a still frame cannot answer the rest.
- **That a strike currently lights the high deck visibly from under the canopy**
  (the material is additive with `fog: false`, but depth-tested against opaque
  crowns, so it may be correctly occluded).
- **Frame cost on real hardware.** The whole pass was developed against
  swiftshader, where the governor sits near the bottom of its ladder by design;
  V1 adds ~180 billboards and is the first item since the pizzaz pass with a
  serious chance of costing real milliseconds. It is the governor's top rung, so
  the failure mode is "the clouds go away", not "the groove goes away".

---

## Deliberately not in this pass

- **A fifth full-frame style.** The doctrine resists it and W6 routes the
  section into the world instead.
- **Resurrecting the moth.** Sloth fur really does host its own species of moth,
  and it is a lovely fact, and the recurring glyph was removed twice (D28, D40)
  for looking wrong. Not a third time.
- **Real volumetric clouds.** V1 is impostors. Raymarched cloud is a renderer
  project of the same class D39 correctly priced and declined for lighting.
- **Fauna that respond to each other across species.** One predator-prey
  relationship would be the most alive thing in the world and it is a whole
  system; not before the four creatures individually read.
- **Ground-truth animation.** No skeletons, no IK, no imported rigs. Everything
  here is procedural for the same reason everything else is: it has to be a
  function of the bus and a seed, or it cannot be reproduced in a shot.
