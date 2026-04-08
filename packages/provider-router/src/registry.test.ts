import { describe, expect, it } from 'vitest';
import { createRegistry } from './registry.js';

describe('provider registry', () => {
  const registry = createRegistry([
    {
      id: 'ollama-local',
      name: 'Ollama (local)',
      kind: 'ollama',
      privacyTier: 'local',
      baseUrl: 'http://localhost:11434',
      enabled: true,
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      kind: 'anthropic',
      privacyTier: 'proprietary-cloud',
      enabled: true,
    },
    {
      id: 'groq',
      name: 'Groq',
      kind: 'groq',
      privacyTier: 'open-source-cloud',
      enabled: true,
    },
    {
      id: 'disabled-openai',
      name: 'OpenAI (disabled)',
      kind: 'openai',
      privacyTier: 'proprietary-cloud',
      enabled: false,
    },
  ]);

  it('lists only enabled providers, in declaration order', () => {
    expect(registry.list().map((p) => p.id)).toEqual(['ollama-local', 'anthropic', 'groq']);
  });

  it('filters by max privacy tier — local only', () => {
    const local = registry.list({ maxTier: 'local' });
    expect(local.map((p) => p.id)).toEqual(['ollama-local']);
  });

  it('filters by max privacy tier — local + open-source-cloud', () => {
    const osCloud = registry.list({ maxTier: 'open-source-cloud' });
    expect(osCloud.map((p) => p.id)).toEqual(['ollama-local', 'groq']);
  });

  it('filters by max privacy tier — all (proprietary-cloud)', () => {
    const all = registry.list({ maxTier: 'proprietary-cloud' });
    expect(all.map((p) => p.id)).toEqual(['ollama-local', 'anthropic', 'groq']);
  });

  it('picks the first preferred provider that matches the privacy filter', () => {
    const picked = registry.pickProvider({
      preferred: ['anthropic', 'ollama-local'],
      maxTier: 'local',
    });
    expect(picked?.id).toBe('ollama-local');
  });

  it('returns null if no preferred provider matches the filter', () => {
    const picked = registry.pickProvider({
      preferred: ['anthropic'],
      maxTier: 'local',
    });
    expect(picked).toBeNull();
  });

  it('matches preferred entries by either provider id or kind', () => {
    const byKind = registry.pickProvider({
      preferred: ['groq'],
      maxTier: 'open-source-cloud',
    });
    expect(byKind?.id).toBe('groq');
  });

  it('skips disabled providers even when preferred', () => {
    const picked = registry.pickProvider({
      preferred: ['disabled-openai', 'anthropic'],
      maxTier: 'proprietary-cloud',
    });
    expect(picked?.id).toBe('anthropic');
  });
});
