/**
 * Canonical system prompt + nudge text for the agentic loop.
 *
 * The loop asks the LLM to end every turn with a single JSON object:
 *   - `{"action": "<tool_name>", "args": { ... }}` to call a tool, or
 *   - `{"action": "final_answer", "answer": "..."}` to finish.
 *
 * Anything the model writes *before* that trailing JSON object is
 * captured as a `plan` step (the model's visible reasoning). This is
 * the simplest JSON-only flavor of ReAct and keeps the parser in
 * `loop.ts` small and strict.
 *
 * Phase 5 — M31 — T1.
 */

import type { z } from 'zod';

/**
 * Structural interface — the loop passes its tools in; this module
 * deliberately does NOT import the full `Tool` type from `./types.ts`
 * to keep the prompt layer pure and test-friendly.
 */
export interface PromptTool {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType;
}

export interface BuildSystemPromptOptions {
  readonly tools: readonly PromptTool[];
  /** Prefix inserted above the tool list. Defaults to the DEFAULT_SYSTEM_PREFIX. */
  readonly customSystemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Default prefix — matches the Rocky Elite Partner / F10 voice: direct,
// authoritative, no fluff. The model is told exactly what kind of
// answer to deliver and what shape every turn must take.
// ---------------------------------------------------------------------------

export const DEFAULT_SYSTEM_PREFIX = `You are the Strategia-X company copilot. You answer complex questions about the state of the company — its employees, tickets, projects, meetings, files, and recent activity — by reasoning through them step by step and calling the read-only tools available to you.

Principles:
- Think before you act. Explain your plan for one short sentence, then call exactly one tool.
- Ground every claim in the tool results you have actually observed. Do not invent numbers, names, or IDs.
- If a question cannot be answered with the available tools, say so plainly in your final answer.
- Keep the final answer concise and executive. Cite specific employees, tickets, or projects by name.`;

// ---------------------------------------------------------------------------
// Trailing instructions appended after the tool list. These are the
// hard contract the parser in `loop.ts` relies on — changing the
// wording here without also updating the parser is a test-breaking
// change.
// ---------------------------------------------------------------------------

const ACTION_CONTRACT = `At each turn you MUST respond in this exact shape:

1. (Optional) A short one- or two-sentence plan describing what you intend to do next.
2. A single JSON object on the final line, with no trailing text, matching one of:
     {"action": "<tool_name>", "args": { ... }}      — call a tool
     {"action": "final_answer", "answer": "..."}     — finish and return the answer

Rules:
- The JSON object MUST be the last thing in your message.
- Do NOT wrap the JSON in triple-backtick code fences.
- Do NOT emit multiple JSON objects in one turn.
- Tool args MUST exactly match the tool's schema.
- If you have enough information to answer the user, emit {"action": "final_answer", ...}. Do not keep calling tools unnecessarily.`;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
  const prefix = opts.customSystemPrompt ?? DEFAULT_SYSTEM_PREFIX;

  const toolsSection =
    opts.tools.length === 0
      ? 'No tools are available. Emit a final_answer directly.'
      : opts.tools.map((t, i) => `${i + 1}. ${t.name} — ${t.description}`).join('\n');

  return `${prefix}

Tools available:
${toolsSection}

${ACTION_CONTRACT}`;
}

// ---------------------------------------------------------------------------
// Nudge — sent once after a malformed tool call. Second malformed call
// terminates with `tool_call_invalid`.
// ---------------------------------------------------------------------------

export const NUDGE_PROMPT = `Your last message did not end with a valid JSON action. Respond again with the JSON object on the final line, matching one of:
  {"action": "<tool_name>", "args": { ... }}
  {"action": "final_answer", "answer": "..."}
Do not wrap the JSON in code fences. Do not add any text after the JSON.`;
