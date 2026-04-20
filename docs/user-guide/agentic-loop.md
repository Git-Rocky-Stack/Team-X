# Agentic Loop

The Agentic Loop is Team-X's answer to questions the command palette's deterministic intents can't handle. When you type something conversational, multi-hop, or analytical into `Cmd+K` — *"why is the frontend team behind?"*, *"summarize what the CEO did this week"*, *"who should I assign the auth bug to?"* — the classifier routes it to the agentic loop, which plans, calls read-only org tools, observes the results, and iterates until it produces a grounded multi-paragraph answer citing specific tickets, employees, and events.

You don't trigger the loop directly. You just ask the palette a real question.

## Overview

- **Free-form, grounded answers** — not a chatbot, not a generic LLM summary. The loop reads your live company state through six read-only query tools, so every claim is anchored in real data
- **ReAct scheduling** — the loop plans, acts (calls a tool), observes the result, and iterates. You see each step stream in live as a labeled card in the palette
- **Hard budgets** — every run terminates deterministically: either it hits a grounded answer or it exhausts step / token / wall-clock budgets (defaults 8 steps / 8000 tokens / 120 seconds, all configurable)
- **Persisted thread** — every run writes to a dedicated thread on a hidden `system-agent` pseudo-employee. Threads live in the new "Copilot Conversations" section of the chat sidebar. You can close the palette and come back to the transcript later
- **Cancellable** — the palette's Cancel button aborts an in-flight run via `AbortController`; the terminal step is recorded as `canceled` and the audit log captures the abort
- **Local-first** — the loop runs on whatever provider your company has configured. With Ollama at the Local privacy tier, nothing leaves your machine. Invariant #7 stands

## When the Loop Triggers

The classifier routes to the agentic loop on two paths:

1. **`complex_request` intent** — anything that isn't one of the 14 structured intents (`hire_employee`, `fire_employee`, `assign_ticket`, etc.). Multi-hop questions, free-form analysis, anything with "why" / "how" / "summarize" / "compare" / "explain"
2. **Low-confidence fallback** — if any classification lands below the 0.5 confidence threshold, the palette falls back to `complex_request` instead of surfacing an "I don't understand" error

| Example Prompt | Route |
|----------------|-------|
| "Hire a senior backend engineer" | Structured (`hire_employee`) — direct IPC call |
| "Fire Sarah Chen" | Structured (`fire_employee`) — destructive gate |
| "Why is the mobile team shipping slower than the web team this quarter?" | Agentic loop |
| "Summarize the Q2 launch project so far" | Agentic loop |
| "Who has the most open tickets and why?" | Agentic loop |
| "What did the CEO work on last week?" | Agentic loop |
| "Are any meetings overdue for minutes?" | Agentic loop |
| "Compare cost across providers since Monday" | Agentic loop |
| "Find blockers across all projects" | Agentic loop |
| "Which role should I hire next, given current tickets and team composition?" | Agentic loop |

The palette shows the classified intent and confidence before dispatching. If the agentic loop isn't what you wanted, press `Esc` and rephrase with a structured verb (`hire`, `fire`, `assign`, `create`, `close`, `call`, `end`, `show`, `find`).

## Reading the Step Log

When the loop starts, the palette switches from classification view to **step-log mode**. Each loop step appears as a card in the order the loop produced it.

| Step kind | Meaning | Card content |
|-----------|---------|--------------|
| `plan` | The agent's reasoning about what to do next | Free-form text — the agent's internal monologue |
| `tool_call` | The agent is calling one of the 6 read-only query tools | Tool name (`query_employees`, `query_tickets`, etc.) + arguments JSON |
| `tool_result` | The tool returned data from the repo | `{rows, truncated}` envelope — rows are row previews with a 200-char summary cap per row; `truncated: true` means the result hit the 50-row cap |
| `answer` | The final grounded answer | Multi-paragraph markdown, rendered inline |
| `error` | Something went wrong (budget, timeout, provider error, tool error) | Reason code (`budget_exhausted`, `timeout`, `canceled`, `provider_error`, `tool_error`) + detail |

Each card has a footer showing the provider, model, and token count for that step. The selector surface in the DOM uses stable `data-step-kind` attributes — convenient if you want to script against the palette in your own tooling.

### Palette States

The step-log panel has six states. Only one is active at a time.

| State | Trigger | What you see |
|-------|---------|--------------|
| `idle` | Palette just opened on `complex_request` | Spinner + "Thinking…" placeholder |
| `streaming` | Loop is mid-run | Live cards appearing in sequence + Cancel button + step counter (e.g. "Step 3 of 8") |
| `complete` | `agentic.completed` event fired | All cards + Open Thread button + Close button |
| `canceled` | User clicked Cancel | Cards shown up to abort point + "Canceled" banner + Open Thread button |
| `error` | `agentic.failed` with reason other than `canceled` | Cards + red banner with reason code + Open Thread button |
| `stopped` | Unexpected termination (provider disconnect mid-stream) | Partial cards + "Stopped" banner + Open Thread button |

In every terminal state you can click **Open Thread** to jump to the persisted transcript in Copilot Conversations — useful when you want to copy-paste the grounded answer, dig into a specific tool result, or reference the run later.

## The System-Agent

The agentic loop runs on a hidden pseudo-employee called the **system-agent**. It is not a normal hire:

- Exactly **one per company**, seeded on first boot via `ensureSystemAgent(companyId)`
- **Not visible** in the employee list, org chart, hire dialog, fire dialog, or delegation pickers
- Appears as the owner of every `complex_request` thread, rendered under a dedicated **Copilot Conversations** section in the chat sidebar
- Identified by a Sparkles icon and a robot badge — distinct from regular employees
- Thread compose box is **read-only** — you can't reply to a transcript. Start a new complex_request via `Cmd+K` to continue a line of inquiry

Thread rows in Copilot Conversations show the first line of the prompt. The drawer view renders the full step transcript followed by the grounded answer. Older threads accumulate — use the thread search or the audit log to find a specific run.

The system-agent uses its own role card at `role-packs/strategia-official/roles/system/system-agent.md`. Like every other role, it supports user customization — override the frontmatter or extend the body prompt for your own voice. The system-agent's `level` is purely internal bookkeeping; it has no effect on org chart or delegation math (it is filtered out of both).

## The Six Read-Only Tools

The agentic loop gets access to six read-only query tools, each wrapping an existing main-process repo with a JSON-safe projection. No writes. No deletes. No tickets created, no employees hired, no meetings called — that's M32 (Task Planner), not M31.

| Tool | Reads | Typical use |
|------|-------|-------------|
| `query_employees` | Active employees (with `is_system = 0` filter) | "Who is on the engineering team?", "What's the CEO's background?" |
| `query_tickets` | Tickets filtered by status, priority, assignee, project | "Which tickets are blocked?", "What's Sarah working on?" |
| `query_projects` | Projects with linked ticket counts and lead assignments | "Status of the Q2 launch project", "Which projects have no lead?" |
| `query_meetings` | Past and active meetings with summaries and action items | "What did we decide in last week's all-hands?", "Any meetings still open?" |
| `query_vault` | Vault files (FTS5 search when available) | "Find the API spec", "Is there documentation on onboarding?" |
| `query_events` | Append-only event log (chat, ticket changes, meetings, commands, runs) | "What happened overnight?", "Recent agent activity by provider" |

Every tool returns a `{rows, truncated}` envelope. The loop caps results at 50 rows per call — if `truncated: true`, the agent typically re-queries with narrower filters on the next step. Per-row payloads are summarized to 200 characters with ellipsis, so a single tool call can't flood the token budget.

## Settings

Three new keys live in **Settings → Runtime → Agentic Loop**:

| Key | Default | Range | Meaning |
|-----|---------|-------|---------|
| `agentic_max_steps` | 8 | 1–32 | Hard cap on loop iterations. Each of plan / tool-call / tool-result / answer counts as a step. Exhausted → `agentic.failed { reason: 'budget_exhausted' }` |
| `agentic_max_tokens` | 8000 | 500–50000 | Cumulative token budget across all provider calls in the run (prompt + completion, summed per step) |
| `agentic_timeout_ms` | 120000 | 10000–600000 | Wall-clock deadline from `start()` to termination. Exceeded → `agentic.failed { reason: 'timeout' }` |

All three are clamped server-side on write — the UI surfaces inline validation errors, and the main process re-validates regardless. Changes take effect on the next `start()` call; in-flight runs are not re-budgeted mid-run.

### Choosing budgets for your hardware

- **Local Ollama, 7–8B model** — bump `agentic_max_steps` to 12–16. Small models burn the step budget on malformed tool-call parsing (the loop grants one nudge-retry per malformed step and then counts the step). Keep `agentic_timeout_ms` at 120s or higher; first-call latency is noticeable while the model stays warm
- **Local Ollama, 14B+** — defaults work well. Most runs terminate in 4–6 steps
- **Cloud provider (Anthropic / OpenAI / Google)** — defaults are fine. You're bottlenecked by network, not token budget; cloud models rarely malform tool calls and typically finish in 3–5 steps
- **Investigative questions** ("audit last month's spending", "map every blocker across 20 projects") — bump `agentic_max_tokens` to 20000–30000 and `agentic_max_steps` to 16. The loop will use more tools before converging

## Stopping a Run

The palette's **Cancel** button (visible in the `streaming` state) fires the `command.stop` IPC channel, which aborts the run's `AbortController`. The next loop step — whether mid-provider-call or mid-tool-call — emits `{ kind: 'error', reason: 'canceled' }` and the run terminates with status `canceled`.

The `agentic.failed` bus event fires with `reason: 'canceled'`. The audit log records the abort. The persisted thread retains every step up to the abort point. You can re-ask by pressing `Cmd+K` again — there's no re-use of the previous state.

You can also close the palette with `Esc` while a run is streaming. The loop continues running in the background; the persisted thread is created regardless. Reopen the palette or jump to the Copilot Conversations section to see the full transcript when it finishes.

## Privacy and Runtime

The loop honors every invariant the rest of Team-X does:

- **Provider router is the only LLM touch-point** — the loop calls `providerRouter.complete` exclusively. Privacy tier filtering, per-provider concurrency caps, and cost tracking all apply, unchanged. If your max privacy tier is `local`, the loop runs on Ollama and nothing leaves your machine
- **Orchestrator is the only scheduler** — if you call a meeting mid-run, the loop's pause-aware wrapper observes `orchestrator.isCompanyPaused(companyId)` on every provider call (poll 250ms) and blocks until the meeting ends. Your step log shows a single plan card and idles; it does not fight the meeting for scheduling slots
- **Append-only event stream** — every step emits an `agent.step` event; the terminal state emits `agentic.completed` or `agentic.failed`. These are audit-loggable, replayable, and visible in the audit log with intent-summary labels
- **Zero phone-home** — no anonymized metrics, no telemetry beacons, nothing. Same posture as the rest of the app

## Example Run

Input: *"Why is the frontend team behind schedule?"*

Step-by-step (a typical 5-step run):

1. **plan** — "I should check open tickets for the frontend team, then cross-reference with recent events to see if there's a pattern."
2. **tool_call** — `query_tickets({ team: "frontend", status: "open", limit: 50 })`
3. **tool_result** — `{ rows: [12 tickets with blocked status, assignee, priority], truncated: false }`
4. **tool_call** — `query_events({ kind: "ticket.blocked", since: "7d", limit: 50 })`
5. **tool_result** — `{ rows: [8 block events, 4 attributed to dependency wait on the backend auth rewrite], truncated: false }`
6. **answer** — "The frontend team has 12 open tickets, 8 of which entered `blocked` status in the last 7 days. Four are waiting on the backend auth rewrite (owned by Sarah Chen), three on a third-party SDK upgrade, and one on design sign-off. The schedule slip is concentrated in the auth dependency — unblocking Sarah's ticket (#127) would clear half the queue. [12 tickets, 8 blocks, 4 auth dep]"

Every claim is grounded in a tool result. The final answer's bracketed citation reflects the counts the loop actually observed. No hallucination. No made-up employees.

## Troubleshooting

**"The run took forever and ended with `budget_exhausted`."** Small local models (7B range) sometimes loop on malformed tool calls. Bump `agentic_max_steps` to 12–16 in Settings → Runtime → Agentic Loop, or switch to a larger local model (14B+) or a cloud provider. The loop's step counter in the palette footer shows how many steps remain.

**"It canceled itself with `reason: 'timeout'` but hadn't finished."** Wall-clock budget exceeded. Bump `agentic_timeout_ms` to 300000 (5 minutes) for deep investigations, or switch to a faster provider. Cloud providers typically complete in 30–60 seconds; local Ollama on modest hardware can take 2–5 minutes for 8-step runs.

**"The step log only shows the answer card, not the intermediate steps."** Known issue when running against very fast providers or the canned test seam — the loop can complete before the palette's React Query subscription attaches to the bus. The persisted thread in Copilot Conversations gets all steps correctly; click Open Thread after the run ends to see the full transcript. (Tracked as F1 in Phase 5 follow-ups; target fix is `getSteps(runId)` backfill on mount.)

**"I opened the Copilot Conversations section and my thread isn't there."** Known issue when the section was already open before the run completed — the thread list doesn't invalidate on `agentic.completed` yet. Refresh by switching to another chat thread and back, or click Open Thread from the palette step log. (Tracked as F2.)

**"The loop says `tool_error` in one of the cards."** The tool registry wraps every tool call with error capture — a `tool_error` step is surfaced, not swallowed, and the loop typically recovers by trying a different tool on the next step. If you see repeated `tool_error` with the same tool, check the main-process console for the underlying repo exception — it's usually a migration drift (nuke the DB with `%APPDATA%/Team-X/team-x/team-x.sqlite` on Windows to reseed from scratch).

**"I got a run with `provider_error`."** Provider disconnected mid-stream. For Ollama, confirm `ollama serve` is running and the model is pulled. For cloud providers, check your API key in Settings → Providers → Test Connection. The loop does not auto-retry — re-ask the same question via `Cmd+K`.

**"The agent answered in a weird voice."** The system-agent has its own role card at `role-packs/strategia-official/roles/system/system-agent.md`. Edit the body prompt section for tone adjustments. Changes take effect on the next run — in-flight runs use the snapshot at `start()` time.

**"Can I see every run from the past?"** Yes. Copilot Conversations is the primary surface — every run is a thread. For audit-log filtering, switch to the **Audit** tab, filter by event type `agentic.completed` or `agentic.failed`, and expand a row to see the payload (runId, finalAnswer, stepCount, tokensUsed, durationMs, or reason on failure).

**"How do I write my own tool?"** You can't, yet. The six read-only tools are main-process closures over existing repos — intentionally built in, not plugin-loaded, so they bypass the MCP host and can't accidentally talk to an external service. The write-side (creating tickets, delegating work, reviewing deliverables) ships in M32 (Task Planner) and uses a separate tool set with destructive-action gates. Custom tools are not part of the Phase 6 surface.

## Privacy

Everything the agentic loop touches is already in your Team-X database. The six query tools read local repos — employees, tickets, projects, meetings, vault files, events — none of which leave your machine except via LLM provider calls, which are bounded by your privacy tier.

If your max privacy tier is `local`, the entire loop runs on Ollama. Zero network traffic, zero cloud dependencies, zero phone-home. If you allow `proprietary-cloud`, the loop may use Anthropic / OpenAI / Google depending on your configured providers — in which case the prompt text, tool results, and final answer transit their APIs. Your company's data never leaves the provider-router boundary, and the provider-router enforces the privacy filter at call time.

The audit log persists every run's prompt, every step, and every grounded answer. If you need to purge a sensitive run, delete the thread row — the `events` table is append-only, but the thread-level surface is editable. Note: audit-log events persist independently of the thread; true forensic purging requires a database-level operation outside the UI.
