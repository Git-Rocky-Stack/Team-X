/**
 * Composition-root wiring pins.
 *
 * Some guarantees exist only if `main/index.ts` passes the right dependency at
 * every construction site, and a missed site fails open silently: a provider
 * factory built without `getMaxPrivacyTier` happily calls a cloud provider
 * under "Local Only". These pins read the source because the composition root
 * cannot be constructed under Vitest (it boots Electron).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');

/** The argument text of every `name({ … })` call, brace-matched. */
function callArguments(name: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(`${name}({`, from);
    if (at === -1) return out;
    let depth = 0;
    let i = at + name.length + 1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(at, i + 1));
    from = i;
  }
}

describe('main/index.ts — privacy tier reaches every provider path', () => {
  it('passes getMaxPrivacyTier to every provider factory', () => {
    const calls = callArguments('createProviderFactory');
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) expect(call).toContain('getMaxPrivacyTier');
  });

  it('passes getMaxPrivacyTier to every embedding adapter', () => {
    const calls = callArguments('buildEmbedAdapter');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call).toContain('getMaxPrivacyTier');
  });

  it('passes getMaxPrivacyTier to the runtime-profile resolver (external runtimes)', () => {
    const calls = callArguments('createRuntimeProfileProviderService');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const call of calls) expect(call).toContain('getMaxPrivacyTier');
  });
});

describe('main/index.ts — Settings → Enhanced AI → Semantic Chunking', () => {
  it('gives the production RAG service a chunker that reads the switch', () => {
    const production = callArguments('createRagService').filter((c) => !c.includes('fake'));
    expect(production.some((c) => c.includes('chunk:'))).toBe(true);
    expect(src).toContain("'semantic_chunking_enabled'");
  });

  it('no longer feeds the removed Planning and Streaming switches', () => {
    expect(src).not.toContain("'planning_enabled'");
    expect(src).not.toContain("'streaming_enabled'");
  });
});

describe('main/index.ts — an embedding refusal degrades RAG instead of failing turns', () => {
  it('lets retrieval and the indexer absorb a Settings → Privacy refusal', () => {
    const retrieval = callArguments('createRetrievalOrchestrator');
    expect(retrieval.some((c) => c.includes('onVectorRetrievalError'))).toBe(true);
    const indexer = callArguments('createRagIndexer');
    expect(indexer.some((c) => c.includes("reportEmbeddingRefusal('indexing'"))).toBe(true);
  });
});
