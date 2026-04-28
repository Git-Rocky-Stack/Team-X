/**
 * Provider-agnostic streaming primitive used by the orchestrator.
 *
 * A `ProviderStreamFn` is anything that can take a system prompt + chat
 * history and yield tokens (then a final usage record). Concrete adapters for
 * Anthropic, Ollama, OpenAI etc. live under `./adapters/` and conform to this
 * type. Tests can pass a fake `ProviderStreamFn` to exercise consumer code
 * (the orchestrator) without making real network calls.
 */

export type StreamRole = 'system' | 'user' | 'assistant';

export interface StreamMessage {
  role: StreamRole;
  content: string;
}

export interface StreamUsage {
  promptTokens: number;
  completionTokens: number;
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
