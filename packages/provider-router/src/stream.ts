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

export type StreamChunk = { kind: 'delta'; delta: string } | { kind: 'done'; usage: StreamUsage };

export type ProviderStreamFn = (args: {
  system: string;
  messages: StreamMessage[];
}) => AsyncGenerator<{ delta?: string; done?: boolean; usage?: StreamUsage }>;

export interface StreamAgentArgs {
  providerFactory: ProviderStreamFn;
  system: string;
  messages: StreamMessage[];
}

/**
 * Adapts a low-level provider stream into a normalized {kind, ...} chunk
 * stream that the orchestrator and the dashboard event bus consume directly.
 */
export async function* streamAgent(args: StreamAgentArgs): AsyncGenerator<StreamChunk> {
  for await (const evt of args.providerFactory({
    system: args.system,
    messages: args.messages,
  })) {
    if (evt.delta !== undefined) {
      yield { kind: 'delta', delta: evt.delta };
    }
    if (evt.done && evt.usage) {
      yield { kind: 'done', usage: evt.usage };
    }
  }
}
