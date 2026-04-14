/**
 * Unit tests for the M31 T1 tool registry.
 *
 * The registry is the only component that touches user-supplied tool
 * `execute` functions, so it owns timeout + zod-validation + throw
 * containment. These tests pin those guarantees so `loop.ts` can stay
 * a clean switch on the four typed failure modes.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createToolRegistry } from './tool-registry.js';
import type { Tool, ToolContext } from './types.js';

const SCHEMA = z.object({ q: z.string().min(1) });

interface QueryArgs {
  q: string;
}

function tool(name: string, fn: (args: QueryArgs, ctx: ToolContext) => Promise<unknown>): Tool {
  return { name, description: name, schema: SCHEMA, execute: fn };
}

const ID = 'run_test';

function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

describe('createToolRegistry', () => {
  it('throws on duplicate tool names at construction time', () => {
    const a = tool('dup', async () => 1);
    const b = tool('dup', async () => 2);
    expect(() => createToolRegistry([a, b])).toThrow(/Duplicate tool name/);
  });

  it('resolve() returns the tool by name and undefined for misses', () => {
    const t = tool('q', async () => 1);
    const reg = createToolRegistry([t]);
    expect(reg.resolve('q')).toBe(t);
    expect(reg.resolve('missing')).toBeUndefined();
  });

  it('invoke() returns kind:ok with the tool result on a happy path', async () => {
    const t = tool('q', async (args) => ({ echoed: args.q }));
    const reg = createToolRegistry([t]);

    const result = await reg.invoke({
      name: 'q',
      rawArgs: { q: 'hello' },
      runId: ID,
      signal: freshSignal(),
      timeoutMs: 1_000,
    });

    expect(result).toEqual({ kind: 'ok', result: { echoed: 'hello' } });
  });

  it('invoke() returns unknown_tool when name does not exist', async () => {
    const reg = createToolRegistry([]);
    const result = await reg.invoke({
      name: 'nope',
      rawArgs: {},
      runId: ID,
      signal: freshSignal(),
      timeoutMs: 1_000,
    });
    expect(result).toEqual({ kind: 'unknown_tool', name: 'nope' });
  });

  it('invoke() returns invalid_args when args fail the zod schema', async () => {
    const t = tool('q', async () => 1);
    const reg = createToolRegistry([t]);

    const result = await reg.invoke({
      name: 'q',
      rawArgs: { q: '' }, // fails min(1)
      runId: ID,
      signal: freshSignal(),
      timeoutMs: 1_000,
    });

    if (result.kind !== 'invalid_args') throw new Error('expected invalid_args');
    expect(result.message).toContain('q');
  });

  it('invoke() returns timeout when execute exceeds timeoutMs', async () => {
    const t = tool(
      'slow',
      (_args, ctx) =>
        new Promise<unknown>((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );
    const reg = createToolRegistry([t]);

    const result = await reg.invoke({
      name: 'slow',
      rawArgs: { q: 'go' },
      runId: ID,
      signal: freshSignal(),
      timeoutMs: 10,
    });

    expect(result.kind).toBe('timeout');
  });

  it('invoke() returns threw with stringified message when execute throws', async () => {
    const t = tool('bad', async () => {
      throw new Error('boom');
    });
    const reg = createToolRegistry([t]);

    const result = await reg.invoke({
      name: 'bad',
      rawArgs: { q: 'x' },
      runId: ID,
      signal: freshSignal(),
      timeoutMs: 1_000,
    });

    if (result.kind !== 'threw') throw new Error('expected threw');
    expect(result.message).toBe('boom');
  });

  it('invoke() honors a pre-aborted outer signal without calling execute', async () => {
    const exec = vi.fn(async () => 1);
    const t = tool('q', exec);
    const reg = createToolRegistry([t]);

    const ctrl = new AbortController();
    ctrl.abort();

    const result = await reg.invoke({
      name: 'q',
      rawArgs: { q: 'x' },
      runId: ID,
      signal: ctrl.signal,
      timeoutMs: 1_000,
    });

    expect(result.kind).toBe('threw');
    expect(exec).not.toHaveBeenCalled();
  });
});
