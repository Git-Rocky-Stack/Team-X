/**
 * Source-string audit for Phase 6 M38 T6 renderer feedback weighting.
 *
 * Renderer unit tests run in Node in this workspace. These tests pin
 * the hooks and component contracts; Playwright owns real browser
 * interaction in the M38 E2E slice.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COPILOT_CATEGORIES } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const COPILOT_SECTION_PATH = join(currentDirname, 'copilot-section.tsx');
const HOOKS_PATH = join(currentDirname, '..', '..', 'hooks', 'use-settings.ts');
const SIDEBAR_PATH = join(currentDirname, '..', 'copilot', 'copilot-sidebar.tsx');
const CARD_PATH = join(currentDirname, '..', 'copilot', 'copilot-insight-card.tsx');

const copilotSectionSrc = readFileSync(COPILOT_SECTION_PATH, 'utf8');
const hooksSrc = readFileSync(HOOKS_PATH, 'utf8');
const sidebarSrc = readFileSync(SIDEBAR_PATH, 'utf8');
const cardSrc = readFileSync(CARD_PATH, 'utf8');

describe('CopilotSection category weight controls', () => {
  it('adds typed React Query hooks for get/set copilot category weights', () => {
    expect(hooksSrc).toContain('SettingsSetCopilotWeightsRequest');
    expect(hooksSrc).toContain('export function useCopilotWeights(companyId: string | null)');
    expect(hooksSrc).toContain("queryKey: ['settings', 'copilot-weights', companyId]");
    expect(hooksSrc).toContain('ipc.settings.getCopilotWeights({ companyId })');
    expect(hooksSrc).toContain('export function useSetCopilotWeights()');
    expect(hooksSrc).toContain('ipc.settings.setCopilotWeights(req)');
    expect(hooksSrc).toContain(
      "invalidateQueries({ queryKey: ['settings', 'copilot-weights', req.companyId] })",
    );
  });

  it('renders one stable weight control per canonical copilot category', () => {
    expect(existsSync(COPILOT_SECTION_PATH)).toBe(true);
    expect(copilotSectionSrc).toContain('useCopilotWeights(companyId)');
    expect(copilotSectionSrc).toContain('useSetCopilotWeights()');
    expect(copilotSectionSrc).toContain('Category weighting');
    expect(copilotSectionSrc).toContain('data-copilot-weight-category={cat}');
    expect(copilotSectionSrc).toContain('formatCopilotWeightLabel');

    for (const category of COPILOT_CATEGORIES) {
      expect(copilotSectionSrc).toContain(`${category}:`);
    }
  });

  it('bounds the controls to the 0.0x through 2.0x range and persists partial patches', () => {
    expect(copilotSectionSrc).toContain('COPILOT_CATEGORY_WEIGHT_CLAMP');
    expect(copilotSectionSrc).toMatch(
      /type="number"[\s\S]*?min=\{COPILOT_CATEGORY_WEIGHT_CLAMP\.min\}/,
    );
    expect(copilotSectionSrc).toMatch(/max=\{COPILOT_CATEGORY_WEIGHT_CLAMP\.max\}/);
    expect(copilotSectionSrc).toMatch(/step=\{0\.1\}/);
    expect(copilotSectionSrc).toMatch(
      /setCopilotWeights\.mutate\(\{[\s\S]*?companyId,[\s\S]*?weights:\s*\{\s*\[cat\]:\s*next\s*\}/,
    );
  });
});

describe('CopilotSidebar advisory feedback suggestion', () => {
  it('passes dismiss feedback suggestions from insight cards up to sidebar state', () => {
    expect(cardSrc).toContain(
      'onFeedbackSuggestion?: (suggestion: CopilotFeedbackSuggestion) => void',
    );
    expect(cardSrc).toContain('result.feedbackSuggestion');
    expect(cardSrc).toContain('onFeedbackSuggestion(result.feedbackSuggestion)');
    expect(sidebarSrc).toContain('setFeedbackSuggestion');
    expect(sidebarSrc).toContain('onFeedbackSuggestion={setFeedbackSuggestion}');
  });

  it('applies a suggestion through settings.setCopilotWeights with the suggested category weight', () => {
    expect(sidebarSrc).toContain('useSetCopilotWeights()');
    expect(sidebarSrc).toContain('formatFeedbackSuggestionPrompt(feedbackSuggestion)');
    expect(sidebarSrc).toContain('data-copilot-feedback-suggestion=""');
    expect(sidebarSrc).toContain('data-copilot-feedback-apply=""');
    expect(sidebarSrc).toContain('Apply');
    expect(sidebarSrc).toMatch(
      /setCopilotWeights\.mutate\([\s\S]*?\{[\s\S]*?companyId,[\s\S]*?weights:\s*\{[\s\S]*?\[feedbackSuggestion\.category\]:\s*feedbackSuggestion\.suggestedWeight/,
    );
  });

  it('keeps the current weight by clearing the banner without mutating settings', () => {
    expect(sidebarSrc).toContain('Keep current');
    expect(sidebarSrc).toMatch(
      /function\s+keepCurrentWeight\(\)\s*\{[\s\S]*?setFeedbackSuggestion\(null\)[\s\S]*?\}/,
    );
    const keepBody =
      sidebarSrc.match(/function\s+keepCurrentWeight\(\)\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(keepBody).not.toContain('setCopilotWeights.mutate');
  });
});
