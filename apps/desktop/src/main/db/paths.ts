/**
 * Filesystem paths for the Team-X main process DB layer.
 *
 * This module depends on `electron.app`, so it is NOT safely importable
 * from Vitest unit tests (there is no Electron context). Keep this module
 * thin and test the consumers (client.ts, migrate.ts) via dependency
 * injection of paths rather than by mocking this file.
 *
 * Layout under Electron's userData directory:
 *   <userData>/team-x/
 *   ├─ team-x.sqlite           ← main DB (this file)
 *   ├─ team-x.sqlite-wal       ← WAL journal (gitignored)
 *   ├─ team-x.sqlite-shm       ← shared memory index
 *   └─ vault/                  ← file vault (landing in Task 26+)
 *
 * `app.getPath('userData')` is the platform-correct per-user app data
 * directory after main boot pins the profile to the stable Team-X app
 * name: %APPDATA%/Team-X on Windows, ~/Library/Application Support/
 * Team-X on macOS, ~/.config/Team-X on Linux.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { app } from 'electron';

/**
 * Return (and ensure) the Team-X subdirectory inside Electron's userData
 * directory. Creates the directory on first call if it does not exist.
 */
export function userDataDir(): string {
  const dir = join(app.getPath('userData'), 'team-x');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Absolute path to the main SQLite database file. */
export function dbPath(): string {
  return join(userDataDir(), 'team-x.sqlite');
}
