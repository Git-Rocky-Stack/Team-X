import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM polyfill for __dirname — we're ESM because of "type": "module"
// in the workspace package.json, so import.meta.url is the only way
// to reach the file's own directory.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Tailwind's auto-discovery walks up from CWD (apps/desktop/), not
// from the CSS file, so it never finds src/renderer/tailwind.config.ts.
// Pass the absolute path explicitly to bypass the heuristic entirely.
export default {
  plugins: {
    tailwindcss: { config: resolve(__dirname, 'tailwind.config.ts') },
    autoprefixer: {},
  },
};
