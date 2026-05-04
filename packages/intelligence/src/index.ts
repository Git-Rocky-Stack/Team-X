export const INTELLIGENCE_VERSION = '1.0.0';

// RAG & Memory
export * from './rag/index.js';

// Evaluation
export * from './eval/index.js';

// NLU
export * from './nlu/intent-classifier.js';
export * from './nlu/entity-resolver.js';
export * from './nlu/slot-filler.js';

// Prompt Versioning — M29
export * from './prompt/index.js';

// Long-Term Memory — M29
export * from './memory/index.js';

// Metrics & Dashboard — M29
export * from './metrics/index.js';

// Knowledge Graph — M30 (Phase 3)
export * from './knowledge/index.js';

// Streaming Responses — M30 (Phase 3)
export * from './streaming/index.js';

// Advanced Observability — M30 (Phase 3)
export * from './observability/index.js';

// Unified AI Service — M31 (Integration)
export * from './service/index.js';

// M31 — Agentic loop core (T1)
export * from './loop/types.js';
export {
  buildSystemPrompt,
  DEFAULT_SYSTEM_PREFIX,
  NUDGE_PROMPT,
  type BuildSystemPromptOptions,
  type PromptTool,
} from './loop/prompt.js';
export {
  createToolRegistry,
  type InvokeArgs,
  type ToolInvocationResult,
  type ToolRegistry,
} from './loop/tool-registry.js';
export { createAgenticLoop } from './loop/loop.js';

// M30 — Multi-turn planning (Phase 3)
export * from './loop/planning.js';
