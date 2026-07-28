/**
 * prose.mjs — comments in, HTML out, plus the syntax highlighter.
 *
 * The comments in this repo are not JSDoc tags; they are written prose, with
 * ASCII signal-flow diagrams, `**emphasis**`, bullet lists, and two kinds of
 * reference that carry most of the meaning:
 *
 *   D22        an ADR in docs/design_decisions.md — resolved to a real link,
 *              with the decision's own title as the hover text
 *   §3.1       a section of one of the theory docs — marked, not linked: which
 *              doc is meant depends on whether the module is music or visuals,
 *              and guessing wrong is worse than not linking
 *
 * So this is a deliberately small markdown subset rather than a dependency: it
 * has to preserve the diagrams exactly (their alignment is the content) and it
 * has to know about D-numbers, which no markdown renderer does.
 */

export const escapeHtml = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** A block is preformatted if its shape is load-bearing: indentation or arrows. */
function isDiagram(lines) {
  if (lines.length < 2) return false;
  const drawn = lines.filter((l) => /[│┌└├─▸▼◀►]|→|←|↔/.test(l)).length;
  if (drawn >= 2) return true;
  const indented = lines.filter((l) => /^\s{2,}\S/.test(l)).length;
  const aligned = lines.filter((l) => /\S\s{3,}\S/.test(l)).length;
  return indented >= lines.length * 0.6 || aligned >= lines.length * 0.6;
}

function inline(text, ctx) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:)]|$)/g, '$1<em>$2</em>');
  // D-numbers → the ADR log. Skipped inside a <code> span, where it is a key.
  s = s.replace(/\bD(\d{1,2})\b/g, (m, num) => {
    const adr = ctx?.decisions?.get(num);
    if (!adr) return m;
    return `<a class="ref adr" href="${adr.href}" title="${escapeHtml(adr.title)}">${m}</a>`;
  });
  s = s.replace(/§(\d+(?:\.\d+)*)/g, '<span class="ref sec" title="a section of the theory docs in docs/">§$1</span>');
  // a bare module name that this page documents
  if (ctx?.modules) {
    s = s.replace(/<code>([\w/.-]+\.js)<\/code>/g, (m, file) => {
      const mod = ctx.modules.get(file) ?? ctx.modules.get(file.split('/').pop());
      return mod ? `<a class="modref" href="#${mod.id}"><code>${file}</code></a>` : m;
    });
  }
  return s;
}

/** The markdown subset: paragraphs, `-` lists, and diagrams left exactly alone. */
export function prose(text, ctx) {
  if (!text || !text.trim()) return '';
  const lines = text.replace(/\t/g, '  ').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const block = [];
    while (i < lines.length && lines[i].trim()) block.push(lines[i++]);

    if (isDiagram(block)) {
      const pad = Math.min(...block.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
      out.push(`<pre class="diagram">${escapeHtml(block.map((l) => l.slice(pad)).join('\n'))}</pre>`);
      continue;
    }
    if (/^\s*[-–•]\s+/.test(block[0])) {
      const items = [];
      for (const line of block) {
        if (/^\s*[-–•]\s+/.test(line)) items.push(line.replace(/^\s*[-–•]\s+/, ''));
        else if (items.length) items[items.length - 1] += ` ${line.trim()}`;
      }
      out.push(`<ul>${items.map((it) => `<li>${inline(it, ctx)}</li>`).join('')}</ul>`);
      continue;
    }
    out.push(`<p>${inline(block.join(' ').replace(/\s+/g, ' ').trim(), ctx)}</p>`);
  }
  return out.join('\n');
}

/** First sentence of a doc block — the one-liner for nav and summary cards. */
export function summarize(text, limit = 150) {
  if (!text) return '';
  const flat = text.split('\n').filter((l) => l.trim() && !isDiagram([l, l])).join(' ');
  const firstPara = flat.split(/\s{2,}/)[0];
  const m = firstPara.match(/^(.*?[.!?])(\s|$)/);
  let s = (m ? m[1] : firstPara).replace(/\s+/g, ' ').trim();
  if (s.length > limit) s = `${s.slice(0, limit - 1)}…`;
  return s.replace(/`/g, '');
}

const KEYWORDS = new Set(('await async break case catch class const continue default delete do else export extends ' +
  'finally for from function if import in instanceof let new of return static super switch this throw try typeof ' +
  'var void while yield').split(' '));
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

/**
 * Syntax highlighting from the same ranges the scanner already computed, so a
 * `{` inside a mini-notation string can never be mistaken for a block.
 * `ranges` are module-absolute; `from` is where this snippet starts.
 */
export function highlight(src, ranges, from, to) {
  const marks = [];
  for (const c of ranges.comments) if (c.end > from && c.start < to) marks.push({ ...c, cls: 'c' });
  for (const s of ranges.strings) if (s.end > from && s.start < to) marks.push({ ...s, cls: 's' });
  marks.sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = from;
  const plain = (text) => escapeHtml(text)
    .replace(/\b([A-Za-z_$][\w$]*)\b/g, (m) => {
      if (KEYWORDS.has(m)) return `<span class="k">${m}</span>`;
      if (LITERALS.has(m)) return `<span class="l">${m}</span>`;
      return m;
    })
    .replace(/\b(\d+\.?\d*(?:e-?\d+)?)\b/g, '<span class="n">$1</span>');

  for (const m of marks) {
    const start = Math.max(m.start, from);
    const end = Math.min(m.end, to);
    if (start > cursor) out += plain(src.slice(cursor, start));
    if (end > start) out += `<span class="${m.cls}">${escapeHtml(src.slice(start, end))}</span>`;
    cursor = Math.max(cursor, end);
  }
  if (cursor < to) out += plain(src.slice(cursor, to));
  return out;
}

/**
 * The ADR index: every `## D12 — title (date)` heading in design_decisions.md,
 * keyed by number, with the GitHub-flavored anchor the heading would get. This
 * is what makes `D22` in a source comment a link the reader can follow.
 */
export function readDecisions(md) {
  const map = new Map();
  for (const line of md.split('\n')) {
    const m = line.match(/^##\s+D(\d+)\s*[—–-]\s*(.+?)\s*$/);
    if (!m) continue;
    const slug = line.replace(/^#+\s*/, '').toLowerCase()
      .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    map.set(m[1], { num: m[1], title: m[2], href: `../design_decisions.md#${slug}` });
  }
  return map;
}
