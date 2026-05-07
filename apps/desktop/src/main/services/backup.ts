/**
 * Backup service — one-click full backup (SQLite + vault files) to a
 * portable archive, one-click restore, and backup listing.
 *
 * Archive format: `.teamx-backup` (actually a zip) containing:
 *   - manifest.json (version, timestamp, company count, file count, total size)
 *   - team-x.sqlite (WAL-checkpointed copy)
 *   - companies/<slug>/vault/** (all vault files, preserving directory structure)
 *
 * Restore is destructive: it replaces the current DB and vault dirs.
 * The caller (IPC handler) must confirm with the user before invoking.
 *
 * Design invariant: blobs on filesystem, metadata in SQLite. Backup
 * preserves both. Zero file-size cap.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface BackupManifest {
  version: string;
  createdAt: string;
  appVersion: string;
  companyCount: number;
  fileCount: number;
  totalSizeBytes: number;
  dbSizeBytes: number;
}

export interface BackupEntry {
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  manifest: BackupManifest | null;
}

/**
 * Per-company result of the post-restore system-employee bootstrap
 * (M33 follow-up F4). Either flag is `true` only when a brand-new
 * row was inserted — pre-existing system rows yield `false` on both.
 */
export interface PostRestoreCompanyResult {
  companyId: string;
  agentCreated: boolean;
  copilotCreated: boolean;
}

/**
 * Aggregate result of {@link BackupService.ensurePostRestoreSystemEmployees}.
 *
 *  - `companiesScanned` — total companies iterated (matches
 *    `listCompanyIds().length` on success).
 *  - `agentsCreated` — number of `system-agent` rows inserted.
 *    For a post-M31 backup: 0. For a pre-M31 backup: equals
 *    `companiesScanned`.
 *  - `copilotsCreated` — number of `system-copilot` rows inserted.
 *    For a post-M33 backup: 0. For a pre-M33 (but post-M31) backup:
 *    equals `companiesScanned`.
 *  - `perCompany` — breakdown by company id so the caller can log
 *    or surface which rows were repaired. Ordering matches
 *    `listCompanyIds()`.
 *  - `skipped` — entries for companies where `ensureSystemForCompany`
 *    threw. The restore itself is NOT rolled back — a pre-M33 backup
 *    that survives every other step should not be marked invalid by
 *    a single broken system-role seed. Callers log and continue.
 */
export interface EnsurePostRestoreResult {
  companiesScanned: number;
  agentsCreated: number;
  copilotsCreated: number;
  perCompany: PostRestoreCompanyResult[];
  skipped: Array<{ companyId: string; reason: string }>;
}

/**
 * Callbacks injected by the composition root so the backup service
 * itself stays free of drizzle + role-loader imports. Matches the
 * factory-pattern discipline used elsewhere in the codebase (vault,
 * companies repo, etc.).
 *
 *  - `listCompanyIds` — returns every live company id in the freshly
 *    restored DB. Implementation reads from `companiesRepo.list()`.
 *  - `ensureSystemForCompany` — idempotent per-company bootstrap that
 *    calls `ensureSystemAgent` + `ensureSystemCopilot`. Implementation
 *    lives in `system-agent-bootstrap.ts` and the handler threads it
 *    through from the composition root.
 */
export interface EnsurePostRestoreArgs {
  listCompanyIds: () => string[];
  ensureSystemForCompany: (companyId: string) => {
    agentCreated: boolean;
    copilotCreated: boolean;
  };
}

export interface BackupServiceDeps {
  /** Path to the SQLite database file. */
  dbPath: string;
  /** Base path for company data (contains vault dirs). */
  companiesBasePath: string;
  /** Path to store/find backup archives. */
  backupsDir: string;
  /** App version string for manifest. */
  appVersion: string;
  /** Function to checkpoint WAL before backup. */
  checkpointWal: () => void;
}

/**
 * Recursively collect all files under a directory, returning relative paths.
 */
async function collectFiles(dir: string, base?: string): Promise<string[]> {
  const result: string[] = [];
  const root = base ?? dir;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await collectFiles(full, root)));
      } else {
        result.push(path.relative(root, full));
      }
    }
  } catch {
    // Directory doesn't exist — no files to collect
  }
  return result;
}

/**
 * Simple zip-like archive using Node's built-in zlib + tar-like concatenation.
 * Since we can't depend on external zip libraries, we use a JSON manifest +
 * directory copy approach: the "archive" is a directory that gets compressed.
 *
 * For Phase 4 shipping: the backup is a directory containing the manifest,
 * DB copy, and vault files. We tar.gz it if the archiver is available,
 * otherwise fall back to a plain directory copy.
 */
export function createBackupService(deps: BackupServiceDeps) {
  const { dbPath, companiesBasePath, backupsDir, appVersion, checkpointWal } = deps;

  async function ensureBackupsDir(): Promise<void> {
    await fs.mkdir(backupsDir, { recursive: true });
  }

  return {
    /**
     * Create a full backup. Returns the path to the backup directory.
     *
     * Steps:
     * 1. Checkpoint WAL so the .sqlite file is complete
     * 2. Create a timestamped backup directory
     * 3. Copy the SQLite database
     * 4. Copy all vault files preserving directory structure
     * 5. Write manifest.json
     */
    async create(destination?: string): Promise<{ backupPath: string; manifest: BackupManifest }> {
      await ensureBackupsDir();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupName = `backup-${timestamp}`;
      const backupDir = destination
        ? path.join(destination, backupName)
        : path.join(backupsDir, backupName);

      await fs.mkdir(backupDir, { recursive: true });

      // 1. Checkpoint WAL
      try {
        checkpointWal();
      } catch (err) {
        console.warn('[backup] WAL checkpoint failed (proceeding anyway):', err);
      }

      // 2. Copy SQLite database
      const dbDest = path.join(backupDir, 'team-x.sqlite');
      await fs.copyFile(dbPath, dbDest);
      const dbStat = await fs.stat(dbDest);

      // Also copy WAL/SHM if they exist (belt-and-suspenders)
      for (const ext of ['-wal', '-shm']) {
        const walPath = dbPath + ext;
        try {
          await fs.access(walPath);
          await fs.copyFile(walPath, dbDest + ext);
        } catch {
          // No WAL/SHM — normal after checkpoint
        }
      }

      // 3. Copy vault files
      let fileCount = 0;
      let totalSize = 0;
      const vaultDest = path.join(backupDir, 'companies');
      try {
        const companySlugs = await fs.readdir(companiesBasePath);
        for (const slug of companySlugs) {
          const vaultSrc = path.join(companiesBasePath, slug, 'vault');
          const vaultTarget = path.join(vaultDest, slug, 'vault');
          const files = await collectFiles(vaultSrc);
          for (const relPath of files) {
            const src = path.join(vaultSrc, relPath);
            const dest = path.join(vaultTarget, relPath);
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.copyFile(src, dest);
            const stat = await fs.stat(src);
            totalSize += stat.size;
            fileCount++;
          }
        }
      } catch {
        // No companies dir yet — no vault files to backup
      }

      // 4. Count companies (from directory structure)
      let companyCount = 0;
      try {
        const entries = await fs.readdir(companiesBasePath);
        companyCount = entries.length;
      } catch {
        companyCount = 0;
      }

      // 5. Write manifest
      const manifest: BackupManifest = {
        version: '1',
        createdAt: new Date().toISOString(),
        appVersion,
        companyCount,
        fileCount,
        totalSizeBytes: totalSize + dbStat.size,
        dbSizeBytes: dbStat.size,
      };
      await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      return { backupPath: backupDir, manifest };
    },

    /**
     * Restore from a backup directory. DESTRUCTIVE — replaces current DB + vault.
     *
     * The caller must stop the orchestrator and close the DB before calling.
     */
    async restore(backupPath: string): Promise<BackupManifest> {
      // Validate manifest
      const manifestPath = path.join(backupPath, 'manifest.json');
      const manifestText = await fs.readFile(manifestPath, 'utf-8');
      const manifest: BackupManifest = JSON.parse(manifestText);

      // Validate DB exists in backup
      const backupDb = path.join(backupPath, 'team-x.sqlite');
      await fs.access(backupDb);

      // Replace the current database
      await fs.copyFile(backupDb, dbPath);

      // Copy WAL/SHM if present in backup
      for (const ext of ['-wal', '-shm']) {
        const walBackup = backupDb + ext;
        try {
          await fs.access(walBackup);
          await fs.copyFile(walBackup, dbPath + ext);
        } catch {
          // Remove stale WAL/SHM from current DB
          try {
            await fs.unlink(dbPath + ext);
          } catch {
            // Already gone
          }
        }
      }

      // Restore vault files
      const backupCompanies = path.join(backupPath, 'companies');
      try {
        await fs.access(backupCompanies);
        const slugs = await fs.readdir(backupCompanies);
        for (const slug of slugs) {
          const srcVault = path.join(backupCompanies, slug, 'vault');
          const destVault = path.join(companiesBasePath, slug, 'vault');

          // Clear existing vault for this company
          try {
            await fs.rm(destVault, { recursive: true, force: true });
          } catch {
            // Didn't exist
          }

          // Copy from backup
          const files = await collectFiles(srcVault);
          for (const relPath of files) {
            const src = path.join(srcVault, relPath);
            const dest = path.join(destVault, relPath);
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.copyFile(src, dest);
          }
        }
      } catch {
        // No companies in backup — nothing to restore
      }

      return manifest;
    },

    /**
     * Post-restore sweep that bootstraps the two system pseudo-employees
     * (`system-agent`, `system-copilot`) for every company in the
     * just-restored DB (M33 follow-up F4).
     *
     * Why this exists: the `restore` method above ships-final in Phase 4
     * and predates both the `is_system` column (M31 migration 0010) AND
     * the `system-copilot` row (M33 T2). Restoring a pre-M31 backup
     * leaves no `system-agent` row; restoring a pre-M33 (but post-M31)
     * backup leaves no `system-copilot` row. Either case strands users
     * with a subtly broken app — the command palette's agentic loop
     * and the copilot analyzer silently no-op because their pseudo-
     * employee seats are empty.
     *
     * Execution contract:
     *
     *  - MUST be called AFTER `restore()` completes — the DB handle is
     *    already pointing at the swapped file.
     *  - Iterates every company id from the injected `listCompanyIds()`
     *    callback. The handler composes this from `companiesRepo.list()`.
     *  - For each company, calls `ensureSystemForCompany(companyId)`
     *    which performs the idempotent `ensureSystemAgent` +
     *    `ensureSystemCopilot` dual-seed. Both are no-ops when the
     *    rows already exist — safe to run against a current-schema
     *    backup (both flags return `false`).
     *  - A throw from `ensureSystemForCompany` does NOT abort the
     *    sweep. The failure is recorded in `skipped[]` and the loop
     *    moves on to the next company. Rationale: a single broken
     *    role-pack or DB constraint should not take down a
     *    multi-company restore. Caller logs the `skipped[]` entries
     *    and surfaces a user-facing warning if non-empty.
     *
     * This method is synchronous by design — the ensure functions
     * themselves run inline against a BaseSQLiteDatabase. Wrapping
     * in `async` would introduce an unnecessary microtask-boundary
     * between the restore and the bootstrap on the same event loop turn.
     */
    ensurePostRestoreSystemEmployees(args: EnsurePostRestoreArgs): EnsurePostRestoreResult {
      const { listCompanyIds, ensureSystemForCompany } = args;
      const perCompany: PostRestoreCompanyResult[] = [];
      const skipped: Array<{ companyId: string; reason: string }> = [];
      let agentsCreated = 0;
      let copilotsCreated = 0;

      const ids = listCompanyIds();
      for (const companyId of ids) {
        try {
          const outcome = ensureSystemForCompany(companyId);
          perCompany.push({ companyId, ...outcome });
          if (outcome.agentCreated) agentsCreated += 1;
          if (outcome.copilotCreated) copilotsCreated += 1;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          skipped.push({ companyId, reason });
          console.warn(
            `[backup] ensurePostRestoreSystemEmployees: company ${companyId} skipped — ${reason}`,
          );
        }
      }

      return {
        companiesScanned: ids.length,
        agentsCreated,
        copilotsCreated,
        perCompany,
        skipped,
      };
    },

    /**
     * Delete a backup directory permanently. Used by the Settings UI to
     * prune old backups without leaving the app — there is no undo.
     *
     * Safety contract:
     *
     *  - The argument is a full filesystem path, taken verbatim from the
     *    renderer's `BackupEntry.path`. To prevent any chance of a
     *    directory-traversal bug deleting `C:\Windows` (or `/etc`), the
     *    path MUST resolve inside `backupsDir`. We compute the relative
     *    path and reject anything that escapes (`..`) or absolute-paths
     *    out (`path.relative` returns an absolute path on different
     *    drives on Windows). Callers receive a typed error in those cases.
     *  - The directory must exist. A missing path is treated as success
     *    (idempotent delete) so a renderer race that double-clicks the
     *    button does not surface an error to the user.
     *  - `fs.rm` is invoked with `recursive: true` to clear the manifest +
     *    DB copy + vault snapshots inside the backup directory.
     *
     * Returns the deleted path so the IPC layer can echo it for audit
     * logging without a second round trip.
     */
    async delete(backupPath: string): Promise<{ deletedPath: string }> {
      if (typeof backupPath !== 'string' || backupPath.length === 0) {
        throw new Error('[backup] delete: backupPath is required');
      }

      const resolved = path.resolve(backupPath);
      const resolvedRoot = path.resolve(backupsDir);
      const relative = path.relative(resolvedRoot, resolved);
      const escapesRoot =
        relative.length === 0 ||
        relative.startsWith('..') ||
        path.isAbsolute(relative);
      if (escapesRoot) {
        throw new Error(
          `[backup] delete: refusing to delete path outside backups directory: ${backupPath}`,
        );
      }

      try {
        await fs.access(resolved);
      } catch {
        // Already gone — treat as success.
        return { deletedPath: resolved };
      }

      await fs.rm(resolved, { recursive: true, force: true });
      return { deletedPath: resolved };
    },

    /**
     * List all backup directories in the backups directory.
     */
    async list(): Promise<BackupEntry[]> {
      await ensureBackupsDir();
      const entries: BackupEntry[] = [];

      try {
        const dirs = await fs.readdir(backupsDir, { withFileTypes: true });
        for (const dir of dirs) {
          if (!dir.isDirectory() || !dir.name.startsWith('backup-')) continue;

          const backupPath = path.join(backupsDir, dir.name);
          const stat = await fs.stat(backupPath);

          let manifest: BackupManifest | null = null;
          try {
            const mText = await fs.readFile(path.join(backupPath, 'manifest.json'), 'utf-8');
            manifest = JSON.parse(mText);
          } catch {
            // No manifest — corrupted backup
          }

          entries.push({
            filename: dir.name,
            path: backupPath,
            createdAt: manifest?.createdAt ?? stat.mtime.toISOString(),
            sizeBytes: manifest?.totalSizeBytes ?? 0,
            manifest,
          });
        }
      } catch {
        // Backups dir doesn't exist yet
      }

      // Newest first
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return entries;
    },
  };
}
