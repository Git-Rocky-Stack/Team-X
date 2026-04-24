import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process';

import type { ProviderStreamFn, StreamMessage, StreamUsage } from '@team-x/provider-router';
import type { RuntimeProfile } from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';

type FetchLike = typeof fetch;

interface SpawnedProcess {
  stdin: NodeJS.WritableStream | null;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  once(event: 'error', listener: (error: Error) => void): this;
  once(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

type SpawnLike = (
  command: string,
  args?: readonly string[],
  options?: SpawnOptionsWithoutStdio,
) => SpawnedProcess;

export interface ExternalRuntimeResolvedProvider {
  providerName: string;
  providerKind: string;
  model: string;
  stream: ProviderStreamFn;
}

export interface ExternalRuntimeAdapters {
  createResolvedProvider(input: {
    employee: EmployeeRow;
    profile: RuntimeProfile;
  }): ExternalRuntimeResolvedProvider | null;
}

export interface ExternalRuntimeAdaptersDeps {
  fetchFn?: FetchLike;
  spawnFn?: SpawnLike;
}

interface RuntimeInvocationPayload {
  version: 'team-x-runtime-v1';
  runtimeProfileId: string;
  runtimeKind: RuntimeProfile['kind'];
  runtimeName: string;
  employee: {
    id: string;
    companyId: string;
    name: string;
    title: string;
  };
  system: string;
  messages: StreamMessage[];
  prompt: string;
  maxSteps: number;
  toolNames: string[];
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function buildPrompt(system: string, messages: StreamMessage[]): string {
  const history = messages
    .map((message) => `${message.role.toUpperCase()}\n${message.content}`)
    .join('\n\n');
  return `SYSTEM\n${system}\n\nMESSAGES\n${history}`.trim();
}

function buildInvocationPayload(args: {
  employee: EmployeeRow;
  profile: RuntimeProfile;
  system: string;
  messages: StreamMessage[];
  maxSteps: number;
  tools?: Record<string, unknown>;
}): RuntimeInvocationPayload {
  return {
    version: 'team-x-runtime-v1',
    runtimeProfileId: args.profile.id,
    runtimeKind: args.profile.kind,
    runtimeName: args.profile.name,
    employee: {
      id: args.employee.id,
      companyId: args.employee.companyId,
      name: args.employee.name,
      title: args.employee.title,
    },
    system: args.system,
    messages: args.messages,
    prompt: buildPrompt(args.system, args.messages),
    maxSteps: args.maxSteps,
    toolNames: Object.keys(args.tools ?? {}),
  };
}

function extractTextFromJson(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['text', 'message', 'content', 'response']) {
    const candidate = extractTextFromJson(record[key]);
    if (candidate) return candidate;
  }
  if (Array.isArray(record.choices)) {
    for (const choice of record.choices) {
      const candidate = extractTextFromJson(choice);
      if (candidate) return candidate;
    }
  }
  if (Array.isArray(record.messages)) {
    for (const message of record.messages) {
      const candidate = extractTextFromJson(message);
      if (candidate) return candidate;
    }
  }
  return null;
}

function extractUsageFromJson(value: unknown): StreamUsage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const usage = record.usage;
  if (!usage || typeof usage !== 'object') return null;
  const usageRecord = usage as Record<string, unknown>;
  const promptTokens = usageRecord.promptTokens;
  const completionTokens = usageRecord.completionTokens;
  if (typeof promptTokens !== 'number' || typeof completionTokens !== 'number') return null;
  return {
    promptTokens,
    completionTokens,
  };
}

function parseRuntimeResponse(
  raw: string,
  promptText: string,
): { text: string; usage: StreamUsage } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('[external-runtime] runtime returned no assistant text');
  }

  try {
    const parsed = JSON.parse(trimmed);
    const text = extractTextFromJson(parsed);
    if (!text) {
      throw new Error('[external-runtime] runtime response JSON did not contain assistant text');
    }
    return {
      text,
      usage: extractUsageFromJson(parsed) ?? {
        promptTokens: estimateTokens(promptText),
        completionTokens: estimateTokens(text),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[external-runtime]')) {
      throw error;
    }
    return {
      text: trimmed,
      usage: {
        promptTokens: estimateTokens(promptText),
        completionTokens: estimateTokens(trimmed),
      },
    };
  }
}

async function runCommandInvocation(args: {
  command: string;
  workingDirectory: string | null;
  payload: RuntimeInvocationPayload;
  signal?: AbortSignal;
  spawnFn: SpawnLike;
}): Promise<string> {
  if (args.signal?.aborted) {
    throw createAbortError();
  }

  const child = args.spawnFn(args.command, [], {
    cwd: args.workingDirectory ?? undefined,
    shell: true,
    windowsHide: true,
  });

  return new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const cleanup = () => {
      args.signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      child.kill();
      cleanup();
      reject(createAbortError());
    };

    args.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      cleanup();
      if (args.signal?.aborted) {
        reject(createAbortError());
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim().length > 0
              ? stderr.trim()
              : `[external-runtime] command exited with code ${code ?? 'unknown'}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });

    child.stdin?.write(JSON.stringify(args.payload));
    child.stdin?.end();
  });
}

function createBashStream(args: {
  command: string;
  workingDirectory: string | null;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  spawnFn: SpawnLike;
}): ProviderStreamFn {
  return async function* (input) {
    const payload = buildInvocationPayload({
      employee: args.employee,
      profile: args.profile,
      system: input.system,
      messages: input.messages,
      maxSteps: input.maxSteps ?? 1,
      tools: input.tools,
    });
    const stdout = await runCommandInvocation({
      command: args.command,
      workingDirectory: args.workingDirectory,
      payload,
      signal: input.signal,
      spawnFn: args.spawnFn,
    });
    const result = parseRuntimeResponse(stdout, payload.prompt);
    yield { delta: result.text };
    yield { done: true, usage: result.usage };
  };
}

function createCommandResolvedProvider(args: {
  command: string;
  workingDirectory: string | null;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  spawnFn: SpawnLike;
}): ExternalRuntimeResolvedProvider {
  return {
    providerName: `runtime:${args.profile.kind}`,
    providerKind: args.profile.kind,
    model: args.profile.slug,
    stream: createBashStream({
      command: args.command,
      workingDirectory: args.workingDirectory,
      employee: args.employee,
      profile: args.profile,
      spawnFn: args.spawnFn,
    }),
  };
}

function createHttpStream(args: {
  baseUrl: string;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  fetchFn: FetchLike;
}): ProviderStreamFn {
  return async function* (input) {
    const payload = buildInvocationPayload({
      employee: args.employee,
      profile: args.profile,
      system: input.system,
      messages: input.messages,
      maxSteps: input.maxSteps ?? 1,
      tools: input.tools,
    });
    const response = await args.fetchFn(args.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-team-x-runtime': payload.version,
      },
      body: JSON.stringify(payload),
      signal: input.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        body.trim().length > 0
          ? body.trim()
          : `[external-runtime] HTTP adapter returned ${response.status}`,
      );
    }
    const body = await response.text();
    const result = parseRuntimeResponse(body, payload.prompt);
    yield { delta: result.text };
    yield { done: true, usage: result.usage };
  };
}

function createHttpResolvedProvider(args: {
  baseUrl: string;
  employee: EmployeeRow;
  profile: RuntimeProfile;
  fetchFn: FetchLike;
}): ExternalRuntimeResolvedProvider {
  return {
    providerName: `runtime:${args.profile.kind}`,
    providerKind: args.profile.kind,
    model: args.profile.slug,
    stream: createHttpStream({
      baseUrl: args.baseUrl,
      employee: args.employee,
      profile: args.profile,
      fetchFn: args.fetchFn,
    }),
  };
}

function getOptionalString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createExternalRuntimeAdapters(
  deps: ExternalRuntimeAdaptersDeps = {},
): ExternalRuntimeAdapters {
  const fetchFn = deps.fetchFn ?? fetch;
  const spawnFn = deps.spawnFn ?? spawn;

  return {
    createResolvedProvider(input) {
      if (!input.profile.enabled) return null;
      const command = getOptionalString(input.profile.config, 'command');
      const workingDirectory = getOptionalString(input.profile.config, 'workingDirectory');
      const baseUrl = getOptionalString(input.profile.config, 'baseUrl');
      const endpointUrl = getOptionalString(input.profile.config, 'endpointUrl');

      switch (input.profile.kind) {
        case 'bash':
          if (!command) return null;
          return createCommandResolvedProvider({
            command,
            workingDirectory,
            employee: input.employee,
            profile: input.profile,
            spawnFn,
          });
        case 'http':
          if (!baseUrl) return null;
          return createHttpResolvedProvider({
            baseUrl,
            employee: input.employee,
            profile: input.profile,
            fetchFn,
          });
        case 'codex':
        case 'claude-code':
        case 'cursor':
          if (command) {
            return createCommandResolvedProvider({
              command,
              workingDirectory,
              employee: input.employee,
              profile: input.profile,
              spawnFn,
            });
          }
          if (endpointUrl) {
            return createHttpResolvedProvider({
              baseUrl: endpointUrl,
              employee: input.employee,
              profile: input.profile,
              fetchFn,
            });
          }
          return null;
        default:
          return null;
      }
    },
  };
}
