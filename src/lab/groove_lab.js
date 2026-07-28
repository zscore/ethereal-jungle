/**
 * groove_lab.js — an audition bench for the D23 skeleton placements.
 *
 * The standing complaint (docs/TODO.md §5) is that `KICK_EXTRAS` and
 * `SNARE_GHOSTS` were chosen from idiom and never checked by ear:
 * `test/groove.mjs` proves the figures vary and that the anchors never move,
 * and says nothing at all about whether they sound good. Those are different
 * questions and only one of them is answerable offline.
 *
 * So this page boots the real engine — the same generators, the same casts, the
 * same seeded draw — and swaps the bags underneath it at runtime via
 * `GROOVE_BAGS`, so candidates can be heard against each other in the actual
 * arrangement rather than in isolation. No scene: this is an ear test, and the
 * renderer is the single most expensive thing in the process.
 *
 * Verdicts persist to localStorage and render as text to paste back.
 */
import { bus, TRACKS, sectionSpans, trackStartBar } from '../bus.js';
import { initEngine, rebuild, seekToBar, toggle } from '../music/engine.js';
import { GROOVE_BAGS, KICK_EXTRAS, SNARE_GHOSTS } from '../music/generators.js';

const ANCHORS = new Set([0, 4, 8, 12]);
const STORE_KEY = 'groove-lab-verdicts-v1';

// ---------------------------------------------------------------- candidates
// Each bag keeps the D23 contract: 16th positions, never on an anchor. What
// varies is WHERE the weight sits relative to the beat — which is the actual
// open question, and the one a listening test can settle.
const KICK_BAGS = [
  {
    key: 'shipped',
    name: 'A — shipped (idiom)',
    desc: 'What is in main today: the "and of 3" and a late pickup, mostly single hits.',
    bag: KICK_EXTRAS,
  },
  {
    key: 'sparse',
    name: 'B — sparse',
    desc: 'The same vocabulary, but one hit at a time. Tests whether the doubles are what make it busy.',
    bag: [[10], [14], [6], [10], [3], [11], [10]],
  },
  {
    key: 'busy',
    name: 'C — busy',
    desc: 'Two and three extras per bar. Tests whether the floor can carry more before it turns to mud.',
    bag: [[3, 10], [6, 11], [2, 10, 14], [10, 14], [3, 6, 11], [6, 10, 14], [2, 6, 11]],
  },
  {
    key: 'pushed',
    name: 'D — pushed (anticipation)',
    desc: 'Everything on the "a" before a beat (3/7/11/15) — leans forward, pulls the bar early.',
    bag: [[3], [7], [11], [15], [3, 11], [7, 15], [3, 7, 11]],
  },
  {
    key: 'laidback',
    name: 'E — laid back',
    desc: 'Everything just after a beat (1/5/9/13) — drags, sits behind the anchor.',
    bag: [[1], [5], [9], [13], [1, 9], [5, 13], [9, 13]],
  },
];

const SNARE_BAGS = [
  {
    key: 'shipped',
    name: 'A — shipped (idiom)',
    desc: 'What is in main today: ghosts clustered around 7 and 13.',
    bag: SNARE_GHOSTS,
  },
  {
    key: 'sparse',
    name: 'B — sparse',
    desc: 'One ghost per bar. Tests whether the clusters are doing any work.',
    bag: [[13], [7], [11], [13], [5], [7], [13]],
  },
  {
    key: 'busy',
    name: 'C — busy',
    desc: 'Three and four ghosts — the rolling, chattering floor.',
    bag: [[7, 10, 13], [3, 7, 11], [5, 7, 13], [7, 11, 14], [3, 7, 11, 14], [5, 9, 13], [7, 10, 13, 15]],
  },
  {
    key: 'pushed',
    name: 'D — pushed (anticipation)',
    desc: 'Ghosts on the "a" — answers the backbeat early.',
    bag: [[3], [11], [3, 11], [7, 15], [3, 7, 11], [11, 15], [3, 15]],
  },
  {
    key: 'laidback',
    name: 'E — laid back',
    desc: 'Ghosts after the beat — the shuffle-ish, dragging feel.',
    bag: [[5], [9], [13], [9, 13], [1, 5, 9], [5, 9], [9, 14]],
  },
];

const SEEDS = [1, 2, 3, 7, 12];

// ------------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
const state = {
  track: 0,
  section: 'groove',
  seed: 1,
  kick: 'shipped',
  snare: 'shipped',
  force: true,
  playing: true,
};
const verdicts = new Map(Object.entries(JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')));

const bagOf = (list, key) => list.find((b) => b.key === key) ?? list[0];
const verdictKey = () =>
  `${TRACKS[state.track].name} / ${state.section} / kick:${state.kick} + snare:${state.snare}`;

/** Original per-track densities, so "force" is reversible. */
const ORIGINAL_DENSITY = TRACKS.map((t) => ({
  extras: t.palette?.kick?.extras,
  ghosts: t.palette?.snare?.ghosts,
}));

/**
 * `placements` draws only when rng() <= density * lift, and the section lift
 * runs as low as 0.2 in the intro — so at shipped densities most phrases are
 * bare. That is right musically and useless for auditioning, so the lab can pin
 * the draw on. 5 clears every lift in SKEL_LIFT.
 */
function applyDensity() {
  TRACKS.forEach((t, i) => {
    if (!t.palette) return;
    if (t.palette.kick) t.palette.kick.extras = state.force ? 5 : ORIGINAL_DENSITY[i].extras;
    if (t.palette.snare) t.palette.snare.ghosts = state.force ? 5 : ORIGINAL_DENSITY[i].ghosts;
  });
}

function sectionsFor(trackIndex) {
  return sectionSpans(TRACKS[trackIndex].bars).filter((s) => s.name !== 'seam');
}

function renderGrid(host, bag) {
  host.innerHTML = '';
  for (const option of bag) {
    const row = document.createElement('div');
    row.className = 'bagrow';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = option.join(',');
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (ANCHORS.has(i)) cell.classList.add('anchor');
      if (i % 4 === 0) cell.classList.add('beat');
      if (option.includes(i)) cell.classList.add('on');
      grid.appendChild(cell);
    }
    row.append(n, grid);
    host.appendChild(row);
  }
}

function applyBags() {
  GROOVE_BAGS.kick = bagOf(KICK_BAGS, state.kick).bag;
  GROOVE_BAGS.snare = bagOf(SNARE_BAGS, state.snare).bag;
}

function jump() {
  const span = sectionsFor(state.track).find((s) => s.name === state.section);
  if (!span) return;
  seekToBar(trackStartBar(state.track) + span.startBar);
}

function refreshVerdictUI() {
  const rec = verdicts.get(verdictKey());
  for (const [id, v] of [['yes', 'good'], ['meh', 'meh'], ['no', 'bad']]) {
    $(id).classList.toggle('sel-yes', rec?.verdict === v && v === 'good');
    $(id).classList.toggle('sel-no', rec?.verdict === v && v === 'bad');
  }
  $('note').value = rec?.note ?? '';
  $('scored').textContent = verdicts.size
    ? `${verdicts.size} pairing${verdicts.size === 1 ? '' : 's'} marked`
    : 'nothing marked yet';
  renderSummary();
}

function renderSummary() {
  if (!verdicts.size) { $('out').value = '(no verdicts yet)'; return; }
  const lines = ['GROOVE LAB — verdicts', ''];
  for (const [key, rec] of verdicts) {
    lines.push(`${rec.verdict.toUpperCase().padEnd(5)} ${key}${rec.note ? `\n      note: ${rec.note}` : ''}`);
  }
  lines.push('', 'Bags under test:');
  for (const b of KICK_BAGS) lines.push(`  kick:${b.key.padEnd(9)} ${JSON.stringify(b.bag)}`);
  for (const b of SNARE_BAGS) lines.push(`  snare:${b.key.padEnd(8)} ${JSON.stringify(b.bag)}`);
  $('out').value = lines.join('\n');
}

function fillSelect(el, items, value) {
  el.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it.value;
    o.textContent = it.label;
    el.appendChild(o);
  }
  el.value = value;
}

function syncSectionOptions() {
  const names = sectionsFor(state.track).map((s) => ({ value: s.name, label: s.name }));
  if (!names.some((n) => n.value === state.section)) state.section = names[0].value;
  fillSelect($('section'), names, state.section);
}

function refreshBagUI() {
  const k = bagOf(KICK_BAGS, state.kick);
  const s = bagOf(SNARE_BAGS, state.snare);
  $('kickdesc').textContent = k.desc;
  $('snaredesc').textContent = s.desc;
  renderGrid($('kickgrid'), k.bag);
  renderGrid($('snaregrid'), s.bag);
}

// ---------------------------------------------------------------------- boot
$('overlay').addEventListener('click', async () => {
  $('overlay').style.display = 'none';
  try {
    await initEngine();
  } catch (err) {
    $('overlay').style.display = 'flex';
    $('overlay').querySelector('p').textContent = `engine failed: ${err.message} (see console)`;
    console.error('[lab]', err);
    return;
  }

  fillSelect($('track'), TRACKS.map((t, i) => ({ value: String(i), label: t.name })), '0');
  syncSectionOptions();
  fillSelect($('seed'), SEEDS.map((s) => ({ value: String(s), label: `seed ${s}` })), '1');
  fillSelect($('kickbag'), KICK_BAGS.map((b) => ({ value: b.key, label: b.name })), state.kick);
  fillSelect($('snarebag'), SNARE_BAGS.map((b) => ({ value: b.key, label: b.name })), state.snare);

  applyBags();
  applyDensity();
  refreshBagUI();
  refreshVerdictUI();
  rebuild();
  jump();

  $('track').addEventListener('change', (e) => {
    state.track = Number(e.target.value);
    syncSectionOptions();
    refreshVerdictUI();
    jump();
  });
  $('section').addEventListener('change', (e) => {
    state.section = e.target.value;
    refreshVerdictUI();
    jump();
  });
  $('seed').addEventListener('change', (e) => {
    state.seed = Number(e.target.value);
    bus.params.seed = state.seed;
    rebuild();
  });
  $('kickbag').addEventListener('change', (e) => {
    state.kick = e.target.value;
    applyBags(); refreshBagUI(); refreshVerdictUI(); rebuild();
  });
  $('snarebag').addEventListener('change', (e) => {
    state.snare = e.target.value;
    applyBags(); refreshBagUI(); refreshVerdictUI(); rebuild();
  });
  $('force').addEventListener('change', (e) => {
    state.force = e.target.checked;
    applyDensity(); rebuild();
  });
  $('jump').addEventListener('click', jump);
  $('toggle').addEventListener('click', () => {
    toggle();
    state.playing = !state.playing;
    $('toggle').textContent = state.playing ? 'Pause' : 'Play';
  });

  for (const [id, v] of [['yes', 'good'], ['meh', 'meh'], ['no', 'bad']]) {
    $(id).addEventListener('click', () => {
      verdicts.set(verdictKey(), { verdict: v, note: $('note').value.trim() });
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(verdicts)));
      refreshVerdictUI();
    });
  }
  $('save').addEventListener('click', () => {
    const rec = verdicts.get(verdictKey()) ?? { verdict: 'meh' };
    verdicts.set(verdictKey(), { ...rec, note: $('note').value.trim() });
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(verdicts)));
    refreshVerdictUI();
  });
  $('copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('out').value).catch(() => {});
    $('copy').textContent = 'Copied';
    setTimeout(() => { $('copy').textContent = 'Copy'; }, 1200);
  });
  $('clear').addEventListener('click', () => {
    verdicts.clear();
    localStorage.removeItem(STORE_KEY);
    refreshVerdictUI();
  });

  // live drum readout: what the bags are actually producing, right now
  const recent = [];
  bus.subscribe((e) => {
    if (e.type !== 'hap' || (e.orbit ?? 0) !== 1) return;
    recent.push({ s: e.sound, t: performance.now() });
    if (recent.length > 400) recent.splice(0, 200);
  });
  setInterval(() => {
    const cutoff = performance.now() - 4000;
    const live = recent.filter((r) => r.t >= cutoff);
    const counts = {};
    for (const r of live) counts[r.s] = (counts[r.s] ?? 0) + 1;
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `  ${s.padEnd(10)} ${n}`);
    $('live').textContent = [
      `${TRACKS[state.track].name} · ${state.section} · seed ${state.seed}`,
      `kick:${state.kick}  snare:${state.snare}`,
      '',
      'drum hits, last 4s:',
      ...(rows.length ? rows : ['  (nothing yet)']),
    ].join('\n');
  }, 700);
}, { once: false });
