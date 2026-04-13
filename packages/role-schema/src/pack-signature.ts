/**
 * Role-pack Ed25519 signature verification.
 *
 * Community role packs ship as `.tar.gz` archives with an accompanying
 * `.sig` file containing an Ed25519 signature of the archive's SHA256
 * hash. This module provides:
 *
 *   - `generatePackKeypair()` — create a new Ed25519 keypair for signing
 *   - `signPack(archivePath, privateKey)` — sign an archive, write `.sig`
 *   - `verifyPackSignature(archivePath, publicKey)` — verify a `.sig` file
 *
 * Uses Node.js built-in `crypto` module (Ed25519 support since Node 15).
 * No external dependencies.
 *
 * The official Strategia pack (`role-packs/strategia-official/`) ships
 * unsigned — it's trusted by virtue of being in the repo. Signature
 * verification is for community/third-party packs only.
 */

import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

/** Ed25519 keypair in PEM format. */
export interface PackKeypair {
  publicKey: string;
  privateKey: string;
}

/** Result of signature verification. */
export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Generate a new Ed25519 keypair for role-pack signing.
 * The private key should be kept secure by the pack author.
 * The public key is distributed with the pack or published separately.
 */
export function generatePackKeypair(): PackKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * Compute SHA256 hash of a file, then sign the hash with Ed25519.
 * Writes the signature to `<archivePath>.sig` as base64.
 * Returns the base64 signature string.
 */
export function signPack(archivePath: string, privateKey: string): string {
  const fileBuffer = readFileSync(archivePath);
  const hash = createHash('sha256').update(fileBuffer).digest();
  const signature = sign(null, hash, privateKey);
  const sigBase64 = signature.toString('base64');
  writeFileSync(`${archivePath}.sig`, sigBase64, 'utf-8');
  return sigBase64;
}

/**
 * Verify the Ed25519 signature of a role-pack archive.
 *
 * Reads the archive file and its `.sig` companion, recomputes the
 * SHA256 hash, and verifies the signature against the provided
 * public key.
 */
export function verifyPackSignature(archivePath: string, publicKey: string): VerifyResult {
  try {
    const fileBuffer = readFileSync(archivePath);
    const hash = createHash('sha256').update(fileBuffer).digest();

    let sigBase64: string;
    try {
      sigBase64 = readFileSync(`${archivePath}.sig`, 'utf-8').trim();
    } catch {
      return { valid: false, error: 'Signature file not found' };
    }

    const signature = Buffer.from(sigBase64, 'base64');
    const isValid = verify(null, hash, publicKey, signature);

    return isValid ? { valid: true } : { valid: false, error: 'Signature verification failed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Verification error: ${message}` };
  }
}
