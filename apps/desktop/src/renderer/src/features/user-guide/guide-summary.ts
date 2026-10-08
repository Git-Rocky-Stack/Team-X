import type { CompanySettings, UserGuideRole } from '@team-x/shared-types';

import { GUIDE_TASKS } from './guide-tasks.js';
import type { GuideSignals, GuideTask } from './guide-types.js';

/**
 * Guide preferences and checklist progress: everything the always-mounted
 * sidenav badge needs, with no dependency on the guide's section copy
 * (audit 2026-10-07 P2-2). guide-progress.ts re-exports these for the view.
 */

const EMPTY_COMPLETED_TASK_IDS: string[] = [];

export interface UserGuidePreferences {
  welcomeDismissedAt: string | null;
  lastViewedSectionId: string | null;
  selectedRole: UserGuideRole;
  completedTaskIds: string[];
}

export function userGuidePreferencesFromCompanySettings(
  settings: CompanySettings | null | undefined,
): UserGuidePreferences {
  const stored = settings?.userGuide;
  return {
    welcomeDismissedAt:
      typeof stored?.welcomeDismissedAt === 'string' && stored.welcomeDismissedAt.length > 0
        ? stored.welcomeDismissedAt
        : null,
    lastViewedSectionId:
      typeof stored?.lastViewedSectionId === 'string' && stored.lastViewedSectionId.length > 0
        ? stored.lastViewedSectionId
        : null,
    selectedRole: stored?.selectedRole ?? 'owner',
    completedTaskIds: Array.isArray(stored?.completedTaskIds)
      ? stored.completedTaskIds.filter(
          (taskId: unknown): taskId is string => typeof taskId === 'string',
        )
      : EMPTY_COMPLETED_TASK_IDS,
  };
}

export function guideTasksForRole(role: UserGuideRole): GuideTask[] {
  return GUIDE_TASKS.filter((task) => task.roles.includes(role));
}

export function isGuideTaskAutoCompleted(task: GuideTask, signals: GuideSignals): boolean {
  switch (task.autoRule) {
    case 'provider-enabled':
      return signals.hasEnabledProvider;
    case 'employee-exists':
      return signals.hasEmployees;
    case 'extension-installed':
      return signals.hasExtensions;
    case 'authority-reviewed':
      return signals.hasAuthorityActivity;
    default:
      return false;
  }
}

export function isGuideTaskCompleted(
  task: GuideTask,
  preferences: UserGuidePreferences,
  signals: GuideSignals,
): boolean {
  if (task.kind === 'auto') return isGuideTaskAutoCompleted(task, signals);
  return preferences.completedTaskIds.includes(task.id);
}

export function coreGuideTasksForRole(role: UserGuideRole): GuideTask[] {
  return guideTasksForRole(role).filter((task) => task.priority === 'core');
}

export function guideCompletionSummary(
  role: UserGuideRole,
  preferences: UserGuidePreferences,
  signals: GuideSignals,
): {
  total: number;
  completed: number;
  coreTotal: number;
  coreCompleted: number;
  coreRemaining: number;
} {
  const tasks = guideTasksForRole(role);
  const coreTasks = coreGuideTasksForRole(role);
  const completed = tasks.filter((task) => isGuideTaskCompleted(task, preferences, signals)).length;
  const coreCompleted = coreTasks.filter((task) =>
    isGuideTaskCompleted(task, preferences, signals),
  ).length;

  return {
    total: tasks.length,
    completed,
    coreTotal: coreTasks.length,
    coreCompleted,
    coreRemaining: Math.max(coreTasks.length - coreCompleted, 0),
  };
}
