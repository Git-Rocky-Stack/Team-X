/**
 * Unit tests for `mcp-security.ts` — the C5 fix (audit 2026-05-07).
 *
 * Coverage:
 *   1. `scrubEnv` — no implicit secret pass-through.
 *   2. `resolveCwd` — correct path + path-traversal defense on serverId.
 *   3. `ensureCwdExists` — idempotent.
 *   4. `loadAllowlistFile` — auto-creates empty + parses real entries.
 *   5. `validateExecutable` — every reject path: empty, bare-name,
 *      empty allowlist, not-in-allowlist, file-missing, sha256-mismatch.
 *   6. `validateExecutable` — happy path with and without sha256.
 *   7. `isInside` — parent / child relationship for path-traversal sanity.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PROCESS_ENV_PASSTHROUGH,
  type McpExecutableAllowlist,
  computeFileSha256,
  createFileAllowlist,
  defaultAllowlistPath,
  ensureCwdExists,
  isInside,
  loadAllowlistFile,
  resolveCwd,
  scrubEnv,
  validateExecutable,
} from './mcp-security.js';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mcp-security-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// scrubEnv
// ---------------------------------------------------------------------------

describe('scrubEnv (C5)', () => {
  it('passes through ONLY allowlisted process.env keys, never secrets', () => {
    const fakeProcessEnv = {
      PATH: '/usr/bin',
      Path: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      HOME: '/home/rocky',
      // Hostile / sensitive values that MUST NOT leak into the child:
      OPENAI_API_KEY: 'sk-secret',
      AWS_ACCESS_KEY_ID: 'AKIA...',
      ANTHROPIC_API_KEY: 'ant-secret',
      SSH_AUTH_SOCK: '/tmp/ssh-agent.sock',
      KEYCHAIN_PASSWORD: 'hunter2',
      MY_RANDOM_VAR: 'whatever',
    } satisfies NodeJS.ProcessEnv;

    const out = scrubEnv(undefined, fakeProcessEnv);
    expect(out.PATH).toBe('/usr/bin');
    expect(out.Path).toBe('C:\\Windows\\System32');
    expect(out.SystemRoot).toBe('C:\\Windows');
    expect(out.HOME).toBe('/home/rocky');
    // None of the secret-like keys should appear:
    expect(out).not.toHaveProperty('OPENAI_API_KEY');
    expect(out).not.toHaveProperty('AWS_ACCESS_KEY_ID');
    expect(out).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(out).not.toHaveProperty('SSH_AUTH_SOCK');
    expect(out).not.toHaveProperty('KEYCHAIN_PASSWORD');
    expect(out).not.toHaveProperty('MY_RANDOM_VAR');
  });

  it('treats user-supplied env as explicit and merges it on top', () => {
    const out = scrubEnv(
      { CUSTOM_FLAG: '1', NODE_ENV: 'production' },
      { PATH: '/usr/bin', OPENAI_API_KEY: 'sk-leak' },
    );
    expect(out.PATH).toBe('/usr/bin');
    expect(out.CUSTOM_FLAG).toBe('1');
    expect(out.NODE_ENV).toBe('production');
    // process.env secrets are still filtered.
    expect(out).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('skips user env entries with non-string values (defensive)', () => {
    // Objects in JSON shouldn't reach here, but guard.
    const out = scrubEnv(
      { GOOD: 'yes', BAD: undefined as unknown as string },
      { PATH: '/usr/bin' },
    );
    expect(out.GOOD).toBe('yes');
    expect(out).not.toHaveProperty('BAD');
  });

  it('produces a fresh object each call (no shared state)', () => {
    const a = scrubEnv(undefined, { PATH: '/a' });
    const b = scrubEnv(undefined, { PATH: '/b' });
    expect(a).not.toBe(b);
    a.PATH = '/mutated';
    expect(b.PATH).toBe('/b');
  });

  it('exposes a stable allowlist for callers that want to display it', () => {
    expect(DEFAULT_PROCESS_ENV_PASSTHROUGH).toContain('PATH');
    expect(DEFAULT_PROCESS_ENV_PASSTHROUGH).toContain('Path');
    expect(DEFAULT_PROCESS_ENV_PASSTHROUGH).toContain('SystemRoot');
    expect(DEFAULT_PROCESS_ENV_PASSTHROUGH).toContain('HOME');
    // No keys that look like secrets.
    expect(
      DEFAULT_PROCESS_ENV_PASSTHROUGH.find((k) => /TOKEN|SECRET|KEY/i.test(k)),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveCwd / ensureCwdExists
// ---------------------------------------------------------------------------

describe('resolveCwd + ensureCwdExists (C5)', () => {
  it('resolves to <userData>/mcp-runtimes/<serverId>', () => {
    const cwd = resolveCwd(tmpRoot, 'srv-abc');
    expect(cwd).toBe(join(tmpRoot, 'mcp-runtimes', 'srv-abc'));
  });

  it('creates the runtime directory idempotently', () => {
    const cwd = resolveCwd(tmpRoot, 'srv-1');
    ensureCwdExists(cwd);
    expect(existsSync(cwd)).toBe(true);
    // Second call must not throw.
    expect(() => ensureCwdExists(cwd)).not.toThrow();
  });

  it('rejects empty userDataDir / serverId', () => {
    expect(() => resolveCwd('', 'srv')).toThrow(/userDataDir/);
    expect(() => resolveCwd(tmpRoot, '')).toThrow(/serverId/);
  });

  it('rejects path-traversal attempts in serverId', () => {
    expect(() => resolveCwd(tmpRoot, '../etc/passwd')).toThrow(/illegal path/);
    expect(() => resolveCwd(tmpRoot, 'srv/../escape')).toThrow(/illegal path/);
    expect(() => resolveCwd(tmpRoot, 'srv\\escape')).toThrow(/illegal path/);
  });
});

// ---------------------------------------------------------------------------
// Allowlist file I/O
// ---------------------------------------------------------------------------

describe('loadAllowlistFile / createFileAllowlist (C5)', () => {
  it('auto-creates an empty fail-closed allowlist on first run', () => {
    const path = defaultAllowlistPath(tmpRoot);
    expect(existsSync(path)).toBe(false);
    const file = loadAllowlistFile(path);
    expect(file.version).toBe(1);
    expect(file.entries).toEqual([]);
    expect(existsSync(path)).toBe(true);
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(onDisk).toEqual({ version: 1, entries: [] });
  });

  it('loads valid entries from a populated allowlist', () => {
    const path = defaultAllowlistPath(tmpRoot);
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        entries: [
          {
            command: '/usr/bin/node',
            sha256: 'abc123',
            label: 'node',
            addedAt: 1700000000000,
            addedBy: 'rocky',
          },
        ],
      }),
      'utf8',
    );
    const file = loadAllowlistFile(path);
    expect(file.entries).toHaveLength(1);
    expect(file.entries[0]).toEqual({
      command: '/usr/bin/node',
      sha256: 'abc123',
      label: 'node',
      addedAt: 1700000000000,
      addedBy: 'rocky',
    });
  });

  it('throws on malformed JSON', () => {
    const path = defaultAllowlistPath(tmpRoot);
    writeFileSync(path, '{ this is not json }', 'utf8');
    expect(() => loadAllowlistFile(path)).toThrow(/not valid JSON/);
  });

  it('throws on unsupported version', () => {
    const path = defaultAllowlistPath(tmpRoot);
    writeFileSync(path, JSON.stringify({ version: 99, entries: [] }), 'utf8');
    expect(() => loadAllowlistFile(path)).toThrow(/unsupported version/);
  });

  it('throws when entries is not an array', () => {
    const path = defaultAllowlistPath(tmpRoot);
    writeFileSync(path, JSON.stringify({ version: 1, entries: 'oops' }), 'utf8');
    expect(() => loadAllowlistFile(path)).toThrow(/entries array/);
  });

  it('throws when an entry is missing command', () => {
    const path = defaultAllowlistPath(tmpRoot);
    writeFileSync(path, JSON.stringify({ version: 1, entries: [{ label: 'no-cmd' }] }), 'utf8');
    expect(() => loadAllowlistFile(path)).toThrow(/missing string command/);
  });

  it('createFileAllowlist re-reads on every entries() call', () => {
    const path = defaultAllowlistPath(tmpRoot);
    writeFileSync(path, JSON.stringify({ version: 1, entries: [] }), 'utf8');
    const allowlist = createFileAllowlist(path);
    expect(allowlist.entries()).toHaveLength(0);
    writeFileSync(
      path,
      JSON.stringify({ version: 1, entries: [{ command: '/usr/bin/node' }] }),
      'utf8',
    );
    expect(allowlist.entries()).toHaveLength(1);
    expect(allowlist.entries()[0]?.command).toBe('/usr/bin/node');
  });
});

// ---------------------------------------------------------------------------
// validateExecutable
// ---------------------------------------------------------------------------

describe('validateExecutable (C5)', () => {
  function staticAllowlist(
    entries: McpExecutableAllowlist['entries'] extends () => infer T ? T : never,
  ): McpExecutableAllowlist {
    return { entries: () => entries };
  }

  it('rejects an empty command', () => {
    const out = validateExecutable('', staticAllowlist([{ command: '/usr/bin/node' }]));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('empty-command');
      expect(out.message).toMatch(/Empty MCP command/);
    }
  });

  it('rejects bare names like "node" or "npx" — PATH lookup is attacker-controlled', () => {
    const out = validateExecutable('node', staticAllowlist([{ command: '/usr/bin/node' }]));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('bare-name-not-absolute');
      expect(out.message).toMatch(/absolute path/);
      expect(out.message).toMatch(/PATH lookup is attacker-controlled/);
    }
  });

  it('rejects when the allowlist is empty (fail-closed)', () => {
    const absolute = process.platform === 'win32' ? 'C:\\bin\\node.exe' : '/usr/bin/node';
    const out = validateExecutable(absolute, staticAllowlist([]));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('allowlist-empty');
      expect(out.message).toMatch(/allowlist is empty/);
    }
  });

  it('rejects an absolute path not in the allowlist', () => {
    const allowed = process.platform === 'win32' ? 'C:\\bin\\node.exe' : '/usr/bin/node';
    const attempted = process.platform === 'win32' ? 'C:\\bin\\evil.exe' : '/usr/bin/evil';
    const out = validateExecutable(attempted, staticAllowlist([{ command: allowed }]));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('not-in-allowlist');
      expect(out.message).toMatch(/not in the allowlist/);
    }
  });

  it('rejects when the allowlisted path does not exist on disk', () => {
    const phantom = process.platform === 'win32' ? 'C:\\does\\not\\exist.exe' : '/does/not/exist';
    const out = validateExecutable(phantom, staticAllowlist([{ command: phantom }]), {
      // Force the missing-file branch deterministically.
      statSync: () => {
        throw new Error('ENOENT');
      },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('file-missing');
    }
  });

  it('accepts an allowlisted path with no sha256 pin', () => {
    // Use a real file we know exists — write a fixture binary.
    const fixturePath = join(tmpRoot, 'fake-mcp-binary');
    writeFileSync(fixturePath, '#!/bin/sh\necho ok\n', 'utf8');
    const out = validateExecutable(fixturePath, staticAllowlist([{ command: fixturePath }]));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.resolvedPath).toBe(fixturePath);
  });

  it('accepts when the pinned sha256 matches the on-disk file', () => {
    const fixturePath = join(tmpRoot, 'fake-mcp-binary-2');
    const content = 'fake mcp server contents v1\n';
    writeFileSync(fixturePath, content, 'utf8');
    const sha = computeFileSha256(fixturePath);
    const out = validateExecutable(
      fixturePath,
      staticAllowlist([{ command: fixturePath, sha256: sha }]),
    );
    expect(out.ok).toBe(true);
  });

  it('rejects when the pinned sha256 does NOT match the on-disk file', () => {
    const fixturePath = join(tmpRoot, 'fake-mcp-binary-3');
    writeFileSync(fixturePath, 'real bytes', 'utf8');
    const out = validateExecutable(
      fixturePath,
      staticAllowlist([{ command: fixturePath, sha256: 'deadbeef'.repeat(8) }]),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('sha256-mismatch');
      expect(out.message).toMatch(/sha256/);
    }
  });
});

// ---------------------------------------------------------------------------
// isInside
// ---------------------------------------------------------------------------

describe('isInside (C5)', () => {
  it('detects a child path nested under a parent', () => {
    const parent = tmpRoot;
    const child = join(tmpRoot, 'sub', 'leaf');
    expect(isInside(parent, child)).toBe(true);
  });

  it('detects when a path is not under the parent', () => {
    expect(isInside(tmpRoot, '/somewhere/else')).toBe(false);
  });

  it('detects path-traversal escape attempts', () => {
    const parent = join(tmpRoot, 'parent');
    const attempt = join(tmpRoot, 'parent', '..', 'sibling');
    expect(isInside(parent, attempt)).toBe(false);
  });
});
