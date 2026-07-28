/**
 * render.mjs — the page. Everything here is derived; nothing is authored twice.
 *
 * The shape of the page follows the shape of the argument the codebase makes:
 * one bus, two media hanging off it, and a rule that neither medium reads the
 * other. So the reader gets the signal flow first (lifted straight out of
 * README.md, so it cannot drift), then the vocabulary the music layer speaks
 * (detected, not listed by hand — a pattern method that shows up in a new
 * generator appears here on the next run), then the modules, each one leading
 * with its own header comment because those are already the best writing in
 * the repo.
 *
 * The only thing this file authors is CONNECTIVE TISSUE — group names, the
 * glossary glosses, the "how to read this" note. Everything that could go
 * stale is read from source.
 */
import { prose, summarize, highlight, escapeHtml } from './prose.mjs';

/** Reading order, and the story each group tells. Unlisted modules land in "Elsewhere". */
export const GROUPS = [
  {
    id: 'bus',
    name: 'The shared bus',
    blurb: 'The authored set timeline. Both media are functions of these signals and never of each other — the one rule the whole system is built to keep.',
    files: ['src/bus.js'],
  },
  {
    id: 'music',
    name: 'Music',
    blurb: 'Strudel patterns in, superdough events out. Pure generators (params → pattern), a scheduler that mirrors every event onto the bus before it sounds, and the perform rail sitting on top of the finished mix.',
    files: ['src/music/generators.js', 'src/music/scales.js', 'src/music/engine.js', 'src/music/masterchain.js', 'src/perform.js'],
  },
  {
    id: 'visuals',
    name: 'Visuals',
    blurb: 'One continuous world whose altitude is the mode brightness. Ground stream (slow, soft, continuous) and figure stream (sharp, near, discrete), plus the pure modules — look, weather — whose claims are unit tests rather than paragraphs.',
    files: ['src/visuals/scene.js', 'src/visuals/biomes.js', 'src/visuals/look.js', 'src/visuals/weather.js', 'src/visuals/figure.js', 'src/visuals/shrine.js'],
  },
  {
    id: 'surface',
    name: 'Control surfaces',
    blurb: 'Everything that writes to the bus from outside: the knob panel, WebMIDI, OSC over WebSocket, and the boot sequence that wires them together.',
    files: ['src/main.js', 'src/ui.js', 'src/knob.js', 'src/midi.js', 'src/osc.js'],
  },
  {
    id: 'lab',
    name: 'Benches',
    blurb: 'The engine without the scene, for questions that need ears rather than analysis.',
    files: ['src/lab/groove_lab.js'],
  },
];

/**
 * The vocabulary table. Only entries actually present in the scanned source are
 * rendered, and anything found without a gloss is listed as unglossed rather
 * than dropped — so the table reports its own gaps instead of quietly aging.
 */
const GLOSSARY = {
  // ---- Strudel: building and combining patterns ----
  s: ['pattern', 'Play a sample or synth by name — the sound source of an event.'],
  note: ['pattern', 'Play a pitch (MIDI number or name). The other way to start a pattern.'],
  stack: ['pattern', 'Play several patterns at once. This is how a phrase is assembled from layers.'],
  slice: ['pattern', 'Cut a sample into n equal parts and address them by index — the break chopper.'],
  ply: ['pattern', 'Repeat each event n times inside its own span: a re-subdivision, not a speed-up.'],
  mask: ['pattern', 'Silence events wherever the boolean pattern is 0. Used for per-bar gating.'],
  degradeBy: ['pattern', 'Randomly drop a fraction of events — thinning without rewriting the figure.'],
  sometimesBy: ['pattern', 'Apply a function to a fraction of events, chosen per event.'],
  slow: ['pattern', 'Stretch a pattern over more cycles. `slow(4)` keys a figure to the 4-bar phrase.'],
  fast: ['pattern', 'Compress a pattern into fewer cycles.'],
  off: ['pattern', 'Layer a time-shifted copy of a pattern over itself.'],
  every: ['pattern', 'Apply a function on every nth cycle.'],
  segment: ['pattern', 'Sample a continuous signal into n discrete events per cycle.'],
  range: ['pattern', 'Scale a signal from 0…1 into an arbitrary range.'],
  add: ['pattern', 'Add to a numeric pattern — transposition, offsets.'],
  struct: ['pattern', 'Take rhythm from a boolean pattern and pitch/sound from this one.'],
  query: ['pattern', 'Ask a pattern for the events in a time span. The scheduler’s primitive.'],
  // ---- superdough: what an event asks the renderer for ----
  orbit: ['event', 'Which output bus the event goes to. Here: 1 drums, 2 bass, 3 pads, 4 lead.'],
  gain: ['event', 'Event level.'],
  pan: ['event', 'Stereo position.'],
  speed: ['event', 'Playback rate — varispeed, so it moves pitch and formants together.'],
  lpf: ['event', 'Low-pass filter cutoff, in Hz.'],
  hpf: ['event', 'High-pass filter cutoff, in Hz.'],
  resonance: ['event', 'Filter emphasis at the corner frequency.'],
  room: ['event', 'Reverb send amount for this event.'],
  roomsize: ['event', 'Reverb size — a property of the ORBIT, not the event (see D35).'],
  attack: ['event', 'Envelope attack time.'],
  decay: ['event', 'Envelope decay time.'],
  sustain: ['event', 'Envelope sustain level.'],
  release: ['event', 'Envelope release time.'],
  shape: ['event', 'Waveshaping distortion amount.'],
  vowel: ['event', 'Formant filter on a vowel — the choir.'],
  fmi: ['event', 'FM index: how many sidebands exist. The zenith’s ring was here (D33).'],
  fmh: ['event', 'FM harmonicity ratio: where the sidebands land.'],
  vib: ['event', 'Vibrato rate.'],
  vibmod: ['event', 'Vibrato depth.'],
  duckorbit: ['event', 'Which orbits this event ducks — the audio sidechain, and the system’s coupling constant.'],
  duckdepth: ['event', 'How far the duck pulls those orbits down.'],
  duckattack: ['event', 'How fast the duck clamps.'],
  begin: ['event', 'Start offset into the sample, 0…1.'],
  end: ['event', 'End offset into the sample, 0…1.'],
  cut: ['event', 'Choke group — a new event cuts the previous one on the same number.'],
  channel: ['event', 'Output channel.'],
  delay: ['event', 'Delay send amount.'],
  delaytime: ['event', 'Delay time.'],
  delayfeedback: ['event', 'Delay feedback.'],
};

const idFor = (path) => path.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
const itemId = (path, name) => `${idFor(path)}--${name}`;

/**
 * Which glossary terms the scanned source actually uses, and where.
 *
 * Scoped to the modules that actually write patterns. Detection is by name, and
 * several of these names are ordinary JavaScript elsewhere — scanning the whole
 * tree reported `Set.add` in six modules as Strudel's `add`, which is the sort
 * of confident wrong answer a reference should not be making.
 */
function vocabulary(modules) {
  const scope = new Set([
    ...(GROUPS.find((g) => g.id === 'music')?.files ?? []),
    ...(GROUPS.find((g) => g.id === 'lab')?.files ?? []),
  ]);
  const seen = new Map();
  for (const mod of modules) {
    if (!scope.has(mod.path)) continue;
    // the blanked copy: a method name inside a comment or a mini-notation
    // string is not a usage, and this codebase has plenty of both
    for (const m of mod.masked.matchAll(/(?:^|[^\w$])\.?([a-zA-Z][\w$]*)\s*\(/g)) {
      const name = m[1];
      if (!(name in GLOSSARY)) continue;
      if (!seen.has(name)) seen.set(name, new Set());
      seen.get(name).add(mod.path);
    }
  }
  const rows = [...seen.entries()].map(([name, where]) => ({
    name, where: [...where], kind: GLOSSARY[name][0], gloss: GLOSSARY[name][1],
  }));
  return {
    pattern: rows.filter((r) => r.kind === 'pattern').sort((a, b) => a.name.localeCompare(b.name)),
    event: rows.filter((r) => r.kind === 'event').sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * The architecture block from README.md, so the page's map cannot drift from it.
 * Chosen by content rather than by position — the first fence in that file is a
 * shell snippet, and "the first fenced block" is exactly the kind of assumption
 * that quietly starts showing the wrong thing after an edit.
 */
function architecture(readme) {
  const fences = [...readme.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\s+$/, ''));
  const drawn = fences.filter((f) => /[│┌└├─]/.test(f));
  return drawn.sort((a, b) => b.length - a.length)[0] ?? null;
}

function codeBlock(mod, from, to, startLine) {
  const body = highlight(mod.src, mod.ranges, from, to);
  const lines = mod.src.slice(from, to).split('\n').length;
  const gutter = Array.from({ length: lines }, (_, i) => startLine + i).join('\n');
  return `<div class="code"><pre class="gutter" aria-hidden="true">${gutter}</pre><pre class="src"><code>${body}</code></pre></div>`;
}

function renderItem(mod, item, ctx) {
  const id = itemId(mod.path, item.name);
  const src = `${mod.path.split('/').pop()}:${item.line}`;
  const badge = item.exported ? '' : '<span class="badge private" title="not exported — internal to this module">internal</span>';
  const steps = item.steps.length ? `
    <div class="steps">
      <h5>Walkthrough <span class="muted">— the annotated steps inside this function</span></h5>
      ${item.steps.map((st) => `
        <div class="step">
          <div class="step-head"><span class="step-title">${escapeHtml(st.title)}</span><span class="muted">line ${st.line}</span></div>
          ${st.notes.map((nt) => prose(nt, ctx)).join('')}
          <details><summary>code</summary>${codeBlock(mod, st.codeStart, st.codeEnd, st.codeLine)}</details>
        </div>`).join('')}
    </div>` : '';

  return `
  <article class="item" id="${id}" data-name="${escapeHtml(item.name.toLowerCase())}" data-text="${escapeHtml(summarize(item.doc, 400).toLowerCase())}">
    <header class="item-head">
      <span class="kind ${item.label}">${item.label}</span>
      <h4><a href="#${id}">${escapeHtml(item.name)}</a></h4>
      ${badge}
      <a class="srcref" href="../../${mod.path}" title="open the source file">${src}</a>
    </header>
    <pre class="sig"><code>${escapeHtml(item.signature)}</code></pre>
    <div class="doc">${prose(item.doc, ctx) || '<p class="undoc">No comment on this declaration.</p>'}</div>
    ${steps}
    <details class="source"><summary>source <span class="muted">${item.loc} lines</span></summary>${codeBlock(mod, item.start, item.end, item.line)}</details>
  </article>`;
}

function renderModule(mod, ctx) {
  const id = idFor(mod.path);
  const name = mod.path.split('/').pop();
  const exported = mod.items.filter((i) => i.exported).length;
  const deps = mod.imports
    .filter((im) => im.from.startsWith('.'))
    .map((im) => ctx.resolve(mod.path, im.from))
    .filter((p) => ctx.modules.has(p));
  const dependents = ctx.dependents.get(mod.path) ?? [];
  const chip = (p) => `<a class="chip" href="#${idFor(p)}">${p.split('/').pop()}</a>`;
  const external = mod.imports.filter((im) => !im.from.startsWith('.')).map((im) => im.from);

  return `
  <section class="module" id="${id}" data-name="${escapeHtml(name.toLowerCase())}">
    <header class="mod-head">
      <h3>${escapeHtml(name)}</h3>
      <a class="srcref" href="../../${mod.path}">${mod.path}</a>
      <span class="muted">${mod.loc} lines · ${exported} exported</span>
    </header>
    <div class="doc lead">${prose(mod.header, ctx) || '<p class="undoc">This module has no header comment.</p>'}</div>
    <div class="deps">
      ${deps.length ? `<div><span class="deplabel">imports</span>${[...new Set(deps)].map(chip).join('')}</div>` : ''}
      ${dependents.length ? `<div><span class="deplabel">imported by</span>${dependents.map(chip).join('')}</div>` : ''}
      ${external.length ? `<div><span class="deplabel">external</span>${[...new Set(external)].map((e) => `<span class="chip ext">${escapeHtml(e)}</span>`).join('')}</div>` : ''}
    </div>
    ${mod.sections.map((sec) => `
      ${sec.title ? `<div class="secthead"><h4>${escapeHtml(sec.title)}</h4>${sec.note ? `<div class="doc">${prose(sec.note, ctx)}</div>` : ''}</div>` : ''}
      ${sec.items.map((it) => renderItem(mod, it, ctx)).join('')}
    `).join('')}
  </section>`;
}

function nav(groups, ctx) {
  return groups.map((g) => `
    <div class="navgroup">
      <div class="navgroup-name">${escapeHtml(g.name)}</div>
      ${g.mods.map((mod) => `
        <div class="navmod" data-name="${escapeHtml(mod.path.toLowerCase())}">
          <a class="navmod-link" href="#${idFor(mod.path)}">${escapeHtml(mod.path.split('/').pop())}</a>
          <div class="navitems">
            ${mod.items.filter((i) => i.exported).map((i) =>
              `<a class="navitem" href="#${itemId(mod.path, i.name)}" data-name="${escapeHtml(i.name.toLowerCase())}">${escapeHtml(i.name)}</a>`).join('')}
          </div>
        </div>`).join('')}
    </div>`).join('');
}

export function renderPage({ modules, decisions, readme, groups }) {
  const byPath = new Map(modules.map((m) => [m.path, m]));
  const byName = new Map();
  for (const m of modules) {
    byName.set(m.path, m);
    byName.set(m.path.split('/').pop(), m);
  }
  const resolve = (fromPath, spec) => {
    const parts = fromPath.split('/').slice(0, -1);
    for (const seg of spec.split('/')) {
      if (seg === '.') continue;
      else if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return parts.join('/');
  };
  const dependents = new Map();
  for (const m of modules) {
    for (const im of m.imports) {
      if (!im.from.startsWith('.')) continue;
      const target = resolve(m.path, im.from);
      if (!byPath.has(target)) continue;
      if (!dependents.has(target)) dependents.set(target, []);
      dependents.get(target).push(m.path);
    }
  }

  const modLinks = new Map();
  for (const m of modules) {
    const entry = { id: idFor(m.path) };
    modLinks.set(m.path, entry);
    modLinks.set(m.path.split('/').pop(), entry);
  }
  const ctx = { decisions, modules: modLinks, resolve, dependents };

  const grouped = groups.map((g) => ({ ...g, mods: g.files.map((f) => byPath.get(f)).filter(Boolean) }));
  const claimed = new Set(grouped.flatMap((g) => g.mods.map((m) => m.path)));
  const rest = modules.filter((m) => !claimed.has(m.path));
  if (rest.length) {
    grouped.push({
      id: 'other', name: 'Elsewhere',
      blurb: 'Modules that arrived after this page learned the map. They are documented the same way; only their placement is unopinionated.',
      mods: rest,
    });
  }

  const vocab = vocabulary(modules);
  const arch = architecture(readme);
  const totals = {
    modules: modules.length,
    exports: modules.reduce((a, m) => a + m.items.filter((i) => i.exported).length, 0),
    loc: modules.reduce((a, m) => a + m.loc, 0),
    documented: modules.reduce((a, m) => a + m.items.filter((i) => i.exported && i.doc).length, 0),
  };
  const undocumented = modules.flatMap((m) => m.items.filter((i) => i.exported && !i.doc).map((i) => ({ mod: m.path, name: i.name, line: i.line })));

  const vocabRows = (rows) => rows.map((r) => `
    <tr>
      <td><code>${escapeHtml(r.name)}</code></td>
      <td>${prose(r.gloss, ctx).replace(/^<p>|<\/p>$/g, '')}</td>
      <td class="where">${r.where.map((p) => `<a href="#${idFor(p)}">${p.split('/').pop()}</a>`).join(' ')}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ethereal jungle — source reference</title>
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#overview">Skip to content</a>
<aside id="sidebar">
  <div class="brand"><span class="dot"></span> ethereal jungle</div>
  <input id="search" type="search" placeholder="Filter modules and exports  /" aria-label="Filter">
  <nav>
    <a class="navtop" href="#overview">Overview</a>
    <a class="navtop" href="#vocab">Pattern vocabulary</a>
    <a class="navtop" href="#coverage">Coverage</a>
    ${nav(grouped, ctx)}
  </nav>
</aside>
<main>
  <section id="overview">
    <p class="eyebrow">generated reference · do not edit by hand</p>
    <h1>The source, explained by itself</h1>
    <p class="lede">Every word below comes out of <code>src/</code>. This page is built by
      <code>tools/gen_docs.mjs</code>, which reads each module's own comments — the header block, the
      comment above each export, and the <code>// ---- banner ----</code> notes inside the long
      functions — and lays them out next to the code they describe. When the source changes, this
      changes with it; when a comment is missing, the gap is listed under
      <a href="#coverage">Coverage</a> rather than papered over.</p>
    <div class="stats">
      <div><b>${totals.modules}</b><span>modules</span></div>
      <div><b>${totals.exports}</b><span>exports</span></div>
      <div><b>${totals.loc.toLocaleString('en-US')}</b><span>lines</span></div>
      <div><b>${Math.round((totals.documented / Math.max(1, totals.exports)) * 100)}%</b><span>commented</span></div>
    </div>
    ${arch ? `<h2>Signal flow</h2>
    <p>Lifted from <code>README.md</code> at generation time, so the two cannot disagree.</p>
    <pre class="diagram big">${escapeHtml(arch)}</pre>` : ''}
    <h2>How to read a module below</h2>
    <ul class="howto">
      <li><b>The lead paragraph</b> is the module's own header comment — usually the best statement of what the file is for and what it refuses to do.</li>
      <li><b>Each export</b> shows its signature, the comment above it, and its source folded away behind <i>source</i>.</li>
      <li><b>Long functions get a walkthrough</b>: the internal section banners in order, each with the note written beside that step. This is where the arrangement code actually explains itself.</li>
      <li><span class="ref adr">D12</span> links into <code>docs/design_decisions.md</code>; <span class="ref sec">§3.1</span> points at the theory docs in <code>docs/</code>.</li>
    </ul>
    <div class="groupmap">
      ${grouped.map((g) => `<div class="gcard">
        <h3>${escapeHtml(g.name)}</h3>
        <p>${escapeHtml(g.blurb)}</p>
        <div>${g.mods.map((m) => `<a class="chip" href="#${idFor(m.path)}">${m.path.split('/').pop()}</a>`).join('')}</div>
      </div>`).join('')}
    </div>
  </section>

  <section id="vocab">
    <h2>Pattern vocabulary</h2>
    <p>The Strudel and superdough calls this codebase actually uses, detected in the scanned source
      rather than transcribed from the library docs — a method that appears in a new generator shows
      up here on the next run. Two families, and the split is the engine discipline the music layer
      keeps: <b>pattern</b> calls build and transform patterns; <b>event</b> calls set abstract
      parameters that superdough happens to be the current renderer of.
      <span class="caveat">Detection is by name over the music modules only, so an ordinary
      JavaScript call that shares a name with a pattern operator — <code>.slice()</code> on an array —
      can still show up. Treat the <i>used in</i> column as a pointer, not a census.</span></p>
    <h3>Building patterns</h3>
    <table class="vocab"><thead><tr><th>call</th><th>what it does</th><th>used in</th></tr></thead>
      <tbody>${vocabRows(vocab.pattern)}</tbody></table>
    <h3>Event parameters</h3>
    <table class="vocab"><thead><tr><th>param</th><th>what it asks for</th><th>used in</th></tr></thead>
      <tbody>${vocabRows(vocab.event)}</tbody></table>
  </section>

  ${grouped.map((g) => `
  <section class="group" id="group-${g.id}">
    <h2>${escapeHtml(g.name)}</h2>
    <p class="lede">${escapeHtml(g.blurb)}</p>
    ${g.mods.map((m) => renderModule(m, ctx)).join('')}
  </section>`).join('')}

  <section id="coverage">
    <h2>Coverage</h2>
    <p>${totals.documented} of ${totals.exports} exports carry a comment. The rest are listed here,
      which is the honest version of a documentation tool: the page cannot invent an explanation, so
      it says where one is missing.</p>
    ${undocumented.length ? `<ul class="gaps">${undocumented.map((u) =>
      `<li><a href="#${itemId(u.mod, u.name)}"><code>${escapeHtml(u.name)}</code></a> <span class="muted">${u.mod}:${u.line}</span></li>`).join('')}</ul>`
      : '<p class="ok">Every export is commented.</p>'}
  </section>

  <footer>
    <p>Generated by <code>tools/gen_docs.mjs</code> from <code>src/</code>, <code>README.md</code> and
      <code>docs/design_decisions.md</code>. Run <code>npm run docs</code> to rebuild, or
      <code>npm run docs:check</code> to fail when it is stale. No timestamp is written into this file
      on purpose — the output is a pure function of the sources, so an unchanged tree regenerates
      byte-identical and never shows up as a spurious diff.</p>
  </footer>
</main>
<script>${JS}</script>
</body>
</html>`;
}

const CSS = String.raw`
:root{
  --bg:#0d1014; --panel:#121720; --panel2:#161d28; --line:#232c3a;
  --ink:#dfe6ef; --dim:#93a2b5; --faint:#63728a;
  --accent:#7fd1a8; --accent2:#c9a6ff; --warn:#e8b06a;
  --code:#0a0d11; --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: light){
  :root{ --bg:#fbfaf7; --panel:#fff; --panel2:#f3f2ee; --line:#e0ddd5; --ink:#1e2430;
         --dim:#5a6675; --faint:#8b95a4; --accent:#1c7a53; --accent2:#6b3fa8; --code:#f6f5f1; }
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.65 ui-sans-serif,-apple-system,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:var(--mono);font-size:.88em;background:var(--panel2);
  border:1px solid var(--line);border-radius:4px;padding:.05em .32em}
.skip{position:absolute;left:-9999px}
.skip:focus{left:8px;top:8px;background:var(--panel);padding:8px;z-index:10}

#sidebar{position:fixed;inset:0 auto 0 0;width:274px;background:var(--panel);
  border-right:1px solid var(--line);overflow:auto;padding:18px 0 40px;z-index:5}
.brand{font-weight:650;letter-spacing:.2px;padding:0 18px 14px;display:flex;align-items:center;gap:9px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--accent);
  box-shadow:0 0 12px var(--accent);flex:none}
#search{width:calc(100% - 36px);margin:0 18px 14px;padding:8px 10px;border-radius:7px;
  border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;font-size:13px}
#search:focus{outline:2px solid var(--accent);outline-offset:-1px}
nav{padding:0 10px}
.navtop{display:block;padding:5px 8px;border-radius:6px;color:var(--dim);font-size:13px}
.navtop:hover{background:var(--panel2);text-decoration:none}
.navgroup{margin-top:16px}
.navgroup-name{font-size:11px;text-transform:uppercase;letter-spacing:.09em;
  color:var(--faint);padding:0 8px 5px}
.navmod{margin-bottom:3px}
.navmod-link{display:block;padding:4px 8px;border-radius:6px;font-family:var(--mono);
  font-size:12.5px;color:var(--ink)}
.navmod-link:hover{background:var(--panel2);text-decoration:none}
.navitems{display:none;padding:2px 0 6px 8px;margin-left:8px;border-left:1px solid var(--line)}
.navmod.open .navitems,body.filtering .navitems{display:block}
.navitem{display:block;padding:2px 8px;font-family:var(--mono);font-size:11.5px;color:var(--dim);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:5px}
.navitem:hover{background:var(--panel2);color:var(--ink);text-decoration:none}
[hidden]{display:none !important}

main{margin-left:274px;padding:44px 40px 120px;max-width:1080px}
h1{font-size:34px;line-height:1.2;margin:.1em 0 .35em;letter-spacing:-.4px}
h2{font-size:23px;margin:2.4em 0 .5em;letter-spacing:-.2px;
  padding-bottom:.3em;border-bottom:1px solid var(--line)}
h3{font-size:18px;margin:1.6em 0 .4em}
h4{font-size:15px;margin:0}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.13em;color:var(--faint);margin:0}
.lede{color:var(--dim);font-size:16px;max-width:74ch}
.muted{color:var(--faint);font-size:12px;font-weight:400}
.undoc{color:var(--faint);font-style:italic}
.ok{color:var(--accent)}

.stats{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0 8px}
.stats div{background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:11px 16px;min-width:104px}
.stats b{display:block;font-size:21px;letter-spacing:-.4px}
.stats span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--faint)}

.diagram{background:var(--code);border:1px solid var(--line);border-radius:9px;
  padding:13px 15px;overflow-x:auto;font-family:var(--mono);font-size:12.5px;line-height:1.5;
  color:var(--dim);white-space:pre}
.diagram.big{font-size:13px;color:var(--ink);padding:18px}
.howto{max-width:78ch;color:var(--dim)}
.howto b{color:var(--ink)}

.groupmap{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(248px,1fr));margin-top:26px}
.gcard{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:14px 16px}
.gcard h3{margin:0 0 .3em;font-size:15px}
.gcard p{margin:0 0 .7em;font-size:13px;color:var(--dim)}
.chip{display:inline-block;font-family:var(--mono);font-size:11.5px;padding:2px 7px;margin:2px 4px 2px 0;
  border:1px solid var(--line);border-radius:20px;background:var(--panel2);color:var(--dim)}
.chip:hover{color:var(--ink);border-color:var(--accent);text-decoration:none}
.chip.ext{opacity:.7}

table.vocab{width:100%;border-collapse:collapse;margin:.6em 0 1.4em;font-size:13.5px}
.vocab th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;
  color:var(--faint);border-bottom:1px solid var(--line);padding:6px 10px 6px 0;font-weight:600}
.vocab td{padding:7px 10px 7px 0;border-bottom:1px solid var(--line);vertical-align:top}
.vocab td:first-child{width:1%;white-space:nowrap}
.where{font-family:var(--mono);font-size:11.5px;width:1%;white-space:nowrap;color:var(--faint)}

.module{margin:30px 0 46px;background:var(--panel);border:1px solid var(--line);
  border-radius:14px;padding:20px 22px}
.mod-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.mod-head h3{margin:0;font-family:var(--mono);font-size:17px}
.srcref{font-family:var(--mono);font-size:11.5px;color:var(--faint)}
.doc p{margin:.55em 0;max-width:78ch}
.doc.lead p:first-child{margin-top:.2em}
.doc ul{margin:.5em 0;padding-left:1.2em;max-width:78ch}
.doc li{margin:.25em 0}

.deps{display:flex;flex-direction:column;gap:3px;margin:14px 0 4px;font-size:12px}
.deplabel{display:inline-block;min-width:82px;color:var(--faint);font-size:11px;
  text-transform:uppercase;letter-spacing:.07em}

.secthead{margin:26px 0 8px;padding-top:14px;border-top:1px dashed var(--line)}
.secthead h4{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent2)}

.item{border-top:1px solid var(--line);padding:16px 0 4px;scroll-margin-top:18px}
.item:target{background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 11%,transparent),transparent);
  border-radius:8px;padding-left:10px;margin-left:-10px}
.item-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.item-head h4{font-family:var(--mono);font-size:15px}
.item-head h4 a{color:var(--ink)}
.kind{font-size:10px;text-transform:uppercase;letter-spacing:.08em;padding:2px 7px;border-radius:20px;
  border:1px solid var(--line);color:var(--faint)}
.kind.function{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
.kind.table{color:var(--accent2);border-color:color-mix(in srgb,var(--accent2) 45%,var(--line))}
.badge.private{font-size:10px;color:var(--warn);border:1px solid var(--line);border-radius:20px;padding:2px 7px}
.sig{font-family:var(--mono);font-size:12.5px;color:var(--dim);background:var(--code);
  border:1px solid var(--line);border-left:2px solid var(--accent);border-radius:0 7px 7px 0;
  padding:7px 11px;margin:9px 0;overflow-x:auto}
.sig code{background:none;border:none;padding:0}

.ref{border-bottom:1px dotted currentColor;cursor:help}
.ref.adr{color:var(--accent2);font-weight:600;border-bottom-style:dashed}
.ref.sec{color:var(--faint)}
.modref code{border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}

details{margin:8px 0}
summary{cursor:pointer;font-size:12px;color:var(--faint);user-select:none;
  padding:3px 0;list-style:none;display:flex;align-items:center;gap:6px}
summary::-webkit-details-marker{display:none}
summary::before{content:"▸";font-size:10px;transition:transform .12s}
details[open]>summary::before{transform:rotate(90deg)}
summary:hover{color:var(--accent)}

.code{display:flex;background:var(--code);border:1px solid var(--line);border-radius:9px;
  overflow:auto;max-height:560px;margin:6px 0}
.code pre{margin:0;font-family:var(--mono);font-size:12px;line-height:1.55}
.gutter{padding:11px 9px 11px 12px;color:var(--faint);opacity:.55;text-align:right;
  user-select:none;border-right:1px solid var(--line);flex:none}
.src{padding:11px 15px;white-space:pre;flex:1}
.src .k{color:var(--accent2)}
.src .s{color:var(--accent)}
.src .c{color:var(--faint);font-style:italic}
.src .n{color:var(--warn)}
.src .l{color:var(--warn)}

.steps{margin:12px 0 4px;border-left:2px solid var(--line);padding-left:14px}
.steps h5{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--faint)}
.step{margin:0 0 14px}
.step-head{display:flex;align-items:baseline;gap:10px}
.step-title{font-family:var(--mono);font-size:13px;color:var(--ink)}
.step .doc p,.step p{font-size:13.5px;color:var(--dim)}

.caveat{display:block;margin-top:.7em;color:var(--faint);font-size:13px}
.gaps{columns:2;font-size:13px;padding-left:1.1em}
.gaps li{break-inside:avoid;margin:.2em 0}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);
  color:var(--faint);font-size:12.5px;max-width:78ch}

@media (max-width:900px){
  #sidebar{position:static;width:auto;height:auto;border-right:none;border-bottom:1px solid var(--line)}
  main{margin-left:0;padding:26px 18px 80px}
  .gaps{columns:1}
}
`;

const JS = String.raw`
(function () {
  var search = document.getElementById('search');
  var mods = [].slice.call(document.querySelectorAll('.navmod'));
  var tops = [].slice.call(document.querySelectorAll('.navtop'));

  function filter() {
    var q = search.value.trim().toLowerCase();
    document.body.classList.toggle('filtering', !!q);
    tops.forEach(function (t) { t.hidden = !!q; });
    mods.forEach(function (m) {
      var hitMod = !q || m.dataset.name.indexOf(q) !== -1;
      var any = hitMod;
      [].forEach.call(m.querySelectorAll('.navitem'), function (a) {
        var hit = !q || hitMod || a.dataset.name.indexOf(q) !== -1;
        a.hidden = !hit;
        if (hit) any = true;
      });
      m.hidden = !any;
    });
    [].forEach.call(document.querySelectorAll('.navgroup'), function (g) {
      g.hidden = !g.querySelector('.navmod:not([hidden])');
    });
  }
  search.addEventListener('input', filter);
  search.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { search.value = ''; filter(); search.blur(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); search.focus(); }
  });

  // the nav opens the module you are reading, and follows you down the page
  var links = {};
  mods.forEach(function (m) { links[m.querySelector('.navmod-link').hash.slice(1)] = m; });
  var seen = [].slice.call(document.querySelectorAll('.module'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var m = links[en.target.id];
        if (m) m.classList.toggle('open', en.isIntersecting);
      });
    }, { rootMargin: '-10% 0px -70% 0px' });
    seen.forEach(function (s) { io.observe(s); });
  }

  // deep links land inside a folded <details>: open its ancestors
  function reveal() {
    var el = document.getElementById(location.hash.slice(1));
    while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
  }
  window.addEventListener('hashchange', reveal);
  if (location.hash) reveal();
})();
`;
