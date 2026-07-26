/**
 * Node resolve hook for pattern-level tests. @kabelsalat/web (pulled in by
 * @strudel/core's repl) ships `main: dist/index.js` — an IIFE bundle with no
 * ESM exports — which node rejects. Its real ESM build sits next to it; Vite
 * picks it up via the `module` field, node needs this nudge.
 *
 * Used via test/register.mjs: node --import ./test/register.mjs test/seams.mjs
 */
export async function resolve(specifier, context, next) {
  if (specifier === '@kabelsalat/web') {
    return next('@kabelsalat/web/dist/index.mjs', context);
  }
  return next(specifier, context);
}
