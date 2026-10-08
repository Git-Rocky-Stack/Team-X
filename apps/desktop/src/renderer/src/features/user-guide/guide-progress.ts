import type { CompanySettings, UserGuideRole } from '@team-x/shared-types';

import {
  GUIDE_ACTIONS,
  GUIDE_ROLE_DESCRIPTIONS,
  GUIDE_ROLE_LABELS,
  GUIDE_SECTIONS,
  GUIDE_TASKS,
} from './guide-content.js';
import type { UserGuidePreferences } from './guide-summary.js';
import type { GuideAction, GuideSection, GuideTask } from './guide-types.js';

export {
  coreGuideTasksForRole,
  guideCompletionSummary,
  guideTasksForRole,
  isGuideTaskAutoCompleted,
  isGuideTaskCompleted,
  type UserGuidePreferences,
  userGuidePreferencesFromCompanySettings,
} from './guide-summary.js';

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

export function defaultGuideSectionIdForRole(role: UserGuideRole): string {
  return guideSectionsForRole(role)[0]?.id ?? GUIDE_SECTIONS[0]?.id ?? 'getting-started';
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
