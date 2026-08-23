/**
 * HfService specs — the seven `localGguf.hf.*` channels.
 *
 * All seven were Phase 1 not-implemented stubs. These specs define the
 * behaviour before any of it is written.
 *
 * Two properties get disproportionate coverage because they are the ones that
 * bite in production:
 *
 *   1. **Path containment.** `filename` arrives from the renderer and is used
 *      to build a path on disk. A `../` in it would write outside the folder
 *      the user chose. GGUF repos legitimately nest files one level deep
 *      (`Q4_K_M/model.gguf`), so the check cannot be a blanket "no slashes".
 *   2. **Resumability.** A 30 GB quantized model over a home connection will
 *      be interrupted. Pause must leave the partial file intact and resume
 *      must continue from its byte offset rather than restarting.
 */

import { resolve } from 'node:path';

/**
 * The service canonicalizes destinations with `path.resolve`, so expected
 * paths are built the same way. On Windows `resolve` prefixes the current
 * drive letter and `path.join` does not, so mixing the two would make every
 * download assertion fail on one OS only.
 */
const at = (...segments: string[]) => resolve(...segments);

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type HfFileSink, type HfFs, HfServiceError, createHfService } from './hf-service.js';

// ---------------------------------------------------------------------------
// In-memory filesystem double
// ---------------------------------------------------------------------------

function makeFs() {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>(['/models', 'C:\\models']);

  function sink(path: string, initial: Uint8Array): HfFileSink {
    let buf = initial;
    files.set(path, buf);
    return {
      async write(chunk: Uint8Array) {
        const next = new Uint8Array(buf.length + chunk.length);
        next.set(buf, 0);
        next.set(chunk, buf.length);
        buf = next;
        files.set(path, buf);
      },
      async close() {
        /* nothing to flush in memory */
      },
    };
  }

  const fs: HfFs = {
    async ensureDir(dir) {
      dirs.add(dir);
    },
    async isDirectory(path) {
      return dirs.has(path);
    },
    async size(path) {
      return files.get(path)?.length ?? null;
    },
    async openAppend(path) {
      return sink(path, files.get(path) ?? new Uint8Array());
    },
    async openTruncate(path) {
      return sink(path, new Uint8Array());
    },
    async rename(from, to) {
      const data = files.get(from);
      if (data === undefined) throw new Error(`ENOENT: ${from}`);
      files.set(to, data);
      files.delete(from);
    },
    async remove(path) {
      files.delete(path);
    },
  };

  return { fs, files, dirs };
}

// ---------------------------------------------------------------------------
// HTTP doubles
// ---------------------------------------------------------------------------

const API = 'https://huggingface.co';

/**
 * `RequestInit` / `ResponseInit` are type-only DOM lib identifiers, not runtime
 * globals, so eslint's `no-undef` flags them by name even though TypeScript
 * resolves them fine. Deriving the same types from `fetch` and `Response`
 * avoids the bare identifiers without loosening the repo's lint config.
 */
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type ResponseOptions = NonNullable<ConstructorParameters<typeof Response>[1]>;

function json(body: unknown, init: ResponseOptions = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/** Rejects with an AbortError as soon as `signal` fires; never resolves otherwise. */
function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const fail = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
}

/**
 * A body stream that yields `chunks`, optionally stalling before the second
 * one until `hold` opens.
 *
 * The stall races the request's abort signal because that is what a real
 * `fetch` body does: aborting the request errors the body stream and the
 * pending `reader.read()` rejects. Without the race the stream would ignore
 * the abort, `read()` would never settle, and pause / cancel / dispose would
 * appear to hang — a property of the double, not of the service.
 */
function streamOf(
  chunks: Uint8Array[],
  hold?: { release: Promise<void> },
  signal?: AbortSignal | null,
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i === 1 && hold) {
        await (signal ? Promise.race([hold.release, whenAborted(signal)]) : hold.release);
      }
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[i];
      i += 1;
      if (chunk) controller.enqueue(chunk);
    },
  });
}

const bytes = (n: number, fill = 65) => new Uint8Array(n).fill(fill);

interface Route {
  match: (url: string) => boolean;
  respond: (url: string, init?: FetchInit) => Response | Promise<Response>;
}

function makeFetch(routes: Route[]) {
  const calls: Array<{ url: string; init?: FetchInit }> = [];
  const fetchFn = vi.fn(async (input: unknown, init?: FetchInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find((r) => r.match(url));
    if (!route) return new Response('no route', { status: 404 });

    // Honour abort so pause/cancel tests exercise the real path.
    const signal = init?.signal;
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const response = await route.respond(url, init);
    return response;
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

const MODELS_LIST = [
  {
    id: 'Qwen/Qwen3-8B-GGUF',
    downloads: 91_234,
    likes: 412,
    tags: ['gguf', 'text-generation'],
    cardData: { summary: 'Qwen3 8B in GGUF form.' },
  },
  { id: 'bartowski/Llama-3.3-70B-GGUF', downloads: 55_000, likes: 220, tags: ['gguf'] },
];

const MODEL_INFO = {
  id: 'Qwen/Qwen3-8B-GGUF',
  cardData: { license: 'apache-2.0' },
  siblings: [
    { rfilename: 'README.md', size: 4_096 },
    { rfilename: 'Qwen3-8B-Q4_K_M.gguf', size: 4_920_000_000 },
    { rfilename: 'Q8_0/Qwen3-8B-Q8_0.gguf' },
  ],
};

const README = `---
license: apache-2.0
tags:
  - gguf
---

# Qwen3-8B-GGUF

GGUF quantizations of Qwen3 8B for llama.cpp.
`;

function buildService(
  overrides: {
    routes?: Route[];
    getToken?: () => Promise<string | null>;
  } = {},
) {
  const { fs, files, dirs } = makeFs();
  const routes: Route[] = overrides.routes ?? [
    { match: (u) => u.includes('/api/models?'), respond: () => json(MODELS_LIST) },
    { match: (u) => u.includes('/api/models/'), respond: () => json(MODEL_INFO) },
    { match: (u) => u.endsWith('README.md'), respond: () => new Response(README, { status: 200 }) },
  ];
  const { fetchFn, calls } = makeFetch(routes);
  const service = createHfService({
    fetchFn,
    fs,
    apiBaseUrl: API,
    getToken: overrides.getToken,
  });
  return { service, fs, files, dirs, calls, fetchFn };
}

// ===========================================================================
// search
// ===========================================================================

describe('HfService — search', () => {
  it('queries the HF models API scoped to GGUF repositories', async () => {
    const { service, calls } = buildService();
    await service.search('qwen3', {});

    const url = new URL(calls[0]?.url ?? '');
    expect(url.origin + url.pathname).toBe(`${API}/api/models`);
    expect(url.searchParams.get('search')).toBe('qwen3');
    expect(url.searchParams.get('filter')).toBe('gguf');
  });

  it('maps API rows onto HfSearchResult', async () => {
    const { service } = buildService();
    const results = await service.search('qwen3', {});

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      repoId: 'Qwen/Qwen3-8B-GGUF',
      downloads: 91_234,
      likes: 412,
      description: 'Qwen3 8B in GGUF form.',
      tags: ['gguf', 'text-generation'],
    });
  });

  it('leaves description empty when the API supplies none, rather than inventing one', async () => {
    const { service } = buildService();
    const results = await service.search('llama', {});
    expect(results[1]?.description).toBe('');
  });

  it('forwards known filters and ignores unknown keys', async () => {
    const { service, calls } = buildService();
    await service.search('llama', {
      author: 'bartowski',
      limit: 5,
      sort: 'downloads',
      direction: -1,
      nonsense: 'ignored',
    });

    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('author')).toBe('bartowski');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('sort')).toBe('downloads');
    expect(url.searchParams.get('direction')).toBe('-1');
    expect(url.searchParams.has('nonsense')).toBe(false);
  });

  it('sends the Hugging Face token when one is configured', async () => {
    const { service, calls } = buildService({ getToken: async () => 'hf_abc123' });
    await service.search('qwen3', {});
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer hf_abc123');
  });

  it('browses anonymously when no token is configured', async () => {
    const { service, calls } = buildService();
    await service.search('qwen3', {});
    expect(new Headers(calls[0]?.init?.headers).has('authorization')).toBe(false);
  });

  it('surfaces a rate limit as hf-rate-limited carrying Retry-After', async () => {
    const { service } = buildService({
      routes: [
        {
          match: () => true,
          respond: () =>
            new Response('slow down', { status: 429, headers: { 'retry-after': '30' } }),
        },
      ],
    });

    await expect(service.search('qwen3', {})).rejects.toMatchObject({
      error: { kind: 'hf-rate-limited', retryAfterS: 30 },
    });
  });

  it('throws on any other API failure instead of returning an empty list', async () => {
    const { service } = buildService({
      routes: [{ match: () => true, respond: () => new Response('boom', { status: 503 }) }],
    });
    await expect(service.search('qwen3', {})).rejects.toBeInstanceOf(HfServiceError);
  });

  it('returns an empty array when the API returns no matches', async () => {
    const { service } = buildService({
      routes: [{ match: () => true, respond: () => json([]) }],
    });
    await expect(service.search('nothing-matches-this', {})).resolves.toEqual([]);
  });
});

// ===========================================================================
// modelCard
// ===========================================================================

describe('HfService — modelCard', () => {
  it('returns the repo files with their byte sizes', async () => {
    const { service } = buildService();
    const card = await service.modelCard('Qwen/Qwen3-8B-GGUF');

    expect(card.repoId).toBe('Qwen/Qwen3-8B-GGUF');
    expect(card.siblings).toEqual([
      { rfilename: 'README.md', sizeBytes: 4_096 },
      { rfilename: 'Qwen3-8B-Q4_K_M.gguf', sizeBytes: 4_920_000_000 },
      { rfilename: 'Q8_0/Qwen3-8B-Q8_0.gguf', sizeBytes: null },
    ]);
  });

  it('requests blob metadata so sizes are populated', async () => {
    const { service, calls } = buildService();
    await service.modelCard('Qwen/Qwen3-8B-GGUF');
    const infoCall = calls.find((c) => c.url.includes('/api/models/'));
    expect(new URL(infoCall?.url ?? '').searchParams.get('blobs')).toBe('true');
  });

  it('reads the description from the README with front-matter and heading stripped', async () => {
    const { service } = buildService();
    const card = await service.modelCard('Qwen/Qwen3-8B-GGUF');
    expect(card.description).toBe('GGUF quantizations of Qwen3 8B for llama.cpp.');
  });

  it('still returns a card when the repo has no README', async () => {
    const { service } = buildService({
      routes: [
        { match: (u) => u.includes('/api/models/'), respond: () => json(MODEL_INFO) },
        { match: (u) => u.endsWith('README.md'), respond: () => new Response('', { status: 404 }) },
      ],
    });
    const card = await service.modelCard('Qwen/Qwen3-8B-GGUF');
    expect(card.description).toBe('');
    expect(card.siblings.length).toBeGreaterThan(0);
  });

  it('reads a string license from the card data', async () => {
    const { service } = buildService();
    expect((await service.modelCard('Qwen/Qwen3-8B-GGUF')).license).toBe('apache-2.0');
  });

  it('takes the first entry when the license is an array', async () => {
    const { service } = buildService({
      routes: [
        {
          match: (u) => u.includes('/api/models/'),
          respond: () => json({ ...MODEL_INFO, cardData: { license: ['mit', 'apache-2.0'] } }),
        },
        { match: () => true, respond: () => new Response('', { status: 404 }) },
      ],
    });
    expect((await service.modelCard('a/b')).license).toBe('mit');
  });

  it('reports a null license rather than guessing when none is declared', async () => {
    const { service } = buildService({
      routes: [
        {
          match: (u) => u.includes('/api/models/'),
          respond: () => json({ ...MODEL_INFO, cardData: {} }),
        },
        { match: () => true, respond: () => new Response('', { status: 404 }) },
      ],
    });
    expect((await service.modelCard('a/b')).license).toBeNull();
  });

  it.each([
    ['no owner', 'qwen3-gguf'],
    ['traversal', '../../etc'],
    ['empty', ''],
  ])('rejects a malformed repo id (%s) without making a request', async (_label, repoId) => {
    const { service, calls } = buildService();
    await expect(service.modelCard(repoId)).rejects.toThrow(/repo/i);
    expect(calls).toHaveLength(0);
  });
});

// ===========================================================================
// downloads
// ===========================================================================

const REPO = 'Qwen/Qwen3-8B-GGUF';
const FILE = 'Qwen3-8B-Q4_K_M.gguf';
const FOLDER = '/models';

function downloadRoutes(
  body: () => ReadableStream<Uint8Array>,
  init: ResponseOptions = { status: 200, headers: { 'content-length': '300' } },
): Route[] {
  return [
    {
      match: (u) => u.includes('/resolve/'),
      respond: () => new Response(body(), init),
    },
  ];
}

describe('HfService — startDownload', () => {
  it('returns a handle and writes the file into the chosen folder', async () => {
    const { service, files } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(100), bytes(100), bytes(100)])),
    });

    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    expect(handleId).toBeTruthy();
    await service.settled(handleId);

    expect(files.get(at(FOLDER, FILE))?.length).toBe(300);
  });

  it('downloads into a .part file and renames it only once complete', async () => {
    const gate = { release: Promise.resolve() };
    let releaseGate: () => void = () => undefined;
    gate.release = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const { service, files } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(100), bytes(200)], gate)),
    });

    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    // First chunk has landed; the transfer is still in flight.
    await vi.waitFor(() => expect(files.has(at(FOLDER, `${FILE}.part`))).toBe(true));
    expect(files.has(at(FOLDER, FILE))).toBe(false);

    releaseGate();
    await service.settled(handleId);

    expect(files.has(at(FOLDER, `${FILE}.part`))).toBe(false);
    expect(files.get(at(FOLDER, FILE))?.length).toBe(300);
  });

  it('requests the file from the repo resolve endpoint', async () => {
    const { service, calls } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    expect(calls[0]?.url).toBe(`${API}/${REPO}/resolve/main/${FILE}`);
  });

  it('percent-encodes each filename segment in the download URL', async () => {
    // Real GGUF repos publish filenames with spaces. Interpolated raw they
    // produce an invalid URL, and a `#` would truncate the request into a
    // fragment — the server would be asked for the wrong file, or none.
    const { service, calls } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    const { handleId } = await service.startDownload(REPO, 'Meta Llama 3.gguf', FOLDER);
    await service.settled(handleId);

    expect(calls[0]?.url).toBe(`${API}/${REPO}/resolve/main/Meta%20Llama%203.gguf`);
  });

  it('encodes a fragment character rather than letting it truncate the URL', async () => {
    const { service, calls } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    const { handleId } = await service.startDownload(REPO, 'weird#name.gguf', FOLDER);
    await service.settled(handleId);

    expect(calls[0]?.url).toBe(`${API}/${REPO}/resolve/main/weird%23name.gguf`);
  });

  it('keeps the path separator unencoded for a nested repo file', async () => {
    // encodeURIComponent on the whole string would turn `/` into `%2F` and
    // ask the Hub for a single oddly-named file that does not exist.
    const { service, calls } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    const { handleId } = await service.startDownload(REPO, 'Q8_0/model name.gguf', FOLDER);
    await service.settled(handleId);

    expect(calls[0]?.url).toBe(`${API}/${REPO}/resolve/main/Q8_0/model%20name.gguf`);
  });

  it('sends the Hugging Face token so gated repos can be fetched', async () => {
    const { service, calls } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
      getToken: async () => 'hf_abc123',
    });
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer hf_abc123');
  });

  it('creates the destination directory for a nested repo path', async () => {
    const { service, dirs, files } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    const nested = 'Q8_0/Qwen3-8B-Q8_0.gguf';
    const { handleId } = await service.startDownload(REPO, nested, FOLDER);
    await service.settled(handleId);

    expect(dirs.has(at(FOLDER, 'Q8_0'))).toBe(true);
    expect(files.has(at(FOLDER, nested))).toBe(true);
  });

  it.each([
    ['parent traversal', '../escape.gguf'],
    ['nested traversal', 'sub/../../escape.gguf'],
    ['absolute posix', '/etc/passwd'],
    ['absolute windows', 'C:\\Windows\\System32\\drivers\\etc\\hosts'],
    ['backslash traversal', '..\\escape.gguf'],
    ['empty', ''],
    ['dot', '.'],
  ])('refuses a filename that escapes the target folder (%s)', async (_label, filename) => {
    const { service, calls } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    await expect(service.startDownload(REPO, filename, FOLDER)).rejects.toThrow(/filename/i);
    expect(calls).toHaveLength(0);
  });

  it('refuses a malformed repo id', async () => {
    const { service } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    await expect(service.startDownload('not-a-repo', FILE, FOLDER)).rejects.toThrow(/repo/i);
  });

  it('refuses a target folder that does not exist', async () => {
    const { service } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    await expect(service.startDownload(REPO, FILE, '/nope')).rejects.toThrow(/folder/i);
  });
});

describe('HfService — progress reporting', () => {
  it('reports bytes received against the total and a completed state', async () => {
    const { service } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(100), bytes(200)])),
    });
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    const [progress] = await service.activeDownloads();
    expect(progress).toMatchObject({
      handleId,
      repoId: REPO,
      filename: FILE,
      bytesReceived: 300,
      bytesTotal: 300,
      state: 'completed',
      errorMessage: null,
    });
  });

  it('tracks several concurrent downloads independently', async () => {
    const { service } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    const a = await service.startDownload(REPO, 'a.gguf', FOLDER);
    const b = await service.startDownload(REPO, 'b.gguf', FOLDER);
    await service.settled(a.handleId);
    await service.settled(b.handleId);

    const all = await service.activeDownloads();
    expect(all.map((d) => d.filename).sort()).toEqual(['a.gguf', 'b.gguf']);
  });
});

describe('HfService — pause, resume and cancel', () => {
  /**
   * A 300-byte transfer that stalls after its first 100 bytes until the gate
   * opens. Only the FIRST attempt stalls, so a resumed transfer runs to
   * completion and the range request can be inspected against a finished file.
   */
  function gatedService() {
    let releaseGate: () => void = () => undefined;
    const gate = {
      release: new Promise<void>((res) => {
        releaseGate = res;
      }),
    };
    let attempt = 0;
    const built = buildService({
      routes: [
        {
          match: (u) => u.includes('/resolve/'),
          respond: (_u, init) => {
            attempt += 1;
            const ranged = new Headers(init?.headers).has('range');
            if (ranged) {
              // Resume: serve only the remaining 200 bytes.
              return new Response(streamOf([bytes(200)]), {
                status: 206,
                headers: { 'content-range': 'bytes 100-299/300', 'content-length': '200' },
              });
            }
            return new Response(
              streamOf([bytes(100), bytes(200)], attempt === 1 ? gate : undefined, init?.signal),
              { status: 200, headers: { 'content-length': '300' } },
            );
          },
        },
      ],
    });
    return { ...built, releaseGate };
  }

  it('pause stops the transfer and keeps the partial file for later', async () => {
    const { service, files } = gatedService();
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await vi.waitFor(() => expect(files.has(at(FOLDER, `${FILE}.part`))).toBe(true));

    await service.pauseDownload(handleId);
    await service.settled(handleId);

    const [progress] = await service.activeDownloads();
    expect(progress?.state).toBe('paused');
    expect(files.has(at(FOLDER, `${FILE}.part`))).toBe(true);
    expect(files.has(at(FOLDER, FILE))).toBe(false);
  });

  it('resume asks the server for the remaining byte range and completes the file', async () => {
    const { service, files, calls } = gatedService();
    const first = await service.startDownload(REPO, FILE, FOLDER);
    await vi.waitFor(() => expect(files.get(at(FOLDER, `${FILE}.part`))?.length).toBe(100));
    await service.pauseDownload(first.handleId);

    await service.resumeDownload(first.handleId);
    await service.settled(first.handleId);

    expect(new Headers(calls.at(-1)?.init?.headers).get('range')).toBe('bytes=100-');
    // 100 already on disk + 200 resumed = the whole 300-byte file, appended
    // rather than restarted.
    expect(files.get(at(FOLDER, FILE))?.length).toBe(300);
    expect((await service.activeDownloads())[0]?.state).toBe('completed');
  });

  it('restarts from zero when the server ignores the range request', async () => {
    // Some LAN proxies answer 200 with the whole body even when asked for a
    // range. Appending that to the existing .part would corrupt the file.
    const { service, files } = buildService({
      routes: [
        {
          match: (u) => u.includes('/resolve/'),
          respond: () =>
            new Response(streamOf([bytes(300)]), {
              status: 200,
              headers: { 'content-length': '300' },
            }),
        },
      ],
    });
    // Pre-seed a stale partial file, as an interrupted earlier attempt would.
    files.set(at(FOLDER, `${FILE}.part`), bytes(100, 66));

    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    expect(files.get(at(FOLDER, FILE))?.length).toBe(300);
  });

  it('cancel stops the transfer and deletes the partial file', async () => {
    const { service, files } = gatedService();
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await vi.waitFor(() => expect(files.has(at(FOLDER, `${FILE}.part`))).toBe(true));

    await service.cancelDownload(handleId);
    await service.settled(handleId);

    const [progress] = await service.activeDownloads();
    expect(progress?.state).toBe('cancelled');
    expect(files.has(at(FOLDER, `${FILE}.part`))).toBe(false);
  });

  it.each(['pauseDownload', 'resumeDownload', 'cancelDownload'] as const)(
    '%s throws for an unknown handle instead of silently succeeding',
    async (method) => {
      const { service } = buildService();
      await expect(service[method]('ghost')).rejects.toThrow(/handle/i);
    },
  );

  it('refuses to pause a download that already finished', async () => {
    const { service } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    await expect(service.pauseDownload(handleId)).rejects.toThrow(/completed/i);
  });

  it('dispose pauses everything in flight so partial files survive a quit', async () => {
    const { service, files } = gatedService();
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await vi.waitFor(() => expect(files.has(at(FOLDER, `${FILE}.part`))).toBe(true));

    await service.dispose();

    expect((await service.activeDownloads())[0]?.state).toBe('paused');
    expect(files.has(at(FOLDER, `${FILE}.part`))).toBe(true);
    expect((await service.activeDownloads())[0]?.handleId).toBe(handleId);
  });
});

describe('HfService — download failures', () => {
  it('records a rate limit as a failed download naming the retry delay', async () => {
    const { service } = buildService({
      routes: [
        {
          match: (u) => u.includes('/resolve/'),
          respond: () =>
            new Response('slow down', { status: 429, headers: { 'retry-after': '60' } }),
        },
      ],
    });
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    const [progress] = await service.activeDownloads();
    expect(progress?.state).toBe('failed');
    expect(progress?.errorMessage).toMatch(/60/);
  });

  it('records an HTTP failure with its status rather than a silent stall', async () => {
    const { service, files } = buildService({
      routes: [
        {
          match: (u) => u.includes('/resolve/'),
          respond: () => new Response('gone', { status: 404 }),
        },
      ],
    });
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    const [progress] = await service.activeDownloads();
    expect(progress?.state).toBe('failed');
    expect(progress?.errorMessage).toMatch(/404/);
    expect(files.has(at(FOLDER, FILE))).toBe(false);
  });

  it('never leaks the Hugging Face token into a recorded error', async () => {
    const { service } = buildService({
      routes: [
        {
          match: (u) => u.includes('/resolve/'),
          respond: () => {
            throw new Error('socket hang up while sending Bearer hf_abc123');
          },
        },
      ],
      getToken: async () => 'hf_abc123',
    });
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    const [progress] = await service.activeDownloads();
    expect(progress?.state).toBe('failed');
    expect(progress?.errorMessage).not.toContain('hf_abc123');
  });

  it('a failed download can be retried with resume', async () => {
    let attempt = 0;
    const { service, files } = buildService({
      routes: [
        {
          match: (u) => u.includes('/resolve/'),
          respond: () => {
            attempt += 1;
            if (attempt === 1) return new Response('boom', { status: 503 });
            return new Response(streamOf([bytes(300)]), {
              status: 200,
              headers: { 'content-length': '300' },
            });
          },
        },
      ],
    });

    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);
    expect((await service.activeDownloads())[0]?.state).toBe('failed');

    await service.resumeDownload(handleId);
    await service.settled(handleId);

    expect((await service.activeDownloads())[0]?.state).toBe('completed');
    expect(files.get(at(FOLDER, FILE))?.length).toBe(300);
  });
});

describe('HfService — activeDownloads snapshot', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('returns copies so a caller cannot mutate internal state', async () => {
    const { service } = buildService({
      routes: downloadRoutes(() => streamOf([bytes(300)])),
    });
    const { handleId } = await service.startDownload(REPO, FILE, FOLDER);
    await service.settled(handleId);

    const first = await service.activeDownloads();
    const entry = first[0];
    if (entry) entry.bytesReceived = -1;

    expect((await service.activeDownloads())[0]?.bytesReceived).toBe(300);
  });
});
