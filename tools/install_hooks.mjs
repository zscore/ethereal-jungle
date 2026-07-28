#!/usr/bin/env node
/**
 * install_hooks.mjs — point git at the version-controlled hooks in tools/githooks.
 *
 * Runs from npm's `prepare` lifecycle, so `npm install` wires it up, and can be
 * run by hand with `npm run hooks:install`.
 *
 * `core.hooksPath` rather than copying files into `.git/hooks`: the setting is
 * shared by the main checkout and every worktree, and it is relative to the
 * working tree root, so each worktree runs the hook version that its own branch
 * has checked out. On a branch where `tools/githooks/pre-commit` does not exist
 * yet, git finds no hook and does nothing — which is why setting this is safe
 * before the branch carrying the hook is merged.
 *
 * It refuses to clobber a hooksPath someone else has already set, and it is a
 * no-op outside a git repository (a tarball, a CI cache) rather than an error.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = 'tools/githooks';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

try {
  git('rev-parse', '--git-dir');
} catch {
  process.exit(0); // not a git checkout: nothing to install, nothing to complain about
}

let current = '';
try { current = git('config', '--get', 'core.hooksPath'); } catch { /* unset */ }

if (current && current !== HOOKS) {
  console.log(`hooks: core.hooksPath is already "${current}" — leaving it alone.`);
  console.log(`       To use this repo's hooks: git config core.hooksPath ${HOOKS}`);
  process.exit(0);
}

for (const name of existsSync(join(ROOT, HOOKS)) ? readdirSync(join(ROOT, HOOKS)) : []) {
  chmodSync(join(ROOT, HOOKS, name), 0o755); // git will not run a hook it cannot execute
}

if (current !== HOOKS) {
  git('config', 'core.hooksPath', HOOKS);
  console.log(`hooks: core.hooksPath → ${HOOKS} (docs regenerate on commit)`);
}
