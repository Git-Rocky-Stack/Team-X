// packages/local-gguf-runtime/src/metadata/parser.test.ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ParserError, parseGgufMetadata } from './parser';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'parser.test-fixtures');

interface ManifestEntry {
  id: string;
  file: string;
  label: string;
  repo: string | null;
  sourcePath: string | null;
  expected: {
    arch: string | null;
    quant: string | null;
    ctxMax: number | null;
    embedding: boolean | null;
    toolCapable: boolean | null;
    failure: string | null;
  };
}

const manifest: ManifestEntry[] = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8'),
);

function readFixture(file: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, file));
}

describe('parseGgufMetadata — S3 fixtures (data-driven from manifest.json)', () => {
  it('loads all 12 manifest fixtures', () => {
    expect(manifest).toHaveLength(12);
  });

  for (const entry of manifest.filter((e) => e.expected.failure === null)) {
    describe(entry.id, () => {
      const meta = () => parseGgufMetadata(readFixture(entry.file), entry.file);

      it(`arch === ${entry.expected.arch}`, () => {
        expect(meta().arch).toBe(entry.expected.arch);
      });

      it(`quant === ${entry.expected.quant}`, () => {
        expect(meta().quant).toBe(entry.expected.quant);
      });

      it(`contextMax === ${entry.expected.ctxMax}`, () => {
        expect(meta().contextMax).toBe(entry.expected.ctxMax);
      });

      it(`isEmbeddingModel === ${entry.expected.embedding}`, () => {
        expect(meta().isEmbeddingModel).toBe(entry.expected.embedding);
      });

      it(`isToolCapable === ${entry.expected.toolCapable}`, () => {
        expect(meta().isToolCapable).toBe(entry.expected.toolCapable);
      });
    });
  }

  for (const entry of manifest.filter((e) => e.expected.failure !== null)) {
    it(`${entry.id} throws ParserError (${entry.expected.failure})`, () => {
      const [kind] = (entry.expected.failure as string).split(':');
      try {
        parseGgufMetadata(readFixture(entry.file), entry.file);
        throw new Error('expected parseGgufMetadata to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ParserError);
        expect((e as ParserError).error.kind).toBe(kind);
      }
    });
  }
});

describe('parseGgufMetadata — contract invariants on a known-good fixture', () => {
  const meta = parseGgufMetadata(readFixture('01-llama-3.1-8b-q4km.head.gguf'), 'fixture-01');

  it('sets fileSizeBytes to the buffer length', () => {
    expect(meta.fileSizeBytes).toBe(readFixture('01-llama-3.1-8b-q4km.head.gguf').length);
  });

  it('always reports sha256 as null (computed elsewhere)', () => {
    expect(meta.sha256).toBeNull();
  });

  it('paramsBillions is a positive number or null', () => {
    expect(meta.paramsBillions === null || typeof meta.paramsBillions === 'number').toBe(true);
    if (typeof meta.paramsBillions === 'number') {
      expect(meta.paramsBillions).toBeGreaterThan(0);
    }
  });

  it('chatTemplate is a string or null (absent in head fixtures → null)', () => {
    expect(meta.chatTemplate === null || typeof meta.chatTemplate === 'string').toBe(true);
  });

  it('defaults sourcePath to empty string when omitted', () => {
    // Smoke: parsing with no sourcePath argument must not throw on a good file.
    expect(() => parseGgufMetadata(readFixture('01-llama-3.1-8b-q4km.head.gguf'))).not.toThrow();
  });
});

describe('parseGgufMetadata — error handling (focused unit tests)', () => {
  it('throws gguf-corrupt for a buffer that is too small (< 24 bytes)', () => {
    try {
      parseGgufMetadata(Buffer.from('GGUF'), 'tiny');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      expect((e as ParserError).error.kind).toBe('gguf-corrupt');
    }
  });

  it('throws gguf-corrupt for missing / garbage magic', () => {
    const buf = Buffer.alloc(64);
    buf.write('XXXX', 0, 'ascii'); // wrong magic
    buf.writeUInt32LE(3, 4); // version
    try {
      parseGgufMetadata(buf, 'garbage-magic');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      expect((e as ParserError).error.kind).toBe('gguf-corrupt');
    }
  });

  it('throws gguf-parse-failed (with a reason) when truncated right after the header', () => {
    // Valid magic + a complete fixed header that *declares* one KV pair, but the
    // buffer ends immediately — the first KV cannot even begin to be read.
    const buf = Buffer.alloc(24);
    buf.write('GGUF', 0, 'ascii');
    buf.writeUInt32LE(3, 4); // version
    buf.writeBigUInt64LE(0n, 8); // tensorCount
    buf.writeBigUInt64LE(1n, 16); // kvCount = 1, but no KV bytes follow
    try {
      parseGgufMetadata(buf, 'truncated-after-header');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      expect((e as ParserError).error.kind).toBe('gguf-parse-failed');
      expect((e as ParserError).error).toHaveProperty('reason');
      expect(typeof (e as ParserError & { error: { reason: string } }).error.reason).toBe('string');
    }
  });

  it('throws gguf-parse-failed for an unsupported version (e.g. v1 or v99)', () => {
    const buf = Buffer.alloc(24);
    buf.write('GGUF', 0, 'ascii');
    buf.writeUInt32LE(99, 4); // unsupported version
    try {
      parseGgufMetadata(buf, 'bad-version');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParserError);
      expect((e as ParserError).error.kind).toBe('gguf-parse-failed');
    }
  });

  it('carries the source path through into the thrown error', () => {
    try {
      parseGgufMetadata(Buffer.from('NOPE'), '/some/path/model.gguf');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as ParserError).error).toHaveProperty('path', '/some/path/model.gguf');
    }
  });
});
