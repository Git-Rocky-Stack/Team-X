# Loki Continuity — Phase 3, M20

## Current State
- **M20 (Demo + hardening) COMPLETE.**
- **Phase 3 (The Live Cockpit) COMPLETE.** All 7 milestones shipped (M14-M20).
- 530 unit tests + 3 E2E specs passing. Typecheck + lint clean.

## What M20 delivered
1. **Playwright E2E meeting-flow spec:** `e2e/meeting-flow.spec.ts` — full meeting lifecycle (call meeting with 2 attendees, verify agenda system message, Rocky interjects, end meeting, verify minutes generation + "Ended" badge). Runs in ~2-3s against canned test-mode provider.
2. **Smoke + ticket-flow E2E specs updated:** Phase badge assertion changed from "Phase 2" to "Phase 3" to match the current top-bar badge.
3. **CLAUDE.md finalized:** Phase 3 status updated to "complete", M20 entry added, E2E docs updated from "Two" to "Three" specs, testing expectations updated, 4 new troubleshooting entries (meeting-flow strict mode, interject polling, runtime strategy, telemetry empty state).
4. **Strict mode locator patterns documented:** Meeting detail panel has text collisions (agenda in h3 + system message, "Minutes" label + "Meeting Minutes" content). Solutions: tag-scoped locators (`locator('h3').filter`), `exact: true`, unique class selectors (`div.max-h-32`).

## Files created
- `apps/desktop/e2e/meeting-flow.spec.ts`

## Files modified
- `apps/desktop/e2e/smoke.spec.ts` — Phase 2 → Phase 3 badge assertion
- `apps/desktop/e2e/ticket-flow.spec.ts` — Phase 2 → Phase 3 badge assertion
- `CLAUDE.md` — Phase 3 complete, M20 entry, E2E docs, troubleshooting

## Phase 3 summary (M14-M20)
- **M14:** 4 dashboard subviews + subtab nav + top bar expansion to 8 tabs
- **M15:** Goals + projects + ticket linking + kanban
- **M16:** Meeting primitive + orchestrator pause/drain + minutes
- **M17:** Telemetry dashboard + Recharts (company/employee/cost views)
- **M18:** 7 provider adapters + settings UI + env-key bootstrap
- **M19:** Runtime strategy + hardware profiler + privacy tiers + concurrency
- **M20:** E2E meeting-flow spec + hardening + CLAUDE.md finalization

## Next: Phase 4 (Ship-readiness)
- File vault + blob storage
- Backup/restore + audit log UI
- Community role packs + signature verification
- Installers + landing site
- Public release

## Mistakes & Learnings
- Playwright strict mode violations are the #1 E2E debugging issue. Always scope locators to containers and use tag-specific selectors (`locator('h3')`, `locator('p.italic')`) when text appears in multiple elements.
- `getByText('Minutes')` matches both the label "Minutes" and content containing "Meeting Minutes" — use `exact: true` for the label.
- `whitespace-pre-wrap` class is used in both minutes content and message bubbles — not unique enough for a locator. Use `div.max-h-32` which is unique to the minutes section.
- Phase badge assertions in E2E tests must be updated when the top-bar badge changes — they silently become stale since E2E tests run separately from vitest.
