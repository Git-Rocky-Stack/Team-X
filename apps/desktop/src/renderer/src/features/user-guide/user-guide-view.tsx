import type { Company, Employee } from '@team-x/shared-types';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
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

import {
  Faceplate,
  LampTile,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
  VuMeter,
} from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
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
      <div className="flex h-full flex-col justify-center px-6">
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="Select a workspace to start onboarding"
          description="The User Guide becomes interactive after a workspace is active. Team-X uses workspace-scoped progress so onboarding, guide position, and checklist state stay tied to the company you are operating."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <Faceplate kicker="User Guide" serial="ONBOARDING" bodyClassName="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-h1 text-foreground">User Guide</h1>
            <p className="mt-1 text-body text-silver-mute">
              Role-based documentation and interactive onboarding for {company.name}. Use it to get
              a workspace operational, verify trust boundaries, and learn the shell without leaving
              the app.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!preferences.welcomeDismissedAt ? (
              <Button type="button" variant="outline" onClick={dismissWelcome}>
                Dismiss welcome
              </Button>
            ) : null}
            <Button type="button" onClick={() => runAction('open-mission-control')}>
              Open Mission Control
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tag>Workspace scoped</Tag>
          <Tag>{guideRoleLabel(preferences.selectedRole)}</Tag>
          <LampTile
            small
            interactive={false}
            label={summary.coreRemaining > 0 ? 'HOLD' : 'GO'}
            tone={summary.coreRemaining > 0 ? 'hold' : 'go'}
          />
          <span className="text-caption text-silver-mute">
            {summary.coreRemaining > 0
              ? `${summary.coreRemaining} core step${summary.coreRemaining === 1 ? '' : 's'} left`
              : 'Core setup complete'}
          </span>
          {isSaving ? (
            <Tag>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving
            </Tag>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <MetricTile
              label="Checklist progress"
              value={`${summary.completed}/${summary.total}`}
              hint={`${percentLabel(summary.completed, summary.total)} complete for the ${guideRoleLabel(preferences.selectedRole)} track.`}
            />
            <VuMeter
              variant="progress"
              label="Checklist progress"
              segments={16}
              value={summary.total > 0 ? summary.completed / summary.total : 0}
            />
          </div>
          <MetricTile
            label="Core readiness"
            value={`${summary.coreCompleted}/${summary.coreTotal}`}
            hint={
              summary.coreRemaining > 0
                ? 'Finish the core setup tasks to move this workspace out of onboarding mode.'
                : 'This workspace has cleared the recommended baseline.'
            }
          />
          <MetricTile
            label="Live signals"
            value={`${[signals.hasEnabledProvider, signals.hasEmployees, signals.hasExtensions, signals.hasAuthorityActivity].filter(Boolean).length}/4`}
            hint="Provider, employee, extension, and authority signals feed the auto-detected checklist tasks."
          />
        </div>
      </Faceplate>

      {!preferences.welcomeDismissedAt ? (
        <Faceplate kicker="First Run" bodyClassName="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-h3 text-foreground">Welcome to {company.name}</h2>
              <p className="mt-1 text-caption text-silver-mute">
                This workspace has not dismissed onboarding yet. Use the guide to finish the
                baseline setup, then keep it around as your in-product operating manual.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button type="button" onClick={() => runAction('open-settings-providers')}>
                Start with providers
              </Button>
              <Button type="button" variant="outline" onClick={dismissWelcome}>
                Dismiss for this workspace
              </Button>
            </div>
          </div>
          <RecessedWell className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-3 text-body text-silver-mute">
              <Rocket className="h-4 w-4 text-[var(--armed-lit)]" />
              Team-X recommends a simple starting sequence:
              <span className="font-medium text-[var(--display-fg)]">provider</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="font-medium text-[var(--display-fg)]">employee</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="font-medium text-[var(--display-fg)]">Mission Control</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="font-medium text-[var(--display-fg)]">extensions and authority</span>
            </div>
          </RecessedWell>
        </Faceplate>
      ) : null}

      {saveError ? (
        <RecessedWell className="border-[var(--led-nogo)] px-4 py-4">
          <div className="flex items-center gap-3 text-body text-led-nogo">
            <ShieldCheck className="h-4 w-4" />
            {saveError}
          </div>
        </RecessedWell>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['owner', 'operator', 'builder'] as const).map((role) => (
            <button
              key={role}
              type="button"
              className={cn('nav-tile', preferences.selectedRole === role && 'nav-tile-active')}
              onClick={() => setSelectedRole(role)}
              data-user-guide-role={role}
            >
              {guideRoleLabel(role)}
            </button>
          ))}
        </div>
        <div className="flex min-w-[260px] flex-1 items-center gap-2 sm:max-w-sm">
          <Search className="h-4 w-4 text-silver-mute" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the guide"
            aria-label="Search the user guide"
            className="h-10"
            data-user-guide-search=""
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Faceplate kicker="Role Track" bodyClassName="space-y-3">
          <p className="text-caption text-silver-mute">
            {guideRoleDescription(preferences.selectedRole)}
          </p>
          <div className="space-y-2">
            {sections.length === 0 ? (
              <p className="text-body text-silver-mute">
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
                      'well flex w-full flex-col gap-1 px-4 py-3 text-left transition-all hover:-translate-y-0.5',
                      isActive
                        ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)]'
                        : 'hover:border-[var(--hairline-strong)]',
                    )}
                    data-user-guide-section-nav={section.id}
                  >
                    <span className="text-eyebrow text-silver-mute">{section.category}</span>
                    <span className="text-body-strong text-[var(--display-fg)]">
                      {section.title}
                    </span>
                    <span className="text-caption text-silver-mute">{section.summary}</span>
                  </button>
                );
              })
            )}
          </div>
        </Faceplate>

        {selectedSection ? (
          <Faceplate
            kicker={selectedSection.title}
            stripeSlot={<Tag>{selectedSection.category}</Tag>}
            bodyClassName="space-y-4"
          >
            <p className="text-caption text-silver-mute">{selectedSection.summary}</p>
            <div className="space-y-4" data-user-guide-content={selectedSection.id}>
              {selectedSection.blocks.map((block, index) => {
                if (block.kind === 'paragraph') {
                  return (
                    <p
                      key={`${selectedSection.id}:paragraph:${index}`}
                      className="text-body leading-7 text-silver-mute"
                    >
                      {block.text}
                    </p>
                  );
                }

                if (block.kind === 'bullets') {
                  return (
                    <ul
                      key={`${selectedSection.id}:bullets:${index}`}
                      className="space-y-2 text-body text-silver-mute"
                    >
                      {block.items.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 rounded-sm bg-[var(--armed)]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }

                return (
                  <RecessedWell
                    key={`${selectedSection.id}:callout:${index}`}
                    className={cn(
                      'px-4 py-4',
                      block.tone === 'accent' && 'border-[var(--armed-edge)]',
                      block.tone === 'warning' && 'border-[var(--led-hold)]',
                    )}
                  >
                    <p className="text-body-strong text-[var(--display-fg)]">{block.title}</p>
                    <p className="mt-2 text-body text-silver-mute">{block.text}</p>
                  </RecessedWell>
                );
              })}
            </div>
          </Faceplate>
        ) : (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No guide section selected"
            description="Adjust the search term or switch role tracks to bring guide content back into view."
          />
        )}

        <div className="space-y-6">
          <Faceplate
            kicker="Checklist"
            stripeSlot={
              <Tag mono>
                {summary.completed}/{summary.total}
              </Tag>
            }
            bodyClassName="space-y-3"
          >
            <p className="text-caption text-silver-mute">
              Interactive onboarding tasks for the selected role and section.
            </p>
            {sectionTasks.length === 0 ? (
              <p className="text-body text-silver-mute">
                This section does not have checklist items yet.
              </p>
            ) : (
              <div className="space-y-3">
                {sectionTasks.map((task) => {
                  const completed = isTaskCompleted(task.id);
                  return (
                    <RecessedWell
                      key={task.id}
                      className={cn(
                        'px-4 py-4',
                        completed && 'border-[var(--armed-edge)] bg-[var(--armed-soft)]',
                      )}
                      data-user-guide-task={task.id}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5">
                          {completed ? (
                            <CheckCircle2 className="h-4 w-4 text-[var(--armed-lit)]" />
                          ) : (
                            <Circle className="h-4 w-4 text-silver-mute" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-body-strong text-[var(--display-fg)]">
                              {task.title}
                            </p>
                            <LampTile
                              small
                              interactive={false}
                              label={task.priority}
                              tone={task.priority === 'core' ? 'exec' : 'off'}
                            />
                            <Tag>{task.kind}</Tag>
                          </div>
                          <p className="mt-2 text-body text-silver-mute">{task.description}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {task.actionId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={completed ? 'outline' : 'default'}
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
                                onClick={() => toggleManualTask(task.id)}
                              >
                                {completed ? 'Mark incomplete' : 'Mark complete'}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </RecessedWell>
                  );
                })}
              </div>
            )}
          </Faceplate>

          <Faceplate kicker="Quick Actions" bodyClassName="space-y-3">
            <p className="text-caption text-silver-mute">
              Jump directly into the live product surfaces connected to this section.
            </p>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => runAction(action.id)}
                  className="well flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--hairline-strong)]"
                  data-user-guide-action={action.id}
                >
                  <div className="min-w-0">
                    <p className="text-body-strong text-[var(--display-fg)]">{action.label}</p>
                    <p className="mt-1 text-caption text-silver-mute">{action.description}</p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--armed-lit)]" />
                </button>
              ))}
              {quickActions.length === 0 &&
                GUIDE_ACTIONS.slice(0, 3).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => runAction(action.id)}
                    className="well flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--hairline-strong)]"
                    data-user-guide-action={action.id}
                  >
                    <div className="min-w-0">
                      <p className="text-body-strong text-[var(--display-fg)]">{action.label}</p>
                      <p className="mt-1 text-caption text-silver-mute">{action.description}</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--armed-lit)]" />
                  </button>
                ))}
            </div>
          </Faceplate>

          <Faceplate kicker="Signal Health" bodyClassName="space-y-3">
            <p className="text-caption text-silver-mute">
              Live workspace signals used for auto-detected onboarding tasks.
            </p>
            <div className="space-y-2 text-body text-silver-mute">
              <div className="flex items-center justify-between gap-3">
                <span>Enabled provider</span>
                <span className="flex items-center gap-2">
                  <LampTile
                    small
                    interactive={false}
                    label={providersLoading ? 'STBY' : signals.hasEnabledProvider ? 'GO' : 'HOLD'}
                    tone={providersLoading ? 'hold' : signals.hasEnabledProvider ? 'go' : 'hold'}
                  />
                  <span className="text-caption">
                    {providersLoading
                      ? 'loading'
                      : signals.hasEnabledProvider
                        ? 'ready'
                        : 'missing'}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Employees</span>
                <span className="flex items-center gap-2">
                  <LampTile
                    small
                    interactive={false}
                    label={signals.hasEmployees ? 'GO' : 'HOLD'}
                    tone={signals.hasEmployees ? 'go' : 'hold'}
                  />
                  <span className="text-caption">
                    {signals.hasEmployees ? `${employees.length} active` : 'missing'}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Extensions</span>
                <span className="flex items-center gap-2">
                  <LampTile
                    small
                    interactive={false}
                    label={extensionsLoading ? 'STBY' : signals.hasExtensions ? 'GO' : 'STBY'}
                    tone={extensionsLoading ? 'hold' : signals.hasExtensions ? 'go' : 'off'}
                  />
                  <span className="text-caption">
                    {extensionsLoading
                      ? 'loading'
                      : signals.hasExtensions
                        ? 'installed'
                        : 'none yet'}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Authority activity</span>
                <span className="flex items-center gap-2">
                  <LampTile
                    small
                    interactive={false}
                    label={authorityLoading ? 'STBY' : signals.hasAuthorityActivity ? 'GO' : 'STBY'}
                    tone={authorityLoading ? 'hold' : signals.hasAuthorityActivity ? 'go' : 'off'}
                  />
                  <span className="text-caption">
                    {authorityLoading
                      ? 'loading'
                      : signals.hasAuthorityActivity
                        ? 'recorded'
                        : 'none yet'}
                  </span>
                </span>
              </div>
            </div>
          </Faceplate>
        </div>
      </div>
    </div>
  );
}
