import type { UserGuideRole } from '@team-x/shared-types';

import type { GuideAction, GuideSection, GuideTask } from './guide-types.js';

const ALL_ROLES: UserGuideRole[] = ['owner', 'operator', 'builder'];
const OWNER_AND_BUILDER: UserGuideRole[] = ['owner', 'builder'];

export const GUIDE_ACTIONS: GuideAction[] = [
  {
    id: 'open-settings-providers',
    label: 'Open Provider Settings',
    description: 'Configure your first model runtime and verify the connection path.',
    kind: 'settings',
    section: 'providers',
  },
  {
    id: 'open-settings-extensions',
    label: 'Open Extensions & Authority',
    description: 'Install skills, import MCPs, and review authority in one place.',
    kind: 'settings',
    section: 'extensions',
  },
  {
    id: 'open-settings-memory',
    label: 'Open Memory Settings',
    description: 'Set the default pack budget, recent-turn window, and checkpoint depth.',
    kind: 'settings',
    section: 'memory',
  },
  {
    id: 'open-mission-control',
    label: 'Open Mission Control',
    description: 'Review live operations, queues, runs, and telemetry from the main dashboard.',
    kind: 'view',
    view: 'dashboard',
    dashboardSubview: 'cards',
  },
  {
    id: 'open-autonomy-access',
    label: 'Open Autonomy Access',
    description:
      'Inspect the operator access model and local versus shared posture for this workspace.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'access',
  },
  {
    id: 'open-autonomy-runtimes',
    label: 'Open Runtime Profiles',
    description: 'Review employee runtime bindings and explicit execution posture.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'runtimes',
  },
  {
    id: 'open-autonomy-routines',
    label: 'Open Routines',
    description: 'Inspect recurring operating loops and how they materialize into explicit work.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'routines',
  },
  {
    id: 'open-autonomy-budgets',
    label: 'Open Budgets',
    description: 'Review spend governance, hard caps, and approval gates.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'budgets',
  },
  {
    id: 'open-autonomy-approvals',
    label: 'Open Approvals',
    description: 'Review the unified operator inbox for authority and budget decisions.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'approvals',
  },
  {
    id: 'open-autonomy-memory',
    label: 'Open Memory',
    description:
      'Inspect digests, checkpoints, and packed-context posture for long-running threads.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'memory',
  },
  {
    id: 'open-chat',
    label: 'Open Chat',
    description: 'Jump into direct conversations with your employees.',
    kind: 'view',
    view: 'chat',
  },
  {
    id: 'open-tickets',
    label: 'Open Tickets',
    description: 'Inspect workload, queue pressure, and ticket detail flows.',
    kind: 'view',
    view: 'tickets',
  },
  {
    id: 'open-telemetry',
    label: 'Open Telemetry',
    description: 'Inspect system-wide analytics, usage, and cost breakdowns.',
    kind: 'view',
    view: 'telemetry',
  },
  {
    id: 'open-audit',
    label: 'Open Audit',
    description: 'Review a durable trail of actions, authority changes, and runtime events.',
    kind: 'view',
    view: 'audit',
  },
  {
    id: 'open-hire-dialog',
    label: 'Hire Your First Employee',
    description: 'Launch the hire flow and create the first active operator for this workspace.',
    kind: 'hire',
    view: 'dashboard',
  },
];

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
    roles: OWNER_AND_BUILDER,
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

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    summary:
      'Understand the workspace model, complete core setup, and establish the first live operating loop.',
    category: 'Onboarding',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Every Team-X workspace is a shared operating environment. Providers power the runtime, employees do the work, and the mission shell gives you one place to see, steer, and audit the system.',
      },
      {
        kind: 'bullets',
        items: [
          'Start by enabling a provider and hiring the first employee.',
          'Treat Mission Control as the default operational home, not a decorative landing page.',
          'Use the guide checklists to move the workspace from setup into repeatable execution.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Recommended baseline',
        text: 'Provider configured, one employee hired, Mission Control reviewed, and the first extension trust decision made.',
      },
    ],
    taskIds: [
      'provider-ready',
      'employee-ready',
      'dashboard-reviewed',
      'operating-model-understood',
    ],
    actionIds: ['open-settings-providers', 'open-hire-dialog', 'open-mission-control'],
  },
  {
    id: 'mission-control',
    title: 'Mission Control',
    summary:
      'Use the dashboard as the live operating surface for runs, queues, commands, and telemetry.',
    category: 'Operations',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Mission Control is built for operations first. It should answer what is happening now, what is blocked, which employees are active, and which commands or runs changed the current state.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Agent Runs to inspect recent autonomous and assisted work.',
          'Use Employee Queues to spot assignment pressure and blocked flow.',
          'Use the secondary panels to watch recent commands and telemetry health without losing the main operational picture.',
        ],
      },
    ],
    taskIds: ['dashboard-reviewed'],
    actionIds: ['open-mission-control'],
  },
  {
    id: 'tickets-and-projects',
    title: 'Tickets And Projects',
    summary: 'Follow work from backlog pressure through project and goal execution.',
    category: 'Execution',
    roles: ['owner', 'operator'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Tickets show the active queue surface for work distribution, while Projects and Goals express longer-running execution intent. Operators should use both surfaces together rather than treating them as isolated lists.',
      },
      {
        kind: 'callout',
        title: 'Operator pattern',
        text: 'Use Tickets to manage immediate flow and Projects to understand why that work exists.',
      },
    ],
    taskIds: ['ticket-queue-reviewed'],
    actionIds: ['open-tickets'],
  },
  {
    id: 'chat-and-copilot',
    title: 'Chat And Copilot',
    summary: 'Understand direct collaboration, read-only transcripts, and proactive guidance.',
    category: 'Collaboration',
    roles: ['owner', 'operator'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Chat is the direct collaboration surface with employees. Copilot is the cross-workspace observer that highlights issues, pressure, and opportunities without replacing the direct employee workflow.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Chat for direct instructions and follow-ups.',
          'Use the thread drawer to inspect active and historical conversations.',
          'Use Copilot for signal and recommendations, not as the only place to operate the team.',
        ],
      },
    ],
    taskIds: ['chat-flow-reviewed'],
    actionIds: ['open-chat'],
  },
  {
    id: 'extensions-and-authority',
    title: 'Extensions And Authority',
    summary: 'Install skills and MCPs, then govern capability and path access explicitly.',
    category: 'Platform',
    roles: ['owner', 'builder'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Extensions and Authority is the control plane for Team-X expansion. Skills and MCPs are useful only when their provenance, requested access, trust state, and effective authority stay visible.',
      },
      {
        kind: 'bullets',
        items: [
          'Install skills from local folders or GitHub.',
          'Import MCP servers and review their requested access.',
          'Use authority grants and reviews to keep filesystem and capability access deliberate.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Trust model',
        text: 'A green connection test is not enough. Review what an extension can actually access before treating it as operationally safe.',
      },
    ],
    taskIds: ['extensions-installed', 'authority-reviewed'],
    actionIds: ['open-settings-extensions'],
  },
  {
    id: 'autonomy-control-plane',
    title: 'Autonomy Control Plane',
    summary:
      'Supervise runtimes, routines, budgets, approvals, artifacts, and operator posture from one surface.',
    category: 'Governance',
    roles: OWNER_AND_BUILDER,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Autonomy is the operating control plane for execution posture and governance. It makes runtime bindings, recurring routines, budget policies, approvals, artifacts, and operator access explicit instead of scattering them across implementation details.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Access to verify whether the workspace is still local-only or already modeled for shared operators.',
          'Use Runtimes and Routines to understand how work is produced, not just who is assigned to it.',
          'Use Budgets and Approvals together so cost ceilings and risky actions are visible before they silently block autonomy.',
          'Use Memory to inspect what long-running threads retain, what was checkpointed, and how much context gets packed forward.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Recommended pattern',
        text: 'Mission Control tells you what is happening now. Autonomy tells you why that execution is allowed, how it is governed, and which recurring systems are shaping the workload.',
      },
    ],
    taskIds: [
      'autonomy-access-reviewed',
      'runtime-posture-reviewed',
      'routine-governance-reviewed',
    ],
    actionIds: [
      'open-autonomy-access',
      'open-autonomy-runtimes',
      'open-autonomy-approvals',
      'open-autonomy-memory',
    ],
  },
  {
    id: 'long-run-memory',
    title: 'Long-Run Memory',
    summary:
      'Inspect how Team-X condenses threads, checkpoints interrupted work, and bounds context before very long runs drift.',
    category: 'Governance',
    roles: OWNER_AND_BUILDER,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Long-run memory is the bridge between one-off conversations and durable autonomous work. Digests condense prior context, checkpoints preserve resumable state, and packed-context rules keep future turns inside a bounded envelope instead of replaying raw history forever.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Autonomy > Memory to inspect the current digest, checkpoint trail, and dropped-context posture for a thread.',
          'Use Memory Settings to choose the default pack budget and how much recent or resumable state remains visible.',
          'Use the thread-memory cards inside Chat and Tickets when you need a fast handoff into the full memory surface.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Recommended pattern',
        text: 'If a run feels long, blocked, or context-heavy, inspect Memory before widening runtime limits. Most long-session issues are better solved with bounded context than with larger raw history replay.',
      },
    ],
    taskIds: ['memory-engine-reviewed'],
    actionIds: ['open-autonomy-memory', 'open-settings-memory'],
  },
  {
    id: 'telemetry-and-audit',
    title: 'Telemetry And Audit',
    summary: 'Measure the workspace and verify what the system actually did.',
    category: 'Evidence',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Telemetry gives the live and historical operating pulse of the workspace. Audit gives the evidence trail. Used together, they let teams understand both efficiency and accountability.',
      },
      {
        kind: 'bullets',
        items: [
          'Check telemetry when model cost or system pressure changes.',
          'Check audit when authority, extensions, or automation decisions need verification.',
        ],
      },
    ],
    taskIds: ['telemetry-reviewed', 'audit-reviewed'],
    actionIds: ['open-telemetry', 'open-audit'],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    summary:
      'Recognize the most common setup and runtime gaps before assuming the workspace is broken.',
    category: 'Support',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Most early failures in Team-X come from configuration drift, missing authority, provider mismatch, or a workspace that looks initialized but has no live operational resources yet.',
      },
      {
        kind: 'bullets',
        items: [
          'If employees do not respond, confirm the provider path before assuming chat logic is broken.',
          'If an extension appears installed but unusable, review authority requests and trust state.',
          'If a workspace feels empty, verify that providers, employees, and at least one real work surface have been configured.',
        ],
      },
    ],
    taskIds: ['provider-ready', 'authority-reviewed'],
    actionIds: ['open-settings-providers', 'open-settings-extensions'],
  },
];

export const GUIDE_ROLE_LABELS: Record<UserGuideRole, string> = {
  owner: 'Workspace Owner',
  operator: 'Operator',
  builder: 'Builder',
};

export const GUIDE_ROLE_DESCRIPTIONS: Record<UserGuideRole, string> = {
  owner: 'Own setup, trust decisions, and the overall operating posture of the workspace.',
  operator:
    'Run daily work, monitor queues, and keep execution moving across tickets and conversations.',
  builder: 'Extend the system with skills, MCPs, authority rules, and operational tooling.',
};
