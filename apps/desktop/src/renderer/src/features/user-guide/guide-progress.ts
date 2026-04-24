import type { CompanySettings, UserGuideRole } from '@team-x/shared-types';

import {
  GUIDE_ACTIONS,
  GUIDE_ROLE_DESCRIPTIONS,
  GUIDE_ROLE_LABELS,
  GUIDE_SECTIONS,
  GUIDE_TASKS,
} from './guide-content.js';
import type { GuideAction, GuideSection, GuideSignals, GuideTask } from './guide-types.js';

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

export function withUserGuideInCompanySettings(
  settings: CompanySettings | null | undefined,
  guide: UserGuidePreferences,
): CompanySettings {
  return {
    ...(settings ?? {}),
    userGuide: {
      ...(settings?.userGuide ?? {}),
      welcomeDismissedAt: guide.welcomeDismissedAt ?? undefined,
      lastViewedSectionId: guide.lastViewedSectionId ?? undefined,
      selectedRole: guide.selectedRole,
      completedTaskIds: guide.completedTaskIds,
    },
  };
}

export function guideRoleLabel(role: UserGuideRole): string {
  return GUIDE_ROLE_LABELS[role] ?? 'Workspace Owner';
}

export function guideRoleDescription(role: UserGuideRole): string {
  return GUIDE_ROLE_DESCRIPTIONS[role] ?? '';
}

export function guideActionById(actionId: string): GuideAction | undefined {
  return GUIDE_ACTIONS.find((action) => action.id === actionId);
}

export function guideTaskById(taskId: string): GuideTask | undefined {
  return GUIDE_TASKS.find((task) => task.id === taskId);
}

export function guideSectionById(sectionId: string): GuideSection | undefined {
  return GUIDE_SECTIONS.find((section) => section.id === sectionId);
}

export function guideSectionsForRole(role: UserGuideRole): GuideSection[] {
  return GUIDE_SECTIONS.filter((section) => section.roles.includes(role));
}

export function guideTasksForRole(role: UserGuideRole): GuideTask[] {
  return GUIDE_TASKS.filter((task) => task.roles.includes(role));
}

export function defaultGuideSectionIdForRole(role: UserGuideRole): string {
  return guideSectionsForRole(role)[0]?.id ?? GUIDE_SECTIONS[0]?.id ?? 'getting-started';
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

export function sectionMatchesSearch(section: GuideSection, search: string): boolean {
  if (search.length === 0) return true;
  const haystack = [
    section.title,
    section.summary,
    section.category,
    ...section.blocks.flatMap((block) => {
      if (block.kind === 'paragraph') return [block.text];
      if (block.kind === 'callout') return [block.title, block.text];
      return block.items;
    }),
    ...section.taskIds
      .map((taskId) => guideTaskById(taskId))
      .filter((task): task is GuideTask => Boolean(task))
      .flatMap((task) => [task.title, task.description]),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
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
