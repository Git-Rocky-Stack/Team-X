import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const PROVIDER_CARD_PATH = join(currentDirname, 'provider-card.tsx');
const HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-providers.ts');

const providerCardSrc = readFileSync(PROVIDER_CARD_PATH, 'utf8');
const hooksSrc = readFileSync(HOOKS_PATH, 'utf8');

describe('Provider remove feedback', () => {
  it('refreshes the providers query even when remove fails after partial backend work', () => {
    expect(hooksSrc).toContain('export function useRemoveProvider()');
    expect(hooksSrc).toContain('onSettled: () => {');
    expect(hooksSrc).toContain("invalidateQueries({ queryKey: ['providers'] })");
  });

  it('renders an inline delete failure message instead of silently doing nothing', () => {
    expect(providerCardSrc).toContain('removeMut.isError');
    expect(providerCardSrc).toContain('Failed to remove provider');
    expect(providerCardSrc).toContain('removeMut.error');
  });

  it('renders an Ollama default-model field with a real dropdown and manual cloud entry guidance', () => {
    expect(hooksSrc).toContain('useProviderModels');
    expect(providerCardSrc).toContain('Default Model');
    expect(providerCardSrc).toContain('Model Picker');
    expect(providerCardSrc).toContain('saveOllamaModel');
    expect(providerCardSrc).toContain('hasUnsavedOllamaModel');
    expect(providerCardSrc).toContain('provider-model-select-');
    expect(providerCardSrc).toContain('Choose an Ollama model');
    expect(providerCardSrc).toContain('detectedLocalModels.map');
    expect(providerCardSrc).toContain('suggestedCloudModels.map');
    expect(providerCardSrc).toContain('Detected Local Models');
    expect(providerCardSrc).toContain('Detected Cloud Models');
    expect(providerCardSrc).toContain('Suggested Cloud Models');
    expect(providerCardSrc).toContain('CURATED_OLLAMA_CLOUD_MODELS');
    expect(providerCardSrc).toContain('saveOllamaModel(nextModel)');
    expect(providerCardSrc).toContain('Model change is staged locally. Press Save to apply it.');
    expect(providerCardSrc).not.toContain('datalist');
    expect(providerCardSrc).toContain('Cloud models can also be entered manually');
  });
});
