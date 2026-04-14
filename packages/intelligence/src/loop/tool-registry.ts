/**
 * Tool registry — zod-validated name-to-tool lookup with per-invocation
 * timeout and typed failure modes.
 *
 * The loop itself never touches a tool's `execute` directly; it always
 * goes through `ToolRegistry.invoke`, which:
 *   1. Resolves the tool by name (`unknown_tool` on miss).
 *   2. Validates raw args against the tool's zod schema (`invalid_args`
 *      on miss — the loop treats this as a recoverable malformed call).
 *   3. Races `execute()` against a timeout (`timeout` on expiry).
 *   4. Catches any throw (`threw` with stringified message).
 *
 * All four failure modes are returned as typed discriminated-union
 * values — the registry does NOT throw. This keeps `loop.ts` a single
 * switch statement with zero try/catch noise around tool dispatch.
 *
 * Phase 5 — M31 — T1.
 */

import type { Tool, ToolContext } from './types.js';

export interface ToolRegistry {
  readonly tools: readonly Tool[];
  resolve(name: string): Tool | undefined;
  invoke(args: InvokeArgs): Promise<ToolInvocationResult>;
}

export interface InvokeArgs {
  readonly name: string;
  /** Raw args as parsed from the model's JSON. Validated by the registry. */
  readonly rawArgs: unknown;
  readonly runId: string;
  /** External cancel signal — propagated to the tool's `execute` call. */
  readonly signal: AbortSignal;
  /** Max wall-clock time for the tool's `execute`, in ms. */
  readonly timeoutMs: number;
}

export type ToolInvocationResult =
  | { kind: 'ok'; result: unknown }
  | { kind: 'unknown_tool'; name: string }
  | { kind: 'invalid_args'; message: string }
  | { kind: 'timeout' }
  | { kind: 'threw'; message: string };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createToolRegistry(tools: readonly Tool[]): ToolRegistry {
  // Name-collision guard — a duplicate tool name would silently mask the
  // earlier registration, which is the kind of bug that is impossible
  // to debug from the UI. Fail fast at construction time.
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) {
      throw new Error(`Duplicate tool name in registry: "${t.name}"`);
    }
    seen.add(t.name);
  }

  const byName = new Map<string, Tool>(tools.map((t) => [t.name, t]));

  return {
    tools,

    resolve(name) {
      return byName.get(name);
    },

    async invoke(invokeArgs) {
      const tool = byName.get(invokeArgs.name);
      if (!tool) {
        return { kind: 'unknown_tool', name: invokeArgs.name };
      }

      // 1. Validate raw args against zod schema.
      const parsed = tool.schema.safeParse(invokeArgs.rawArgs);
      if (!parsed.success) {
        return {
          kind: 'invalid_args',
          message: formatZodIssues(parsed.error.issues),
        };
      }

      // 2. Wire up per-tool timeout AbortController layered on top of
      //    the caller's cancel signal.
      const localController = new AbortController();
      const timeoutHandle = setTimeout(() => localController.abort(), invokeArgs.timeoutMs);

      // If the outer signal is already aborted, fold it in immediately.
      if (invokeArgs.signal.aborted) {
        clearTimeout(timeoutHandle);
        return { kind: 'threw', message: 'canceled' };
      }
      const onOuterAbort = () => localController.abort();
      invokeArgs.signal.addEventListener('abort', onOuterAbort, { once: true });

      const ctx: ToolContext = {
        signal: localController.signal,
        runId: invokeArgs.runId,
      };

      try {
        const result = await tool.execute(parsed.data, ctx);
        if (localController.signal.aborted && !invokeArgs.signal.aborted) {
          // Local abort without outer abort = timeout.
          return { kind: 'timeout' };
        }
        if (invokeArgs.signal.aborted) {
          return { kind: 'threw', message: 'canceled' };
        }
        return { kind: 'ok', result };
      } catch (err) {
        if (localController.signal.aborted && !invokeArgs.signal.aborted) {
          return { kind: 'timeout' };
        }
        return { kind: 'threw', message: errMessage(err) };
      } finally {
        clearTimeout(timeoutHandle);
        invokeArgs.signal.removeEventListener('abort', onOuterAbort);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ZodLikeIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

function formatZodIssues(issues: readonly ZodLikeIssue[]): string {
  if (issues.length === 0) return 'invalid args';
  return issues
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : '(root)';
      return `${path}: ${i.message}`;
    })
    .join('; ');
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
