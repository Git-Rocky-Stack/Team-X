/**
 * StructuredLogger file-sink specs.
 *
 * Audit F7 — `LoggerOptions.file` was a fully typed public option
 * (`{ path, maxSize?, maxFiles? }`) that the constructor never read and
 * `write()` never honoured; the body carried a bare
 * `// TODO: Add file logging support`. Any caller that configured a log
 * file got silence, with no error to tell them their logs were being
 * dropped on the floor.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StructuredLogger } from './logging.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'teamx-rag-log-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function readLines(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('StructuredLogger file sink', () => {
  it('appends each entry to the configured file as one JSON line', () => {
    const path = join(dir, 'rag.log');
    const logger = new StructuredLogger({ console: false, file: { path } });

    logger.logRetrieval({ event: 'retrieval', data: { query: 'alpha' } });
    logger.logRetrieval({ event: 'retrieval', data: { query: 'beta' } });

    const lines = readLines(path);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.event).toBe('retrieval');
    expect((lines[0]?.data as { query: string }).query).toBe('alpha');
    expect((lines[1]?.data as { query: string }).query).toBe('beta');
  });

  it('writes entries the level filter admits and drops the rest', () => {
    const path = join(dir, 'rag.log');
    const logger = new StructuredLogger({ console: false, minLevel: 'warn', file: { path } });

    // `logRetrieval` derives the level from the event name: anything
    // containing "failed" is an error, everything else is info. At
    // minLevel 'warn' only the former reaches any sink.
    logger.logRetrieval({ event: 'retrieval-failed', data: {} });
    logger.logRetrieval({ event: 'retrieval', data: {} });

    const events = readLines(path).map((l) => l.event);
    expect(events).toEqual(['retrieval-failed']);
  });

  it('rotates the file once it exceeds maxSize', () => {
    const path = join(dir, 'rag.log');
    const logger = new StructuredLogger({
      console: false,
      file: { path, maxSize: 200, maxFiles: 3 },
    });

    for (let i = 0; i < 40; i++) {
      logger.logRetrieval({ event: 'retrieval', data: { i, pad: 'x'.repeat(40) } });
    }

    const rotated = readdirSync(dir).filter((f) => f.startsWith('rag.log.'));
    expect(rotated.length).toBeGreaterThan(0);
    // The live file is always kept under the cap after a rotation.
    expect(statSync(path).size).toBeLessThanOrEqual(400);
  });

  it('keeps at most maxFiles rotated backups', () => {
    const path = join(dir, 'rag.log');
    const logger = new StructuredLogger({
      console: false,
      file: { path, maxSize: 100, maxFiles: 2 },
    });

    for (let i = 0; i < 60; i++) {
      logger.logRetrieval({ event: 'retrieval', data: { i, pad: 'y'.repeat(40) } });
    }

    const rotated = readdirSync(dir).filter((f) => f.startsWith('rag.log.'));
    expect(rotated.length).toBeLessThanOrEqual(2);
  });

  it('keeps no backups when maxFiles is 0', () => {
    // 0 means "no backups": rotation truncates the live file in place. It
    // used to fall through to the final rename and keep `rag.log.1` anyway.
    const path = join(dir, 'rag.log');
    const logger = new StructuredLogger({
      console: false,
      file: { path, maxSize: 100, maxFiles: 0 },
    });

    for (let i = 0; i < 20; i++) {
      logger.logRetrieval({ event: 'retrieval', data: { i, pad: 'z'.repeat(40) } });
    }

    expect(readdirSync(dir)).toEqual(['rag.log']);
    expect(statSync(path).size).toBeLessThanOrEqual(200);
    // The entry that triggered the last truncation is still there.
    const last = readLines(path).at(-1);
    expect((last?.data as { i: number }).i).toBe(19);
  });

  it('keeps writing when a rotation fails, and retries it next time', () => {
    // A rotation can fail transiently — on Windows a backup held open by a
    // tail or an antivirus scan throws EBUSY. That used to latch the whole
    // sink off for the life of the process. Here a directory squats on the
    // backup name, so every rotation throws until it is removed.
    const path = join(dir, 'rag.log');
    const blocker = join(dir, 'rag.log.1');
    mkdirSync(blocker);
    writeFileSync(join(blocker, 'held'), 'x', 'utf8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const logger = new StructuredLogger({
      console: false,
      file: { path, maxSize: 100, maxFiles: 1 },
    });
    for (let i = 0; i < 10; i++) {
      logger.logRetrieval({ event: 'retrieval', data: { i, pad: 'w'.repeat(40) } });
    }

    // Every entry landed in the live file despite the failing rotations,
    // and the failure was reported once, not once per line.
    expect(readLines(path).map((l) => (l.data as { i: number }).i)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(warn).toHaveBeenCalledTimes(1);

    // Once the obstruction clears, the next write rotates normally.
    rmSync(blocker, { recursive: true, force: true });
    logger.logRetrieval({ event: 'retrieval', data: { i: 10 } });

    expect(statSync(blocker).isFile()).toBe(true);
    expect(readLines(path).map((l) => (l.data as { i: number }).i)).toEqual([10]);
  });

  it('never throws when the log file cannot be written', () => {
    // `dir` itself is a directory — opening it for append always fails.
    const logger = new StructuredLogger({ console: false, file: { path: dir } });

    expect(() => logger.logRetrieval({ event: 'retrieval', data: {} })).not.toThrow();
  });

  it('does not create a file when no file sink is configured', () => {
    const logger = new StructuredLogger({ console: false });
    logger.logRetrieval({ event: 'retrieval', data: {} });

    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('appends to an existing log rather than truncating it', () => {
    const path = join(dir, 'rag.log');
    writeFileSync(path, `${JSON.stringify({ event: 'pre-existing' })}\n`, 'utf8');

    const logger = new StructuredLogger({ console: false, file: { path } });
    logger.logRetrieval({ event: 'retrieval', data: {} });

    const events = readLines(path).map((l) => l.event);
    expect(events).toEqual(['pre-existing', 'retrieval']);
  });
});
