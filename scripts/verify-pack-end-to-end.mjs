/**
 * End-to-end pack verification — exercises the role-loader's
 * signature-verification path against the real strategia-official
 * pack with `verifyMode: 'strict'`. Used as the final pre-commit
 * gate after `pnpm sign:pack`.
 *
 *   node scripts/verify-pack-end-to-end.mjs
 *
 * Exits 0 on success, 1 on any signature / parse / count failure.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SCHEMA_URL = pathToFileURL(join(REPO, 'packages/role-schema/dist/index.js')).href;
const { verifyPackDirectory } = await import(SCHEMA_URL);

const PACK_ROOT = join(REPO, 'role-packs/strategia-official');
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAKKnTy2su2+OJ0HhDQYvTALMwGis433Rx1hriq5y2RPY=
-----END PUBLIC KEY-----
`;

const result = verifyPackDirectory(PACK_ROOT, PUBLIC_KEY);
if (!result.valid) {
  console.error(`✗ Pack verification FAILED: ${result.error}`);
  if (result.computedTreeHash) console.error(`  computed: ${result.computedTreeHash}`);
  if (result.envelopeTreeHash) console.error(`  envelope: ${result.envelopeTreeHash}`);
  process.exit(1);
}

console.log('✓ Pack signature valid');
console.log(`  tree hash: ${result.computedTreeHash}`);
console.log(`  envelope:  ${result.envelopeTreeHash}`);
