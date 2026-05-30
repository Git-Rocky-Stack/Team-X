import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { type InsertLocalModelInput, createLocalModelsRepo } from './local-models.js';

const NANOID = /^[A-Za-z0-9_-]{21}$/;

function fileFixture(name: string): InsertLocalModelInput {
  return {
    displayName: name,
    sourceType: 'file',
    sourcePath: `/m/${name}.gguf`,
    endpointId: null,
    ggufArch: 'llama',
    ggufParamsB: 7.0,
    ggufQuant: 'Q4_K_M',
    ggufContextMax: 4096,
    ggufSizeBytes: 4_000_000_000,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
  };
}

describe('localModelsRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  function seedEndpoint(id: string): void {
    ctx.raw.run(
      `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
       VALUES (?, 'EP', 'http://192.168.1.50:1234', 'Local', 'unknown', ?, ?)`,
      [id, Date.now(), Date.now()],
    );
  }

  it('insert + getById round-trips a file-source model', () => {
    const created = repo.insert(fileFixture('Llama-3.1-8B-Q4_K_M'));
    expect(created.id).toMatch(NANOID);
    expect(created.displayName).toBe('Llama-3.1-8B-Q4_K_M');
    expect(created.sourceType).toBe('file');
    expect(created.ggufParamsB).toBe(7.0);
    expect(created.isEmbeddingModel).toBe(false);
    expect(created.status).toBe('cold');
    expect(created.statusDetail).toBeNull();
    expect(created.lastUsedAt).toBeNull();
    expect(created.createdAt).toBeGreaterThan(0);
    expect(created.updatedAt).toBe(created.createdAt);

    expect(repo.getById(created.id)).toEqual(created);
  });

  it('getById returns null for an unknown id', () => {
    expect(repo.getById('does-not-exist')).toBeNull();
  });

  it('insert persists a remote-endpoint-sourced model', () => {
    seedEndpoint('ep-1');
    const created = repo.insert({
      ...fileFixture('Remote'),
      sourceType: 'remote-endpoint',
      sourcePath: null,
      endpointId: 'ep-1',
      ggufArch: null,
      ggufParamsB: null,
      ggufQuant: null,
      ggufContextMax: null,
      ggufSizeBytes: null,
    });
    expect(created.endpointId).toBe('ep-1');
    expect(created.sourcePath).toBeNull();
  });

  it('list orders most-recently-used first', () => {
    repo.insert(fileFixture('M1'));
    const m2 = repo.insert(fileFixture('M2'));
    repo.insert(fileFixture('M3'));
    repo.touchLastUsed(m2.id);

    const list = repo.list();
    expect(list).toHaveLength(3);
    expect(list[0]?.displayName).toBe('M2');
    expect(new Set(list.slice(1).map((m) => m.displayName))).toEqual(new Set(['M1', 'M3']));
  });

  it('list breaks ties on created_at DESC for never-used models', () => {
    const a = repo.insert(fileFixture('A'));
    const b = repo.insert(fileFixture('B'));
    // Force distinct created_at so the secondary sort key is deterministic.
    ctx.raw.run('UPDATE local_models SET created_at = ? WHERE id = ?', [1000, a.id]);
    ctx.raw.run('UPDATE local_models SET created_at = ? WHERE id = ?', [2000, b.id]);
    expect(repo.list().map((m) => m.displayName)).toEqual(['B', 'A']);
  });

  it('listBySourceType filters correctly', () => {
    const m1 = repo.insert(fileFixture('M1'));
    const m2 = repo.insert(fileFixture('M2'));
    seedEndpoint('ep-1');
    const m3 = repo.insert({
      ...fileFixture('M3'),
      sourceType: 'remote-endpoint',
      sourcePath: null,
      endpointId: 'ep-1',
    });

    expect(
      repo
        .listBySourceType('file')
        .map((m) => m.id)
        .sort(),
    ).toEqual([m1.id, m2.id].sort());
    expect(repo.listBySourceType('remote-endpoint').map((m) => m.id)).toEqual([m3.id]);
  });

  it('updateStatus updates status + detail + updatedAt', () => {
    const m = repo.insert(fileFixture('M1'));
    const result = repo.updateStatus(m.id, 'error', 'failed to load');
    expect(result.status).toBe('error');
    expect(result.statusDetail).toBe('failed to load');
    expect(result.updatedAt).toBeGreaterThanOrEqual(m.updatedAt);
  });

  it('setSystemPrompt persists and clears the per-model override', () => {
    const m = repo.insert(fileFixture('M1'));
    expect(repo.setSystemPrompt(m.id, 'You are a sarcastic assistant.').systemPromptOverride).toBe(
      'You are a sarcastic assistant.',
    );
    expect(repo.setSystemPrompt(m.id, null).systemPromptOverride).toBeNull();
  });

  it('setChatTemplateOverride persists', () => {
    const m = repo.insert(fileFixture('M1'));
    const updated = repo.setChatTemplateOverride(m.id, '<|user|>{{prompt}}<|assistant|>');
    expect(updated.chatTemplateOverride).toBe('<|user|>{{prompt}}<|assistant|>');
  });

  it('remove deletes the row', () => {
    const m = repo.insert(fileFixture('M1'));
    repo.remove(m.id);
    expect(repo.getById(m.id)).toBeNull();
  });

  it('remove cascades to local_model_advanced_params', () => {
    const m = repo.insert(fileFixture('M1'));
    ctx.raw.run(
      'INSERT INTO local_model_advanced_params (model_id, n_ctx, updated_at) VALUES (?, 8192, ?)',
      [m.id, Date.now()],
    );
    const before = ctx.raw.exec('SELECT COUNT(*) FROM local_model_advanced_params')[0]
      ?.values[0]?.[0];
    expect(before).toBe(1);
    repo.remove(m.id);
    const after = ctx.raw.exec('SELECT COUNT(*) FROM local_model_advanced_params')[0]
      ?.values[0]?.[0];
    expect(after).toBe(0);
  });
});
