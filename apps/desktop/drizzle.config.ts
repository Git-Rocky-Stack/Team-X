/**
 * Drizzle Kit config — consumed only by the `drizzle-kit` CLI for
 * `generate`, `migrate`, `push`, and `studio` commands. The runtime DB
 * init helper (landing in Task 20) has its own connection setup and
 * does NOT read this file.
 *
 * This config file lives outside `rootDir: ./src/main`, so it is
 * intentionally omitted from tsconfig.main.json's include list (same
 * pattern as electron.vite.config.ts — see Task 17 deviations). Drizzle
 * Kit parses it via its own loader.
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations',
  dialect: 'sqlite',
  // Placeholder URL — `drizzle-kit generate` only reads the schema; this
  // credential is used by `drizzle-kit push` / `studio`. The real runtime
  // DB path is computed from `app.getPath('userData')` in Task 20.
  dbCredentials: { url: './.team-x-dev.sqlite' },
});
