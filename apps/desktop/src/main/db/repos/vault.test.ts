import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createVaultRepo } from './vault.js';

describe('vault repo', () => {
  let ctx: TestDbHandle;
  let vaultRepo: ReturnType<typeof createVaultRepo>;
  let companyId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    vaultRepo = createVaultRepo(ctx.db);
    companyId = companies.create({ name: 'Test Co', slug: 'test-co' });
  });

  afterEach(() => {
    ctx.close();
  });

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('returns a non-empty id and persists the file entry', () => {
      const id = vaultRepo.create({
        companyId,
        filename: 'abc12345_readme.md',
        originalName: 'README.md',
        mimeType: 'text/markdown',
        sizeBytes: 1024,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        vaultPath: 'e3/abc12345_readme.md',
        extractedText: '# Hello World',
        uploadedBy: 'rocky',
      });
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');

      const row = vaultRepo.getById(id);
      expect(row).not.toBeNull();
      expect(row?.originalName).toBe('README.md');
      expect(row?.mimeType).toBe('text/markdown');
      expect(row?.sizeBytes).toBe(1024);
      expect(row?.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(row?.uploadedBy).toBe('rocky');
    });

    it('stores tags as JSON', () => {
      const id = vaultRepo.create({
        companyId,
        filename: 'test.txt',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        sha256: 'deadbeef',
        vaultPath: 'de/test.txt',
        tagsJson: JSON.stringify(['docs', 'important']),
        uploadedBy: 'rocky',
      });

      const row = vaultRepo.getById(id);
      expect(JSON.parse(row?.tagsJson)).toEqual(['docs', 'important']);
    });

    it('defaults tags to empty array', () => {
      const id = vaultRepo.create({
        companyId,
        filename: 'file.bin',
        originalName: 'file.bin',
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
        sha256: 'aabbccdd',
        vaultPath: 'aa/file.bin',
        uploadedBy: 'rocky',
      });

      const row = vaultRepo.getById(id);
      expect(row?.tagsJson).toBe('[]');
    });
  });

  describe('getById', () => {
    it('returns null for non-existent id', () => {
      expect(vaultRepo.getById('nonexistent')).toBeNull();
    });
  });

  describe('listByCompany', () => {
    it('returns files for the given company, newest first', () => {
      vaultRepo.create({
        companyId,
        filename: 'a.txt',
        originalName: 'a.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        sha256: 'aaa',
        vaultPath: 'aa/a.txt',
        uploadedBy: 'rocky',
      });
      vaultRepo.create({
        companyId,
        filename: 'b.txt',
        originalName: 'b.txt',
        mimeType: 'text/plain',
        sizeBytes: 20,
        sha256: 'bbb',
        vaultPath: 'bb/b.txt',
        uploadedBy: 'rocky',
      });

      const files = vaultRepo.listByCompany(companyId);
      expect(files).toHaveLength(2);
      // Newest first
      expect(files[0]?.createdAt).toBeGreaterThanOrEqual(files[1]?.createdAt);
    });

    it('returns empty array for company with no files', () => {
      expect(vaultRepo.listByCompany(companyId)).toEqual([]);
    });
  });

  describe('listByMimePrefix', () => {
    it('filters by mime type prefix', () => {
      vaultRepo.create({
        companyId,
        filename: 'photo.png',
        originalName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 5000,
        sha256: 'img1',
        vaultPath: 'im/photo.png',
        uploadedBy: 'rocky',
      });
      vaultRepo.create({
        companyId,
        filename: 'doc.md',
        originalName: 'doc.md',
        mimeType: 'text/markdown',
        sizeBytes: 100,
        sha256: 'txt1',
        vaultPath: 'tx/doc.md',
        uploadedBy: 'rocky',
      });

      const images = vaultRepo.listByMimePrefix(companyId, 'image/');
      expect(images).toHaveLength(1);
      expect(images[0]?.originalName).toBe('photo.png');
    });
  });

  describe('update', () => {
    it('updates originalName and tags', () => {
      const id = vaultRepo.create({
        companyId,
        filename: 'old.txt',
        originalName: 'old.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        sha256: 'abc',
        vaultPath: 'ab/old.txt',
        uploadedBy: 'rocky',
      });

      vaultRepo.update(id, {
        originalName: 'new-name.txt',
        tagsJson: JSON.stringify(['renamed']),
      });

      const row = vaultRepo.getById(id);
      expect(row?.originalName).toBe('new-name.txt');
      expect(JSON.parse(row?.tagsJson)).toEqual(['renamed']);
      expect(row?.updatedAt).toBeGreaterThanOrEqual(row?.createdAt);
    });
  });

  describe('delete', () => {
    it('removes the entry from the database', () => {
      const id = vaultRepo.create({
        companyId,
        filename: 'del.txt',
        originalName: 'del.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        sha256: 'del',
        vaultPath: 'de/del.txt',
        uploadedBy: 'rocky',
      });

      expect(vaultRepo.getById(id)).not.toBeNull();
      vaultRepo.delete(id);
      expect(vaultRepo.getById(id)).toBeNull();
    });
  });

  describe('search (fallback mode without FTS5)', () => {
    it('returns files matching the query by name', () => {
      vaultRepo.create({
        companyId,
        filename: 'readme.md',
        originalName: 'README.md',
        mimeType: 'text/markdown',
        sizeBytes: 100,
        sha256: 'r1',
        vaultPath: 'r1/readme.md',
        extractedText: 'Hello world documentation',
        uploadedBy: 'rocky',
      });
      vaultRepo.create({
        companyId,
        filename: 'config.json',
        originalName: 'config.json',
        mimeType: 'application/json',
        sizeBytes: 50,
        sha256: 'c1',
        vaultPath: 'c1/config.json',
        uploadedBy: 'rocky',
      });

      const results = vaultRepo.search(companyId, 'README');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.originalName).toBe('README.md');
    });

    it('returns empty array when nothing matches', () => {
      expect(vaultRepo.search(companyId, 'nonexistent-xyz')).toEqual([]);
    });
  });

  describe('count', () => {
    it('returns zero for empty vault', () => {
      expect(vaultRepo.count(companyId)).toBe(0);
    });

    it('returns correct count', () => {
      vaultRepo.create({
        companyId,
        filename: 'a.txt',
        originalName: 'a.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        sha256: 'a1',
        vaultPath: 'a1/a.txt',
        uploadedBy: 'rocky',
      });
      vaultRepo.create({
        companyId,
        filename: 'b.txt',
        originalName: 'b.txt',
        mimeType: 'text/plain',
        sizeBytes: 20,
        sha256: 'b1',
        vaultPath: 'b1/b.txt',
        uploadedBy: 'rocky',
      });
      expect(vaultRepo.count(companyId)).toBe(2);
    });
  });

  describe('totalSize', () => {
    it('returns zero for empty vault', () => {
      expect(vaultRepo.totalSize(companyId)).toBe(0);
    });

    it('sums the byte sizes of all files', () => {
      vaultRepo.create({
        companyId,
        filename: 'a.txt',
        originalName: 'a.txt',
        mimeType: 'text/plain',
        sizeBytes: 100,
        sha256: 'a1',
        vaultPath: 'a1/a.txt',
        uploadedBy: 'rocky',
      });
      vaultRepo.create({
        companyId,
        filename: 'b.txt',
        originalName: 'b.txt',
        mimeType: 'text/plain',
        sizeBytes: 250,
        sha256: 'b1',
        vaultPath: 'b1/b.txt',
        uploadedBy: 'rocky',
      });
      expect(vaultRepo.totalSize(companyId)).toBe(350);
    });
  });
});
