/**
 * McpSecurity — child-process trust-boundary helpers for the MCP Host.
 *
 * Implements the C5 fix from audit 2026-05-07:
 *
 * > `StdioClientTransport` is created without scrubbing the parent env. A
 * > misconfigured or hostile MCP server inherits every secret in
 * > `process.env` (API keys, OS user paths, SSH agent socket). No command
 * > whitelist, no `cwd` lock, no shell-escape audit on `args`.
 *
 * This module exposes pure helpers that `mcp-host.ts` calls before
 * spawning a stdio transport:
 *
 *   - `scrubEnv(rawEnv?)` — start from a tiny allowlist of process.env
 *     keys (PATH, SystemRoot, etc.) and merge any user-supplied env.
 *     The child process never inherits process.env wholesale.
 *
 *   - `resolveCwd(userDataDir, serverId)` — returns the per-server
 *     pinned cwd path under `<userData>/mcp-runtimes/<serverId>/`.
 *
 *   - `ensureCwdExists(cwd)` — idempotent mkdir -p.
 *
 *   - `validateExecutable(command, allowlist, opts?)` — rejects any
 *     command not in the hash-pinned allowlist. Bare names (without an
 *     absolute path) are refused outright; allowing them would let a
 *     PATH-poisoning attacker swap in a hostile binary.
 *
 *   - `loadAllowlistFile(path)` / `defaultAllowlistPath(userDataDir)` —
 *     load the operator-managed JSON allowlist. Auto-creates an empty
 *     fail-closed file on first run.
 *
 *   - `computeFileSha256(path)` — used by callers that want to verify a
 *     specific binary against a pinned hash.
 *
 * The module is filesystem-aware but otherwise pure. No Electron, no
 * SDK, no DB. Vitest can exercise every path with sql.js + in-memory tmp.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize, resolve as resolvePath, sep } from 'node:path';

// ---------------------------------------------------------------------------
// Env scrubbing
// ---------------------------------------------------------------------------

/**
 * Process.env keys that are safe to pass through to MCP child processes
 * by default. Without these, many runtimes (node, python, npx, uvx)
 * either fail to find their executables or fail to find their cache
 * directories. With them, an MCP server can run normally.
 *
 * Notably ABSENT: anything that smells like a secret. The threat the
 * audit called out is exactly this — a hostile MCP server inheriting
 * `AWS_ACCESS_KEY_ID`, `OPENAI_API_KEY`, `SSH_AUTH_SOCK`, etc.
 *
 * Platform notes:
 *   - Windows uses `Path` (mixed case) and also has `SystemRoot`,
 *     `SystemDrive`, `ComSpec`, `windir`. Without `SystemRoot`,
 *     spawning anything in a subprocess fails with `ENOENT`.
 *   - POSIX uses `PATH` (upper case). `LANG` / `LC_ALL` / `HOME`
 *     keep tools from defaulting to C locale and from writing user
 *     config to weird places.
 */
export const DEFAULT_PROCESS_ENV_PASSTHROUGH = Object.freeze([
  // PATH on every platform — MCP servers need to launch their
  // language runtime (`node`, `python3`, `uv`, `npx`) and that runtime
  // needs PATH to find further dependencies.
  'PATH',
  'Path',
  // Windows minimum-survival set. Spawning without SystemRoot fails.
  'SystemRoot',
  'SystemDrive',
  'ComSpec',
  'windir',
  // POSIX user/locale set. Without these, tools write config to `/`
  // and emit ASCII-only output that breaks JSON-RPC framing.
  'HOME',
  'USER',
  'USERNAME',
  'USERPROFILE',
  'LANG',
  'LC_ALL',
  // Temp dir keys — required by many tools to write transient state.
  'TEMP',
  'TMP',
  'TMPDIR',
] as const);

/**
 * Build the env passed to a spawned MCP child process.
 *
 * Strategy:
 *   1. Start from `process.env`, but copy ONLY the
 *      `DEFAULT_PROCESS_ENV_PASSTHROUGH` keys. This is the C5 fix —
 *      previously the SDK defaulted to `process.env` wholesale.
 *   2. Merge in user-provided `rawEnv` last. Explicit user choices
 *      win — the operator who edited the MCP config knows what they
 *      configured. We do NOT scrub user-provided keys.
 *
 * Returns a fresh object — callers can mutate without affecting
 * subsequent calls.
 */
export function scrubEnv(
  rawEnv?: Record<string, string> | null,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of DEFAULT_PROCESS_ENV_PASSTHROUGH) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) {
      out[key] = value;
    }
  }
  if (rawEnv) {
    for (const [key, value] of Object.entries(rawEnv)) {
      // Skip any user entries that resolve to undefined / non-string —
      // the StdioClientTransport rejects undefined values.
      if (typeof value !== 'string') continue;
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CWD pinning
// ---------------------------------------------------------------------------

/**
 * Per-server cwd path. Each MCP server gets its own subdirectory under
 * `<userData>/mcp-runtimes/<serverId>/`, isolating its scratch files
 * from the rest of the user data.
 *
 * Defends against MCP servers that write transient state (cache, lock
 * files, command history) to the spawning process's cwd. Without this
 * the cwd is wherever Electron started from, which on Windows is
 * frequently the user's profile root.
 */
export function resolveCwd(userDataDir: string, serverId: string): string {
  if (typeof userDataDir !== 'string' || userDataDir.length === 0) {
    throw new Error('[mcp-security] userDataDir must be a non-empty string');
  }
  if (typeof serverId !== 'string' || serverId.length === 0) {
    throw new Error('[mcp-security] serverId must be a non-empty string');
  }
  // Defang any attempt to escape the runtimes root via a malicious
  // serverId. Production serverIds are nanoids, but defense-in-depth.
  if (serverId.includes('..') || serverId.includes('/') || serverId.includes('\\')) {
    throw new Error(`[mcp-security] serverId contains illegal path characters: ${serverId}`);
  }
  return join(userDataDir, 'mcp-runtimes', serverId);
}

/**
 * Idempotent mkdir for the per-server cwd. Safe to call on every
 * connect — the underlying syscall is a no-op when the directory
 * already exists.
 */
export function ensureCwdExists(cwd: string): void {
  mkdirSync(cwd, { recursive: true });
}

// ---------------------------------------------------------------------------
// Executable allowlist
// ---------------------------------------------------------------------------

/**
 * One entry in the operator-managed MCP executable allowlist. Operators
 * edit `<userData>/team-x/mcp-allowlist.json` to grant Team-X
 * permission to spawn a specific binary. Empty allowlist = no MCP
 * server can connect (fail-closed).
 */
export interface McpExecutableAllowlistEntry {
  /**
   * Absolute path to the binary the operator has approved. Bare names
   * (e.g., "node") are NEVER accepted — a PATH-poisoning attacker could
   * swap in a hostile binary if Team-X resolved bare names at spawn time.
   * The operator MUST list the absolute path they intend.
   */
  command: string;
  /**
   * Optional sha256 of the binary, in hex. When present, the validator
   * computes the hash of the resolved file at spawn time and rejects
   * any mismatch. The operator can omit this for binaries that
   * auto-update (e.g., system Python), at the cost of weaker integrity.
   */
  sha256?: string;
  /**
   * Human-readable label for the inbox / settings UI. Optional —
   * fallback is `basename(command)`.
   */
  label?: string;
  /** Unix-ms timestamp the entry was added. */
  addedAt?: number;
  /** Operator id who added the entry. Optional for now. */
  addedBy?: string;
}

export interface McpAllowlistFile {
  version: 1;
  entries: McpExecutableAllowlistEntry[];
}

/**
 * Allowlist source — kept abstract so production wires the file-backed
 * loader and unit tests can pass an in-memory array.
 */
export interface McpExecutableAllowlist {
  entries(): readonly McpExecutableAllowlistEntry[];
}

/** Default location of the operator-managed allowlist JSON file. */
export function defaultAllowlistPath(userDataDir: string): string {
  return join(userDataDir, 'mcp-allowlist.json');
}

/**
 * Read the allowlist file from disk. Auto-creates an empty fail-closed
 * file on first run so the operator has a clear handle to edit. If the
 * file exists but is malformed, the function throws — callers should
 * surface the parse error to the operator instead of silently
 * fail-opening.
 */
export function loadAllowlistFile(path: string): McpAllowlistFile {
  if (!existsSync(path)) {
    const empty: McpAllowlistFile = { version: 1, entries: [] };
    writeFileSync(path, JSON.stringify(empty, null, 2) + '\n', 'utf8');
    return empty;
  }
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[mcp-security] allowlist file ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[mcp-security] allowlist file ${path} must be an object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error(`[mcp-security] allowlist file ${path} has unsupported version: ${obj.version}`);
  }
  const entriesRaw = obj.entries;
  if (!Array.isArray(entriesRaw)) {
    throw new Error(`[mcp-security] allowlist file ${path} must have an entries array`);
  }
  const entries: McpExecutableAllowlistEntry[] = [];
  for (let i = 0; i < entriesRaw.length; i++) {
    const e = entriesRaw[i];
    if (!e || typeof e !== 'object') {
      throw new Error(`[mcp-security] allowlist entry #${i} must be an object`);
    }
    const eo = e as Record<string, unknown>;
    if (typeof eo.command !== 'string' || eo.command.length === 0) {
      throw new Error(`[mcp-security] allowlist entry #${i} missing string command`);
    }
    const entry: McpExecutableAllowlistEntry = { command: eo.command };
    if (typeof eo.sha256 === 'string' && eo.sha256.length > 0) entry.sha256 = eo.sha256;
    if (typeof eo.label === 'string' && eo.label.length > 0) entry.label = eo.label;
    if (typeof eo.addedAt === 'number') entry.addedAt = eo.addedAt;
    if (typeof eo.addedBy === 'string') entry.addedBy = eo.addedBy;
    entries.push(entry);
  }
  return { version: 1, entries };
}

/**
 * Build an `McpExecutableAllowlist` source that re-reads the file on
 * every `entries()` call. This means an operator editing the file
 * takes effect on the NEXT MCP connect attempt without an app restart.
 *
 * Errors during read are surfaced to callers (the validator rejects
 * the connection with a clear message).
 */
export function createFileAllowlist(filePath: string): McpExecutableAllowlist {
  return {
    entries() {
      return loadAllowlistFile(filePath).entries;
    },
  };
}

/**
 * Outcome of `validateExecutable`. Either the command resolved to an
 * allowlisted absolute path (with optional hash match) and we can
 * spawn it, or we got a specific reason why we cannot.
 */
export type ValidateExecutableResult =
  | { ok: true; resolvedPath: string }
  | {
      ok: false;
      reason:
        | 'empty-command'
        | 'bare-name-not-absolute'
        | 'allowlist-empty'
        | 'not-in-allowlist'
        | 'file-missing'
        | 'sha256-mismatch';
      message: string;
    };

/**
 * Compute the sha256 of a file as a lowercase hex string. Synchronous
 * because it runs once at MCP-connect time, not on the hot path.
 */
export function computeFileSha256(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function pathsEqual(a: string, b: string): boolean {
  // Windows is case-insensitive, POSIX is case-sensitive. We normalize
  // and slash-fold but only lowercase on win32 to avoid false positives
  // on case-sensitive filesystems.
  const na = normalize(a);
  const nb = normalize(b);
  if (process.platform === 'win32') {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

/**
 * Validate that a config-supplied command is allowed to spawn.
 *
 * The C5 audit fix mandates four checks:
 *
 *   1. The command must be a non-empty absolute path. Bare names
 *      (`node`, `npx`) are refused — Team-X never resolves PATH for
 *      spawning, because PATH is attacker-controlled in a compromised
 *      environment.
 *
 *   2. The path must exist on disk. (Defensive — `spawn` will fail
 *      anyway, but failing early gives a clearer error message and
 *      doesn't leak bytes to a transport that can never connect.)
 *
 *   3. The path must match an allowlist entry by absolute-path
 *      equality (case-insensitive on Windows, exact on POSIX).
 *
 *   4. If the allowlist entry pins a sha256, the on-disk file must
 *      hash to that value. A pinned-but-mismatched binary is treated
 *      as compromised and refused.
 *
 * The empty allowlist is the explicit fail-closed state. Operators
 * who want to use MCP must add at least one entry to
 * `mcp-allowlist.json`.
 */
export function validateExecutable(
  command: string,
  allowlist: McpExecutableAllowlist,
  opts?: { computeSha256?: (path: string) => string; statSync?: typeof statSync },
): ValidateExecutableResult {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return {
      ok: false,
      reason: 'empty-command',
      message: 'Empty MCP command — config must specify a `command` string.',
    };
  }
  const trimmed = command.trim();

  // Reject bare names. A bare name has no path separator and no
  // platform-absolute prefix. We test by checking that resolvePath
  // (which makes it absolute against cwd) and the original differ
  // only by the cwd prefix — i.e., the original was relative.
  const isAbsolute = (() => {
    if (process.platform === 'win32') {
      // C:\Path or \\server\share or \?\path
      return /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('//');
    }
    return trimmed.startsWith('/');
  })();
  if (!isAbsolute) {
    return {
      ok: false,
      reason: 'bare-name-not-absolute',
      message: `MCP command must be an absolute path. Got "${trimmed}". Bare names like "node" or "npx" are refused because PATH lookup is attacker-controlled — list the absolute path of the binary in mcp-allowlist.json.`,
    };
  }

  const entries = allowlist.entries();
  if (entries.length === 0) {
    return {
      ok: false,
      reason: 'allowlist-empty',
      message: 'MCP executable allowlist is empty — no servers can spawn. Add an entry to mcp-allowlist.json to authorize a binary.',
    };
  }

  const matched = entries.find((entry) => pathsEqual(entry.command, trimmed));
  if (!matched) {
    return {
      ok: false,
      reason: 'not-in-allowlist',
      message: `MCP command "${trimmed}" is not in the allowlist. Add an entry to mcp-allowlist.json if you trust this binary.`,
    };
  }

  // The on-disk file must exist. Use the (optionally-injected) statSync
  // so unit tests can simulate missing files.
  const stat = opts?.statSync ?? statSync;
  let exists = false;
  try {
    const s = stat(trimmed);
    exists = s.isFile();
  } catch {
    exists = false;
  }
  if (!exists) {
    return {
      ok: false,
      reason: 'file-missing',
      message: `MCP command "${trimmed}" was allowlisted but the file does not exist on disk.`,
    };
  }

  if (matched.sha256) {
    const compute = opts?.computeSha256 ?? computeFileSha256;
    let actual: string;
    try {
      actual = compute(trimmed).toLowerCase();
    } catch (err) {
      return {
        ok: false,
        reason: 'sha256-mismatch',
        message: `Failed to compute sha256 for "${trimmed}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const expected = matched.sha256.toLowerCase();
    if (actual !== expected) {
      return {
        ok: false,
        reason: 'sha256-mismatch',
        message: `MCP command "${trimmed}" sha256 ${actual} does not match the pinned hash ${expected}. The binary may have been tampered with or auto-updated; re-pin the hash in mcp-allowlist.json after verifying.`,
      };
    }
  }

  return { ok: true, resolvedPath: trimmed };
}

// ---------------------------------------------------------------------------
// Path-traversal sanity for serverId-derived paths.
// ---------------------------------------------------------------------------

/**
 * Confirm that `child` resolves to a location strictly inside `parent`.
 * Used as a belt-and-suspenders check after constructing per-server
 * paths from caller-controlled ids.
 */
export function isInside(parent: string, child: string): boolean {
  const p = resolvePath(parent);
  const c = resolvePath(child);
  if (process.platform === 'win32') {
    return c.toLowerCase().startsWith(p.toLowerCase() + sep) || c.toLowerCase() === p.toLowerCase();
  }
  return c.startsWith(p + sep) || c === p;
}
