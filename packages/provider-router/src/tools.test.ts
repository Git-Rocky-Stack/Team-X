import { describe, expect, it, vi } from 'vitest';

/**
 * Tests for `buildProviderTools` — the MCP-to-AI-SDK bridge.
 *
 * Mocks the `ai` package so we never import the real SDK; we only
 * verify that `buildProviderTools` calls `tool()` and `jsonSchema()`
 * with the correct arguments for each ToolSpec in the input array.
 */

const toolCalls: Array<{ description: string; parameters: unknown; execute: unknown }> = [];
const jsonSchemaCalls: Array<Record<string, unknown>> = [];

vi.mock('ai', () => ({
  tool: (opts: { description: string; parameters: unknown; execute: unknown }) => {
    toolCalls.push(opts);
    return { __kind: 'fake-tool', description: opts.description };
  },
  jsonSchema: (schema: Record<string, unknown>) => {
    jsonSchemaCalls.push(schema);
    return { __kind: 'fake-schema', schema };
  },
}));

import { type ToolSpec, buildProviderTools } from './tools.js';

describe('buildProviderTools', () => {
  it('returns an empty record when given no specs', () => {
    const result = buildProviderTools([]);
    expect(result).toEqual({});
  });

  it('creates one AI SDK tool per spec, keyed by name', () => {
    toolCalls.length = 0;
    jsonSchemaCalls.length = 0;

    const execute = vi.fn();
    const specs: ToolSpec[] = [
      {
        name: 'read_file',
        description: 'Read a file from disk',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        execute,
      },
    ];

    const result = buildProviderTools(specs);

    expect(Object.keys(result)).toEqual(['read_file']);
    expect(jsonSchemaCalls).toHaveLength(1);
    expect(jsonSchemaCalls[0]).toEqual({
      type: 'object',
      properties: { path: { type: 'string' } },
    });
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.description).toBe('Read a file from disk');
  });

  it('handles multiple specs', () => {
    toolCalls.length = 0;

    const specs: ToolSpec[] = [
      { name: 'tool_a', description: 'A', inputSchema: { type: 'object' }, execute: vi.fn() },
      { name: 'tool_b', description: 'B', inputSchema: { type: 'object' }, execute: vi.fn() },
      { name: 'tool_c', description: 'C', inputSchema: { type: 'object' }, execute: vi.fn() },
    ];

    const result = buildProviderTools(specs);

    expect(Object.keys(result)).toEqual(['tool_a', 'tool_b', 'tool_c']);
    expect(toolCalls).toHaveLength(3);
  });
});
