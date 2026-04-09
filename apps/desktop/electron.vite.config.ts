import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Workspace packages are authored in TypeScript with `main: ./src/index.ts`
// (no compile step — they exist as source-only modules in the pnpm workspace).
// By default `externalizeDepsPlugin` would mark them as external, leaving Node
// to load the `.ts` file at runtime — which fails with ERR_UNKNOWN_FILE_EXTENSION.
// Exclude them explicitly so Vite bundles them into the main-process output,
// compiling their TypeScript in the process. Any new @team-x/* package that
// ends up imported from main/preload must be added here.
const workspaceDeps = [
  '@team-x/shared-types',
  '@team-x/role-schema',
  '@team-x/provider-router',
  '@team-x/telemetry-core',
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceDeps })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceDeps })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
  },
});
