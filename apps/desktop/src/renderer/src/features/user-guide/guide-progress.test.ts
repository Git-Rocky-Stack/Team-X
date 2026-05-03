import type { CompanySettings } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import { GUIDE_TASKS } from './guide-content.js';
import {
  defaultGuideSectionIdForRole,
  guideCompletionSummary,
  isGuideTaskCompleted,
  sectionMatchesSearch,
  userGuidePreferencesFromCompanySettings,
  withUserGuideInCompanySettings,
} from './guide-progress.js';
import type { GuideSection } from './guide-types.js';

describe('guide-progress', () => {
  it('round-trips user guide preferences through company settings', () => {
    const next = withUserGuideInCompanySettings(
      { mission: 'Operate cleanly' },
      {
        welcomeDismissedAt: '2026-04-22T12:00:00.000Z',
        lastViewedSectionId: 'mission-control',
        selectedRole: 'builder',
        completedTaskIds: ['dashboard-reviewed'],
      },
    );

    expect(next.userGuide?.selectedRole).toBe('builder');
    expect(next.userGuide?.completedTaskIds).toEqual(['dashboard-reviewed']);
    expect(userGuidePreferencesFromCompanySettings(next as CompanySettings)).toEqual({
      welcomeDismissedAt: '2026-04-22T12:00:00.000Z',
      lastViewedSectionId: 'mission-control',
      selectedRole: 'builder',
      completedTaskIds: ['dashboard-reviewed'],
    });
  });

  it('marks auto tasks complete from live signals and manual tasks from stored completion', () => {
    const providerTask = GUIDE_TASKS.find((task) => task.id === 'provider-ready');
    const manualTask = GUIDE_TASKS.find((task) => task.id === 'operating-model-understood');

    expect(providerTask).toBeDefined();
    expect(manualTask).toBeDefined();
    if (!providerTask || !manualTask) {
      throw new Error('expected guide tasks to exist');
    }

    const preferences = {
      welcomeDismissedAt: null,
      lastViewedSectionId: null,
      selectedRole: 'owner' as const,
      completedTaskIds: ['operating-model-understood'],
    };

    expect(
      isGuideTaskCompleted(providerTask, preferences, {
        hasEnabledProvider: true,
        hasEmployees: false,
        hasExtensions: false,
        hasAuthorityActivity: false,
      }),
    ).toBe(true);
    expect(
      isGuideTaskCompleted(manualTask, preferences, {
        hasEnabledProvider: false,
        hasEmployees: false,
        hasExtensions: false,
        hasAuthorityActivity: false,
      }),
    ).toBe(true);
  });

  it('summarizes completion for a role track', () => {
    const summary = guideCompletionSummary(
      'owner',
      {
        welcomeDismissedAt: null,
        lastViewedSectionId: defaultGuideSectionIdForRole('owner'),
        selectedRole: 'owner',
        completedTaskIds: [
          'dashboard-reviewed',
          'workspace-model-reviewed',
          'operating-model-understood',
        ],
      },
      {
        hasEnabledProvider: true,
        hasEmployees: true,
        hasExtensions: false,
        hasAuthorityActivity: false,
      },
    );

    expect(summary.total).toBeGreaterThan(0);
    expect(summary.completed).toBeGreaterThanOrEqual(4);
    expect(summary.coreRemaining).toBe(0);
  });

  it('matches section search against blocks and task copy', () => {
    const gettingStarted: GuideSection = {
      id: 'getting-started',
      title: 'Getting Started',
      summary: 'Understand the workspace model.',
      category: 'Onboarding',
      roles: ['owner', 'operator', 'builder'],
      blocks: [
        { kind: 'paragraph' as const, text: 'Providers power the runtime.' },
        { kind: 'bullets' as const, items: ['Hire the first employee'] },
      ],
      taskIds: ['provider-ready'],
    };

    expect(sectionMatchesSearch(gettingStarted, 'provider')).toBe(true);
    expect(sectionMatchesSearch(gettingStarted, 'employee')).toBe(true);
    expect(sectionMatchesSearch(gettingStarted, 'nonexistent')).toBe(false);
  });
});
