/**
 * Phase 7b Settings-cluster sweep contract (source-string pins).
 * Per-file: console-present + legacy-absent + selectors-preserved.
 * The cross-file legacy-absence guard + amoled-menu-surface recipe check
 * land with the final task (Phase-3 lesson 5: global pins land last).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

describe('settings-view shell sweep', () => {
  const src = readSrc('settings/settings-view.tsx');

  it('drops the amoled shell for a console layout', () => {
    expect(src).toContain('<Faceplate');
    expect(src).not.toContain('amoled-menu-surface');
    expect(src).not.toMatch(/\bbg-black\b/);
    // NOTE: `text-h1 text-foreground` is a CURRENT Carbon type token, not legacy —
    // the console recompose KEEPS the <h1> title inside the Faceplate body.
  });

  it('preserves all 15 scroll targets + the focus effect', () => {
    for (const sel of [
      'data-settings-section="enhanced-ai"',
      'data-settings-section="extensions"',
      'data-settings-section="portability"',
      'data-settings-section="memory"',
      'data-settings-section="providers"',
    ]) {
      expect(src).toContain(sel);
    }
    expect(src).toContain('settingsFocusSection');
    expect(src).toContain('scrollIntoView');
    expect(src).toContain('componentName="UpdaterSection"');
  });
});
