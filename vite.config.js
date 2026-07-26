import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext', // three/webgpu + strudel use modern syntax / top-level await
  },
});
