#!/usr/bin/env node
/**
 * gen_docs.mjs — build docs/api/index.html from the source and its comments.
 *
 *   node tools/gen_docs.mjs            rebuild the page
 *   node tools/gen_docs.mjs --watch    rebuild on every save (no deps, fs.watch)
 *   node tools/gen_docs.mjs --check    exit 1 if the page is stale — the CI gate
 *   node tools/gen_docs.mjs --quiet    say nothing unless something changed
 *
 * Three properties this tool is built around, all of them consequences of the
 * fact that several agents work this repo at once:
 *
 *   ZERO DEPENDENCIES. It runs from a git hook, and hooks fire in worktrees
 *   that have no `node_modules`. A generator that only works where someone has
 *   run `npm install` is a generator that silently stops.
 *
 *   DETERMINISTIC OUTPUT. No timestamp, no commit hash, no machine paths. The
 *   page is a pure function of `src/`, `README.md` and `docs/design_decisions.md`,
 *   so an unchanged tree regenerates byte-identical and two branches that
 *   touched different modules do not collide on a rewritten header line.
 *
 *   IT ONLY WRITES WHEN THE BYTES CHANGE, so a no-op run leaves mtime alone and
 *   nothing downstream (watchers, hooks, `git status`) sees phantom work.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, watch } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanModule } from './docs/scan.mjs';
import { renderPage, GROUPS } from './docs/render.mjs';
import { readDecisions } from './docs/prose.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'src');
const OUT = join(ROOT, 'docs', 'api', 'index.html');
const INPUTS = [SRC_DIR, join(ROOT, 'README.md'), join(ROOT, 'docs', 'design_decisions.md')];

export const DOC_INPUTS = INPUTS;
export const DOC_OUTPUT = OUT;

const args = new Set(process.argv.slice(2));
const quiet = args.has('--quiet');
const say = (...m) => { if (!quiet) console.log(...m); };

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

export function build() {
  const files = walk(SRC_DIR);
  const modules = files.map((full) => {
    const path = relative(ROOT, full).split(/[\\/]/).join('/');
    return scanModule(path, readFileSync(full, 'utf8'));
  });
  const readme = existsSync(join(ROOT, 'README.md')) ? readFileSync(join(ROOT, 'README.md'), 'utf8') : '';
  const adrPath = join(ROOT, 'docs', 'design_decisions.md');
  const decisions = existsSync(adrPath) ? readDecisions(readFileSync(adrPath, 'utf8')) : new Map();
  const html = renderPage({ modules, decisions, readme, groups: GROUPS });
  return { html, modules, decisions };
}

/** Write only when the bytes differ, so a no-op run leaves mtime — and git — alone. */
export function writeDocs() {
  const { html } = build();
  mkdirSync(dirname(OUT), { recursive: true });
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (current === html) return false;
  writeFileSync(OUT, html);
  return true;
}

function writeIfChanged(html) {
  mkdirSync(dirname(OUT), { recursive: true });
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (current === html) return false;
  writeFileSync(OUT, html);
  return true;
}

function run() {
  const { html, modules, decisions } = build();
  const exports_ = modules.reduce((a, m) => a + m.items.filter((i) => i.exported).length, 0);
  const gaps = modules.reduce((a, m) => a + m.items.filter((i) => i.exported && !i.doc).length, 0);

  if (args.has('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
    if (current === html) { say(`docs are current — ${modules.length} modules, ${exports_} exports`); return 0; }
    console.error('docs/api/index.html is stale. Run `npm run docs` and commit the result.');
    return 1;
  }

  const changed = writeIfChanged(html);
  say(`${changed ? 'wrote' : 'unchanged'} ${relative(ROOT, OUT)} — ${modules.length} modules, ` +
      `${exports_} exports, ${decisions.size} decisions linked` +
      (gaps ? `, ${gaps} uncommented` : ''));
  return 0;
}

// Importing this module must not run the CLI: vite.config.js pulls `writeDocs`
// in, and a top-level `process.exit` would take the dev server with it.
const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (!invokedDirectly) {
  // imported as a library — nothing to do
} else if (args.has('--watch')) {
  run();
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer); // coalesce: an editor save can fire three events
    timer = setTimeout(() => {
      try {
        const { html } = build();
        if (writeIfChanged(html)) console.log(`[docs] rebuilt ${new Date().toTimeString().slice(0, 8)}`);
      } catch (err) {
        console.error(`[docs] ${err.message}`);
      }
    }, 120);
  };
  for (const target of INPUTS) {
    if (!existsSync(target)) continue;
    watch(target, { recursive: statSync(target).isDirectory() }, rebuild);
  }
  console.log('[docs] watching src/, README.md, docs/design_decisions.md — ctrl-c to stop');
} else {
  process.exit(run());
}
