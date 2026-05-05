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
    id: 'open-settings-portability',
    label: 'Open Portability Settings',
    description: 'Preview packages, export workspaces, save templates, and review sharing posture.',
    kind: 'settings',
    section: 'portability',
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
    id: 'open-autonomy-doctor',
    label: 'Open Autonomy Doctor',
    description: 'Run the operator health workflow before launching unattended runtime work.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'doctor',
  },
  {
    id: 'open-autonomy-benchmarks',
    label: 'Open Autonomy Benchmarks',
    description: 'Replay deterministic autonomy scenarios and inspect the control-plane results.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'benchmarks',
  },
  {
    id: 'open-autonomy-improvement',
    label: 'Open Agent Improvement',
    description:
      'Run the self-improvement loop that opens durable correction tickets from recent signals.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'improvement',
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
    id: 'open-autonomy-artifacts',
    label: 'Open Artifacts',
    description: 'Review runtime outputs and evidence captured from autonomous execution.',
    kind: 'view',
    view: 'autonomy',
    autonomySubview: 'artifacts',
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
    id: 'open-project-schedule',
    label: 'Open Schedule',
    description: 'Open the calendar view for deadlines, project targets, and future tasking.',
    kind: 'view',
    view: 'projects',
    projectsSubview: 'schedule',
  },
  {
    id: 'open-files',
    label: 'Open Files',
    description: 'Review uploaded and agent-created deliverables in the company file vault.',
    kind: 'view',
    view: 'files',
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
  {
    id: 'open-org',
    label: 'Open Org Chart',
    description: 'Review reporting lines, profile details, promotions, and manager changes.',
    kind: 'view',
    view: 'org',
  },
  {
    id: 'open-dashboard-timeline',
    label: 'Open Timeline',
    description: 'Review the chronological event feed behind the current workspace.',
    kind: 'view',
    view: 'dashboard',
    dashboardSubview: 'timeline',
  },
  {
    id: 'open-dashboard-stream',
    label: 'Open Stream',
    description: 'Watch raw live output across employees and runtime activity.',
    kind: 'view',
    view: 'dashboard',
    dashboardSubview: 'stream',
  },
  {
    id: 'open-dashboard-floor',
    label: 'Open Floor',
    description: 'Review the team activity floor when scanning employee-level execution.',
    kind: 'view',
    view: 'dashboard',
    dashboardSubview: 'floor',
  },
  {
    id: 'open-command-history',
    label: 'Open Command History',
    description: 'Review command-palette activity, intent labels, and execution history.',
    kind: 'view',
    view: 'dashboard',
    dashboardSubview: 'commands',
  },
  {
    id: 'open-project-kanban',
    label: 'Open Projects',
    description: 'Review project cards, status lanes, leads, targets, and linked work.',
    kind: 'view',
    view: 'projects',
    projectsSubview: 'kanban',
  },
  {
    id: 'open-project-goals',
    label: 'Open Goals',
    description: 'Review measurable outcomes, target dates, and project-linked goal context.',
    kind: 'view',
    view: 'projects',
    projectsSubview: 'goals',
  },
  {
    id: 'open-meetings',
    label: 'Open Meetings',
    description: 'Call a meeting, review live meetings, and inspect prior meeting records.',
    kind: 'view',
    view: 'meetings',
  },
  {
    id: 'open-settings',
    label: 'Open Settings',
    description:
      'Review runtime, privacy, RAG, enhanced AI, concurrency, permissions, planner, copilot, provider, portability, memory, and backup controls.',
    kind: 'view',
    view: 'settings',
  },
  {
    id: 'open-settings-enhanced-ai',
    label: 'Open Enhanced AI Settings',
    description:
      'Configure LLM provider, model options, and Phase 2 & 3 AI features like query expansion, semantic chunking, long-term memory, knowledge graph, multi-turn planning, streaming responses, and distributed tracing.',
    kind: 'settings',
    section: 'enhanced-ai',
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

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    summary:
      'Move from first launch to a real operating loop: provider, employee, workspace boundary, Mission Control, and first durable work.',
    category: 'Onboarding',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Team-X is not a decorative chat shell. It is a local-first command environment where a company workspace owns its employees, work queues, files, settings, memory, telemetry, and audit trail. The first successful session should leave you with a configured runtime, at least one usable employee, a reviewed dashboard, and a clear understanding of where accountable work belongs.',
      },
      {
        kind: 'paragraph',
        text: 'The fastest path is deliberately operational: configure a provider, hire or verify employees, open Mission Control, create or inspect a ticket, then return to this guide when you need a deeper explanation of any surface.',
      },
      {
        kind: 'bullets',
        items: [
          'Start in Settings > Providers and enable at least one model path. Ollama can run locally without an API key; cloud providers need a saved key and should be tested before relying on them.',
          'Use Hire to add the first visible employee if the workspace is empty. The initial company seed usually includes a Chief Executive Officer and Senior Fullstack Engineer, while the full org-management surface can promote to any bundled non-system role.',
          'Treat Mission Control as the default daily home. It shows runs, queues, commands, telemetry, and operational pressure without making you hunt across tabs.',
          'Use Tickets for accountable work, Projects and Goals for larger initiatives, Schedule for date-driven coordination, and Files for deliverables or source material.',
          'Keep this guide open during setup. Its checklist progress is saved to the active company, so each workspace can have its own onboarding state.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Recommended first-session finish line',
        text: 'Provider configured, one employee available, workspace boundary understood, Mission Control reviewed, first ticket or chat tested, and no unresolved provider or authority warning blocking normal work.',
      },
    ],
    taskIds: [
      'provider-ready',
      'employee-ready',
      'workspace-model-reviewed',
      'dashboard-reviewed',
      'operating-model-understood',
    ],
    actionIds: ['open-settings-providers', 'open-hire-dialog', 'open-mission-control'],
  },
  {
    id: 'operating-model',
    title: 'Operating Model',
    summary:
      'Understand the difference between employees, workspaces, tickets, chats, runtime control, and evidence.',
    category: 'Onboarding',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Team-X treats AI agents as employees operating inside a company, not as one-off chatbots. The employee has a role, reporting line, runtime posture, memory context, and work history. The company owns the durable state around that employee so decisions, outputs, costs, and follow-ups remain inspectable after the conversation ends.',
      },
      {
        kind: 'bullets',
        items: [
          'Workspaces are isolation boundaries. Switching companies changes the employee roster, tickets, projects, goals, files, settings, guide progress, and audit evidence you are looking at.',
          'Employees are role-bound operators. Their title, manager, role spec, provider preference, and runtime profile all affect how work is framed and executed.',
          'Chat is for direct collaboration and quick clarification. Tickets are for accountable work that needs status, participants, files, memory, and completion evidence.',
          'Mission Control is the live operations view. Autonomy is the governance view. Settings is the configuration view. Audit and Telemetry are the evidence views.',
          'The command palette is the high-speed action surface. It can create work, navigate, search the vault, call meetings, and route complex requests through the agentic loop.',
        ],
      },
      {
        kind: 'callout',
        title: 'Mental model',
        text: 'If the result should be remembered, assigned, reviewed, or audited, make it a ticket, project, goal, file, meeting, or schedule item. Avoid burying important work in chat-only instructions.',
      },
    ],
    taskIds: ['workspace-model-reviewed', 'operating-model-understood'],
    actionIds: ['open-mission-control', 'open-tickets', 'open-command-history'],
  },
  {
    id: 'workspaces-and-companies',
    title: 'Workspaces And Companies',
    summary:
      'Create, switch, edit, archive, delete, import, and template company workspaces without mixing operational state.',
    category: 'Onboarding',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'The workspace switcher controls the active company. A company can be created blank or from an exported template, then customized with name, slug, icon, theme, and default provider. Workspace settings are not cosmetic only; they influence which company receives new employees, tickets, files, guide progress, runtime context, and audit events.',
      },
      {
        kind: 'bullets',
        items: [
          'Create a blank company when you want a clean operating environment with its own mission, slug, theme, settings, and future roster.',
          'Create from template when you want a known org shape or operating model without carrying over live ticket and project state that should stay behind.',
          'Use the company settings sheet to update name, slug, icon, theme, and default provider. Slugs are validated to lowercase letters, digits, and hyphens.',
          'Archive a workspace when it should leave the active rotation but remain recoverable. Delete only when the data is no longer needed.',
          'After switching companies, check the left rail and Mission Control before issuing commands so you do not assign work to the wrong workspace.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Deletion boundary',
        text: 'Company deletion is intentionally explicit. Use backup or export first when the workspace contains deliverables, decisions, tickets, or audit evidence you may need later.',
      },
    ],
    taskIds: ['workspace-model-reviewed'],
    actionIds: ['open-settings', 'open-settings-portability'],
  },
  {
    id: 'providers-and-runtime-readiness',
    title: 'Providers And Runtime Readiness',
    summary:
      'Configure model providers, API keys, model defaults, privacy posture, concurrency, and agentic loop budgets before scaling work.',
    category: 'Setup',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Providers are the execution fuel for employees, Copilot, command classification, and complex requests. A visible employee with no enabled provider can look ready while having no viable model route. The provider setup should be tested before you trust the workspace for daily operations.',
      },
      {
        kind: 'bullets',
        items: [
          'Enable a provider only after its base URL, API key, and default model are valid for the work you expect it to do.',
          'Use Test Connection from each provider card after changing keys, URLs, enabled state, or Ollama model tags.',
          'For Ollama, refresh the model picker to discover local and cloud-tagged models, then save the default model that should be used for that provider.',
          'Use Privacy Tier to cap whether local, open-source cloud, or proprietary cloud providers are eligible at runtime.',
          'Use Concurrency caps to keep local hardware and cloud rate limits from being overwhelmed by multiple employees or routines.',
          'Use Agentic Loop settings when complex command-palette requests terminate too early or run too long. Wider caps buy depth at the cost of time and tokens.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Readiness check',
        text: 'If employees stop responding or return empty output, check the enabled provider, provider test result, model name, privacy tier, concurrency cap, and budget settings before assuming the chat surface is broken.',
      },
    ],
    taskIds: ['provider-ready', 'settings-reviewed'],
    actionIds: ['open-settings-providers', 'open-settings'],
  },
  {
    id: 'enhanced-ai-capabilities',
    title: 'Enhanced AI Capabilities',
    summary:
      'Configure Phase 2 & 3 AI features: query expansion, semantic chunking v2, long-term memory, knowledge graph, multi-turn planning, streaming responses, and distributed tracing.',
    category: 'Setup',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Enhanced AI settings unlock Phase 2 & 3 capabilities that go beyond basic retrieval-augmented generation. These features work together to provide more intelligent, context-aware, and traceable AI interactions. Each feature can be enabled independently based on your needs and resource constraints.',
      },
      {
        kind: 'bullets',
        items: [
          'Query Expansion improves retrieval by generating semantic variations, synonyms, entity-based expansions, and hypothetical document embeddings (HyDE) for better matches.',
          'Semantic Chunking v2 uses document structure-aware splitting that preserves code blocks, list integrity, and markdown hierarchy instead of naive token-based chunking.',
          'Long-Term Memory extracts facts from conversations with freshness scoring (time decay + frequency boost), tracks summaries, and enables cross-thread context retention.',
          'Knowledge Graph builds a network of entities (people, concepts, events) and relationships (causes, belongs_to, related_to) for intelligent context retrieval and graph-based reasoning.',
          'Multi-Turn Planning creates execution plans with topological sorting, auto-revision on failures, and configurable complexity thresholds for complex multi-step requests.',
          'Streaming Responses enable real-time token-by-token output for better user experience on long-running generations, with configurable transport (SSE/WebSocket).',
          'Distributed Tracing provides W3C Trace Context compliance with full span hierarchy for debugging, performance analysis, and observability of AI operations.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Feature interaction',
        text: 'These features work best together. Query expansion feeds semantic chunking, which feeds long-term memory extraction, which updates the knowledge graph, all tracked by distributed tracing. Enable incrementally and test each before combining.',
      },
      {
        kind: 'paragraph',
        text: 'LLM Configuration controls the base model used for enhanced AI operations. Choose the provider (Ollama, OpenAI, Anthropic, etc.), model name, max tokens for generation, and temperature for creativity. Higher temperature (0.7-1.0) produces more diverse outputs; lower temperature (0.0-0.3) produces more deterministic results.',
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Resource considerations',
        text: 'Knowledge graph operations and distributed tracing add computational overhead. Use sample rate for tracing (0.1 = 10% of requests) in production to balance observability with performance. Set planning threshold based on your typical task complexity.',
      },
    ],
    taskIds: ['settings-reviewed'],
    actionIds: ['open-settings-enhanced-ai'],
  },
  {
    id: 'hiring-and-org-chart',
    title: 'Hiring And Org Chart',
    summary:
      'Build the workforce deliberately with role specs, reporting lines, profiles, promotions, and manager changes.',
    category: 'People',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Hiring creates real workspace employees, while the org chart controls the reporting structure that makes the workforce legible. The current hire dialog exposes the first fast-start roles, and the org/profile surfaces support the broader bundled non-system role catalog for profile edits and promotions.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Hire for the first operator when a workspace is empty or when the left rail needs a new direct collaborator.',
          'Choose a manager during hire when the employee should immediately sit under an existing reporting line.',
          'Open Org to inspect roots, reporting hierarchy, profile details, chat entry points, promotions, fire flow, and manager changes.',
          'Use profile edits to adjust employee name, title, avatar, provider preference, model preference, and reporting line without losing the employee record.',
          'Use Promote when the role itself should change. Promotion swaps role-bound fields such as role id, level, title, role spec hash, and tool policy.',
          'Use Fire only when the employee should be removed from active work. The flow preserves audit context instead of silently erasing history.',
        ],
      },
      {
        kind: 'callout',
        title: 'Scaling pattern',
        text: 'Start with one strategic owner and one execution specialist. Add managers and specialists when tickets expose persistent workload, not just because a large org chart looks impressive.',
      },
    ],
    taskIds: ['employee-ready', 'org-chart-reviewed'],
    actionIds: ['open-hire-dialog', 'open-org'],
  },
  {
    id: 'mission-control',
    title: 'Mission Control',
    summary:
      'Read the dashboard as the live operations floor for runs, employee queues, commands, timeline, stream, and team activity.',
    category: 'Operations',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Mission Control answers what is happening now. It is designed around live runs, runtime posture, active employees, queue pressure, blocked work, cost signals, recent commands, and Copilot insight cards so operators can act before work stalls.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Agent Runs to inspect recent autonomous or assisted loops, their status, step count, token use, cost, and duration.',
          'Use Employee Queues to spot open, in-progress, blocked, and done pressure per employee before assigning more work.',
          'Use the Timeline subview when you need chronological event context rather than panel summaries.',
          'Use the Stream subview when raw runtime output matters, especially during active employee work.',
          'Use the Floor subview when you want an employee-by-employee activity scan.',
          'Use Commands to audit command-palette requests, intent labels, and recent execution flow.',
          'Keep both Agent Runs and Employee Queues visible for hybrid daily operation unless a narrow review requires one panel to be hidden.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Operating habit',
        text: 'Open Mission Control at the start and end of each work session. It gives the fastest read on whether the company is actually executing, blocked, idle, or spending unexpectedly.',
      },
    ],
    taskIds: ['dashboard-reviewed'],
    actionIds: [
      'open-mission-control',
      'open-dashboard-timeline',
      'open-dashboard-stream',
      'open-dashboard-floor',
      'open-command-history',
    ],
  },
  {
    id: 'command-palette',
    title: 'Command Palette',
    summary:
      'Use natural language and slash commands for fast creation, routing, navigation, status checks, and complex agentic requests.',
    category: 'Operations',
    roles: ['owner', 'operator'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'The command palette is the keyboard-first control path. It classifies intent, fills entities, asks for missing details when needed, gates destructive actions, and records command history so high-speed work remains observable.',
      },
      {
        kind: 'bullets',
        items: [
          'Press Ctrl+K on Windows or Cmd+K on macOS to open the palette.',
          'Use plain commands such as hire an engineer, assign the auth bug, create a launch project, call a meeting, show tickets, or search the vault for a file.',
          'Use /show dashboard, /show tickets, /show projects, /show meetings, /show telemetry, /show files, /show audit, or /show settings when you want deterministic navigation without NLU classification.',
          'Destructive actions such as fire, close, end, and promote require explicit confirmation instead of silent execution.',
          'Complex or low-confidence requests route to the agentic loop, which is governed by provider readiness, runtime strategy, and Agentic Loop settings.',
          'Use ArrowUp in an empty input to browse recent command history and re-run or adapt prior actions.',
        ],
      },
      {
        kind: 'callout',
        title: 'Best use',
        text: 'Use the palette for fast intent capture. Use the full destination view afterward when the work needs inspection, participant edits, files, approvals, or evidence review.',
      },
    ],
    taskIds: ['command-palette-reviewed'],
    actionIds: ['open-command-history'],
  },
  {
    id: 'tickets-and-projects',
    title: 'Tickets And Work',
    summary:
      'Manage durable work through tickets, participants, status lanes, comments, attachments, and ticket memory.',
    category: 'Execution',
    roles: ['owner', 'operator'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Tickets are the unit of accountable work. They carry title, description, priority, status, assignee, participants, comments, attachments, thread memory, and audit events. A good ticket gives employees enough context to act and gives operators enough structure to verify completion.',
      },
      {
        kind: 'bullets',
        items: [
          'Create tickets from the Tickets view or command palette when work needs ownership, status, participants, files, or a deadline.',
          'Use Open, In Progress, Blocked, and Done status lanes to make work state explicit instead of relying on conversation memory.',
          'Use the participant selector in ticket detail to add or remove employees from an existing ticket thread.',
          'When a human comments on a ticket, Team-X wakes every employee participant and historical employee author on that ticket thread, not just the last pair of speakers.',
          'Attach files from the vault when employees need source material or when deliverables should stay connected to the work record.',
          'Use the ticket memory card to inspect the digest and checkpoint trail behind long ticket threads.',
          'Open ticket threads from the Threads drawer to preview the ticket detail on the left while keeping the thread queue visible on the right.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Ticket quality',
        text: 'A strong ticket says what outcome is required, why it matters, who should participate, which files or constraints apply, and what evidence will prove it is done.',
      },
    ],
    taskIds: ['ticket-queue-reviewed'],
    actionIds: ['open-tickets'],
  },
  {
    id: 'projects-goals-schedule',
    title: 'Projects, Goals, And Schedule',
    summary:
      'Connect backlog work to initiatives, measurable outcomes, target dates, and future employee wakeups.',
    category: 'Execution',
    roles: ['owner', 'operator'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Projects organize related work. Goals define measurable outcomes. Schedule coordinates dates and future wakeups. Used together, they turn a pile of tickets into an operating plan with visible deadlines and responsibility.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Projects Kanban to create initiatives, assign leads, set target dates, update status, and inspect linked tickets or goals.',
          'Use Goals when the desired result has a target, status, date, and project context that should be tracked separately from individual tickets.',
          'Ticket due dates, project target dates, and goal target dates appear automatically as read-only Schedule entries.',
          'Use Schedule Add to create manual tasks, deadlines, milestones, or reminders with start date, optional end time, optional reminder, priority, notes, and a link to a ticket, project, or goal.',
          'Assign a manual schedule item to an employee when that future item should wake an agent at the scheduled time.',
          'Complete or delete manual schedule items from the calendar or agenda. Derived ticket, project, and goal entries stay attached to their source records.',
          'Use Today, Overdue, Next 14 days, and Agent wakes counters to catch time pressure before it becomes blocked work.',
        ],
      },
      {
        kind: 'callout',
        title: 'Recommended pattern',
        text: 'Create durable work in Tickets, group it in Projects, measure outcomes with Goals, and use Schedule only for date coordination and future wakeups. Do not rely on chat-only reminders for accountable work.',
      },
    ],
    taskIds: ['project-flow-reviewed', 'schedule-reviewed'],
    actionIds: ['open-project-kanban', 'open-project-goals', 'open-project-schedule'],
  },
  {
    id: 'chat-threads-copilot',
    title: 'Chat, Threads, And Copilot',
    summary:
      'Use direct conversations, read-only transcripts, thread history, spelling tools, and Copilot insights without confusing them with ticket execution.',
    category: 'Collaboration',
    roles: ['owner', 'operator'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Chat is for direct employee collaboration. Threads preserve active and historical conversations. Copilot is a proactive observer that surfaces risks, opportunities, and system signals. These surfaces are useful together, but they do not replace tickets for durable work.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Chat for quick questions, direct instruction, clarification, and informal follow-up with a specific employee.',
          'Use ticket threads when the conversation should wake participants, retain ticket memory, carry attachments, and stay tied to status.',
          'Use the thread drawer to inspect active and historical conversations without losing your place in the queue.',
          'Open Copilot from the toolbar or Cmd/Ctrl+Shift+K when you need proactive insight filtering, severity/category scans, exports, or an Ask Copilot request.',
          'Copilot insights can be filtered by category and severity, exported as CSV or JSON, dismissed, or used to tune category weights.',
          'Right-click misspelled words in editable fields to use Chromium spelling suggestions, Add to Dictionary, and standard edit actions.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Boundary',
        text: 'If a chat answer creates a follow-up that must be tracked, convert it into a ticket, goal, schedule item, file, or meeting action before moving on.',
      },
    ],
    taskIds: ['chat-flow-reviewed'],
    actionIds: ['open-chat', 'open-tickets', 'open-mission-control'],
  },
  {
    id: 'meetings-and-collaboration',
    title: 'Meetings And Collaboration',
    summary:
      'Call meetings, review active and past sessions, inspect attendees, and convert collaboration into durable follow-up.',
    category: 'Collaboration',
    roles: ['owner', 'operator'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Meetings bring multiple employees into a structured collaboration record. They are useful for alignment, cross-functional discussion, and decision capture, but the meeting itself should not be the final home for accountable follow-up.',
      },
      {
        kind: 'bullets',
        items: [
          'Open Meetings to see active meetings first and past meetings below them.',
          'Call a meeting when the work requires multiple employees to discuss the same agenda rather than separate one-to-one chats.',
          'Use clear agendas so attendees understand why they were pulled into the room.',
          'Review meeting detail for live status, attendee count, timing, minutes, and action item context.',
          'End meetings when the collaboration is complete so live state does not drift.',
          'Convert action items into tickets, goals, or schedule entries when they require ownership, due dates, files, or audit evidence.',
        ],
      },
      {
        kind: 'callout',
        title: 'Meeting discipline',
        text: 'Invite only the employees needed for the decision or alignment. Use tickets for execution after the meeting so work does not disappear into minutes.',
      },
    ],
    taskIds: ['meeting-flow-reviewed'],
    actionIds: ['open-meetings', 'open-tickets', 'open-project-schedule'],
  },
  {
    id: 'files-and-deliverables',
    title: 'Files And Deliverables',
    summary:
      'Use the vault for uploaded source material, ticket attachments, integrity checks, search, and agent-created files.',
    category: 'Execution',
    roles: ['owner', 'operator'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Files is the company vault. It stores uploaded documents, source material, ticket attachments, and generated deliverables. Vault records are searchable, can be verified for integrity, and become evidence when tied to tickets or autonomous artifacts.',
      },
      {
        kind: 'bullets',
        items: [
          'Upload files when employees need durable reference material rather than pasted context.',
          'Use vault search for filenames, extracted text, and tags. When FTS5 is unavailable, the app falls back to basic matching rather than dropping search entirely.',
          'Attach vault files to tickets when the material belongs to a specific work item.',
          'Verify file integrity when a deliverable or source file matters operationally.',
          'Agents can create txt, md, csv, json, html, docx, xlsx, and pptx deliverables from active work.',
          'Legacy doc, xls, and ppt requests are produced as modern docx, xlsx, and pptx files.',
          'Agent-created deliverables are tagged as agent-created and attributed to the employee that created them.',
          'Use Files for browsing and attachment management; use Autonomy > Artifacts for execution provenance and captured runtime outputs.',
        ],
      },
      {
        kind: 'callout',
        title: 'Verification habit',
        text: 'Do not treat a deliverable as complete because an employee described it. Verify the file in Files or Artifacts and confirm it is attached to the right ticket when the work needs evidence.',
      },
    ],
    taskIds: ['file-vault-reviewed'],
    actionIds: ['open-files', 'open-autonomy-artifacts'],
  },
  {
    id: 'extensions-and-authority',
    title: 'Extensions And Authority',
    summary:
      'Install skills, import MCP servers, review provenance, and govern requested capabilities before employees use them.',
    category: 'Platform',
    roles: ['owner', 'builder'],
    blocks: [
      {
        kind: 'paragraph',
        text: 'Extensions expand what employees can know and do. Skills add packaged behavior and domain workflow. MCP servers expose tools and resources. Authority keeps those additions explicit by making requested paths, capabilities, trust state, and grants visible.',
      },
      {
        kind: 'bullets',
        items: [
          'Install skills from a local folder or supported external source only after reviewing the manifest and intended use.',
          'Import MCP servers when employees need access to external tools or resources, then review the requested authority before assuming they are safe.',
          'Use authority requests and grants to decide filesystem access, tool access, network posture, and capability scope.',
          'Treat extension provenance as operational context. Who supplied the package matters when it asks for filesystem or execution authority.',
          'Monitor extension activity in Audit so authority changes and extension-driven work remain traceable.',
          'Revoke or remove authority that is no longer needed.',
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
    actionIds: ['open-settings-extensions', 'open-audit'],
  },
  {
    id: 'autonomy-control-plane',
    title: 'Autonomy Control Plane',
    summary:
      'Supervise doctor checks, benchmarks, self-improvement, runtimes, routines, budgets, approvals, artifacts, memory, and operator access.',
    category: 'Governance',
    roles: OWNER_AND_BUILDER,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Autonomy is where Team-X makes execution posture visible. It collects health checks, benchmark evidence, improvement loops, runtime profiles, routines, budget policy, approvals, artifacts, memory, and operator access into one governance surface.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Doctor before long-running external agents so database, backup, runtime, secret, provider, MCP, and budget posture is checked in one report.',
          'Use Benchmarks to replay deterministic runtime scenarios and inspect pass rates, recovery timing, duplicate-work prevention, spend, and artifact evidence.',
          'Use Improve to run the agent self-improvement loop. It inspects recent work failures, runtime failures, blocked tickets, and stale in-progress tickets, then opens deduped correction tickets through the normal queue.',
          'Use Access to verify whether the workspace is still local-only or already modeled for invited and cloud-ready operators.',
          'Use Runtimes and Routines to understand how work is produced, not just who is assigned to it.',
          'Use Budgets and Approvals together so cost ceilings and risky actions are visible before they silently block autonomy.',
          'Use Artifacts to review external runtime outputs that were captured from completed autonomous execution.',
          'Use Memory to inspect what long-running threads retain, what was checkpointed, and how much context gets packed forward.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Operating split',
        text: 'Mission Control tells you what is happening now. Autonomy tells you why that execution is allowed, how it is governed, which recurring systems shape workload, and which correction tickets are needed after repeated failures.',
      },
    ],
    taskIds: [
      'autonomy-access-reviewed',
      'runtime-posture-reviewed',
      'routine-governance-reviewed',
      'improvement-loop-reviewed',
    ],
    actionIds: [
      'open-autonomy-doctor',
      'open-autonomy-benchmarks',
      'open-autonomy-improvement',
      'open-autonomy-runtimes',
      'open-autonomy-routines',
      'open-autonomy-approvals',
      'open-autonomy-artifacts',
      'open-autonomy-memory',
      'open-autonomy-access',
    ],
  },
  {
    id: 'runtimes-routines-access',
    title: 'Runtimes, Routines, And Access',
    summary:
      'Bind employees to explicit runtime profiles, model recurring work, and keep operator access understandable.',
    category: 'Governance',
    roles: OWNER_AND_BUILDER,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Runtime profiles and routines prevent autonomy from becoming implicit. Runtime profiles define execution posture and bindings. Routines describe recurring operating loops that materialize as visible work. Access describes who can supervise the workspace locally, through invitation posture, or through future cloud-ready membership records.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Runtime Profiles to inspect live heartbeats, ticket checkouts, profile health, bindings, and whether an employee is using internal, local, or external execution posture.',
          'Create explicit runtime profiles before assuming a particular employee is allowed to run through an external or always-on path.',
          'Use Routines for repeated operating loops that should create visible tickets or governed work, not hidden background automation.',
          'Review routine cadence, template, scope, and output expectations before enabling unattended recurrence.',
          'Use Access to inspect local owner bootstrap, operator memberships, invite state, role, auth mode, expiration, and cloud-link readiness.',
          'Queue shared operator invites in Autonomy > Access before expecting invited or cloud posture to become actionable.',
          'Treat invited and cloud sharing as posture plus metadata until the dedicated sync/auth bundle lands.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Autonomy boundary',
        text: 'Do not let recurring work or external runtimes become invisible. Every profile, routine, invite, checkout, and heartbeat should be explainable from the control plane.',
      },
    ],
    taskIds: [
      'runtime-posture-reviewed',
      'routine-governance-reviewed',
      'autonomy-access-reviewed',
    ],
    actionIds: ['open-autonomy-runtimes', 'open-autonomy-routines', 'open-autonomy-access'],
  },
  {
    id: 'budgets-approvals-governance',
    title: 'Budgets, Approvals, And Governance',
    summary:
      'Control spend, risky actions, authority requests, planner decisions, routine gates, and exception handling.',
    category: 'Governance',
    roles: OWNER_AND_BUILDER,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Budget and approval controls turn autonomy into governed work. A budget can warn or hard-stop spend by company, employee, runtime, or routine scope. Approvals unify authority, planner, budget, and routine decisions so humans can see what is waiting for permission.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Budgets to review monthly burn, policy scope, warning thresholds, hard caps, and recent ledger entries.',
          'Use Approvals when budget gates trip, extensions request authority, planner actions require confirmation, or routine decisions need operator review.',
          'Treat a hard stop as a governance result, not an application crash. Inspect the policy and decide whether the work should continue.',
          'Record approvals and denials with enough rationale that future audit review can explain the decision.',
          'Review budget posture before enabling routines or high-concurrency provider work.',
          'Use Telemetry to find spend patterns, then use Budgets to enforce the operating rule.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Governance loop',
        text: 'Telemetry measures what happened. Budgets define what is allowed next. Approvals decide exceptions. Audit proves who changed the posture.',
      },
    ],
    taskIds: ['budget-governance-reviewed', 'routine-governance-reviewed'],
    actionIds: ['open-autonomy-budgets', 'open-autonomy-approvals', 'open-telemetry', 'open-audit'],
  },
  {
    id: 'long-run-memory',
    title: 'Long-Run Memory',
    summary:
      'Inspect digests, checkpoints, packed context, and dropped-history posture before long work drifts.',
    category: 'Governance',
    roles: OWNER_AND_BUILDER,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Long-run memory is the bridge between direct conversation and durable autonomous work. Digests condense prior context, checkpoints preserve resumable state, and packed-context rules keep future turns inside a bounded envelope instead of replaying raw history forever.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Autonomy > Memory to inspect the current digest, latest checkpoint, checkpoint trail, dropped-context posture, blockers, active artifacts, unresolved approvals, and resume origin for a thread.',
          'Use Memory Settings to choose default pack budget, recent-turn window, checkpoint depth, digest cadence, and dropped-history behavior.',
          'Use thread-memory cards inside Chat and Tickets when you need a fast handoff from a live conversation to the full memory surface.',
          'Inspect Memory before widening runtime limits when work feels long, repetitive, or context-heavy.',
          'Use checkpoints to resume interrupted work with intent instead of asking the employee to infer where the prior run stopped.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Context discipline',
        text: 'Most long-session issues are better handled by bounded context, summaries, and checkpoints than by sending every historical message back through the model.',
      },
    ],
    taskIds: ['memory-engine-reviewed'],
    actionIds: ['open-autonomy-memory', 'open-settings-memory'],
  },
  {
    id: 'portability-sharing',
    title: 'Portability & Sharing',
    summary:
      'Export workspaces, save reusable templates, import packages safely, bind missing secrets, and preserve provenance.',
    category: 'Governance',
    roles: OWNER_AND_BUILDER,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Portability is not the same thing as backup. Backup is full-fidelity recovery. Portability is an operator-facing copy, import, export, and template workflow designed to move operating models safely without leaking secrets or overwriting active local state.',
      },
      {
        kind: 'bullets',
        items: [
          'Preview every local or GitHub package before import so source provenance, package version, dry-run plan, redactions, and missing secret bindings are visible.',
          'Use the missing-secret wizard to bind runtime provider API keys before creating workspaces from external templates.',
          'Save templates when you want repeatable org structures, settings, runtime notes, and operating patterns without live execution state.',
          'Use export modes intentionally. A template is for reuse; a full package is for transfer; a redacted package is for sharing posture.',
          'Imported workspaces stay non-destructive. Team-X creates a fresh local copy and preserves origin metadata for future sharing and template history.',
          'Review runtime template diagnostics after importing so profiles, bindings, and notes are understood before employees rely on them.',
          'Queue shared operator invites in Autonomy > Access before expecting invited or cloud posture to become actionable.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Secret boundary',
        text: 'Provider API keys and sensitive runtime secrets should be rebound locally after import. A portable package should never be treated as a secret transport mechanism.',
      },
    ],
    taskIds: ['portability-reviewed', 'autonomy-access-reviewed'],
    actionIds: ['open-settings-portability', 'open-autonomy-access'],
  },
  {
    id: 'settings-privacy-backup',
    title: 'Settings, Privacy, And Backup',
    summary:
      'Understand the full Settings surface: updater, runtime, privacy, RAG, enhanced AI, concurrency, permissions, planner, copilot, providers, portability, memory, and recovery.',
    category: 'Setup',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Settings is the configuration cockpit for the local app. Some sections affect cost and model routing immediately. Others affect governance, recovery, context packing, extension authority, or future workspace portability. Review settings before assuming a workspace is production-ready.',
      },
      {
        kind: 'bullets',
        items: [
          'Updater checks for available app updates and surfaces update status.',
          'Runtime Strategy chooses the operating posture for model routing and hardware use.',
          'Privacy Tier caps whether local, open-source cloud, or proprietary cloud providers can be used.',
          'RAG controls retrieval-augmented context from the vault, including enablement, top K, threshold, context budget, embedding provider, and embedding model.',
          'Enhanced AI configures Phase 2 & 3 capabilities: query expansion, semantic chunking v2, long-term memory (facts, summaries), knowledge graph (entities, relationships), multi-turn planning with auto-revision, streaming responses, and distributed tracing with W3C compliance.',
          'Concurrency caps keep provider calls within local hardware limits, cloud plan limits, and budget expectations.',
          'Permissions define who can manage workspace actions such as providers, budgets, and operators in shared-ready contexts.',
          'Planner and Agentic Loop settings govern write-side decomposition, confirmation gates, max steps, max tokens, and timeout behavior.',
          'Copilot settings control analyzer enablement, interval, categories, and category weights.',
          'Backup & Restore creates local backups containing the database and vault files; restore intentionally replaces current data and should be treated as destructive.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Recovery rule',
        text: 'Create a backup before major workspace changes, imports, updates, routine experiments, or extension authority changes. Backup is the recovery path; portability is the reuse and sharing path.',
      },
    ],
    taskIds: ['settings-reviewed', 'provider-ready'],
    actionIds: [
      'open-settings',
      'open-settings-providers',
      'open-settings-enhanced-ai',
      'open-settings-memory',
    ],
  },
  {
    id: 'telemetry-and-audit',
    title: 'Telemetry And Audit',
    summary:
      'Measure usage, cost, latency, employee activity, command behavior, authority changes, and automation evidence.',
    category: 'Evidence',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Telemetry and Audit are how operators separate what they think happened from what the system recorded. Telemetry explains usage and cost. Audit explains actions, mutations, authority changes, command execution, and runtime events.',
      },
      {
        kind: 'bullets',
        items: [
          'Use Company Telemetry for total runs, token usage, model spend, provider mix, and workspace-level volume.',
          'Use Employee Telemetry to see which employees are consuming runtime, producing work, or generating unexpected cost.',
          'Use Cost Breakdown to compare providers, models, employees, and time windows before changing budgets or provider strategy.',
          'Use Audit when a workspace, employee, ticket, project, meeting, file, command, extension, authority grant, runtime checkout, approval, or budget event needs evidence.',
          'Use audit filters and search when tracing root cause. Start from the symptom event, then walk backward through provider, authority, command, ticket, or runtime changes.',
          'Export evidence when another operator, review process, or support workflow needs a durable record.',
        ],
      },
      {
        kind: 'callout',
        title: 'Evidence habit',
        text: 'If a claim affects cost, security, authority, runtime behavior, or customer-facing output, verify it through Telemetry, Audit, Files, Artifacts, or the relevant ticket before treating it as true.',
      },
    ],
    taskIds: ['telemetry-reviewed', 'audit-reviewed'],
    actionIds: ['open-telemetry', 'open-audit', 'open-command-history'],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    summary:
      'Diagnose provider, participant, authority, memory, budget, routine, file, and workspace-state problems from the right surface.',
    category: 'Support',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Most Team-X issues are caused by configuration drift, missing authority, provider mismatch, budget gates, a workspace with no live resources, or a ticket thread that does not include the employees expected to wake. Start with the surface that owns the failure rather than guessing from the symptom.',
      },
      {
        kind: 'bullets',
        items: [
          'If employees do not respond, confirm the enabled provider, connection test, default model, privacy tier, API key, and provider-specific concurrency cap.',
          'If an agent on a ticket does not wake after a comment, verify that the employee is present in the ticket participant section or is a historical author on that ticket thread.',
          'If a ticket has the right people but stale behavior, inspect the ticket memory card, Autonomy > Memory, and recent checkpoints.',
          'If an extension appears installed but unusable, review authority requests, grants, trust state, and Audit events.',
          'If autonomous work does not start, run Autonomy Doctor and inspect runtime profiles, budget policy, approval queue, and provider health.',
          'If a routine did not materialize work, inspect Autonomy > Routines, Budgets, Approvals, and Audit before editing the routine blindly.',
          'If a workspace feels empty, verify the active company, employee roster, enabled providers, tickets, projects, goals, files, and schedule entries.',
          'If a deliverable is missing, check Files, ticket attachments, Autonomy > Artifacts, and the employee thread before asking for regeneration.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'Root-cause route',
        text: 'Provider issues live in Settings. Work assignment issues live in Tickets, Org, and Mission Control. Governance issues live in Autonomy. Evidence issues live in Telemetry, Audit, Files, and Artifacts.',
      },
    ],
    taskIds: ['provider-ready', 'authority-reviewed', 'audit-reviewed'],
    actionIds: [
      'open-settings-providers',
      'open-tickets',
      'open-autonomy-doctor',
      'open-audit',
      'open-files',
    ],
  },
  {
    id: 'best-practices',
    title: 'Best Practices',
    summary:
      'Operate Team-X with a repeatable rhythm for setup, work intake, review, governance, and recovery.',
    category: 'Operations',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'The best Team-X work happens when the operating rhythm is explicit. Configure the runtime, create durable work, assign the right employees, verify outputs, review cost and audit evidence, then preserve or export the state before major changes.',
      },
      {
        kind: 'bullets',
        items: [
          'Start each session in Mission Control and end each session by checking blocked work, active runs, cost, and recent commands.',
          'Use Chat for quick collaboration and Tickets for anything that needs ownership, participants, files, dates, or evidence.',
          'Use Projects and Goals to explain why tickets exist and what outcome they serve.',
          'Use Schedule for deadlines, milestones, reminders, and future employee wakeups.',
          'Use Files for durable material and artifacts for runtime output evidence.',
          'Use Autonomy Doctor before long unattended work or after major provider, extension, runtime, routine, or backup changes.',
          'Use Budgets and Approvals before scaling concurrency, adding routines, or enabling more expensive providers.',
          'Back up before major imports, updates, authority changes, or destructive workspace actions.',
          'Verify claims against source surfaces before making product, customer, financial, or security decisions.',
        ],
      },
      {
        kind: 'callout',
        title: 'Daily loop',
        text: 'Mission Control, Tickets, Projects, Schedule, Files, Autonomy, Telemetry, and Audit form the operating loop. Use the loop every day instead of managing work only from the employee rail.',
      },
    ],
    taskIds: ['dashboard-reviewed', 'ticket-queue-reviewed', 'operating-model-understood'],
    actionIds: ['open-mission-control', 'open-tickets', 'open-project-schedule', 'open-telemetry'],
  },
  {
    id: 'quick-reference',
    title: 'Quick Reference',
    summary:
      'Keep the essential shortcuts, tabs, and decision rules visible after onboarding is complete.',
    category: 'Reference',
    roles: ALL_ROLES,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Use this section when you already understand the product and need a compact reminder of where to go next. The app is dense by design, so the shortest path is usually to pick the surface that owns the state you need to change or verify.',
      },
      {
        kind: 'bullets',
        items: [
          'Ctrl+K or Cmd+K opens the command palette. Cmd/Ctrl+Shift+K opens Copilot. Esc closes dialogs and sheets where supported.',
          'Dashboard is for live operations. Autonomy is for governance. Org is for people. Projects is for initiatives, goals, and schedule. Tickets is for durable work.',
          'Meetings is for structured collaboration. Chat is for direct conversation. Files is for vault material. Telemetry is for cost and usage. Audit is for evidence. Settings is for configuration.',
          'Use provider settings when output is missing. Use ticket participants when a ticket employee does not wake. Use authority settings when an extension cannot act. Use budgets and approvals when autonomy is blocked.',
          'Use backup for full recovery. Use portability for transfer, import, export, templates, and redacted sharing posture.',
          'When in doubt, create a ticket. Tickets are the safest default for work that should be assigned, remembered, reviewed, or completed.',
        ],
      },
      {
        kind: 'callout',
        tone: 'accent',
        title: 'First five minutes',
        text: 'Enable a provider, verify or hire an employee, open Mission Control, create a ticket, send one direct chat, then review Telemetry and Audit once the work completes.',
      },
    ],
    taskIds: ['operating-model-understood'],
    actionIds: ['open-mission-control', 'open-command-history', 'open-settings'],
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
