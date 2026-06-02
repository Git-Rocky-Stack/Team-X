// packages/local-gguf-runtime/src/library/folder-watcher.ts
//
// Chokidar-backed folder watcher with 250 ms debounce and .gguf-only filter.
//
// Only filesystem events for `.gguf` files (case-insensitive) are forwarded.
// Rapid bursts of changes on the same path are collapsed: the Map key is the
// path, so the last event type wins within a debounce window. The actual flush
// happens once per window via a single setTimeout rather than per-event, so
// consumers (LibraryService) receive a compact batch rather than a firehose.
//
// The chokidar watcher is injected via opts.chokidarFactory to keep this
// module unit-testable without touching the real filesystem.

import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FolderWatcherOptions {
  /** Watch subdirectories when true; only the root folder when false. */
  recursive: boolean;
  /**
   * Seam for tests: inject a fake chokidar.watch function. Production callers
   * omit this and get the real chokidar.watch.
   */
  chokidarFactory?: typeof chokidar.watch;
  /** Debounce window in milliseconds. Defaults to 250. */
  debounceMs?: number;
}

/** The payload emitted on the 'change' event. */
export interface FolderWatcherChangeEvent {
  type: 'add' | 'unlink';
  path: string;
}

/** EventEmitter extended with an async close(). */
export interface FolderWatcher extends EventEmitter {
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const GGUF_RE = /\.gguf$/i;

/**
 * Create a folder watcher that emits debounced 'change' events for `.gguf`
 * files added or removed under `folder`.
 *
 * Events:
 *   'change' (FolderWatcherChangeEvent) — one per distinct path per debounce window
 *   'error'  (Error)                    — forwarded verbatim from chokidar
 */
export function createFolderWatcher(folder: string, opts: FolderWatcherOptions): FolderWatcher {
  const emitter = new EventEmitter() as FolderWatcher;
  const factory = opts.chokidarFactory ?? chokidar.watch;
  const debounceMs = opts.debounceMs ?? 250;

  const w = factory(folder, {
    persistent: true,
    ignoreInitial: true,
    depth: opts.recursive ? undefined : 0,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  // Pending events keyed by path — last event type per path wins.
  const pending = new Map<string, FolderWatcherChangeEvent>();
  let flushTimer: NodeJS.Timeout | null = null;

  function scheduleFlush(): void {
    // Only one timer per window — arrivals within the window extend nothing;
    // we fire once at debounceMs after the FIRST event in the batch.
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      for (const e of pending.values()) emitter.emit('change', e);
      pending.clear();
    }, debounceMs);
  }

  function enqueue(type: 'add' | 'unlink', path: string): void {
    if (!GGUF_RE.test(path)) return;
    pending.set(path, { type, path });
    scheduleFlush();
  }

  w.on('add', (p: string) => enqueue('add', p));
  w.on('unlink', (p: string) => enqueue('unlink', p));
  w.on('error', (e: Error) => emitter.emit('error', e));

  emitter.close = async (): Promise<void> => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await w.close();
  };

  return emitter;
}
