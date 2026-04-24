import type { Stats } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import type { ExtensionsAutonomyMode, SkillAssignment } from '@team-x/shared-types';

import type {
  AuthorityRepo,
  ExtensionRow,
  ExtensionsRepo,
  SkillAssignmentRow,
  SkillAssignmentsRepo,
} from '../db/repos/extensions.js';

type FetchLike = typeof fetch;

interface ParsedSkillManifest {
  name: string;
  slug: string;
  version: string | null;
  description: string | null;
  promptFile: string;
  instructionFiles: string[];
  toolRecommendations: string[];
  requestedCapabilities: string[];
  requestedPaths: string[];
}

interface LoadedSkillSource {
  manifest: ParsedSkillManifest;
  manifestFileName: string;
  readTextFile(path: string): Promise<string>;
  snapshotTo(targetDir: string): Promise<void>;
  sourceMetadata: Record<string, unknown>;
}

export interface SkillPromptBundleInput {
  companyId: string;
  employeeId: string;
}

export interface InstallLocalSkillInput {
  companyId: string;
  folderPath: string;
}

export interface InstallGithubSkillInput {
  companyId: string;
  sourceUrl: string;
}

export interface UpsertSkillAssignmentInput {
  companyId: string;
  extensionId: string;
  employeeId?: string | null;
  enabled: boolean;
}

export interface SkillsServiceDeps {
  extensionsRepo: ExtensionsRepo;
  skillAssignmentsRepo: SkillAssignmentsRepo;
  authorityRepo: AuthorityRepo;
  settingsRepo: {
    getExtensions(): { autonomyMode: ExtensionsAutonomyMode };
  };
  skillsRoot: string;
  fetchFn?: FetchLike;
  log?: {
    warn(message: string, err?: unknown): void;
  };
}

export interface SkillsService {
  installLocal(input: InstallLocalSkillInput): Promise<{ extensionId: string }>;
  installGithub(input: InstallGithubSkillInput): Promise<{ extensionId: string }>;
  listAssignments(companyId: string): SkillAssignment[];
  upsertAssignment(input: UpsertSkillAssignmentInput): string;
  deleteAssignment(assignmentId: string): void;
  materializePromptBundle(input: SkillPromptBundleInput): Promise<string>;
}

const MANIFEST_FILE_CANDIDATES = ['teamx-skill.json', 'team-x-skill.json'] as const;
const SENSITIVE_CAPABILITIES = new Set([
  'shell',
  'network',
  'process.spawn',
  'filesystem.write',
  'filesystem.execute',
  'skills.install',
  'skills.update',
  'mcp.manage',
]);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function ensureNonEmptyString(value: unknown, label: string): string {
  const next = typeof value === 'string' ? value.trim() : '';
  if (next.length === 0) {
    throw new Error(`[skills] ${label} is required`);
  }
  return next;
}

function dedupeStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      ),
    ),
  );
}

function normalizeRelativeFilePath(value: string, label: string): string {
  const normalized = value.replace(/\\/g, '/').trim();
  if (normalized.length === 0) {
    throw new Error(`[skills] ${label} is required`);
  }
  if (normalized.startsWith('/') || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`[skills] ${label} must stay within the skill root`);
  }
  return normalized;
}

function resolveAutonomyDecision(
  autonomyMode: ExtensionsAutonomyMode,
  manifest: ParsedSkillManifest,
): { enabled: boolean; trustState: 'trusted' | 'pending-review' | 'denied' } {
  const hasSensitiveRequest =
    manifest.requestedPaths.length > 0 ||
    manifest.requestedCapabilities.some((capability) => SENSITIVE_CAPABILITIES.has(capability));

  if (autonomyMode === 'conservative') {
    return { enabled: false, trustState: 'pending-review' };
  }
  if (autonomyMode === 'autonomous') {
    return { enabled: true, trustState: 'trusted' };
  }
  return {
    enabled: true,
    trustState: hasSensitiveRequest ? 'pending-review' : 'trusted',
  };
}

function parseSkillManifest(raw: string): ParsedSkillManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[skills] skill manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('[skills] skill manifest must be a JSON object');
  }

  const manifest = parsed as Record<string, unknown>;
  const name = ensureNonEmptyString(manifest.name, 'manifest.name');
  const promptFile = normalizeRelativeFilePath(
    ensureNonEmptyString(manifest.promptFile, 'manifest.promptFile'),
    'manifest.promptFile',
  );
  const instructionFiles = dedupeStrings(manifest.instructionFiles).map((path) =>
    normalizeRelativeFilePath(path, 'manifest.instructionFiles'),
  );
  const slugValue =
    typeof manifest.slug === 'string' && manifest.slug.trim().length > 0
      ? manifest.slug.trim()
      : slugify(name);

  return {
    name,
    slug: slugify(slugValue),
    version: typeof manifest.version === 'string' ? manifest.version.trim() || null : null,
    description:
      typeof manifest.description === 'string' && manifest.description.trim().length > 0
        ? manifest.description.trim()
        : null,
    promptFile,
    instructionFiles: instructionFiles.filter((path) => path !== promptFile),
    toolRecommendations: dedupeStrings(manifest.toolRecommendations),
    requestedCapabilities: dedupeStrings(manifest.requestedCapabilities),
    requestedPaths: dedupeStrings(manifest.requestedPaths),
  };
}

function assertWithinRoot(root: string, candidate: string, label: string): void {
  const rel = relative(root, candidate);
  if (rel.startsWith('..') || resolve(root, rel) !== candidate) {
    throw new Error(`[skills] ${label} must stay within the skill root`);
  }
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function loadLocalSkillSource(folderPath: string): Promise<LoadedSkillSource> {
  const root = resolve(folderPath);
  let sourceStats: Stats;
  try {
    sourceStats = await stat(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      throw new Error(`[skills] local skill folder not found: ${root}`);
    }
    throw err;
  }
  if (!sourceStats.isDirectory()) {
    throw new Error(`[skills] local skill path must be a directory: ${root}`);
  }
  let manifestPath: string | null = null;
  let manifestFileName: string = MANIFEST_FILE_CANDIDATES[0];

  for (const candidate of MANIFEST_FILE_CANDIDATES) {
    const next = join(root, candidate);
    try {
      await readFile(next, 'utf8');
      manifestPath = next;
      manifestFileName = candidate;
      break;
    } catch {
      // Try the next manifest filename.
    }
  }

  if (!manifestPath) {
    throw new Error('[skills] local skill folder is missing teamx-skill.json or team-x-skill.json');
  }
  const resolvedManifestPath = manifestPath;

  const manifestRaw = await readFile(resolvedManifestPath, 'utf8');
  const manifest = parseSkillManifest(manifestRaw);
  const fileList = [manifest.promptFile, ...manifest.instructionFiles];

  for (const relativePath of fileList) {
    const absolutePath = resolve(root, relativePath);
    assertWithinRoot(root, absolutePath, relativePath);
    try {
      await readFile(absolutePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        throw new Error(`[skills] missing referenced file: ${relativePath}`);
      }
      throw err;
    }
  }

  return {
    manifest,
    manifestFileName,
    async readTextFile(relativePath: string) {
      const absolutePath = resolve(root, relativePath);
      assertWithinRoot(root, absolutePath, relativePath);
      return readFile(absolutePath, 'utf8');
    },
    async snapshotTo(targetDir: string) {
      await ensureDirectory(targetDir);
      await copyFile(resolvedManifestPath, join(targetDir, manifestFileName));
      for (const relativePath of fileList) {
        const sourcePath = resolve(root, relativePath);
        const targetPath = join(targetDir, relativePath);
        await ensureDirectory(dirname(targetPath));
        await copyFile(sourcePath, targetPath);
      }
    },
    sourceMetadata: {
      origin: 'local',
      folderPath: root,
    },
  };
}

interface GitHubSourceRef {
  owner: string;
  repo: string;
  ref: string | null;
  basePath: string;
  manifestPath?: string;
  originalUrl: string;
}

function parseGitHubSourceUrl(sourceUrl: string): GitHubSourceRef {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error('[skills] GitHub source must be a valid URL');
  }

  if (url.hostname === 'raw.githubusercontent.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 5) {
      throw new Error('[skills] raw GitHub skill URL must point at a manifest file');
    }
    const [owner, repo, ref, ...rest] = parts;
    if (!owner || !repo || !ref) {
      throw new Error('[skills] raw GitHub skill URL is missing owner, repo, or ref');
    }
    return {
      owner,
      repo: repo.replace(/\.git$/i, ''),
      ref,
      basePath: dirname(rest.join('/')).replace(/\\/g, '/').replace(/^\.$/, ''),
      manifestPath: rest.join('/'),
      originalUrl: sourceUrl,
    };
  }

  if (url.hostname !== 'github.com') {
    throw new Error('[skills] only github.com skill sources are supported');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('[skills] GitHub source must include owner and repo');
  }

  const [owner, repoRaw, mode, ref, ...rest] = parts;
  if (!owner || !repoRaw) {
    throw new Error('[skills] GitHub source must include owner and repo');
  }
  const repo = repoRaw.replace(/\.git$/i, '');

  if (!mode) {
    return { owner, repo, ref: null, basePath: '', originalUrl: sourceUrl };
  }

  if (mode === 'tree') {
    return {
      owner,
      repo,
      ref: ref ?? null,
      basePath: rest.join('/'),
      originalUrl: sourceUrl,
    };
  }

  if (mode === 'blob') {
    const manifestPath = rest.join('/');
    return {
      owner,
      repo,
      ref: ref ?? null,
      basePath: dirname(manifestPath).replace(/\\/g, '/').replace(/^\.$/, ''),
      manifestPath,
      originalUrl: sourceUrl,
    };
  }

  return { owner, repo, ref: null, basePath: '', originalUrl: sourceUrl };
}

async function loadGitHubSkillSource(
  sourceUrl: string,
  fetchFn: FetchLike,
): Promise<LoadedSkillSource> {
  const parsed = parseGitHubSourceUrl(sourceUrl);
  const headers = { 'User-Agent': 'Team-X Desktop' };

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetchFn(url, { headers });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`[skills] GitHub resource not found: ${url}`);
      }
      throw new Error(`[skills] GitHub request failed (${response.status}) for ${url}`);
    }
    return (await response.json()) as T;
  }

  const repoInfo = await fetchJson<{ default_branch: string }>(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
  ).catch((err) => {
    if (err instanceof Error && err.message.includes('GitHub resource not found')) {
      throw new Error(`[skills] GitHub repository not found: ${parsed.owner}/${parsed.repo}`);
    }
    throw err;
  });
  const resolvedRef = parsed.ref ?? repoInfo.default_branch;
  const commit = await fetchJson<{ sha: string }>(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(resolvedRef)}`,
  );

  async function fetchFile(path: string): Promise<string> {
    const nextPath = path.replace(/^\/+/, '');
    const response = await fetchJson<{ type: string; content?: string; encoding?: string }>(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${nextPath}?ref=${encodeURIComponent(resolvedRef)}`,
    ).catch((err) => {
      if (err instanceof Error && err.message.includes('GitHub resource not found')) {
        throw new Error(`[skills] GitHub skill file not found: ${nextPath}`);
      }
      throw err;
    });
    if (response.type !== 'file' || typeof response.content !== 'string') {
      throw new Error(`[skills] GitHub path is not a file: ${nextPath}`);
    }
    if (response.encoding !== 'base64') {
      throw new Error(`[skills] unsupported GitHub file encoding for ${nextPath}`);
    }
    return Buffer.from(response.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }

  let manifestPath = parsed.manifestPath;
  let manifestFileName: string = MANIFEST_FILE_CANDIDATES[0];
  let manifestRaw: string | null = null;

  if (manifestPath) {
    manifestRaw = await fetchFile(manifestPath);
    manifestFileName = manifestPath.split('/').pop() ?? MANIFEST_FILE_CANDIDATES[0];
  } else {
    for (const candidate of MANIFEST_FILE_CANDIDATES) {
      const nextPath = [parsed.basePath, candidate].filter(Boolean).join('/');
      try {
        manifestRaw = await fetchFile(nextPath);
        manifestPath = nextPath;
        manifestFileName = candidate;
        break;
      } catch {
        // Try the next manifest location.
      }
    }
  }

  if (!manifestRaw || !manifestPath) {
    throw new Error(
      '[skills] GitHub skill source is missing teamx-skill.json or team-x-skill.json',
    );
  }
  const resolvedManifestRaw = manifestRaw;

  const manifest = parseSkillManifest(resolvedManifestRaw);
  const basePath = parsed.basePath;
  const fileMap = new Map<string, string>();
  const referencedFiles = [manifest.promptFile, ...manifest.instructionFiles];
  for (const relativePath of referencedFiles) {
    const nextPath = [basePath, relativePath].filter(Boolean).join('/');
    fileMap.set(relativePath, await fetchFile(nextPath));
  }

  return {
    manifest,
    manifestFileName,
    async readTextFile(relativePath: string) {
      const value = fileMap.get(relativePath);
      if (!value) {
        throw new Error(`[skills] snapshot missing ${relativePath}`);
      }
      return value;
    },
    async snapshotTo(targetDir: string) {
      await ensureDirectory(targetDir);
      await writeFile(join(targetDir, manifestFileName), resolvedManifestRaw, 'utf8');
      for (const [relativePath, text] of fileMap.entries()) {
        const targetPath = join(targetDir, relativePath);
        await ensureDirectory(dirname(targetPath));
        await writeFile(targetPath, text, 'utf8');
      }
    },
    sourceMetadata: {
      origin: 'github',
      sourceUrl: parsed.originalUrl,
      owner: parsed.owner,
      repo: parsed.repo,
      ref: resolvedRef,
      commitSha: commit.sha,
      basePath,
      manifestPath,
    },
  };
}

function rowToSkillAssignment(row: SkillAssignmentRow): SkillAssignment {
  return {
    id: row.id,
    extensionId: row.extensionId,
    companyId: row.companyId,
    employeeId: row.employeeId,
    enabled: row.enabled,
    source: row.source as SkillAssignment['source'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function buildPromptAdditionForSkill(extension: ExtensionRow): Promise<string> {
  if (!extension?.manifestJson) return '';
  let manifest: Record<string, unknown>;
  try {
    const parsed = JSON.parse(extension.manifestJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
    manifest = parsed as Record<string, unknown>;
  } catch {
    return '';
  }
  const snapshotDir = typeof manifest.snapshotDir === 'string' ? manifest.snapshotDir : '';
  const promptFile = typeof manifest.promptFile === 'string' ? manifest.promptFile : '';
  const instructionFiles = Array.isArray(manifest.instructionFiles)
    ? manifest.instructionFiles.filter((value): value is string => typeof value === 'string')
    : [];
  const toolRecommendations = Array.isArray(manifest.toolRecommendations)
    ? manifest.toolRecommendations.filter((value): value is string => typeof value === 'string')
    : [];
  if (!snapshotDir || !promptFile) return '';

  const sections: string[] = [];
  const prompt = await readFile(join(snapshotDir, promptFile), 'utf8');
  if (prompt.trim().length > 0) {
    sections.push(prompt.trim());
  }

  for (const file of instructionFiles) {
    const text = await readFile(join(snapshotDir, file), 'utf8');
    if (text.trim().length > 0) {
      sections.push(text.trim());
    }
  }

  const lines = [`## Installed Skill: ${extension.name}`];
  const description = typeof manifest.description === 'string' ? manifest.description : '';
  if (description.trim().length > 0) {
    lines.push(description.trim());
  }
  if (sections.length > 0) {
    lines.push(sections.join('\n\n'));
  }
  if (toolRecommendations.length > 0) {
    lines.push(`Recommended tools: ${toolRecommendations.join(', ')}`);
  }
  return lines.join('\n\n').trim();
}

export function createSkillsService(deps: SkillsServiceDeps): SkillsService {
  const fetchFn = deps.fetchFn ?? fetch;
  const logger = deps.log ?? {
    warn: (message: string, err?: unknown) => console.warn(message, err),
  };

  async function installFromSource(
    companyId: string,
    sourceKind: 'local' | 'github',
    sourceRef: string,
    source: LoadedSkillSource,
  ): Promise<{ extensionId: string }> {
    const autonomyMode = deps.settingsRepo.getExtensions().autonomyMode;
    const decision = resolveAutonomyDecision(autonomyMode, source.manifest);
    const manifestJson = JSON.stringify({
      schemaVersion: 1,
      description: source.manifest.description,
      promptFile: source.manifest.promptFile,
      instructionFiles: source.manifest.instructionFiles,
      toolRecommendations: source.manifest.toolRecommendations,
      requestedCapabilities: source.manifest.requestedCapabilities,
      requestedPaths: source.manifest.requestedPaths,
      healthStatus: 'healthy',
      healthIssues: [],
      ...source.sourceMetadata,
    });

    const extensionId = deps.extensionsRepo.create({
      companyId,
      kind: 'skill',
      name: source.manifest.name,
      slug: `skill-${source.manifest.slug}`,
      sourceKind,
      sourceRef,
      version: source.manifest.version,
      manifestJson,
      requestedCapabilitiesJson: JSON.stringify(source.manifest.requestedCapabilities),
      requestedPathsJson: JSON.stringify(source.manifest.requestedPaths),
      enabled: decision.enabled,
      trustState: decision.trustState,
    });

    const snapshotDir = join(deps.skillsRoot, extensionId);

    try {
      await source.snapshotTo(snapshotDir);
      deps.extensionsRepo.update(extensionId, {
        manifestJson: JSON.stringify({
          ...(JSON.parse(manifestJson) as Record<string, unknown>),
          snapshotDir,
        }),
      });

      deps.skillAssignmentsRepo.upsert({
        extensionId,
        companyId,
        employeeId: null,
        enabled: decision.enabled,
        source: 'workspace-default',
      });

      if (decision.trustState === 'pending-review') {
        for (const capability of source.manifest.requestedCapabilities) {
          deps.authorityRepo.createRequest({
            extensionId,
            resourceKind: 'capability',
            resourceId: capability,
            requestedPermission: 'allow',
            reason: 'Requested by installed skill manifest',
          });
        }
        for (const path of source.manifest.requestedPaths) {
          deps.authorityRepo.createRequest({
            extensionId,
            resourceKind: 'path',
            resourceId: path,
            requestedPermission: 'allow',
            reason: 'Requested by installed skill manifest',
          });
        }
      }
      return { extensionId };
    } catch (err) {
      deps.extensionsRepo.delete(extensionId);
      await rm(snapshotDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  return {
    async installLocal({ companyId, folderPath }) {
      if (!companyId) throw new Error('[skills] companyId is required');
      const source = await loadLocalSkillSource(folderPath);
      return installFromSource(companyId, 'local', resolve(folderPath), source);
    },

    async installGithub({ companyId, sourceUrl }) {
      if (!companyId) throw new Error('[skills] companyId is required');
      const source = await loadGitHubSkillSource(sourceUrl, fetchFn);
      return installFromSource(companyId, 'github', sourceUrl, source);
    },

    listAssignments(companyId: string) {
      return deps.skillAssignmentsRepo.listByCompany(companyId).map(rowToSkillAssignment);
    },

    upsertAssignment({ companyId, extensionId, employeeId, enabled }) {
      return deps.skillAssignmentsRepo.upsert({
        extensionId,
        companyId,
        employeeId: employeeId ?? null,
        enabled,
        source: employeeId ? 'employee-override' : 'workspace-default',
      });
    },

    deleteAssignment(assignmentId: string) {
      deps.skillAssignmentsRepo.delete(assignmentId);
    },

    async materializePromptBundle({ companyId, employeeId }) {
      const skillExtensions = deps.extensionsRepo
        .listSkillsByCompany(companyId)
        .filter((extension) => extension.enabled && extension.trustState !== 'denied');
      if (skillExtensions.length === 0) return '';

      const assignments = deps.skillAssignmentsRepo.listByCompany(companyId);
      const workspaceAssignments = new Map(
        assignments
          .filter((assignment) => assignment.employeeId === null)
          .map((assignment) => [assignment.extensionId, assignment]),
      );
      const employeeAssignments = new Map(
        assignments
          .filter((assignment) => assignment.employeeId === employeeId)
          .map((assignment) => [assignment.extensionId, assignment]),
      );

      const activeSkills = skillExtensions.filter((extension) => {
        const employeeOverride = employeeAssignments.get(extension.id);
        if (employeeOverride) return employeeOverride.enabled;
        const workspaceDefault = workspaceAssignments.get(extension.id);
        return workspaceDefault?.enabled ?? false;
      });

      const chunks: string[] = [];
      for (const extension of activeSkills) {
        try {
          const chunk = await buildPromptAdditionForSkill(extension);
          if (chunk.length > 0) chunks.push(chunk);
        } catch (err) {
          logger.warn(`[skills] failed to materialize prompt bundle for ${extension.id}`, err);
        }
      }

      return chunks.join('\n\n');
    },
  };
}
