import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generatePackKeypair, signPack, verifyPackSignature } from './pack-signature.js';

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
