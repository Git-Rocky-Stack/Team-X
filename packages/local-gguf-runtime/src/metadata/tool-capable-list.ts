// packages/local-gguf-runtime/src/metadata/tool-capable-list.ts
//
// Tool-capability (function-calling) classification for GGUF models.
//
// "Tool-capable" is NOT a GGUF field. Whether a model reliably emits
// structured tool/function calls is a property of its instruction tuning,
// surfaced in practice through the Jinja `tokenizer.chat_template`: tuned
// models carry tool-call scaffolding (Llama-3.1 `<|python_tag|>` / ipython,
// Mistral-v0.3 `[TOOL_CALLS]` / `[AVAILABLE_TOOLS]`, Qwen2.5 & Hermes
// `<tool_call>` blocks), while base/instruct-only models do not.
//
// Detection is layered, strongest signal first:
//
//   1. chat_template content — the authoritative signal *when present*.
//      Full GGUF files carry it; however the chat_template sits after the
//      (large) tokenizer token array, so it can be absent when only a file
//      head has been read. We therefore never *require* it.
//   2. Curated tool-finetune name patterns (hermes / nous-tool / functionary
//      / firefunction / xlam) — these families are purpose-built for tools.
//   3. Explicit `function-calling` / `tool-use` tags in `general.tags`.
//   4. Model-family + version recognition for the major instruct families
//      that ship tool-call templates by default (Llama 3.1/3.2/3.3,
//      Mistral Instruct v0.3+, Qwen2.5 Instruct).
//
// Embedding architectures are categorically not tool-capable and short-circuit
// to false regardless of name/tags.

import { isEmbeddingArch } from './embedding-arches.js';

export interface ToolCapableInput {
  /** GGUF `general.architecture`. */
  arch: string;
  /** GGUF `general.name`. */
  name: string;
  /** GGUF `general.tags` (may be empty / absent). */
  tags?: string[];
  /** GGUF `tokenizer.chat_template`, when available. */
  chatTemplate?: string | null;
}

// Curated families purpose-built / fine-tuned for tool & function calling.
const TOOL_FINETUNE_NAME_PATTERNS: readonly RegExp[] = [
  /\bhermes\b/i,
  /nous[-_ ]?tool/i,
  /functionary/i,
  /firefunction/i,
  /\bxlam\b/i,
];

// chat_template scaffolding markers, across the major template dialects.
const CHAT_TEMPLATE_TOOL_MARKERS: readonly RegExp[] = [
  /<\|python_tag\|>/i, // Llama 3.1+ built-in tool calling
  /\bipython\b/i, // Llama 3.1+ environment: ipython
  /<tool_call>/i, // Qwen2.5 / Hermes / ChatML tool blocks
  /<\|tool\|>/i, // assorted ChatML-style tool roles
  /\[TOOL_CALLS\]/i, // Mistral v0.3+
  /\[AVAILABLE_TOOLS\]/i, // Mistral v0.3+
  /<function_call>/i, // generic function-call scaffolding
  /\btool_calls\b/i, // OpenAI-shaped tool_calls field in template
];

function hasToolTemplateScaffolding(chatTemplate: string): boolean {
  return CHAT_TEMPLATE_TOOL_MARKERS.some((re) => re.test(chatTemplate));
}

function matchesToolFinetuneName(name: string): boolean {
  return TOOL_FINETUNE_NAME_PATTERNS.some((re) => re.test(name));
}

function hasFunctionCallingTag(tags: string[]): boolean {
  return tags.some((t) => {
    const tag = t.toLowerCase();
    return /function[ _-]?call/.test(tag) || tag.includes('tool-use') || tag.includes('tool use');
  });
}

function isToolCapableFamily(name: string): boolean {
  const n = name.toLowerCase();

  // Llama 3.1 / 3.2 / 3.3 ship built-in tool calling. Llama < 3.1 does not.
  if (/llama[-_ ]?3\.(1|2|3)\b/.test(n)) return true;

  // Mistral Instruct v0.3+ introduced [TOOL_CALLS]; earlier v0.1/v0.2 did not.
  const mistral = n.match(/mistral.*v0\.(\d+)/);
  if (mistral && Number(mistral[1]) >= 3) return true;

  // Qwen2.5 Instruct ships a Hermes-style tool-call template.
  if (/qwen[-_ ]?2?\.5/.test(n) && /instruct/.test(n)) return true;

  return false;
}

/**
 * Best-effort tool-capability classification for a GGUF model. Returns true
 * when the model is expected to reliably emit structured tool / function
 * calls. See module header for the layered detection strategy.
 */
export function isToolCapable(input: ToolCapableInput): boolean {
  // Embedding encoders never do tool calls.
  if (isEmbeddingArch(input.arch)) return false;

  const tags = input.tags ?? [];

  // 1. Authoritative signal when the template is available.
  if (input.chatTemplate && hasToolTemplateScaffolding(input.chatTemplate)) return true;

  // 2. Curated tool-finetune families.
  if (matchesToolFinetuneName(input.name)) return true;

  // 3. Explicit function-calling / tool-use tags.
  if (hasFunctionCallingTag(tags)) return true;

  // 4. Family + version recognition for the default-tool-template instruct lines.
  if (isToolCapableFamily(input.name)) return true;

  return false;
}
