/**
 * Vault service — filesystem-backed file storage with SHA256 integrity.
 *
 * Files are stored on disk under:
 *   <userData>/companies/<company-slug>/vault/<sha-prefix>/<filename>
 *
 * Metadata (name, size, SHA256, tags, extracted text) lives in the
 * `file_vault` SQLite table. FTS5 indexing on extracted text enables
 * full-text search across the vault.
 *
 * Design invariant #4: blobs on filesystem, metadata in SQLite. Zero
 * file-size cap — limited only by disk.
 *
 * The service is a factory function that takes dependencies (repo, paths)
 * and returns the public API object, matching the project pattern.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type {
  ActorKind,
  VaultFileCreatedPayload,
  VaultFileDeletedPayload,
} from '@team-x/shared-types';

import type {
  CreateFileVaultInput,
  FileVaultRow,
  UpdateFileVaultInput,
} from '../db/repos/vault.js';
import type { EventBus } from '../orchestrator/event-bus.js';

export interface VaultServiceDeps {
  vaultRepo: {
    create(input: CreateFileVaultInput): string;
    getById(id: string): FileVaultRow | null;
    listByCompany(companyId: string): FileVaultRow[];
    update(id: string, input: UpdateFileVaultInput): void;
    delete(id: string): void;
    search(
      companyId: string,
      query: string,
    ): { id: string; originalName: string; mimeType: string; sizeBytes: number; rank: number }[];
    count(companyId: string): number;
    totalSize(companyId: string): number;
  };
  artifactService?: {
    recordVaultFileArtifact(input: {
      companyId: string;
      fileId: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
      uploadedBy: string;
      uploadedByKind?: ActorKind;
      createdAt: number;
    }): unknown;
  };
  /** Base path for company data (e.g. <userData>/companies). */
  companiesBasePath: string;
  /** Resolve company slug from id. */
  getCompanySlug: (companyId: string) => string | null;
  /**
   * Event bus for `vault.file_created` / `vault.file_deleted` fan-out.
   *
   * Emits fire AFTER the DB commit so the event-bus persistence
   * ordering guarantee ("subscribers never see an event before it is
   * durably persisted") applies transitively to the vault row itself.
   * If omitted, the service runs silently — used by unit tests that
   * do not want to assert on event emission.
   *
   * Added M30 T0 to close the vault-backup E2E staleness regression.
   * See `docs/plans/2026-04-13-vault-backup-regression-findings.md`.
   */
  bus?: EventBus;
}

export interface VaultFile {
  id: string;
  companyId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  tags: string[];
  uploadedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface VaultSearchResult {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  rank: number;
}

/**
 * Compute SHA256 hex digest for a file.
 */
async function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Guess mime type from file extension. Covers common types used in
 * a project management / development context.
 */
function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    // Text
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'text/plain',
    // Code
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.js': 'text/javascript',
    '.jsx': 'text/javascript',
    '.py': 'text/x-python',
    '.rs': 'text/x-rust',
    '.go': 'text/x-go',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
    '.cs': 'text/x-csharp',
    '.kt': 'text/x-kotlin',
    '.swift': 'text/x-swift',
    '.sql': 'text/x-sql',
    '.sh': 'text/x-shellscript',
    '.html': 'text/html',
    '.css': 'text/css',
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    // Documents
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Archives
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    // Other
    '.log': 'text/plain',
    '.env': 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Extract text from a file for FTS5 indexing. Returns null for binary files.
 */
async function extractText(filePath: string, mimeType: string): Promise<string | null> {
  // Only extract from text-based formats
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  ) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // Truncate to 100KB for FTS indexing — full content stays on disk
      return content.slice(0, 100_000);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Sanitize a filename for safe filesystem storage. Preserves extension.
 */
function sanitizeFilename(name: string): string {
  return name
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char;
    })
    .join('')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 200);
}

/**
 * H16 (audit 2026-05-07): vault path-traversal defense.
 *
 * `sanitizeFilename` above defangs separator chars from user-supplied
 * filenames, but it is NOT a containment guard. Three classes of escape
 * survive it:
 *
 *   1. A symlink planted at `<vaultDir>/<sha-prefix>` pointing to e.g.
 *      `/etc`. The next `fs.mkdir(targetDir, { recursive: true })` follows
 *      the symlink, and the subsequent `fs.copyFile` writes outside the
 *      vault — `sanitizeFilename` never sees the directory component.
 *   2. A `getCompanySlug` implementation that returns a string containing
 *      `..` or an absolute-path prefix. `path.join(companiesBasePath,
 *      slug, 'vault')` composes that escape silently. The callback is
 *      dep-injected and varies per call site — we treat its output as
 *      untrusted by construction.
 *   3. Encoded traversal in `originalName` (e.g. `..%2fetc%2fpasswd`).
 *      `sanitizeFilename` operates on raw chars; URI decoding by a
 *      preceding layer is out of its scope.
 *
 * The fix is a defense-in-depth pair of helpers:
 *
 *   - `assertInsideVault(vaultDir, candidate)` — lexical containment via
 *     `path.resolve` + `startsWith(vaultDir + sep)`. Fast, sync, no FS.
 *     Catches classes (2) and (3).
 *   - `assertInsideVaultReal(vaultDir, candidate)` — symlink-aware via
 *     `fs.realpath` on BOTH sides; verifies the realpath of `candidate`
 *     is still under the realpath of `vaultDir`. Catches class (1) and
 *     defends against TOCTOU symlink races that occur between mkdir and
 *     copyFile.
 *
 * Error messages are intentionally generic — no leakage of the resolved
 * path or attempted escape target — so adversarial probing learns
 * nothing about the boundary layout.
 *
 * Case handling: Windows is case-insensitive; POSIX is case-sensitive.
 * Mirrors the pattern in `mcp-security.ts` (`pathsEqual` / `isInside`).
 */
export class VaultPathTraversalError extends Error {
  readonly code = 'VAULT_PATH_TRAVERSAL';
  constructor(message = 'Path escapes vault boundary') {
    super(`[vault] ${message}`);
    this.name = 'VaultPathTraversalError';
  }
}

function pathStartsWith(child: string, parent: string): boolean {
  if (process.platform === 'win32') {
    const c = child.toLowerCase();
    const p = parent.toLowerCase();
    return c === p || c.startsWith(p + path.sep.toLowerCase());
  }
  return child === parent || child.startsWith(parent + path.sep);
}

export function assertInsideVault(vaultDir: string, candidate: string): string {
  const resolvedVault = path.resolve(vaultDir);
  const resolvedCandidate = path.resolve(candidate);
  if (!pathStartsWith(resolvedCandidate, resolvedVault)) {
    throw new VaultPathTraversalError();
  }
  return resolvedCandidate;
}

export async function assertInsideVaultReal(vaultDir: string, candidate: string): Promise<string> {
  // Lexical check first — fast and deterministic regardless of FS state.
  const lexical = assertInsideVault(vaultDir, candidate);

  // Symlink-aware check — only meaningful when both paths exist on disk.
  // If `vaultDir` doesn't exist yet (first-ever write to a new company)
  // OR `candidate` doesn't exist yet (pre-mkdir path), symlink injection
  // at that level is structurally impossible: a symlink CANNOT be planted
  // at a path that doesn't exist. The lexical check is sufficient for
  // not-yet-existing paths; the post-mkdir caller is expected to re-run
  // this helper AFTER creating the directory, which is when an attacker
  // first has something to symlink.
  let realVault: string;
  let realCandidate: string;
  try {
    realVault = await fs.realpath(vaultDir);
  } catch {
    return lexical;
  }
  try {
    realCandidate = await fs.realpath(candidate);
  } catch {
    return lexical;
  }
  if (!pathStartsWith(realCandidate, realVault)) {
    throw new VaultPathTraversalError('Symlink escapes vault boundary');
  }
  return realCandidate;
}

function rowToVaultFile(row: FileVaultRow): VaultFile {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tagsJson);
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    companyId: row.companyId,
    filename: row.filename,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    tags,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createVaultService(deps: VaultServiceDeps) {
  const { vaultRepo, artifactService, companiesBasePath, getCompanySlug, bus } = deps;

  function getVaultDir(companyId: string): string {
    const slug = getCompanySlug(companyId);
    if (!slug) throw new Error(`[vault] Company not found: ${companyId}`);
    const vaultDir = path.join(companiesBasePath, slug, 'vault');
    // H16 (audit 2026-05-07): `getCompanySlug` is a dep-injected
    // callback whose output we treat as untrusted (a buggy slug
    // resolver, a corrupted company row, a path-encoded id). If the
    // slug contains `..` or an absolute-path prefix, the composed
    // vaultDir escapes companiesBasePath. Validating the OUTER
    // boundary here closes audit class (2) so every downstream
    // `assertInsideVault(vaultDir, ...)` operates on a vaultDir that
    // is itself known to be a strict descendant of companiesBasePath.
    assertInsideVault(companiesBasePath, vaultDir);
    return vaultDir;
  }

  return {
    /**
     * Store a file in the vault. Copies the file to the company vault
     * directory, computes SHA256, extracts text for FTS, and inserts
     * the metadata row.
     *
     * @param companyId - Company to store the file under
     * @param sourcePath - Absolute path to the source file on disk
     * @param uploadedBy - User or employee id who uploaded
     * @param tags - Optional tags array
     * @returns The vault file id
     */
    async store(
      companyId: string,
      sourcePath: string,
      uploadedBy: string,
      tags?: string[],
      uploadedByKind: ActorKind = 'user',
    ): Promise<string> {
      const originalName = path.basename(sourcePath);
      const mimeType = guessMimeType(originalName);
      const sha256 = await computeSha256(sourcePath);
      const stat = await fs.stat(sourcePath);
      const sizeBytes = stat.size;

      // Build vault path: <sha-prefix-2>/<sha-prefix-4>_<sanitized-name>
      const shaPrefix = sha256.slice(0, 2);
      const filename = `${sha256.slice(0, 8)}_${sanitizeFilename(originalName)}`;
      const vaultDir = getVaultDir(companyId);
      const targetDir = path.join(vaultDir, shaPrefix);

      // H16 (audit 2026-05-07): lexical containment BEFORE mkdir catches
      // class (2) — a getCompanySlug returning `..` or absolute-path-like
      // strings that compose an escape via path.join.
      assertInsideVault(vaultDir, targetDir);

      await fs.mkdir(targetDir, { recursive: true });

      // H16 (audit 2026-05-07): symlink-aware check AFTER mkdir catches
      // class (1) — a symlink planted at `<vaultDir>/<sha-prefix>`
      // pointing outside the vault. fs.mkdir(recursive: true) follows
      // existing symlinks silently; this realpath check is what stops
      // the next fs.copyFile from writing into the symlink's target.
      await assertInsideVaultReal(vaultDir, targetDir);

      const targetPath = path.join(targetDir, filename);

      // Lexical check on the leaf — defense-in-depth even though
      // `filename` is constructed from sanitizeFilename + sha8 (both
      // safe by construction today). Pins the contract so a future
      // refactor that admits a less-trusted filename source doesn't
      // silently regress.
      assertInsideVault(vaultDir, targetPath);

      await fs.copyFile(sourcePath, targetPath);

      // Final symlink check on the written leaf — closes the TOCTOU
      // window where an attacker could replace `targetPath` with a
      // symlink AFTER the mkdir realpath check but BEFORE copyFile
      // dereferences it. If this fires, the copy already wrote
      // *somewhere*; unlink the leaf to avoid leaving a stale write.
      try {
        await assertInsideVaultReal(vaultDir, targetPath);
      } catch (err) {
        try {
          await fs.unlink(targetPath);
        } catch {
          // Best effort — the leaf may have been the symlink itself,
          // not a file we can unlink.
        }
        throw err;
      }

      // Extract text for FTS5 indexing
      const extractedText = await extractText(targetPath, mimeType);

      // Store relative path from vault root
      const vaultPath = path.join(shaPrefix, filename);

      const id = vaultRepo.create({
        companyId,
        filename,
        originalName,
        mimeType,
        sizeBytes,
        sha256,
        vaultPath,
        extractedText,
        tagsJson: JSON.stringify(tags ?? []),
        uploadedBy,
      });

      if (artifactService) {
        try {
          artifactService.recordVaultFileArtifact({
            companyId,
            fileId: id,
            originalName,
            mimeType,
            sizeBytes,
            sha256,
            uploadedBy,
            uploadedByKind,
            createdAt: Date.now(),
          });
        } catch (err) {
          console.error('[vault] failed to record artifact:', err);
        }
      }

      // Fan out AFTER the DB commit so the event-bus persistence
      // ordering guarantee applies: a subscriber that saw
      // `vault.file_created` is safe to query the row it references.
      // Wrap in try/catch — a bus emit failure must never take down
      // the upload (the file is already on disk + in the DB).
      if (bus) {
        try {
          bus.emit<VaultFileCreatedPayload>({
            type: 'vault.file_created',
            companyId,
            actorId: uploadedBy,
            actorKind: uploadedByKind,
            payload: { fileId: id, originalName, mimeType, sizeBytes, sha256 },
          });
        } catch (err) {
          console.error('[vault] failed to emit vault.file_created:', err);
        }
      }

      return id;
    },

    /**
     * Retrieve a file's metadata and absolute path on disk.
     * Verifies SHA256 integrity on read.
     */
    async retrieve(fileId: string): Promise<{ file: VaultFile; absolutePath: string }> {
      const row = vaultRepo.getById(fileId);
      if (!row) throw new Error(`[vault] File not found: ${fileId}`);

      const vaultDir = getVaultDir(row.companyId);
      const absolutePath = path.join(vaultDir, row.vaultPath);

      // H16 (audit 2026-05-07): a malicious or stale `row.vaultPath`
      // from the DB (corruption, downgrade attack, restored backup
      // from a compromised host) MUST NOT escape the vault on retrieve.
      // Lexical AND symlink-aware containment before we hand the path
      // back to a caller that will read it.
      assertInsideVault(vaultDir, absolutePath);

      // Verify file exists on disk
      try {
        await fs.access(absolutePath);
      } catch {
        throw new Error(`[vault] File missing from disk: ${absolutePath}`);
      }

      await assertInsideVaultReal(vaultDir, absolutePath);

      return { file: rowToVaultFile(row), absolutePath };
    },

    /**
     * Verify SHA256 integrity of a vault file.
     * Returns true if the file on disk matches the stored hash.
     */
    async verify(fileId: string): Promise<{ ok: boolean; expected: string; actual: string }> {
      const row = vaultRepo.getById(fileId);
      if (!row) throw new Error(`[vault] File not found: ${fileId}`);

      const vaultDir = getVaultDir(row.companyId);
      const absolutePath = path.join(vaultDir, row.vaultPath);

      // H16 (audit 2026-05-07): containment + symlink check before we
      // open the file for hashing. An attacker who controls `row.vaultPath`
      // could otherwise coerce `verify` into hashing `/etc/passwd` and
      // returning `{ ok: false, actual: '<hash of /etc/passwd>' }` — a
      // hash-oracle leak.
      assertInsideVault(vaultDir, absolutePath);
      try {
        await assertInsideVaultReal(vaultDir, absolutePath);
      } catch (err) {
        if (err instanceof VaultPathTraversalError) throw err;
        // Other realpath failures (ENOENT) fall through to FILE_MISSING below.
      }

      try {
        const actual = await computeSha256(absolutePath);
        return {
          ok: actual === row.sha256,
          expected: row.sha256,
          actual,
        };
      } catch {
        return { ok: false, expected: row.sha256, actual: 'FILE_MISSING' };
      }
    },

    /**
     * Remove a file from vault — deletes from both disk and database.
     */
    async remove(fileId: string): Promise<void> {
      const row = vaultRepo.getById(fileId);
      if (!row) throw new Error(`[vault] File not found: ${fileId}`);

      const vaultDir = getVaultDir(row.companyId);
      const absolutePath = path.join(vaultDir, row.vaultPath);

      // H16 (audit 2026-05-07): containment + symlink check before
      // unlink. A malicious `row.vaultPath` (DB corruption, restored
      // backup) MUST NOT let `remove` delete outside the vault. The
      // symlink check matters because `fs.unlink` of a symlink deletes
      // the LINK not the target — but an attacker who places a symlink
      // at the leaf still wants to make us delete it, so refuse.
      assertInsideVault(vaultDir, absolutePath);
      try {
        await assertInsideVaultReal(vaultDir, absolutePath);
      } catch (err) {
        if (err instanceof VaultPathTraversalError) throw err;
        // Other realpath failures (ENOENT) fall through — the unlink
        // try/catch below handles the missing-file case.
      }

      // Delete from disk (ignore if already gone)
      try {
        await fs.unlink(absolutePath);
      } catch {
        // File already gone — proceed with DB cleanup
      }

      // Delete from database (triggers FTS5 cleanup via migration triggers)
      vaultRepo.delete(fileId);

      // Fan out AFTER the DB delete so subscribers observing
      // `vault.file_deleted` can safely assume the row is gone. Emit
      // failures are logged, not thrown — the delete already committed.
      if (bus) {
        try {
          bus.emit<VaultFileDeletedPayload>({
            type: 'vault.file_deleted',
            companyId: row.companyId,
            actorId: row.uploadedBy,
            actorKind: 'user',
            payload: { fileId },
          });
        } catch (err) {
          console.error('[vault] failed to emit vault.file_deleted:', err);
        }
      }
    },

    /**
     * Full-text search across the vault using FTS5.
     */
    search(companyId: string, query: string): VaultSearchResult[] {
      return vaultRepo.search(companyId, query);
    },

    /**
     * List all files in a company vault, newest first.
     */
    list(companyId: string): VaultFile[] {
      return vaultRepo.listByCompany(companyId).map(rowToVaultFile);
    },

    /**
     * Get a single vault file by id.
     */
    get(fileId: string): VaultFile | null {
      const row = vaultRepo.getById(fileId);
      return row ? rowToVaultFile(row) : null;
    },

    /**
     * Update file metadata (name, tags).
     */
    update(fileId: string, input: { originalName?: string; tags?: string[] }): void {
      const updates: UpdateFileVaultInput = {};
      if (input.originalName !== undefined) updates.originalName = input.originalName;
      if (input.tags !== undefined) updates.tagsJson = JSON.stringify(input.tags);
      vaultRepo.update(fileId, updates);
    },

    /**
     * Get vault statistics for a company.
     */
    stats(companyId: string): { fileCount: number; totalBytes: number } {
      return {
        fileCount: vaultRepo.count(companyId),
        totalBytes: vaultRepo.totalSize(companyId),
      };
    },
  };
}
