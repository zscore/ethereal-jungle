/**
 * scan.mjs — the source reader for the auto-docs (tools/gen_docs.mjs).
 *
 * Deliberately dependency-free. The generator runs from a git hook, and hooks
 * fire in worktrees that have no `node_modules` of their own — so a parser
 * dependency would mean the docs silently stop regenerating in exactly the
 * places this repo does its work. What it needs is narrow enough to hand-roll:
 * top-level declarations, the comment block above each one, and the banner
 * comments (`// ---- title ----`) the codebase already uses as section
 * headings, at every depth.
 *
 * The one non-trivial part is knowing what is *code* and what is text. A single
 * pass blanks comments, strings and template literals (newlines preserved, so
 * offsets and line numbers stay exact) and records their ranges; everything
 * afterwards — brace depth, declaration matching, syntax highlighting — reads
 * the blanked copy and is therefore immune to a `{` inside a mini-notation
 * string, which this codebase is full of.
 */

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'instanceof', 'new', 'do', 'else', 'yield', 'await']);

/**
 * One pass over the source. Returns the blanked copy plus the ranges of every
 * comment, string and template literal, which is everything the rest of this
 * module (and the highlighter) needs to tell code from text.
 */
export function tokenize(src) {
  const out = src.split('');
  const noComments = src.split('');
  const comments = [];
  const strings = [];
  const n = src.length;
  let i = 0;
  let prev = ''; // last significant code character, for the regex/division call

  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  // a second copy that keeps string contents and loses only the comments: the
  // signature of `SHAPE = [ // the shared shape` should show the code, not the aside
  const blankComment = (from, to) => {
    for (let k = from; k < to; k++) if (noComments[k] !== '\n') noComments[k] = ' ';
  };

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (c === '/' && c2 === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      comments.push({ start, end: i, kind: 'line' });
      blank(start, i);
      blankComment(start, i);
      continue;
    }
    if (c === '/' && c2 === '*') {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      comments.push({ start, end: i, kind: src[start + 2] === '*' ? 'jsdoc' : 'block' });
      blank(start, i);
      blankComment(start, i);
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') i++;
        if (src[i] === '\n') break; // unterminated: bail rather than eat the file
        i++;
      }
      i = Math.min(n, i + 1);
      strings.push({ start, end: i });
      blank(start + 1, i - 1);
      prev = 'x';
      continue;
    }
    if (c === '`') {
      // Template literals nest: `a ${ `b ${c}` } d`. Track our own depth so the
      // whole literal — interpolations included — is blanked as one unit, which
      // keeps brace depth balanced for the caller.
      const start = i;
      i++;
      let braces = 0;
      let inExpr = false;
      let depth = 1;
      while (i < n && depth > 0) {
        const ch = src[i];
        if (ch === '\\') { i += 2; continue; }
        if (!inExpr && ch === '$' && src[i + 1] === '{') { inExpr = true; braces = 1; i += 2; continue; }
        if (inExpr) {
          if (ch === '{') braces++;
          else if (ch === '}') { braces--; if (braces === 0) inExpr = false; }
          else if (ch === '`') { depth++; }
        } else if (ch === '`') {
          depth--;
        }
        i++;
      }
      strings.push({ start, end: i });
      blank(start + 1, Math.max(start + 1, i - 1));
      prev = 'x';
      continue;
    }
    if (c === '/' && isRegexPosition(src, i, prev)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        else if (ch === '\n') break;
        i++;
      }
      i = Math.min(n, i + 1);
      while (i < n && /[gimsuy]/.test(src[i])) i++;
      strings.push({ start, end: i });
      blank(start, i);
      prev = 'x';
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }

  return { masked: out.join(''), codeOnly: noComments.join(''), comments, strings };
}

// A `/` starts a regex only where a value cannot already have ended. Division
// always follows an identifier, `)`, `]` or a number — none of which are here.
function isRegexPosition(src, i, prev) {
  if (prev === '') return true;
  if ('(,=:[!&|?{};+-%~^<>'.includes(prev)) return src[i + 1] !== '=';
  const before = src.slice(Math.max(0, i - 12), i).match(/([A-Za-z_$][\w$]*)\s*$/);
  return !!(before && KEYWORDS_BEFORE_REGEX.has(before[1]));
}

/** Cumulative `{[(` depth at every offset of the blanked source. */
function depthMap(masked) {
  const depth = new Int32Array(masked.length + 1);
  let d = 0;
  for (let i = 0; i < masked.length; i++) {
    depth[i] = d;
    const c = masked[i];
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
  }
  depth[masked.length] = d;
  return depth;
}

const lineStarts = (src) => {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return starts;
};

const lineOf = (starts, offset) => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
};

const DECL_RE = /^(export\s+default\s+|export\s+)?(async\s+)?(function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * Strip a comment's syntax down to its text: `/** … *\/` loses the stars and the
 * common ` * ` gutter, `//` runs lose their slashes. Indentation *inside* the
 * comment survives, because several of these blocks are ASCII diagrams whose
 * alignment is the content.
 */
export function commentText(raw) {
  if (raw.startsWith('/*')) {
    const body = raw.replace(/^\/\*\*?/, '').replace(/\*\/$/, '');
    const lines = body.split('\n');
    const stripped = lines.map((l, idx) => (idx === 0 ? l : l.replace(/^\s*\* ?/, '')));
    while (stripped.length && !stripped[0].trim()) stripped.shift();
    while (stripped.length && !stripped[stripped.length - 1].trim()) stripped.pop();
    return stripped.join('\n').trimEnd();
  }
  return raw
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/ ?/, ''))
    .join('\n')
    .trimEnd();
}

const BANNER_RE = /^\s*(?:-{3,}\s*(.+?)\s*-{3,}|-{3,}\s*(.+?)|(.+?)\s*-{3,})\s*$/;

/** `// ---- the break ----`, `// ------- candidates`, `// candidates -------`. */
function bannerTitle(text) {
  if (text.includes('\n')) return null;
  const m = text.match(BANNER_RE);
  if (!m) return null;
  const title = (m[1] ?? m[2] ?? m[3] ?? '').trim();
  if (!title || /^-+$/.test(title)) return null;
  return title;
}

/**
 * Group adjacent single-line comments into one block, so a four-line `//`
 * paragraph reads as a paragraph. A banner never merges with the prose under
 * it — the banner is the heading and the prose is the body.
 */
function blocks(src, comments) {
  const starts = lineStarts(src);
  const items = comments.map((c) => ({
    ...c,
    raw: src.slice(c.start, c.end),
    line: lineOf(starts, c.start),
    endLine: lineOf(starts, Math.max(c.start, c.end - 1)),
  }));
  const merged = [];
  for (const c of items) {
    const prev = merged[merged.length - 1];
    const mergeable = prev && prev.kind === 'line' && c.kind === 'line' &&
      c.line === prev.endLine + 1 &&
      !bannerTitle(commentText(prev.raw)) && !bannerTitle(commentText(c.raw)) &&
      src.slice(starts[prev.line - 1], prev.start).trim() === src.slice(starts[c.line - 1], c.start).trim();
    if (mergeable) {
      prev.raw += `\n${c.raw}`;
      prev.end = c.end;
      prev.endLine = c.endLine;
    } else {
      merged.push({ ...c });
    }
  }
  return merged.map((c) => ({ ...c, text: commentText(c.raw), banner: bannerTitle(commentText(c.raw)) }));
}

/** The comment block sitting directly above `offset`, if any (whitespace only between). */
function docAbove(src, comms, offset, usedIdx) {
  for (let k = comms.length - 1; k >= 0; k--) {
    const c = comms[k];
    if (c.end > offset) continue;
    if (src.slice(c.end, offset).trim() !== '') return null;
    if (c.banner) return null; // a banner heads a group, it does not document one item
    usedIdx.add(k);
    return c;
  }
  return null;
}

/** Where a top-level declaration ends: the balanced body, or the `;` that closes it. */
function declEnd(masked, depth, start, limit) {
  const brace = masked.indexOf('{', start);
  const semi = masked.indexOf(';', start);
  const isBody = brace !== -1 && brace < limit && (semi === -1 || brace < semi || depth[brace] === depth[start]);
  if (isBody && depth[brace] === depth[start]) {
    let i = brace;
    let d = 0;
    for (; i < masked.length; i++) {
      if (masked[i] === '{') d++;
      else if (masked[i] === '}') { d--; if (d === 0) return i + 1; }
    }
  }
  for (let i = start; i < masked.length && i < limit; i++) {
    if (masked[i] === ';' && depth[i] === depth[start]) return i + 1;
  }
  return Math.min(limit, masked.length);
}

/** `export function foo(a, b = 1) {` → `foo(a, b = 1)`. Value decls get their kind. */
/**
 * Is this right-hand side an arrow function? `[^)]*` is not good enough —
 * `D_MAX = (INDISPENSABILITY.reduce((a, v, i) => …))` is a parenthesized
 * expression whose *inner* callback made the lazy test say yes. So skip a
 * balanced group and look at what actually follows it.
 */
function arrowParams(rhs) {
  const m = rhs.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/);
  if (m) return `(${m[1]})`;
  const open = rhs.match(/^(?:async\s+)?\(/);
  if (!open) return null;
  let d = 0;
  for (let i = open[0].length - 1; i < rhs.length; i++) {
    if (rhs[i] === '(') d++;
    else if (rhs[i] === ')') {
      d--;
      if (d === 0) return /^\s*=>/.test(rhs.slice(i + 1)) ? rhs.slice(open[0].length - 1, i + 1) : null;
    }
  }
  return null;
}

function signatureOf(code, masked, start, end, name, kind) {
  if (kind.startsWith('function') || kind === 'class') {
    const open = masked.indexOf('(', start);
    if (open === -1 || open > end) return name;
    let d = 0;
    for (let i = open; i < end; i++) {
      if (masked[i] === '(') d++;
      else if (masked[i] === ')') { d--; if (d === 0) return `${name}${code.slice(open, i + 1).replace(/\s+/g, ' ')}`; }
    }
    return name;
  }
  const eq = masked.indexOf('=', start);
  if (eq === -1 || eq > end) return name;
  const rhs = code.slice(eq + 1, end).replace(/;\s*$/, '').trim();
  // an arrow function is a function however it was declared: show its parameters
  const arrow = arrowParams(rhs);
  if (arrow) return `${name}${arrow.replace(/\s+/g, ' ')}`;
  const firstLine = rhs.split('\n')[0].trimEnd();
  const summary = rhs.includes('\n') ? `${firstLine} …` : firstLine;
  return `${name} = ${summary.length > 96 ? `${summary.slice(0, 93)}…` : summary}`;
}

function kindLabel(kind, code, masked, start, end) {
  if (kind.startsWith('function')) return 'function';
  if (kind === 'class') return 'class';
  const eq = masked.indexOf('=', start);
  if (eq === -1 || eq > end) return 'constant';
  const rhs = code.slice(eq + 1, end).trim();
  if (arrowParams(rhs)) return 'function';
  if (/^[[{]/.test(rhs) || /^new (Set|Map)\b/.test(rhs)) return 'table';
  return 'constant';
}

/** `import { a, b } from './x.js'` for the module graph. */
function importsOf(src, masked) {
  const found = [];
  const re = /^\s*import\s+(?:([^'"]*?)\s+from\s+)?['"]([^'"]+)['"]/gm;
  for (const m of masked.matchAll(re)) {
    const spec = m[2] || src.slice(m.index, m.index + m[0].length).match(/['"]([^'"]+)['"]/)?.[1];
    // the specifier lives in a blanked string; recover it from the raw source
    const raw = src.slice(m.index, m.index + m[0].length).match(/from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/);
    const from = raw ? (raw[1] ?? raw[2]) : spec;
    const names = (m[1] ?? '').replace(/[{}]/g, ' ').split(',').map((x) => x.trim()).filter(Boolean);
    if (from) found.push({ from, names });
  }
  return found;
}

/**
 * The walkthrough for a long function: its internal `// ---- … ----` banners,
 * each with the prose directly beneath it and the code up to the next banner.
 * This is where the real explanation of `buildArrangement` lives — one comment
 * per layer, written next to the layer — and it would be invisible in any doc
 * tool that only looks at top-level JSDoc.
 */
function stepsWithin(src, comms, from, to, starts) {
  const inside = comms.filter((c) => c.start >= from && c.end <= to);
  const steps = [];
  for (let k = 0; k < inside.length; k++) {
    const c = inside[k];
    if (!c.banner) continue;
    const next = inside.slice(k + 1).find((x) => x.banner);
    const bodyEnd = next ? next.start : to;
    const notes = [];
    let cursor = c.end;
    for (let j = k + 1; j < inside.length; j++) {
      const p = inside[j];
      if (p.start >= bodyEnd || p.banner) break;
      if (src.slice(cursor, p.start).trim() === '') { notes.push(p); cursor = p.end; }
    }
    steps.push({
      title: c.banner,
      line: c.line,
      notes: notes.map((p) => p.text),
      codeStart: cursor,
      codeEnd: bodyEnd,
      codeLine: lineOf(starts, cursor),
    });
  }
  return steps;
}

/**
 * Scan one module into the shape the renderer wants:
 *   { header, sections: [{ title, items }], imports, loc }
 * where every item carries its own source range so the page can show the code
 * next to the prose that explains it.
 */
export function scanModule(path, src) {
  const { masked, codeOnly, comments, strings } = tokenize(src);
  const depth = depthMap(masked);
  const starts = lineStarts(src);
  const comms = blocks(src, comments);
  const used = new Set();

  // the module header: a leading comment block before any code
  let header = null;
  if (comms.length && src.slice(0, comms[0].start).trim() === '') {
    header = comms[0].text;
    used.add(0);
  }

  const decls = [];
  DECL_RE.lastIndex = 0;
  for (const m of src.matchAll(DECL_RE)) {
    if (depth[m.index] !== 0) continue;
    decls.push({
      start: m.index,
      exported: !!m[1],
      isDefault: (m[1] ?? '').includes('default'),
      kind: m[3].startsWith('function') ? 'function' : m[3],
      name: m[4],
    });
  }

  const items = decls.map((d, i) => {
    const limit = decls[i + 1]?.start ?? src.length;
    const end = declEnd(masked, depth, d.start, limit);
    const line = lineOf(starts, d.start);
    // `export const CPS = BPM / 60 / 4;  // cycles (bars) per second` — this
    // codebase documents half its constants on the same line as the value, and
    // a doc tool that only reads the block above would call every one of them
    // undocumented.
    let doc = docAbove(src, comms, d.start, used);
    if (!doc) {
      const trailingIdx = comms.findIndex((c) => c.kind === 'line' && !c.banner &&
        c.start > d.start && c.line === line);
      if (trailingIdx !== -1) { doc = comms[trailingIdx]; used.add(trailingIdx); }
    }
    const code = src.slice(d.start, end);
    return {
      ...d,
      end,
      line,
      endLine: lineOf(starts, Math.max(d.start, end - 1)),
      doc: doc?.text ?? '',
      docLine: doc?.line ?? null,
      signature: signatureOf(codeOnly, masked, d.start, end, d.name, d.kind),
      label: kindLabel(d.kind, codeOnly, masked, d.start, end),
      loc: code.split('\n').length,
      code,
      steps: code.split('\n').length >= 40 ? stepsWithin(src, comms, d.start, end, starts) : [],
    };
  });

  // top-level banners become the section headings the items fall under
  const banners = comms
    .map((c, idx) => ({ c, idx }))
    .filter(({ c, idx }) => c.banner && depth[c.start] === 0 && !used.has(idx))
    .map(({ c, idx }) => {
      used.add(idx);
      // prose directly beneath a top-level banner is section-level commentary
      const next = comms.find((x) => x.start > c.end && !x.banner && src.slice(c.end, x.start).trim() === '');
      const followsDecl = next && items.some((it) => src.slice(next.end, it.start).trim() === '');
      return { start: c.start, title: c.banner, note: followsDecl ? '' : (next?.text ?? '') };
    });

  const sections = [];
  const pushItem = (item) => {
    const banner = [...banners].reverse().find((b) => b.start < item.start);
    const title = banner?.title ?? null;
    let sec = sections[sections.length - 1];
    if (!sec || sec.title !== title) {
      sec = { title, note: banner && !sections.some((s) => s.title === title) ? banner.note : '', items: [] };
      sections.push(sec);
    }
    sec.items.push(item);
  };
  items.forEach(pushItem);

  return {
    path,
    loc: src.split('\n').length,
    header,
    imports: importsOf(src, masked),
    sections,
    items,
    ranges: { comments, strings },
    masked,
    src,
  };
}
