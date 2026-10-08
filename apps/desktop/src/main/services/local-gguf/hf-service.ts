/**
 * HfService — Electron-main orchestrator for the Hugging Face Hub browser
 * (v3.3.0 Local & Networked GGUF Support, spec § 7 / § 13).
 *
 * Backs the seven `localGguf.hf.*` channels, which shipped in Phase 1 as
 * not-implemented stubs: repository search, model cards, and a resumable
 * download manager with pause / resume / cancel and live progress.
 *
 * House style mirrors `pool-service.ts`, `runtime-service.ts` and
 * `endpoint-service.ts`: a pure factory returning an object of methods (no
 * class / `new` / `this`). Every I/O dependency — `fetch`, the filesystem,
 * and the token reader — is injectable with a real default, so unit tests
 * drive it with fakes (no real network, no real disk).
 *
 * ## Why downloads are resumable rather than simple
 *
 * A Q4 quantization of a 70B model is 40+ GB. Over a domestic connection that
 * is hours, and it *will* be interrupted — a laptop lid, a flaky Wi-Fi AP, a
 * quit. Bytes land in `<filename>.part` and are only renamed to the final name
 * once the transfer completes, so a partial file is never mistaken for a
 * usable model by the library scanner. Resuming re-requests with an HTTP
 * `Range` header from the `.part` size.
 *
 * ## Judgment calls (documented for review)
 *
 *   • **A server that ignores `Range` restarts the transfer.** Some LAN
 *     proxies answer `200` with the whole body even when asked for a range.
 *     Appending that to the existing `.part` would silently corrupt the file,
 *     so a `200` response to a ranged request truncates and starts over.
 *   • **`search` never fabricates a description.** The HF list endpoint does
 *     not return prose; only `cardData.summary` sometimes exists. When it does
 *     not, `description` is the empty string. `modelCard` — a detail view, one
 *     extra request — reads the real README instead.
 *   • **`activeDownloads` retains terminal records for the process lifetime.**
 *     A completed transfer that vanished from the list would give the UI no
 *     way to render "done". The map is per-session and each record is a few
 *     hundred bytes.
 *   • **`filename` may nest one or more levels** (`Q8_0/model.gguf` is a real
 *     HF layout), so containment is checked by resolving the final path and
 *     asserting it stays under the chosen folder — not by banning separators.
 *   • **Failures are recorded, not thrown, once a transfer is under way.**
 *     `startDownload` has already returned its handle; the caller polls
 *     progress. Argument validation still throws, because there is no handle
 *     to attach a failure to yet.
 */

import { dirname, isAbsolute, resolve, sep } from 'node:path';

import type {
  DownloadProgress,
  HfModelCard,
  HfSearchResult,
  LocalGgufError,
} from '@team-x/shared-types';
import { nanoid } from 'nanoid';

/** Public Hugging Face Hub origin. Overridable only for tests. */
const DEFAULT_API_BASE_URL = 'https://huggingface.co';

/** `owner/name`, the only shape the Hub accepts. Rejects traversal by construction. */
const REPO_ID_PATTERN = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

/** Filter keys forwarded to the Hub API. Anything else in `filters` is ignored. */
const FORWARDED_FILTERS = [
  'author',
  'library',
  'sort',
  'direction',
  'limit',
  'pipeline_tag',
] as const;

// ---------------------------------------------------------------------------
// Injectable filesystem
// ---------------------------------------------------------------------------

/** An open, append-positioned handle on the `.part` file. */
export interface HfFileSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** The filesystem surface the download manager needs, and nothing more. */
export interface HfFs {
  ensureDir(dir: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  /** Byte length of `path`, or null when it does not exist. */
  size(path: string): Promise<number | null>;
  openAppend(path: string): Promise<HfFileSink>;
  openTruncate(path: string): Promise<HfFileSink>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Bytes free to this process on the volume holding `dir`, or null when unknown. */
  freeBytes?(dir: string): Promise<number | null>;
}

export interface HfServiceDeps {
  /** HTTP client; defaults to global `fetch`. */
  fetchFn?: typeof fetch;
  /** Filesystem; defaults to a `node:fs/promises` implementation. */
  fs?: HfFs;
  /** Reads the configured Hugging Face token. Absent means anonymous browsing. */
  getToken?: () => Promise<string | null>;
  /** Hub origin; defaults to {@link DEFAULT_API_BASE_URL}. */
  apiBaseUrl?: string;
}

export interface HfService {
  search(query: string, filters: Record<string, unknown>): Promise<HfSearchResult[]>;
  modelCard(repoId: string): Promise<HfModelCard>;
  startDownload(
    repoId: string,
    filename: string,
    targetFolder: string,
  ): Promise<{ handleId: string }>;
  pauseDownload(handleId: string): Promise<void>;
  resumeDownload(handleId: string): Promise<void>;
  cancelDownload(handleId: string): Promise<void>;
  activeDownloads(): Promise<DownloadProgress[]>;
  /**
   * Resolves once the transfer loop for `handleId` has stopped running —
   * completed, paused, cancelled or failed. Used by {@link HfService.dispose}
   * for a clean quit, and by tests to await a transfer deterministically.
   */
  settled(handleId: string): Promise<void>;
  /** Pause every in-flight transfer and wait for the loops to unwind. */
  dispose(): Promise<void>;
}

/**
 * Carries a typed {@link LocalGgufError} so the IPC layer can surface a
 * structured kind to the renderer rather than a bare `Error`. Mirrors
 * `RuntimeServiceError` and `EndpointServiceError`.
 */
export class HfServiceError extends Error {
  constructor(
    message: string,
    public readonly error?: LocalGgufError,
  ) {
    super(message);
    this.name = 'HfServiceError';
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertRepoId(repoId: string): string {
  if (!REPO_ID_PATTERN.test(repoId)) {
    throw new HfServiceError(
      `"${repoId}" is not a valid Hugging Face repo id. Expected "owner/name".`,
    );
  }
  return repoId;
}

/**
 * Resolve `filename` inside `targetFolder`, refusing anything that escapes it.
 *
 * `filename` is renderer-supplied and lands on disk, so this is a security
 * boundary rather than a nicety. Nested paths are legitimate (HF repos publish
 * `Q8_0/model.gguf`), which rules out a blanket separator ban — the check is
 * that the *resolved* path stays under the resolved folder.
 */
function resolveWithinFolder(
  targetFolder: string,
  filename: string,
): { root: string; full: string; urlPath: string } {
  if (filename.trim().length === 0) {
    throw new HfServiceError('A filename is required.');
  }
  if (isAbsolute(filename) || /^[A-Za-z]:/.test(filename)) {
    throw new HfServiceError(`The filename "${filename}" must be relative to the target folder.`);
  }
  // Normalize Windows separators so a `..\` segment cannot slip past a
  // POSIX-only split when the main process runs on Linux or macOS.
  const segments = filename.split(/[\\/]+/).filter((s) => s.length > 0);
  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
    throw new HfServiceError(`The filename "${filename}" must not contain path traversal.`);
  }
  for (const segment of segments) assertPortableSegment(filename, segment);

  // The Discover panel only offers `.gguf` siblings, so anything else reaching
  // here came from somewhere other than that UI. Refusing it keeps a
  // compromised renderer from using the Hub as a way to drop arbitrary repo
  // files (scripts, DLLs, configs) onto disk.
  if (!/\.gguf$/i.test(segments[segments.length - 1] ?? '')) {
    throw new HfServiceError(
      `Only GGUF model files can be downloaded; "${filename}" is not a .gguf file.`,
    );
  }

  const root = resolve(targetFolder);
  const full = resolve(root, ...segments);
  // Encode per segment: encodeURIComponent over the whole string would turn
  // the separator into `%2F` and ask the Hub for one oddly-named file.
  const urlPath = segments.map(encodeURIComponent).join('/');
  if (full !== root && !full.startsWith(root.endsWith(sep) ? root : root + sep)) {
    throw new HfServiceError(`The filename "${filename}" resolves outside the target folder.`);
  }
  return { root, full, urlPath };
}

/** Device names Windows reserves in every folder, with or without an extension. */
const WINDOWS_RESERVED =
  /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(\..*)?$/i;

/**
 * A path segment must mean the same file on every OS the library may live on
 * (a NAS share is read from Windows and macOS alike). Refused everywhere:
 *
 *   - Windows device names (`CON.gguf` writes to the console, not a file);
 *   - characters Windows forbids, including `:`, which opens an NTFS
 *     alternate data stream (`a:b.gguf` writes a hidden stream on `a`);
 *   - a trailing dot or space, which Windows drops, so `Q8_0.` and `Q8_0`
 *     would be one folder there and two everywhere else.
 */
function assertPortableSegment(filename: string, segment: string): void {
  if (WINDOWS_RESERVED.test(segment)) {
    throw new HfServiceError(
      `The filename "${filename}" uses "${segment}", a device name reserved by Windows.`,
    );
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this refuses.
  if (/[<>:"|?*\u0000-\u001f]/.test(segment)) {
    throw new HfServiceError(
      `The filename "${filename}" contains a character that is not allowed in file names.`,
    );
  }
  if (/[. ]$/.test(segment)) {
    throw new HfServiceError(
      `The filename "${filename}" has a segment ending in a dot or a space, which Windows drops.`,
    );
  }
}

/**
 * Comparison key for a destination path. Windows and macOS filesystems are
 * case-insensitive by default, so `Model.gguf` and `model.gguf` are one file
 * there and must count as one destination; APFS also treats composed and
 * decomposed Unicode (`café` typed two ways) as one name.
 */
export function destinationKey(path: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return path.normalize('NFC').toLowerCase();
  if (platform === 'win32') return path.toLowerCase();
  return path;
}

/** Hosts the Hub serves files from, directly or through its CDN redirects. */
function isHubHost(host: string): boolean {
  return (
    host === 'huggingface.co' ||
    host.endsWith('.huggingface.co') ||
    host === 'hf.co' ||
    host.endsWith('.hf.co')
  );
}

/** Margin left free on the volume after a download, so the OS is never starved. */
const DISK_HEADROOM_BYTES = 256 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${n} bytes`;
}

/**
 * The full length from a 416's `Content-Range: bytes *\/TOTAL`, or null when
 * the server did not say.
 */
function unsatisfiedRangeTotal(response: Response): number | null {
  const match = response.headers.get('content-range')?.match(/^bytes \*\/(\d+)\s*$/i);
  return match?.[1] ? Number(match[1]) : null;
}

/** Strip a secret from any text bound for the renderer or the progress record. */
function redact(text: string, secret: string | null): string {
  return secret ? text.split(secret).join('[redacted]') : text;
}

/** `Retry-After` in seconds; HTTP allows a date form, which we treat as unknown. */
function parseRetryAfter(header: string | null): number {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : 60;
}

/**
 * Extract a one-paragraph description from a Hugging Face README.
 *
 * Model cards open with a YAML front-matter block and usually an H1 title;
 * neither is a description. The first ordinary paragraph after those is.
 */
export function extractReadmeDescription(readme: string): string {
  let body = readme;
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end !== -1) body = body.slice(body.indexOf('\n', end + 1) + 1);
  }
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (text.length === 0) continue;
    if (text.startsWith('#') || text.startsWith('<') || text.startsWith('---')) continue;
    // Collapse hard-wrapped lines into a single paragraph.
    return text.split('\n').join(' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Default filesystem over node:fs/promises
// ---------------------------------------------------------------------------

function createNodeHfFs(): HfFs {
  return {
    async ensureDir(dir) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(dir, { recursive: true });
    },
    async isDirectory(path) {
      const { stat } = await import('node:fs/promises');
      try {
        return (await stat(path)).isDirectory();
      } catch {
        return false;
      }
    },
    async size(path) {
      const { stat } = await import('node:fs/promises');
      try {
        return (await stat(path)).size;
      } catch {
        return null;
      }
    },
    async openAppend(path) {
      const { open } = await import('node:fs/promises');
      const handle = await open(path, 'a');
      return {
        write: async (chunk) => {
          await handle.write(chunk);
        },
        close: () => handle.close(),
      };
    },
    async openTruncate(path) {
      const { open } = await import('node:fs/promises');
      const handle = await open(path, 'w');
      return {
        write: async (chunk) => {
          await handle.write(chunk);
        },
        close: () => handle.close(),
      };
    },
    async rename(from, to) {
      const { rename } = await import('node:fs/promises');
      await rename(from, to);
    },
    async remove(path) {
      const { rm } = await import('node:fs/promises');
      await rm(path, { force: true });
    },
    async freeBytes(dir) {
      const { statfs } = await import('node:fs/promises');
      try {
        const info = await statfs(dir);
        return Number(info.bavail) * Number(info.bsize);
      } catch {
        // Some network filesystems do not answer statfs; the write itself
        // still reports a full disk.
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Download bookkeeping
// ---------------------------------------------------------------------------

interface DownloadRecord {
  handleId: string;
  repoId: string;
  /** As supplied by the caller — the repo-relative path, shown in the UI. */
  filename: string;
  /**
   * `filename` split into validated segments and percent-encoded, joined with
   * `/` for the Hub URL. Built once at validation time so the request path can
   * never be assembled from the raw caller string.
   */
  urlPath: string;
  /** Absolute destination once complete. */
  finalPath: string;
  /** Absolute `<finalPath>.part` the transfer writes into. */
  partPath: string;
  bytesReceived: number;
  bytesTotal: number;
  state: DownloadProgress['state'];
  errorMessage: string | null;
  controller: AbortController | null;
  /** Set while a transfer loop is running; awaited by `settled` / `dispose`. */
  running: Promise<void> | null;
  /** True when the abort was a pause (keep the `.part`) rather than a cancel. */
  pauseRequested: boolean;
}

const TERMINAL: ReadonlyArray<DownloadProgress['state']> = ['completed', 'cancelled'];

// ---------------------------------------------------------------------------

export function createHfService(deps: HfServiceDeps = {}): HfService {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const fs = deps.fs ?? createNodeHfFs();
  const apiBaseUrl = (deps.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const downloads = new Map<string, DownloadRecord>();

  async function authHeaders(extra: Record<string, string> = {}): Promise<{
    headers: Record<string, string>;
    token: string | null;
  }> {
    let token: string | null = null;
    if (deps.getToken) {
      try {
        token = await deps.getToken();
      } catch (err) {
        console.warn('[hf-service] failed to read the Hugging Face token', err);
      }
    }
    const headers: Record<string, string> = { ...extra };
    if (token) headers.authorization = `Bearer ${token}`;
    return { headers, token };
  }

  /** Turn a non-OK Hub response into a typed error. */
  function apiError(response: Response, context: string): HfServiceError {
    if (response.status === 429) {
      const retryAfterS = parseRetryAfter(response.headers.get('retry-after'));
      return new HfServiceError(
        `Hugging Face rate limit reached while ${context}. Retry in ${retryAfterS}s.`,
        { kind: 'hf-rate-limited', retryAfterS },
      );
    }
    return new HfServiceError(
      `Hugging Face request failed while ${context}: HTTP ${response.status}.`,
    );
  }

  // -- search ---------------------------------------------------------------

  async function search(
    query: string,
    filters: Record<string, unknown>,
  ): Promise<HfSearchResult[]> {
    const url = new URL(`${apiBaseUrl}/api/models`);
    url.searchParams.set('search', query);
    // This is the GGUF browser; a non-GGUF repo is never a valid result here.
    url.searchParams.set('filter', 'gguf');
    for (const key of FORWARDED_FILTERS) {
      const value = filters[key];
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const { headers } = await authHeaders({ accept: 'application/json' });
    const response = await fetchFn(url.toString(), { method: 'GET', headers });
    if (!response.ok) throw apiError(response, 'searching models');

    const rows = (await response.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return [];

    return rows.map((row): HfSearchResult => {
      const cardData = (row.cardData ?? {}) as Record<string, unknown>;
      return {
        repoId: String(row.id ?? row.modelId ?? ''),
        downloads: Number(row.downloads ?? 0),
        likes: Number(row.likes ?? 0),
        // The list endpoint carries no prose. Empty is the honest answer;
        // `modelCard` reads the real README for the detail view.
        description: String(cardData.summary ?? row.description ?? ''),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      };
    });
  }

  // -- modelCard ------------------------------------------------------------

  async function modelCard(repoId: string): Promise<HfModelCard> {
    assertRepoId(repoId);

    const url = new URL(`${apiBaseUrl}/api/models/${repoId}`);
    // `blobs=true` is what populates `siblings[].size`.
    url.searchParams.set('blobs', 'true');

    const { headers } = await authHeaders({ accept: 'application/json' });
    const response = await fetchFn(url.toString(), { method: 'GET', headers });
    if (!response.ok) throw apiError(response, `loading the model card for ${repoId}`);

    const info = (await response.json()) as Record<string, unknown>;
    const cardData = (info.cardData ?? {}) as Record<string, unknown>;

    const rawLicense = cardData.license;
    const license = Array.isArray(rawLicense)
      ? rawLicense[0] != null
        ? String(rawLicense[0])
        : null
      : typeof rawLicense === 'string' && rawLicense.length > 0
        ? rawLicense
        : null;

    const siblings = Array.isArray(info.siblings)
      ? (info.siblings as Array<Record<string, unknown>>).map((s) => ({
          rfilename: String(s.rfilename ?? ''),
          sizeBytes: typeof s.size === 'number' ? s.size : null,
        }))
      : [];

    return {
      repoId,
      description: await readmeDescription(repoId, headers),
      license,
      siblings,
    };
  }

  /** Best-effort README fetch. A repo without one is normal, not an error. */
  async function readmeDescription(
    repoId: string,
    headers: Record<string, string>,
  ): Promise<string> {
    try {
      const response = await fetchFn(`${apiBaseUrl}/${repoId}/raw/main/README.md`, {
        method: 'GET',
        headers,
      });
      if (!response.ok) return '';
      return extractReadmeDescription(await response.text());
    } catch (err) {
      console.warn(`[hf-service] could not read the README for ${repoId}`, err);
      return '';
    }
  }

  // -- downloads ------------------------------------------------------------

  function requireRecord(handleId: string): DownloadRecord {
    const record = downloads.get(handleId);
    if (!record) throw new HfServiceError(`Unknown download handle "${handleId}".`);
    return record;
  }

  function snapshot(record: DownloadRecord): DownloadProgress {
    return {
      handleId: record.handleId,
      repoId: record.repoId,
      filename: record.filename,
      bytesReceived: record.bytesReceived,
      bytesTotal: record.bytesTotal,
      state: record.state,
      errorMessage: record.errorMessage,
    };
  }

  /**
   * Run one transfer attempt to completion, pause, cancellation or failure.
   *
   * Never throws: the caller holds only a handle, so the outcome is recorded
   * on the record and read back through `activeDownloads`.
   */
  async function transfer(record: DownloadRecord): Promise<void> {
    const controller = new AbortController();
    record.controller = controller;
    record.pauseRequested = false;
    record.state = 'downloading';
    record.errorMessage = null;

    let token: string | null = null;
    let sink: HfFileSink | null = null;
    let discardPart = false;

    try {
      const resumeFrom = (await fs.size(record.partPath)) ?? 0;
      const auth = await authHeaders({ accept: 'application/octet-stream' });
      token = auth.token;
      const headers = { ...auth.headers };
      if (resumeFrom > 0) headers.range = `bytes=${resumeFrom}-`;

      const requestUrl = `${apiBaseUrl}/${record.repoId}/resolve/main/${record.urlPath}`;
      const response = await fetchFn(requestUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      // 416 to a ranged request means "you already have everything" when the
      // `.part` is exactly the full length — a pause or quit that landed after
      // the last byte but before the rename. Failing here would strand a
      // complete model behind a Retry that can never succeed, and a Cancel
      // that deletes it. The server's reported total is authoritative; the
      // previous attempt's total is the fallback when it omits one.
      if (response.status === 416 && resumeFrom > 0) {
        const total =
          unsatisfiedRangeTotal(response) ?? (record.bytesTotal > 0 ? record.bytesTotal : null);
        if (total === resumeFrom) {
          await response.body?.cancel().catch(() => undefined);
          record.bytesReceived = resumeFrom;
          await finishCompleted(record);
          return;
        }
      }

      if (!response.ok) {
        throw apiError(response, `downloading ${record.filename}`);
      }

      // The Hub redirects file requests to its CDN. Follow that, but only to
      // an https Hub host (or the configured origin): a redirect anywhere
      // else could hand back a file the Hub never served.
      if (response.url && response.url !== requestUrl && !isTrustedSource(response.url)) {
        await response.body?.cancel().catch(() => undefined);
        throw new HfServiceError(
          `The download was redirected to ${new URL(response.url).origin}, which is not a Hugging Face host; the file was not saved.`,
        );
      }

      // A 200 in reply to a ranged request means the server ignored the range
      // and is sending the whole body. Appending it would corrupt the file.
      const isPartial = response.status === 206;
      const restarting = resumeFrom > 0 && !isPartial;
      const startOffset = restarting ? 0 : resumeFrom;

      record.bytesReceived = startOffset;
      const total = totalBytesOf(response);
      if (total === null) {
        await response.body?.cancel().catch(() => undefined);
        throw new HfServiceError(
          `The server did not report the file size for ${record.filename}, so the download cannot be checked for completeness or disk space.`,
        );
      }
      record.bytesTotal = total;

      await fs.ensureDir(dirname(record.partPath));
      const remaining = total - startOffset;
      const free = fs.freeBytes ? await fs.freeBytes(dirname(record.partPath)) : null;
      if (free !== null && free < remaining + DISK_HEADROOM_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        throw new HfServiceError(
          `Not enough disk space for ${record.filename}: it needs ${formatBytes(remaining)} more (plus ${formatBytes(DISK_HEADROOM_BYTES)} headroom), and ${formatBytes(free)} is free.`,
        );
      }
      sink =
        startOffset > 0
          ? await fs.openAppend(record.partPath)
          : await fs.openTruncate(record.partPath);

      const body = response.body;
      if (body) {
        const reader = body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            if (record.bytesReceived + value.length > total) {
              // More bytes than announced: the file is not what the Hub
              // described, and an unbounded body would fill the disk.
              await reader.cancel().catch(() => undefined);
              discardPart = true;
              throw new HfServiceError(
                `The server sent more than the ${total} bytes it announced for ${record.filename}; the partial file was discarded.`,
              );
            }
            await sink.write(value);
            record.bytesReceived += value.length;
          }
          if (controller.signal.aborted) {
            await reader.cancel().catch(() => undefined);
            break;
          }
        }
      }

      await sink.close();
      sink = null;

      if (controller.signal.aborted) {
        await finishAborted(record);
        return;
      }

      await finishCompleted(record);
    } catch (err) {
      if (sink) await sink.close().catch(() => undefined);
      if (controller.signal.aborted) {
        await finishAborted(record);
        return;
      }
      if (discardPart) await fs.remove(record.partPath).catch(() => undefined);
      const diskFull = (err as { code?: string } | null)?.code === 'ENOSPC';
      const message = diskFull
        ? `The disk is full. The ${record.bytesReceived} bytes already downloaded are kept; free up space, then retry to resume.`
        : err instanceof Error
          ? err.message
          : String(err);
      record.state = 'failed';
      record.errorMessage = redact(message, token);
    } finally {
      record.controller = null;
      record.running = null;
    }
  }

  /** Promote a fully received `.part` to its final name. */
  async function finishCompleted(record: DownloadRecord): Promise<void> {
    await fs.rename(record.partPath, record.finalPath);
    record.state = 'completed';
    record.bytesTotal = record.bytesReceived;
  }

  /** Settle a transfer that was aborted, honouring pause vs cancel semantics. */
  async function finishAborted(record: DownloadRecord): Promise<void> {
    if (record.pauseRequested) {
      record.state = 'paused';
      return;
    }
    record.state = 'cancelled';
    await fs.remove(record.partPath).catch(() => undefined);
  }

  /**
   * Full file size from `Content-Range` (ranged) or `Content-Length` (whole
   * body), or null when the server reports neither.
   */
  function totalBytesOf(response: Response): number | null {
    const contentRange = response.headers.get('content-range');
    const match = contentRange?.match(/\/(\d+)\s*$/);
    if (match?.[1]) return Number(match[1]);
    const length = Number(response.headers.get('content-length'));
    if (!Number.isFinite(length) || length <= 0) return null;
    // A 206 without a total is the remainder only; a 200 is the whole file.
    return response.status === 206 ? null : length;
  }

  /** https on a Hub host, or the configured origin itself. */
  function isTrustedSource(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.origin === new URL(apiBaseUrl).origin) return true;
    return parsed.protocol === 'https:' && isHubHost(parsed.hostname);
  }

  function launch(record: DownloadRecord): void {
    // Errors are recorded on the record, never thrown out of the loop, so the
    // promise cannot reject — but guard anyway so a bug here can't crash the
    // main process with an unhandled rejection.
    record.running = transfer(record).catch((err: unknown) => {
      record.state = 'failed';
      record.errorMessage = err instanceof Error ? err.message : String(err);
      record.controller = null;
      record.running = null;
    });
  }

  async function startDownload(
    repoId: string,
    filename: string,
    targetFolder: string,
  ): Promise<{ handleId: string }> {
    assertRepoId(repoId);
    // Resolving a relative folder would anchor it at the main process's cwd —
    // a destination nobody chose. The renderer always holds an absolute path
    // (the configured library folder or a native folder-picker result).
    if (!isAbsolute(targetFolder)) {
      throw new HfServiceError(`The target folder "${targetFolder}" must be an absolute path.`);
    }
    // `root` is the resolved form of `targetFolder`. Every filesystem call
    // below uses resolved paths so a caller passing `/models` on Windows and
    // the service's own `dirname(partPath)` never disagree about the location.
    const { root, full: finalPath, urlPath } = resolveWithinFolder(targetFolder, filename);

    if (!(await fs.isDirectory(root))) {
      throw new HfServiceError(`The target folder "${targetFolder}" does not exist.`);
    }

    // One transfer per destination. A second transfer to a file whose `.part`
    // another is still writing (a double-clicked Download) would send a Range
    // request and append into it — interleaved bytes, then a corrupt model
    // registered as complete. So a repeat request is idempotent: it gets the
    // existing handle. A failed record is retried in place rather than joined
    // by a rival, because cancelling the stale one would delete the `.part` the
    // new one is writing. Checked synchronously with the insert below (no
    // `await` between them), so two racing clicks cannot both get past it.
    const key = destinationKey(finalPath);
    const existing = [...downloads.values()].find(
      (r) => !TERMINAL.includes(r.state) && destinationKey(r.finalPath) === key,
    );
    if (existing) {
      if (existing.repoId !== repoId) {
        throw new HfServiceError(
          `"${filename}" is already being downloaded into that folder from ${existing.repoId}. Cancel that download first.`,
        );
      }
      if (existing.state === 'failed') launch(existing);
      return { handleId: existing.handleId };
    }

    const record: DownloadRecord = {
      handleId: nanoid(),
      repoId,
      filename,
      urlPath,
      finalPath,
      partPath: `${finalPath}.part`,
      bytesReceived: 0,
      bytesTotal: 0,
      state: 'pending',
      errorMessage: null,
      controller: null,
      running: null,
      pauseRequested: false,
    };
    downloads.set(record.handleId, record);
    launch(record);

    return { handleId: record.handleId };
  }

  async function pauseDownload(handleId: string): Promise<void> {
    const record = requireRecord(handleId);
    if (record.state === 'paused') return;
    if (TERMINAL.includes(record.state) || record.state === 'failed') {
      throw new HfServiceError(`Cannot pause a ${record.state} download.`);
    }
    record.pauseRequested = true;
    record.controller?.abort();
    await record.running;
  }

  async function resumeDownload(handleId: string): Promise<void> {
    const record = requireRecord(handleId);
    if (record.state === 'downloading' || record.state === 'pending') return;
    if (TERMINAL.includes(record.state)) {
      throw new HfServiceError(`Cannot resume a ${record.state} download.`);
    }
    launch(record);
  }

  async function cancelDownload(handleId: string): Promise<void> {
    const record = requireRecord(handleId);
    if (record.state === 'cancelled') return;
    if (record.state === 'completed') {
      throw new HfServiceError(
        'Cannot cancel a completed download — delete the file from the library instead.',
      );
    }
    record.pauseRequested = false;
    if (record.controller) {
      record.controller.abort();
      await record.running;
      return;
    }
    // Paused or failed: no loop to abort, so settle it here.
    record.state = 'cancelled';
    await fs.remove(record.partPath).catch(() => undefined);
  }

  return {
    search,
    modelCard,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,

    async activeDownloads(): Promise<DownloadProgress[]> {
      // Snapshots, not the records themselves — a renderer round-trip must not
      // be able to mutate the manager's state.
      return [...downloads.values()].map(snapshot);
    },

    async settled(handleId: string): Promise<void> {
      await requireRecord(handleId).running;
    },

    async dispose(): Promise<void> {
      await Promise.all(
        [...downloads.values()]
          .filter((r) => r.controller !== null)
          .map(async (r) => {
            r.pauseRequested = true;
            r.controller?.abort();
            await r.running;
          }),
      );
    },
  };
}
