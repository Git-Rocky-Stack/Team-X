import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// packages/local-gguf-runtime/src/runtime/server-lifecycle.integration.test.ts
//
// ESM NOTE: This package is "type":"module". __dirname is UNDEFINED in ESM
// modules. Top-level `resolve(__dirname, ...)` would throw a ReferenceError
// at import/collection time — BEFORE the describe.skipIf guard runs — breaking
// the whole suite even when integration tests are not requested. We use
// fileURLToPath(import.meta.url) + dirname() instead, which is the correct
// ESM-safe equivalent of __dirname.
import { describe, expect, it } from 'vitest';
import { allocatePort } from './port-allocator';
import { spawnServer } from './server-lifecycle';

// __dirname equivalent for ESM
const __dirname = dirname(fileURLToPath(import.meta.url));

const BIN = resolve(
  __dirname,
  '../../../../apps/desktop/resources/llama-server',
  `${process.platform}-${process.arch}`,
  'cpu',
  process.platform === 'win32' ? 'server.exe' : 'server',
);
const TEST_MODEL = process.env.TEST_GGUF_PATH;
const TEST_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!TEST_INTEGRATION || !TEST_MODEL || !existsSync(BIN))(
  'spawnServer (integration, real binary)',
  () => {
    it('spawns, becomes ready, serves /v1/chat/completions, stops cleanly', async () => {
      const port = await allocatePort();
      const handle = await spawnServer({
        binaryPath: BIN,
        modelPath: TEST_MODEL as string,
        port,
        nCtx: 1024,
        nGpuLayers: 0,
        nBatch: 256,
        nThreads: 4,
        readyTimeoutMs: 120_000,
      });
      try {
        const res = await fetch(`${handle.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Say hello.' }],
            max_tokens: 8,
          }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(
          (json as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message
            ?.content,
        ).toBeTypeOf('string');
      } finally {
        await handle.stop();
      }
    }, 180_000);
  },
);
