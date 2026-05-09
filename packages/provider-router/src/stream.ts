/**
 * Provider-agnostic streaming primitive used by the orchestrator.
 *
 * A `ProviderStreamFn` is anything that can take a system prompt + chat
 * history and yield tokens (then a final usage record). Concrete adapters for
 * Anthropic, Ollama, OpenAI etc. live under `./adapters/` and conform to this
 * type. Tests can pass a fake `ProviderStreamFn` to exercise consumer code
 * (the orchestrator) without making real network calls.
 */

export type StreamRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Structured message content part — mirrors the Vercel AI SDK `CoreMessage`
 * content shape so a tool-call → tool-result round-trip can flow through
 * `ProviderStreamFn` without translation.
 *
 * Most callers send `{ role: 'user' | 'assistant', content: '<string>' }`
 * and never hit this union. The agentic loop's native tool-use wrapper
 * (post-C2) builds structured assistant + tool messages so the model's
 * prior tool-call commitments are preserved verbatim across turns.
 */
export type StreamContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      result: unknown;
    };

export interface StreamMessage {
  role: StreamRole;
  content: string | StreamContentPart[];
}

export interface StreamUsage {
  /**
   * Fresh (non-cached, non-cache-write) input tokens. For non-Anthropic
   * providers and Anthropic calls without `cacheControl`, this is the
   * full input count. For Anthropic calls with prompt caching enabled,
   * this is `response.usage.input_tokens` — fresh-only — and the cache
   * portions are reported separately.
   */
  promptTokens: number;
  completionTokens: number;
  /**
   * Anthropic prompt-caching: number of input tokens served from a
   * previously cached prefix at the discounted (~10% of base) rate.
   * Undefined when caching is disabled or the provider does not support
   * it. Treated as zero by `calcCostUsd` for cost attribution.
   *
   * Source: `providerMetadata.anthropic.cacheReadInputTokens` →
   *         `response.usage.cache_read_input_tokens` upstream.
   */
  cachedInputTokens?: number;
  /**
   * Anthropic prompt-caching: number of input tokens written to the
   * ephemeral cache this turn at the premium (~125% of base) rate.
   * Undefined when caching is disabled or unsupported.
   *
   * Source: `providerMetadata.anthropic.cacheCreationInputTokens` →
   *         `response.usage.cache_creation_input_tokens` upstream.
   */
  cacheWriteTokens?: number;
}

// ---------------------------------------------------------------------------
// Tool-call types
// ---------------------------------------------------------------------------

export interface StreamToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface StreamToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

// ---------------------------------------------------------------------------
// Stream chunk union
// ---------------------------------------------------------------------------

export type StreamChunk =
  | { kind: 'delta'; delta: string }
  | { kind: 'done'; usage: StreamUsage }
  | { kind: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { kind: 'tool-result'; toolCallId: string; toolName: string; result: unknown };

// ---------------------------------------------------------------------------
// Provider stream contract
// ---------------------------------------------------------------------------

/**
 * Raw event shape yielded by provider adapters. Each field is optional;
 * the adapter sets whichever fields apply to the current event.
 */
export interface ProviderStreamEvent {
  delta?: string;
  done?: boolean;
  usage?: StreamUsage;
  toolCall?: StreamToolCall;
  toolResult?: StreamToolResult;
}

/**
 * Factory that opens a streaming LLM turn. Concrete adapters (Anthropic,
 * Ollama, etc.) close over auth + model config and conform to this shape.
 *
 * `tools` is typed as `Record<string, unknown>` to keep this module free
 * of AI SDK imports — adapters cast to `Record<string, CoreTool>` internally.
 */
export type ProviderStreamFn = (args: {
  system: string;
  messages: StreamMessage[];
  tools?: Record<string, unknown>;
  maxSteps?: number;
  signal?: AbortSignal;
  runId?: string | null;
  threadId?: string | null;
  companyId?: string | null;
  employeeId?: string | null;
  currentTicketId?: string | null;
}) => AsyncGenerator<ProviderStreamEvent>;

export interface StreamAgentArgs {
  providerFactory: ProviderStreamFn;
  system: string;
  messages: StreamMessage[];
  tools?: Record<string, unknown>;
  maxSteps?: number;
  signal?: AbortSignal;
  runId?: string | null;
  threadId?: string | null;
  companyId?: string | null;
  employeeId?: string | null;
  currentTicketId?: string | null;
}

/**
 * Adapts a low-level provider stream into a normalized {kind, ...} chunk
 * stream that the orchestrator and the dashboard event bus consume directly.
 */
export async function* streamAgent(args: StreamAgentArgs): AsyncGenerator<StreamChunk> {
  for await (const evt of args.providerFactory({
    system: args.system,
    messages: args.messages,
    tools: args.tools,
    maxSteps: args.maxSteps,
    signal: args.signal,
    runId: args.runId ?? null,
    threadId: args.threadId ?? null,
    companyId: args.companyId ?? null,
    employeeId: args.employeeId ?? null,
    currentTicketId: args.currentTicketId ?? null,
  })) {
    if (evt.toolCall) {
      yield {
        kind: 'tool-call',
        toolCallId: evt.toolCall.toolCallId,
        toolName: evt.toolCall.toolName,
        args: evt.toolCall.args,
      };
    }
    if (evt.toolResult) {
      yield {
        kind: 'tool-result',
        toolCallId: evt.toolResult.toolCallId,
        toolName: evt.toolResult.toolName,
        result: evt.toolResult.result,
      };
    }
    if (evt.delta !== undefined) {
      yield { kind: 'delta', delta: evt.delta };
    }
    if (evt.done && evt.usage) {
      yield { kind: 'done', usage: evt.usage };
    }
  }
}
