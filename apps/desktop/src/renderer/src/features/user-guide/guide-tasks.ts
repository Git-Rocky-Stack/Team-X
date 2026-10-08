import type { UserGuideRole } from '@team-x/shared-types';

import type { GuideTask } from './guide-types.js';

/**
 * The User Guide's checklist tasks, split from guide-content.ts (audit
 * 2026-10-07 P2-2). The sidenav's "N left" badge needs only these, and
 * importing them from the full guide pulled ~125 KB of section copy into the
 * renderer entry chunk; the sections now load with the guide view.
 */

export const ALL_ROLES: UserGuideRole[] = ['owner', 'operator', 'builder'];
export const OWNER_AND_BUILDER: UserGuideRole[] = ['owner', 'builder'];

export const GUIDE_TASKS: GuideTask[] = [
  {
    id: 'provider-ready',
    title: 'Configure a provider',
    description:
      'Set up at least one enabled provider so Team-X can run employee and copilot work.',
    roles: ALL_ROLES,
    priority: 'core',
    kind: 'auto',
    autoRule: 'provider-enabled',
    actionId: 'open-settings-providers',
  },
  {
    id: 'employee-ready',
    title: 'Hire the first employee',
    description:
      'Create the first employee so the workspace can move from shell setup into actual work.',
    roles: ALL_ROLES,
    priority: 'core',
    kind: 'auto',
    autoRule: 'employee-exists',
    actionId: 'open-hire-dialog',
  },
  {
    id: 'dashboard-reviewed',
    title: 'Review Mission Control',
    description:
      'Use the operations-first dashboard to understand runs, queues, commands, and telemetry.',
    roles: ALL_ROLES,
    priority: 'core',
    kind: 'jump',
    actionId: 'open-mission-control',
  },
  {
    id: 'workspace-model-reviewed',
    title: 'Review workspace boundaries',
    description:
      'Confirm that company data, employees, tickets, projects, files, settings, and guide progress are scoped to the active workspace.',
    roles: ALL_ROLES,
    priority: 'core',
    kind: 'manual',
    actionId: 'open-settings',
  },
  {
    id: 'org-chart-reviewed',
    title: 'Review the org chart',
    description:
      'Open the reporting structure so role fidelity, managers, promotions, and profile edits are visible before scaling the workforce.',
    roles: ALL_ROLES,
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-org',
  },
  {
    id: 'command-palette-reviewed',
    title: 'Review command operations',
    description:
      'Understand the command palette as the fast path for hire, ticket, project, goal, meeting, status, navigation, vault, and complex-agent requests.',
    roles: ['owner', 'operator'],
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-command-history',
  },
  {
    id: 'chat-flow-reviewed',
    title: 'Run a first conversation',
    description:
      'Open Chat and understand how user-to-employee conversations differ from read-only agent transcripts.',
    roles: ['owner', 'operator'],
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-chat',
  },
  {
    id: 'ticket-queue-reviewed',
    title: 'Inspect the ticket queue',
    description:
      'Review how workload, assignment pressure, and ticket detail move through the workspace.',
    roles: ['owner', 'operator'],
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-tickets',
  },
  {
    id: 'project-flow-reviewed',
    title: 'Review projects and goals',
    description:
      'Inspect how project lanes, goal targets, linked tickets, leads, and target dates turn broad intent into accountable execution.',
    roles: ['owner', 'operator'],
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-project-kanban',
  },
  {
    id: 'schedule-reviewed',
    title: 'Review the team schedule',
    description:
      'Open the schedule to see ticket due dates, project targets, goal targets, and future assigned work in one calendar.',
    roles: ['owner', 'operator'],
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-project-schedule',
  },
  {
    id: 'file-vault-reviewed',
    title: 'Review Files and deliverables',
    description:
      'Open Files and understand how uploads, ticket attachments, and agent-created deliverables are stored.',
    roles: ['owner', 'operator'],
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-files',
  },
  {
    id: 'meeting-flow-reviewed',
    title: 'Review meeting flow',
    description:
      'Open Meetings so live collaboration, attendee selection, minutes, action items, and meeting history are understood before cross-functional work starts.',
    roles: ['owner', 'operator'],
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-meetings',
  },
  {
    id: 'extensions-installed',
    title: 'Install the first extension',
    description: 'Load a skill or MCP into the workspace through the unified control plane.',
    roles: ['owner', 'builder'],
    priority: 'recommended',
    kind: 'auto',
    autoRule: 'extension-installed',
    actionId: 'open-settings-extensions',
  },
  {
    id: 'authority-reviewed',
    title: 'Review authority boundaries',
    description:
      'Inspect or approve extension authority so filesystem and capability access stay explicit.',
    roles: OWNER_AND_BUILDER,
    priority: 'recommended',
    kind: 'auto',
    autoRule: 'authority-reviewed',
    actionId: 'open-settings-extensions',
  },
  {
    id: 'autonomy-access-reviewed',
    title: 'Review operator access posture',
    description:
      'Inspect who can supervise the workspace and how Team-X models local, invited, and cloud-ready operators.',
    roles: OWNER_AND_BUILDER,
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-autonomy-access',
  },
  {
    id: 'runtime-posture-reviewed',
    title: 'Review runtime posture',
    description:
      'Confirm how employees bind to explicit runtime profiles instead of implicit execution assumptions.',
    roles: OWNER_AND_BUILDER,
    priority: 'recommended',
    kind: 'jump',
    actionId: 'open-autonomy-runtimes',
  },
  {
    id: 'routine-governance-reviewed',
    title: 'Review routines and approvals',
    description:
      'Inspect recurring operations and the approval inbox so autonomous work stays visible and governed.',
    roles: OWNER_AND_BUILDER,
    priority: 'advanced',
    kind: 'jump',
    actionId: 'open-autonomy-approvals',
  },
  {
    id: 'budget-governance-reviewed',
    title: 'Review budget governance',
    description:
      'Inspect policy scopes, warnings, hard stops, ledger entries, and escalation posture before unattended or high-volume work runs.',
    roles: OWNER_AND_BUILDER,
    priority: 'advanced',
    kind: 'jump',
    actionId: 'open-autonomy-budgets',
  },
  {
    id: 'improvement-loop-reviewed',
    title: 'Review the self-improvement loop',
    description:
      'Inspect how Team-X turns repeated failures, blocked work, and stale execution patterns into deduped correction tickets.',
    roles: OWNER_AND_BUILDER,
    priority: 'advanced',
    kind: 'jump',
    actionId: 'open-autonomy-improvement',
  },
  {
    id: 'memory-engine-reviewed',
    title: 'Review long-run memory posture',
    description:
      'Inspect digests, checkpoints, and the default pack settings that bound long-running context.',
    roles: OWNER_AND_BUILDER,
    priority: 'advanced',
    kind: 'jump',
    actionId: 'open-autonomy-memory',
  },
  {
    id: 'portability-reviewed',
    title: 'Review portability and sharing',
    description:
      'Preview import packages, understand what gets redacted, and verify the workspace sharing posture before copying or templating it.',
    roles: OWNER_AND_BUILDER,
    priority: 'advanced',
    kind: 'jump',
    actionId: 'open-settings-portability',
  },
  {
    id: 'settings-reviewed',
    title: 'Review system settings',
    description:
      'Walk through runtime, privacy, RAG, enhanced AI, concurrency, permissions, planner, copilot, provider, portability, memory, and backup controls.',
    roles: ALL_ROLES,
    priority: 'advanced',
    kind: 'jump',
    actionId: 'open-settings',
  },
  {
    id: 'telemetry-reviewed',
    title: 'Review telemetry and costs',
    description: 'Understand usage, employee activity, and model cost from the telemetry surfaces.',
    roles: ['owner', 'operator'],
    priority: 'advanced',
    kind: 'jump',
    actionId: 'open-telemetry',
  },
  {
    id: 'audit-reviewed',
    title: 'Review audit evidence',
    description:
      'Inspect the audit trail so builders and owners can verify authority and automation activity.',
    roles: ALL_ROLES,
    priority: 'advanced',
    kind: 'jump',
    actionId: 'open-audit',
  },
  {
    id: 'operating-model-understood',
    title: 'Confirm the operating model',
    description:
      'Acknowledge how Team-X treats workspaces, employees, and orchestrated execution as one command surface.',
    roles: ALL_ROLES,
    priority: 'recommended',
    kind: 'manual',
  },
];
