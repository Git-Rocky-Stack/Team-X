import { describe, expect, it, vi } from 'vitest';

import { createEmbeddingRefusalReporter } from './embedding-refusal-reporter.js';
import { PrivacyTierViolationError } from './provider-factory.js';

function refusal(): PrivacyTierViolationError {
  return new PrivacyTierViolationError({
    provider: { id: 'openai', name: 'OpenAI', privacyTier: 'proprietary-cloud' },
    model: 'text-embedding-3-small',
    maxTier: 'local',
    remedyScope: 'retrieval',
    purpose: 'embedding',
  });
}

describe('createEmbeddingRefusalReporter', () => {
  it('accepts a privacy refusal and says so once per scope', () => {
    const warn = vi.fn();
    const report = createEmbeddingRefusalReporter({ warn });

    expect(report('retrieval:co-1', refusal())).toBe(true);
    expect(report('retrieval:co-1', refusal())).toBe(true);
    expect(report('indexing', refusal())).toBe(true);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toMatch(/Embedding provider "OpenAI/);
    expect(warn.mock.calls[0]?.[0]).toMatch(/without semantic search/);
  });

  it('rejects any other error, so it still fails loudly', () => {
    const warn = vi.fn();
    const report = createEmbeddingRefusalReporter({ warn });

    expect(report('indexing', new Error('database is locked'))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
