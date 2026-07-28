/**
 * Unit test for the auto-docs scanner (tools/docs/scan.mjs, tools/docs/prose.mjs).
 * Run: node test/docs.mjs  (included in `npm test`)
 *
 * What this exists to catch: the scanner is a hand-rolled reader rather than a
 * real parser — deliberately, since it has to run from a git hook in worktrees
 * with no `node_modules` — and a hand-rolled reader fails QUIETLY. A brace
 * inside a mini-notation string, a template literal with an interpolation, a
 * `/` that is division rather than a regex: each of those silently drops half a
 * file's exports, and the page still renders, still looks plausible, and is
 * simply missing things. So the assertions below are mostly "did we find what
 * is unambiguously there", checked against the real source rather than against
 * fixtures, because the fixtures are the thing that would go stale.
 *
 * It deliberately does NOT assert that docs/api/index.html is up to date —
 * that is `npm run docs:check`, and putting it here would fail the whole suite
 * for anyone editing src/ mid-thought.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanModule, tokenize, commentText } from '../tools/docs/scan.mjs';
import { prose, summarize, readDecisions, highlight, escapeHtml } from '../tools/docs/prose.mjs';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok    ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const walk = (dir, base = dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`, base) : (e.name.endsWith('.js') ? [`${dir}/${e.name}`] : [])));

const paths = walk('src').sort();
const modules = paths.map((p) => scanModule(p, read(p)));

console.log('the scanner reads every module, and finds what is there');
{
  check(modules.length >= 15, `${modules.length} modules scanned under src/`);
  const empty = modules.filter((m) => m.items.length === 0).map((m) => m.path);
  check(empty.length === 0, `every module yields at least one declaration${empty.length ? ` (empty: ${empty})` : ''}`);

  // ground truth without the scanner: count the lines that unambiguously start
  // a top-level export. If these two ever disagree, the reader has lost a file.
  let missed = [];
  for (const mod of modules) {
    const declared = new Set();
    for (const line of mod.src.split('\n')) {
      const m = line.match(/^export\s+(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/);
      if (m) declared.add(m[1]);
    }
    const found = new Set(mod.items.filter((i) => i.exported).map((i) => i.name));
    for (const name of declared) if (!found.has(name)) missed.push(`${mod.path}:${name}`);
  }
  check(missed.length === 0, `no exported declaration is dropped${missed.length ? ` (missed: ${missed.join(', ')})` : ''}`);
}

console.log('text and code are told apart — the failure mode that is silent');
{
  const gen = modules.find((m) => m.path.endsWith('music/generators.js'));
  // generators.js is the hard case on purpose: mini-notation strings full of
  // braces and brackets, and 59 template literals
  check(gen.items.length > 30, `generators.js yields ${gen.items.length} declarations, not a truncated handful`);
  check(gen.items.some((i) => i.name === 'buildArrangement' && i.loc > 400),
    'buildArrangement is read as one long declaration, so its body is not mistaken for top level');

  const t = tokenize('const a = "{{{"; const b = `x ${ { y: 1 } } z`; const c = 4 / 2 / 1; const d = 5;');
  const decls = t.masked.match(/const [a-d]/g) ?? [];
  check(decls.length === 4, `braces in strings, a nested interpolation and two divisions leave all four declarations visible (${decls.length}/4)`);
  check(!t.masked.includes('{{{'), 'string contents are blanked out of the code view');

  const lines = tokenize('a;\n// c\n/* b\n   b */\nd;').masked.split('\n').length;
  check(lines === 5, 'blanking preserves newlines, so reported line numbers stay exact');
}

console.log('comments are attached to the thing they describe');
{
  const bus = modules.find((m) => m.path.endsWith('bus.js'));
  check(!!bus.header && bus.header.includes('shared control bus'), 'the module header comment is picked up as the lead');

  const cps = bus.items.find((i) => i.name === 'CPS');
  check(/cycles \(bars\) per second/.test(cps.doc),
    'a trailing same-line comment documents its constant (half this codebase documents that way)');

  const brightness = bus.items.find((i) => i.name === 'TRACKS');
  check(brightness.doc.length > 100, 'a JSDoc block above a declaration is attached to it');

  const gen = modules.find((m) => m.path.endsWith('music/generators.js'));
  const build = gen.items.find((i) => i.name === 'buildArrangement');
  check(build.steps.length >= 8,
    `the internal banners of buildArrangement become a walkthrough (${build.steps.length} steps)`);
  check(build.steps.some((s) => /drums: the break/.test(s.title)), 'the walkthrough keeps the author’s own step titles');
  check(build.steps.every((s, i, all) => i === 0 || s.line > all[i - 1].line), 'walkthrough steps stay in source order');
  check(build.steps.some((s) => s.notes.length > 0), 'prose written under a banner is kept with that step');
}

console.log('signatures say what the thing is');
{
  const gen = modules.find((m) => m.path.endsWith('music/generators.js'));
  const dmax = gen.items.find((i) => i.name === 'D_MAX');
  check(dmax.label === 'constant',
    'a parenthesized expression containing an arrow callback is not reported as a function');
  const bagFor = gen.items.find((i) => i.name === 'bagFor');
  check(bagFor.label === 'function' && bagFor.signature.includes('(library, override, name)'),
    'an arrow-function constant is reported as a function, with its parameters');
  const shape = modules.find((m) => m.path.endsWith('bus.js')).items.find((i) => i.name === 'SHAPE');
  check(!shape.signature.includes('//'), 'a trailing comment does not leak into a signature');
}

console.log('the cross-references resolve');
{
  const decisions = readDecisions(read('docs/design_decisions.md'));
  check(decisions.size >= 30, `${decisions.size} decisions indexed from design_decisions.md`);
  check(decisions.get('35')?.title.includes('room'), 'D35 resolves to its own title');

  const html = prose('Set by D35 and §6.1, see `bus.js`.', {
    decisions, modules: new Map([['bus.js', { id: 'src-bus-js' }]]),
  });
  check(html.includes('href="../design_decisions.md#'), 'a D-number in a comment becomes a link into the ADR log');
  check(html.includes('class="ref sec"'), 'a § reference is marked but not linked (which doc it means is ambiguous)');
  check(html.includes('href="#src-bus-js"'), 'a module named in a comment links to its own section');

  const missing = prose('Set by D99.', { decisions, modules: new Map() });
  check(!missing.includes('<a'), 'a D-number with no matching entry is left as plain text, not a broken link');
}

console.log('the markdown subset keeps what matters');
{
  const diagram = prose('  a → b\n  c → d', {});
  check(diagram.startsWith('<pre'), 'an ASCII diagram is preserved verbatim, not reflowed into a paragraph');
  check(prose('- one\n- two', {}).includes('<li>'), 'a dash list becomes a list');
  check(prose('**hard** and `code`', {}).includes('<strong>hard</strong>'), 'bold survives');
  check(!prose('<script>x</script>', {}).includes('<script>'), 'source text cannot inject markup into the page');
  check(summarize('First sentence. Second one.') === 'First sentence.', 'the summary is the first sentence');
}

console.log('the highlighter is driven by the scanner’s ranges, not by guessing');
{
  const src = 'const s = "if (x) {"; if (y) { }';
  const { comments, strings } = tokenize(src);
  const out = highlight(src, { comments, strings }, 0, src.length);
  check((out.match(/class="k"/g) ?? []).length === 2,
    'the keywords inside a string are not highlighted as keywords (const + if = 2, not 3)');
  check(escapeHtml('<a & "b">') === '&lt;a &amp; &quot;b&quot;&gt;', 'everything is escaped on the way out');
}

console.log(failures === 0 ? '\nall docs-scanner checks pass' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
