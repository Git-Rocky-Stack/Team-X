import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  canonicalTreeHash,
  generatePackKeypair,
  publicKeyFingerprint,
  signPack,
  signPackDirectory,
  verifyPackDirectory,
  verifyPackSignature,
} from './pack-signature.js';

describe('pack-signature', () => {
  let tmpDir: string;
  let archivePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pack-sig-test-'));
    archivePath = join(tmpDir, 'test-pack.tar.gz');
    // Write a fake archive for testing (content doesn't matter for signature tests).
    writeFileSync(archivePath, 'fake-archive-content-for-testing');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generatePackKeypair', () => {
    it('generates Ed25519 keypair in PEM format', () => {
      const keypair = generatePackKeypair();
      expect(keypair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keypair.privateKey).toContain('BEGIN PRIVATE KEY');
    });

    it('generates unique keypairs on each call', () => {
      const kp1 = generatePackKeypair();
      const kp2 = generatePackKeypair();
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
    });
  });

  describe('signPack', () => {
    it('creates a .sig file next to the archive', () => {
      const keypair = generatePackKeypair();
      signPack(archivePath, keypair.privateKey);

      const sigContent = readFileSync(`${archivePath}.sig`, 'utf-8');
      expect(sigContent.length).toBeGreaterThan(0);
    });

    it('returns the base64 signature string', () => {
      const keypair = generatePackKeypair();
      const sig = signPack(archivePath, keypair.privateKey);

      expect(typeof sig).toBe('string');
      expect(sig.length).toBeGreaterThan(0);
      // Verify it's valid base64.
      expect(() => Buffer.from(sig, 'base64')).not.toThrow();
    });
  });

  describe('verifyPackSignature', () => {
    it('returns valid=true for a correctly signed archive', () => {
      const keypair = generatePackKeypair();
      signPack(archivePath, keypair.privateKey);

      const result = verifyPackSignature(archivePath, keypair.publicKey);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns valid=false when archive content has been tampered with', () => {
      const keypair = generatePackKeypair();
      signPack(archivePath, keypair.privateKey);

      // Tamper with the archive after signing.
      writeFileSync(archivePath, 'tampered-content');

      const result = verifyPackSignature(archivePath, keypair.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature verification failed');
    });

    it('returns valid=false when verified with wrong public key', () => {
      const signerKeypair = generatePackKeypair();
      const wrongKeypair = generatePackKeypair();
      signPack(archivePath, signerKeypair.privateKey);

      const result = verifyPackSignature(archivePath, wrongKeypair.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature verification failed');
    });

    it('returns valid=false when .sig file is missing', () => {
      const keypair = generatePackKeypair();
      // Don't sign — no .sig file exists.

      const result = verifyPackSignature(archivePath, keypair.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature file not found');
    });

    it('returns valid=false when .sig file contains garbage', () => {
      const keypair = generatePackKeypair();
      writeFileSync(`${archivePath}.sig`, 'not-a-valid-signature', 'utf-8');

      const result = verifyPackSignature(archivePath, keypair.publicKey);
      expect(result.valid).toBe(false);
    });

    it('full round-trip: generate → sign → verify', () => {
      const keypair = generatePackKeypair();
      const signature = signPack(archivePath, keypair.privateKey);
      expect(signature.length).toBeGreaterThan(0);

      const result = verifyPackSignature(archivePath, keypair.publicKey);
      expect(result.valid).toBe(true);
    });
  });
});

// ===========================================================================
// Directory-tree signing
// ===========================================================================

describe('pack-signature (directory tree)', () => {
  let packRoot: string;

  beforeEach(() => {
    packRoot = mkdtempSync(join(tmpdir(), 'pack-tree-test-'));
    mkdirSync(join(packRoot, 'roles', 'officer'), { recursive: true });
    mkdirSync(join(packRoot, 'roles', 'ic'), { recursive: true });
    writeFileSync(join(packRoot, 'pack.json'), '{"id":"test","version":"1.0.0"}');
    writeFileSync(join(packRoot, 'README.md'), '# test pack\n');
    writeFileSync(join(packRoot, 'roles', 'officer', 'ceo.md'), '---\nid: ceo\n---\n# CEO\n');
    writeFileSync(join(packRoot, 'roles', 'ic', 'engineer.md'), '---\nid: engineer\n---\n# IC\n');
  });

  afterEach(() => {
    rmSync(packRoot, { recursive: true, force: true });
  });

  describe('canonicalTreeHash', () => {
    it('produces a stable hash for identical content', () => {
      const a = canonicalTreeHash(packRoot);
      const b = canonicalTreeHash(packRoot);
      expect(a.treeHash).toBe(b.treeHash);
      expect(a.manifest).toBe(b.manifest);
    });

    it('produces a different hash when a file is modified', () => {
      const before = canonicalTreeHash(packRoot).treeHash;
      writeFileSync(
        join(packRoot, 'roles', 'officer', 'ceo.md'),
        '---\nid: ceo\n---\n# CEO MODIFIED\n',
      );
      const after = canonicalTreeHash(packRoot).treeHash;
      expect(after).not.toBe(before);
    });

    it('produces a different hash when a file is added', () => {
      const before = canonicalTreeHash(packRoot).treeHash;
      writeFileSync(join(packRoot, 'roles', 'ic', 'extra.md'), '---\nid: extra\n---\n# extra\n');
      const after = canonicalTreeHash(packRoot).treeHash;
      expect(after).not.toBe(before);
    });

    it('produces a different hash when a file is deleted', () => {
      const before = canonicalTreeHash(packRoot).treeHash;
      rmSync(join(packRoot, 'roles', 'ic', 'engineer.md'));
      const after = canonicalTreeHash(packRoot).treeHash;
      expect(after).not.toBe(before);
    });

    it('produces a different hash when a file is renamed', () => {
      const before = canonicalTreeHash(packRoot).treeHash;
      renameSync(
        join(packRoot, 'roles', 'ic', 'engineer.md'),
        join(packRoot, 'roles', 'ic', 'renamed-engineer.md'),
      );
      const after = canonicalTreeHash(packRoot).treeHash;
      expect(after).not.toBe(before);
    });

    it('skips pack.sig itself (chicken-and-egg)', () => {
      const before = canonicalTreeHash(packRoot).treeHash;
      writeFileSync(join(packRoot, 'pack.sig'), 'arbitrary-sig-bytes-should-not-affect-hash');
      const after = canonicalTreeHash(packRoot).treeHash;
      expect(after).toBe(before);
    });

    it('skips hidden files by default', () => {
      const before = canonicalTreeHash(packRoot).treeHash;
      writeFileSync(join(packRoot, '.DS_Store'), 'mac-noise');
      writeFileSync(join(packRoot, '.gitignore'), 'whatever');
      const after = canonicalTreeHash(packRoot).treeHash;
      expect(after).toBe(before);
    });

    it('skips node_modules / dist / .git by default', () => {
      mkdirSync(join(packRoot, 'node_modules', 'foo'), { recursive: true });
      mkdirSync(join(packRoot, 'dist'), { recursive: true });
      mkdirSync(join(packRoot, '.git'), { recursive: true });
      writeFileSync(join(packRoot, 'node_modules', 'foo', 'index.js'), 'noise');
      writeFileSync(join(packRoot, 'dist', 'bundle.js'), 'noise');
      writeFileSync(join(packRoot, '.git', 'HEAD'), 'noise');
      const result = canonicalTreeHash(packRoot);
      expect(result.manifest).not.toContain('node_modules');
      expect(result.manifest).not.toContain('dist/');
      expect(result.manifest).not.toContain('.git');
    });

    it('manifest entries are POSIX-relative and lexicographically sorted', () => {
      const { manifest } = canonicalTreeHash(packRoot);
      const paths = manifest.split('\n').filter((line, i) => i % 2 === 0 && line.length > 0);
      const sorted = [...paths].sort();
      expect(paths).toEqual(sorted);
      for (const p of paths) {
        expect(p).not.toContain('\\');
      }
    });
  });

  describe('publicKeyFingerprint', () => {
    it('produces a stable hex string for the same key', () => {
      const kp = generatePackKeypair();
      expect(publicKeyFingerprint(kp.publicKey)).toBe(publicKeyFingerprint(kp.publicKey));
    });

    it('produces different fingerprints for different keys', () => {
      const a = generatePackKeypair();
      const b = generatePackKeypair();
      expect(publicKeyFingerprint(a.publicKey)).not.toBe(publicKeyFingerprint(b.publicKey));
    });
  });

  describe('signPackDirectory + verifyPackDirectory', () => {
    it('round-trip: sign → verify returns valid', () => {
      const kp = generatePackKeypair();
      signPackDirectory(packRoot, kp.privateKey, kp.publicKey);
      const result = verifyPackDirectory(packRoot, kp.publicKey);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('writes pack.sig as JSON envelope with all required fields', () => {
      const kp = generatePackKeypair();
      const env = signPackDirectory(packRoot, kp.privateKey, kp.publicKey);
      const written = JSON.parse(readFileSync(join(packRoot, 'pack.sig'), 'utf8'));
      expect(written.version).toBe(1);
      expect(written.algorithm).toBe('ed25519');
      expect(written.publicKeyFingerprint).toBe(env.publicKeyFingerprint);
      expect(written.treeHash).toBe(env.treeHash);
      expect(written.signature).toBe(env.signature);
      expect(written.signedAt).toBeTruthy();
    });

    it('detects file modification (tree hash mismatch)', () => {
      const kp = generatePackKeypair();
      signPackDirectory(packRoot, kp.privateKey, kp.publicKey);
      writeFileSync(
        join(packRoot, 'roles', 'officer', 'ceo.md'),
        '---\nid: ceo\n---\n# tampered\n',
      );
      const result = verifyPackDirectory(packRoot, kp.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Tree hash mismatch/);
    });

    it('detects file addition', () => {
      const kp = generatePackKeypair();
      signPackDirectory(packRoot, kp.privateKey, kp.publicKey);
      writeFileSync(join(packRoot, 'roles', 'ic', 'malicious.md'), '---\nid: bad\n---\n');
      const result = verifyPackDirectory(packRoot, kp.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Tree hash mismatch/);
    });

    it('detects file deletion', () => {
      const kp = generatePackKeypair();
      signPackDirectory(packRoot, kp.privateKey, kp.publicKey);
      rmSync(join(packRoot, 'roles', 'ic', 'engineer.md'));
      const result = verifyPackDirectory(packRoot, kp.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Tree hash mismatch/);
    });

    it('detects rename', () => {
      const kp = generatePackKeypair();
      signPackDirectory(packRoot, kp.privateKey, kp.publicKey);
      renameSync(
        join(packRoot, 'roles', 'ic', 'engineer.md'),
        join(packRoot, 'roles', 'ic', 'engineer-renamed.md'),
      );
      const result = verifyPackDirectory(packRoot, kp.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Tree hash mismatch/);
    });

    it('detects wrong public key (fingerprint mismatch fires before tree hash)', () => {
      const signer = generatePackKeypair();
      const wrong = generatePackKeypair();
      signPackDirectory(packRoot, signer.privateKey, signer.publicKey);
      const result = verifyPackDirectory(packRoot, wrong.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Public key fingerprint mismatch/);
    });

    it('returns missing-file error when pack.sig absent', () => {
      const kp = generatePackKeypair();
      // Don't sign.
      const result = verifyPackDirectory(packRoot, kp.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature file not found');
    });

    it('returns malformed-json error when pack.sig is garbage', () => {
      const kp = generatePackKeypair();
      writeFileSync(join(packRoot, 'pack.sig'), 'this is not json');
      const result = verifyPackDirectory(packRoot, kp.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/not valid JSON/);
    });

    it('returns missing-fields error when envelope shape wrong', () => {
      const kp = generatePackKeypair();
      writeFileSync(join(packRoot, 'pack.sig'), JSON.stringify({ version: 1 }));
      const result = verifyPackDirectory(packRoot, kp.publicKey);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/missing required fields/);
    });

    it('round-trip survives adding pack.sig itself (sig file does not invalidate sig)', () => {
      const kp = generatePackKeypair();
      signPackDirectory(packRoot, kp.privateKey, kp.publicKey);
      // First verify passes.
      expect(verifyPackDirectory(packRoot, kp.publicKey).valid).toBe(true);
      // Second verify also passes — pack.sig is in the tree but skipped.
      expect(verifyPackDirectory(packRoot, kp.publicKey).valid).toBe(true);
    });
  });
});
