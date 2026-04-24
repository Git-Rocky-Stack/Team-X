import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import type { RuntimeProfile } from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';
import { createExternalRuntimeAdapters } from './external-runtime-adapters.js';

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => {
    this.emit('close', null, 'SIGTERM');
    return true;
  });
}

function makeEmployee(): EmployeeRow {
  return {
    id: 'employee-1',
    companyId: 'company-1',
    rolePackId: 'strategia-official',
    roleId: 'ceo',
    roleMdSha: 'sha',
    level: 'officer',
    name: 'Iris',
    title: 'CEO',
    status: 'idle',
    modelPref: null,
    providerPref: null,
    toolsAllowedJson: '[]',
    toolsDeniedJson: '[]',
    avatar: null,
    isSystem: false,
    createdAt: 1,
  };
}

function makeProfile(
  kind: RuntimeProfile['kind'],
  config: Record<string, unknown>,
): RuntimeProfile {
  return {
    id: `profile-${kind}`,
    companyId: 'company-1',
    name: `Profile ${kind}`,
    slug: `profile-${kind}`,
    kind,
    enabled: true,
    config,
    lastHealthStatus: 'healthy',
    lastHealthMessage: null,
    lastValidatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('external runtime adapters', () => {
  it('wraps bash launchers as provider streams and forwards the invocation payload over stdin', async () => {
    const child = new MockChildProcess();
    let stdinPayload = '';
    child.stdin.on('data', (chunk) => {
      stdinPayload += String(chunk);
    });
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => {
        child.stdout.write(
          JSON.stringify({
            text: 'launcher completed',
            usage: { promptTokens: 12, completionTokens: 4 },
          }),
        );
        child.stdout.end();
        child.emit('close', 0, null);
      });
      return child;
    });
    const adapters = createExternalRuntimeAdapters({ spawnFn });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('bash', {
        command: 'C:\\Tools\\runtime.cmd',
        workingDirectory: 'C:\\Workspace',
      }),
    });

    expect(resolved).not.toBeNull();
    if (!resolved) throw new Error('expected bash runtime adapter');

    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'System directive',
      messages: [{ role: 'user', content: 'Ship the release.' }],
      maxSteps: 3,
      tools: { read_file: {} },
    })) {
      chunks.push(chunk);
    }

    expect(spawnFn).toHaveBeenCalledWith(
      'C:\\Tools\\runtime.cmd',
      [],
      expect.objectContaining({
        cwd: 'C:\\Workspace',
        shell: true,
        windowsHide: true,
      }),
    );
    expect(chunks).toEqual([
      { delta: 'launcher completed' },
      { done: true, usage: { promptTokens: 12, completionTokens: 4 } },
    ]);

    const payload = JSON.parse(stdinPayload);
    expect(payload.version).toBe('team-x-runtime-v1');
    expect(payload.runtimeKind).toBe('bash');
    expect(payload.employee.name).toBe('Iris');
    expect(payload.toolNames).toEqual(['read_file']);
    expect(payload.prompt).toContain('SYSTEM');
    expect(payload.prompt).toContain('Ship the release.');
  });

  it('wraps http runtimes as provider streams and posts the structured invocation payload', async () => {
    const fetchFn: typeof fetch = vi.fn(async (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      const payload = JSON.parse(body);
      expect(payload.runtimeKind).toBe('http');
      expect(payload.system).toBe('You are a runtime');
      return new Response(
        JSON.stringify({
          text: 'remote adapter reply',
          usage: { promptTokens: 9, completionTokens: 5 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    const adapters = createExternalRuntimeAdapters({ fetchFn });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('http', {
        baseUrl: 'http://127.0.0.1:8787/runtime',
      }),
    });

    expect(resolved).not.toBeNull();
    if (!resolved) throw new Error('expected http runtime adapter');

    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'You are a runtime',
      messages: [{ role: 'user', content: 'Summarize the launch.' }],
    })) {
      chunks.push(chunk);
    }

    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/runtime',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-team-x-runtime': 'team-x-runtime-v1',
        }),
      }),
    );
    expect(chunks).toEqual([
      { delta: 'remote adapter reply' },
      { done: true, usage: { promptTokens: 9, completionTokens: 5 } },
    ]);
  });

  it('treats codex-style launcher profiles as execution-backed command adapters when configured', async () => {
    const child = new MockChildProcess();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => {
        child.stdout.write('codex adapter reply');
        child.stdout.end();
        child.emit('close', 0, null);
      });
      return child;
    });
    const adapters = createExternalRuntimeAdapters({ spawnFn });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('codex', {
        command: 'codex',
      }),
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.providerName).toBe('runtime:codex');
    expect(resolved?.providerKind).toBe('codex');
    if (!resolved) throw new Error('expected codex runtime adapter');

    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'You are Codex',
      messages: [{ role: 'user', content: 'Review the diff.' }],
    })) {
      chunks.push(chunk);
    }

    expect(spawnFn).toHaveBeenCalledWith(
      'codex',
      [],
      expect.objectContaining({
        shell: true,
        windowsHide: true,
      }),
    );
    expect(chunks).toEqual([
      { delta: 'codex adapter reply' },
      {
        done: true,
        usage: {
          promptTokens: expect.any(Number),
          completionTokens: expect.any(Number),
        },
      },
    ]);
  });

  it('treats cursor-style endpoint profiles as execution-backed HTTP adapters when configured', async () => {
    const fetchFn: typeof fetch = vi.fn(async (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      const payload = JSON.parse(body);
      expect(payload.runtimeKind).toBe('cursor');
      return new Response(
        JSON.stringify({
          text: 'cursor endpoint reply',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    const adapters = createExternalRuntimeAdapters({ fetchFn });
    const resolved = adapters.createResolvedProvider({
      employee: makeEmployee(),
      profile: makeProfile('cursor', {
        endpointUrl: 'http://127.0.0.1:8787/cursor',
      }),
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.providerName).toBe('runtime:cursor');
    expect(resolved?.providerKind).toBe('cursor');
    if (!resolved) throw new Error('expected cursor runtime adapter');

    const chunks = [];
    for await (const chunk of resolved.stream({
      system: 'You are Cursor',
      messages: [{ role: 'user', content: 'Plan the refactor.' }],
    })) {
      chunks.push(chunk);
    }

    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/cursor',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(chunks).toEqual([
      { delta: 'cursor endpoint reply' },
      {
        done: true,
        usage: {
          promptTokens: expect.any(Number),
          completionTokens: expect.any(Number),
        },
      },
    ]);
  });
});
