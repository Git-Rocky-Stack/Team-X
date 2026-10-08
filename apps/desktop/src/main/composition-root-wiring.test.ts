/**
 * Composition-root wiring pins.
 *
 * Some guarantees exist only if `main/index.ts` passes the right dependency at
 * every construction site, and a missed site fails open silently: a provider
 * factory built without `getMaxPrivacyTier` happily calls a cloud provider
 * under "Local Only". These pins read the source because the composition root
 * cannot be constructed under Vitest (it boots Electron).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The composition root: `index.ts` plus the boot phases it sequences from
 * `boot/` (audit 2026-10-07 P1-7 split it). Pins read them as one source.
 */
function compositionRootSource(): string {
  const mainDir = dirname(fileURLToPath(import.meta.url));
  const bootDir = join(mainDir, 'boot');
  const boot = readdirSync(bootDir)
    .filter((name) => name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(name))
    .sort()
    .map((name) => join(bootDir, name));
  return [join(mainDir, 'index.ts'), ...boot].map((path) => readFileSync(path, 'utf8')).join('\n');
}

const src = compositionRootSource();

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
    expect(calls.length).toBeGreaterThanOrEqual(1);
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

describe('main/index.ts — auxiliary model calls are scoped and governed', () => {
  const llm = src.slice(src.indexOf('const llmComplete = async ('), src.indexOf('llmComplete,'));

  it("resolves Enhanced AI's model through the calling company, not the first live one", () => {
    expect(llm).toContain('context.companyId');
  });

  it('holds Enhanced AI calls to the budget and records them as runs', () => {
    expect(llm).toContain('runGovernedCompletion(');
    expect(llm).toContain('recordRunSpend');
  });

  it('never hands an external runtime name to the provider factory', () => {
    expect(llm).not.toContain('(await resolveProvider(actorRow)).providerName');
  });

  it('records palette classification spend', () => {
    const palette = callArguments('createClassifierCompleteFor');
    expect(palette.some((c) => c.includes('accounting'))).toBe(true);
  });
});

describe('services/provider-factory.ts — the default singleton enforces the tier', () => {
  it('builds getProviderFactory() with the Settings → Privacy getter', () => {
    const factorySrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'services', 'provider-factory.ts'),
      'utf8',
    );
    const singleton = factorySrc.slice(factorySrc.indexOf('export function getProviderFactory'));
    expect(singleton.slice(0, singleton.indexOf('return _factory;'))).toContain(
      "getMaxPrivacyTier: () =>\n        settingsRepo.get<PrivacyTier>('max_privacy_tier'",
    );
  });
});

describe('main/index.ts — the renderer trust boundary covers everything (audit P0-3)', () => {
  it('guards ipcMain before any handler is registered', () => {
    const guard = src.indexOf('installIpcSenderGuard(ipcMain');
    expect(guard).toBeGreaterThan(-1);
    const firstMount = Math.min(
      ...['ipcMain.handle(', 'registerIpcHandlers(', 'registerSystemDialogHandlers(']
        .map((needle) => src.indexOf(needle, src.indexOf('app\n  .whenReady()')))
        .filter((i) => i > -1),
    );
    expect(guard).toBeLessThan(src.indexOf('app\n  .whenReady()'));
    expect(guard).toBeLessThan(firstMount);
  });

  it('hardens every webContents and installs the permission policy', () => {
    expect(src).toContain("app.on('web-contents-created'");
    expect(src).toContain('hardenWebContents(contents, trustedRenderer');
    expect(src).toContain('installPermissionPolicy(session.defaultSession, trustedRenderer)');
  });

  it('loads exactly the page the boundary trusts', () => {
    expect(src).toContain('await win.loadFile(RENDERER_INDEX_HTML)');
    expect(src).toContain('await win.loadURL(DEV_SERVER_URL)');
    expect(src).toContain('indexHtmlPath: RENDERER_INDEX_HTML');
    expect(src).toContain('devServerUrl: DEV_SERVER_URL');
  });
});

describe('main/index.ts — one execution policy for every model call (audit P1-8)', () => {
  // Chat, the agentic loop (read and write side), Copilot analysis, meeting
  // minutes, Enhanced AI, the palette and delegation all resolve an
  // employee's model through `resolveProvider`, the runtime-profile-aware
  // closure. A path that builds its own factory skips the employee's runtime
  // profile, so a system agent bound to a local runtime would quietly run
  // on the factory default instead.
  it('builds exactly one provider factory, behind the runtime-profile service', () => {
    expect(callArguments('createProviderFactory')).toHaveLength(1);
    expect(callArguments('createRuntimeProfileProviderService')).toHaveLength(1);
  });

  it('never resolves an employee straight from a provider factory', () => {
    expect(src).not.toMatch(/factory\.resolveForEmployee\(/);
    expect(src).not.toMatch(/providerFactory\.resolveForEmployee\(/);
  });

  it('resolves the agentic loop and the Copilot analyzer through resolveProvider', () => {
    const loop = src.slice(src.indexOf('system-agent employee ${systemAgentId} not found'));
    expect(loop.slice(0, 400)).toContain('await resolveProvider(emp)');
    const analyzer = src.slice(src.indexOf('system-copilot employee ${systemCopilotId} not found'));
    expect(analyzer.slice(0, 400)).toContain('await resolveProvider(emp)');
    const writeSide = src.slice(src.indexOf('const writeProviderComplete: WriteSideCompleteFn'));
    expect(writeSide.slice(0, 800)).toContain('await resolveProvider(actorRow)');
  });
});
