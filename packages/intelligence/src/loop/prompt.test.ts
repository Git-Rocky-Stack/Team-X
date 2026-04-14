/**
 * Unit tests for the M31 T1 system-prompt builder.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DEFAULT_SYSTEM_PREFIX,
  NUDGE_PROMPT,
  type PromptTool,
  buildSystemPrompt,
} from './prompt.js';

const TOOL_A: PromptTool = {
  name: 'query_employees',
  description: 'List employees with optional filters.',
  schema: z.object({ q: z.string() }),
};

const TOOL_B: PromptTool = {
  name: 'query_tickets',
  description: 'List tickets with optional filters.',
  schema: z.object({ q: z.string() }),
};

describe('buildSystemPrompt', () => {
  it('uses the DEFAULT_SYSTEM_PREFIX when no override is provided', () => {
    const prompt = buildSystemPrompt({ tools: [TOOL_A] });
    expect(prompt).toContain(DEFAULT_SYSTEM_PREFIX);
  });

  it('substitutes a custom prefix when customSystemPrompt is provided', () => {
    const prompt = buildSystemPrompt({
      tools: [TOOL_A],
      customSystemPrompt: 'YOU ARE A MINIMALIST.',
    });
    expect(prompt).toContain('YOU ARE A MINIMALIST.');
    expect(prompt).not.toContain(DEFAULT_SYSTEM_PREFIX);
  });

  it('lists every tool name and description', () => {
    const prompt = buildSystemPrompt({ tools: [TOOL_A, TOOL_B] });
    expect(prompt).toContain('query_employees');
    expect(prompt).toContain('List employees with optional filters.');
    expect(prompt).toContain('query_tickets');
    expect(prompt).toContain('List tickets with optional filters.');
  });

  it('emits a no-tools sentinel when the tool list is empty', () => {
    const prompt = buildSystemPrompt({ tools: [] });
    expect(prompt).toContain('No tools are available');
  });

  it('always includes the action contract with both action shapes', () => {
    const prompt = buildSystemPrompt({ tools: [TOOL_A] });
    expect(prompt).toContain('"action": "<tool_name>"');
    expect(prompt).toContain('"action": "final_answer"');
  });
});

describe('NUDGE_PROMPT', () => {
  it('mentions both action shapes so the model knows how to recover', () => {
    expect(NUDGE_PROMPT).toContain('"action": "<tool_name>"');
    expect(NUDGE_PROMPT).toContain('"action": "final_answer"');
  });
});
