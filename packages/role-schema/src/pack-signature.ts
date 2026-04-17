/**
 * Role-pack Ed25519 signature verification.
 *
 * Two signing surfaces:
 *
 *   1. Archive signing — community packs distributed as `.tar.gz`:
 *      - `signPack(archivePath, privateKey)` → writes `<archivePath>.sig`
 *      - `verifyPackSignature(archivePath, publicKey)`
 *
 *   2. Directory-tree signing — in-repo packs (including the official
 *      Strategia pack) where canonicalizing a tar archive is awkward
 *      and the trust boundary is the directory itself:
 *      - `canonicalTreeHash(packRoot)` → deterministic SHA-256 over the
 *        sorted list of `<relpath>\n<file-sha256>\n` entries
 *      - `signPackDirectory(packRoot, privateKey)` → writes `pack.sig`
 *        (JSON envelope: version, algorithm, fingerprint, treeHash,
 *        signature, signedAt) into the pack root
 *      - `verifyPackDirectory(packRoot, publicKey)` → recomputes hash,
 *        verifies against the envelope, returns mismatch detail
 *
 * Both surfaces use Ed25519 over Node's built-in `crypto`. No external
 * dependencies. The directory-signing path is what the role-loader
 * invokes on every startup to gate the official pack against tampering.
 */

import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

// ===========================================================================
// Directory-tree signing
// ===========================================================================

/** The signature envelope written to `<packRoot>/pack.sig`. */
export interface PackSignatureEnvelope {
  /** Envelope schema version. Bump on breaking changes. */
  version: 1;
  /** Signing algorithm. Locked to ed25519 for now. */
  algorithm: 'ed25519';
  /** SHA-256 of the public key PEM body, hex-encoded — diagnostic only. */
  publicKeyFingerprint: string;
  /** SHA-256 of the canonical manifest, hex-encoded — what was signed. */
  treeHash: string;
  /** Base64-encoded Ed25519 signature over the treeHash bytes. */
  signature: string;
  /** ISO-8601 timestamp at signing — diagnostic only, not signed. */
  signedAt: string;
}

/** Result of `verifyPackDirectory` with optional mismatch detail. */
export interface VerifyPackDirectoryResult extends VerifyResult {
  /** Recomputed tree hash — present even on failure for diagnostics. */
  computedTreeHash?: string;
  /** Tree hash recorded in the envelope. */
  envelopeTreeHash?: string;
}

const DEFAULT_SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const SIGNATURE_FILENAME = 'pack.sig';

/**
 * Options for `canonicalTreeHash` / `signPackDirectory` /
 * `verifyPackDirectory`. Both signing and verifying must use the
 * same options — defaults match the official-pack layout.
 */
export interface TreeHashOptions {
  /** Additional directory names to skip (added to the defaults). */
  extraSkipDirs?: string[];
  /** Additional filenames to skip (signature file is always skipped). */
  extraSkipFiles?: string[];
  /** Skip files starting with `.` (default true). */
  skipHidden?: boolean;
}

/**
 * Compute a deterministic SHA-256 hash over a directory tree.
 *
 * Walks `packRoot` recursively in lexicographic order, computes a
 * SHA-256 of each file's contents, and produces a final SHA-256 of
 * the manifest (newline-delimited `<posix-relpath>\n<hex-sha256>\n`
 * pairs).
 *
 * The signature file itself (`pack.sig`) is always skipped to avoid
 * the chicken-and-egg problem. Hidden files (starting with `.`),
 * `node_modules`, `dist`, and `.git` are skipped by default.
 *
 * Returns both the final hash AND the manifest text so callers can
 * diff the manifest when verification fails.
 */
export function canonicalTreeHash(
  packRoot: string,
  options: TreeHashOptions = {},
): { treeHash: string; manifest: string } {
  const skipDirs = new Set([...DEFAULT_SKIP_DIRS, ...(options.extraSkipDirs ?? [])]);
  const skipFiles = new Set<string>([SIGNATURE_FILENAME, ...(options.extraSkipFiles ?? [])]);
  const skipHidden = options.skipHidden ?? true;

  const entries: { posixRelPath: string; hash: string }[] = [];

  function walk(dir: string): void {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch (err) {
      throw new Error(`[pack-signature] cannot read directory "${dir}": ${(err as Error).message}`);
    }
    for (const name of names) {
      if (skipHidden && name.startsWith('.')) continue;
      if (skipDirs.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      if (skipFiles.has(name)) continue;
      const buf = readFileSync(full);
      const hash = createHash('sha256').update(buf).digest('hex');
      // Normalize to POSIX separators for cross-OS determinism.
      const rel = relative(packRoot, full).split(sep).join('/');
      entries.push({ posixRelPath: rel, hash });
    }
  }

  walk(packRoot);
  // Re-sort: the per-directory sort above does not produce a globally
  // sorted list once subdirectories are interleaved. Sort the final
  // list lexicographically by POSIX path so the manifest is identical
  // across operating systems.
  entries.sort((a, b) =>
    a.posixRelPath < b.posixRelPath ? -1 : a.posixRelPath > b.posixRelPath ? 1 : 0,
  );

  const manifest = entries.map((e) => `${e.posixRelPath}\n${e.hash}\n`).join('');
  const treeHash = createHash('sha256').update(manifest, 'utf8').digest('hex');
  return { treeHash, manifest };
}

/**
 * Compute the SHA-256 fingerprint of a public-key PEM body.
 *
 * Strips the PEM header / footer / whitespace and hashes the base64
 * body, mirroring the GitHub-style "key fingerprint" diagnostic.
 * Used to embed a stable identifier in the signature envelope so
 * verification failures can hint at "wrong public key" vs "tampered
 * tree" without exposing the full key bytes in error messages.
 */
export function publicKeyFingerprint(publicKeyPem: string): string {
  const body = publicKeyPem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * Sign a directory tree with Ed25519.
 *
 * Computes the canonical tree hash, signs it with `privateKey`, and
 * writes a JSON envelope to `<packRoot>/pack.sig`. Returns the
 * envelope so callers can log / display it.
 *
 * The envelope includes a public-key fingerprint and an ISO timestamp
 * for diagnostic purposes — neither is part of the signed payload.
 * Only the `treeHash` bytes are signed.
 */
export function signPackDirectory(
  packRoot: string,
  privateKey: string,
  publicKey: string,
  options: TreeHashOptions = {},
): PackSignatureEnvelope {
  const { treeHash } = canonicalTreeHash(packRoot, options);
  const treeHashBytes = Buffer.from(treeHash, 'hex');
  const signature = sign(null, treeHashBytes, privateKey).toString('base64');

  const envelope: PackSignatureEnvelope = {
    version: 1,
    algorithm: 'ed25519',
    publicKeyFingerprint: publicKeyFingerprint(publicKey),
    treeHash,
    signature,
    signedAt: new Date().toISOString(),
  };

  const sigPath = join(packRoot, SIGNATURE_FILENAME);
  writeFileSync(sigPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return envelope;
}

/**
 * Verify the Ed25519 signature of a directory tree.
 *
 * Reads `<packRoot>/pack.sig`, recomputes the canonical tree hash,
 * and verifies the envelope's signature against `publicKey`. Returns
 * a discriminated result with both the computed and envelope-recorded
 * hashes so a mismatch can be displayed in error messages.
 *
 * Failure modes (in order of check):
 *   - signature file missing
 *   - envelope JSON malformed or missing required fields
 *   - public-key fingerprint mismatch (likely wrong key)
 *   - tree hash mismatch (tampered files)
 *   - signature byte mismatch (tampered hash or wrong key)
 */
export function verifyPackDirectory(
  packRoot: string,
  publicKey: string,
  options: TreeHashOptions = {},
): VerifyPackDirectoryResult {
  const sigPath = join(packRoot, SIGNATURE_FILENAME);

  let raw: string;
  try {
    raw = readFileSync(sigPath, 'utf8');
  } catch {
    return { valid: false, error: 'Signature file not found' };
  }

  let envelope: PackSignatureEnvelope;
  try {
    envelope = JSON.parse(raw) as PackSignatureEnvelope;
  } catch (err) {
    return { valid: false, error: `Signature envelope not valid JSON: ${(err as Error).message}` };
  }

  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.algorithm !== 'ed25519' ||
    typeof envelope.treeHash !== 'string' ||
    typeof envelope.signature !== 'string'
  ) {
    return { valid: false, error: 'Signature envelope missing required fields' };
  }

  const expectedFingerprint = publicKeyFingerprint(publicKey);
  if (envelope.publicKeyFingerprint !== expectedFingerprint) {
    return {
      valid: false,
      error: `Public key fingerprint mismatch (envelope=${envelope.publicKeyFingerprint.slice(0, 16)}…, expected=${expectedFingerprint.slice(0, 16)}…)`,
      envelopeTreeHash: envelope.treeHash,
    };
  }

  let computed: { treeHash: string; manifest: string };
  try {
    computed = canonicalTreeHash(packRoot, options);
  } catch (err) {
    return { valid: false, error: `Tree hash computation failed: ${(err as Error).message}` };
  }

  if (computed.treeHash !== envelope.treeHash) {
    return {
      valid: false,
      error: `Tree hash mismatch (computed=${computed.treeHash.slice(0, 16)}…, envelope=${envelope.treeHash.slice(0, 16)}…) — pack contents have changed since signing`,
      computedTreeHash: computed.treeHash,
      envelopeTreeHash: envelope.treeHash,
    };
  }

  let isValid: boolean;
  try {
    const sig = Buffer.from(envelope.signature, 'base64');
    isValid = verify(null, Buffer.from(envelope.treeHash, 'hex'), publicKey, sig);
  } catch (err) {
    return {
      valid: false,
      error: `Signature verify threw: ${(err as Error).message}`,
      computedTreeHash: computed.treeHash,
      envelopeTreeHash: envelope.treeHash,
    };
  }

  return isValid
    ? { valid: true, computedTreeHash: computed.treeHash, envelopeTreeHash: envelope.treeHash }
    : {
        valid: false,
        error: 'Signature verification failed',
        computedTreeHash: computed.treeHash,
        envelopeTreeHash: envelope.treeHash,
      };
}
