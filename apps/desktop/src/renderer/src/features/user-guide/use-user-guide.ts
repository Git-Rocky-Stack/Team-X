import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CompaniesUpdateRequest, Company } from '@team-x/shared-types';

import {
  defaultGuideSectionIdForRole,
  guideActionById,
  guideCompletionSummary,
  guideSectionsForRole,
  guideTaskById,
  isGuideTaskCompleted,
  sectionMatchesSearch,
  userGuidePreferencesFromCompanySettings,
  withUserGuideInCompanySettings,
} from './guide-progress.js';
import type { GuideSection } from './guide-types.js';

import {
  useAuthorityGrants,
  useAuthorityRequests,
  useInstalledExtensions,
} from '@/hooks/use-extensions.js';
import { useProviders } from '@/hooks/use-providers.js';
import { ipc } from '@/lib/ipc.js';
import { useAppStore } from '@/store/app-store.js';

function userGuideErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  const fallback = String(error);
  return fallback.length > 0 ? fallback : 'Failed to save user guide state.';
}

function patchCompanyUserGuideCache(
  companies: Company[] | undefined,
  companyId: string,
  companySettings: Company['settings'],
): Company[] | undefined {
  if (!companies) return companies;
  return companies.map((company) =>
    company.id === companyId ? { ...company, settings: companySettings } : company,
  );
}

interface UseUserGuideOptions {
  company: Company | null;
  employeeCount: number;
}

export function useUserGuide({ company, employeeCount }: UseUserGuideOptions) {
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setAutonomySubview = useAppStore((state) => state.setAutonomySubview);
  const setDashboardSubview = useAppStore((state) => state.setDashboardSubview);
  const setProjectsSubview = useAppStore((state) => state.setProjectsSubview);
  const setTelemetrySubview = useAppStore((state) => state.setTelemetrySubview);
  const openSettingsSection = useAppStore((state) => state.openSettingsSection);
  const requestHireDialog = useAppStore((state) => state.requestHireDialog);
  const providersQuery = useProviders();
  const extensionsQuery = useInstalledExtensions(companyId);
  const authorityQuery = useAuthorityGrants(companyId);
  const authorityRequestsQuery = useAuthorityRequests(companyId);

  const preferences = userGuidePreferencesFromCompanySettings(company?.settings);
  const signals = {
    hasEnabledProvider: (providersQuery.data ?? []).some((provider) => provider.enabled),
    hasEmployees: employeeCount > 0,
    hasExtensions: (extensionsQuery.data ?? []).length > 0,
    hasAuthorityActivity:
      (authorityQuery.data ?? []).length > 0 || (authorityRequestsQuery.data ?? []).length > 0,
  };

  const mutation = useMutation<
    void,
    Error,
    CompaniesUpdateRequest,
    { previousCompanies?: Company[] }
  >({
    mutationFn: (req) => ipc.companies.update(req),
    onMutate: (req) => {
      const previousCompanies = queryClient.getQueryData<Company[]>(['companies']);
      queryClient.setQueryData<Company[]>(['companies'], (current) =>
        patchCompanyUserGuideCache(current, req.companyId, req.settings as Company['settings']),
      );
      return { previousCompanies };
    },
    onError: (_error, _req, context) => {
      if (context?.previousCompanies) {
        queryClient.setQueryData(['companies'], context.previousCompanies);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  function persist(nextPreferences: typeof preferences) {
    if (!company) return;
    mutation.mutate({
      companyId: company.id,
      settings: withUserGuideInCompanySettings(company.settings, nextPreferences) as Record<
        string,
        unknown
      >,
    });
  }

  function setSelectedRole(role: typeof preferences.selectedRole) {
    persist({
      ...preferences,
      selectedRole: role,
      lastViewedSectionId: defaultGuideSectionIdForRole(role),
    });
  }

  function setSelectedSection(sectionId: string) {
    persist({
      ...preferences,
      lastViewedSectionId: sectionId,
    });
  }

  function dismissWelcome() {
    persist({
      ...preferences,
      welcomeDismissedAt: new Date().toISOString(),
    });
  }

  function toggleTask(taskId: string, completed: boolean) {
    const nextCompleted = new Set(preferences.completedTaskIds);
    if (completed) nextCompleted.add(taskId);
    else nextCompleted.delete(taskId);
    persist({
      ...preferences,
      completedTaskIds: [...nextCompleted],
    });
  }

  function runAction(actionId: string) {
    const action = guideActionById(actionId);
    if (!action) return;

    if (action.kind === 'settings') {
      openSettingsSection(action.section);
      return;
    }

    if (action.kind === 'hire') {
      if (action.view) setActiveView(action.view);
      requestHireDialog();
      return;
    }

    if (action.view === 'dashboard') {
      setDashboardSubview(action.dashboardSubview ?? 'cards');
    }
    if (action.view === 'projects' && action.projectsSubview) {
      setProjectsSubview(action.projectsSubview);
    }
    if (action.view === 'telemetry' && action.telemetrySubview) {
      setTelemetrySubview(action.telemetrySubview);
    }
    if (action.view === 'autonomy' && action.autonomySubview) {
      setAutonomySubview(action.autonomySubview);
    }
    setActiveView(action.view);
  }

  function visibleSections(search: string): GuideSection[] {
    return guideSectionsForRole(preferences.selectedRole).filter((section) =>
      sectionMatchesSearch(section, search),
    );
  }

  const summary = guideCompletionSummary(preferences.selectedRole, preferences, signals);

  return {
    preferences,
    signals,
    summary,
    isSaving: mutation.isPending,
    saveError: mutation.isError ? userGuideErrorMessage(mutation.error) : null,
    providersLoading: providersQuery.isLoading,
    extensionsLoading: extensionsQuery.isLoading,
    authorityLoading: authorityQuery.isLoading || authorityRequestsQuery.isLoading,
    visibleSections,
    selectedSectionId:
      preferences.lastViewedSectionId ?? defaultGuideSectionIdForRole(preferences.selectedRole),
    setSelectedRole,
    setSelectedSection,
    dismissWelcome,
    toggleTask,
    runAction,
    isTaskCompleted: (taskId: string) => {
      const task = guideTaskById(taskId);
      return task ? isGuideTaskCompleted(task, preferences, signals) : false;
    },
  };
}
