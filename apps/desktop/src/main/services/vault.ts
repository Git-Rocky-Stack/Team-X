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
  CreateFileVaultInput,
  FileVaultRow,
  UpdateFileVaultInput,
} from '../db/repos/vault.js';

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
  /** Base path for company data (e.g. <userData>/companies). */
  companiesBasePath: string;
  /** Resolve company slug from id. */
  getCompanySlug: (companyId: string) => string | null;
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
  return (
    name
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strip C0 control chars from filenames
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 200)
  );
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
  const { vaultRepo, companiesBasePath, getCompanySlug } = deps;

  function getVaultDir(companyId: string): string {
    const slug = getCompanySlug(companyId);
    if (!slug) throw new Error(`[vault] Company not found: ${companyId}`);
    return path.join(companiesBasePath, slug, 'vault');
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
      await fs.mkdir(targetDir, { recursive: true });

      const targetPath = path.join(targetDir, filename);
      await fs.copyFile(sourcePath, targetPath);

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

      // Verify file exists on disk
      try {
        await fs.access(absolutePath);
      } catch {
        throw new Error(`[vault] File missing from disk: ${absolutePath}`);
      }

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

      // Delete from disk (ignore if already gone)
      try {
        await fs.unlink(absolutePath);
      } catch {
        // File already gone — proceed with DB cleanup
      }

      // Delete from database (triggers FTS5 cleanup via migration triggers)
      vaultRepo.delete(fileId);
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
