export const INTELLIGENCE_VERSION = '1.0.0';

export * from './rag/index.js';
export * from './nlu/intent-classifier.js';
export * from './nlu/entity-resolver.js';
export * from './nlu/slot-filler.js';

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
