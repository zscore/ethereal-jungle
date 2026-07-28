import { defineConfig } from 'vite';
import { writeDocs, DOC_INPUTS } from './tools/gen_docs.mjs';

/**
 * The auto-docs, wired into the dev server rather than run from a second
 * watcher process: vite is already watching these files, so `npm run dev` keeps
 * `/docs/api/index.html` in step with whatever you are editing, and a build
 * regenerates once before bundling. `npm run docs:watch` still exists for
 * working on the docs without the dev server, which under software rendering
 * takes minutes to boot.
 *
 * `writeDocs` writes only when the bytes change, so an edit to a file that is
 * not an input — or one that does not affect the page — costs a scan and
 * nothing else. It also never throws into the server: a docs bug should not be
 * able to stop the music.
 */
function autoDocs() {
  const isInput = (file) => DOC_INPUTS.some((input) => file === input || file.startsWith(`${input}/`));
  const regenerate = (file) => {
    if (file && !isInput(file)) return;
    try {
      if (writeDocs()) console.log('  [docs] docs/api/index.html regenerated');
    } catch (err) {
      console.error(`  [docs] generation failed: ${err.message}`);
    }
  };
  return {
    name: 'ethereal-jungle-auto-docs',
    buildStart() { regenerate(); },
    configureServer(server) {
      server.watcher.on('change', regenerate);
      server.watcher.on('add', regenerate);
    },
  };
}

export default defineConfig({
  plugins: [autoDocs()],
  build: {
    target: 'esnext', // three/webgpu + strudel use modern syntax / top-level await
  },
});
