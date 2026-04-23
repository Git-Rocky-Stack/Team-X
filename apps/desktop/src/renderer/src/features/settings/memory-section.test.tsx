import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_VIEW_PATH = join(currentDirname, 'settings-view.tsx');
const MEMORY_SECTION_PATH = join(currentDirname, 'memory-section.tsx');
const SETTINGS_HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-settings.ts');

const settingsViewSrc = readFileSync(SETTINGS_VIEW_PATH, 'utf8');
const memorySectionSrc = readFileSync(MEMORY_SECTION_PATH, 'utf8');
const settingsHooksSrc = readFileSync(SETTINGS_HOOKS_PATH, 'utf8');

describe('Memory settings shell', () => {
  it('mounts the memory section inside SettingsView with a focusable anchor', () => {
    expect(settingsViewSrc).toContain("import { MemorySection } from './memory-section.js';");
    expect(settingsViewSrc).toContain('<MemorySection />');
    expect(settingsViewSrc).toContain('data-settings-section="memory"');
  });

  it('adds typed settings hooks for long-run memory defaults', () => {
    expect(settingsHooksSrc).toContain('SettingsSetMemoryRequest');
    expect(settingsHooksSrc).toContain("queryKey: ['settings', 'memory']");
    expect(settingsHooksSrc).toContain('ipc.settings.getMemory()');
    expect(settingsHooksSrc).toContain('ipc.settings.setMemory(req)');
  });

  it('renders explicit controls for pack budget and detail depth', () => {
    expect(memorySectionSrc).toContain('data-settings-memory=""');
    expect(memorySectionSrc).toContain('Long-Run Memory');
    expect(memorySectionSrc).toContain('Default pack budget');
    expect(memorySectionSrc).toContain('Recent turn window');
    expect(memorySectionSrc).toContain('Checkpoint history depth');
    expect(memorySectionSrc).toContain('MEMORY_TARGET_TOKEN_BUDGET_OPTIONS.map');
    expect(memorySectionSrc).toContain('useMemorySettings()');
    expect(memorySectionSrc).toContain('useSetMemorySettings()');
  });
});
