import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import type { ToolSpec } from '@team-x/provider-router';

import { resolveRuntimeWorkspacePaths } from '../services/runtime-workspace-service.js';

const execFileAsync = promisify(execFile);

export interface ExecutionToolDeps {
  userDataDir: string;
  companySlug: string;
  employeeId: string;
  workspaceRoot?: string | null;
}

// ---------------------------------------------------------------------------
// Path safety — every filesystem operation is sandboxed to the employee's
// workspace.  Traversal outside the workspace is rejected.
// ---------------------------------------------------------------------------

function resolveWorkspacePath(
  requestedPath: string,
  workspaceRoot: string,
): { safePath: string; relativePath: string } {
  const absolute = resolve(workspaceRoot, requestedPath);
  const rel = relative(workspaceRoot, absolute);

  if (rel.startsWith('..') || rel === '..') {
    throw new Error(`Path traversal blocked: '${requestedPath}' resolves outside the workspace.`);
  }
  return { safePath: absolute, relativePath: rel };
}

function getWorkspaceRoot(deps: ExecutionToolDeps): string {
  if (typeof deps.workspaceRoot === 'string' && deps.workspaceRoot.trim().length > 0) {
    return resolve(deps.workspaceRoot.trim());
  }

  const paths = resolveRuntimeWorkspacePaths({
    userDataDir: deps.userDataDir,
    companySlug: deps.companySlug,
    employeeId: deps.employeeId,
    runtimeKind: 'teamx-internal',
  });
  return paths.workspace;
}

async function ensureWorkspace(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
}

// ---------------------------------------------------------------------------
// filesystem — read, write, list, search, delete
// ---------------------------------------------------------------------------

interface FilesystemArgs {
  operation: 'read' | 'write' | 'list' | 'delete' | 'search';
  path: string;
  content?: string;
  pattern?: string;
}

function buildFilesystemTool(deps: ExecutionToolDeps): ToolSpec {
  return {
    name: 'filesystem',
    description:
      'Read, write, list, delete, or search files within your workspace. ' +
      'Operations: read (returns content), write (creates/overwrites), ' +
      'list (returns directory entries), delete (removes file or empty dir), ' +
      'search (recursive filename search by glob pattern).',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['read', 'write', 'list', 'delete', 'search'],
          description: 'The filesystem operation to perform.',
        },
        path: {
          type: 'string',
          description: 'Relative path within your workspace.',
        },
        content: {
          type: 'string',
          description: 'Content to write (required for write operation).',
        },
        pattern: {
          type: 'string',
          description: 'Search pattern, e.g. "*.ts" or "README*" (required for search operation).',
        },
      },
      required: ['operation', 'path'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as FilesystemArgs;
      const workspaceRoot = getWorkspaceRoot(deps);
      await ensureWorkspace(workspaceRoot);

      const { safePath } = resolveWorkspacePath(args.path, workspaceRoot);

      switch (args.operation) {
        case 'read': {
          try {
            const content = await readFile(safePath, 'utf-8');
            return { success: true, content };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        case 'write': {
          if (args.content === undefined) {
            return { success: false, error: 'Missing "content" for write operation.' };
          }
          try {
            await mkdir(dirname(safePath), { recursive: true });
            await writeFile(safePath, args.content, 'utf-8');
            return { success: true, path: args.path };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        case 'list': {
          try {
            const entries = await readdir(safePath, { withFileTypes: true });
            return {
              success: true,
              entries: entries.map((e) => ({
                name: e.name,
                type: e.isDirectory() ? 'directory' : 'file',
              })),
            };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        case 'delete': {
          try {
            const s = await stat(safePath);
            if (s.isDirectory()) {
              await rm(safePath, { recursive: false });
            } else {
              await rm(safePath);
            }
            return { success: true, path: args.path };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        case 'search': {
          if (!args.pattern) {
            return { success: false, error: 'Missing "pattern" for search operation.' };
          }
          try {
            const results = await searchFiles(workspaceRoot, safePath, args.pattern);
            return { success: true, matches: results };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        default:
          return { success: false, error: `Unknown operation: ${args.operation}` };
      }
    }) as ToolSpec['execute'],
  };
}

async function searchFiles(
  workspaceRoot: string,
  searchRoot: string,
  pattern: string,
): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(searchRoot, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(searchRoot, entry.name);
    const rel = relative(workspaceRoot, fullPath);

    if (entry.isDirectory()) {
      results.push(...(await searchFiles(workspaceRoot, fullPath, pattern)));
    } else if (entry.isFile()) {
      // Simple glob-like matching
      if (matchGlob(entry.name, pattern)) {
        results.push(rel);
      }
    }
  }
  return results;
}

function matchGlob(filename: string, pattern: string): boolean {
  const regex = new RegExp(
    `^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    'i',
  );
  return regex.test(filename);
}

// ---------------------------------------------------------------------------
// shell — execute commands within the workspace
// ---------------------------------------------------------------------------

interface ShellArgs {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}

function buildShellTool(deps: ExecutionToolDeps): ToolSpec {
  return {
    name: 'shell',
    description:
      'Execute a shell command within your workspace. Returns stdout, stderr, ' +
      'and exit code. Use this to run tests, build, install dependencies, ' +
      'or invoke build scripts. Commands run inside your isolated workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute (e.g. "npm", "git", "python").',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command arguments.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory relative to your workspace.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Max execution time in milliseconds (default 30000).',
        },
      },
      required: ['command'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as ShellArgs;
      const workspaceRoot = getWorkspaceRoot(deps);
      await ensureWorkspace(workspaceRoot);

      const cwd = args.cwd ? resolveWorkspacePath(args.cwd, workspaceRoot).safePath : workspaceRoot;

      const timeout = args.timeoutMs ?? 30_000;

      try {
        const { stdout, stderr } = await execFileAsync(args.command, args.args ?? [], {
          cwd,
          timeout,
          shell: false,
          windowsHide: true,
        });
        return {
          success: true,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 10_000),
          exitCode: 0,
        };
      } catch (err) {
        if (err && typeof err === 'object' && 'stdout' in err) {
          const execErr = err as { stdout: string; stderr: string; code: number | null };
          return {
            success: false,
            stdout: execErr.stdout.slice(0, 50_000),
            stderr: execErr.stderr.slice(0, 10_000),
            exitCode: execErr.code ?? 1,
            error: `Command exited with code ${execErr.code ?? 1}`,
          };
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }) as ToolSpec['execute'],
  };
}

// ---------------------------------------------------------------------------
// git — run git commands within the workspace
// ---------------------------------------------------------------------------

interface GitArgs {
  subcommand: string;
  args?: string[];
  cwd?: string;
}

function buildGitTool(deps: ExecutionToolDeps): ToolSpec {
  return {
    name: 'git',
    description:
      'Run git commands within your workspace. Common subcommands: status, log, ' +
      'diff, branch, checkout, commit, push, pull, clone, init. ' +
      'Returns stdout/stderr from git.',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: {
          type: 'string',
          description: 'The git subcommand (e.g. "status", "commit", "push").',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional arguments for the subcommand.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory relative to your workspace.',
        },
      },
      required: ['subcommand'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as GitArgs;
      const workspaceRoot = getWorkspaceRoot(deps);
      await ensureWorkspace(workspaceRoot);

      const cwd = args.cwd ? resolveWorkspacePath(args.cwd, workspaceRoot).safePath : workspaceRoot;

      try {
        const { stdout, stderr } = await execFileAsync(
          'git',
          [args.subcommand, ...(args.args ?? [])],
          {
            cwd,
            timeout: 30_000,
            shell: false,
            windowsHide: true,
          },
        );
        return {
          success: true,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 10_000),
          exitCode: 0,
        };
      } catch (err) {
        if (err && typeof err === 'object' && 'stdout' in err) {
          const execErr = err as { stdout: string; stderr: string; code: number | null };
          return {
            success: false,
            stdout: execErr.stdout.slice(0, 50_000),
            stderr: execErr.stderr.slice(0, 10_000),
            exitCode: execErr.code ?? 1,
            error: `git exited with code ${execErr.code ?? 1}`,
          };
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }) as ToolSpec['execute'],
  };
}

// ---------------------------------------------------------------------------
// browse — fetch web pages
// ---------------------------------------------------------------------------

interface BrowseArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

function buildBrowseTool(): ToolSpec {
  return {
    name: 'browse',
    description:
      'Fetch a web page or API endpoint. Returns status, headers, and body text. ' +
      'Use this to read documentation, check APIs, or research solutions. ' +
      'Max response size: 500 KB.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch.',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method (default GET).',
        },
        headers: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Optional request headers.',
        },
        body: {
          type: 'string',
          description: 'Request body (for POST/PUT).',
        },
      },
      required: ['url'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as BrowseArgs;
      const maxSize = 500_000;

      try {
        const response = await fetch(args.url, {
          method: args.method ?? 'GET',
          headers: args.headers,
          body: args.body,
          redirect: 'follow',
        });

        const contentType = response.headers.get('content-type') ?? '';
        let bodyText: string;

        if (contentType.includes('application/json')) {
          const json = await response.json();
          bodyText = JSON.stringify(json, null, 2);
        } else {
          bodyText = await response.text();
        }

        if (bodyText.length > maxSize) {
          bodyText = `${bodyText.slice(0, maxSize)}\n... [truncated]`;
        }

        return {
          success: true,
          status: response.status,
          statusText: response.statusText,
          contentType,
          body: bodyText,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }) as ToolSpec['execute'],
  };
}

// ---------------------------------------------------------------------------
// Composer — build all execution tools for an employee
// ---------------------------------------------------------------------------

export function buildExecutionTools(deps: ExecutionToolDeps): ToolSpec[] {
  return [buildFilesystemTool(deps), buildShellTool(deps), buildGitTool(deps), buildBrowseTool()];
}
