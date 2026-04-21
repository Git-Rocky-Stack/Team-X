/**
 * Source-string audit for the concurrency settings renderer.
 *
 * The bug here was semantic, not transport-level: the UI rendered every
 * key from the static `concurrency_caps` settings object, which made a
 * deleted `custom-openai` provider kind look like a still-live provider
 * instance. These assertions pin the renderer contract so the section is
 * scoped to the currently configured provider kinds.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const SECTION_PATH = join(currentDirname, 'concurrency-section.tsx');

const sectionSrc = readFileSync(SECTION_PATH, 'utf8');

describe('ConcurrencySection provider-cap visibility', () => {
  it('derives visible cap rows from the currently configured providers instead of every static cap key', () => {
    expect(sectionSrc).toContain('useProviders');
    expect(sectionSrc).toContain('providerKindCounts');
    expect(sectionSrc).toContain('Array.from(providerKindCounts.keys())');
  });

  it('labels the rows as provider-kind caps to avoid implying one row equals one provider instance', () => {
    expect(sectionSrc).toContain('Per-Provider Kind Caps');
    expect(sectionSrc).toContain('configured provider kinds');
  });

  it('renders editable numeric inputs for slots and provider caps instead of fixed preset buttons', () => {
    expect(sectionSrc).toContain('id="orchestrator-slots"');
    expect(sectionSrc).toContain('id={`provider-cap-${kind}`}');
    expect(sectionSrc).not.toContain('SLOT_OPTIONS');
  });
});
