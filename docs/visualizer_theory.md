# The Visualizer as a Formal System
 
A theoretical companion to *Ethereal Jungle as a Formal System* (all § references point there). Subject: the space of visualizers we could build for the set — what a visualizer *is*, formally; which families of visualizer exist and what each can and cannot express; and how to transition between them across a set, which turns out to be the same theory as transitioning between tracks, one sense-organ over. Deliberately abstract: no shader code, no tool names until the final checklist. A later document makes this concrete.
 
**The aesthetic thesis, restated for the eye:** the music is maximal metric dissonance inside maximal harmonic stasis; the visuals must be *maximal kinetic violence inside maximal spatial serenity*. Same sentence, different modality. Everything below is a theory of how to render one half of that sentence, or of the boundary between the halves.
 
**The architectural thesis, which is stronger:** the visualizer is not a listener. It is an instrument.
 
---
 
## 1. Against audio-reactivity: the shared-bus principle
 
The conventional visualizer is a hard-of-hearing session musician. It stands next to the band and estimates, by FFT and onset detection, quantities the composition already knows exactly. This is inference of the known — lossy, laggy, and, worst of all, blind to *intention*: an onset detector sees the snare hit but not the countdown it belongs to; it cannot tell a fill from a stumble; it registers the drop only once the drop has already happened, which is one bar too late to mean anything.
 
Our music does not have this problem, because our music is generated. The entire track is a function of a small set of signals (§4): the tension curve `T(t)`, the 1/f `drift(t)`, the wildness `w(T)`, the mode `mode(T)`, anchor strength, and a scheduled event stream that includes every seam. So the founding architectural decision:
 
```
music   = M(S, seed_m)        S = {T(t), drift(t), w, mode, anchors, events…}
visuals = V(S, seed_v)        never  V(audio)
```
 
Two functions of the same signals, never functions of each other. This is §4's principle — generators never communicate directly; coherence emerges because all limbs read one will — extended by exactly one limb. The visualizer joins the ensemble the way the bass generator did: by subscribing to the bus.
 
Two corollaries with teeth. First, **clairvoyance**: `S` contains the future. The tension curve is authored; the seams are scheduled. A reactive visualizer is strictly causal, which is why reactive visuals always feel like followers; a score-reading visualizer can begin its ascent *before* anything is audible, so that by the time the drop arrives the light in the room has already told the body something is coming. Foreshadowing — half of §5's expectation machinery — is simply unavailable to a visualizer that listens. Second, **addressability**: separate seeds mean visual variation can be re-rolled while musical structure stays locked, and vice versa. The two media share their skeleton, not their dice.
 
---
 
## 2. The mapping problem: what corresponds to what
 
Given the bus, the theoretical question is the *dictionary*: which musical dimensions map to which visual ones. The answer is not arbitrary. Cross-modal correspondence research (Spence) documents robust, largely culture-stable mappings: pitch height to spatial elevation, loudness to size and luminance, timbral sharpness to angularity (the bouba/kiki effect), tempo to speed. The genre's registral theology (§2.3) was already spatial — sub as floor, ether as heavens, scooped middle — so the dictionary mostly writes itself:
 
```
mode brightness   → palette temperature, altitude of the light
register          → elevation and depth   (sub underfoot; ether overhead)
DRR / reverb      → fog density, depth of field       (distance in both senses)
attack sharpness  → edge hardness
detune / beating  → shimmer, interference, slow parallax
w (wildness)      → glitch amount, edit rate of the figure
T(t)              → everything, gently  (density, speed, exposure)
```
 
### 2.1 The visual stream vector
 
§3.1's central construction carries over verbatim. Assign every visual element a vector:
 
```
v(element) = (edge_hardness, speed, depth, scale, discreteness)
```
 
and require the set of vectors to cluster bimodally. The **figure** stream: hard-edged, fast, near, small, discrete — the eye's drums. The **ground** stream: soft, slow, far, vast, continuous — the eye's ether. Gestalt grouping (common fate, proximity, similarity) is the visual system's Bregman, and it fails the same way: a medium-speed, somewhat-soft, mid-depth element blurs the scene and dissolves the magic. The mixing folklore translates directly — "don't put reverb on the drum bus" becomes "no motion blur on the figure, no hard edges in the ground."
 
The sidechain (§3.3) should be rendered twice. It is the one audible point of contact between heaven and the machine; make it the one *visible* point too — the kick that ducks the ether also compresses the fog, dips the bloom, shoves the camera two pixels. One coupling constant, `duck(T)`, expressed in both media, and modulating it still means modulating how much the two worlds touch.
 
### 2.2 The synch-point economy
 
Chion's *synchresis*: sound and image weld at moments of exact synchrony, and the weld is what makes an audiovisual object feel like one event rather than two coincident ones. Synch points are a *currency*, and the classic failure mode — mickey-mousing, mapping every onset to a visual event — is synchresis inflation: spend on everything and every purchase is worthless. Mapping density obeys the same 1/f law as everything else (§3's Voss–Clarke result, applied to the mapping itself): mostly sparse, occasionally dense, never uniform.
 
Barlow's indispensability (§1.2) already ranks every grid position; use it as the price list. Spend synch points on the anchor skeleton — the downbeat, the 2-and-4 snares — and let the break's interior chaos go visually unmarked. This has a consequence worth stating as a claim: **a visual downbeat is a metric anchor.** If the eye confirms the grid, the ear can tolerate more violation of it — total permissible dissonance is an increasing function of anchor strength (§1.2), and the visualizer can supply anchor strength. The visuals don't just decorate the music's grid; they help hold it, which licenses a higher `w` than audio alone could support.
 
---
 
## 3. A taxonomy of visualizer families
 
A visualizer family is a formal system: a state space, a dynamics, a natural timescale, and an **affordance profile** — which musical dimensions it can express without strain. No family affords everything, and the reason is always its dynamics. Six families cover the space we care about; the first five are generators, the sixth is a class of operators.
 
### 3.1 Growth systems (L-systems, space colonization, vines)
 
The literal jungle. A grammar is a motif; rewriting is transformation; the grown form is the history of its own generation. Dynamics are *integrative* — state accumulates and never resets — which makes growth the visual analog of brown noise: all memory. Affordances follow: superb at long arcs (`T` as growth rate and branching angle, `mode` as species and palette), essentially incapable of rhythm — a tree cannot dance at 170 BPM, and growth reads at the half-time layer (§1.4) and slower. Rhythm enters only as *events on the surface*: blooms on anchors, gusts on fills, spore-bursts on ghost notes. Ground stream by nature.
 
### 3.2 Field systems (flow fields, curl noise, fluids, fog)
 
`drift(t)` made visible: 1/f correlation extended into space. Field systems have no individuals, only densities and currents — purely statistical objects, which makes them the ether's native medium: pure ground, superb at texture and at harmony-as-weather, expressing distance (fog, haze, light shafts) directly. Events can only *perturb* them — an impulse injects vorticity that the field then digests — which is exactly the right relationship between a drum hit and the ether.
 
### 3.3 Local-rule systems (cellular automata, reaction–diffusion)
 
Rich local motion, zero global progress: the precise visual analog of tendency-free dissonance (§2.1) — maximally alive, going nowhere, shimmering but demanding nothing. The Gray–Scott parameter plane is a two-dimensional mode knob: small moves in `(F, k)` change the pattern's *species* — spots to stripes to labyrinths — the way a modal shift re-colors a drone without moving it. Affords harmonic color and texture at the middle timescale; poor at both rhythm and long arcs.
 
### 3.4 Self-similar systems (IFS, raymarched fractals, kaleidoscopes, tunnels)
 
§5's fractal thesis literalized: the same structure at every scale, on screen. The infinite zoom is the eye's shimmer reverb — each level an octave up, ascent without arrival — the Shepard tone rendered, and therefore the visual sound of a music with no cadences. Can serve as figure or ground depending on treatment. Standing danger: without grain it reads as math demo — this family wants artifact operators on top of it more than any other.
 
### 3.5 Corpus systems (found footage, chopped video)
 
The visual break, and the formalism of §1.1 applies *verbatim*: an ordered tuple of shots under resequencing σ, a recognizability constraint (a culturally loaded corpus signifies only if it survives), anchors, and wildness as normalized edit distance. The cut is the sharpest attack in the visual repertoire, which makes corpus systems the supreme rhythm articulators and the natural figure stream. This is, not coincidentally, where Machine Girl's actual video culture lives.
 
### 3.6 Artifact operators (feedback, datamosh, pixel-sort, CRT/VHS, compression ghosts)
 
Not generators — transformations of another family's output, and precisely the visual sibling of §3.4's timestretch ghost: damage adopted as color. Because they are operators they compose with everything above, and `w` maps onto them directly — glitch amount *is* visual wildness. Formally the taxonomy is generators ∪ operators, and a scene is a stack `operators(generators)`.
 
### 3.7 The affordance table, and why no family suffices
 
| family | rhythm | harmonic color | texture | long arc | natural stream |
|---|---|---|---|---|---|
| growth | poor | good | good | superb | ground |
| fields | poor | good | superb | good | ground |
| local-rule | poor | superb | superb | poor | ground |
| self-similar | fair | good | good | good | either |
| corpus | superb | poor | fair | fair | figure |
| artifact ops | good (as modulation) | fair | good | — | either |
 
Read the columns and the two-stream conclusion falls out: rhythm affordance and ground affordance are nearly disjoint. **A complete scene is therefore one ground-affording generator plus one figure-affording generator plus operators, all reading the bus** — which is the two-stream theory again, and the visual restatement of why the music needs both a break and a pad. A single-family visualizer is a track with only drums or only ether.
 
---
 
## 4. Transitions: paths through visualizer space
 
A set traverses visualizers as it traverses tracks, and §6 reapplies wholesale — this is the theoretically satisfying part again: nothing new is needed.
 
### 4.1 Distance and pathfinding
 
Define a distance between scenes:
 
```
d(V_A, V_B) = α·palette_distance + β·motion_statistics_gap
            + γ·(1 − shared_operators) + δ·dimensionality_gap
```
 
— motion statistics (mean speed, direction distribution, spectral content of the optical flow) being the visual analog of key, since they are what the eye acclimates to. A good visual set order is a low-cost path through scene space: the same traveling-salesman relaxation as §6.2, and the same joint optimization if you fold `d(A,B)` for the audio and video into one cost.
 
### 4.2 The continuity layer, ranked
 
§6.1's common-tone principle: across every boundary, at least one visual element survives, so the change reads as transformation of a world rather than replacement of one world by another. Candidates, in ascending strength: film grain and vignette (cheap, weak — a shared frame, not a shared world); the palette's center of gravity (strong — color is slow to re-adapt); and the **camera's motion signature** (strongest — motion continuity is quasi-vestibular, felt in the body, and if the camera keeps drifting the same way the entire world can be exchanged around it and the cut reads as *travel*). The asymmetry rule carries over intact: the outgoing scene's figure — the cuts, the creatures — dies *before* the boundary, because the figure is the strongest stream and drags the old world's identity across if it survives; the incoming scene's ground — its fog, its field — infiltrates *early*, because the weakest stream enters unnoticed.
 
### 4.3 The visual seam operator
 
```
vseam(A→B) =  tension_spike            # acceleration, exposure rise — a countdown
            ⊕ intensified_exit(A)      # A's figure peaks, then vanishes pre-boundary
            ⊕ continuity(A ∩ B)        # grain, palette center, camera motion
            ⊕ foreshadow(B)            # B's ground at low opacity, behind the fog
            ⊕ clean_reveal(B)          # the new world lands on the downbeat
```
 
And the crossfade fails for exactly §6.3's reason: dissolving two complete scenes superimposes two figures and two grounds — four streams — and the eye's scene analysis collapses into confusion. The seam operator maintains a valid two-stream scene at every instant while swapping which *world* supplies each stream.
 
### 4.4 The one-world solution
 
§6.2 had a degenerate solution — one tonal center for the whole set, all harmonic story on the brightness axis — and it has an exact visual analog worth naming as this document's central proposal. Instead of *switching* visualizer families, build **one continuous world in which each family governs a region**: the root system is local-rule texture, the forest floor is growth, the canopy fog is field, the sky above the canopy is self-similar geometry, and somewhere in the undergrowth a corpus shrine flickers with chopped video. Then a transition is not a switch but a **traversal** — the camera travels — and `d ≡ 0` by construction: every boundary is visually legal, the taxonomy's families become *biomes* rather than scenes, and the set becomes one long shot.
 
The two degenerate solutions should be adopted together, because they share an axis. Let **altitude be mode brightness**: phrygian among the roots, aeolian on the floor, dorian in the canopy, lydian in the light above it. Then the set's entire harmonic story — a brightness walk over a fixed center — is literally rendered as a journey upward or downward through the jungle, the camera's height is a function of `mode(t)`, and the visual set inherits the musical set's one-piece-ness for free. For an ethereal jungle specifically, this is almost certainly the right answer: the genre's registral theology (§2.3) already says the heavens are up.
 
---
 
## 5. The economics of visual attention
 
§5's expectation machinery — Meyer, Huron, Margulis — applies to the eye, but the eye has a different budget, and three visual-specific facts govern how to spend it.
 
**The visualizer is ground by default.** The audience came to hear; vision is the accompanying channel, and a visualizer that demands figure status all night is a soloist who won't stop. The default state is landscape — nothing perceptibly *starting*, per §3.2's attack theory — and the visuals earn figure status only at authored moments, then hand it back.
 
**Change blindness is a resource.** The eye confirms world-stability only across fixations; during flashes, cuts, and high global motion, substantial rewrites of the scene pass unnoticed. Every drop is therefore a *cut-safe point*: the moment of maximum audio event is the moment the world can be swapped wholesale, invisibly — expectation arithmetic (§5) tells you exactly when that moment lands, and clairvoyance (§1) means the visualizer knows it in advance. Conversely, during stasis, change must be glacial or it reads as a glitch — unless `w` is high and glitch is the point, which is the one regime where the artifact operators legitimately touch the ground stream.
 
**Repetition legitimizes here too.** The set's single melodic cell (§6.4) needs a visual sibling — one glyph, one silhouette, one creature — recurring under transformation across tracks. Three appearances make it an institution; its deviation then becomes an event. This is what converts a night of scenes into an argument.
 
And one climax rule, spent once per set: keep the two visual streams strictly segregated all night, and at the set's golden-ratio climax — maximum wildness, maximum sidechain coupling — let them **fuse**. The fog ignites; the creatures and the weather become one system; figure and ground briefly refuse to parse apart, in the audio and the video in the same bar. Stream fusion is the one effect this whole document forbids everywhere else, which is precisely what makes it the climax.
 
---
 
## 6. What any framework must give you
 
The theory compiles to a checklist, mirror-image of §7: (1) **external control signals as first-class inputs** — the bus of §1, sampled on the audio clock, not estimated from the audio; (2) **an event stream with look-ahead** — foreshadowing requires reading the future, so a merely reactive input port disqualifies a tool no matter how pretty its output; (3) **seedable randomness**, seeds independent of the music's; (4) **independent render layers with per-layer post-processing** — the visual stream vector requires per-stream treatment; a single global effects chain is the visual equivalent of one reverb on the master bus; (5) **one clock**, phase-locked to the music's scheduler; (6) **operators composable over generators**, so the artifact family can wrap any biome. Shader environments, node-based compositors, creative-coding frameworks, and game engines can all satisfy the list; as with §7, they differ in ergonomics, not in what theory they can express — with the one caveat that the browser has a thumb on the scale for us, since the music side may already live there and clause (5) is easiest when both media share a process.
 
## Further reading
 
- Chion, *Audio-Vision* — synchresis, added value; the economics of §2.2.
- Spence, "Crossmodal Correspondences: A Tutorial Review" (*Attention, Perception, & Psychophysics*, 2011) — the empirical basis of the mapping dictionary.
- Whitney, *Digital Harmony* — the founding argument that visual motion can be *harmonic*, built from ratio and interference like pitch; the deep ancestor of §2.
- Prusinkiewicz & Lindenmayer, *The Algorithmic Beauty of Plants* — the growth-system family in full.
- Turing, "The Chemical Basis of Morphogenesis"; Pearson, "Complex Patterns in a Simple System" — the reaction–diffusion parameter space of §3.3.
- Simons & Levin, "Change Blindness" — the attentional resource of §5.
- Wertheimer's Gestalt grouping principles, alongside Bregman — the two scene-analysis theories §2.1 splices together.