/**
 * weather.js — the shared atmosphere (pizzaz proposal K1/K7/M2).
 *
 * The diagnosis this module answers: before it, every biome breathed on its
 * own private sine. The mist scrolled, the shafts flickered, the ether
 * advected, the aurora drifted — four good systems, four unrelated clocks, so
 * the world read as a stack of dioramas rather than one place. Nothing was
 * *shared*. There was no wind.
 *
 * So: one analytic wind field, sampled by every biome at its own position, and
 * one weather state per track that says how much of it there is. Pure — no
 * three.js, no DOM, no state — for the same reason `look.js` and `perform.js`
 * are pure: the claims are then assertions in `test/weather.mjs` (the field is
 * continuous, gusts actually travel, wind is bounded, strikes are seeded and
 * reproducible) instead of paragraphs.
 *
 * Ground-rule compliance, stated up front because weather is the most
 * tempting place to break it: **weather is not rhythm.** Gusts arrive on
 * irrational periods, rain episodes walk on ~37 s, lightning fires off a
 * seeded slot schedule. Nothing here is allowed to know where the downbeat is,
 * which is exactly what makes it legal on the ground stream (§2.1). Lightning
 * is the one hard-edged event, and it is licensed as *weather* — the visual
 * twin of the forest floor's distant-thunder accent bed (D16), which has been
 * sounding with no picture since it shipped.
 */

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Deterministic integer hash → [0,1). Same input, same weather, every run. */
export function hash01(n) {
  let x = (n | 0) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

// ---------- K1: the wind ----------
// A prevailing direction that turns slowly, plus gusts modelled as a *plane
// wave travelling along that direction*. The travelling part is the whole
// point: a gust that arrives everywhere at once is a global multiplier and
// reads as a fade, while a gust that crosses the world at 16 units/s reads as
// weather moving through a place. The two crest periods are mutually
// irrational-ish so the gust pattern never quite repeats (the Eno theorem,
// §7, one more time — the same argument the high cloud deck and the ambience
// beds already make).
export const WIND = {
  turn: 0.017,     // rad/s the prevailing direction rotates
  base: 0.35,      // the always-on breeze
  gust: 1.0,       // gust amplitude over the breeze
  speed: 16,       // world units/s a crest travels
  period: 11.3,    // primary crest period, seconds
  period2: 7.1,    // …and its coprime-ish partner
};

/** Unit prevailing-wind direction at set-time t. `drift` (1/f) nudges it. */
export function windDir(t, drift = 0) {
  const th = t * WIND.turn + drift * 1.2;
  return { x: Math.cos(th), z: Math.sin(th) };
}

/**
 * Gust envelope 0..1 at world (x, z): a sharpened travelling wave. Sharpened
 * because real gusts are mostly calm with occasional arrival, not a sine.
 */
export function gustAt(t, x = 0, z = 0, drift = 0) {
  const d = windDir(t, drift);
  const along = x * d.x + z * d.z;
  const tp = t - along / WIND.speed;           // the crest crosses the world
  const a = Math.max(0, Math.sin((TAU * tp) / WIND.period));
  const b = Math.max(0, Math.sin((TAU * tp) / WIND.period2 + 1.7));
  return clamp01(a * a * a * 0.75 + b * b * b * b * 0.45);
}

export const WORLD_TOP_DEFAULT = 62;

/**
 * The wind at a world point. Every biome samples this and nothing else, which
 * is what makes them share an atmosphere.
 *
 * Altitude matters: the canopy sways, the roots barely stir. That gradient is
 * free continuity — the camera's climb through the bands is *also* a climb
 * into more weather.
 *
 * @returns {{x:number, y:number, z:number, gust:number, amp:number}}
 */
export function windAt(t, x = 0, y = 0, z = 0, opts = {}) {
  const drift = opts.drift ?? 0;
  const strength = opts.strength ?? 1;         // the track's weather.wind
  const top = opts.top ?? WORLD_TOP_DEFAULT;
  const d = windDir(t, drift);
  const gust = gustAt(t, x, z, drift);
  const alt = 0.35 + 0.65 * clamp01(y / top);
  const amp = (WIND.base + WIND.gust * gust) * strength * alt;
  return { x: d.x * amp, y: gust * amp * 0.25, z: d.z * amp, gust, amp };
}

/**
 * Peak |wind| the field can produce at `strength` — the harness's bound, and
 * the number a biome should divide by if it wants a normalized sway. Includes
 * the gust updraft (y is at most a quarter of the horizontal amplitude).
 */
export function windCeiling(strength = 1) {
  return (WIND.base + WIND.gust) * strength * Math.hypot(1, 0.25);
}

// ---------- M2: the weather axis ----------
// A second authored axis alongside brightness and tension, and the first one
// that is *per track by character* rather than by curve. Each row is the
// visual half of the biome's ambience bed (D16) — the forest floor's `ambrain`
// finally has rain in front of it, and `ambthunder` finally has lightning.
// V3 — `storm` is its own column now, and that is the whole item. It used to be
// derived (`storm = rain · T`), which coupled two things that are not the same
// thing and produced a world where the strikes and the sky could never meet:
// the zenith's rain is 0, so its storm was identically 0, so the ONE band with a
// visible sky could never have lightning in it — while the forest floor, which
// storms hard, sits under a crown layer that hides the cloud deck completely.
// Every strike in the set was therefore fired at a sky nobody could see.
//
// Decoupling them costs one column and buys the set its best available image:
// you can be dry and still be watching a storm, and from above a cloud field
// that is exactly what the top of the set should be. Rain is what falls on YOU;
// a storm is a thing over THERE — which is why the second column is `stormFar`.
//
//   storm      how much thunder this band's weather has in it at all
//   stormFar   where the cells are: 0 = overhead and on top of you,
//              1 = on the horizon, lighting from inside at a distance
export const TRACK_WEATHER = [
  // undergrowth — still, damp, close. No sky at all down here: a strike this
  // deep under the crowns is a rumour, so the cells stay far and faint.
  { mist: 0.85, rain: 0.00, wind: 0.25, storm: 0.10, stormFar: 0.95 },
  // forest floor — rain, and the thunder you are underneath (its bed is
  // `ambrain` + `ambthunder`, D16). This is the one band the storm is ON.
  { mist: 0.55, rain: 0.90, wind: 0.45, storm: 0.95, stormFar: 0.15 },
  // canopy — the windy band, the storm moving off
  { mist: 0.35, rain: 0.15, wind: 1.00, storm: 0.35, stormFar: 0.55 },
  // AD4 — the interlude. One row per entry of `TRACKS`, and this is the entry
  // that is not a biome: it holds at the canopy's last leaf for two phrases
  // while the arrangement strips to its continuity core. So its weather is the
  // held breath between two bands rather than a fifth kind of weather — it is
  // the wind dropping and the storm already gone, which is what makes the
  // zenith's own distant lightning arrive as a NEW fact rather than as more of
  // the canopy's.
  { mist: 0.25, rain: 0.05, wind: 0.45, storm: 0.10, stormFar: 0.90 },
  // zenith — clear and high, and storming somewhere else. Dry and electric at
  // once, which is the combination the old derivation could not express: rain
  // stays 0 (the brief for this band is "clear"), and the cells go to the
  // horizon, below and beside a camera that is finally above the weather.
  { mist: 0.15, rain: 0.00, wind: 0.60, storm: 0.70, stormFar: 0.95 },
];

/**
 * A slow seeded presence walk on `period` seconds, 0..1 — the same device the
 * ambience accents use (D16). Rain arrives in episodes; a track that rains
 * from bar 1 to bar 68 is a texture, not weather.
 */
export function episode(t, seed = 1, period = 37) {
  const s = t / period;
  const i = Math.floor(s);
  const f = s - i;
  const a = hash01(Math.imul(i, 2654435761) + seed * 97);
  const b = hash01(Math.imul(i + 1, 2654435761) + seed * 97);
  return a + (b - a) * (f * f * (3 - 2 * f));
}

/**
 * Weather at set-time t.
 *
 * `blend` is the seam's smoothstepped progress and `toIndex` the incoming
 * track, so the weather crossfades across a boundary exactly the way the
 * brightness walk and the ambience beds already do (§6.1: the incoming ether
 * infiltrates first). No boundary can produce a weather cut.
 *
 * @returns {{mist:number, rain:number, wind:number, storm:number}}
 */
export function weatherAt(env = {}) {
  const { t = 0, index = 0, toIndex = index, blend = 0, T = 0, seed = 1 } = env;
  const n = TRACK_WEATHER.length;
  const a = TRACK_WEATHER[((index % n) + n) % n];
  const b = TRACK_WEATHER[((toIndex % n) + n) % n];
  const x = clamp01(blend);
  const lerp = (k) => a[k] + (b[k] - a[k]) * x;

  // rain comes and goes on its own slow walk; tension can only ever add to it
  const rain = clamp01(lerp('rain') * (0.35 + 0.9 * episode(t, seed, 37)));
  return {
    mist: clamp01(lerp('mist')),
    rain,
    wind: clamp01(lerp('wind') * (0.6 + 0.6 * T)),
    // V3 — thunder on its own episode walk, at a period coprime-ish with the
    // rain's 37 s and offset in the seed, so a storm is not simply "when it is
    // raining hardest". A cell arrives, crosses, and leaves on its own clock;
    // that is what makes it an object rather than an amount (the same argument
    // the travelling gust makes against a global multiplier).
    //
    // The tension factor stays, and stays multiplicative-to-zero: thunder is
    // still likelier near the climax and there is still no thunder in a calm
    // section. That was the one good property of the old derivation and it is
    // the only part worth keeping.
    storm: clamp01(lerp('storm') * (0.3 + 0.95 * episode(t, seed * 3 + 11, 53)) * clamp01(T * 1.15)),
    // …and where the cells are. Blended like everything else here, so crossing
    // from the floor to the canopy walks the storm away from you rather than
    // teleporting it.
    stormFar: clamp01(lerp('stormFar')),
  };
}

// ---------- K7: lightning ----------
// Strikes live on a seeded slot schedule: each STRIKE_SLOT-second slot rolls
// once against the storm intensity, and a winning slot places its strike at a
// hashed offset inside itself. Pure and time-addressable — `lightningAt` can
// be asked about any instant, past or future, which is the same clairvoyance
// property every other bus signal has. Note what it is NOT: a timer, a
// counter, or anything that has to be stepped every frame to stay correct.
export const STRIKE_SLOT = 3.5;

/** Flash envelope: instant attack, exponential decay, a re-strike flicker. */
export function flashEnv(dt) {
  if (dt < 0 || dt > 1.5) return 0;
  const decay = Math.exp(-dt * 4.5);
  const flicker = dt < 0.07 ? 1 : 0.5 + 0.5 * Math.sin(dt * 38);
  return decay * flicker;
}

/**
 * Lightning at set-time t.
 * @returns {{flash:number, azimuth:number}} 0..1 and the bearing it came from.
 */
export function lightningAt(t, seed = 1, storm = 0) {
  const out = { flash: 0, azimuth: 0 };
  if (storm <= 0) return out;
  const slot = Math.floor(t / STRIKE_SLOT);
  // check the previous slot too, so a strike near a slot edge keeps decaying
  for (let s = slot - 1; s <= slot; s++) {
    const roll = hash01(Math.imul(s, 374761393) + seed * 668265263);
    if (roll >= 0.5 * storm) continue;
    const at = s * STRIKE_SLOT + hash01(Math.imul(s, 1103515245) + seed * 12345) * STRIKE_SLOT;
    const f = flashEnv(t - at);
    if (f > out.flash) {
      out.flash = f;
      out.azimuth = hash01(Math.imul(s, 22695477) + seed * 7919) * TAU;
    }
  }
  return out;
}
