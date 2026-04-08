export { createRegistry, type ProviderRegistry, type PickOptions } from './registry.js';
export {
  streamAgent,
  type ProviderStreamFn,
  type StreamAgentArgs,
  type StreamChunk,
  type StreamMessage,
  type StreamRole,
  type StreamUsage,
} from './stream.js';
export { makeAnthropicStream, type AnthropicAdapterOptions } from './adapters/anthropic.js';
export { makeOllamaStream, type OllamaAdapterOptions } from './adapters/ollama.js';
