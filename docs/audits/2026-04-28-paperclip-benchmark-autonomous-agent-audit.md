# Team-X vs Paperclip Autonomous Agent Benchmark Audit

**Date:** 2026-04-28  
**Scope:** Team-X autonomous-agent runtime, orchestration, governance, portability, and recovery surfaces compared against Paperclip's public GitHub/docs plus the local Paperclip instance configuration on this workstation.  
**Primary objective:** identify the smallest high-value changes that make Team-X match Paperclip's strongest autonomous-agent primitives, then surpass them through Team-X's richer company, role, governance, and evidence stack.

---

## Executive Verdict

Team-X is not behind Paperclip on the "AI company operating system" concept. The current repo already has a serious company model: role packs, org hierarchy, tickets, goals, projects, routines, budget governance, approvals, artifacts, RAG/context packing, checkpoints, extension authority, MCP audit logs, portability, local backup/restore, and a mission-control dashboard.

Paperclip is sharper in the parts that make autonomous external agents feel operationally real:

1. a documented heartbeat contract every agent follows;
2. atomic task checkout and conflict behavior;
3. adapter packages that include execution, parsing, diagnostics, UI config, and CLI watching;
4. per-company runtime homes/workspaces for external agents;
5. encrypted secret references injected into runtime environments;
6. visible budget hard-stops tied directly to heartbeat execution;
7. import/export ergonomics around portable company templates.

The strategic answer is not to clone Paperclip. Team-X should add Paperclip-grade execution control underneath its existing enterprise operating model. The product wedge should become: **Paperclip-grade BYO-agent execution, plus Team-X-grade role accountability, evidence-grounded context, approvals, artifacts, copilot intelligence, and mission-control telemetry.**

---

## Evidence Base

### Paperclip public sources

- GitHub repo: <https://github.com/paperclipai/paperclip>
- Adapter overview: <https://paperclip.inc/docs/adapters/overview/>
- Heartbeat protocol: <https://paperclip.inc/docs/guides/agent-developer/heartbeat-protocol>
- Secrets management: <https://paperclip.inc/docs/deploy/secrets>
- Costs and budgets: <https://paperclip.inc/docs/guides/board-operator/costs-and-budgets>
- Import/export: <https://paperclip.inc/docs/guides/board-operator/importing-and-exporting>

### Local Paperclip configuration observed

The local Paperclip instance at `C:\Users\User\.paperclip\instances\default\config.json` is configured as:

- embedded Postgres at port `54329`;
- hourly backups with 30-day retention;
- private local server at `127.0.0.1:3100`;
- local disk storage;
- local encrypted secrets with a local master key;
- file logging under the instance logs directory.

The installed plugin manifest at `C:\Users\User\.paperclip\plugins\package.json` includes `@yesterday-ai/paperclip-plugin-company-wizard`. The instance also has per-company `codex-home` directories with isolated Codex cache/session/state files. Secret file contents were not inspected.

### Team-X source areas reviewed

- Runtime profiles and adapters:
  - [external-runtime-adapters.ts](../../apps/desktop/src/main/services/external-runtime-adapters.ts)
  - [runtime-profiles-service.ts](../../apps/desktop/src/main/services/runtime-profiles-service.ts)
  - [runtime-profile-provider-service.ts](../../apps/desktop/src/main/services/runtime-profile-provider-service.ts)
- Orchestration and agent loops:
  - [orchestrator/index.ts](../../apps/desktop/src/main/orchestrator/index.ts)
  - [orchestrator/queue.ts](../../apps/desktop/src/main/orchestrator/queue.ts)
  - [run-agent.ts](../../apps/desktop/src/main/orchestrator/run-agent.ts)
  - [agentic-loop-service.ts](../../apps/desktop/src/main/services/agentic-loop-service.ts)
- Work, memory, governance, and recovery:
  - [tickets.ts](../../apps/desktop/src/main/db/repos/tickets.ts)
  - [schema.ts](../../apps/desktop/src/main/db/schema.ts)
  - [budget-governance-service.ts](../../apps/desktop/src/main/services/budget-governance-service.ts)
  - [context-assembler-service.ts](../../apps/desktop/src/main/services/context-assembler-service.ts)
  - [context-packer-service.ts](../../apps/desktop/src/main/services/context-packer-service.ts)
  - [run-checkpoint-service.ts](../../apps/desktop/src/main/services/run-checkpoint-service.ts)
  - [company-portability-service.ts](../../apps/desktop/src/main/services/company-portability-service.ts)
  - [backup.ts](../../apps/desktop/src/main/services/backup.ts)

---

## What Paperclip Gets Right

### 1. Heartbeat as the agent contract

Paperclip's heartbeat protocol is a productized contract, not just an internal scheduler. On each wake, an agent identifies itself, checks approvals, lists assignments, picks work, checks out the task, loads context, does work, updates status, and delegates when needed.

The important design detail is not the word "heartbeat." It is that every runtime has a single lifecycle the operator can reason about: wake, claim, act, report, exit. That makes external Codex/Claude/Bash/HTTP agents auditable even when the runtime itself is outside the app.

### 2. Atomic checkout before work

Paperclip's docs emphasize checkout before work and a conflict response when another agent already owns the task. This is the biggest operational reliability gap to close. Without atomic checkout, multi-agent systems eventually duplicate work, overwrite progress, or leave stale in-progress state after a crash.

### 3. Adapters are packaged capabilities

Paperclip's adapter docs define adapters as runtime bridges with execution, parsing, testing, UI config, and CLI watch concerns. That is more complete than "run this command" or "POST to this URL." It lets the operator install and trust a runtime because diagnostics and transcript parsing ship with the adapter.

### 4. Secrets are references, not config literals

Paperclip stores sensitive runtime environment values as encrypted secret references and resolves them at execution time. Strict mode can block inline sensitive env keys. This is exactly the right direction for external agents because runtime profiles naturally want env vars.

### 5. Cost controls are tied to agent execution

Paperclip frames spend as token/cost events per agent heartbeat, with budget warnings and hard stops. Team-X has a deeper budget model, but Paperclip's story is easier to understand: when an agent reaches the hard limit, execution stops.

### 6. Portable company templates

Paperclip's import/export supports agents, projects, tasks, skills, adapter declarations, env inputs, dry-runs, collision handling, and GitHub sources. Team-X has strong portability internals now, but Paperclip's docs make the operator workflow more obviously productized.

### 7. Local deployment posture is explicit

The local config is explicit about embedded DB, backups, private bind address, storage, logging, auth mode, and secrets mode. This matters because autonomous agents need predictable recovery and local privacy boundaries.

---

## Team-X Current Strengths

### 1. Richer company operating model

Team-X already has role packs, employees, org edges, tickets, goals, projects, meetings, vault files, embeddings, events, copilot insights, command history, budgets, approvals, runtime profiles, routines, artifacts, operators, hosted invite provenance, and cloud-link seams in the schema. Paperclip's benchmark does not erase that progress; it highlights which runtime contracts need to become as strong as the domain model.

### 2. Strong internal orchestration

The orchestrator uses a FIFO work queue with concurrency slots, pause/resume semantics, live settings, cancellation, budget admission, run checkpoints, and company pause/resume. The agent run path streams provider output, records run state, and handles timeouts/cancellations.

### 3. Agentic loop with durable memory and grounded context

Team-X has an agentic-loop service with a system-agent, step streaming, tool execution, budget controls, checkpoints, thread digests, context packing, retrieval across tickets/goals/projects/vault/messages, and resume origin handling. This is a differentiator if paired with Paperclip-grade external runtime control.

### 4. Runtime profiles already exist

Team-X already models `teamx-internal`, `bash`, `http`, `codex`, `claude-code`, and `cursor` runtime profiles. The current execution layer supports command invocation and HTTP invocation through a normalized payload:

- `team-x-runtime-v1`;
- employee identity;
- system prompt;
- message history;
- prompt text;
- max steps;
- tool names.

This is a useful base. It is just not yet a full heartbeat/session/lease system.

### 5. Governance is deeper than Paperclip's public minimum

Team-X has budget policies, ledger entries, approval items, approval decisions, authority grants/requests, planner approvals, deliverable review categories, tool-call auditing, MCP authority, and operator memberships. That can surpass Paperclip if execution liveness becomes equally strong.

### 6. Portability is already broad

Team-X's package export includes company, employees, org, autonomy/runtime profiles, routines, budget policies, extensions, authority grants, skill assignments, goals, projects, tickets, and compatibility/redaction metadata. Sensitive-looking fields are redacted, import previews warn about redactions and compatibility, and imports remap IDs. This is a strong base for a Team-X template marketplace.

---

## Gap Matrix

| Area | Team-X today | Paperclip benchmark | Gap / risk | Priority | Recommendation |
|---|---|---|---|---|---|
| Runtime liveness | Runtime profiles have validation and command/HTTP execution. No durable runtime session or heartbeat table. | Heartbeat is the central external-agent lifecycle. | Operators cannot see whether an external runtime is alive, stale, busy, or orphaned. | P0 | Add runtime sessions + heartbeat service + stale-session reaper. |
| Atomic work ownership | Ticket assign updates assignee/status directly; no claim lease, conflict code, or run-owned checkout path. | Agents must checkout before work; conflicts stop duplicate work. | Multi-agent external execution can duplicate or stale-lock work. | P0 | Add `ticket_checkouts` or checkout fields with atomic claim/release and lease expiry. |
| Adapter maturity | Command and HTTP adapters produce provider-like streams, but adapter contract is thin. | Adapter packages include execution, parse, diagnostics, UI config, CLI watch. | Runtime support will sprawl per kind and be hard to validate. | P0 | Create an adapter registry contract with `execute`, `test`, `parse`, `buildConfig`, `formatEvent`. |
| Per-company runtime isolation | External command profiles can specify a working directory. Paperclip local instance has per-company Codex homes and workspaces. | Isolated execution workspaces and runtime state per company/agent. | External agents can bleed cache/session state or run in the wrong directory. | P0 | Add a runtime workspace manager that creates per-company/per-employee homes and passes env paths. |
| Runtime secrets | Providers keep API keys in keytar and portability redacts sensitive config fields. Runtime profile config can still carry arbitrary env-like fields. | Secret refs for agent env, optional strict mode. | External runtime profiles can drift into plaintext env configs. | P0 | Add first-class secret refs in runtime profiles and resolve at launch only. |
| Budget enforcement | Team-X has budget policies, ledger, approvals, hard-stop paths, and checkpoints. | Budget controls are visibly tied to agent heartbeat execution. | Strong backend, but the operator story should bind spend to runtime sessions and work claims. | P1 | Attach budget checks to session wake/checkout and show runtime-session spend. |
| Recovery | Orchestrator has timeout/stopped/budget/approval checkpoints; backup/restore exists. | Recovery handles orphaned runs and persistent agent state. | External runtime orphan recovery is not complete until sessions/checkouts exist. | P1 | Add stale heartbeat recovery, requeue rules, and run-session checkpoint summaries. |
| Routines | Team-X has routines that produce explicit work. | Heartbeats and routines wake assigned agents. | Strong concept, but recurring external-agent wake should use the same session contract. | P1 | Route due routines through checkout + runtime heartbeat/session wake. |
| Portability/templates | Team-X exports broad packages and redactions. | Paperclip exposes GitHub import/dry-run/collision workflows. | Team-X internals are strong, but operator install/import UX should be more marketplace-like. | P1 | Add GitHub source import, dry-run diff UI, and template install wizard. |
| Tool/action audit | Tool call audit table exists, MCP authority exists. | Paperclip advertises full tracing and immutable audit logs. | Team-X can surpass this if external runtime actions also emit tool/run artifacts. | P1 | Normalize external runtime logs, tool calls, artifacts, and cost events into the existing audit surfaces. |
| Health/doctor | Team-X has backup/validation surfaces, but no single autonomous-runtime doctor. | Paperclip has doctor/recovery workflow in local ops. | Support burden rises as external runtimes multiply. | P1 | Add Autonomy Doctor: DB, backup, runtime profile, secret refs, heartbeats, stale checkouts, workspace paths. |
| Mobile/private web control | Team-X is desktop-first. | Paperclip markets mobile-ready monitoring. | Not a core blocker, but remote supervision matters for 24/7 agents. | P2 | Add optional private local web or hosted bridge after runtime safety is complete. |
| Benchmarks/evals | Team-X has intelligence evals and many tests. | Paperclip repo exposes evals folder and public benchmark posture. | Team-X needs repeatable autonomy benchmark numbers. | P2 | Add scenario replay evals for task completion, cost, stale recovery, claim conflicts, adapter failures. |

---

## P0 Roadmap To Reach Paperclip-Grade Execution

### P0.1 Runtime sessions and heartbeat service

Add a durable session model for every external runtime execution.

Suggested tables:

- `runtime_sessions`
  - `id`
  - `company_id`
  - `employee_id`
  - `runtime_profile_id`
  - `adapter_kind`
  - `status` (`starting`, `idle`, `working`, `blocked`, `stale`, `offline`, `failed`)
  - `current_run_id`
  - `current_ticket_id`
  - `pid`
  - `endpoint_url`
  - `workspace_path`
  - `capabilities_json`
  - `last_heartbeat_at`
  - `lease_expires_at`
  - `created_at`
  - `updated_at`

- `runtime_heartbeats`
  - `id`
  - `session_id`
  - `company_id`
  - `employee_id`
  - `status`
  - `current_run_id`
  - `current_ticket_id`
  - `cost_delta_json`
  - `message`
  - `created_at`

Required service:

- `RuntimeSessionService.startSession(...)`
- `RuntimeSessionService.recordHeartbeat(...)`
- `RuntimeSessionService.markWorking(...)`
- `RuntimeSessionService.releaseSession(...)`
- `RuntimeSessionService.reapStaleSessions(...)`

Renderer surface:

- show runtime sessions on Mission Control and Autonomy > Runtimes;
- distinguish "validated config" from "live heartbeat";
- alert on stale sessions and orphaned claims.

Exit criteria:

- a Codex/Claude/Bash/HTTP employee can wake and appear as live;
- a stale runtime becomes visible without manual log inspection;
- stale sessions are marked and optionally requeued based on policy.

### P0.2 Atomic ticket checkout and leases

Team-X tickets currently support assignment and status changes, but not a run-owned checkout. Add an explicit claim before an agent begins work.

Suggested table:

- `ticket_checkouts`
  - `id`
  - `company_id`
  - `ticket_id`
  - `employee_id`
  - `runtime_session_id`
  - `run_id`
  - `status` (`active`, `released`, `expired`, `completed`, `blocked`)
  - `claimed_at`
  - `last_heartbeat_at`
  - `expires_at`
  - `release_reason`

Rules:

- Only one active checkout per ticket.
- Checkout is a transaction.
- Expired leases can be reclaimed by policy.
- Conflicts return a typed result, not a generic error.
- Agents cannot close or mark blocked unless they hold the active checkout or a supervisor override is present.

Exit criteria:

- two agents racing for the same ticket produce exactly one winner;
- the losing agent gets a deterministic conflict and picks another task;
- stale claims can be recovered without deleting ticket history.

### P0.3 Adapter registry v2

Promote external runtime adapters from inline command/HTTP branches into typed packages.

Suggested contract:

```ts
interface RuntimeAdapter {
  kind: RuntimeProfileKind;
  label: string;
  configSchema: ZodSchema;
  buildDefaultConfig(): Record<string, unknown>;
  test(profile: RuntimeProfile): Promise<RuntimeProfileValidation>;
  execute(input: RuntimeExecutionInput): AsyncIterable<RuntimeExecutionEvent>;
  parseOutput(raw: string): RuntimeExecutionResult;
  formatEvent?(event: RuntimeExecutionEvent): string;
}
```

First adapters:

- `teamx-internal`
- `bash`
- `http`
- `codex-local`
- `claude-code-local`
- `cursor-local`

Exit criteria:

- runtime profile validation uses adapter `test`;
- execution uses adapter `execute`;
- UI forms can be generated from adapter config metadata or a renderer adapter companion;
- transcript parsing is adapter-specific, not scattered in the provider bridge.

### P0.4 Per-company runtime workspace manager

Add a workspace manager responsible for paths, environment, and state isolation.

Suggested layout:

```text
<userData>/companies/<company-slug>/runtimes/<employee-id>/<runtime-kind>/
  home/
  workspace/
  logs/
  tmp/
```

For Codex/Claude-style tools, pass dedicated home/cache/session directories through environment variables where supported. For raw Bash, default `workingDirectory` should resolve to the managed workspace unless explicitly overridden and approved.

Exit criteria:

- each company gets isolated runtime homes;
- each employee/runtime profile gets a deterministic workspace path;
- portability redacts machine-local paths and import previews warn when profiles require reconfiguration.

### P0.5 Secret references for runtime profiles

Extend runtime profile config to support encrypted secret references.

Suggested shape:

```json
{
  "env": {
    "ANTHROPIC_API_KEY": {
      "type": "secret_ref",
      "providerId": "anthropic",
      "version": "latest"
    }
  }
}
```

Rules:

- runtime configs cannot store raw keys for fields ending in `_API_KEY`, `_TOKEN`, `_SECRET`, or `_PASSWORD`;
- migration/doctor should detect and optionally convert inline sensitive values;
- portability exports secret refs as missing-secret requirements, not literal values;
- strict mode should be available for shared/cloud mode.

Exit criteria:

- external runtime env is injected from keytar/main-process only;
- renderer never receives decrypted runtime secrets;
- export/import previews list missing secret requirements clearly.

---

## P1 Roadmap To Surpass Paperclip

### P1.1 Runtime-aware budget enforcement

Team-X budget governance is already strong. Tie it to runtime sessions:

- block wake if company/employee/runtime/routine budget is exhausted;
- warn on heartbeat at threshold;
- write budget-blocked checkpoints against the active checkout/run;
- show spend per runtime profile and per employee on Autonomy > Budgets.

This makes the backend governance model as easy to explain as Paperclip's budget story.

### P1.2 External runtime artifact pipeline

Every autonomous run should produce reviewable work products:

- logs/transcript;
- changed files or output refs;
- generated documents;
- test evidence;
- screenshots or deployment links;
- final summary;
- reviewer approval state.

Team-X already has artifacts and approvals. The improvement is to force external runtime runs to close through artifact evidence, not just ticket status.

### P1.3 Autonomy Doctor

Add a single operator health workflow for:

- DB integrity and migrations;
- backup age and restore drill status;
- runtime profile validation;
- missing secret refs;
- stale runtime sessions;
- stale ticket checkouts;
- workspace path availability;
- MCP server health;
- provider/model health;
- budget-policy blockers.

This should run from Autonomy and from a CLI script. It should output a JSON report so support/debugging is deterministic.

### P1.4 Template marketplace workflow

Team-X portability already exports more than enough data for templates. Add the operator workflow:

- import from local package;
- import from GitHub URL/shorthand/ref;
- dry-run with create/rename/skip/replace plan;
- missing secret wizard;
- template preview cards;
- install into local template library;
- one-click company creation from template.

Team-X can surpass Paperclip here by including roles, org chart, budgets, routines, runtime profiles, authority grants, skills, dashboards, and starter assets in one package.

### P1.5 External runtime audit normalization

Every adapter should emit normalized events:

- `runtime.session.started`
- `runtime.heartbeat`
- `runtime.checkout.claimed`
- `runtime.checkout.conflict`
- `runtime.execution.started`
- `runtime.execution.output`
- `runtime.execution.failed`
- `runtime.artifact.created`
- `runtime.session.stale`
- `runtime.session.recovered`

Map these into the existing event bus, MCP/tool-call log, run rows, artifacts, and mission-control telemetry.

---

## P2 Strategic Differentiators

### 1. Autonomy benchmark harness

Build repeatable scenarios that can be run against Team-X internal, Bash, HTTP, Codex, and Claude Code runtimes:

- single ticket claim and completion;
- two agents racing for one ticket;
- stale worker recovery;
- budget hard-stop before execution;
- budget hard-stop mid-run;
- missing secret failure;
- blocked-ticket delegation;
- artifact review approval;
- import template and run first routine;
- reboot/resume with existing checkpoint.

Report:

- success rate;
- duplicate-work rate;
- stale recovery time;
- cost;
- token count;
- latency;
- number of operator interventions;
- artifact completeness.

This turns "better than Paperclip" into measurable claims.

### 2. Adaptive runtime/model routing

Team-X has provider-router foundations. Use runtime benchmark data to route work:

- cheap local model for low-risk triage;
- stronger cloud model for planning/review;
- Codex/Claude external runtime for repository work;
- HTTP runtime for hosted bots;
- hard local-only policy for private company data.

### 3. Optional private operator web/mobile access

Paperclip markets mobile-ready monitoring. Team-X should not rush this before runtime safety, but after P0/P1 it should add optional private remote supervision:

- localhost-only by default;
- Tailscale/private tunnel guidance;
- read-only mobile mission control first;
- approval actions second;
- runtime launch/secret changes last.

### 4. Paperclip import bridge

If users are benchmarking directly against Paperclip, support migration:

- parse Paperclip company export folders;
- map agents to Team-X employees;
- map adapter configs to Team-X runtime profiles;
- map tasks/issues to Team-X tickets;
- map skills to Team-X extensions/skills;
- surface missing secrets and unsupported adapters.

This is a competitive wedge because it lowers switching cost.

---

## Implementation Sequence

### Slice A: Runtime session schema and service

Files:

- `apps/desktop/src/main/db/schema.ts`
- new migration under `apps/desktop/src/main/db/migrations/`
- new `apps/desktop/src/main/db/repos/runtime-sessions.ts`
- new `apps/desktop/src/main/services/runtime-session-service.ts`
- shared event and IPC types under `packages/shared-types/src/`

Tests:

- session create/update/heartbeat;
- stale session reaper;
- company scoping;
- event emission;
- renderer shape guards.

### Slice B: Ticket checkout leases

Files:

- `apps/desktop/src/main/db/schema.ts`
- `apps/desktop/src/main/db/repos/tickets.ts`
- new `apps/desktop/src/main/db/repos/ticket-checkouts.ts`
- `apps/desktop/src/main/services/agentic-tools-write.ts`
- `apps/desktop/src/main/orchestrator/index.ts`
- runtime adapter execution path.

Tests:

- two-claim race;
- idempotent same-run checkout;
- conflict return;
- expired lease reclaim;
- close/blocked requires active checkout;
- stale checkout requeue.

### Slice C: Adapter registry v2

Files:

- replace/extend `apps/desktop/src/main/services/external-runtime-adapters.ts`
- new `apps/desktop/src/main/services/runtime-adapters/`
- `runtime-profiles-service.ts`
- runtime profile renderer panels.

Tests:

- bash adapter validation/execution;
- HTTP adapter validation/execution;
- command stderr and non-zero exit parsing;
- endpoint errors;
- abort/cancel;
- usage parsing.

### Slice D: Workspace and secrets

Files:

- new `runtime-workspace-service.ts`
- `secrets.ts`
- `runtime-profiles-service.ts`
- `company-portability-service.ts`
- Autonomy runtime profile forms.

Tests:

- isolated path creation;
- path redaction in export;
- missing secret preview;
- strict-mode rejection;
- runtime env injection without renderer secret exposure.

### Slice E: Mission-control and Autonomy UX

Files:

- mission-control dashboard panels;
- Autonomy Runtimes panel;
- Autonomy Doctor panel;
- event-sync hooks.

Tests:

- stale runtime status;
- active checkout display;
- conflict event display;
- budget-blocked runtime display;
- missing secret callout;
- keyboard/focus states.

---

## Product Positioning Recommendation

Do not frame Team-X as "Paperclip but desktop." Frame it as:

> Team-X is the AI company operating system for accountable autonomous work: role-aware agents, governed runtimes, visible budgets, durable artifacts, and evidence-grounded decisions in one local-first command center.

The Paperclip-grade capabilities Team-X must absorb are the runtime mechanics: heartbeat, checkout, adapter contracts, workspace isolation, and secret refs. The Team-X advantages to preserve and amplify are:

- role accountability through the Strategia role pack;
- richer planning/delegation/review tools;
- RAG and checkpointed memory;
- governance and approval depth;
- local-first Electron desktop with no required hosted account;
- mission-control dashboard;
- broad company portability;
- auditable artifacts and tool calls.

---

## Success Metrics

Team-X can credibly claim parity or superiority when these are true:

1. An external Codex/Claude/Bash/HTTP employee can wake, claim one ticket atomically, work in an isolated workspace, emit heartbeats, report spend, create artifacts, and release the checkout.
2. Two agents racing for one ticket produce one active checkout and one deterministic conflict.
3. A killed external runtime becomes stale, is shown to the operator, writes a checkpoint, and can be safely recovered or requeued.
4. Runtime profile configs contain no plaintext secrets and exports produce clear missing-secret requirements.
5. Autonomy Doctor can identify stale sessions, missing secrets, broken adapters, old backups, and budget blockers in one report.
6. A Team-X package can export and re-import a company with employees, org chart, runtime profiles, routines, budgets, extensions, authority grants, skills, projects, tickets, and redactions.
7. The benchmark harness publishes scenario metrics across internal, Bash, HTTP, Codex, and Claude Code runtimes.

---

## Bottom Line

Paperclip's strongest advantage is not that it has an org chart, tickets, budgets, or a dashboard. Team-X already has those or richer equivalents. Paperclip's advantage is that its autonomous external-agent lifecycle is crisp and operator-readable.

Team-X should close that exact lifecycle gap first. Add durable runtime sessions, heartbeats, atomic checkouts, adapter packages, isolated workspaces, and secret refs. Then use Team-X's existing role/governance/context/artifact stack to exceed Paperclip on accountability and enterprise-grade operating discipline.
