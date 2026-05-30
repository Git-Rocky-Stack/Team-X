/**
 * Migration 0036 — Local & Networked GGUF Support table verification
 * (v3.3.0 — Phase 1, spec § 7).
 *
 * Pure migration-shape test — the repos land in sibling tasks. Modeled on
 * `0013-org-edges-migration.test.ts`: drives the real migration chain through
 * `makeTestDb()` (sql.js + `PRAGMA foreign_keys = ON`) and introspects with
 * PRAGMA against `ctx.raw`. Verifies:
 *   1. All five tables exist with the expected column inventory + PKs.
 *   2. Indexes present (4 on local_models, 1 on benchmarks, 1 on watch_folders).
 *   3. ON DELETE CASCADE: endpoint → models, model → advanced_params, model →
 *      benchmarks.
 *   4. CHECK constraints fire: source_type union, status union, privacy_tier,
 *      boolean 0/1 domains, and the source-shape cross-constraint.
 *   5. The forward migration applies in well under 100 ms on an empty DB
 *      (Phase 1 structural perf target — master plan § CR-6).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from './test-helpers.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const migration0036Path = join(thisDir, 'migrations', '0036_local_gguf.sql');

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

const NOW = 1779081600000;

describe('migration 0036 — local gguf tables', () => {
  let ctx: TestDbHandle;

  beforeEach(async () => {
    ctx = await makeTestDb();
  });

  afterEach(() => {
    ctx.close();
  });

  function tableInfo(name: string): TableInfoRow[] {
    const stmt = ctx.raw.prepare(`PRAGMA table_info('${name}')`);
    const rows: TableInfoRow[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as TableInfoRow);
    stmt.free();
    return rows;
  }

  function indexNames(table: string): string[] {
    const stmt = ctx.raw.prepare(`PRAGMA index_list('${table}')`);
    const names: string[] = [];
    while (stmt.step()) names.push((stmt.getAsObject() as unknown as IndexListRow).name);
    stmt.free();
    return names;
  }

  function count(table: string): number {
    const stmt = ctx.raw.prepare(`SELECT COUNT(*) AS c FROM ${table}`);
    stmt.step();
    const { c } = stmt.getAsObject() as { c: number };
    stmt.free();
    return c;
  }

  function insertEndpoint(id: string): void {
    ctx.raw.run(
      `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
       VALUES (?, ?, ?, 'Local', 'unknown', ?, ?)`,
      [id, `EP ${id}`, 'http://192.168.1.50:1234', NOW, NOW],
    );
  }

  function insertFileModel(id: string): void {
    ctx.raw.run(
      `INSERT INTO local_models (id, display_name, source_type, source_path, created_at, updated_at)
       VALUES (?, ?, 'file', ?, ?, ?)`,
      [id, `M ${id}`, `/models/${id}.gguf`, NOW, NOW],
    );
  }

  // ---------------------------------------------------------------------------
  // 1. Tables + columns
  // ---------------------------------------------------------------------------

  it('creates all five local-gguf tables', () => {
    const stmt = ctx.raw.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'local_model%' ORDER BY name`,
    );
    const names: string[] = [];
    while (stmt.step()) names.push((stmt.getAsObject() as { name: string }).name);
    stmt.free();
    expect(names).toEqual([
      'local_model_advanced_params',
      'local_model_benchmarks',
      'local_model_endpoints',
      'local_model_watch_folders',
      'local_models',
    ]);
  });

  it('creates local_models with the expected columns and a text PK on id', () => {
    const cols = tableInfo('local_models');
    expect(cols.map((c) => c.name).sort()).toEqual(
      [
        'chat_template_override',
        'created_at',
        'display_name',
        'endpoint_id',
        'gguf_arch',
        'gguf_chat_template',
        'gguf_context_max',
        'gguf_params_b',
        'gguf_quant',
        'gguf_sha256',
        'gguf_size_bytes',
        'hf_filename',
        'hf_repo_id',
        'id',
        'is_embedding_model',
        'is_tool_capable',
        'last_used_at',
        'license',
        'source_path',
        'source_type',
        'status',
        'status_detail',
        'system_prompt_override',
        'updated_at',
      ].sort(),
    );
    const id = cols.find((c) => c.name === 'id');
    expect(id?.type.toLowerCase()).toBe('text');
    expect(id?.pk).toBe(1);
  });

  it('uses model_id as the PK of local_model_advanced_params', () => {
    const cols = tableInfo('local_model_advanced_params');
    const modelId = cols.find((c) => c.name === 'model_id');
    expect(modelId?.pk).toBe(1);
    expect(cols).toHaveLength(13);
  });

  // ---------------------------------------------------------------------------
  // 2. Indexes
  // ---------------------------------------------------------------------------

  it('creates the four hot-path indexes on local_models', () => {
    const names = indexNames('local_models');
    expect(names).toContain('idx_local_models_source_type');
    expect(names).toContain('idx_local_models_status');
    expect(names).toContain('idx_local_models_last_used_at');
    expect(names).toContain('idx_local_models_endpoint_id');
  });

  it('creates the benchmark and watch-folder indexes', () => {
    expect(indexNames('local_model_benchmarks')).toContain(
      'idx_local_model_benchmarks_model_id_ran_at',
    );
    expect(indexNames('local_model_watch_folders')).toContain(
      'idx_local_model_watch_folders_status',
    );
  });

  // ---------------------------------------------------------------------------
  // 3. ON DELETE CASCADE
  // ---------------------------------------------------------------------------

  it('cascades local_models when its endpoint is deleted', () => {
    insertEndpoint('ep1');
    ctx.raw.run(
      `INSERT INTO local_models (id, display_name, source_type, endpoint_id, created_at, updated_at)
       VALUES ('m-remote', 'Remote', 'remote-endpoint', 'ep1', ?, ?)`,
      [NOW, NOW],
    );
    expect(count('local_models')).toBe(1);
    ctx.raw.run(`DELETE FROM local_model_endpoints WHERE id = 'ep1'`);
    expect(count('local_models')).toBe(0);
  });

  it('cascades advanced_params and benchmarks when the model is deleted', () => {
    insertFileModel('m1');
    ctx.raw.run(
      `INSERT INTO local_model_advanced_params (model_id, n_ctx, updated_at) VALUES ('m1', 8192, ?)`,
      [NOW],
    );
    ctx.raw.run(
      `INSERT INTO local_model_benchmarks
        (id, model_id, prompt_eval_tok_s, gen_tok_s, ttft_ms, backend, n_ctx_used, n_gpu_layers_used, ran_at)
       VALUES ('b1', 'm1', 120.5, 42.0, 350, 'vulkan', 8192, 35, ?)`,
      [NOW],
    );
    expect(count('local_model_advanced_params')).toBe(1);
    expect(count('local_model_benchmarks')).toBe(1);
    ctx.raw.run(`DELETE FROM local_models WHERE id = 'm1'`);
    expect(count('local_model_advanced_params')).toBe(0);
    expect(count('local_model_benchmarks')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 4. CHECK constraints
  // ---------------------------------------------------------------------------

  it('rejects an invalid source_type', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, source_path, created_at, updated_at)
         VALUES ('bad', 'Bad', 'totally-invalid', '/x.gguf', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('rejects an invalid model status', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, source_path, status, created_at, updated_at)
         VALUES ('bad', 'Bad', 'file', '/x.gguf', 'on-fire', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('enforces the source-shape cross-constraint (file requires source_path, no endpoint)', () => {
    // file with NULL source_path → fails
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, created_at, updated_at)
         VALUES ('bad', 'Bad', 'file', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('enforces the source-shape cross-constraint (remote-endpoint requires endpoint_id, no path)', () => {
    insertEndpoint('ep1');
    // remote-endpoint with NULL endpoint_id → fails
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, created_at, updated_at)
         VALUES ('bad', 'Bad', 'remote-endpoint', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
    // remote-endpoint carrying BOTH a path and an endpoint → fails
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, source_path, endpoint_id, created_at, updated_at)
         VALUES ('bad2', 'Bad', 'remote-endpoint', '/x.gguf', 'ep1', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('rejects a non-Local privacy_tier on an endpoint', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
         VALUES ('bad', 'Bad', 'http://x', 'Cloud', 'unknown', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('rejects an advanced_params boolean column outside {0, 1, NULL}', () => {
    insertFileModel('m1');
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_model_advanced_params (model_id, mmap, updated_at) VALUES ('m1', 2, ?)`,
        [NOW],
      ),
    ).toThrow();
  });

  it('rejects an invalid watch-folder status', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_model_watch_folders (id, path, recursive, status, created_at, updated_at)
         VALUES ('bad', '/x', 1, 'frobnicated', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  // ---------------------------------------------------------------------------
  // 5. Performance — the forward migration is structural and must be cheap.
  // ---------------------------------------------------------------------------

  it('applies the 0036 forward migration in under 100 ms on an empty DB', async () => {
    const { readFileSync } = await import('node:fs');
    const sqlText = readFileSync(migration0036Path, 'utf8');
    const statements = sqlText
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const SQL = await initSqlJs();
    const raw = new SQL.Database();
    raw.run('PRAGMA foreign_keys = ON');
    const t0 = performance.now();
    for (const stmt of statements) raw.run(stmt);
    const elapsedMs = performance.now() - t0;
    raw.close();

    expect(elapsedMs).toBeLessThan(100);
  });
});
