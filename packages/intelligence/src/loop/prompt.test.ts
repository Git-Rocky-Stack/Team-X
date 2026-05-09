/**
 * Unit tests for the M31 T1 system-prompt builder (post-C2 native tool-use).
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DEFAULT_SYSTEM_PREFIX,
  FEW_SHOT_EXAMPLES,
  type PromptTool,
  TRUST_BOUNDARIES,
  buildProviderToolDescriptors,
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

  it('does NOT instruct the model to emit JSON action objects (native tool-use is used instead)', () => {
    const prompt = buildSystemPrompt({ tools: [TOOL_A] });
    expect(prompt).not.toContain('"action":');
    expect(prompt).not.toContain('final_answer');
    // Positive signal: prompt mentions native function-calling
    expect(prompt.toLowerCase()).toContain('native function-calling');
  });

  it('always appends the trust-boundary contract — even with a custom prefix', () => {
    // Default prefix path
    const defaultPrompt = buildSystemPrompt({ tools: [TOOL_A] });
    expect(defaultPrompt).toContain(TRUST_BOUNDARIES);
    expect(defaultPrompt).toContain('Trust boundaries — non-negotiable');
    expect(defaultPrompt).toContain('<observation>');
    expect(defaultPrompt).toContain('<context>');
    expect(defaultPrompt).toContain('<vault_file>');

    // Custom prefix path — system-agent role pack overrides the prefix but
    // must still receive the same trust-boundary rule.
    const customPrompt = buildSystemPrompt({
      tools: [TOOL_A],
      customSystemPrompt: 'Custom role prompt body.',
    });
    expect(customPrompt).toContain(TRUST_BOUNDARIES);
  });
});

// ---------------------------------------------------------------------------
// H2 — Few-shot examples (audit 2026-05-07)
// ---------------------------------------------------------------------------

describe('FEW_SHOT_EXAMPLES — H2 audit 2026-05-07', () => {
  it('includes both worked examples in the canonical text', () => {
    expect(FEW_SHOT_EXAMPLES).toContain('Example 1 — single-step lookup');
    expect(FEW_SHOT_EXAMPLES).toContain('Example 2 — multi-step with mid-plan revision');
  });

  it('demonstrates the round-trip narrative form (no inline JSON action objects)', () => {
    // The few-shot must NOT teach the model to emit JSON in text — that
    // would regress the C2 native-tool-use migration.
    expect(FEW_SHOT_EXAMPLES).not.toContain('"action":');
    expect(FEW_SHOT_EXAMPLES).not.toContain('final_answer');
    // Positive: the bracketed [Round-trip: …] form is present so the model
    // learns the narration is description, not output.
    expect(FEW_SHOT_EXAMPLES).toMatch(/\[Round-trip:/);
  });

  it('cites entity IDs in the example final answers — modeling the "do not invent" principle', () => {
    // Example 1 answer cites three ticket IDs.
    expect(FEW_SHOT_EXAMPLES).toContain('TX-412');
    expect(FEW_SHOT_EXAMPLES).toContain('TX-419');
    expect(FEW_SHOT_EXAMPLES).toContain('TX-431');
    // Example 2 answer cites two more IDs, demonstrating multi-hop grounding.
    expect(FEW_SHOT_EXAMPLES).toContain('TX-440');
    expect(FEW_SHOT_EXAMPLES).toContain('TX-447');
  });

  it('demonstrates the mid-plan revision pattern in example 2', () => {
    // The model needs a worked instance of "an observation surprised me,
    // here is my revised plan" — this is the highest-leverage signal of
    // the few-shot block.
    expect(FEW_SHOT_EXAMPLES).toContain('Plan revised');
  });
});

describe('buildSystemPrompt — few-shot inclusion gating (H2)', () => {
  it('includes FEW_SHOT_EXAMPLES by default when using the default prefix', () => {
    const prompt = buildSystemPrompt({ tools: [TOOL_A] });
    expect(prompt).toContain(FEW_SHOT_EXAMPLES);
  });

  it('omits FEW_SHOT_EXAMPLES by default when a custom prefix is supplied', () => {
    // Role-pack authors using customSystemPrompt typically own the entire
    // prompt body; default to OFF so we don't smuggle copilot-flavored
    // examples into a manager / supervisor / engineer role pack.
    const prompt = buildSystemPrompt({
      tools: [TOOL_A],
      customSystemPrompt: 'Custom role prompt body.',
    });
    expect(prompt).not.toContain(FEW_SHOT_EXAMPLES);
  });

  it('honors includeFewShotExamples=true with a custom prefix (opt-in)', () => {
    const prompt = buildSystemPrompt({
      tools: [TOOL_A],
      customSystemPrompt: 'Custom role prompt body.',
      includeFewShotExamples: true,
    });
    expect(prompt).toContain(FEW_SHOT_EXAMPLES);
  });

  it('honors includeFewShotExamples=false with the default prefix (opt-out)', () => {
    const prompt = buildSystemPrompt({
      tools: [TOOL_A],
      includeFewShotExamples: false,
    });
    expect(prompt).toContain(DEFAULT_SYSTEM_PREFIX);
    expect(prompt).not.toContain(FEW_SHOT_EXAMPLES);
  });

  it('places examples between TRUST_BOUNDARIES and the tools listing', () => {
    const prompt = buildSystemPrompt({ tools: [TOOL_A] });
    const trustIdx = prompt.indexOf(TRUST_BOUNDARIES);
    const examplesIdx = prompt.indexOf(FEW_SHOT_EXAMPLES);
    const toolsIdx = prompt.indexOf('Tools available');
    expect(trustIdx).toBeGreaterThanOrEqual(0);
    expect(examplesIdx).toBeGreaterThan(trustIdx);
    expect(toolsIdx).toBeGreaterThan(examplesIdx);
  });

  it('does not re-introduce the C2 regression — no JSON action objects in the full prompt', () => {
    const prompt = buildSystemPrompt({ tools: [TOOL_A] });
    expect(prompt).not.toContain('"action":');
    expect(prompt).not.toContain('final_answer');
    expect(prompt.toLowerCase()).toContain('native function-calling');
  });
});

describe('buildProviderToolDescriptors', () => {
  it('produces JSON Schema for each tool with name + description preserved', () => {
    const descriptors = buildProviderToolDescriptors([TOOL_A, TOOL_B]);
    expect(descriptors).toHaveLength(2);
    expect(descriptors[0].name).toBe('query_employees');
    expect(descriptors[0].description).toBe('List employees with optional filters.');
    const schema = descriptors[0].jsonSchema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect((schema.properties as Record<string, unknown>).q).toMatchObject({
      type: 'string',
    });
  });

  it('handles tools with constraints (min, max, enums)', () => {
    const constrained: PromptTool = {
      name: 'paginated',
      description: 'Paginated read.',
      schema: z.object({
        cursor: z.string().min(1),
        limit: z.number().int().min(1).max(50),
        order: z.enum(['asc', 'desc']),
      }),
    };
    const [d] = buildProviderToolDescriptors([constrained]);
    const schema = d.jsonSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.cursor.minLength).toBe(1);
    expect(props.limit.minimum).toBe(1);
    expect(props.limit.maximum).toBe(50);
    expect(props.order.enum).toEqual(['asc', 'desc']);
  });

  it('returns an empty array when no tools are passed', () => {
    expect(buildProviderToolDescriptors([])).toEqual([]);
  });
});
