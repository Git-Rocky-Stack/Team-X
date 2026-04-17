# Copilot Service

The Copilot is Team-X's proactive analyst. M31 gave you an agentic loop you could ask — *"why is the frontend team behind?"* — and get a grounded answer. M32 gave you a planner that could decompose and delegate when you asked. M33 turns the loop **inside-out**: instead of waiting for you to type at `Cmd+K`, the app prompts the loop on a cadence, asks *"what's wrong with this company right now?"*, and surfaces the answer as **insights** — proactive nudges about blocked tickets, cost spikes, org gaps, and workflow drift.

You don't manage the Copilot. It runs in the background, on whatever provider you've configured, on a schedule you control. It writes nothing destructive — every insight is an advisory row that you can dismiss with one click. When you want to ask it something directly, `copilot.ask` routes through the same M31 agentic harness with a different actor seat (`system-copilot`) and an extra introspection tool (`query_copilot_insights`) so it can ground answers in its own prior analysis.

## Overview

- **Periodic analyzer** — `CopilotAnalyzerService` ticks every 5 minutes by default (clamped 1 ≤ `copilot_interval_minutes` ≤ 60). Each tick reads a rolling event window, summarizes it into a deterministic prompt, calls the LLM, validates the JSON response, and persists the resulting insights via dedup-aware upsert
- **Event-triggered supplements** — separately from the periodic schedule, a debounced trigger (30 s per company) re-runs analysis when significant events fire (`meeting.ended`, `ticket.closed`, `goal.progressChanged`, `agentic.failed { reason: 'budget_exhausted' }`). Latest signal wins; the timer resets on each new trigger
- **System-copilot pseudo-employee** — a second `is_system = 1` row per company, alongside M31's `system-agent`. Hidden from the org chart, hire dialog, delegation pickers, and meeting attendees. Owns the Copilot Conversations thread for `copilot.ask`
- **Five insight categories** — `operational`, `cost`, `org`, `workflow`, `anomaly`. Filterable per-category in settings
- **Three severity levels** — `info`, `warning`, `critical`. Severity drives surfacing prominence in the M34 sidebar; `info` is silent until viewed, `warning` is the default surface, `critical` rises to the top
- **Deterministic dedup** — category-scoped Jaccard bigram similarity > 0.8 over normalized titles, with a numeric-drift guard so "3 blocked tickets" never silently merges with "4 blocked tickets". Two consecutive ticks with the same input produce one insight, not two
- **Pause-aware** — every tick polls `orchestrator.isCompanyPaused(companyId)` before calling the provider. A meeting in progress queues the cycle; it fires on resume. Same wrapper M31 built
- **Honors every existing invariant** — provider router is the only LLM touch-point, orchestrator is the only scheduler, append-only event stream, zero phone-home, OS keychain for secrets

## What the Copilot Watches

The analyzer's prompt is built from a deterministic summary of three sources:

1. **Rolling event window** — `CopilotEventWindow` keeps the last 100 events per company in memory (FIFO, `token.delta` filtered out at the boundary because streaming noise would pin the window). Warm-starts from `events.list({ companyId, limit: 100 })` on first snapshot per company so a fresh boot doesn't have to wait for new activity
2. **Live company state** — open tickets (counts by status + assignee), active runs (counts + cost-last-hour from the runs table), org diff (employees added/fired since last tick)
3. **Prior insights** — active rows in `copilot_insights` for the same company. Lets the LLM dedupe its own output ("we've been flagging this same pattern for 3 days")

Each tick produces a structured prompt of ≤ 2000 characters of event summary. The LLM returns a JSON array of insight drafts validated against a strict zod schema. Malformed output gets one nudge-retry; if it still fails, the tick logs `malformed_output` to `copilot.analyzed` and skips persisting (no spurious insights from a confused model).

## Insight Categories

| Category | What it surfaces | Example |
|----------|------------------|---------|
| `operational` | Blocked tickets, missed deadlines, unresolved discussion threads, repeated rejects | "3 tickets in the auth-rewrite project have been blocked > 48h" |
| `cost` | Provider spend anomalies, runaway loops, cheaper-tier opportunities | "Spend on Anthropic doubled this hour vs the prior 6h average" |
| `org` | Reporting gaps, overloaded employees, unbalanced manager spans | "Mateo Reyes has 14 open tickets — 3× the team average" |
| `workflow` | Process drift, recurring meeting interjections, stale meetings without minutes | "Daily standups have ended without minutes 4 of the last 5 days" |
| `anomaly` | Pattern breaks the analyzer can't classify but flags as worth a human look | "Three back-to-back `agentic.failed { budget_exhausted }` events on system-agent in 12 minutes" |

The five categories live in `COPILOT_CATEGORIES` (shared-types) and are mirrored in the analyzer prompt, the settings UI, the dedup scope, and the `query_copilot_insights` tool's filter parameter. Adding a sixth category requires a code change in lockstep across all four sites — intentional friction so the taxonomy stays stable.

## Severity Levels

| Severity | Meaning | M34 sidebar treatment (preview) |
|----------|---------|---------------------------------|
| `critical` | Active failure or imminent risk — cost runaway, blocking incident, repeated escalations | Top of the panel, red accent, persistent until dismissed or expired |
| `warning` | Slipping process or anomaly worth a look — most insights land here | Default surface, amber accent |
| `info` | Background observation, low signal — historical pattern note, FYI metric | Collapsible "More" section, muted |

Severities are LLM-classified per draft, not user-configured. The classifier prompt locks the three values via the `COPILOT_SEVERITIES` enum so a confused model can't invent `'urgent'` or `'minor'` — zod rejects anything off the enum and the row is skipped.

## Cadence and Triggers

The analyzer runs in **two modes**:

### Periodic (every `copilot_interval_minutes`, default 5 min)

Per-company `setInterval`-based loop. Cadence is global-scope (one `interval_minutes` setting applies to every company), but each company maintains its own timer + its own pause/resume gate. Lean strategy + active agent run → the analyzer's `providerRouter.complete` call queues for a slot like every other LLM call.

### Event-triggered (debounced 30 s)

`CopilotEventTrigger` subscribes to four event types:

- `meeting.ended` — a meeting just generated minutes; analyzer re-evaluates the team's blocker list
- `ticket.closed` — work landed; analyzer re-evaluates load + throughput
- `goal.progressChanged` — milestone moved; analyzer re-evaluates whether the goal's projects are still on track
- `agentic.failed { reason: 'budget_exhausted' }` — a complex_request hit a wall; analyzer re-evaluates whether the user needs a settings nudge

The debounce is **per-company, latest-reason-wins**. Three signals in 10 s reset the timer; the run fires 30 s after the last one. This avoids analyzer thrash during a busy meeting end + ticket close cascade.

`ticket.closed` and `goal.progressChanged` are wired up in M33 but no production code emits them yet — they'll come online when the relevant repos grow event emission. Zero-cost subscription until then.

## Settings

Three new keys live in **Settings → Runtime → Copilot**:

| Key | Default | Range | Meaning |
|-----|---------|-------|---------|
| `copilot_enabled` | `true` | `true` / `false` | Master switch. When off, both periodic and event-triggered ticks are skipped. Existing insights are not deleted, just no new ones land |
| `copilot_interval_minutes` | `5` | 1 – 60 | Cadence of the periodic tick. Clamped server-side at write; values outside range are coerced to the nearest bound |
| `copilot_categories` | all 5 | subset of `COPILOT_CATEGORIES` | Which categories the analyzer is permitted to surface. The LLM can still propose any category; categories not in this set are filtered out before persist. Empty subset → falls back to the full set (conservative default — empty is treated as "user error", not "block everything") |

All three are clamped on write — the UI applies inline validation, the main-process repo re-validates regardless. Changes take effect immediately: `copilot.configure` writes the new values and calls `analyzer.restart(companyId)` so the next tick picks up the new interval without an app restart.

### Choosing a cadence for your hardware

- **Local Ollama only** — keep the default 5 min. Each tick on an 8B model takes 4 – 12 s on consumer hardware. Tighter cadences (2 – 3 min) overlap with planner runs and starve the agent loop's slots
- **Cloud providers** — 2 – 3 min works well. Anthropic / OpenAI Sonnet-tier latency is sub-2-s; you can react to events fast without burning budget
- **Tight budget** — push to 30 – 60 min. Insights will lag; the event triggers still fire on real activity so you don't lose the high-signal moments
- **Large org with many active runs** — bump `agentic_max_steps` (M31 setting) BEFORE bumping copilot cadence. The copilot's `query_*` tools share the agent loop's step budget

## `copilot.ask` — Free-Form Questions

The Copilot is also reactive. Type a question into the palette while the Copilot Conversations thread for `system-copilot` is selected (or call `copilot.ask` programmatically) and the question routes through the same M31 agentic harness — same scheduler, same step-log palette, same persisted thread — with two key differences:

1. **Actor is `system-copilot`**, not `system-agent`. The Copilot Conversations sidenav shows two threads, clearly labeled. The system-copilot thread is the read-only advisory seat
2. **Tool registry is the M31 read-only set + `query_copilot_insights`** — and **only** that. No write-side tools (`decompose_project` / `delegate_subtask` / `review_deliverable`), no MCP tools, no shell, no filesystem, no network. The role card's `tools_denied` list is the source of truth and the level-gated composer enforces it at composition root

The new tool, `query_copilot_insights`, takes optional `category` / `severity` / `includeDismissed` filters and returns a `{rows, truncated}` envelope of up to 50 insights — same shape every M31 read-side tool uses. This lets the Copilot ground answers in its own prior analysis: *"You've been flagging this same workflow drift for 3 days — here's the trend."*

`copilot.ask` returns `{ runId, threadId }` field-for-field identical to M31's `command.execute` for `complex_request`, so the M34 sidebar attaches to the same step-stream wire contract without a second format.

## Dedup Discipline

The dedup contract is the Copilot's most important property — without it, every periodic tick would produce a fresh batch of insights and the sidebar would be unusable. `upsertWithDedup` runs three checks **in order**, cheap rejections first:

1. **Category scope.** Drafts only dedupe against existing active rows in the same category. An `operational` insight never merges with a `cost` insight even if titles overlap
2. **Numeric-drift guard.** If both the existing title and the draft title contain digit sequences AND those digits differ ("3 blocked tickets" vs "4 blocked tickets"), the draft is treated as **new** — workflow numbers shift and we want the user to see the change
3. **Jaccard bigram similarity > 0.8.** Cheap, deterministic, locale-insensitive. `JACCARD_MERGE_THRESHOLD = 0.8` is the locked threshold. Below 0.8 = new insight, above 0.8 = silent merge (the existing row's `created_at` is preserved, the draft's `detail` and `expires_at` overwrite)

`copilot.insight` fires on the bus **only on insert** — silent merges do not re-emit. This keeps the M34 sidebar from blinking every five minutes when the analyzer surfaces the same pattern.

Two consecutive ticks with byte-identical input → **one** row. A tick that surfaces a numeric variant ("4 blocked tickets") of an existing insight ("3 blocked tickets") → **two** rows. A tick whose drafts are semantically similar but lexically different ("frontend team is behind" vs "frontend velocity has slipped") → **one** row, the existing one preserved.

## Expiry

Every insight carries an `expires_at` timestamp set by the LLM (typical: 24 – 72 hours, capped at 7 days by the analyzer). Each tick runs an expiry sweep at the top:

1. `listStale(now)` returns rows where `expires_at < now AND dismissed_at IS NULL`
2. Per-row `copilot.expired` event emitted on the bus (M34 sidebar removes the card live)
3. `expireStale(now)` deletes the rows physically

Expired insights are gone — they don't accumulate in a soft-deleted state. The audit trail is preserved on the append-only events table (every `copilot.insight`, `copilot.dismissed`, and `copilot.expired` event persists forever in `events`).

## Audit Trail

Four new event types appear in the **Audit** tab:

| Event | When | Payload |
|-------|------|---------|
| `copilot.analyzed` | Once per tick (success or skip) | `{ companyId, reason, durationMs, insightsProposed, insightsPersisted, insightsMerged, insightsExpired }` |
| `copilot.insight` | Per insight inserted (not on merge) | `{ companyId, insightId, category, severity, title }` |
| `copilot.dismissed` | When user clicks Dismiss | `{ companyId, insightId, dismissedAt }` |
| `copilot.expired` | Per row removed by the expiry sweep | `{ companyId, insightId, category, severity, title, expiredAt }` |

Filter the Audit tab on `copilot.*` to see the analyzer's full lifecycle. Every IPC mutation emits a bus event — invariant #11. The M34 renderer caches will invalidate without manual refetch the day they ship.

## Privacy and Runtime

- **Provider router is the only LLM touch-point.** Analyzer calls go through `providerRouter.complete(...)` with `actor: 'system-copilot'`. Privacy tier + concurrency caps + cost tracking flow unchanged. With Ollama at the Local privacy tier, no analysis data leaves your machine
- **Runs are tagged `kind: 'copilot'`** in the runs table. Telemetry tab can filter by run kind to separate copilot spend from agent loop spend (M34 will surface a Copilot row in the Telemetry view)
- **Orchestrator is the only scheduler.** A meeting in progress pauses the analyzer's provider call; tickets and minutes are not generated behind a meeting
- **Append-only event stream.** Every analyze, insight, dismiss, and expire surfaces on the bus
- **Zero phone-home.** No new network surface, no external metrics, no update-check piggyback. Same posture as the rest of the app
- **Cross-company isolation.** Each company runs its own timer + its own event window. Insights never cross workspaces
- **No write-side authority.** The Copilot has zero ability to create tickets, fire employees, end meetings, or call write-side tools. Its `tools_denied` list locks out the M32 planner tools at composition root, and its role card's `decision_authority: advisory` is the human-readable form of the same constraint

## Example Cycle

The `copilot-service.spec.ts` E2E exercises a deterministic round-trip against the canned `test-copilot-provider.ts` seam:

1. **Boot Electron** with `NODE_ENV=test`. The composition root wires `createTestCopilotComplete()` into the test-mode `resolveComplete` branch. Production providers untouched
2. **Seed bus-visible events** — create + close one ticket. The events flow through `CopilotEventWindow` and are also persisted on the events table for warm-start hydration
3. **Manual tick** — `copilot.configure({ companyId })` is the test-only manual-tick handler. It calls `analyzer.tick(companyId, { reason: 'manual' })` once and returns `{ insightsGenerated: number }` synchronously
4. **Insight surfaces** — `copilot.insights({ companyId })` returns one row: `category: 'operational'`, `severity: 'warning'`, `title: 'E2E canned copilot insight'`, `dismissedAt: null`
5. **Dismiss** — `copilot.dismiss({ id })` sets `dismissedAt = Date.now()` and emits `copilot.dismissed` on the bus
6. **Audit trail verified** — `events.list({ types: ['copilot.dismissed'] })` returns ≥ 1 matching row (invariant #11 regression guard)
7. **Re-query insights** — same call, default `includeDismissed: false` — the dismissed row is no longer returned
8. **Free-form ask** — `copilot.ask({ companyId, text: <prompt + __ECHO_AGENT__: sentinel> })` returns `{ runId, threadId }`
9. **Step log streams** — `command.getRunSnapshot(runId)` polls the run state. Steps land in order: `plan` → `tool_call(query_copilot_insights)` → `tool_result` → `answer`
10. **Thread persists** — `chat.list(threadId)` returns ≥ 2 messages on the system-copilot thread. `chat.listThreads(companyId)` includes the copilot thread with `isSystemAgent: true`
11. **Regression guards** — neither the M30 destructive (red) confirmation gate nor the M32 write-side (amber) gate is ever visible. Copilot is advisory by construction

Full spec runs in 1.7 s. The whole E2E suite (10 cases across 9 spec files) takes ~27 s.

## Troubleshooting

**"The Copilot never produces any insights."** Check **Settings → Runtime → Copilot**: is `copilot_enabled` on? Is `copilot_categories` non-empty? (Empty → analyzer falls back to the full set, but the UI may have cleared the chips visually if you toggled all five off — fix by re-checking at least one). On Ollama, confirm the model is pulled (`ollama list` includes `llama3.1:8b` or whatever your `preferred_model_tier: mid` resolves to). Check the Audit tab for `copilot.analyzed { reason: 'malformed_output' }` rows — small models occasionally return drafts that don't match the zod schema; the analyzer skips them and logs the reason.

**"Two identical insights showed up after a tick."** Dedup is category-scoped — if the LLM classified two semantically-similar drafts under different categories (`operational` vs `workflow`), they don't merge. Either (a) the model genuinely thinks they're different concerns, or (b) it's misclassifying. Tighten the `copilot_categories` setting to remove the category that's catching the duplicates.

**"An insight I expected to merge got persisted as a new row."** Numeric-drift guard. If both the existing title and the new title contain digit sequences AND the digits differ, the new row is treated as fresh — even if the rest of the title is identical. This is by design: workflow numbers shift, and merging "3 blocked tickets" into "4 blocked tickets" would silently lose the count change. Title contents that should never appear as numbers (project IDs, employee handles) are not affected.

**"`copilot.ask` shows up on the system-agent thread, not system-copilot."** The router resolves `employeeId` per call. Confirm the thread you're viewing in Copilot Conversations has the system-copilot avatar (Sparkles icon, distinct from system-agent's Bot icon). If you typed your question into the M30 command palette without context, it routed to `complex_request` → `system-agent`; use `copilot.ask` directly (or click into the system-copilot thread first) to route to the Copilot's seat.

**"Insights expire too quickly."** The LLM sets `expires_at` per draft (typical 24 – 72 h, capped at 7 days). Below-floor or above-cap values are clamped at write. If you need certain categories to live longer, the answer today is to bump the cap in `agentic-tools-copilot.ts` and `copilot-analyzer-service.ts` together — there's no per-category TTL setting yet. File an issue if this comes up regularly.

**"The analyzer fires during a meeting and I see stale step counts."** By design, not a bug. `CopilotAnalyzerService.tick` polls `orchestrator.isCompanyPaused(companyId)` via the same wrapper M31 built. The tick queues until the meeting ends, then resumes. The Audit tab shows `copilot.analyzed { reason: 'periodic' }` only after the meeting concludes.

**"`copilot.dismiss` succeeded but the insight is still in the list."** The dismiss flag is `dismissedAt = <ts>`, not a row delete. `copilot.insights` defaults to `includeDismissed: false`, so dismissed rows are filtered out. If you're seeing a dismissed row, either (a) you're explicitly passing `includeDismissed: true`, or (b) the cache hasn't invalidated — check the Audit tab for `copilot.dismissed`; if the event row exists, the renderer-side cache is the bug; if not, the IPC mutation didn't fire (rare).

**"`agentic.failed { budget_exhausted }` keeps firing on system-copilot."** The `copilot.ask` path inherits the same `agentic_max_steps` / `agentic_max_tokens` / `agentic_timeout_ms` clamps as M31. Small local models sometimes burn the step budget on `query_copilot_insights` parsing. Bump `agentic_max_steps` to 12 – 16 for 7 – 8 B models, or switch to a larger model via Settings → Providers. The periodic analyzer ticks are NOT subject to these clamps — they run a single `providerRouter.complete` per tick with a one-shot nudge retry on malformed output.

**"How do I stop the analyzer for a company permanently?"** Set `copilot_enabled = false` in **Settings → Runtime → Copilot**. The analyzer's `restart(companyId)` will clear the per-company timer; the trigger subscription stays attached but its debounced calls become no-ops because the periodic tick is the only path that produces insights. To stop only the event triggers, the answer today is the same toggle — there's no separate trigger flag.

**"`copilot.configure` throws 'not implemented' in production."** By design. `copilot.configure` is a test-only manual-tick IPC, gated on `isTestMode()`. Production code paths use `settings.setCopilot` to update the cadence and let the next periodic tick fire on schedule. The error message points at the right setting.

**"Rolling event window is empty after restart."** The window warm-starts from `events.list({ companyId, limit: 100 })` on the first `snapshot` per company. If you see `copilot.analyzed { insightsProposed: 0 }` repeatedly after a restart, the warm-start succeeded but the events table is genuinely empty (no recent activity) — perform any user action (create a ticket, open a meeting) and the next tick will have signal. If the warm-start is failing, the bus subscription is the canonical fallback — events emitted after the analyzer started will land in the deque regardless of the warm-start.

**"Can I write my own Copilot tool?"** Not yet. The `query_copilot_insights` tool is a main-process closure over `CopilotInsightsRepo` with a hard-coded level gate (`SYSTEM_COPILOT_ROLE_ID` only). Phase 6 may revisit a tool plugin model with signed-pack semantics; for now the registry is closed by construction.
