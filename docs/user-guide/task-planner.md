# Task Planner

The Task Planner is Team-X's write-side agentic surface. M31 gave the agentic loop six read-only query tools — it could observe your company state and ground answers in real data. M32 swaps that read-only registry for a **write-side set**: three tools that decompose a project into a tree of subtasks, delegate each subtask to the best-fit employee using a deterministic workload-scoring function, and review deliverables once tickets are closed. Same loop scheduler. Same `system-agent` seat. Same step-log palette UI. Different tools, real writes, an extra confirmation gate.

You don't trigger the planner directly. You ask the palette a write-shaped question — *"decompose the Q2 launch into tickets and assign owners"*, *"delegate the auth-rewrite subtask to whoever has bandwidth"*, *"review the design system audit and mark it approved"* — and the classifier routes to the agentic loop. The palette detects the write-side keywords and gates the dispatch behind an amber confirmation card before any ticket is created or any work is delegated.

## Overview

- **Decompose, delegate, review** — three write-side tools running on the M31 agentic-loop harness. Decomposition is the planner's job; delegation finds the best employee using a no-LLM scoring function; review closes the loop on a deliverable
- **Level-gated tool registry** — IC employees get the read-only tools only. Officers, Senior Management, and Management get `decompose_project`. Management, Supervisor, and Lead get `delegate_subtask` and `review_deliverable`. The system-agent (which runs `complex_request`) gets all three. Levels are checked at composition root, not in the prompt
- **Deterministic workload scoring** — `delegate_subtask` picks an assignee with a four-term scoring function (role-fit, load, availability, past performance) with locked weights. No LLM call, no non-determinism, fully auditable
- **Confirmation gates** — the palette shows an **amber** confirmation card for write-side runs (distinct from the **red** card destructive structured commands like `fire_employee` get). You see the rephrased intent and can Cancel before any write fires
- **Six new event types** on the append-only `events` bus (`plan.proposed`, `plan.approved`, `task.delegated`, `task.escalated`, `review.requested`, `review.completed`) plus three new step-card kinds in the palette (`ticket_created`, `delegation_made`, `review_pending`)
- **Honors every existing invariant** — provider router is the only LLM touch-point, orchestrator is the only scheduler, append-only event stream, zero phone-home, OS keychain for secrets

## When the Planner Triggers

The classifier routes to the agentic loop on the same `complex_request` path M31 documented. The Task Planner is what runs *inside* that loop when:

1. The actor is a **planner-eligible employee** (Officer / Senior Management / Management for decomposition; Management / Supervisor / Lead for delegation and review). The hidden `system-agent` is always planner-eligible — it has every tool
2. The user's prompt contains **write-side keywords** — *decompose*, *delegate*, *create tickets*, *assign owners*, *review*, *approve*. The palette detects these client-side and surfaces the amber gate before dispatching

The loop itself is the same `createAgenticLoop` factory M31 ships. The only difference is the tool set the composition root injects when it builds the registry per run.

| Example Prompt | Route | Gate |
|----------------|-------|------|
| "Decompose the Q2 launch project into tickets" | Agentic loop with planner tools | Amber write-side confirmation |
| "Delegate ticket #127 to whoever has the lowest open-ticket count" | Agentic loop with planner tools | Amber write-side confirmation |
| "Review the design system audit and approve it" | Agentic loop with planner tools | Amber write-side confirmation |
| "Why is the frontend team behind?" | Agentic loop with read-only tools (M31) | None — read-only |
| "Fire Sarah Chen" | Structured (`fire_employee`) | **Red** destructive confirmation |
| "Hire a senior backend engineer" | Structured (`hire_employee`) | None |

The amber and red gates are intentionally different. The amber gate says *"this is going to write to your org — confirm intent"*. The red gate says *"this is destructive and irreversible — confirm intent"*. Neither bypasses the other.

## Reading the Step Log

The palette's step-log mode (introduced in M31) gains three new card kinds for write-side activity. They render with the same `data-step-kind` attribute selector surface as the M31 cards, so the same E2E and tooling patterns apply.

| Step kind | Meaning | Card content |
|-----------|---------|--------------|
| `plan` | The agent's reasoning about the next step | Free-form text |
| `tool_call` | The agent is calling one of the planner tools | Tool name (`decompose_project` / `delegate_subtask` / `review_deliverable`) + arguments JSON |
| `tool_result` | The tool's `{rows, truncated}` envelope or write-result payload | Full envelope, summarized |
| `ticket_created` | A new ticket landed in the DB (emerald accent, `Ticket` icon) | Title + assignee handle + plan reference |
| `delegation_made` | An employee was assigned to a subtask (sky accent, `GitBranch` icon) | Assignee name + plan reference |
| `review_pending` | A `review_deliverable` call was scored (amber/red/emerald per outcome) | Outcome + ticket ref + reviewer handle |
| `answer` | The final summary paragraph from the loop | Multi-paragraph markdown |
| `error` | Budget exhausted, timeout, canceled, provider error, or tool error | Reason code + detail |

The palette transitions through the same six states as the M31 read-side loop (`idle` / `streaming` / `complete` / `canceled` / `error` / `stopped`). Click **Open Thread** in any terminal state to jump to the persisted transcript on the `system-agent` Copilot Conversations sidebar.

## The Three Write-Side Tools

| Tool | Required level | What it does |
|------|----------------|--------------|
| `decompose_project` | Officer, Senior Mgmt, Management, system-agent | Takes a goal or project brief and returns a proposed subtask tree. Each subtask carries a recommended assignee derived from `delegate_subtask`'s scoring function. Subject to `planner_max_tickets` and `planner_max_depth` clamps |
| `delegate_subtask` | Management, Supervisor, Lead, system-agent | Creates an actual ticket and assigns it to a specific employee (or to the highest-scoring candidate from the workload-scoring function). Records the assignment as a `task.delegated` event. Tracks delegation attempts per subtask — after `planner_escalation_threshold` failed delegations, the subtask is escalated up the org chart |
| `review_deliverable` | Management, Supervisor, Lead, system-agent | Marks a closed ticket as approved or rejected with a freeform reviewer note. A reject pushes the ticket back to `in-progress` and records a `review.completed` event with `outcome: 'reject'`. Three rejects in a row escalate the deliverable per the same threshold |

Every tool returns a JSON-safe envelope. `decompose_project` returns the proposed tree before any tickets are created — the loop typically calls `delegate_subtask` per leaf subtask in the next steps to actually file the work. `delegate_subtask` and `review_deliverable` are both write-on-success: the DB row lands before the tool returns, and the bus event fires inside the same transaction boundary.

## Workload Scoring

`delegate_subtask` picks the best-fit employee using a deterministic four-term function (no LLM call):

```
score(employee, subtask) =
  0.4 * role_fit(employee.role, subtask.type)        // 0–1, keyword heuristic over title + level
+ 0.3 * (1 - load_ratio(employee))                   // 0–1, open tickets / max capacity
+ 0.2 * availability(employee)                        // 0 or 1, not in meeting + not archived
+ 0.1 * past_performance(employee, subtask.type)     // 0–1, completion-speed percentile
```

The weights are locked in `apps/desktop/src/main/services/agentic-tools-write.ts` and verified in 25 unit tests. Sum-to-1.0 is asserted at boot. Archived, fired, and system employees score zero across the board (so the tool never surfaces them).

**Role-fit** is currently a keyword heuristic (engineer → implement, designer → design, manager → coordinate, etc.) with a baseline floor for unmatched roles. This is intentional — the design doc records it as Risk #2 option (b) — and will be replaced with role.md `capabilities` frontmatter in M33 or M34. **Past performance** falls back to 0.5 for employees with no completed agentic-runs of the same type, so newly hired employees aren't penalized.

The scoring function is exposed in the `decompose_project` tool's projected `recommendedAssigneeId` field for each leaf subtask, so the loop can preview assignments in the plan before any ticket lands.

## Settings

Four new keys live in **Settings → Runtime → Task Planner**:

| Key | Default | Range | Meaning |
|-----|---------|-------|---------|
| `planner_max_tickets` | 10 | 1–50 | Hard cap on tickets a single `decompose_project` call can propose. Exceeded subtasks are dropped before return |
| `planner_max_depth` | 2 | 1–4 | Max nesting depth of the subtask tree. Depth 1 = flat list, depth 2 = subtasks-of-subtasks, depth 4 = deep hierarchy |
| `planner_approval_level` | `'management'` | `officer` / `senior-mgmt` / `management` / `supervisor` / `lead` | Min level required to auto-approve a `decompose_project` proposal. Below the threshold the proposal is surfaced for human review |
| `planner_escalation_threshold` | 3 | 1–10 | Number of delegation failures (or rejects) before the subtask escalates up the org chart |

All four are clamped server-side on write — the UI surfaces inline validation errors, and the main process re-validates regardless. Changes take effect on the next agentic-loop run; in-flight runs use the snapshot at `start()` time.

### Choosing budgets for your hardware

- **Small org (< 10 employees)** — defaults work. Most decomposition runs propose 3–6 subtasks regardless of cap
- **Mid-sized org (10–50 employees)** — bump `planner_max_tickets` to 20 and `planner_max_depth` to 3 if you regularly decompose multi-team projects. The loop will use more `delegate_subtask` calls before converging
- **Large org (50+ employees)** — workload scoring scales linearly with employee count. The 50-row cap on `query_employees` (M31) means the loop may need multiple `query_employees` calls to find the best assignee — bump `agentic_max_steps` (M31 setting) to 12–16 alongside `planner_max_tickets`
- **Tight quality bar** — set `planner_approval_level` to `senior-mgmt` so only Officers and Senior Management can auto-approve. Everyone else's `decompose_project` calls surface as `plan.proposed` events for human review before any ticket is filed

## Confirmation Gates

The palette has two confirmation gates. Both render before any write fires.

### Amber gate — write-side

Triggered when the classifier returns `complex_request` and the prompt contains write-side keywords (case-insensitive regex over the verbs *decompose*, *delegate*, *create tickets*, *assign owners*, *review*). The card shows:

- The rephrased intent (e.g. *"Confirm write-side agentic run: decompose the frontend redesign into tickets"*)
- A Cancel button (closes the palette, no write fires)
- A Confirm button (dispatches the loop with `confirmed: true`)

The gate is bypass-able only via the `skipConfirmation: true` flag on `command.execute` — currently used only by M33 Copilot's pre-approved actions. Manual palette use never sets this flag.

### Red gate — destructive

Triggered for the four destructive structured intents (`fire_employee`, `close_ticket`, `end_meeting`, `promote_employee`). Same shape as the amber gate but red, with stricter copy ("Confirm destructive action — this cannot be undone"). The amber and red gates never both fire in the same palette session — the classifier dispatches to one path or the other.

The `task-planner.spec.ts` E2E spec asserts the amber gate fires AND that the red destructive gate is *absent*, guarding against any future mis-routing where a write-side run gets the more aggressive copy.

## Privacy and Runtime

The Task Planner inherits every invariant the rest of the loop honors:

- **Provider router is the only LLM touch-point** — the loop's `decompose_project` calls run on whatever provider the actor (typically the `system-agent`) is configured for. With Ollama at the Local privacy tier, no decomposition data leaves your machine
- **Orchestrator is the only scheduler** — the pause-aware wrapper from M31 still applies. Calling a meeting mid-decomposition pauses the loop's provider calls until the meeting ends; tickets are not created behind a meeting
- **Append-only event stream** — every write surfaces six event types (`plan.proposed` / `plan.approved` / `task.delegated` / `task.escalated` / `review.requested` / `review.completed`) on the bus. They show up in the **Audit** tab with planner-aware chips and per-event payload summaries (subtask count, assignee, outcome, escalation reason)
- **Cross-company isolation** — the loop's actor resolution rejects any `employeeId` that does not belong to the requested `companyId`, so a planner run can never write to another workspace
- **Zero phone-home** — same posture as the rest of the app

## Example Run

Input (typed into `Cmd+K`): *"Decompose the frontend redesign into tickets"*

Step-by-step (a typical 7-step run with the canned test seam):

1. **plan** — "I'll decompose this into ~5 leaf subtasks: design tokens, layout primitives, navigation, content components, and accessibility audit. I'll use `decompose_project` to propose the tree and recommend assignees, then delegate each leaf in turn."
2. **tool_call** — `decompose_project({ projectId: 'proj-frontend-redesign', maxTickets: 10, maxDepth: 2 })`
3. **tool_result** — `{ planId: 'plan-test-1', subtasks: [{ id: 'st-1', title: 'Design tokens', recommendedAssigneeId: 'emp-test-swe', score: 0.84 }, …], truncated: false }`
4. **tool_call** — `delegate_subtask({ planId: 'plan-test-1', subtaskId: 'st-1', assigneeId: 'emp-test-swe' })`
5. **tool_result** — `{ ticketId: 'tkt-test-1', assignee: 'Mateo Reyes', status: 'open' }`
6. **(more delegate_subtask + tool_result pairs per leaf)**
7. **answer** — "Decomposed the frontend redesign into 5 subtasks and delegated each: Mateo Reyes owns design tokens (#tkt-test-1), Priya Singh owns layout primitives (#tkt-test-2), Lin Yu owns navigation (#tkt-test-3), Asha Mensah owns content components (#tkt-test-4), and Jordan Park owns the accessibility audit (#tkt-test-5). All five tickets are open and assigned. Plan id: plan-test-1."

Every claim is grounded in a tool result. The bracketed citation reflects ticket IDs the loop actually created. The palette step log shows two `tool_call` cards for `decompose_project` + 5 `tool_call` cards for `delegate_subtask`, plus the corresponding `ticket_created` and `delegation_made` cards rendered in the new step-card variants.

## Troubleshooting

**"The amber confirmation card never appeared — my prompt went straight through."** The keyword heuristic in `command-service.ts` only catches phrases containing one of the locked write-side verbs (*decompose*, *delegate*, *create tickets*, *assign owners*, *review*). A free-form complex request that *implies* writes ("clear all the open auth tickets") will not trigger the amber gate — it routes to the M31 read-side loop. If you want a hard gate on every complex_request, file an issue and we'll widen the heuristic. The destructive structured intents (`fire`, `close`, `end-meeting`, `promote`) still get the red gate.

**"`decompose_project` proposed only 3 subtasks even though I asked for 10."** The `planner_max_tickets` setting is a *cap*, not a target. The LLM proposes whatever subtask count it judges appropriate; the cap only kicks in if it tries to exceed the limit. If you want larger decompositions, give the prompt more concrete scope ("decompose into 8–10 leaf subtasks" or "produce a depth-3 plan with subtasks of subtasks").

**"`delegate_subtask` keeps assigning everything to the same employee."** Workload scoring weighs role-fit at 40% and availability at 20%, so an employee whose title matches the subtask type AND who is not in a meeting will dominate small orgs. Bump the load weight by lowering role-fit influence — currently the weights are locked at 0.4/0.3/0.2/0.1 and require a code change. As a quick fix, mark the over-assigned employee as in a meeting (or temporarily archive them) so `availability(employee)` returns 0 and the next-highest-scoring employee wins the round.

**"All employees scored 0 in the workload-scoring trace."** Three reasons: every employee is `archived` or `fired` (check the org chart), every employee is `is_system = 1` (only the system-agent exists in this company — hire someone), or the role-fit heuristic returned 0 across the board (the subtask type doesn't match any title keyword). Check the `task.delegated { score: 0 }` payload in the Audit tab for the offending subtask.

**"My `decompose_project` returned a `truncated: true` envelope."** The plan exceeded `planner_max_tickets`. Trailing subtasks were dropped before return. Either bump the setting or rephrase the prompt to ask for fewer leaves up front — the loop almost never re-queries with a higher cap on its own.

**"A subtask escalated and I don't know why."** Three failed delegations (or three consecutive rejects on the same review) trigger an escalation. The `task.escalated` event payload includes the reason (`fallback_chain_exhausted` / `repeated_rejects`) and the original subtask. Filter the Audit tab on `task.escalated` and expand the row for the full payload.

**"I got `agentic.failed { reason: 'budget_exhausted' }` mid-decomposition."** The M31 step / token / wall-clock budgets apply to the planner runs too. Decomposition runs that fan out into many `delegate_subtask` calls burn the step budget faster than read-only Q&A runs. Bump `agentic_max_steps` to 16 and `agentic_max_tokens` to 16000 in Settings → Runtime → Agentic Loop for large decompositions.

**"The amber gate shows but Confirm dispatches a destructive run anyway."** The gate's `gateKind` field is part of the `needs_confirmation` response shape. If the palette ever rendered the amber color but submitted a destructive intent, that's a `command-service.ts` regression — file it. The `task-planner.spec.ts` E2E spec asserts the gate kind explicitly to guard against this.

**"The Copilot Conversations thread shows the planner run, but my dashboard kanban hasn't updated."** Known regression class — IPC channels that mutate state must emit a bus event (architectural invariant #11). The `task.delegated` event triggers ticket-list invalidation in `use-ticket-list.ts`. If the kanban is stale, the bus event likely didn't fire (check the Audit tab — if the event row exists, the renderer-side cache is the bug; if not, the tool implementation didn't emit). Refresh the dashboard or switch tabs and back as a workaround.

**"How do I stop a planner run mid-decomposition?"** Same as M31 — click **Cancel** in the streaming palette state. The `command.stop` IPC channel fires the `AbortController`. Already-created tickets stay (writes are not rolled back), but no new tickets are created after the abort. The terminal step is `error { reason: 'canceled' }` and `agentic.failed { reason: 'canceled' }` fires on the bus.

**"Can I write my own planner tool?"** Not yet. The three tools are main-process closures over existing repos with hard-coded level gates — intentionally built in, not plugin-loaded, so they bypass the MCP host and can't accidentally spawn external write paths. Phase 6 may revisit a tool plugin model with signed-pack semantics.

## Privacy

Everything the planner touches is already in your Team-X database. The three planner tools read employees, tickets, projects, and runs metadata from local repos and write tickets back to the same database — none of which leaves your machine except via LLM provider calls, which are bounded by your privacy tier.

If your max privacy tier is `local`, the entire planner runs on Ollama. Zero network traffic, zero cloud dependencies, zero phone-home. If you allow `proprietary-cloud`, the loop may route `decompose_project`'s prompt-and-response through Anthropic / OpenAI / Google depending on your configured providers — in which case the project description, employee names, and final ticket titles transit those APIs. The provider-router enforces the privacy filter at call time.

The audit log persists every plan, every delegation, and every review. If you need to purge a sensitive run, delete the thread row — the `events` table is append-only, but the thread-level surface is editable. True forensic purging of the underlying audit events requires a database-level operation outside the UI.
