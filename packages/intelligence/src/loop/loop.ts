/**
 * createAgenticLoop — pure ReAct orchestrator.
 *
 * Each iteration:
 *   1. Check budgets (steps, tokens, wall-clock, external cancel).
 *   2. Call complete() with the system prompt + transcript so far.
 *   3. Parse the assistant text. The trailing JSON object MUST match
 *      one of:
 *        - {"action": "<tool_name>", "args": {...}}  → tool_call step
 *        - {"action": "final_answer", "answer": "..."} → answer step (terminal)
 *      Any text BEFORE the JSON object is recorded as a `plan` step.
 *   4. If the message is malformed, send a one-shot nudge and retry
 *      the SAME iteration. Second failure terminates with
 *      `tool_call_invalid`.
 *   5. For tool_call: dispatch through the tool registry. The four
 *      typed failure modes map onto loop error reasons. Tool result
 *      is appended to the transcript as a synthetic user message
 *      (`Observation: <json>`) so the next assistant turn can reason
 *      against it.
 *
 * The loop is fully synchronous from the caller's perspective: `run`
 * returns a single `LoopRun` snapshot when the loop terminates.
 * `onStep` fires synchronously as each step lands so streaming UIs
 * can subscribe without waiting on the final promise.
 *
 * Phase 5 — M31 — T1.
 */

import { NUDGE_PROMPT, buildSystemPrompt } from './prompt.js';
import { type ToolRegistry, createToolRegistry } from './tool-registry.js';
import {
  type AgenticLoop,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOOL_TIMEOUT_MS,
  type LoopBudget,
  type LoopBudgetUsed,
  type LoopDeps,
  type LoopErrorReason,
  type LoopMessage,
  type LoopProviderCompletion,
  type LoopRun,
  type LoopStatus,
  type LoopStep,
  type LoopStepError,
  type LoopStepTelemetry,
  type RunOptions,
  ZERO_TELEMETRY,
} from './types.js';

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createAgenticLoop(deps: LoopDeps): AgenticLoop {
  const registry = createToolRegistry(deps.tools);
  const idGen = deps.idGen ?? defaultIdGen;
  const now = deps.now ?? Date.now;

  const budget: LoopBudget = {
    maxSteps: deps.maxSteps ?? DEFAULT_MAX_STEPS,
    maxTokens: deps.maxTokens ?? DEFAULT_MAX_TOKENS,
    timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  const toolTimeoutMs = deps.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

  const systemPrompt = buildSystemPrompt({
    tools: deps.tools,
    customSystemPrompt: deps.systemPrompt,
  });

  return {
    async run(userText, options) {
      return runLoop({
        userText,
        options: options ?? {},
        deps,
        budget,
        toolTimeoutMs,
        systemPrompt,
        registry,
        idGen,
        now,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Internal run state
// ---------------------------------------------------------------------------

interface RunContext {
  readonly userText: string;
  readonly options: RunOptions;
  readonly deps: LoopDeps;
  readonly budget: LoopBudget;
  readonly toolTimeoutMs: number;
  readonly systemPrompt: string;
  readonly registry: ToolRegistry;
  readonly idGen: () => string;
  readonly now: () => number;
}

async function runLoop(ctx: RunContext): Promise<LoopRun> {
  const runId = ctx.idGen();
  const startTime = ctx.now();
  const steps: LoopStep[] = [];
  const used: { steps: number; tokensIn: number; tokensOut: number; costUsd: number } = {
    steps: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
  const transcript: LoopMessage[] = [{ role: 'user', content: ctx.userText }];

  // Combine external signal with our own controller so we can abort
  // tool calls when budgets blow.
  const internalController = new AbortController();
  const externalSignal = ctx.options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) {
      internalController.abort();
    } else {
      externalSignal.addEventListener('abort', () => internalController.abort(), { once: true });
    }
  }

  // Helper closures that capture run-scoped state.
  const emit = (step: LoopStep): void => {
    steps.push(step);
    if (ctx.options.onStep) {
      try {
        ctx.options.onStep(step);
      } catch {
        // Subscriber errors must not poison the loop. Swallow.
      }
    }
  };

  const finalize = (status: LoopStatus, answer?: string): LoopRun => {
    const usedSnapshot: LoopBudgetUsed = {
      steps: used.steps,
      tokensIn: used.tokensIn,
      tokensOut: used.tokensOut,
      wallClockMs: ctx.now() - startTime,
      costUsd: used.costUsd,
    };
    const run: LoopRun = {
      runId,
      status,
      steps: steps.slice(),
      budget: ctx.budget,
      used: usedSnapshot,
      answer,
    };
    return run;
  };

  const emitErrorAndFinish = (
    reason: LoopErrorReason,
    message: string,
    status: LoopStatus,
    telemetry: LoopStepTelemetry = ZERO_TELEMETRY,
  ): LoopRun => {
    const errorStep: LoopStepError = {
      kind: 'error',
      stepIndex: steps.length,
      reason,
      message,
      telemetry,
    };
    emit(errorStep);
    return finalize(status);
  };

  // ---------- main iteration ----------
  let nudgeUsed = false;

  while (true) {
    // Cancellation
    if (externalSignal?.aborted) {
      return emitErrorAndFinish('canceled', 'Run canceled by caller.', 'canceled');
    }
    // Wall-clock timeout
    const elapsed = ctx.now() - startTime;
    if (elapsed >= ctx.budget.timeoutMs) {
      return emitErrorAndFinish(
        'budget_timeout',
        `Wall-clock budget of ${ctx.budget.timeoutMs}ms exhausted (elapsed ${elapsed}ms).`,
        'budget_exhausted',
      );
    }
    // Step cap
    if (used.steps >= ctx.budget.maxSteps) {
      return emitErrorAndFinish(
        'budget_steps',
        `Step budget of ${ctx.budget.maxSteps} steps exhausted.`,
        'budget_exhausted',
      );
    }
    // Token cap
    if (used.tokensIn + used.tokensOut >= ctx.budget.maxTokens) {
      return emitErrorAndFinish(
        'budget_tokens',
        `Token budget of ${ctx.budget.maxTokens} tokens exhausted (used ${used.tokensIn + used.tokensOut}).`,
        'budget_exhausted',
      );
    }

    // ---------- LLM call ----------
    let completion: LoopProviderCompletion;
    try {
      completion = await ctx.deps.complete({
        system: ctx.systemPrompt,
        messages: transcript.slice(),
        signal: internalController.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Provider abort during cancel = canceled, otherwise provider_error.
      if (externalSignal?.aborted || /abort|canceled/i.test(msg)) {
        return emitErrorAndFinish('canceled', `Provider aborted: ${msg}`, 'canceled');
      }
      return emitErrorAndFinish('provider_error', msg, 'failed');
    }

    used.tokensIn += completion.usage.promptTokens;
    used.tokensOut += completion.usage.completionTokens;
    used.costUsd += completion.costUsd;

    const telemetry: LoopStepTelemetry = {
      tokensIn: completion.usage.promptTokens,
      tokensOut: completion.usage.completionTokens,
      costUsd: completion.costUsd,
      provider: completion.provider,
      model: completion.model,
    };

    // ---------- Parse ----------
    const parsed = parseAssistantText(completion.text);

    if (parsed.kind === 'invalid') {
      // Record the raw assistant text in the transcript so the model
      // sees its own malformed output when we nudge.
      transcript.push({ role: 'assistant', content: completion.text });

      if (!nudgeUsed) {
        nudgeUsed = true;
        // Surface the raw text as a plan step so the user can see
        // what the model produced.
        if (completion.text.trim().length > 0) {
          emit({
            kind: 'plan',
            stepIndex: steps.length,
            text: completion.text,
            telemetry,
          });
          used.steps += 1;
        }
        transcript.push({ role: 'user', content: NUDGE_PROMPT });
        continue;
      }

      return emitErrorAndFinish(
        'tool_call_invalid',
        `Assistant emitted a malformed action twice in a row: ${parsed.reason}`,
        'failed',
        telemetry,
      );
    }

    // Record a plan step if the model wrote any prose before the JSON.
    if (parsed.thought.length > 0) {
      emit({
        kind: 'plan',
        stepIndex: steps.length,
        text: parsed.thought,
        telemetry,
      });
      used.steps += 1;
    }

    // Always record the assistant turn in the transcript.
    transcript.push({ role: 'assistant', content: completion.text });

    // ---------- Final answer (terminal) ----------
    if (parsed.kind === 'answer') {
      emit({
        kind: 'answer',
        stepIndex: steps.length,
        text: parsed.answer,
        telemetry: parsed.thought.length > 0 ? ZERO_TELEMETRY : telemetry,
      });
      used.steps += 1;
      return finalize('completed', parsed.answer);
    }

    // ---------- Tool call ----------
    const toolCallId = ctx.idGen();
    emit({
      kind: 'tool_call',
      stepIndex: steps.length,
      toolCallId,
      toolName: parsed.toolName,
      args: parsed.args,
      telemetry: parsed.thought.length > 0 ? ZERO_TELEMETRY : telemetry,
    });
    used.steps += 1;

    // Step budget check BEFORE running the tool — we just emitted a
    // tool_call step, and the tool_result is its own step.
    if (used.steps >= ctx.budget.maxSteps) {
      return emitErrorAndFinish(
        'budget_steps',
        `Step budget of ${ctx.budget.maxSteps} steps exhausted before tool result.`,
        'budget_exhausted',
      );
    }

    const invocation = await ctx.registry.invoke({
      name: parsed.toolName,
      rawArgs: parsed.args,
      runId,
      signal: internalController.signal,
      timeoutMs: ctx.toolTimeoutMs,
    });

    if (invocation.kind === 'unknown_tool') {
      return emitErrorAndFinish(
        'tool_unknown',
        `Assistant requested unknown tool: "${invocation.name}".`,
        'failed',
      );
    }
    if (invocation.kind === 'invalid_args') {
      // Treat as malformed action — same nudge / terminal-failure
      // discipline as JSON parse failures.
      transcript.push({
        role: 'user',
        content: `Tool "${parsed.toolName}" rejected the args: ${invocation.message}. Try again with valid args.`,
      });
      if (!nudgeUsed) {
        nudgeUsed = true;
        continue;
      }
      return emitErrorAndFinish(
        'tool_call_invalid',
        `Assistant emitted invalid args for "${parsed.toolName}" twice in a row: ${invocation.message}`,
        'failed',
      );
    }
    if (invocation.kind === 'timeout') {
      return emitErrorAndFinish(
        'tool_timeout',
        `Tool "${parsed.toolName}" exceeded ${ctx.toolTimeoutMs}ms.`,
        'failed',
      );
    }
    if (invocation.kind === 'threw') {
      return emitErrorAndFinish(
        'tool_threw',
        `Tool "${parsed.toolName}" threw: ${invocation.message}`,
        'failed',
      );
    }

    // Success — emit tool_result, append observation, continue.
    emit({
      kind: 'tool_result',
      stepIndex: steps.length,
      toolCallId,
      toolName: parsed.toolName,
      result: invocation.result,
      telemetry: ZERO_TELEMETRY,
    });
    used.steps += 1;

    transcript.push({
      role: 'user',
      content: `Observation from "${parsed.toolName}": ${safeStringify(invocation.result)}`,
    });

    // Reset nudge so a future malformed action in a NEW iteration gets
    // its own one-shot recovery attempt.
    nudgeUsed = false;
  }
}

// ---------------------------------------------------------------------------
// Assistant-text parser
// ---------------------------------------------------------------------------

type ParsedAssistant =
  | { kind: 'tool_call'; thought: string; toolName: string; args: Record<string, unknown> }
  | { kind: 'answer'; thought: string; answer: string }
  | { kind: 'invalid'; reason: string };

function parseAssistantText(rawText: string): ParsedAssistant {
  const text = rawText.trim();
  if (text.length === 0) {
    return { kind: 'invalid', reason: 'empty assistant message' };
  }

  // Defensive: strip a single fenced code block if the WHOLE message
  // is fenced. ("```json\n{...}\n```")
  const stripped = stripWrappingFence(text);

  // Forward scan tracking brace depth. Whenever depth transitions
  // 0 → 1 we record the position of the opening `{`; whenever depth
  // returns to 0 we record the position of the matching `}`. After
  // the loop, `lastTopOpen` and `lastTopClose` point at the OUTERMOST
  // braces of the final top-level JSON object (or are -1 if there
  // wasn't one). Strings + escapes are honored so braces inside
  // string literals are ignored.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastTopOpen = -1;
  let lastTopClose = -1;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) lastTopOpen = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) lastTopClose = i;
      if (depth < 0) {
        return { kind: 'invalid', reason: 'unbalanced braces in assistant message' };
      }
    }
  }

  if (depth !== 0) {
    return { kind: 'invalid', reason: 'unterminated JSON object in assistant message' };
  }
  if (lastTopOpen < 0 || lastTopClose < 0) {
    return { kind: 'invalid', reason: 'no top-level JSON object found' };
  }

  // The trailing JSON object must end at the very end of the message
  // — anything after it (besides whitespace) violates the contract.
  if (lastTopClose !== stripped.length - 1) {
    return { kind: 'invalid', reason: 'text written after the trailing JSON object' };
  }

  const candidate = stripped.slice(lastTopOpen, lastTopClose + 1);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(candidate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: 'invalid', reason: `trailing JSON did not parse: ${msg}` };
  }
  if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
    return { kind: 'invalid', reason: 'trailing JSON is not an object' };
  }

  const obj = parsedJson as Record<string, unknown>;
  const action = obj.action;
  const lastJsonStart = lastTopOpen;

  // Thought = everything before the JSON.
  let thought = stripped.slice(0, lastJsonStart).trim();
  // Drop a leading "```json" or "```" remnant if present.
  thought = thought.replace(/```(?:json)?\s*$/i, '').trim();

  if (action === 'final_answer') {
    const answer = obj.answer;
    if (typeof answer !== 'string') {
      return { kind: 'invalid', reason: '"final_answer" requires a string "answer" field' };
    }
    return { kind: 'answer', thought, answer };
  }

  if (typeof action !== 'string' || action.length === 0) {
    return { kind: 'invalid', reason: '"action" field must be a non-empty string' };
  }

  const args = obj.args;
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    return { kind: 'invalid', reason: '"args" must be a JSON object' };
  }

  return {
    kind: 'tool_call',
    thought,
    toolName: action,
    args: (args ?? {}) as Record<string, unknown>,
  };
}

function stripWrappingFence(text: string): string {
  // Match ```<lang>?\n ... \n``` where the entire input is fenced.
  const fence = /^```(?:[a-zA-Z]+)?\s*\n([\s\S]*?)\n```\s*$/.exec(text);
  if (!fence) return text;
  const body = fence[1];
  return body === undefined ? text : body.trim();
}

function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return String(value);
    // Cap observation length so a chatty tool can't blow the context
    // window. Tools are expected to project to <= 50 rows in T2; this
    // is a final safety net.
    const MAX = 8000;
    return json.length > MAX ? `${json.slice(0, MAX)}…[truncated]` : json;
  } catch {
    return String(value);
  }
}

let _idCounter = 0;
function defaultIdGen(): string {
  // Compact, sortable, collision-resistant enough for in-process IDs.
  _idCounter += 1;
  return `loop_${Date.now().toString(36)}_${_idCounter.toString(36)}`;
}
