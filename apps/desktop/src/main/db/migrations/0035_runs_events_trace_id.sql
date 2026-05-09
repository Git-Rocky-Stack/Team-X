-- H4 (audit 2026-05-07) — End-to-end traceId propagation.
-- Adds a W3C-compatible trace ID column to both `runs` and `events` so a
-- single agentic / chat / copilot run can be reconstructed from logs by
-- joining the run row against every event row that fired during its
-- lifetime.
--
--   * Column type: `text` (32-char hex per W3C trace-context spec — the
--     same shape `intelligence/observability/tracing.ts` already produces
--     via its idGen).
--   * Both columns are nullable + lack a SQL default. Legacy `runs` and
--     `events` rows written before this migration retain NULL so the
--     dashboard's nullable-aware code paths read them without filtering
--     them out.
--   * Two btree indexes — one per table — make the canonical
--     `WHERE trace_id = ?` reconstruction query O(log n) instead of a
--     full scan against the (eventually large) events table.
--
-- Producers — every orchestrator that opens a run row (run-agent.ts,
-- agentic-loop-service.ts, copilot-analyzer-service.ts,
-- autonomy-benchmark-memory-context.ts) generates one traceId per logical
-- request via `generateTraceId()` from `@team-x/shared-types`, threads it
-- through `runs.start({ traceId })` AND through every `bus.emit({ traceId })`
-- on the same request, so the JOIN works. Loop-internal code carries the
-- trace via `LoopDeps.traceId` and surfaces it on `LoopRun.traceId`.
--
-- Consumers — the Telemetry tab can now render "all events for this run"
-- by selecting `events WHERE trace_id = ?`. Cancelled and timed-out runs
-- (H8 fix) keep their traceId so cost-ledger reconciliation can trace
-- WHICH events on a partial run produced cost.
ALTER TABLE `runs` ADD COLUMN `trace_id` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `trace_id` text;
--> statement-breakpoint
CREATE INDEX `idx_runs_trace_id` ON `runs` (`trace_id`);
--> statement-breakpoint
CREATE INDEX `idx_events_trace_id` ON `events` (`trace_id`);
