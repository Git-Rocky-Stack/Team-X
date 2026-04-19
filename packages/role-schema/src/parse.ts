import { createHash } from 'node:crypto';
import { type Capability, type RoleSpec, isCapability } from '@team-x/shared-types';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * Minimal YAML-frontmatter splitter with no dynamic code execution in the
 * dependency graph.
 *
 * Replaces `gray-matter`, whose optional JavaScript-frontmatter engine
 * pulled a dynamic code execution path into the main-process bundle that
 * rollup (correctly) flagged as a security risk during the electron-vite
 * build. We only ever use YAML frontmatter in role.md files, so the
 * entire JS engine was dead weight that we can safely drop.
 *
 * Contract — mirrors gray-matter's behavior closely enough that existing
 * callers are drop-in compatible:
 *
 * 1. If the source starts with `---` on its own line and has a matching
 *    closing `---` on its own line, the YAML between the delimiters is
 *    parsed and returned as `data`. Everything after the closing delimiter
 *    is returned as `content`.
 * 2. If there is no opening delimiter, `data` is an empty object and the
 *    full source is returned as `content` (consistent with gray-matter).
 * 3. If the opening delimiter is present but the closing one is missing,
 *    we throw a descriptive error — silently swallowing this would let a
 *    corrupted role.md pass through as "no frontmatter" and then fail
 *    deep inside zod with a confusing message.
 * 4. Both CRLF (`\r\n`) and LF (`\n`) line endings are accepted.
 * 5. An empty frontmatter block (`---\n---\n`) is parsed as an empty
 *    object, not as null.
 */
const FRONTMATTER_OPEN = /^---\r?\n/;
const FRONTMATTER_CLOSE = /\r?\n---(?:\r?\n|$)/;

interface SplitResult {
  data: Record<string, unknown>;
  content: string;
}

function splitFrontmatter(source: string): SplitResult {
  if (!FRONTMATTER_OPEN.test(source)) {
    return { data: {}, content: source };
  }

  const afterOpen = source.replace(FRONTMATTER_OPEN, '');
  const closeMatch = afterOpen.match(FRONTMATTER_CLOSE);
  if (!closeMatch || closeMatch.index === undefined) {
    throw new Error(
      'Unterminated YAML frontmatter: found opening `---` but no matching closing `---` delimiter.',
    );
  }

  const yamlBlock = afterOpen.slice(0, closeMatch.index);
  const content = afterOpen.slice(closeMatch.index + closeMatch[0].length);
  const parsed = yamlBlock.trim().length === 0 ? {} : parseYaml(yamlBlock);

  // YAML's top-level can legitimately be null (empty document) — coerce to
  // an empty object so downstream zod validation gets a consistent shape.
  const data =
    parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};

  return { data, content };
}

const cadenceSchema = z.object({
  type: z.string(),
  every: z.string(),
  time: z.string(),
});

const frontmatterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.enum([
    'officer',
    'senior_management',
    'management',
    'supervisor',
    'lead',
    'ic',
    // `system` is reserved for framework-internal pseudo-employees that are
    // never hired via UI — they exist per-company to own things like the
    // agentic-loop thread history. The role-loader filters `level: system`
    // out of `listRoles()` so they never appear in the hire dialog or NLU
    // entity resolver; `getSpec()` still returns them so `resolveSystemPrompt`
    // and direct bootstrap lookups continue to work.
    'system',
  ]),
  reports_to: z.array(z.string()).default([]),
  manages: z.array(z.string()).default([]),
  preferred_model_tier: z.enum(['high', 'mid', 'low']),
  preferred_providers: z.array(z.string()).default([]),
  fallback_providers: z.array(z.string()).default([]),
  preferred_context_window: z.number().int().positive().optional(),
  tools_allowed: z.array(z.string()).default([]),
  tools_denied: z.array(z.string()).default([]),
  decision_authority: z.enum(['final', 'delegated', 'advisory']),
  escalates_to: z.array(z.string()).default([]),
  kpis: z.array(z.string()).default([]),
  capabilities: z.array(z.unknown()).optional(),
  cadences: z.array(cadenceSchema).optional(),
  output_format: z.string().optional(),
  temperature: z.number().min(0).max(2),
  license: z.string().min(1),
  author: z.string().min(1),
  version: z.string().min(1),
});

export interface ParseRoleMarkdownOptions {
  /**
   * M36 keeps missing capabilities backward-compatible for older community
   * packs by default. Official-pack loaders can opt into the stricter
   * post-backfill rule once all 57 Strategia roles carry capabilities.
   */
  requireCapabilities?: boolean;

  /**
   * Duplicate capabilities are recoverable authoring drift: parse the role,
   * dedupe deterministically, and report a warning to the caller's log sink.
   */
  onWarning?: (message: string) => void;
}

function invalidFrontmatter(sourcePath: string, message: string): Error {
  return new Error(`Invalid role frontmatter in ${sourcePath}: ${message}`);
}

function normalizeCapabilities(
  raw: unknown[] | undefined,
  sourcePath: string,
  opts: ParseRoleMarkdownOptions,
): Capability[] | undefined {
  if (raw === undefined) {
    if (opts.requireCapabilities) {
      throw invalidFrontmatter(sourcePath, 'capabilities: Required');
    }
    return undefined;
  }

  if (raw.length === 0) {
    throw invalidFrontmatter(sourcePath, 'capabilities: must contain at least 1 capability');
  }

  const seen = new Set<Capability>();
  const capabilities: Capability[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') {
      throw invalidFrontmatter(sourcePath, 'capabilities: every capability must be a string');
    }
    if (!isCapability(value)) {
      throw invalidFrontmatter(sourcePath, `capabilities: unknown capability "${value}"`);
    }
    if (seen.has(value)) {
      opts.onWarning?.(`[role-schema] duplicate capability "${value}" in ${sourcePath}; deduping`);
      continue;
    }
    seen.add(value);
    capabilities.push(value);
  }

  return capabilities;
}

export function parseRoleMarkdown(
  source: string,
  sourcePath: string,
  opts: ParseRoleMarkdownOptions = {},
): RoleSpec {
  const { data, content } = splitFrontmatter(source);
  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid role frontmatter in ${sourcePath}: ${issues}`);
  }
  const capabilities = normalizeCapabilities(parsed.data.capabilities, sourcePath, opts);
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex');
  return {
    frontmatter: {
      ...parsed.data,
      capabilities,
    },
    body: content.trim(),
    sourcePath,
    sha256,
  };
}
