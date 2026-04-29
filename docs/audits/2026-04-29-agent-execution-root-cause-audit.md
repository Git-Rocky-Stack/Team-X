# Team-X Agent Execution Failure — Root Cause Audit
**Date:** 2026-04-29
**Scope:** Why agents do not take charge, execute tasks, or work as a team despite MRR goals.
**Benchmark:** Paperclip.ai autonomous-agent lifecycle (wake → claim → act → report → exit).

---

## Executive Summary

Team-X has a world-class company operating system (roles, tickets, goals, budgets, governance, RAG, checkpoints, portability) and a comprehensive architectural audit against Paperclip already exists (`docs/audits/2026-04-28-paperclip-benchmark-autonomous-agent-audit.md`).

However, the **system-agent — the entity that runs the agentic loop — is explicitly designed to refuse all writes and autonomous action.** It is an advisor, not an operator. This is why setting an MRR goal produces zero execution: the agent has no authority, no execution tools in its role contract, and behavioral instructions that forbid action.

---

## Root Cause Evidence

### 1. The system-agent role card blocks all execution

File: `role-packs/strategia-official/roles/system/system-agent.md`

**`tools_allowed`** — only read-only query tools:
- `query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`

**`tools_denied`** — explicitly blocks coordination and action:
- `shell`, `filesystem_write`, `filesystem_read`, `network`, `send_message_to_colleague`, `list_colleagues`

**`decision_authority: advisory`** — the agent cannot make decisions, only advise.

**Mission directive** (lines 56–62):
> "You have no web access, no filesystem access, no shell access."
> "Request would require a write (hire, assign, delete) → Refuse cleanly."

**Result:** The agent can look at the org chart and tickets, but it cannot create tickets, assign work, message colleagues, write files, run commands, or take any action that changes state.

### 2. Write-side tools exist but the agent is told not to use them

File: `apps/desktop/src/main/services/agentic-tools-write.ts`

The code for autonomous execution exists:
- `decompose_project` — breaks a brief into scored subtasks
- `delegate_subtask` — creates a ticket, assigns it, links it to a project, queues an agent reply
- `review_deliverable` — reviews a completed ticket

The composition root (`apps/desktop/src/main/index.ts:1548`) wires these into the system-agent's tool registry because the system-agent's `level: 'system'` passes the level gate.

**But the system-agent's role card and system prompt instruct it to refuse writes.** The tools are physically present; the agent is psychologically blocked from using them.

### 3. No atomic checkout = no reliable multi-agent coordination

Paperclip's agents use a heartbeat protocol with atomic task checkout before work begins. Team-X has no `ticket_checkouts` table, no claim lease, no conflict resolution. Even if the agent were allowed to delegate, two agents could race for the same ticket, duplicate work, or leave stale in-progress state.

### 4. No runtime sessions = external agents are invisible

Paperclip gives every external runtime a durable session with heartbeats, status, and workspace isolation. Team-X has runtime profiles but no `runtime_sessions` table. An external Codex/Claude/Bash agent has no heartbeat, no lease, no stale-session reaper, and no operator visibility into whether it is alive or dead.

### 5. Delegation creates threads but does not guarantee execution

File: `apps/desktop/src/main/index.ts:1432–1507`

`delegate_subtask` creates a ticket thread and enqueues an agent reply via `orchestrator.enqueueAgentReply`. However:
- The assignee employee must have a configured provider/model to reply
- There is no guarantee the assignee will actually perform work (no checkout, no heartbeat, no execution contract)
- The delegated ticket sits in the queue waiting for a reply turn, but if the assignee is an external runtime with no session, nothing happens

---

## Why Paperclip Agents Execute and Team-X Agents Do Not

| Paperclip | Team-X |
|---|---|
| Heartbeat contract: wake → claim → act → report → exit | No heartbeat; one-shot ReAct loop per user query |
| Atomic checkout before work | Direct ticket assign; no lease or conflict handling |
| Adapter packages with execution, parsing, diagnostics | Thin command/HTTP adapters; no diagnostics or transcript parsing |
| Per-company runtime workspaces | Working directory only; no isolated homes |
| Encrypted secret refs injected at runtime | API keys in keytar; runtime config can carry plaintext env |
| Budget hard-stops tied to heartbeat execution | Budget policies exist but not bound to runtime sessions |
| Agent role allows action | System-agent role refuses writes and has advisory authority only |

---

## Immediate Fix Checklist (Do Today)

1. **Grant the system-agent write authority**
   - File: `role-packs/strategia-official/roles/system/system-agent.md`
   - Change `decision_authority` from `advisory` to `executive` (or a new authority level that allows autonomous action)
   - Add `decompose_project`, `delegate_subtask`, `review_deliverable` to `tools_allowed`
   - Remove `send_message_to_colleague` and `list_colleagues` from `tools_denied` (essential for team coordination)
   - Update the mission to authorize autonomous planning, delegation, and review

2. **Add team-coordination tools**
   - `send_message_to_colleague` — required for agents to communicate status, blockers, and handoffs
   - `list_colleagues` — required for agents to know who is available and capable
   - These are currently denied but are prerequisites for "working as a team"

3. **Ensure delegated tickets actually execute** ✅
   - `delegate_subtask` now checks `canResolveProvider(candidateId)` before selecting an assignee.
   - If a candidate has no configured/enabled provider, they are skipped and the fallback chain continues.
   - `WriteSideOrchestrator` gained `canResolveProvider(employeeId): Promise<boolean>`.
   - `main/index.ts` implements it via `runtimeProfileProviderService.resolveForEmployee`.
   - This prevents the silent drop where `selectNextDispatchable` throws on unconfigured employees and removes the task from the queue, leaving the ticket assigned but never worked.

---

## Strategic Fix Roadmap (This Week)

The existing `docs/audits/2026-04-28-paperclip-benchmark-autonomous-agent-audit.md` already maps these. Prioritize in this order:

### P0.1 — Runtime sessions and heartbeat service
- Tables: `runtime_sessions`, `runtime_heartbeats`
- Service: `RuntimeSessionService.startSession`, `recordHeartbeat`, `markWorking`, `releaseSession`, `reapStaleSessions`
- Without this, external agents are invisible and unrecoverable.

### P0.2 — Atomic ticket checkout and leases
- Table: `ticket_checkouts`
- Rules: one active checkout per ticket; transaction-based claim; conflict response; expired lease reclaim
- Without this, multi-agent delegation causes race conditions and duplicate work.

### P0.3 — Adapter registry v2
- Promote command/HTTP adapters into typed packages with `execute`, `test`, `parse`, `buildConfig`
- First adapters: `teamx-internal`, `bash`, `http`, `codex-local`, `claude-code-local`
- Without this, external runtime support will sprawl and be impossible to validate.

### P0.4 — Per-company runtime workspace manager
- Isolated paths: `<userData>/companies/<slug>/runtimes/<employee-id>/<kind>/`
- Without this, external agents bleed cache/session state across companies.

### P0.5 — Secret references for runtime profiles
- Runtime configs must use `{ type: "secret_ref", providerId: "...", version: "latest" }` instead of plaintext keys
- Without this, secrets leak into exports and renderer memory.

---

## Success Criteria for "Agents That Execute"

1. A user sets an MRR goal. The system-agent autonomously decomposes it into tickets, delegates them to employees, and reviews deliverables without user prompting.
2. Two agents racing for the same ticket produce one winner and one deterministic conflict.
3. A killed external runtime becomes stale, is visible to the operator, and can be safely recovered or requeued.
4. Runtime configs contain zero plaintext secrets.
5. The Autonomy Doctor reports all runtime health in one command.

---

## Bottom Line

Team-X does not have an architecture problem. It has a **permission problem.** The system-agent has been given the brain (ReAct loop, tool registry, provider router) and the muscles (write-side tools, orchestrator, event bus) but has been told to sit still and only answer questions.

The fastest path to Paperclip-grade execution is not to rebuild the engine. It is to **tear the "advisory only" tape off the system-agent and let it use the tools that already exist.**
