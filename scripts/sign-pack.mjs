/**
 * Sign a role pack — recompute the canonical tree hash and write
 * `pack.sig` into the pack root.
 *
 *   node scripts/sign-pack.mjs <pack-id>
 *
 * Reads the private key from `.secrets/<pack-id>.ed25519.pem` (which
 * `generate-pack-key.mjs` wrote on first run) and the matching public
 * key from `.secrets/<pack-id>.public.pem`. Resolves the pack root
 * from a small registry below — extend the registry when adding new
 * official-author packs.
 *
 * Run frequency: every time a role.md (or any other pack file) is
 * edited, before commit. Add a `pnpm sign:pack` script alias for
 * convenience. CI should run this in `--check` mode (TODO: --check
 * flag — current version always re-signs).
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SCHEMA_URL = pathToFileURL(join(REPO, 'packages/role-schema/dist/index.js')).href;
const { signPackDirectory } = await import(SCHEMA_URL);

const PACK_ROOTS = {
  'strategia-official': join(REPO, 'role-packs/strategia-official'),
};

const packId = process.argv[2];
if (!packId || !(packId in PACK_ROOTS)) {
  console.error('Usage: node scripts/sign-pack.mjs <pack-id>');
  console.error(`Known pack ids: ${Object.keys(PACK_ROOTS).join(', ')}`);
  process.exit(2);
}

const packRoot = PACK_ROOTS[packId];
const privatePath = join(REPO, '.secrets', `${packId}.ed25519.pem`);
const publicPath = join(REPO, '.secrets', `${packId}.public.pem`);

let privateKey;
let publicKey;
try {
  privateKey = readFileSync(privatePath, 'utf8');
  publicKey = readFileSync(publicPath, 'utf8');
} catch (err) {
  console.error(`FAILED to read keypair: ${err.message}`);
  console.error(`Expected at: ${privatePath} + ${publicPath}`);
  console.error(`Run: node scripts/generate-pack-key.mjs ${packId}`);
  process.exit(1);
}

const envelope = signPackDirectory(packRoot, privateKey, publicKey);
console.log(`✓ Signed pack "${packId}"`);
console.log(`  pack root:   ${packRoot}`);
console.log(`  tree hash:   ${envelope.treeHash}`);
console.log(`  fingerprint: ${envelope.publicKeyFingerprint}`);
console.log(`  signed at:   ${envelope.signedAt}`);
console.log(`  → wrote ${join(packRoot, 'pack.sig')}`);
