/**
 * One-shot keypair ceremony for the Strategia-official role pack.
 *
 *   node scripts/generate-pack-key.mjs <pack-id>
 *
 * Generates a new Ed25519 keypair, writes the private key to
 * `.secrets/<pack-id>.ed25519.pem` (gitignored), and prints the public
 * key + fingerprint to stdout so the operator can paste them into
 * `apps/desktop/src/main/services/role-loader.ts` and `pack.json`.
 *
 * REFUSES to overwrite an existing private key file. Delete the file
 * by hand if you genuinely intend to rotate — losing the old key
 * means every previously-signed pack version becomes unverifiable.
 *
 * Run frequency: once per pack-id, ever. The keypair lives for the
 * life of the pack.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SCHEMA_URL = pathToFileURL(join(REPO, 'packages/role-schema/dist/index.js')).href;
const { generatePackKeypair, publicKeyFingerprint } = await import(SCHEMA_URL);

const packId = process.argv[2];
if (!packId) {
  console.error('Usage: node scripts/generate-pack-key.mjs <pack-id>');
  console.error('Example: node scripts/generate-pack-key.mjs strategia-official');
  process.exit(2);
}

const secretsDir = join(REPO, '.secrets');
const privatePath = join(secretsDir, `${packId}.ed25519.pem`);
const publicPath = join(secretsDir, `${packId}.public.pem`);

if (existsSync(privatePath)) {
  console.error(`REFUSED: private key already exists at ${privatePath}`);
  console.error('Delete it manually if you intend to rotate the keypair.');
  console.error('Rotating means every prior pack.sig becomes unverifiable.');
  process.exit(1);
}

mkdirSync(secretsDir, { recursive: true });
const { publicKey, privateKey } = generatePackKeypair();
writeFileSync(privatePath, privateKey, { encoding: 'utf8', mode: 0o600 });
writeFileSync(publicPath, publicKey, 'utf8');
const fingerprint = publicKeyFingerprint(publicKey);

console.log(`✓ Private key written to ${privatePath} (mode 0600)`);
console.log(`✓ Public key written to  ${publicPath}`);
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('PASTE THE FOLLOWING INTO apps/desktop/src/main/services/role-loader.ts');
console.log('────────────────────────────────────────────────────────────');
console.log('');
console.log(`const STRATEGIA_OFFICIAL_PUBLIC_KEY = \`${publicKey.trimEnd()}\n\`;`);
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('PASTE THE FOLLOWING fingerprint INTO role-packs/strategia-official/pack.json');
console.log('────────────────────────────────────────────────────────────');
console.log('');
console.log(`  "publicKeyFingerprint": "${fingerprint}",`);
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('NOW BACK UP THE PRIVATE KEY out of band (password manager, vault).');
console.log(`Losing ${privatePath} means you cannot re-sign edits.`);
console.log('────────────────────────────────────────────────────────────');
