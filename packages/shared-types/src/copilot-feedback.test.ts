import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  COPILOT_CATEGORIES,
  COPILOT_CATEGORY_WEIGHTS_DEFAULT,
  COPILOT_CATEGORY_WEIGHT_CLAMP,
} from './ipc.js';

const currentDirname = dirname(fileURLToPath(import.meta.url));

function src(name: string): string {
  return readFileSync(join(currentDirname, name), 'utf8');
}

describe('copilot feedback weight contracts', () => {
  it('pins one default weight per canonical copilot category', () => {
    expect(COPILOT_CATEGORIES).toEqual(['operational', 'cost', 'org', 'workflow', 'anomaly']);
    expect(Object.keys(COPILOT_CATEGORY_WEIGHTS_DEFAULT).sort()).toEqual(
      [...COPILOT_CATEGORIES].sort(),
    );
    expect(Object.values(COPILOT_CATEGORY_WEIGHTS_DEFAULT)).toEqual([1, 1, 1, 1, 1]);
  });

  it('pins the M38 weight clamp', () => {
    expect(COPILOT_CATEGORY_WEIGHT_CLAMP).toEqual({ min: 0, max: 2, default: 1 });
  });

  it('pins the weights-changed event and feedback IPC source strings', () => {
    expect(src('events.ts')).toContain("'copilot.weights.changed'");
    expect(src('events.ts')).toContain('export interface CopilotWeightsChangedPayload');
    expect(src('copilot.ts')).toContain('export interface CopilotFeedbackSuggestion');
    expect(src('copilot.ts')).toContain('feedbackSuggestion?: CopilotFeedbackSuggestion');
    expect(src('ipc.ts')).toContain("'settings.getCopilotWeights'");
    expect(src('ipc.ts')).toContain("'settings.setCopilotWeights'");
  });
});
