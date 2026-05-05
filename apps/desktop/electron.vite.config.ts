import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'rollup';

/**
 * Plugin to handle .js extension imports in workspace packages.
 * Workspace packages use .js extensions for ESM compliance (compiled output),
 * but during bundling we need to resolve them to .ts source files.
 */
function jsToTsExtension(): Plugin {
  return {
    name: 'js-to-ts-extension',
    resolveId(source, importer) {
      if (!importer) return null;

      // Only process relative imports ending in .js from workspace packages
      if (!source.startsWith('./') && !source.startsWith('../')) return null;
      if (!source.endsWith('.js')) return null;

      // Check if importer is from a workspace package
      const workspacePackages = [
        'intelligence',
        'shared-types',
        'role-schema',
        'provider-router',
        'telemetry-core',
      ];
      const isWorkspaceImport = workspacePackages.some(
        (pkg) => importer.includes(`@team-x/${pkg}`) || importer.includes(`/packages/${pkg}/`),
      );

      if (!isWorkspaceImport) return null;

      // Get the absolute directory of the importer
      const importerDir = importer.replace(/\/[^/]+$/, '');

      // Resolve the absolute path of the source (without .js extension)
      const resolvedAbs = resolve(importerDir, source.replace(/\.js$/, '.ts'));

      // Return the absolute path
      return { id: resolvedAbs };
    },
  };
}

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
  '@team-x/intelligence',
  // sql.js must be bundled for autonomy benchmarks (uses in-memory SQLite via sql.js)
  'sql.js',
];

// Both package.json files set "type": "module", so Electron loads
// out/main/index.js as ESM where __dirname / __filename are undefined.
// Inject a banner that polyfills them from import.meta.url before any
// bundled module code executes.  import.meta.dirname would be cleaner
// but requires Node 21.2+ (Electron 31 ships Node 20.x).
const esmDirnameShim = [
  'import { fileURLToPath as __estfp } from "node:url";',
  'import { dirname as __estdn } from "node:path";',
  'const __filename = __estfp(import.meta.url);',
  'const __dirname = __estdn(__filename);',
].join('\n');

export default defineConfig({
  main: {
    plugins: [
      jsToTsExtension(),
      externalizeDepsPlugin({ exclude: workspaceDeps }),
      {
        name: 'copy-sqljs-wasm',
        writeBundle() {
          // Copy sql.js WASM file to the main process output directory
          // so it can be loaded at runtime in the bundled app.
          const wasmSrc = join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
          const wasmDest = join(__dirname, 'out/main/sql-wasm.wasm');
          if (existsSync(wasmSrc)) {
            mkdirSync(join(__dirname, 'out/main'), { recursive: true });
            copyFileSync(wasmSrc, wasmDest);
          }
        },
      },
    ],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        external: ['tiktoken', 'tiktoken/lite'],
        output: {
          banner: esmDirnameShim,
          // Force a single-file bundle for the main process. Without
          // this, Rollup code-splits workspace deps into separate chunks
          // where electron-vite's CJS shim re-declares __filename /
          // __dirname, colliding with the banner shim above and failing
          // the esbuild minify pass. A single entry = single output is
          // the correct shape for an Electron main process anyway.
          inlineDynamicImports: true,
        },
      },
    },
  },
  preload: {
    plugins: [jsToTsExtension(), externalizeDepsPlugin({ exclude: workspaceDeps })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: {
          // Electron's sandboxed preload loader only supports CommonJS.
          // With "type": "module" in package.json, a .js extension would
          // be parsed as ESM and fail with "Cannot use import statement
          // outside a module". Force CJS + .cjs extension so the file
          // is unambiguously a CommonJS module regardless of package
          // type resolution.
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
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
