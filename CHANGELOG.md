# Changelog

All notable changes to Team-X are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

### Changed

- **Developer reference rewritten to local-first reality.**
  `docs/developer-guide/api-reference.md` previously described a fictional
  hosted REST API at `api.teamflow-x.com` with webhooks, OAuth, and a
  public plugin marketplace — none of which exist in Team-X. The
  Strategia-X site-docs sync was mirroring this faithfully and would have
  published roadmap content as shipped product. The page is now a truthful
  reference covering Architecture, MCP server development (the real
  extension point), role-pack format (real, against the actual
  `@team-x/role-schema` YAML frontmatter), and the internal IPC surface.
  A bold caveat at the top spells out what Team-X **doesn't** ship: no
  hosted API, no webhooks, no OAuth, no plugin marketplace, no first-party
  third-party-service integrations.
- **README "Developer" links updated** to match the new single-page
  developer reference and drop the deleted integration-guide entry.
- **`docs/llms.txt` Developer + Community sections corrected** to point at
  `github.com/Git-Rocky-Stack/Team-X` and drop the placeholder
  `teamflow-x.com` / `discord.gg/teamflow-x` references that don't exist.
  Documentation file tree updated to remove the deleted integration-guide
  entry.
- **Bundled `teamflow-x.com` placeholder purge across 12 docs files.**
  The `teamflow-x.com` brand was a placeholder that crept into the docs
  before the actual `Git-Rocky-Stack/Team-X` repo path / Strategia-X
  branding was finalized; the docs-sync script was mirroring it to the
  live website. Every reference is now corrected:
  - **URLs:** `teamflow-x.com/download` → GitHub Releases page;
    `docs.teamflow-x.com` → in-repo `docs/` tree;
    `support.teamflow-x.com` / `status.teamflow-x.com` → dropped (don't
    exist for a local-first app); `discord.gg/teamflow-x` → dropped (no
    Discord); `github.com/teamflow-x/*` → `github.com/Git-Rocky-Stack/Team-X`.
  - **Emails:** `support@`, `feedback@`, `migration@`, `accessibility@`,
    `community@`, `developers@`, `sales@`, `templates-feedback@`,
    `integrations@teamflow-x.com` — all rewritten as instructions to open
    a GitHub issue (with topical labels: `accessibility`, `migration`,
    `templates`) or a GitHub Discussion, since Team-X is open-source and
    community-supported with no hosted support email.
  - **Citations** in `docs/long-llms.txt` (APA + plain + BibTeX) updated
    to cite v3.1 and point at the real GitHub repo.
  - **Scenario disambiguation:** `scenarios/01-product-development-lifecycle.md`
    used `teamflow-x.com` as the fictional company "TeamFlow Analytics"'s
    domain in a case study. Renamed to `teamflow-analytics.com` so the
    storytelling stays coherent but the domain is clearly not Team-X.
    `scenarios/04-cross-functional-collaboration.md`'s placeholder
    WebSocket endpoint renamed to `wss://api.example.com/...` (RFC 2606
    reserved domain).
  - **Cosmetic fictions stripped where adjacent:** `@teamflowx` Twitter
    references dropped (no Twitter); "Sign up / Create Account" steps
    softened to "Team-X is local-first — no account required"; FAQ's
    credit-refund passage rewritten to point users at their actual LLM
    provider's billing terms (Team-X charges nothing).
  - Twelve files touched: `llms.txt`, `long-llms.txt`,
    `user-guide/cli-reference.md`, `user-guide/video-scripts/README.md`,
    `user-guide/accessibility-guide.md`, `user-guide/migration-guide.md`,
    `user-guide/templates/README.md`, `user-guide/troubleshooting.md`,
    `user-guide/faq.md`, `user-guide/getting-started/quick-start.md`,
    `user-guide/scenarios/01-product-development-lifecycle.md`,
    `user-guide/scenarios/04-cross-functional-collaboration.md`.
- **Pricing, signup, and fictional CLI deep-clean (follow-up to the
  brand-placeholder purge).** The same content-drift problem extended
  past URLs and emails into entirely fictional product surface: a
  freemium/credit-purchase billing model, a hosted-account
  signup-and-login flow, and a 530-line CLI documenting a `teamx`
  binary that doesn't exist. Sweep:
  - **`faq.md` "Billing & Costs" rewritten as "Costs & Provider Spend".**
    The fictional credit-based system (`$10/$50/$100/$500 credit
    packages`, `12-month expiration`, refund flow, freemium tier table
    with employee quotas) is gone. Replaced with the honest model:
    Team-X is free; the cost you see is your LLM provider's bill;
    Team-X's job is to route the request, count the tokens, and enforce
    the budget caps (workspace cap, per-employee monthly token cap from
    H7, write-side amber gate). The "Is Team-X free?" tier table is
    gone too.
  - **`faq.md` "Account & Settings" rewritten as
    "Uninstalling & Data Export".** Replaced "cancel my account",
    "change my email", "merge accounts" — none of which exist for a
    local-first app — with the real story: back up via Settings → Data,
    uninstall via the OS, optionally wipe local data directories,
    remove keychain entries via OS tools. Multi-workspace section
    rewritten to remove the fictional Free/Basic/Pro/Enterprise tier
    table; cross-workspace "salary allocation" replaced with how token
    spend actually flows.
  - **`faq.md` collaboration question** softened: the v3.0.0 shared
    workspace + operator invite flows are real, but the documented UI
    (`Settings → Collaborators → Invite`, "Invite via email") was made
    up. Rewritten to point users at `Settings → Workspaces` for the
    current (link-based) sharing surface.
  - **`long-llms.txt` first-time setup flow:** step 3
    "Sign Up/Create Account: Email/password or social login" replaced
    with "Launch Team-X — opens directly to the Workspace Setup Wizard;
    no account, no signup". New step 5 added explicitly calling out
    provider key configuration as part of first-boot.
  - **`video-scripts/README.md` `[2:00-4:00]` narration:** previously
    "Create an account with your email and password, or sign in with
    Google or GitHub". Rewritten as a local-first, no-account narration
    that includes the provider-key step honestly.
  - **`cli-reference.md` rewritten from 717 lines to 236 lines.** The
    Command Palette section (which describes real natural-language
    commands) is kept verbatim. The 530-line "CLI Tool" section
    documenting a fictional `teamx` binary (with `teamx ticket`,
    `teamx employee`, `teamx budget`, `teamx run`, `teamx workspace`
    subcommands, a `Connect-TeamX` PowerShell module, a `teamx` Python
    SDK, `TEAMX_API_KEY` / `TEAMX_WORKSPACE` env vars, and a
    `curl https://teamflow-x.com/install-cli.sh | bash` installer) is
    gone. Replaced with a short honest section on the actual developer
    CLI: `ai-cli` (bin `team-x-ai`) in `@team-x/intelligence`, with
    its real five commands (`info`, `knowledge`, `memory`, `eval`,
    `trace`) and an explicit denial list spelling out everything the
    CLI does NOT support. Pointer added to MCP servers as the right
    extension point for scripted workflows.
  - **`quick-start.md` workspace creation mock-up:** removed the
    fictional "Employee Quota: [5 employees] (basic tier)" line; the
    Monthly Budget line clarifies the cap applies to *provider* spend,
    not a Team-X charge.
  - **`scenarios/06-multi-workspace-operations.md`:** removed
    "Max 10 employees per workspace (basic tier)" and rewrote the
    cross-workspace "salary allocation" passage to clarify that the
    percentages allocate the operator's *LLM provider* bill, not a
    Team-X salary system that doesn't exist.

  Verification: zero matches remain for `freemium`, `credit-based`,
  `purchase credit`, `TEAMX_API_KEY`, `teamx ticket`, `teamx employee`,
  `teamx budget`, `teamx run`, or `teamx workspace` outside the
  intentional denial list in `cli-reference.md` and the CHANGELOG
  context above.

### Fixed

### Deprecated

### Removed

- **`docs/developer-guide/integration-guide.md` deleted.** The page was
  entirely premised on hosted webhook URLs (`api.teamflow-x.com/webhooks/*`)
  and first-party integrations (GitHub PR auto-review, GitLab, Slack,
  Discord, Jira, Notion) that Team-X has never shipped and is not on the
  roadmap. Removing the source so the docs-sync script can't mirror
  fictional surface area to the live Strategia-X site. CLI reference
  (`docs/user-guide/cli-reference.md`) remains — it describes the real
  CLI.

### Security

---

## [3.1.0] — 2026-05-10 — Agentic prompt-engineering audit P1 closure (H6–H14) · orchestrator hardening

Minor release closing nine P1 findings from the 2026-05-07 agentic-system
prompt-engineering audit (H6 through H14) plus an orchestrator `run-agent`
hardening pass. Each `H<n>` finding ships with implementation + a dedicated
`describe` block (greppable on the string `audit 2026-05-07`) + audit-doc
resolution entry. Every change is backward-compatible — new fields/deps
optional, pre-H<n> callers unchanged.

### Added

- **H6 — Typed event payloads + runtime guards** in
  `packages/shared-types/events` so event consumers can discriminate by
  `kind` with full type narrowing instead of casting through `unknown`.
- **H7 — Per-employee monthly token caps** in `budget-governance-service`,
  Set-backed scope membership so cap evaluation is O(1) per check instead
  of scanning the assignment list each turn.
- **H10 — `work.failed` payload schema** in `agentic-loop-service`: every
  failure now carries `threadId` / `employeeId` / `messageId` so downstream
  audit, telemetry, and the self-improvement loop can attribute the failure
  to the right surface without re-querying.
- **H13 — Copilot insight severity ceiling** in
  `copilot-analyzer-service.ts`. `MAX_CRITICAL_DRAFTS_PER_TICK = 2` plus a
  pure `applyCriticalCeiling` helper bounds the critical-alert surface:
  overflow critical drafts get downgraded to `warning` (signal preserved,
  fatigue surface bounded). New `criticalProposed` /
  `criticalDowngraded` telemetry counters on
  `CopilotAnalyzerTickResult` and `CopilotAnalyzedPayload`, zero-init on
  every early-exit path. **+11 tests** (7 helper + 4 service integration).
- **H14 — Copilot category-weight feedback loop closure**. New pure
  `aggregateCategoryWeightsFromDismissals` helper produces a complete
  updated weights map + audit-trail of changed categories. New opt-in
  `autoApplyDismissalFeedback` toggle on the dismiss handler: when ON,
  the loop persists weights via `setCopilotWeights`, emits
  `copilot.weights.changed` with `actorKind='employee'` /
  `actorId='system-copilot'`, and returns `feedbackApplied` instead of
  the advisory `feedbackSuggestion`. Defensive fallbacks — missing setter,
  setter-throws, and empty aggregation all degrade to the advisory path
  with `console.warn`. New `CopilotFeedbackApplied` type; mutually-exclusive
  `feedbackApplied` vs `feedbackSuggestion` on `CopilotDismissResult`.
  **+13 tests** (6 aggregator + 5 auto-apply integration + 2 advisory pins).

### Changed

- **H8 — Retrieval orchestrator** dedup-by-`ref` plus a freshness-bias
  scoring term so identical citations from multiple sources collapse and
  recent context outranks stale matches at equal cosine distance.
- **H9 — Intelligence loop** now uses bounded exponential backoff with a
  `max-attempts` guard so a flapping downstream can never spin the loop
  indefinitely.
- **H11 — Agentic tools** enforce a tool-result size cap on the default
  chat path so a runaway tool response cannot blow the model context
  budget — tools return a truncation marker instead of unbounded text.
- **H12 — Agent-improvement service** dedupes by causation-chain root and
  adds a recursion-via-DB block so self-improvement runs cannot chain into
  themselves through the events table.
- **Orchestrator run-agent hardening**
  (`apps/desktop/src/main/orchestrator/run-agent.ts`). Companion tests
  expanded by ~318 lines in `run-agent.test.ts`. Resolves audit follow-up
  items in `docs/audits/2026-05-07-agentic-system-prompt-engineering-audit.md`.
- **Release-marker freeze pinned to 3.1.0** across all 7 workspace
  `package.json` files. Test guard
  (`apps/desktop/src/renderer/src/app/top-bar.test.tsx`) updated in
  lock-step so the freeze test pins to the new minor.
- **Documentation URL canonicalization** — README, CONTRIBUTING,
  getting-started docs, the static landing site (`docs/site/index.html`),
  and `role-packs/strategia-official/pack.json` now point at
  `github.com/Git-Rocky-Stack/Team-X` (the actual remote). Pre-3.1.0
  references pointed at the placeholder `strategia-x/team-x` org/repo
  pair and would 404. Clone-and-`cd` snippets corrected to
  `cd Team-X` so they don't break on case-sensitive filesystems.

### Fixed

- Per H10, work-failure events that previously surfaced without
  `threadId` are now always attributed to their originating thread.
- Per H13, ticks that previously produced an unbounded number of
  `severity: critical` insights are now capped at 2 per tick with the
  surplus downgraded rather than dropped.

---

## [3.0.0] — 2026-05-07 — Agentic system enhancement · settings UX repairs · system-employee top-up

Major release in two halves: a four-fix sweep across Settings + system bootstrap that
restores user-visible features Rocky filed as broken (`copilot.ask` error for pre-M33
companies, dead proactive-mode toggle, missing Skill / MCP install entry points,
no way to delete old backups), and a three-track agentic-system enhancement that
replaces three load-bearing stubs with their real implementations (Enhanced AI's
LLM provider, workload-aware delegation signals, the `/promote` natural-language
command). The composition root for the main process now wires every authored
service that was sitting on the shelf — verified by a comprehensive
authored-vs-wired audit across 119 service files and ~290 IPC channels.
Tests **2051/2053 passing** (every targeted suite green; the two pre-existing
failures are a `keytar` native-ABI mismatch and a release-marker drift now
resolved by this bump). Typecheck clean across all four `tsconfig` projects.

### Added

- **Authority Snapshot install entry points**
  (`apps/desktop/src/renderer/src/features/settings/extensions-section.tsx`).
  Two new buttons — `Add Skill` and `Add MCP` — surface in the card header.
  Each opens the existing `InstallSkillDialog` / `ImportMcpDialog`, both of
  which had shipped fully-working but were not exposed from the new Settings
  page (the previous shell had a banner explaining marketplace installs were
  removed "until the replacement flow can be engineered without risking the
  whole page" — this is that replacement). CLI extensions deferred pending
  the agentic system design pass; `EXTENSION_KINDS` remains `['skill', 'mcp']`.
  Test guard flipped from `not.toContain('InstallSkillDialog')` to
  `toContain` with the right wiring shape (`extensions-section.test.tsx:89-115`).
- **Backup delete IPC + UX**
  (`apps/desktop/src/main/services/backup.ts`,
  `packages/shared-types/src/ipc.ts`,
  `apps/desktop/src/main/ipc/handlers.ts`,
  `apps/desktop/src/main/ipc/register.ts`,
  `apps/desktop/src/preload/api.ts`,
  `apps/desktop/src/renderer/src/hooks/use-backup.ts`,
  `apps/desktop/src/renderer/src/features/settings/backup-section.tsx`).
  Full-stack add: service `delete(backupPath)` method with a path-traversal
  safety guard (`path.relative` from `backupsDir` rejects `..` traversal,
  absolute paths on different drives, the jail itself, and empty strings),
  `BackupDeleteRequest` / `BackupDeleteResponse` shared types, `backup.delete`
  channel registered alongside `backup.create` / `backup.restore` / `backup.list`,
  preload method, `useDeleteBackup` hook with `['backups']` cache invalidation,
  and a `Trash2` icon button per row in the BackupSection with a confirm
  flow that's mutually exclusive with the existing Restore confirm. Six new
  unit tests cover the happy path, idempotent missing-path delete, four
  traversal-guard cases (`backup.test.ts:188-243`).
- **Boot-time system-employee top-up**
  (`apps/desktop/src/main/index.ts:1437-1470`).
  The per-company boot loop now idempotently runs `ensureSystemAgent` +
  `ensureSystemCopilot` for every live company. Pre-M33 companies — created
  via M31 paths before `ensureSystemCopilot` landed — now get their missing
  `system-copilot` row on first boot after the upgrade. Without this top-up,
  `copilot.ask` threw `[copilot-service] No system-copilot employee for
  company "<id>". Did ensureSystemCopilot run on company creation?` for any
  company that predated M33. Errors per-company are logged + swallowed so a
  single broken company can't block boot for the rest. New regression test
  `system-agent-bootstrap.test.ts` simulates the pre-M33 state (agent row
  exists, copilot row missing) and asserts the agent row stays untouched
  while the copilot row gets created.

### Changed

- **Enhanced AI now uses the real LLM provider**
  (`apps/desktop/src/main/index.ts:1189-1248`).
  The M32 placeholder `llmComplete` that returned the literal string
  `(LLM response not configured)` regardless of input is gone. Replaced with
  an adapter that resolves the first live company's `system-agent`, threads
  it through the same `resolveProvider` closure the agentic loop and copilot
  analyzer use (test-mode → canned; production → runtime profile + secrets),
  and accumulates `streamAgent` deltas into a single text blob — same shape
  the `WriteSideCompleteFn` adapter uses at line ~1862. All 7 `enhancedAi.*`
  IPC channels (`enhancedAi.stats`, `enhancedAi.query`,
  `enhancedAi.indexWithSemanticChunking`, `enhancedAi.extractAndStoreFacts`,
  `enhancedAi.queryKnowledge`, `enhancedAi.createPlan`, `enhancedAi.getStats`)
  now return real LLM output when the user has configured a provider. Test-mode
  and unconfigured-mode paths unchanged (still gated by
  `llmEnabled && ragService !== null`).
- **Workload-aware delegation has real signals**
  (`apps/desktop/src/main/index.ts:1810-1859`).
  `WriteSideWorkloadProvider.inMeeting(employeeId)` now reads the active
  meeting via `meetingsRepo.getActive(companyId)`, parses `attendeesJson`,
  and tests membership — replacing the `() => false` stub that always told
  the planner every employee was available.
  `avgCompletionMs(employeeId, _subtaskType)` aggregates `closedAt - createdAt`
  across all closed tickets the candidate was the assignee on (clamped against
  the 48-hour `pastPerformanceCeilingMs` default). Returns `null` for new
  hires so they're not penalized (preserves the planner's neutral 0.5
  default). Subtask-type filtering is forward-compat: parameter accepted,
  ignored in V1 — ticket labels do not yet carry a subtask-type taxonomy.
  Both implementations wrap in `try/catch` → conservative defaults
  (`false` / `null`) on repo errors. Result: `decompose_project` and
  `delegate_subtask` tools score candidates with real load + history instead
  of always-available + no-history.
- **`/promote` works in the command palette**
  (`apps/desktop/src/main/index.ts:2329-2342`,
  `apps/desktop/src/main/services/command-service.ts`).
  The CommandService dispatcher's `employeesPromote` slot was unwired despite
  the IPC handler shipping in M-C step d (`employees.promote` registered at
  `register.ts:687`, exercised by `employees-promote-handlers.test.ts`).
  Result: typing `promote Alice to CTO` in the palette returned
  `handler_error`. Now wired with a shape adapter — classifier emits
  `{employeeId, roleId, newLevel}`, IPC takes `{employeeId, newRoleId}`,
  `newLevel` is discarded because the IPC handler derives the level from
  the role spec (single source of truth, no divergence risk).
- **Release-marker freeze pinned to 3.0.0**
  (`apps/desktop/src/renderer/src/app/top-bar.test.tsx:44-47`).
  `APP_RELEASE_VERSION`, `PACKAGE_RELEASE_VERSION`, `SHARED_TYPES_RELEASE_VERSION`,
  `INTELLIGENCE_RELEASE_VERSION` all unified at `3.0.0`. Resolves the v2.0.10-era
  drift where `APP_RELEASE_VERSION` was still `'2.0.9'` after the workspace
  shipped at `2.0.10`.

### Fixed

- **Proactive mode toggle no longer snap-backs**
  (`apps/desktop/src/main/index.ts:1994-2078`).
  `ProactiveTriggerService` was authored at
  `apps/desktop/src/main/services/proactive-trigger-service.ts`, referenced
  by 4 IPC handlers (`proactive.setEnabled`, `proactive.decomposeGoal`,
  `proactive.scanForWork`, `proactive.getState`), and **never instantiated**
  in the composition root. Every `proactive.*` IPC fell through to
  `throw new Error('[ipc] proactive.<method>: proactiveTriggerService dep
  is required')`. The renderer's optimistic Switch caught the throw and
  reverted to OFF on every flip. Fix: `createProactiveTriggerService(...)`
  is now instantiated right after `createAgenticLoopService`, and the IPC
  handler deps include a lazy-resolver wrapper (matches the existing
  `copilotAnalyzerService` pattern at line 1364) so the trigger service
  can come online after `createIpcHandlers` is composed. The wrapper closes
  over a module-level `proactiveTriggerServiceInstance: ProactiveTriggerService | null`
  declared next to `agenticLoopServiceInstance`.

### Audited (no changes)

- **Authored-vs-wired audit** across 119 service files in
  `apps/desktop/src/main/services/`, ~290 IPC channels in
  `register.ts` REQUEST_CHANNELS / `handlers.ts` IpcHandlers / `shared-types`
  ChannelMap, and 20+ optional handler deps. Confirmed the
  `ProactiveTriggerService` gap was the only fully-unwired service.
  Other findings (workload-signal stubs, Enhanced AI LLM stub, missing
  `/promote` dispatcher entry) are addressed by this release; remaining
  intentional deferments (classifier `complete` stub at `index.ts:1467`,
  the `companies.archive` clear hookup for `copilotEventWindow.clear` —
  which IS wired despite a stale comment at line 1227) are documented and
  unchanged. No drift in registry consistency: every channel in
  REQUEST_CHANNELS has a matching `ipcMain.handle` registration; every
  `IpcHandlers` method has a matching channel; every ChannelMap entry has
  a backing handler.

---

## [2.0.10] — 2026-05-06 — Typography cascade · orchestrator retry · settings UX

Three-part release: a workspace-wide typography master format that
collapses ~1,500 ad-hoc `text-*`/`tracking-*` classes onto 20 semantic
tokens, a transparent retry path in the orchestrator that absorbs
transient `fetch failed` flakes against the local Ollama daemon, and
five surgical Settings UX fixes covering broken switches, invisible
checkboxes, and a chooser whose `Button` wrapper was outranking the
`.brand-selected` primitive. Tests **1978/1978** passing (up from 1959
— +18 new for orchestrator retry + +1 for proactive persistence
regression). Typecheck clean across all four `tsconfig` projects.

### Added

- **Orchestrator transient-fetch retry** (`apps/desktop/src/main/orchestrator/`).
  New `transient-errors.ts` module classifies undici `TypeError("fetch
  failed")`, `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, and the undici
  `UND_ERR_*` codes by walking up to 5 levels of `error.cause`. The
  predicate short-circuits on `AbortError` so user-cancelled runs never
  hit the retry path. `runAgent` now wraps the stream-draining block in
  a 2-attempt loop (1 initial + 1 retry, 200 ms backoff) that fires
  **only** when zero chunks have streamed — preventing duplicated
  output to an open message bubble. When retries exhaust, the
  user-visible error becomes `"Provider connection dropped. Please
  retry, or switch to a different provider in Settings."` with the
  original error preserved on `Error.cause` for forensics. Repro:
  three `fetch failed` runs in the user's runs table — all <150 ms,
  all isolated incidents during otherwise-successful sessions against
  `ollama-local + gemma4:31b-cloud` — would each have been absorbed.
- **18 new orchestrator tests** — 12 `transient-errors.test.ts` (positive
  matches: bare TypeError, surrounding whitespace, cause-chain depth 1+2,
  undici codes, ETIMEDOUT; negatives: AbortError, named AbortError,
  HTTP-status errors, unrelated errors, non-Error throws,
  self-referential cause loop) plus 6 `run-agent.test.ts` retry-path
  cases (success-after-retry without event duplication, exhausted
  retries with friendly message, no-retry-after-chunks-streamed,
  no-retry-on-HTTP-status, no-retry-on-pre-aborted-signal, original
  error preserved as `cause`).

### Changed

- **Typography master-format cascade**. `tailwind.config.ts` gains 13
  `theme.extend.fontSize` semantic tokens generating `text-display`,
  `text-h1`–`text-h4`, `text-body`, `text-body-strong`, `text-body-sm`,
  `text-caption`, `text-label`, `text-button`, `text-button-sm`, and
  `text-menu-item` — each tuple specifying size + line height +
  letter-spacing + font weight together. `globals.css` adds 8 component
  utilities: `.text-eyebrow` (11 px uppercase 0.18em),
  `.text-eyebrow-sm`, `.text-menu-label`, `.text-shortcut`, `.text-code`
  (13 px mono), `.text-code-sm`, `.text-numeric` (24 px tabular-nums),
  `.text-numeric-lg` (32 px). Twelve shadcn primitives refactored to
  consume the new tokens at the bottom of the cascade — `Button` now
  uses `text-button`, `CardTitle` `text-h3`, `CardDescription`
  `text-body-sm`, `Dialog`/`Sheet` titles `text-h3`, `DropdownMenuItem`
  `text-menu-item`, `Input`/`Textarea` drop the responsive
  `md:text-sm` jump in favour of `text-body`, `Label` `text-label
  leading-none`, `TabsTrigger` `text-button-sm`, `AlertTitle`
  `text-h4`, `AlertDescription` `text-body-sm`,
  `SelectTrigger`/`SelectLabel`/`SelectItem`, and `Badge`
  `text-caption font-semibold`. Top-of-cascade shells (`top-bar.tsx`,
  `sidenav.tsx`, `mission-shell.tsx`, `mission-control-dashboard.tsx`,
  `settings-view.tsx`, `audit-view.tsx`, `extensions-section.tsx`,
  `permissions-section.tsx`, plus ~90 feature files) consolidated to
  the canonical token set. Net effect: 9 different "eyebrow" recipes
  collapsed to one `text-eyebrow` token; 6 different `tracking-*`
  patterns baked into the per-token definitions; broken hierarchy
  fixed (Settings page heading was 14 px / same size as buttons —
  now correctly `text-h1` at 28 px).

### Fixed

- **Enhanced AI Settings — 7 hand-rolled toggles invisible in dark mode**
  (`enhanced-ai-section.tsx`). The off-state used `bg-surface-100` for
  the track and `bg-background` for the thumb; both resolve to
  near-black in AMOLED, rendering as a featureless black blob.
  Replaced all seven (Query Expansion, Semantic Chunking, Long-Term
  Memory, Knowledge Graph, Multi-Turn Planning, Streaming Responses,
  Distributed Tracing) with the canonical `<Switch>` primitive, which
  uses `bg-input` (`HSL 0 0% 14.9%`) for a visible mid-gray track
  matching the rest of the app. Multi-Turn Planning and Distributed
  Tracing keep `className="mt-5"` to preserve title-text alignment in
  their `items-start` rows. Dropped the now-unused `handleToggle`
  helper.
- **Active Authority Grants permission labels lower-case**
  (`extensions-section.tsx`, `permissions-section.tsx`). Permission
  badges rendered the raw `'allow' | 'deny' | 'prompt'` enum values.
  Added typed `PERMISSION_LABEL: Record<AuthorityPermission, string>`
  in extensions-section (TypeScript exhaustiveness for free) and a
  `formatPermission(permission: string): string` helper in
  permissions-section (respecting that file's no-shared-types import
  rule). Both badges now render `Allow`, `Deny`, `Prompt`.
- **Copilot Allowed Categories checkboxes rendering browser-blue**
  (`copilot-section.tsx`). Native `<input type="checkbox">` was
  inheriting Chromium's default check colour. Added `accent-brand`
  (the same canonical pattern already in `call-meeting-dialog.tsx`),
  which maps the CSS `accent-color` property to the registered
  `brand: '#AA2024'` token.
- **Proactive Mode toggle didn't persist** (`handlers.ts`,
  `proactive-handlers.test.ts`). The IPC handler called
  `proactiveTriggerService.setEnabled` which only mutated an in-memory
  per-company `disabledCompanies` Set; the renderer's getter read
  `proactive_enabled` from the SQLite settings table which stayed
  `false`. After the optimistic switch flipped, react-query
  invalidation refetched the unchanged DB value and the
  `useEffect`/optimistic reset snapped the thumb back. Fix: handler
  now persists via `settingsRepo.setProactive({ enabled })` first,
  then forwards to the trigger service. Both sources of truth move
  together; on a subsequent load the global gate `isEnabled()`
  (`settings.enabled AND NOT disabledCompanies.has(companyId)`) finally
  returns `true`. New regression test asserts both `setProactive` calls
  fire (ON and OFF) for the toggle UX.
- **Autonomy Policy chooser only showed a thin red ring**
  (`extensions-section.tsx`). Wrapping `<Button variant="outline">`
  applied utilities `border-input` (mid-gray) and `bg-background`
  (black). Tailwind's layer order is `base < components < utilities`,
  so those utilities outranked `.brand-selected`'s component-layer
  border-color and background-color rules — only the box-shadow
  (which `Button` doesn't set) made it through, leaving a lonely 1 px
  inset red ring on a black box with a gray border. Replaced with a
  plain `<button>` matching the Runtime Strategy chooser pattern
  verbatim. The selected state now shows the full thicker red bezel,
  translucent red fill, and 12 px outer red glow that
  `.brand-selected` was always meant to deliver.

---

## [2.0.9] — 2026-05-04 — Biome auto-fix sweep

Cleaned up the long-standing Biome lint backlog. **160 files auto-fixed**
(safe + unsafe-but-correct rule classes). Down from **249 errors + 43
warnings** to **16 errors + 28 warnings** — and the residuals are all
documented intentional patterns (TypeScript `any` for the Electron preload
IPC bridge `(window as any).teamx`, non-null assertions on guarded React
Query data) that would require refactors out of scope for a lint pass.

Unit tests **2266/2266** still passing, build **clean** (3,303.83 kB JS),
typecheck clean, e2e **22/22** unchanged.

### Changed

- **Biome auto-fix sweep across 160 files**: applied
  `biome check --fix --unsafe`. Categories of changes:
  - `lint/style/useNumberNamespace`: replaced bare `parseInt(...)` with
    `Number.parseInt(...)` and `parseFloat(...)` with `Number.parseFloat(...)`
    everywhere. Same runtime behavior; matches the modern TypeScript
    namespace convention.
  - `lint/correctness/noUnusedImports`: removed unused imports.
  - `lint/style/useImportType`: tightened value/type imports — values stay
    in `import { X }`, types move to `import type { X }`.
  - `lint/correctness/useExhaustiveDependencies`: tightened a few useEffect
    dependency arrays where missing entries did not change observed
    behavior.
  - `lint/style/noUnusedTemplateLiteral`: replaced `\`literal\`` with
    `'literal'` where no interpolation is present.
  - `lint/style/useSingleVarDeclarator`: split `let a, b = ...` into two
    statements.
  - `lint/correctness/noUnusedVariables`: prefixed unused fn args with `_`.
  - `lint/style/useShorthandFunctionType`: collapsed
    `interface X { (...): T }` to `type X = (...) => T` where applicable.
  - Whitespace + import-ordering normalization.
- **Release-marker freeze test** (`top-bar.test.tsx`): pinned to **2.0.9**.

### Operational

- **Residual Biome diagnostics (16 errors + 28 warnings, all documented
  intentional)**:
  - 12× `lint/suspicious/noExplicitAny` — primarily the
    `(window as any).teamx` IPC bridge access pattern in e2e specs and
    a handful of generic helpers; refactor would require a typed
    `Window.teamx` global declaration shipped in the preload's `.d.ts`
    bundle (separate lane).
  - 5× `lint/style/noNonNullAssertion` — guarded React Query data
    accesses (`data!`) where the surrounding `enabled:` clause already
    proves non-null at runtime; biome cannot see across the
    `useQuery({ enabled: ... })` contract.
  - 1× `lint/correctness/useYield` — false positive in a generator
    that yields conditionally.
  - 1× `lint/complexity/noForEach` — intentional Array.forEach in
    a side-effect-only iteration where readability wins over the
    `for...of` rewrite.
  - 28 warnings are mostly `lint/correctness/useExhaustiveDependencies`
    cases that biome's auto-fix declined as `--unsafe` (could change
    observed effect ordering); accepted as-is.
- **Build**: 3,303.83 kB JS / 116.23 kB CSS / 1.00 kB index.html — within
  noise of v2.0.8's 3,303.85 kB; the auto-fix touch is style-only at
  bundler level.
- **Tests**: 2266 pass (apps/desktop=1959 + intelligence=152 +
  provider-router=91 + role-schema=57 + telemetry-core=7).

---

## [2.0.8] — 2026-05-04 — E2E green & Telemetry refresh fix

End-to-end Playwright suite back to **22/22** (was 11 failed / 10 passed / 1
not-run after the User Guide merge + dashboard redesign). The recovery covered
three regression families and one production refresh-on-mount fix that doubles
as a real UX improvement. Unit tests still **2266/2266**, build clean, lint
clean (0 errors; 110 pre-existing non-null-assertion warnings remain in
renderer hooks — out of scope).

### Fixed

- **Lint** (`apps/desktop/src/main/ipc/invariant-11-emit-handlers.test.ts`):
  added missing `MessageRow` to the type-only import from
  `../db/repos/messages.js`. The `FakeMessagesRepo` class referenced
  `MessageRow` in three places (`rows: MessageRow[]`, the `as MessageRow` cast
  in `append()`, and the `listByThread(): MessageRow[]` return type) without
  importing it — ESLint flagged 3 `'MessageRow' is not defined` errors. The
  module already exports `MessageRow = typeof messages.$inferSelect` so the
  fix is a one-line type-import addition. Landed in the standalone commit
  `464c1c9` ahead of the e2e bundle.

- **E2E Group A — User Guide button-text collisions** (5 specs): the
  comprehensive User Guide pane (commit `735d6f2`) renders section-nav and
  action buttons whose accessible names *contain* the keywords `Settings`,
  `Files`, `Meetings`, `Telemetry`, `Tickets`. Playwright's default partial-
  match `getByRole('button', { name })` started resolving to up to 6 elements
  and tripping strict-mode. Mitigation: added `exact: true` to the top-bar
  tab selectors in
  `e2e/{vault-backup,meeting-flow,copilot-feedback,phase-6-integration,telemetry-kind-filter,ticket-flow}.spec.ts`,
  and additionally scoped the two Telemetry assertions
  (`phase-6-integration.spec.ts`, `telemetry-kind-filter.spec.ts`) to
  `getByRole('navigation').getByRole('button', { name: 'Telemetry', exact: true })`
  because the page also renders a "Telemetry" CTA button in main content
  even with `exact: true`.

- **E2E Group B — User Guide auto-open hides dashboard** (3 specs):
  `apps/desktop/src/renderer/src/App.tsx` auto-opens `activeView='user-guide'`
  on first boot per company when `settings.userGuide.welcomeDismissedAt` is
  unset. Each Playwright spec creates a fresh `userDataDir` →
  fresh seeded company → auto-open fires → dashboard never mounts → CEO/SWE
  cards (and every keyword-named top-bar tab) absent from DOM. Mitigation in
  `apps/desktop/src/main/db/seed.ts`: in the `seed()` runtime wrapper
  (called only from `main/index.ts`), pre-stamp
  `userGuide.welcomeDismissedAt = new Date().toISOString()` when
  `process.env.NODE_ENV === 'test'`. Production users still see the welcome
  on first launch; unit tests are unaffected because `seed.test.ts` calls
  `seedIfEmpty` directly and bypasses the runtime wrapper. The fresh
  `setting:userGuide` JSON is parsed correctly by
  `handlers.ts::rowToCompany` and consumed by App.tsx's `welcomeDismissedAt`
  guard, which short-circuits the auto-open `useEffect`.

- **Sidenav employee-card aria-label** (`apps/desktop/src/renderer/src/app/sidenav.tsx`):
  the dashboard `CardsView`/`EmployeeCard` (which carried the
  `{name}, {title} — {status}. Click to open chat.` aria-label format
  documented in `e2e/smoke.spec.ts`'s header) was retired in favor of
  `MissionControlDashboard` (ops-stats view, no per-employee cards). The
  sidenav `EmployeeItem` carried the same employees but with no aria-label
  at all, making the smoke / rag-flow / ticket-flow specs that pin
  `button[aria-label^="Iris Kovač, Chief Executive Officer"]` time out at
  15s with no fallback target. Added the same aria-label format and
  `statusLabel(status)` helper to `EmployeeItem`. Mirrors `EmployeeCard`'s
  format exactly so the tests' header-documented contract still holds, and
  is a real screen-reader UX improvement (one rich announcement instead of
  three orphaned text fragments).

- **E2E Group C — Copilot transcript banner text drift** (2 specs): the
  chat-drawer renders `"Copilot transcript is read only in the drawer."`
  in the `viewingCopilotThread` terminal-state branch (chat-drawer.tsx:531),
  but `agentic-loop.spec.ts` and `task-planner.spec.ts` were still asserting
  `"Copilot transcript — read only"` from before the text changed. Updated
  both specs to match the live string and refreshed the inline comments to
  point readers at chat-drawer.tsx's else-arm of the
  `copilotRunning ? ... : copilotResult?.kind === 'failed' ? ... : ...`
  ternary.

- **Smoke / rag-flow assertion scoping**: when an assistant reply lands, it
  surfaces both inside the chat-drawer bubble AND on the Mission Control
  dashboard event card, so unscoped `getByText(...)` would resolve to two
  elements and trip strict-mode. Scoped both specs to
  `getByLabel('Iris Kovač', { exact: true }).getByText(...)` to pin the
  assertion on the chat bubble specifically.

- **Ticket-flow rewrite for empty-state + duplicate-text strict-mode**:
  fresh-seeded companies have zero tickets → `tickets-view.tsx` renders the
  empty-state surface (`data-tickets-view-state="empty"`) instead of the
  KanbanBoard. Replaced the obsolete `getByText('Open', { exact: true })`
  column-header assertions with the empty-state anchor and switched the
  create dialog opener to the "File the first ticket" CTA. Also moved the
  detail-panel selector from the brittle `.border-l.border-border` CSS
  match to the stable `[data-ticket-detail=""]` data anchor (pinned by
  `tickets-view.test.tsx`), and added `.first()` / `.last()` qualifiers on
  the ticket-description and agent-reply assertions where the text appears
  in both the chat bubble and a "Thread focus" line-clamped preview.

### Changed

- **`useCompanyStats` refetch policy** (`apps/desktop/src/renderer/src/hooks/use-telemetry.ts`):
  added `refetchOnMount: 'always'`. The Mission Control dashboard subscribes
  to the same companyStats cache key (no kind filter) on app boot. With the
  global staleTime=5s in `lib/query-client.ts`, navigating to Telemetry
  mid-stale-window read the boot-time count from cache and never refetched —
  observed in the M39 e2e where the "Runs" total tile stuck at 1 even though
  IPC `getCompanyStats(companyId)` returned 2 (work=1 + copilot=1). With
  `'always'`, every CompanyTelemetry mount fetches fresh — proper UX for the
  Telemetry tab AND deterministic for the M39 spec. No other hooks changed
  — `useDailyUsage`, `useEmployeeStats`, `useCostBreakdown` retain default
  staleTime; only the boot-mounted shared-key query needs the override.

- **`top-bar.test.tsx` release marker** pinned to **2.0.8**.

### Operational

- E2E Playwright suite: **22 passed (1.7 m total)** — 0 failed, 0 not-run,
  no flakes across two consecutive full runs.
- Unit tests: **2266 passed** across 5 test-running packages
  (apps/desktop=1959, packages/intelligence=152, packages/provider-router=91,
  packages/role-schema=57, packages/telemetry-core=7).
- Production renderer build: **3,303.85 kB JS / 116.23 kB CSS / 1.00 kB
  index.html** (no regression vs v2.0.7's 3,302.94 kB / 116.23 kB; the +0.9
  kB delta is the `refetchOnMount` config and the sidenav aria-label
  template literal).
- Lint: ESLint 0 errors (was 3 before the MessageRow fix); 110 pre-existing
  `@typescript-eslint/no-non-null-assertion` warnings remain in renderer
  hooks — separate cleanup lane.
- Biome: 249 errors + 43 warnings remain (largely auto-fixable
  `Number.parseInt`, import-ordering); follow-up commit lands in v2.0.9.

---

## [2.0.7] - 2026-05-04

### Added
- **CEO role frontmatter `tools_allowed` / `tools_denied` populated** to match the role body's tool-usage section. Previously the body said "Use **browse** for market research…" and "You do not have shell or filesystem write access" but the YAML declared empty arrays. Now: `tools_allowed: [browse, email, calendar, context7, episodic-memory]`, `tools_denied: [shell, filesystem_write]`. Role pack re-signed via `pnpm sign:pack`.

### Changed
- **`budget-governance-service` `recordRunSpend` now stamps ledger `occurredAt` with the service clock** (`now()`) instead of the run's `endedAt ?? startedAt`. In production the two are identical; in tests, services inject a fixed `now()` while `runsRepo` always uses real time, so ledger entries fell outside the service's monthly window and `getOverview` returned 0. Behavior change is invisible in production, restores `noUncheckedIndexedAccess`-grade test determinism.
- **`budgets.createApprovalItem` accepts an optional `createdAt` override** so the budget governance service can stamp approval rows with its own clock for the same window-alignment reason. Defaults to `Date.now()` — production callers unaffected.
- **`execution-tools.test.ts > caps recursive filesystem search`** now creates 205 fixture files in parallel via `Promise.all` (was sequential `await`s) and bumps the per-test timeout to 15s. Sequential writes hit Windows fs latency hard and overran the 5s default.
- **`execution-tools.test.ts > afterEach`** uses `rm(..., { maxRetries: 5, retryDelay: 100 })` to absorb Windows `ENOTEMPTY` flakes during temp-dir teardown.
- **`pnpm sign:pack` / `pnpm sign:pack:keygen`** now run via `npx tsx` instead of bare `node` so the script's transitive `@team-x/shared-types` import (which resolves to `src/index.ts` per workspace package.json) loads cleanly. The previous form failed with `ERR_UNKNOWN_FILE_EXTENSION ".ts"` on every signing run.
- **`role-schema/src/integration.test.ts`** updated to reflect the populated CEO tools allowlist/denylist.
- **Top-bar release-marker pin** bumped to `2.0.7` for the app version.

### Fixed
- **`proactive-trigger-service.test.ts > FakeAuthorityResolver.resolveEmployee`** now returns the real `EffectiveAuthoritySnapshot` shape (`{ companyId, employeeId, entries, toolsAllowed, toolsDenied }`) instead of an earlier-draft `{ employeeId, capabilities, paths }` that no longer exists in `@team-x/shared-types`. The production code reads `authority.entries.find(...)` and was crashing on `undefined.find` because the fake never matched the actual contract.

### Removed
- **`apps/desktop/src/phase-5-complete-marker.test.ts`** and **`apps/desktop/src/phase-6-complete-marker.test.ts`** — both tests audited Phase 5 / Phase 6 design docs and CLAUDE.md `Phase 5 COMPLETE - v1.1.0` / `Phase 6 COMPLETE - v1.2.0` markers. The referenced design docs (`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`, `docs/plans/2026-04-20-team-x-phase-6-capabilities-evidence.md`) were intentionally deleted in commit `8898f19` as part of a major plan-doc cleanup, and the project versioning has long since moved to the 2.0.x scheme. The marker tests were zombies pinning a release state the repo has lived past.

### Test status
- **Full repo: 2266 / 2266 passing.** Zero failures across `telemetry-core` (7), `provider-router` (91), `role-schema` (57), `intelligence` (152), and `desktop` (1959).

---

## [2.0.6] - 2026-05-04

### Changed
- **`embeddings.test.ts`, `settings-copilot.test.ts`, `vec-init.test.ts` migrated off `better-sqlite3`** — these three files were the last hold-outs in the desktop test suite that imported `better-sqlite3` directly. They now use `makeTestDb()` (sql.js / WASM) per the convention documented in `apps/desktop/src/main/db/test-helpers.ts`. Eliminates the `NODE_MODULE_VERSION 125 vs 115` ABI mismatch that was blocking 17 tests from running locally on plain Node 20 after the desktop `postinstall` rebuilt the native binding for Electron.
- **`embeddings.ts` `deleteBySource` / `deleteByCompany` rewritten as count-then-delete** — drizzle-orm's `.run()` return shape differs across drivers (`{ changes }` on better-sqlite3 vs `void` on sql-js). Repos that need a deleted-row count now run a `count()` SELECT first, then DELETE — same cross-driver pattern already used in `command-history.ts`. No behavior change in production; restores the sql-js return contract for tests.
- **Top-bar release-marker pin** bumped to `2.0.6` for the app version.

### Fixed
- **Local test suite recovers 16 NMV-bound tests** — `embeddings.test.ts` (6), `settings-copilot.test.ts` (9), and `vec-init.test.ts` (2) were all failing with `The module '...better_sqlite3.node' was compiled against a different Node.js version`. All now pass.
- **Total test failures down 30 → 11** between v2.0.4 and v2.0.6 (proactive-dispatch payload fix in v2.0.5 + the NMV migration in v2.0.6).

### Known issues
- 11 local test failures remain, all pre-existing and unrelated to the ABI work:
  - 5 are `phase-5-complete-marker` / `phase-6-complete-marker` doc audits (release plan owns the CLAUDE.md / design-doc bumps).
  - 1 is `seed.test.ts > serializes tools_allowed and tools_denied` — role-pack frontmatter expects `'browse'` to appear in the seeded tools list; appears to be a pre-existing data issue in the role packs.
  - 2 are `execution-tools.test.ts > caps recursive filesystem search results` — the test runs an unbounded recursive scan that exceeds the 5s default Vitest timeout on Windows, plus a follow-on `ENOTEMPTY` cleanup error. Infra flake, not a code defect.
  - 3 are `budget-governance-service.test.ts` — pre-existing assertion drift (`expected '0' to be '2.5'`, `expected true to be false`, `expected undefined to be defined`). Logic/contract issue, not the DB layer.
  - 1 is `proactive-trigger-service.test.ts > checks authority before queuing proactive work` — pre-existing fake-orchestrator drift.

---

## [2.0.5] - 2026-05-04

### Added
- **`tiktoken/lite` declaration shim** at `packages/intelligence/src/types/tiktoken-lite.d.ts` so the optional dynamic-import path in `chunker-v2.ts` typechecks cleanly while preserving the runtime char-count fallback.
- **`commander@^12` CLI dependency** — listed in `packages/intelligence/package.json` is now actually installed (lockfile was out of sync); `pnpm install` resolved the gap.
- **`triggerKind` / `goalId` / `ticketId` on `ProactiveWorkStartedPayload`** — schema in `@team-x/shared-types` now carries the same trigger context as `ProactiveWorkQueuedPayload`, and `proactive-dispatch.ts` plumbs them through `emitWorkStarted`. Resolves prior consumer-side drift.

### Changed
- **`@team-x/intelligence` typecheck cleanup** (`v2.0.1` → `v2.0.2`) — full typecheck pass across the package after a sweep that fixed:
  - `cli/ai-cli.ts` — typed `commander` action `options` callbacks (`InfoOptions`, `KnowledgeOptions`, `MemoryOptions`, `EvalOptions`, `TraceOptions`), exported `program` so `cli/index.ts` can re-export it.
  - `eval/evaluator.ts` — `getTargets()` returns a strongly-typed object instead of `Record<string, number>` so target accesses don't fall under `noUncheckedIndexedAccess`.
  - `eval/metrics.ts` — `retrievedIds[i]` / `queryMetrics[i]` / `sorted[lower]` / per-query comparison guards added.
  - `eval/golden-dataset.ts` — added missing `project_blocked` placeholder to the `DOCS` shape so semantic/recent/complex queries stop dereferencing a non-existent key.
  - `knowledge/graph.ts` — captured `repo` once at service construction so `suggestRelated` and `inferRelationships` stop shadowing the outer `options`; `KnowledgePath` reference corrected to `GraphPath`.
  - `loop/planning.ts` — extracted `topologicalSort` to a free function (was on the object literal but not on the `PlanExecutor` interface), removed unused `plan` capture in `wrapLoopExecution`.
  - `metrics/dashboard.ts` — fixed `CacheStats` import path (`rag/cache.js`, not `rag/logging.js`); replaced bogus `l.status` / `l.latencyMs` / `l.resultCount` reads with the real `RetrievalLogEntry` shape (`l.event` and `l.data.*`); `calculateStats` now returns the `trend` field that `TimeSeriesData.stats` requires; `CacheSnapshot` constructed via spread + computed cost-savings instead of bare `CacheStats` assignment; oldest/newest timestamps and `getDashboardData` snapshot reads now nullish-guard the index access.
  - `observability/tracing.ts` — `sampleed` typo → `sampled`, `recordException` types `exception: unknown` consistently, dropped unused `result` capture in `startActiveSpan`.
  - `prompt/versioning.ts` — `DEFAULT_SYSTEM_PROMPTS` typed as `Record<string, PromptTemplate>` so the `metadata.status` literal narrows to the `'production' | 'draft' | 'testing' | 'deprecated'` union; dropped unused `hashQuery` import.
  - `rag/cache.ts` — dropped unused destructured `ttl`, `companyId`, `key`, `value`.
  - `rag/chunker-v2.ts` — added the `tiktoken/lite` declaration shim, removed unused `pos` / `minChars` / `currentEnd`, nullish-guarded `lines[i]` and `currentSegments[i]` and `match[1]`, fixed `chunkMarkdownWithCodeBlocks` async-return type to `Promise<Chunk[]>`, exported `TokenCounter`.
  - `rag/index.ts` — corrected re-export names: `expandQuerySemantic` → `expandQuerySemantically`, `expandQuerySynonyms` → `expandQueryWithSynonyms`, `expandQueryEntities` → `expandQueryWithEntities`, `expandQueryHyDE` → `expandQueryWithHyDE`; dropped non-existent `ChunkOptions` and `ExpansionOptions`.
  - `rag/logging.ts` — added `'retrieval_failed'` event variant, added `topK` / `threshold` to retrieval `data`, made `level` part of the `Omit<...>` parameter so the calling site computes it (no more "level overwritten by spread" warnings), removed conflicting re-export at line 541.
  - `rag/query-expansion.ts` — nullish-guarded every `expansions[i]` / `weights[i]` access, fixed `allResults.length.length` typo to `allResults.length`, removed unused imports.
  - `rag/reranker.ts` — `await response.json()` typed via cast instead of `unknown` index access.
  - `rag/service.ts` — removed unused `bufferToNormalizedFloat32Array` and unused `createCacheKey` import.
  - `memory/long-term.ts` — dropped unused `EmbeddingSourceType` and `RagService` imports; renamed unused `query` parameter to `_query`.
- **Settings count freeze** — `settings.test.ts` now expects 28 / 27 (was 26 / 25) to match Phase 6 proactive defaults that landed without a corresponding test bump.
- **Top-bar release-marker pins** — `top-bar.test.tsx` now pins app at 2.0.5, intelligence at 2.0.2, shared-types at 2.0.1, others at 2.0.0.

### Fixed
- **Lockfile sync** — `pnpm install` actually pulled `commander@12.1.0` and `tsx@4.21.0` into `packages/intelligence`; previously listed in `package.json` but absent from `node_modules`.
- **`proactive-dispatch.test.ts` payload assertions** — all 11 cases now pass after `ProactiveWorkStartedPayload` was extended to carry the trigger kind and source IDs.

### Known issues
- 27 local test failures remain, all pre-existing and unrelated to this release:
  - 21 driven by the `better-sqlite3` Electron-vs-Node native ABI mismatch (`NODE_MODULE_VERSION 125` vs `115`) after `electron-rebuild` runs on `pnpm install`. CI runs against the matching ABI.
  - 5 are `phase-5-complete-marker` / `phase-6-complete-marker` doc audits that need the design-doc and CLAUDE.md release-marker bumps from the Phase release plan.
  - 1 is the `top-bar` Phase 6 badge literal — unchanged at "Phase 6", no action needed.

---

## [2.0.4] - 2026-05-03

### Added
- **Enhanced AI settings deep-link** — `SettingsSectionFocus` now includes `'enhanced-ai'`, the User Guide can scroll-focus the Enhanced AI panel, and the section is wrapped in `data-settings-section="enhanced-ai"` consistent with sibling sections.
- **Settings IPC: enhanced AI config** — preload exposes `settings.getEnhancedAiConfig` / `settings.setEnhancedAiConfig` channels (M32 wiring).

### Changed
- **`@team-x/intelligence` unified service (M31)** — `createAiService` rewritten to align with actual upstream module signatures: `RagService` is now properly constructed when a `RagRepo` is supplied via `rag.repo`; embedding config takes a caller-supplied `embedText: EmbedTextFn` and `dimension`; `createQueryCache` is initialized with `{ ttl, maxEntries }`; `evaluate()` wraps `EvalQuery[]` into a real `EvalDataset` and returns `result.aggregated`; nullish array accesses on graph queries and query expansion are guarded.
- **Sqlite-vec embeddings repo** — `populateVecTable` cast tightened so `db.run` returns `{ changes }` with the correct type.
- **Embeddings repo statements** — `db.execute(...).all()` calls collapsed to `.all()` directly to match drizzle-orm SQLite types.

### Fixed
- **Desktop typecheck** — full typecheck pass across `tsconfig.main`, `tsconfig.preload`, `tsconfig.renderer`, and `tsconfig.e2e`.
- **Removed unused symbols** — dropped unused `Button` import from `EnhancedAiSection` and unused `extractFacts`/`createRagService`/`RagServiceOptions`/`RetrieveInput`/`ExpandedQuery`/`embedder`/`streamer` references from `unified.ts`.
- **Stub LLM-complete signature** in `apps/desktop/src/main/index.ts` no longer trips `noUnusedParameters` (`prompt` → `_prompt`).

### Known issues
- `@team-x/intelligence` package still has ~130 pre-existing typecheck errors outside of `unified.ts` (Map/Set iteration target, `rag/index.ts` re-export typos, `logging.ts` field shape mismatches). Tracked separately — does not block the desktop app, which typechecks clean.
- Local test suite shows ~24 SQLite-touching test failures driven by an Electron-vs-Node native ABI mismatch in `better-sqlite3` after `electron-rebuild`. Environmental, not a code defect; CI runs against the matching ABI.
- `apps/desktop/src/main/orchestrator/proactive-dispatch.test.ts` — pre-existing payload-shape drift between event emitter and assertions (3 cases). Not introduced this release.

---

## Phase 6 - Capabilities & Evidence

## [1.2.0] - 2026-04-20

> **Status:** Phase 6 release notes staged by M41 T5. Baseline: v1.1.1 remediation exit (1683 unit tests / 13 E2E specs / 18 Playwright cases) -> Phase 6 evidence state (**1683 unit tests / 17 E2E specs / 22 Playwright cases**, strict claim gate 95 verified / 0 allowlisted / 0 UNALLOWED). Package version bump, Phase 6 badge freeze, COMPLETE marker, final release ledger, and tag are handled by the remaining M41 release tasks.

### Added
- **Capability taxonomy and role-fit reconciliation** - shared capability contracts, role-schema parser validation, official 57-role backfill, role-loader capability lookup, and capability-aware planner role-fit scoring with the M32 keyword fallback preserved for generic subtasks and legacy outputs.
- **Copilot feedback loop** - repeated same-category dismissals can surface an advisory category-weight suggestion, applying the suggestion updates local Copilot feedback weights, and the append-only audit stream records `copilot.weights.changed`.
- **Telemetry run-kind filter** - shared contracts, repo aggregate filters, IPC validation, preload propagation, renderer hooks, filter chips, subview request wiring, and E2E coverage for All / Work / Agentic / Copilot buckets.
- **Local Copilot insight export** - sidebar category/severity filters, company/all-company scope, JSON and CSV serializers, local file writes under the Team-X export directory, saved-filename status copy, and focused E2E coverage. Export remains local-only: no sync, upload, sharing, or native save-dialog claim.
- **Phase 6 integration E2E** - `apps/desktop/e2e/phase-6-integration.spec.ts` stitches capability role-fit outcome, feedback suggestion/apply, telemetry kind filters, and local JSON export in one fresh Electron boot.
- **Phase 6 docs set** - six-section retrospective, Phase 6 walkthrough and scenario, README/user-guide reconciliation, and Phase 5 demo forward pointers updated to the evidence/calibration scope.

### Changed
- **Planner role-fit evidence** - Task Planner documentation and README now describe capability-backed role fit as the primary path when capability metadata is available, with deterministic M32 weights unchanged.
- **Copilot UI and docs** - user-facing docs now cover feedback suggestions, category/severity filters, local export, and the advisory boundary for Copilot actions.
- **README testing counters** - E2E surface updated to 17 Playwright specs / 22 cases and the Phase 6 integration spec is listed in the coverage table.

### Fixed
- **Agentic run-kind telemetry producer** - `AgenticLoopService` now persists `kind: 'agentic'` for agentic-loop rows so the Telemetry Agentic filter has real producer data instead of falling through to Work.
- **Historical Phase 6 wording drift** - older Phase 5 demo text no longer frames Phase 6 as autonomous action; it points to the shipped evidence, feedback, telemetry, and export surfaces.

---

## Phase 5.6 - Reconciliation & Remediation

## [1.1.1] - 2026-04-20

> **Status:** Phase 5.6 remediation complete. Baseline: v1.1.0 Phase 5 exit (1169 unit / 11 E2E specs / 12 Playwright cases) -> v1.1.1 remediation exit (**1683 unit tests / 13 E2E specs / 18 Playwright cases**, strict claim gate 95 verified / 0 allowlisted / 0 UNALLOWED). Patch release for restored promised surface, process safeguards, and release hygiene.

### Added
- **Phase 5.6 conformance audit + triage** - `docs/audits/2026-04-17-conformance-audit.md` captured 414 claim rows, dispositioned 41 gaps, and locked the remediation backlog: 27 restore / 14 deprecate / 0 replace.
- **Process safeguards** - milestone DoD template, claim-evidence audit script, pre-commit claim guard, CONTRIBUTING branch policy, Loki `verifiedBy` evidence blocks, and quarterly re-audit cadence.
- **Restored multi-company workspace surface** - `companies.create`, `companies.update`, `companies.delete`, `WorkspaceSwitcher`, `CreateCompanyDialog`, and `CompanySettings`, with lifecycle audit events and E2E coverage.
- **Restored org-chart surface** - `org_edges`, `orgchart.get`, `employees.promote`, `employees.setManager`, Org tab, org tree, drag reassignment, promote/fire actions, and HireDialog manager selection.
- **Phase 5.6 retrospective** - public six-section retrospective documenting shipped work, process wins, costs, deferrals, metrics, and Phase 6 carry-forward.
- **Capability role-fit branch work included in this release line** - the earlier Phase 6 session added role capabilities to the official 57-role pack, parser validation, and capability-aware role-fit scoring. The next Phase 6 task is a reconciliation/verification pass so Loki and Phase 6 docs match the already-landed code.

### Changed
- **Documentation truth-up** - CLAUDE.md, README, user guide, demo docs, audit docs, and QA baseline counters now reflect shipped reality instead of aspirational status lines.
- **Workspace package versions** - bumped root, desktop app, and all five workspace packages from `1.1.0` to `1.1.1`.
- **Claim-evidence workflow** - the allowlist is intentionally empty and the ship gate is strict mode (`pnpm audit:claims -- --strict`).

### Fixed
- **Systemic docs/code drift** - the Phase 2 M7/M9 surfaces previously stranded on `worktree-phase-2-the-org` are now present on the release branch and covered by unit/E2E evidence.
- **MCP IPC naming drift** - docs now use canonical `mcp.addServer`, `mcp.removeServer`, and `mcp.testConnection`.
- **Historical role-file wording drift** - docs now describe official role files as `{role-slug}.md` and the full role catalog as 55 user roles plus 2 system roles.

---

## Phase 5 — Intelligence Layer

## [1.1.0] — 2026-04-20

> **Status:** Phase 5 (Intelligence Layer) complete. Baseline: 612 unit tests / 4 E2E specs (v1.0.0) → **1169 unit tests / 11 E2E specs / 12 Playwright cases** (+557 unit, +7 E2E specs, +8 cases). Additive release — RAG foundation (M28), RAG into agent turns (M29), NLU engine + command palette (M30), agentic loop (M31), task planner (M32), copilot service (M33), copilot UI (M34), demo + hardening (M35). Zero breaking changes. Per-milestone entries preserved in original Added / Changed / Fixed order below; M28 + M29 entries backfilled 2026-04-20 (post-v1.1.0 tag) per the M35 T7 follow-up — shipping state unchanged, CHANGELOG record updated for ledger completeness.

### M35 — Demo + Hardening (2026-04-20)

> **Status:** Complete. Baseline: 1130 unit / 10 E2E (11 Playwright cases) → current: **1169 unit / 11 E2E (12 Playwright cases)** (+39 unit, +1 E2E spec, +1 Playwright case). Phase 5 exit-gate milestone. Hardens every M28–M34 deliverable and lands v1.1.0.

#### Added
- **Performance defaults audit** — `apps/desktop/src/main/db/seed.ts` carries a measurement block against Ollama + llama3.1:8b (Q4_K_M): cold 208s, warm 66s per analyzer tick against a 67-event / 2288-char / 734-prompt-token shaped prompt. All 10 Phase 5 settings clamps HELD on evidence (0.55× utilisation vs `agentic_timeout_ms`, 4.5× headroom vs 5-min copilot cadence, 4× headroom vs `agentic_max_tokens`). T1, commit `b68d09b`, +4 unit tests
- **Cross-milestone integration E2E** — NEW `apps/desktop/e2e/phase-5-integration.spec.ts` exercising the full Phase 5 delivery in a single Electron boot: RAG index → command palette → `complex_request` → agentic-loop tool call → grounded answer → write-side decompose → copilot analyzer tick → insight card → dismiss. T2, commit `1108247`, +1 E2E / +1 Playwright case
- **Audit view chips for 18 Phase 5 event types** — `rag.index.*`, `agent.step`, `agentic.*`, `plan.*`, `task.*`, `review.*`, `copilot.*`, `command.executed` each gain a chip with a 200-char payload summary. Narrow helpers extracted to `audit-event-chip-helpers.ts` for source-string-audit testability. T3, commit `51393f8`, +28 unit tests
- **`docs/plans/2026-04-19-team-x-phase-5-retrospective.md`** — 271-line Phase 5 retrospective with locked six-section structure (delivery arc / what paid off / what cost time / deferred scope / Phase 6 seeds / appendix). Future phase retrospectives MUST match this structure. T4, commit `0f8b51c`
- **Demo walkthrough + 5 scenario library** — NEW `docs/demo/phase-5-walkthrough.md` + 5 scenario docs under `docs/demo/scenarios/` (hire-a-CEO, ticket-lifecycle, one-click-all-hands, ask-copilot-grounded-answer, decompose-and-surface). 795 insertions across 6 new files. T5, commit `3cffe29`
- **`docs/user-guide/demo-walkthrough.md`** — external-facing user-guide copy of the demo walkthrough for self-guided onboarding. T10
- **`apps/desktop/src/e2e-regression-guards.test.ts`** — 2 mechanical guards banning `.waitForTimeout(N > 100ms)` as a synchronization primitive + requiring every E2E spec to use at least one `[data-*]` attribute locator. T9, commit `23f3b1b`, +2 unit tests
- **`apps/desktop/src/phase-5-complete-marker.test.ts`** — 3 source-string-audit pins locking the Phase 5 exit state (CLAUDE.md Phase 5 COMPLETE literal + design doc §9 M35 ✅ Complete row + CONTINUITY.md Phase 5 COMPLETE header). Belt-and-suspenders guard against "in progress but v1.1.0 tagged" ambiguous state. T10, +3 unit tests

#### Changed
- **README + user-guide reconciliation sweep** — tests badge 1130 → 1162, E2E 10 → 11 specs, Phase 5 status flipped from "in progress" to "complete" across every user-facing doc. T6, commit `a966deb`
- **CHANGELOG `[Unreleased]` → `[1.1.0]` promotion** — accumulated M30 + M31 + M32 + M33 + M33 F3/F4 + M34 entries promoted under a new "Phase 5 — Intelligence Layer" narrative header; `[Unreleased]` reset to six-category scaffold; version-link refs appended. T7, commit `cb0ab4c`
- **Version bump 1.0.0 → 1.1.0** across 7 `package.json` files (workspace root + `apps/desktop` + 5 `packages/*`) + `top-bar.test.tsx` pinning the literal `Phase 5` badge string to catch accidental `Phase 6` bumps in CI. T8, commit `a8dc98e`, +2 unit tests
- **CLAUDE.md Phase 5 status line** flipped from "in progress" to "complete. All 8 milestones shipped (M28 → M35). v1.1.0." + Phase 5 subheader flipped "in progress" → "complete" + M35 milestone block appended. T10
- **Phase 5 design doc §9 M35 row** flipped 📋 Planned → ✅ Complete (2026-04-20) with full task breakdown metrics. §13 Decisions Log gains D13 (performance-defaults HOLD rationale) + D14 (Phase 5 exit-marker triad). T10
- **`.loki/CONTINUITY.md`** — Phase 5 COMPLETE header prepended to top-of-file with full metrics delta table, T0–T10 commit table, patterns-that-carry-forward, and Phase 6 T0 Next Session Startup Checklist. T10

#### Fixed
- **`rag-flow.spec.ts` synchronisation** — `page.waitForTimeout(500)` replaced with `expect.poll` against `teamx.rag.stats.embeddingCount > 0` — eliminates the last fixed-duration sleep in the E2E suite. T9, commit `23f3b1b`
- **`top-bar.test.tsx` TS2532 latent-from-T8** — `badgeMatch![1].trim()` → `badgeMatch?.[1]?.trim() ?? ''` — cleared the typecheck offender surfaced by T9's guard harness. T9
- **6 E2E specs gain stable `[data-copilot-toolbar-toggle]` anchor** — `copilot-service.spec.ts`, `meeting-flow.spec.ts`, `rag-flow.spec.ts`, `smoke.spec.ts`, `ticket-flow.spec.ts`, `vault-backup.spec.ts`. Locks the Phase 5 badge assertion against a stable attribute rather than the copy. T9

### M34 — Copilot UI (2026-04-18)

> **Status:** Complete. Baseline: 1114 unit / 9 E2E (10 cases) → current: **1130 unit / 10 E2E (11 cases)** (+16 unit tests, +1 E2E spec). Renderer-only milestone — zero new IPC channels, zero new bus events, zero new providers.

#### Added — Copilot sidebar panel + dashboard widget + `Cmd+Shift+K`
- **`apps/desktop/src/renderer/src/features/copilot/copilot-sidebar.tsx`** — right-side Radix `Sheet` panel (focus trap + Esc dismissal + `role=dialog` inherited). Insight feed sorted `critical > warning > info` then newest-first within bucket. Ask textarea pinned at the bottom with Cmd/Ctrl+Enter submit; on success closes the sidebar and opens the chat drawer on the returned system-copilot thread via `useAppStore.openThread({ isCopilotThread: true })` so the M31 step-transcript layout renders automatically — zero duplicated wire code
- **`apps/desktop/src/renderer/src/features/copilot/copilot-dashboard-widget.tsx`** — top-3 cap compact preview composed into the Dashboard Cards subview via `renderDashboard()`. Severity badge + category icon + action-suggestion button per card. `(View all (N) / Open sidebar)` footer link toggles the shared `copilotSidebarOpen` Zustand slice
- **`apps/desktop/src/renderer/src/features/copilot/copilot-insight-card.tsx`** — shared card component with `variant: 'sidebar' | 'dashboard'`. Category icon map (operational=Activity, cost=DollarSign, org=Users, workflow=GitBranch, anomaly=AlertTriangle). Severity colour stripe + badge tokens (critical=`bg-red-950/60 text-red-300`, warning=`bg-amber-950/60 text-amber-300`, info=`bg-sky-950/60 text-sky-300`) — all WCAG AA verified against the dark-theme surface. Semantic `<li>` markup. `data-copilot-insight-id` / `-category` / `-severity` data attributes are the stable E2E selector surface (matches the M31 `data-step-kind` pattern)
- **`apps/desktop/src/renderer/src/features/copilot/copilot-helpers.ts` + `.test.ts`** — pure helpers extracted for testability (no DOM, no IPC, no React). `sortBySeverity` (non-mutating, severity rank + `createdAt` tiebreak), `parseActionEntities` (defensive JSON parse — rejects arrays / primitives / null / non-string values per `IpcExecuteRequest.entities: Record<string, string>` contract), `pickDashboardTopN` (cap + `hasMore` + `total` projection). **16 unit tests** — matches the M32 T6 `step-card-narrow.ts` pattern
- **`apps/desktop/src/renderer/src/hooks/use-copilot.ts`** — four React Query hooks: `useCopilotInsights(companyId, filters?)` (query with `staleTime: 30_000`, single `events.onDashboard` listener invalidates on `copilot.insight` / `copilot.dismissed` / `copilot.expired` per architectural invariant #11), `useDismissCopilotInsight()` (optimistic `onMutate` removes the row immediately, `onSettled` reconciles against server truth), `useAskCopilot()` (mutation returning `{ runId, threadId }` — the same `complex_request` wire shape M31 returns), `useCopilotConfigure()` (test-only manual-tick surface; production uses `settings.setCopilot` from M33 T7)
- **Global keybinding — `Cmd+Shift+K` / `Ctrl+Shift+K`** — same single `App.tsx` keydown handler dispatches both `Cmd+K` (palette) and `Cmd+Shift+K` (copilot sidebar) based on `event.shiftKey`. Data-attribute bypass (`[data-copilot-sidebar-root]`) so the sidebar's own sheet (also `role=dialog`) does not block re-toggle
- **Sparkles toolbar button** in `app/top-bar.tsx` — `data-copilot-toolbar-toggle`, `aria-pressed={copilotSidebarOpen}`, `aria-label="Toggle Copilot sidebar (Cmd+Shift+K)"`, title tooltip, active/inactive styling. Top-bar version badge bumped **`Phase 4` → `Phase 5`**
- **Shared state slice** — `copilotSidebarOpen: boolean` + `setCopilotSidebarOpen(open)` added to `useAppStore` (`apps/desktop/src/renderer/src/store/app-store.ts`). Single source of truth shared by the `Cmd+Shift+K` handler, the Sparkles toolbar button, and the dashboard widget's "View all" link

#### Added — E2E coverage
- **`apps/desktop/e2e/copilot-ui.spec.ts`** — Playwright round-trip: seed ticket (`tickets.create + close`) → `copilot.configure` manual tick → assert `insightsGenerated ≥ 1` → click Sparkles toolbar → sidebar mounts → insight card visible via `data-copilot-insight-id` → active-count badge reads "1 active" → click dismiss X → card leaves DOM + `copilot.insights` IPC returns zero active → empty state renders → fill ask textarea with `__ECHO_AGENT__:` sentinel + click submit → sidebar closes → system-copilot thread resolved via `chat.listThreads` with `isSystemAgent=true` → regression guards on the M30 destructive gate + M32 T5 write-side gate both **absent**. Spec runtime **2.0s**
- **Full E2E regression pass** — 10 specs / 11 cases green in 27.5s: smoke, ticket-flow, meeting-flow, vault-backup, rag-flow, command-palette, agentic-loop, task-planner, copilot-service, copilot-ui (NEW). Runtime `Phase 4` badge assertion updated to `Phase 5` in the four pre-existing specs (`smoke.spec.ts`, `ticket-flow.spec.ts`, `meeting-flow.spec.ts`, `vault-backup.spec.ts`) — runtime assertions only; describe titles and comment blocks preserved as-is for historical accuracy

#### Changed
- **Dashboard Cards subview** — now composes `<CopilotDashboardWidget />` above `<CardsView />` in `renderDashboard()`. Empty state when no insights are active; zero regression for fresh-boot users
- **Root app shell (`App.tsx`)** — mounts `<CopilotSidebar />` alongside `<ChatDrawer />`, `<HireDialog />`, and `<CommandPalette />`. Keyboard handler dependency array grew to include `copilotSidebarOpen` + `setCopilotSidebarOpen` so the `Cmd+Shift+K` toggle reads the freshest store value

#### Documentation
- **NEW `docs/user-guide/copilot-ui.md`** — sidebar overview, dashboard widget, `Cmd+Shift+K` shortcut, insight card anatomy, ask-input workflow, confirmation-gate interactions, empty/error/keyboard-navigation notes
- **Phase 5 design doc §9** — M34 row flipped `📋 Planned` → `✅ Complete`
- **`CLAUDE.md`** — Phase 5 status line updated (M34 complete, M35 next). M34 milestone paragraph added (T1–T11 one-liners). Troubleshooting gains six new Copilot UI entries
- **`docs/user-guide/keyboard-shortcuts.md`** — `Cmd+Shift+K` / `Ctrl+Shift+K` documented
- **`README.md`** — feature list picks up the Copilot UI bullet

#### Pre-implementation chore (bundled)
- **Biome `pnpm lint:fix` sweep (T1, commit `f1180cf`)** — auto-formatted four pre-existing files (`apps/desktop/e2e/copilot-service.spec.ts`, `apps/desktop/src/main/ipc/handlers.ts`, `apps/desktop/src/main/services/backup.test.ts`) clearing the lint baseline before M34 implementation began. Pure whitespace / line-break normalization; zero behaviour change. Final lint: 0 errors, 24 warnings (all pre-existing `noNonNullAssertion` in `entity-resolver.ts` / `retriever.ts` / `chunker.ts` hot paths)

---

### M33 — Follow-ups F3 + F4 (2026-04-18)

> **Status:** Complete. Baseline: 1099 unit / 9 E2E → current: **1114 unit / 9 E2E** (+15 unit tests, 0 E2E). Closes the two deferred items from Phase 5 §16.

#### Added — F3 (`CopilotEventWindow.clear` wired to `companies.archive`)
- **`companies.archive(companyId)` IPC channel** — soft-delete surface that was missing from the Phase 2 companies repo. NEW `ArchiveCompanyRequest` shape in `@team-x/shared-types`; channel registered in `apps/desktop/src/main/ipc/register.ts` + `apps/desktop/src/preload/api.ts` (`CHANNELS.companiesArchive` + `window.teamx.companies.archive(id)`); handler in `apps/desktop/src/main/ipc/handlers.ts::companiesArchive`
- **`archive(id)` method on `createCompaniesRepo`** — idempotent single-column update flipping `status` to `'archived'`. Co-located with the existing `setStatus` surface so the meeting primitive's `running` / `meeting` / `paused` lifecycle and the new archive terminus share one write path
- **Three-step quiesce order in the handler**: (1) `CopilotAnalyzerService.stop(companyId)` kills the per-company timer + aborts any in-flight tick, (2) `CopilotEventWindow.clear(companyId)` drops the in-memory rolling buffer + `hydrated` flag, (3) `companiesRepo.archive(companyId)` flips the row. Ordering is load-bearing — running (2) before (1) can race a tick that re-hydrates from the events log mid-clear. (4) emits `company.archived` on the bus (architectural invariant #11) so renderer caches invalidate
- **`company.archived` bus event type** added to `EventType` in `packages/shared-types/src/events.ts` with typed `CompanyArchivedPayload` interface `{ companyId, archivedAt }`
- **`CompanyStatus` widened** to `'running' | 'meeting' | 'paused' | 'archived'` with full JSDoc coverage per status
- **`IpcCopilotEventWindow` + `IpcEventBus` narrow handler deps** (mirrors existing optional-dep pattern). `IpcCopilotAnalyzerService` extended with `stop(companyId)` alongside `restart(companyId)`. `IpcCompaniesRepo` extended with `archive(id)`. All three missing wirings surface as dev-mode warnings (never hard errors) so legacy test harnesses don't need the new deps
- **4 unit tests for repo `archive` method** in `companies.test.ts` — transition, idempotency, row-isolation, unknown-id no-op. Handler wiring covered by composition root + the new backup-handlers tests (shared mock factory picks up the new dep shape)

#### Added — F4 (post-restore `system-agent` + `system-copilot` bootstrap)
- **`backupService.ensurePostRestoreSystemEmployees({ listCompanyIds, ensureSystemForCompany })`** — synchronous callback-driven sweep on the backup service that iterates the restored DB's companies and idempotently re-runs `ensureSystemAgent` + `ensureSystemCopilot` per company. Backup service stays free of drizzle + role-loader imports (composition root threads the callbacks in)
- **Per-company failures do NOT abort the sweep** — a throw from `ensureSystemForCompany(cid)` is captured in `skipped[]` with a reason string and the loop moves on. Rationale: a single broken role-pack or DB constraint must not take down a multi-company restore. The restore itself is non-negotiable; system-employee repair is best-effort
- **`BackupRestoreResponse.postRestoreSystemEmployees`** — new optional field on the IPC response `{ companiesScanned, agentsCreated, copilotsCreated, skipped }`. Forward-compatible: older handlers (or unit tests without the bootstrap dep) leave the field `undefined`, renderer consumers tolerate both shapes
- **Handler-level error shield** — a catastrophic throw from `ensurePostRestoreBootstrap` (as opposed to per-company throws, which are already swallowed) is caught inside `backupRestore`, logged via `console.error`, and returns a manifest-only response. The DB + vault are already swapped at this point; failing the whole restore would leave users with an unusable app
- **Composition root wiring in `apps/desktop/src/main/index.ts`** — closes over `db` + `companiesRepo` + `roleLoader` and builds the `ensurePostRestoreBootstrap` closure that resolves the company list at *call time* (not composition time) so the closure reads the just-restored DB, not the pre-restore snapshot
- **7 new unit tests in `backup.test.ts`** — empty set, all-created (pre-M31), none-created (current-schema), mixed cohort, per-company throw via `skipped[]`, non-Error throw coercion, idempotency (second-pass zero counts). 3 new scenarios in `backup-handlers.test.ts` — unwired-dep manifest-only, wired-dep threads counts into response, catastrophic bootstrap throw swallowed + manifest-only

#### Changed
- `copilot-event-window.ts` §5 design note — "wiring deferred" replaced with the actual wiring reference including the three-step ordering rationale and the `bus.emit('company.archived')` invariant #11 callout. Operator-readable audit trail so future maintainers can see why `clear()` lives on this object and who calls it
- `SystemAgentBootstrap` consumers documented — `seed.ts::seedIfEmpty` inlines the seed (keeps `seedIfEmpty` pure over the DB); `system-agent-bootstrap.ts` exports `ensureSystemAgent` / `ensureSystemCopilot` for runtime idempotent top-ups (post-restore F4 is the first production consumer; `companies.create` IPC remains a future milestone consumer)
- CLAUDE.md IPC channel table + Troubleshooting section updated for both follow-ups (companies.archive entry + system-copilot-missing-after-restore entry pointing at F4 auto-bootstrap)

---

### M33 — Copilot Service (periodic analyzer + proactive insights + ask-the-copilot) (2026-04-17)

> **Status:** Complete (T0–T10, all 11 tasks shipped). Baseline: 1033 unit tests / 8 E2E specs → current: **1099 unit tests / 9 E2E specs** (10 Playwright cases) (+66 unit, +1 E2E). Plan: [`docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md`](docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md).

#### Added
- **`system-copilot` pseudo-employee** — second `is_system = 1` row per company alongside M31's `system-agent`. Hidden from `employees.list`, `orgchart.get`, hire dialog, delegation pickers, and meeting attendees by the same `level: 'system'` + `is_system = 1` filter sweep. Owns the Copilot Conversations thread for `copilot.ask`. NEW role card `role-packs/strategia-official/roles/system/system-copilot.md` (117 lines, level: system, `tools_allowed: [query_employees, query_tickets, query_projects, query_meetings, query_vault, query_events, query_copilot_insights]`, `tools_denied: [decompose_project, delegate_subtask, review_deliverable, shell, filesystem, network, send_message_to_colleague]`, `decision_authority: advisory`). NEW `packages/shared-types/src/roles.ts` exports `SYSTEM_AGENT_ROLE_ID` + `SYSTEM_COPILOT_ROLE_ID` + `SYSTEM_ROLE_IDS` tuple + `isSystemRoleId()` predicate. `ensureSystemCopilot(companyId)` bootstrap called inline after `ensureSystemAgent` from `seedIfEmpty`. `SeedResult` gains `systemCopilotId`
- **Migration 0011 — `copilot_insights` table** with CHECK-constrained `category` (`operational` / `cost` / `org` / `workflow` / `anomaly`) and `severity` (`info` / `warning` / `critical`), composite `idx_insights_company_active ON (company_id, dismissed_at, expires_at)`, FK `company_id REFERENCES companies(id) ON DELETE CASCADE`. Columns: `id`, `company_id`, `category`, `severity`, `title`, `detail`, `action_suggestion`, `action_intent`, `action_entities_json`, `dismissed_at`, `created_at`, `expires_at`
- **Migration 0012 — `runs.kind` column** (default `'work'`, no CHECK constraint — TS union enforces). Backfills every existing row to `'work'`. New copilot ticks land as `kind: 'copilot'`; M31 agentic rows are candidates for future backfill when the Telemetry tab grows a per-kind filter (M34+)
- **`CopilotInsightsRepo`** in `apps/desktop/src/main/db/repos/copilot-insights.ts` with 7 methods: `create`, `getById`, `listActive({ companyId, category?, severity?, includeDismissed?, limit? })`, `dismiss(id)`, `expireStale(now)`, `listStale(now)` (non-mutating sibling so per-row `copilot.expired` events can fire BEFORE physical delete), `upsertWithDedup(draft, ctx)`. Dedup contract is **category-scoped → numeric-drift guard → Jaccard bigram > 0.8** (cheap rejections first, locked threshold `JACCARD_MERGE_THRESHOLD = 0.8`). Two consecutive ticks with byte-identical input → one row; numeric variant ("3 blocked tickets" → "4 blocked tickets") → two rows; semantically-similar but lexically-different drafts → one row, existing preserved. `copilot.insight` event fires only on insert, never on merge
- **`CopilotEventWindow`** in `apps/desktop/src/main/services/copilot-event-window.ts` — in-memory per-company bounded deque (`MAX_EVENTS_PER_COMPANY = 100` private const, FIFO eviction on overflow). Subscribes to the event bus; warm-start hydration from `events.list({ companyId, limit: 100 })` on first `snapshot()` per company (`hydrated: Set<string>` re-hydration guard). `EXCLUDED_EVENT_TYPES = {'token.delta'}` filtered at push + hydration boundary. Defensive-copy on `snapshot()` so the analyzer's prompt-builder iteration cannot be mutated by live push+shift
- **`CopilotAnalyzerService`** in `apps/desktop/src/main/services/copilot-analyzer-service.ts` — periodic per-company scheduler (`start` / `stop` / `stopAll` / `tick` / `getLastAnalysisAt` / `restart`) with deterministic `buildAnalysisPrompt` (≤2000 event-summary chars), Zod `InsightDraftSchema` + one-shot nudge retry + `malformed_output` skip (M31 forward-scan pattern), pause-aware `providerRouter.complete` wrapper polling `orchestrator.isCompanyPaused(companyId)` on every provider call (actor: `system-copilot`), per-cycle expiry sweep (`listStale` → per-row `copilot.expired` → `expireStale`), `runs` row per tick with `kind: 'copilot'`, `AbortController`-driven stop with canceled-status coercion. Insights persisted via `upsertWithDedup`; `merged: true` flag suppresses duplicate `copilot.insight` emits
- **`CopilotEventTrigger`** in `apps/desktop/src/main/services/copilot-event-trigger.ts` — separate file from the window. 30-second-debounced (latest-reason-wins) per-company `triggerAnalysis` for four event types: `meeting.ended`, `ticket.closed`, `goal.progressChanged`, `agentic.failed { reason: 'budget_exhausted' }`. Debounce, not throttle — the timer resets on each new signal. `ticket.closed` and `goal.progressChanged` subscriptions are wired but no upstream emitter exists yet; zero-cost until they land
- **Four new bus event types** in `packages/shared-types/src/events.ts`: `copilot.analyzed` (per tick — `{ companyId, reason: 'periodic' \| 'manual' \| 'event' \| 'malformed_output', durationMs, insightsProposed, insightsPersisted, insightsMerged, insightsExpired }`), `copilot.insight` (per insert, NOT per merge — `{ companyId, insightId, category, severity, title }`), `copilot.dismissed` (per `copilot.dismiss` IPC call — `{ companyId, insightId, dismissedAt }`), `copilot.expired` (per expiry-sweep row — `{ companyId, insightId, category, severity, title, expiredAt }`). Plus three new shared-types unions: `CopilotCategory`, `CopilotSeverity`, `CopilotAnalyzedReason`
- **Four `copilot.*` IPC channels** in `apps/desktop/src/main/ipc/copilot-handlers.ts` (`buildCopilotHandlers` factory, mirrors `rag-handlers.ts` pattern): `copilot.insights` (newest-first, optional category/severity filters, limit clamped 1–100), `copilot.dismiss` (sets `dismissedAt = Date.now()`, emits `copilot.dismissed`), `copilot.ask` (free-form question, routes through `AgenticLoopService.start` with `employeeId = system-copilot`, returns `{ runId, threadId }` field-for-field identical to M31's `complex_request`), `copilot.configure` (test-only manual-tick gated on `isTestMode()`, returns `{ insightsGenerated }` synchronously). Typed end-to-end via `TeamXApi` + `IpcContract`. NEW `packages/shared-types/src/copilot.ts` with JSON-safe `CopilotInsight` wire row distinct from Drizzle `CopilotInsightRow`. `window.teamx.copilot` namespace on the preload bridge
- **`agentic-tools-copilot.ts`** in `apps/desktop/src/main/services/` — `query_copilot_insights` Tool factory (zod-strict schema, `{rows, truncated}` envelope, `MAX_COPILOT_ROWS = 50` cap, over-fetch-by-one truncation detection, JSON-safe `CopilotInsightProjection` distinct from Drizzle row, `includeDismissed` flag defaulting false) + `buildCopilotToolRegistry(employee, deps)` level-gated composer returning `[query_copilot_insights]` when `employee.roleId === SYSTEM_COPILOT_ROLE_ID`, `[]` otherwise. The level-gating is enforced at the composition root, NOT in the prompt
- **`CopilotService`** in `apps/desktop/src/main/services/copilot-service.ts` — front-door wrapping `AgenticLoopService.start`. Resolves system-copilot via `employeesRepo.findSystemByRoleId(companyId, SYSTEM_COPILOT_ROLE_ID)`, passes id through as explicit `employeeId`. Return shape `{ runId, threadId }` matches M31 `IpcExecuteResult.complex_request` field-for-field for M34 sidebar wire-contract stability
- **Three clamped copilot settings keys**: `copilot_enabled` (bool, default `true`), `copilot_interval_minutes` (1–60, default 5), `copilot_categories` (subset of `COPILOT_CATEGORIES`, default full set). Empty `categories` falls back to the full set (conservative default). Persisted via `settings.getCopilot` / `settings.setCopilot` IPC channels (clamps server-side regardless of UI). `setCopilot` triggers `analyzer.restart(companyId)` so the per-company timer picks up the new interval without app restart. NEW `COPILOT_CATEGORIES` runtime constant in `shared-types` as a sibling to the type-only `CopilotCategory` union
- **`CopilotSection`** UI component in `Settings → Runtime → Copilot` (Strategia-red Sparkles header, switch-style enabled toggle, number input 1–60 for interval, 5 category checkbox chips with empty→full optimistic fallback). Rendered after `PlannerSection` in `settings-view.tsx`. NEW `useCopilotSettings` + `useSetCopilot` React Query hooks
- **Test seam `apps/desktop/src/main/services/test-copilot-provider.ts`** (~217 LOC) — fourth member of the agentic-surface test-seam quartet (`test-classifier.ts` M30 + `test-agentic-provider.ts` M31 + `test-agentic-tools.ts` M32 + `test-copilot-provider.ts` M33). Three-tier resolver: `__ECHO_COPILOT__:<json>` sentinel (JSON.parse + JSON.stringify round-trip + echo verbatim) → normalized-substring match (closure-local `inlineFixtures` → runtime-mutable `runtimeFixtures` Map → frozen `CANNED_COPILOT_TABLE`, first-hit wins) → `FIXTURE_COPILOT_EMPTY` never-throw fallback. Defensive empty-prompt Error throw mirrors production-provider behaviour. `addCopilotFixture(key, value)` + `clearCopilotFixtures()` are the test-facing helpers. Composition root replaces T4 inline placeholder with `createTestCopilotComplete()` in test-mode `resolveComplete` branch; production untouched
- **`agentic-tools-copilot` extension to `test-agentic-tools.ts`** — three-tier seam extended with `__ECHO_COPILOT_QUERY__:<json>` sentinel + `CANNED_COPILOT_QUERY_TABLE` + `FIXTURE_COPILOT_EMPTY` fallback. `TestEmployeeContext` gains optional `roleId`; `createTestToolsForEmployee` swaps write-side for copilot tool set when `roleId === 'system-copilot'`
- **E2E spec `apps/desktop/e2e/copilot-service.spec.ts`** (422 LOC, single Playwright case: *"configure tick → insight surfaces → dismiss → ask routes through system-copilot"*). Boots `out/main/index.js` with `NODE_ENV=test`, throwaway `--user-data-dir`. Flow: `companies.list` → `tickets.create + close` (flow through `CopilotEventWindow`) → `copilot.configure` manual-tick → assert `insightsGenerated ≥ 1` → `copilot.insights` capture id → `copilot.dismiss` → assert `dismissedAt` + `events.list` contains `copilot.dismissed` (invariant #11 regression guard) → `copilot.ask` with `__ECHO_AGENT__:` sentinel → poll `command.getRunSnapshot` for terminal `answer` step + assert `tool_call(query_copilot_insights)` step → `chat.list(threadId) ≥ 2` messages → `chat.listThreads` asserts `isSystemAgent: true` on copilot thread → regression guards: destructive (red) gate + write-side (amber) gate both ABSENT. Spec runtime 1.7s. E2E suite 9 specs / 10 cases green in 27.4s
- **66 new unit tests** across the copilot surface: 15 `copilot-insights-repo.test.ts` (CRUD + dedup Jaccard threshold + numeric-drift guard + expireStale + listActive filter composition + includeDismissed flag), 4 `system-employees.test.ts` (ensureSystemCopilot fresh-create + idempotent + both-system-roles coexist + filter-sweep hides both), 8 `copilot-event-window.test.ts` (bounds + isolation + warm-start + defensive-copy + archive-clear), 14 `copilot-analyzer-service.test.ts` + `copilot-event-trigger.test.ts` (determinism + nudge retry + pause-aware + dedup merge flag + expiry sweep + cancel + debounce + coalesced-reset + non-signal filter), 8 `copilot-handlers.test.ts` (insights happy + invalid companyId + dismiss happy + unknown id + ask stub-happy + missing-text + configure happy + production-throw), 5 `agentic-tools-copilot.test.ts` (query_copilot_insights schema + filter composition + 50-row cap + truncation flag + level gate), 7 `settings-copilot.test.ts` + `settings-copilot-handlers.test.ts` (defaults + clamp + empty-fallback + unknown-filter + handler round-trip + analyzer.restart side effect), 5 `test-copilot-provider.test.ts` (sentinel echo + canned hit + fallback + empty-prompt rejection + provider/model stamping)
- New user guide `docs/user-guide/copilot-service.md` — what the Copilot is, what it watches, the five categories, severity treatment, periodic cadence + four event triggers, three settings, dedup discipline, expiry, audit trail, privacy posture, full example cycle, troubleshooting (11 entries)

#### Changed
- `AgenticLoopService.start()` now resolves `system-copilot` via the new `findSystemByRoleId` repo method when invoked through `CopilotService`. Cross-company isolation guard preserved; M31's default `system-agent` fallback unchanged
- `runs` table writes (M31 + M32) now carry an explicit `kind: 'agentic'` literal; copilot ticks land as `kind: 'copilot'`. The `kind` column defaults to `'work'` for legacy rows and orchestrator runs; future backfill candidates documented in Phase 5 §16 follow-ups
- `CopilotInsightsRepo.listActive` accepts an optional `includeDismissed` flag (defaults to active-only behaviour from T1) to support the `query_copilot_insights` tool surface — single read path, minimal repo growth
- `CommandService.execute` for `complex_request` continues to honor the M32 write-side amber gate. The new `copilot.ask` IPC bypasses the palette/`command.execute` path entirely; copilot is advisory by construction so neither the destructive (red) nor the write-side (amber) gate ever fires
- Phase 5 design doc (`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`) §9 Milestone Breakdown — M33 status flipped from `🚧 In progress — 2 of 11 tasks shipped` to `✅ Complete (2026-04-17)` with the full deliverable line. §10 IPC channel summary gains the four `copilot.*` channels + `settings.getCopilot` / `settings.setCopilot`. §10 bus events table extended with the four `copilot.*` events. §16 NEW (Follow-ups post-M33) — F3 (`CopilotEventWindow.clear` not wired to non-existent `companies.archive` IPC) + F4 (backup/restore needs post-restore system-copilot bootstrap)
- CLAUDE.md Status line, Phase 5 block, IPC table (copilot channels + copilot settings), bus events table (four new event rows), and Troubleshooting section all updated for M33 as-shipped — including the new `NODE_MODULE_VERSION` ABI-rebuild dance entry verified across M31 + M32 + M33 verification gates
- README.md Intelligence Layer section gains the Copilot Service blurb. Tests badge refresh: 1033 → 1099 unit tests, 8 → 9 E2E specs

#### Fixed
- Test-seam quartet documentation gap: `test-copilot-provider.ts` is the fourth member, structurally mirroring the M30/M31/M32 seams (sentinel → canned → fallback). Documented inline + in CLAUDE.md
- Spec-side biome-ignore + `(window as any).teamx` cast pattern continues across `copilot-service.spec.ts` — the E2E tsconfig doesn't see the renderer's `window.d.ts` augmentation, same workaround as `rag-flow.spec.ts` and `vault-backup.spec.ts`

---

### M32 — Task Planner (write-side) (2026-04-15)

> **Status:** Complete (T0–T10, all 11 tasks shipped, completed 2026-04-16). Baseline: 958 unit tests / 7 E2E → current: 1033 unit tests / 8 E2E (+75 unit, +1 E2E). Plan: [`docs/plans/2026-04-15-team-x-phase-5-m32-task-planner.md`](docs/plans/2026-04-15-team-x-phase-5-m32-task-planner.md).

#### Added
- **Three write-side agentic tools** in `apps/desktop/src/main/services/agentic-tools-write.ts`:
  - `decompose_project` — Officer / Senior Mgmt / Management / system-agent only. Takes a project brief, returns a JSON-safe subtask tree with `recommendedAssigneeId` per leaf derived from the workload-scoring function. Subject to `planner_max_tickets` and `planner_max_depth` clamps; truncates with `truncated: true` on overflow
  - `delegate_subtask` — Management / Supervisor / Lead / system-agent only. Creates a real ticket and assigns it; falls back through a candidate chain on assignment failure; escalates after `planner_escalation_threshold` failures via in-memory `EscalationTracker`
  - `review_deliverable` — Management / Supervisor / Lead / system-agent only. Marks a closed ticket approved or rejected with a freeform note; rejects push the ticket back to `in-progress`; three consecutive rejects escalate
- **Deterministic workload scoring** (`scoreEmployee` in `agentic-tools-write.ts`) — locked Phase 5 §7.4 weights (0.4 role-fit + 0.3 inverse-load + 0.2 availability + 0.1 past-performance), sum-to-1.0 asserted at boot, archived/fired/system employees score zero, role-fit via keyword heuristic over title + level (capabilities frontmatter deferred to M33/M34)
- `buildWriteSideTools(employee, deps)` — level-gated composer that returns `[]` for IC, `[decompose_project]` for Officer + Senior Mgmt, `[delegate_subtask, review_deliverable]` for Supervisor + Lead, all three for Management + system-agent
- **Level-based tool-registry injection** in `AgenticLoopService` — new `AgenticLoopEmployeeContext` + `AgenticLoopEmployeeLookup` types, `employeesRepo.getById` facade, `StartArgs` gains optional `employeeId` with default system-agent fallback, cross-company isolation guard, actor threaded through every identity touchpoint (members, runs row, message authors, bus events). Composition root composes `[...readSideTools, ...buildWriteSideTools(employee, ...)]` per run with `streamAgent`-wrapped `WriteSideCompleteFn`
- **Six new bus event types** in `packages/shared-types/src/events.ts` (canonical `EventType` union): `plan.proposed`, `plan.approved`, `task.delegated`, `task.escalated`, `review.requested`, `review.completed`. Six JSON-safe payload interfaces (`PlanProposedPayload`, `PlanApprovedPayload`, `TaskDelegatedPayload`, `TaskEscalatedPayload`, `ReviewRequestedPayload`, `ReviewCompletedPayload`)
- **Three new step kinds** in `AgentStepKind`: `ticket_created` (emerald, Ticket icon), `delegation_made` (sky, GitBranch icon), `review_pending` (color-coded by outcome — emerald/red/amber). `AgentStepPayload.data` extended with three new kind shapes
- **Write-side confirmation gate (Gate 2.5)** in `command-service.ts` — fires for `complex_request` intents matching `WRITE_SIDE_KEYWORDS` regex (`decompose` / `delegate` / `create tickets` / `assign owners` / `review`). Returns `{ kind: 'needs_confirmation', gateKind: 'write-side', summary }` and renders an **amber** confirmation card distinct from the M30 destructive **red** card. `skipConfirmation: true` opt-out for M33 Copilot pre-approved actions
- **Step-card variants** — `ticket_created`, `delegation_made`, `review_pending` cards with full data narrowing, detail text, and color polish. Narrow helpers extracted to `step-card-narrow.ts` for testability without renderer/jsdom deps
- **AuditView planner chips** — six new event types render with payload-aware row summaries (subtask count, assignee, outcome, escalation reason)
- **Four new clamped planner settings keys**: `planner_max_tickets` (1–50, default 10), `planner_max_depth` (1–4, default 2), `planner_approval_level` (enum, default `management`), `planner_escalation_threshold` (1–10, default 3). Seeded in `settings.seedDefaults()`; persisted via `settings.getPlanner` / `settings.setPlanner` IPC channels
- **PlannerSection** UI component in Settings → Runtime (GitBranch icon, three number inputs + one select, onBlur clamping, loading/error/saving states). Composition root wires `settingsRepo.getPlanner()` into `writeSideDeps.getPlanner` replacing static `PLANNER_DEFAULTS`
- **`command.getRunSnapshot` IPC channel** + handler + preload bridge — projection (`runId, threadId, steps[]`) for `useAgentStepStream` backfill on mount. Closes M31 follow-up F1
- **`useThreadList` bus invalidator** — subscribes to `agentic.completed` / `agentic.failed` and invalidates `['threads', companyId]` so Copilot Conversations populates live without manual refetch. Closes M31 follow-up F2
- **Test seam `apps/desktop/src/main/services/test-agentic-tools.ts`** (298 LOC) — three-tier resolver mirroring `test-classifier.ts` and `test-agentic-provider.ts`: `__ECHO_WRITE_SENTINEL__:[…]` → canned per-tool table → fallback. Schema-identical `decompose_project` / `delegate_subtask` / `review_deliverable` factories with `createTestToolsForEmployee` level-gated composer + standalone `createTestWriteSideTools` factory. Lockstep invariant with production `buildWriteSideTools` gates
- **Default fixtures** in `test-agentic-tools.ts` — `FIXTURE_DECOMPOSED_PLAN` (1 subtask, plan-test-1, assignee emp-test-swe) and `FIXTURE_DELEGATION` (tkt-test-1, Mateo Reyes) so `task-planner.spec.ts` resolves with zero new canned entries
- **E2E spec `apps/desktop/e2e/task-planner.spec.ts`** (285 LOC) — full write-side round-trip: canned classifier returns `complex_request` for "decompose the frontend redesign into tickets" → amber write-side gate fires → Confirm dispatches → canned provider scripts plan → `decompose_project` → `delegate_subtask` → grounded answer. Asserts (1) palette intent chip "Route to Agent", (2) amber gate visible, (3) destructive gate ABSENT, (4) `data-step-kind='answer'` card with canned text, (5) palette step count ≥ 1 (observed = 7 — proves M32 T0 F1 backfill working end-to-end), (6) Open Thread closes palette + opens Copilot drawer with read-only banner + canned answer, (7) Dashboard → Commands shows audit row. 9/9 E2E green in 26.4s
- **75 new unit tests** across the planner surface: 25 `agentic-tools-write.test.ts` (score determinism, weights-sum-1.0, system/archived/fired score zero, role-fit heuristic, decompose clamps + level gates, delegate happy path + fallback chain + escalation, review unfinished-reject + happy-path + escalation, composer level-gating, bus-throws non-fatal), 11 `agentic-loop-service.test.ts` + `test-agentic-tools.test.ts` (default-actor capture, explicit employeeId, unknown-id throw, cross-company guard, level-gated composers), 3 `events-m32.test.ts` (canonical EventType union check, AgentStepKind, payload discriminators), 8 `command-service.test.ts` write-side gate (heuristic + needs_confirmation + confirmed-true passthrough + skipConfirmation bypass + no-keyword passthrough), 11 `step-card-narrow.test.ts` (4 ticket_created + 3 delegation_made + 4 review_pending), 11 `settings-planner.test.ts` (3 getPlanner + 4 setPlanner clamping + 1 non-finite reject + 1 fractional rounding + 2 seedDefaults), 6 `command-service.test.ts` getRunSnapshot
- New user guide `docs/user-guide/task-planner.md` — what the planner is, when it triggers, the three write-side tools, workload scoring formula, four planner settings, amber vs red confirmation gates, privacy posture, full example run, troubleshooting

#### Changed
- `CommandService.execute` for `complex_request` intent now passes through Gate 2.5 (write-side confirmation) before dispatching to `AgenticLoopService.start()`. Bypassable via `skipConfirmation: true` for M33 Copilot pre-approved actions
- `AgenticLoopService.start()` accepts an optional `employeeId` argument (defaults to system-agent if omitted) and resolves the actor before instantiating the loop. Validates cross-company isolation; throws on unknown id
- `RunState.systemAgentId` field name preserved for M31 wire-contract stability — actor identity now flows via the new `actorEmployee` channel, not by renaming the existing field
- `agentic-tools-write.ts` tool bodies use `satisfies EventType` (canonical narrowing) instead of T2's transitional `satisfies WriteSideEventType` literal
- Phase 5 design doc (`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`) §9 Milestone Breakdown — M32 status flipped from `📋 Next` to `🚧 In progress — 9 of 11 tasks shipped`. §13 Decisions log gains D11 (write-side keyword heuristic, locked) and D12 (escalation tracker is in-memory per-process). §14 Follow-ups marks F1 + F2 closed with commit refs `f515ea7` (T0) + `62a0504` (T1)
- CLAUDE.md Status line, Phase 5 block, IPC table (planner settings + getRunSnapshot), bus events table (six new event rows), and Troubleshooting section all updated for M32 as-shipped
- README.md Intelligence Layer section gains the Task Planner blurb. Tests badge refresh: 958 → 1033 unit tests, 8 → 9 E2E specs

#### Fixed
- M31 follow-up F1 — `useAgentStepStream` now backfills via `command.getRunSnapshot` on mount before attaching the bus listener, with `(runId, stepIndex)` dedup against late-arriving bus events. The palette step log shows every step even when the canned provider completes faster than the bus subscription attaches (commit `f515ea7`)
- M31 follow-up F2 — `useThreadList` invalidates `['threads', companyId]` on `agentic.completed` and `agentic.failed` so Copilot Conversations populates live without manual refetch (commit `62a0504`)

---

### M31 — Agentic Loop (read-side) (2026-04-15)

> **Status:** 9 of 11 tasks shipped (T0–T8). T9 (this docs commit) done. T10 (verification + milestone marker) pending. Baseline: 819 unit tests / 7 E2E → current: 958 unit tests / 8 E2E (+139 unit, +1 E2E). Plan: [`docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md`](docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md).

#### Added
- **System-agent pseudo-employee** — new `is_system` column on `employees` (migration 0010, partial index `idx_employees_system_by_company`), `role-packs/strategia-official/roles/system/system-agent.md` role card, `ensureSystemAgent(companyId)` bootstrap called from `seedIfEmpty`. Exactly one per company; filtered out of `employees.list`, `orgchart.get`, hire dialog, delegation pickers. Backing for every `complex_request` thread
- `@team-x/intelligence/src/loop/` — pure ReAct scheduler: `types.ts` (`LoopStep`, `LoopRun`, `Tool`, `LoopDeps`), `tool-registry.ts` (zod-validated schemas, per-tool timeout, error wrapping), `loop.ts` (`createAgenticLoop` factory, forward-scan brace-balanced JSON parser with one-shot nudge recovery, step/token/wall-clock budget enforcement), `prompt.ts` (canonical ReAct system prompt builder). Zero Electron/DB/fs coupling — all deps injected
- **Six read-only agentic tools** in `apps/desktop/src/main/services/agentic-tools.ts` wrapping existing repos with JSON-safe `{rows, truncated}` projections: `query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`. Capped at 50 rows per call with defensive `isSystem = 0` filter on employees and a 200-char payload summarizer with ellipsis
- `AgenticLoopService` (`apps/desktop/src/main/services/agentic-loop-service.ts`) — main-process orchestrator front-door with `start / stop / getRun / waitForRun`. `start()` resolves system-agent, creates a per-query DM thread, instantiates the loop with resolved `providerRouter.complete` + agentic tools, subscribes `onStep` to write step events to the bus and persist transcript rows, emits `agentic.completed` or `agentic.failed`, writes a `runs` row with kind `'agentic'`. `stop(runId)` aborts via per-run `AbortController` with canceled-status coercion across all abort layers
- **Pause-aware `providerRouter.complete` wrapper** polling `orchestrator.isCompanyPaused(companyId)` on every provider call (default 250ms, test 2ms). Loop queues cleanly during meetings and resumes when the orchestrator unpauses — no independent dispatch, honors invariant #2
- `test-agentic-provider.ts` — `NODE_ENV=test` seam mirroring M30 T8's `test-classifier.ts` pattern. Three-tier lookup: `__ECHO_AGENT__:[…]` sentinel → canned per-prompt table → fallback. Per-prompt call-count tracking for multi-step scripted runs
- `test-agentic-tools.ts` — canned `{rows, truncated}` responses keyed by `(toolName, argsHash)`, with `__ECHO_TOOL__:[…]` sentinel and fallback
- **CommandService → AgenticLoopService wiring** — `CommandHandlers.agenticLoopStart(req): Promise<{ runId, threadId }>` (mirrors `employeesFire` / `employeesPromote` shape); stub at `command-service.ts:770-775` replaced with real dispatch; `ExecuteResult` gains `runId` / `threadId` fields for the palette to deep-link into the persisted thread. Composition root `main/index.ts` wires the service + test-mode swaps
- **Copilot Conversations thread UX** — new section in the chat sidenav above regular DMs: Sparkles icon, robot badge, read-only compose box (the agentic loop can't be replied to; it's a transcript, not a conversation). Persisted step transcript renders inline in the chat drawer with step-card variants (`plan` / `tool_call` / `tool_result` / `answer` / `error`). `use-agent-step-stream.ts` hook + `system-agent-badge.tsx` + `thread-list.tsx` + `chat-drawer.tsx` fourth read-only branch
- **Palette step-log mode** — on `complex_request` success the palette transitions from classification view to a streaming step-log panel. Six UI states (idle / streaming / complete / canceled / error / stopped). `data-step-kind` attributes (`plan` / `tool_call` / `tool_result` / `answer` / `error`) as the stable E2E selector surface — assert against these, not against rendered text. Per-step provider + token footer. Cancel button fires `command.stop`, "Open Thread" button deep-links into the persisted Copilot Conversations thread after the run terminates
- `command.stop` IPC channel + handler + preload bridge method. Fires the per-run `AbortController`; next loop step emits `{ kind: 'error', reason: 'canceled' }` and the run terminates with status `canceled`
- **Agentic Loop settings subsection** in Settings → Runtime (below Concurrency). Three clamped numeric inputs: `agentic_max_steps` (1–32, default 8), `agentic_max_tokens` (500–50000, default 8000), `agentic_timeout_ms` (10000–600000, default 120000). Seeded in `settings.seedDefaults()`; persisted via `settings.getAgentic` / `settings.setAgentic` IPC channels
- `agent.step`, `agentic.completed`, `agentic.failed` bus event types + payload interfaces in `packages/shared-types/src/events.ts`. Append-only on the `events` table — consumed by the renderer via the event bus, surfaces in the audit log, drives palette step cards
- **E2E spec `apps/desktop/e2e/agentic-loop.spec.ts`** — full round-trip via classifier/provider/tools seams. Canned classifier returns `complex_request`; canned provider streams plan → `query_employees` tool call → tool result → grounded answer; spec asserts palette step log via `data-step-kind`, persisted thread in Copilot Conversations, `agentic.completed` bus event, audit row. 8/8 E2E green under `pnpm -F @team-x/desktop test:e2e:run`
- New user guide `docs/user-guide/agentic-loop.md` — what the loop is and when it triggers, the 5 step kinds, the 6 read-only tools, step log mode UI, system-agent thread persistence, budget cap settings, stopping a run, troubleshooting, privacy posture

#### Changed
- `CommandService.execute` for `complex_request` intent now dispatches to `AgenticLoopService.start()` and returns `{ runId, threadId }` instead of the M30 T4 stub `{ summary: 'Escalated to agentic loop (M31).' }`
- `telemetry.runs` now includes rows with `kind: 'agentic'` — the Telemetry dashboard's Employees and Cost subviews surface system-agent usage separately (by design — the system-agent is not hidden in telemetry, only in the org chart)
- Architectural invariant #2 re-examined and preserved: the loop's pause-aware wrapper is additive to, not replacing, the orchestrator's scheduling contract. `AgenticLoopService` never creates a slot or dispatches work around the orchestrator — every provider call flows through `providerRouter`, which flows through the orchestrator's slot semaphore
- Phase 5 design doc (`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`) §9 resequenced to reflect as-shipped order: M30 now covers NLU engine + command palette UI (combined, 146 tests), M31 is the agentic loop (originally planned as a bullet inside M31/Command Palette UI, now its own milestone), M34 deps pointer shifted from M31 → M30. §10 gains `command.stop` + `settings.getAgentic/setAgentic` + agentic bus events; §11 gains three `agentic_*` settings keys; §13 gains decisions D8 (read-side only in M31), D9 (system-agent seat), D10 (built-in main-process tools, not MCP); new §14 Follow-ups documents F1 (step-stream backfill) and F2 (thread-list bus invalidator)
- CLAUDE.md Status line, Phase 5 block, Phase plan list, IPC table, bus events table, and Troubleshooting section all updated for M31 as-shipped

#### Fixed
- `complex_request` from M30 T4 now actually does something. The stub `{ summary: 'Escalated to agentic loop (M31).' }` response that made the 15th intent a no-op is gone — a typed `complex_request` now produces a grounded multi-paragraph answer in a persisted thread

---

### M30 — NLU Engine + Command Palette (2026-04-13)

#### Added
- Natural-language command palette (`Cmd+K` / `Ctrl+K`) exposing 15 intents through an LLM-backed classifier with a destructive-action confirmation gate
- `@team-x/intelligence/nlu` — `intent-classifier` (LLM JSON output with one-shot retry + `complex_request` fallback), `entity-resolver` (fuzzy name match + FTS5 for tickets/vault, candidate disambiguation), `slot-filler` (per-intent required-slot table, destructive-intent confirmation summary)
- 60-example labeled intent fixture (`packages/intelligence/src/nlu/fixtures/intent-examples.test.ts`) with deterministic mock-LLM driver achieving ≥90% classification accuracy
- Test-mode classifier seam (`createTestModeClassifier`) — canned input → intent table for E2E spec without LLM round-trips
- `CommandService` (`apps/desktop/src/main/services/command-service.ts`) — owns the intent → IPC handler dispatch table for all 15 intents, enforces destructive `confirmed: true` invariant, emits `command.executed` events on success
- `command.parse`, `command.execute`, `command.history`, `command.suggest` IPC channels with typed `TeamXApi` bindings and preload bridge methods
- Command palette UI — Radix `Dialog` (560px wide), debounced 200ms classification, intent + entity chips, color-coded confidence bar, candidate disambiguation rows, destructive-confirm step, undo toast on non-destructive success, `ArrowUp` history picker from empty input, `/show <view>` slash-command bypass
- Command history persisted to `settings.command.history` (FIFO, last 20) plus a "Recent Commands" section on the Dashboard subview
- `command_history` storage table semantics via the existing settings key-value store; `command.executed` event type added to `packages/shared-types/src/events.ts`
- New user guide `docs/user-guide/command-palette.md` covering all 15 intents with examples, destructive-action gate, history, slash commands, troubleshooting, and privacy posture
- E2E spec `apps/desktop/e2e/command-palette.spec.ts` exercising parse → confirm → execute → history with the canned classifier and a real `employees.fire` round-trip

#### Changed
- Audit log (`AuditView`) now renders `command.executed` events with human-readable intent + entities summary labels alongside existing event types
- Top-bar architectural badge tracks Phase 5 progress; `CLAUDE.md` baseline test count updated 673 → 819 unit tests, E2E spec count 5 → 7
- New architectural invariant #11 — *"IPC channels that mutate state must emit a bus event"* — added to `CLAUDE.md` to prevent the React Query staleness class of bug surfaced by `vault-backup.spec.ts`

#### Fixed
- `vault.file_created` / `vault.file_deleted` events now emit on DB commit from the vault service (M30 T0) — closes the renderer-cache staleness regression that broke `vault-backup.spec.ts` and lays groundwork for M32 RAG-on-vault. See `docs/plans/2026-04-13-vault-backup-regression-findings.md` §7 for the full root-cause analysis

---

### M29 — RAG Integration into Agent Turns (2026-04-13)

> **Status:** Complete. Baseline: 641 unit tests → current: 668 unit tests (+27 unit). Layered RAG retrieval into agent turns on top of the M28 foundation. Entry backfilled 2026-04-20 per M35 T7 follow-up; no code or test changes from the original 2026-04-13 shipping state.

#### Added
- **`resolveSystemPrompt`** composes retrieved context with the role.md system prompt. Retrieval runs against the M28 `embeddings` table through the `@team-x/intelligence` retriever; hits above the similarity threshold are spliced in as a sliding attribution block at the top of the system prompt, leaving role identity untouched
- **On-write event-bus re-indexing** — `RagIndexer` subscribes to message writes and vault file writes, chunks the new payload, embeds it via the M28 pipeline, and persists to the `embeddings` table. Zero polling; zero scheduled work; indexing tracks writes 1:1
- **SHA256 content-hash dedup** — chunks carry a hash so re-indexing an unchanged source is a no-op. Mutated sources drop the old rows and write the new set in one transaction
- **Sliding attribution block** — retrieved context lives in a single transparent `<context>...</context>` block above the role prompt. Role.md authors write stable identity without knowing retrieval exists
- **RAG subsection in Settings → Runtime** — toggle plus the three M28 clamped numeric inputs (`rag_chunk_size`, `rag_chunk_overlap`, `rag_similarity_threshold`), with per-field help text and clamp enforcement
- **27 new unit tests** across `resolveSystemPrompt`, the indexer's on-write subscriptions, dedup guards, and the attribution-block composition — lifts the unit baseline 641 → 668

#### Changed
- `orchestrator.runAgent` now calls `resolveSystemPrompt` before every agent turn. Zero-cost passthrough when RAG is disabled at the settings layer or when the query yields zero above-threshold hits
- Phase 5 design doc (`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`) §9 Milestone Breakdown — M29 status flipped `📋 Planned` → `✅ Complete`

---

### M28 — Intelligence Package + RAG Foundation (2026-04-13)

> **Status:** Complete. Baseline: 612 unit tests / 4 E2E (v1.0.0) → current: 641 unit tests / 4 E2E (+29 unit). Landed the `@team-x/intelligence` workspace package, the sqlite-vec vector store, and the embedding + retrieval primitives every later Phase 5 milestone (M29 / M30 / M31 / M33) builds on. Entry backfilled 2026-04-20 per M35 T7 follow-up; no code or test changes from the original 2026-04-13 shipping state.

#### Added
- **`packages/intelligence`** — new workspace package scaffold with `tsconfig.json` project reference wiring into the workspace build graph. Initial surface area is `@team-x/intelligence/rag`; M30 later adds `@team-x/intelligence/nlu` and M31 adds `@team-x/intelligence/loop` to the same package
- **Migration 0008 — sqlite-vec `embeddings` table** with composite index on company + source. Best-effort sqlite-vec extension load with a LIKE-distance fallback so sql-js unit tests continue to run without the native extension
- **Token-aware chunker** (`packages/intelligence/src/rag/chunker.ts`) — splits input into overlapping chunks with configurable chunk size and overlap. Prefers sentence boundaries over mid-sentence splits
- **Embedding pipeline** — `buildEmbedAdapter(providerRouter, settings)` returns an embedder that routes through the existing provider-router + privacy-tier filter from M18 + M19. Deterministic `createFakeEmbedAdapter` for tests — returns a reproducible pseudo-random vector derived from `sha256(text)` so test assertions can pin exact cosine values
- **Retriever** (`packages/intelligence/src/rag/retriever.ts`) — cosine-similarity query over the `embeddings` table with threshold and top-K gating. Below-threshold hits are discarded entirely, not returned with a flag — downstream consumers treat "no hits" and "no relevant hits" identically
- **Three clamped RAG settings keys** seeded in `settings.seedDefaults`: `rag_chunk_size`, `rag_chunk_overlap`, `rag_similarity_threshold`. Persisted via the existing key-value settings store; read through a new `settingsRepo.getRag()` helper mirroring the M19 runtime / privacy / concurrency shape
- **29 new unit tests** across the chunker (token-count determinism, overlap math, sentence-boundary preference, empty-input guard), embedding pipeline (batch happy path, provider-router integration, privacy-tier honoring, fake adapter determinism), and retriever (threshold gate, K cap, cosine math correctness, zero-hits empty return, sqlite-vec + LIKE-fallback parity) — lifts the unit baseline 612 → 641

#### Changed
- Settings key-value store gains `getRag()` / `setRag()` helpers alongside the existing M19 shape — M29's RagSection UI is a direct port of the existing RuntimeSection pattern
- Phase 5 design doc (`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`) §9 Milestone Breakdown — M28 status flipped `📋 Planned` → `✅ Complete`

---

## [1.0.0] — 2026-04-13

### M27 — Final Hardening + v1.0.0 (2026-04-13)

#### Added
- Playwright E2E `vault-backup.spec.ts` — vault upload, SHA256 integrity verification, backup create, backup list verification
- Ed25519 role-pack signature verification (`pack-signature.ts`) — keypair generation, archive signing, signature verification with 10 unit tests
- Security audit report (`docs/audits/2026-04-13-m27-security-audit.md`) — dependency audit, IPC input validation sweep, context isolation check, secrets handling review (all PASS)
- Phase 4 badge in top bar (replacing Phase 3)
- Version bump from 0.0.1 to 1.0.0 across all 6 packages
- 612 unit tests + 4 E2E specs passing

### M26 — Documentation + Landing Site (2026-04-13)

#### Added
- `README.md` — hero section, feature grid, architecture overview, tech stack table, quickstart, testing guide, privacy section
- `CONTRIBUTING.md` — development setup, coding standards, PR guidelines, role-pack contribution guide, IPC channel conventions
- `CHANGELOG.md` — all 27 milestones documented in Keep a Changelog format
- 7 user guide docs (`docs/user-guide/`) — getting started, hiring employees, managing projects, using the vault, configuring providers, backup and restore, keyboard shortcuts
- Static landing site (`docs/site/index.html`) — Tailwind CDN, dark theme, responsive layout, 9-feature grid, architecture diagram, tech stack badges, 3-step quickstart

### Documentation Suite Release (2026-05-03)

#### Added — Comprehensive Documentation (15,000+ lines, 50+ files)

**Getting Started & Onboarding**
- `docs/user-guide/getting-started/quick-start.md` — 15-minute setup walkthrough for new users, covering installation, workspace creation, first employee hire, first ticket creation, and first agent run
- `docs/user-guide/comprehensive-user-guide.md` — 500+ section master guide integrating all product documentation
- Video tutorial scripts (`docs/user-guide/video-scripts/README.md`) — Quick Start Walkthrough, Command Palette Deep-Dive, Multi-Workspace Operations scripts

**Reference Documentation**
- `docs/user-guide/faq.md` — 100+ frequently asked questions covering billing, security, employees, tickets, providers, workspaces, and troubleshooting
- `docs/user-guide/troubleshooting.md` — Solutions to common issues organized by category with advanced diagnostics section
- `docs/user-guide/glossary.md` — 200+ term glossary with definitions covering all Team-X terminology
- `docs/user-guide/keyboard-shortcuts.md` — Comprehensive power user navigation guide with platform-specific notes
- `docs/user-guide/cli-reference.md` — Command Palette and CLI tool reference with automation examples in Bash, Python, PowerShell

**Templates & Playbooks**
- `docs/user-guide/templates/handoff-document.md` — Operator transition template for shift handoffs
- `docs/user-guide/templates/meeting-agenda.md` — Structured meeting formats (Daily Standup, Sprint Planning, Retrospective, etc.)
- `docs/user-guide/templates/ticket-templates.md` — 10 common ticket types with pre-configured templates
- `docs/user-guide/templates/routine-templates.md` — 10 pre-configured automation routines
- `docs/user-guide/templates/README.md` — Templates overview and usage guide

**Developer Documentation**
- `docs/developer-guide/api-reference.md` — MCP server development, custom employee role definitions, REST API, webhooks, plugin system
- `docs/developer-guide/integration-guide.md` — GitHub/GitLab, Slack/Discord, Jira, Notion, and custom webhook integrations

**Advanced User Documentation**
- `docs/user-guide/migration-guide.md` — Switching from other AI workforce tools, migrating from Jira/Asana/Trello/Upwork
- `docs/user-guide/accessibility-guide.md` — WCAG 2.1 Level AA compliance, screen reader support, keyboard navigation

**AI Discovery & Indexing**
- `docs/llms.txt` — AI-optimized documentation index for LLM consumption with quick links and key concepts
- `docs/long-llms.txt` — Extended AI reference with comprehensive details for LLM systems

**Scenario Documentation**
- `docs/user-guide/scenarios/01-product-development-lifecycle.md` — Complete product development workflow
- `docs/user-guide/scenarios/02-cost-optimization-playbook.md` — Budget management and cost control
- `docs/user-guide/scenarios/03-failure-recovery-workflows.md` — Copilot-guided failure recovery
- `docs/user-guide/scenarios/04-cross-functional-collaboration.md` — Team coordination patterns
- `docs/user-guide/scenarios/05-autonomous-routine-governance.md` — Routine automation and oversight
- `docs/user-guide/scenarios/06-multi-workspace-operations.md` — Multi-client agency workflows
- `docs/user-guide/scenarios/07-shift-handoff-playbook.md` — Operator transition procedures

#### Documentation Statistics
- **Total Files Created:** 50+
- **Total Lines:** 15,000+
- **Categories:** 9 (Getting Started, Reference, Templates, Developer, Advanced, Scenarios, Video Scripts, AI Discovery, Migration)
- **Topics Covered:** 200+ glossary terms, 100+ FAQ items, 57 employee roles, 7 real-world scenarios, 20+ templates

#### Changed
- Documentation now organized under `docs/user-guide/` with clear categorization
- All docs include table of contents, cross-references, and code examples
- AI discovery files (`llms.txt`, `long-llms.txt`) enable LLM systems to understand Team-X architecture and features

---

## Phase 4 — Ship-Readiness

### M25 — Cross-Platform Installers (2026-04-13)

#### Added
- electron-builder configuration for Windows (NSIS), macOS (DMG), and Linux (AppImage + .deb)
- Placeholder app icons with `scripts/generate-icons.mjs` (256px + 512px PNG)
- macOS entitlements plist for keychain access
- `pnpm dist`, `dist:win`, `dist:mac`, `dist:linux`, `dist:publish` scripts
- `UpdaterService` — user-triggered update checks from GitHub Releases (zero phone-home)
- `updater.check` and `updater.install` IPC channels
- `UpdaterSection` in Settings with version info, release notes, download progress, and install button
- GitHub Actions release workflow (`release.yml`) — matrix build on `v*` tags with SHA256 checksums and draft releases
- 12 new tests (7 updater service + 5 handler tests)

### M24 — Audit Log UI (2026-04-13)

#### Added
- `AuditRepo` — read-only queries on the append-only events table with filters and aggregation
- `audit.list`, `audit.stats`, `audit.export` IPC channels
- `AuditView` — summary cards, event type filter chips, actor search, date range picker, expandable rows with payload JSON viewer, pagination
- CSV and JSON export of filtered audit events
- Audit tab enabled in the top bar navigation
- 16 new tests

### M23 — Backup/Restore (2026-04-13)

#### Added
- `BackupService` — WAL checkpoint + SQLite + vault directory archive with manifest.json
- Restore with manifest validation, orchestrator stop/restart, and data verification
- `backup.create`, `backup.restore`, `backup.list` IPC channels
- `BackupSection` in Settings with create, restore, and history UI
- 5 new tests

### M22 — Ticket Attachments (2026-04-13)

#### Added
- `ticket_attachments` linking table (migration `0007_ticket_attachments.sql`)
- `TicketAttachmentsRepo` with attach, detach, and list operations
- `tickets.attachFile`, `tickets.detachFile`, `tickets.listAttachments` IPC channels
- Attachment section in ticket detail panel with vault file picker
- 8 new tests

### M21 — File Vault (2026-04-13)

#### Added
- `file_vault` table with FTS5 full-text search (migration `0006_file_vault.sql`)
- Best-effort FTS5 initialization via `fts5-init.ts` (LIKE fallback for sql-js tests)
- `VaultRepo` and `VaultService` — SHA256 integrity, text extraction for markdown/txt/code
- `vault.upload`, `vault.download`, `vault.list`, `vault.search`, `vault.delete`, `vault.verify`, `vault.stats` IPC channels
- `VaultView` with file browser, search bar, detail panel, and Files tab
- 31 new tests

---

## Phase 3 — The Live Cockpit

### M20 — Demo + Hardening (2026-04-12)

#### Added
- Playwright E2E `meeting-flow.spec.ts` — call meeting, interject, end, verify minutes
- Updated smoke + ticket-flow E2E specs for Phase 3 badge
- 590 unit tests + 3 E2E specs passing

### M19 — Runtime Modes + Privacy (2026-04-12)

#### Added
- `SettingsRepo` — key-value store with `seedDefaults` for runtime configuration
- Hardware profiler — CPU, RAM, GPU detection (session-cached)
- Strategy picker — Auto/Hybrid/Always-On/Lean based on hardware and available providers
- Privacy tier types and constants (`PRIVACY_TIER_RANK`, `DEFAULT_CONCURRENCY_CAPS`, `STRATEGY_SLOTS`)
- `settings.getRuntime`, `settings.setRuntime`, `settings.getPrivacy`, `settings.setPrivacy`, `settings.getConcurrency`, `settings.setConcurrency` IPC channels
- `RuntimeSection`, `PrivacySection`, `ConcurrencySection` in Settings UI
- 530 unit tests passing

### M18 — Additional Providers (2026-04-12)

#### Added
- 7 new provider adapters: OpenAI, Google, Groq, OpenRouter, Together, Fireworks, OpenAI-compatible
- Provider factory extended with per-adapter `buildStream` and default models
- `ProvidersService` with add/update/remove and 6 disabled seed rows
- Environment key bootstrap for 7 new API keys
- `providers.list`, `providers.add`, `providers.update`, `providers.remove`, `providers.testConnection` IPC channels
- `ProvidersSection`, `ProviderCard`, `AddProviderDialog` in Settings UI
- 501 unit tests passing

### M17 — Telemetry Dashboard (2026-04-12)

#### Added
- 4 aggregate query methods on runs repo (companyStats, dailyUsage, employeeStats, costBreakdown)
- `telemetry.companyStats`, `telemetry.dailyUsage`, `telemetry.employeeStats`, `telemetry.costBreakdown` IPC channels
- Recharts integration for data visualization
- `TelemetryView` with Company, Employees, and Cost subviews
- Telemetry tab enabled
- 456 unit tests passing

### M16 — Meeting Primitive (2026-04-12)

#### Added
- `meetings` table and `companies.status` column (migration `0005_meetings.sql`)
- `MeetingsRepo` with CRUD and lifecycle management
- Per-company orchestrator pause/drain (`pauseCompany`/`resumeCompany`/`isCompanyPaused`)
- `MeetingService` — call, next turn, interject, end with minutes generation and action item extraction
- `meetings.call`, `meetings.end`, `meetings.interject`, `meetings.list`, `meetings.get` IPC channels
- `MeetingsView` with list panel, detail panel, call dialog, and composer
- Meetings tab enabled
- 441 unit tests passing

### M15 — Goals + Projects (2026-04-12)

#### Added
- `goals`, `projects`, `project_tickets` tables (migration `0004_goals_projects.sql`)
- `GoalsRepo` and `ProjectsRepo` with CRUD and progress calculation
- 12 new IPC channels (5 goals.*, 7 projects.*)
- Projects kanban board with 4-column drag-drop, project cards, detail panel, and create dialog
- Goals subtab with progress bars, goal rows, detail panel, and create dialog
- Projects tab enabled
- 412 unit tests passing

### M14 — Dashboard Subviews (2026-04-12)

#### Added
- 4 dashboard subviews: Timeline, Stream, Floor, Org embed
- Subtab navigation in Dashboard
- Top bar expanded to all 8 tabs
- `events.list` IPC channel with cursor-based pagination
- 384 unit tests passing

---

## Phase 2 — The Org

### M13 — Demo + Hardening (2026-04-11)

#### Added
- Playwright E2E `ticket-flow.spec.ts` — create, assign, agent reply round-trip
- Production build fix (`inlineDynamicImports` for ESM collision)
- 379 unit tests + 2 E2E specs passing

### M12 — Tickets + Kanban (2026-04-11)

#### Added
- `tickets` table (migration `0003_tickets.sql`) with 8 IPC channels
- 4-column kanban board (Open, In Progress, Blocked, Done) with drag-to-move
- Ticket detail panel with discussion thread
- `CreateTicketDialog` with priority and assignee selection
- Assigning a ticket triggers an orchestrator agent run

### M11 — Employee-to-Employee Messaging (2026-04-11)

#### Added
- Built-in tools: `send_message_to_colleague`, `list_colleagues`
- Orchestrator `enqueueAgentReply` with role-relative history mapping
- `is_agent_initiated` column for distinguishing bot-initiated threads
- `ThreadList` UI with amber bot icons and read-only agent thread viewing

### M10 — MCP Host + Tool Calling (2026-04-11)

#### Added
- `McpHost` singleton with stdio/SSE connection pool
- `tools_allowed`/`tools_denied` enforcement at host level
- `mcp_servers` and `tool_calls` tables
- Streaming tool-call support via `fullStream`
- 5 `mcp.*` IPC channels
- Default MCP seeds (Context7, Supabase)

### M9 — Org Chart + Hire/Fire/Promote (2026-04-11)

#### Added
- `org_edges` table with cycle detection
- `employees.fire`, `employees.promote`, `employees.setManager`, `orgchart.get` IPC channels
- Indented-list org tree UI with color-coded levels
- Drag-to-rearrange and "Reports to" manager selection in hire flow

### M8 — Role Pack System + 55 Roles (2026-04-11)

#### Added
- Role-loader with `listRoles()`, `listByLevel()`, `reload()`
- 55 F10-quality roles across 6 levels: Officer (5), Senior Management (7), Management (8), Supervisor (5), Lead (5), IC (25)
- Searchable hire dialog with level filter chips

### M7 — Multi-Company + Workspace (2026-04-11)

#### Added
- Company CRUD with soft-delete (archived_at)
- `WorkspaceSwitcher` and `CreateCompanyDialog`
- `CompanySettings` panel
- `mcp_configs_json`, `provider_prefs_json`, `max_concurrent_agents` columns on companies table

---

## Phase 1 — Skeleton

### M6 — Demo + Hardening (2026-04-07)

#### Added
- Playwright E2E `smoke.spec.ts` — full chat round-trip with test-mode provider
- CI e2e job (Ubuntu + xvfb)
- DevTools + will-quit shutdown fixes

### M5 — Renderer (2026-04-07)

#### Added
- Tailwind CSS + shadcn/ui dark theme
- Zustand + React Query state management
- IPC client hooks
- App shell: top bar, sidenav, content area
- Dashboard cards view with live token stream preview
- Chat drawer with streaming replies and composer
- Hire dialog, empty/loading/error states
- Inter + JetBrains Mono typography
- WCAG 2.1 AA accessibility pass

### M4 — Agent Runtime (2026-04-07)

#### Added
- Append-only event bus
- Slot-semaphore work queue
- `runAgent` with live streaming and persistence
- Orchestrator facade
- Anthropic + Ollama adapters via Vercel AI SDK
- `provider-factory` with keytar + privacy-tier fallback
- `role-loader` with directory scan and template rendering
- `employees.list`, `chat.send`, `chat.list` IPC channels
- Typed preload bridge (`window.teamx: TeamXApi`)
- Test-mode provider for Playwright E2E
- `smoke-chat.ts` script for manual Ollama verification

### M3 — Main Process + Database (2026-04-07)

#### Added
- Electron boot with context isolation
- SQLite + Drizzle ORM with migration-on-first-run
- Seed: Strategia-X company with CEO + Senior Fullstack Engineer
- `SecretsStore` backed by keytar
- `ProvidersService` seeding `ollama-local` + `anthropic`
- Dev `.env` to keychain bootstrap

### M2 — Shared Packages (2026-04-07)

#### Added
- `shared-types` — IPC contract types
- `role-schema` — role.md parser + template renderer
- `provider-router` — registry + streaming adapters (Anthropic + Ollama)
- `telemetry-core` — cost math

### M1 — Repository Foundations (2026-04-07)

#### Added
- pnpm workspace with monorepo structure
- TypeScript strict mode across all packages
- Biome for linting and formatting
- Vitest for unit testing
- GitHub Actions CI workflow

---

[Unreleased]: https://github.com/Git-Rocky-Stack/Team-X/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Git-Rocky-Stack/Team-X/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/Git-Rocky-Stack/Team-X/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Git-Rocky-Stack/Team-X/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Git-Rocky-Stack/Team-X/releases/tag/v1.0.0
