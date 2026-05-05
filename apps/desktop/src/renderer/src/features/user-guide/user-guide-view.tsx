import type { Company, Employee } from '@team-x/shared-types';
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Circle,
  Compass,
  Loader2,
  Rocket,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { GUIDE_ACTIONS } from './guide-content.js';
import {
  guideActionById,
  guideRoleDescription,
  guideRoleLabel,
  guideTaskById,
} from './guide-progress.js';
import { useUserGuide } from './use-user-guide.js';

import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import {
  MissionControlRow,
  MissionHero,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPageShell,
  MissionPill,
  MissionRailCard,
  MissionSectionCard,
  MissionSegmentedButton,
  MissionStateBlock,
} from '@/features/mission/mission-shell.js';
import { cn } from '@/lib/utils.js';

interface UserGuideViewProps {
  company: Company | null;
  employees: Employee[];
}

function percentLabel(completed: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((completed / total) * 100)}%`;
}

export function UserGuideView({ company, employees }: UserGuideViewProps) {
  const [search, setSearch] = useState('');
  const {
    preferences,
    summary,
    signals,
    isSaving,
    saveError,
    providersLoading,
    extensionsLoading,
    authorityLoading,
    visibleSections,
    selectedSectionId,
    setSelectedRole,
    setSelectedSection,
    dismissWelcome,
    toggleTask,
    runAction,
    isTaskCompleted,
  } = useUserGuide({
    company,
    employeeCount: employees.length,
  });

  const sections = visibleSections(search);
  const selectedSection =
    sections.find((section) => section.id === selectedSectionId) ?? sections[0] ?? null;

  const sectionTasks = useMemo(
    () =>
      (selectedSection?.taskIds ?? [])
        .map((taskId) => guideTaskById(taskId))
        .filter((task): task is NonNullable<typeof task> => Boolean(task)),
    [selectedSection],
  );

  const quickActions = useMemo(() => {
    const actionIds = new Set<string>([
      ...(selectedSection?.actionIds ?? []),
      ...sectionTasks
        .map((task) => task.actionId)
        .filter((actionId): actionId is string => Boolean(actionId)),
    ]);
    return [...actionIds]
      .map((actionId) => guideActionById(actionId))
      .filter((action): action is NonNullable<typeof action> => Boolean(action));
  }, [selectedSection, sectionTasks]);

  function handleTaskAction(taskId: string) {
    const task = guideTaskById(taskId);
    if (!task) return;
    if (task.actionId) {
      runAction(task.actionId);
    }
    if (task.kind !== 'auto') {
      toggleTask(task.id, true);
    }
  }

  function toggleManualTask(taskId: string) {
    const task = guideTaskById(taskId);
    if (!task || task.kind === 'auto') return;
    toggleTask(task.id, !isTaskCompleted(task.id));
  }

  if (!company) {
    return (
      <MissionPageShell>
        <MissionStateBlock
          icon={BookOpenText}
          title="Select a workspace to start onboarding"
          description="The User Guide becomes interactive after a workspace is active. Team-X uses workspace-scoped progress so onboarding, guide position, and checklist state stay tied to the company you are operating."
        />
      </MissionPageShell>
    );
  }

  return (
    <MissionPageShell>
      <MissionHero
        eyebrow="Onboarding"
        title="User Guide"
        description={`Role-based documentation and interactive onboarding for ${company.name}. Use it to get a workspace operational, verify trust boundaries, and learn the shell without leaving the app.`}
        icon={BookOpenText}
        badge={<MissionPill tone="accent">Workspace scoped</MissionPill>}
        actions={
          <>
            {!preferences.welcomeDismissedAt ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={dismissWelcome}
              >
                Dismiss welcome
              </Button>
            ) : null}
            <Button
              type="button"
              className="rounded-full"
              onClick={() => runAction('open-mission-control')}
            >
              Open Mission Control
            </Button>
          </>
        }
        meta={
          <>
            <MissionPill uppercase>{guideRoleLabel(preferences.selectedRole)}</MissionPill>
            <MissionPill tone={summary.coreRemaining > 0 ? 'warning' : 'accent'}>
              {summary.coreRemaining > 0
                ? `${summary.coreRemaining} core step${summary.coreRemaining === 1 ? '' : 's'} left`
                : 'Core setup complete'}
            </MissionPill>
            {isSaving ? (
              <MissionPill>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving
              </MissionPill>
            ) : null}
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <MissionMetricTile
            label="Checklist progress"
            value={`${summary.completed}/${summary.total}`}
            hint={`${percentLabel(summary.completed, summary.total)} complete for the ${guideRoleLabel(preferences.selectedRole)} track.`}
          />
          <MissionMetricTile
            label="Core readiness"
            value={`${summary.coreCompleted}/${summary.coreTotal}`}
            hint={
              summary.coreRemaining > 0
                ? 'Finish the core setup tasks to move this workspace out of onboarding mode.'
                : 'This workspace has cleared the recommended baseline.'
            }
          />
          <MissionMetricTile
            label="Live signals"
            value={`${[signals.hasEnabledProvider, signals.hasEmployees, signals.hasExtensions, signals.hasAuthorityActivity].filter(Boolean).length}/4`}
            hint="Provider, employee, extension, and authority signals feed the auto-detected checklist tasks."
          />
        </div>
      </MissionHero>

      {!preferences.welcomeDismissedAt ? (
        <MissionSectionCard
          title={`Welcome to ${company.name}`}
          description="This workspace has not dismissed onboarding yet. Use the guide to finish the baseline setup, then keep it around as your in-product operating manual."
          badge={<MissionPill tone="accent">First run</MissionPill>}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="rounded-full"
                onClick={() => runAction('open-settings-providers')}
              >
                Start with providers
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={dismissWelcome}
              >
                Dismiss for this workspace
              </Button>
            </div>
          }
        >
          <MissionInsetSurface className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Rocket className="h-4 w-4 text-brand" />
              Team-X recommends a simple starting sequence:
              <span className="font-medium text-foreground">provider</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">employee</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">Mission Control</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">extensions and authority</span>
            </div>
          </MissionInsetSurface>
        </MissionSectionCard>
      ) : null}

      {saveError ? (
        <MissionInsetSurface tone="danger" className="px-4 py-4">
          <div className="flex items-center gap-3 text-sm text-red-100">
            <ShieldCheck className="h-4 w-4 text-red-200" />
            {saveError}
          </div>
        </MissionInsetSurface>
      ) : null}

      <MissionControlRow className="justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['owner', 'operator', 'builder'] as const).map((role) => (
            <MissionSegmentedButton
              key={role}
              active={preferences.selectedRole === role}
              onClick={() => setSelectedRole(role)}
              data-user-guide-role={role}
            >
              {guideRoleLabel(role)}
            </MissionSegmentedButton>
          ))}
        </div>
        <div className="flex min-w-[260px] flex-1 items-center gap-2 sm:max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the guide"
            aria-label="Search the user guide"
            className="h-10 rounded-[18px] border-white/10 bg-black/10"
            data-user-guide-search=""
          />
        </div>
      </MissionControlRow>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <MissionRailCard
          title="Role track"
          description={guideRoleDescription(preferences.selectedRole)}
        >
          <div className="space-y-2">
            {sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No guide sections match the current search. Clear the filter to restore the full
                track.
              </p>
            ) : (
              sections.map((section) => {
                const isActive = selectedSection?.id === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSelectedSection(section.id)}
                    className={cn(
                      'flex w-full flex-col gap-1 rounded-[18px] border px-4 py-3 text-left transition-all',
                      isActive
                        ? 'border-brand/20 bg-brand/10 text-foreground'
                        : 'border-white/10 bg-black/10 text-muted-foreground hover:border-white/20 hover:bg-black/20 hover:text-foreground',
                    )}
                    data-user-guide-section-nav={section.id}
                  >
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {section.category}
                    </span>
                    <span className="text-sm font-medium">{section.title}</span>
                    <span className="text-xs leading-5">{section.summary}</span>
                  </button>
                );
              })
            )}
          </div>
        </MissionRailCard>

        {selectedSection ? (
          <MissionSectionCard
            title={selectedSection.title}
            description={selectedSection.summary}
            badge={<MissionPill>{selectedSection.category}</MissionPill>}
          >
            <div className="space-y-4" data-user-guide-content={selectedSection.id}>
              {selectedSection.blocks.map((block, index) => {
                if (block.kind === 'paragraph') {
                  return (
                    <p
                      key={`${selectedSection.id}:paragraph:${index}`}
                      className="text-sm leading-7 text-muted-foreground"
                    >
                      {block.text}
                    </p>
                  );
                }

                if (block.kind === 'bullets') {
                  return (
                    <ul
                      key={`${selectedSection.id}:bullets:${index}`}
                      className="space-y-2 text-sm leading-6 text-muted-foreground"
                    >
                      {block.items.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }

                return (
                  <MissionInsetSurface
                    key={`${selectedSection.id}:callout:${index}`}
                    className={cn(
                      'px-4 py-4',
                      block.tone === 'accent' && 'border-brand/20 bg-brand/6',
                      block.tone === 'warning' && 'border-amber-500/20 bg-amber-500/8',
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{block.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{block.text}</p>
                  </MissionInsetSurface>
                );
              })}
            </div>
          </MissionSectionCard>
        ) : (
          <MissionStateBlock
            icon={Compass}
            title="No guide section selected"
            description="Adjust the search term or switch role tracks to bring guide content back into view."
          />
        )}

        <div className="space-y-6">
          <MissionRailCard
            title="Checklist"
            description="Interactive onboarding tasks for the selected role and section."
            badge={
              <MissionPill tone="accent">
                {summary.completed}/{summary.total}
              </MissionPill>
            }
          >
            {sectionTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This section does not have checklist items yet.
              </p>
            ) : (
              <div className="space-y-3">
                {sectionTasks.map((task) => {
                  const completed = isTaskCompleted(task.id);
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'rounded-[18px] border px-4 py-4',
                        completed ? 'border-brand/20 bg-brand/8' : 'border-white/10 bg-black/10',
                      )}
                      data-user-guide-task={task.id}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5">
                          {completed ? (
                            <CheckCircle2 className="h-4 w-4 text-brand" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{task.title}</p>
                            <MissionPill tone={task.priority === 'core' ? 'accent' : 'default'}>
                              {task.priority}
                            </MissionPill>
                            <MissionPill>{task.kind}</MissionPill>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {task.description}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {task.actionId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={completed ? 'outline' : 'default'}
                                className="rounded-full"
                                onClick={() => handleTaskAction(task.id)}
                              >
                                {guideActionById(task.actionId)?.label ?? 'Open'}
                              </Button>
                            ) : null}
                            {task.kind !== 'auto' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                onClick={() => toggleManualTask(task.id)}
                              >
                                {completed ? 'Mark incomplete' : 'Mark complete'}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </MissionRailCard>

          <MissionRailCard
            title="Quick actions"
            description="Jump directly into the live product surfaces connected to this section."
          >
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => runAction(action.id)}
                  className="flex w-full items-start justify-between gap-3 rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-black/20"
                  data-user-guide-action={action.id}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                </button>
              ))}
              {quickActions.length === 0 &&
                GUIDE_ACTIONS.slice(0, 3).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => runAction(action.id)}
                    className="flex w-full items-start justify-between gap-3 rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-black/20"
                    data-user-guide-action={action.id}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{action.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  </button>
                ))}
            </div>
          </MissionRailCard>

          <MissionRailCard
            title="Signal health"
            description="Live workspace signals used for auto-detected onboarding tasks."
          >
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Enabled provider</span>
                <MissionPill tone={signals.hasEnabledProvider ? 'accent' : 'warning'}>
                  {providersLoading ? 'loading' : signals.hasEnabledProvider ? 'ready' : 'missing'}
                </MissionPill>
              </div>
              <div className="flex items-center justify-between">
                <span>Employees</span>
                <MissionPill tone={signals.hasEmployees ? 'accent' : 'warning'}>
                  {signals.hasEmployees ? `${employees.length} active` : 'missing'}
                </MissionPill>
              </div>
              <div className="flex items-center justify-between">
                <span>Extensions</span>
                <MissionPill tone={signals.hasExtensions ? 'accent' : 'default'}>
                  {extensionsLoading ? 'loading' : signals.hasExtensions ? 'installed' : 'none yet'}
                </MissionPill>
              </div>
              <div className="flex items-center justify-between">
                <span>Authority activity</span>
                <MissionPill tone={signals.hasAuthorityActivity ? 'accent' : 'default'}>
                  {authorityLoading
                    ? 'loading'
                    : signals.hasAuthorityActivity
                      ? 'recorded'
                      : 'none yet'}
                </MissionPill>
              </div>
            </div>
          </MissionRailCard>
        </div>
      </div>
    </MissionPageShell>
  );
}
