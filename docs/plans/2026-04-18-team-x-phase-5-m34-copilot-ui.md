# Phase 5 — M34 Copilot UI Implementation Plan

**Date:** 2026-04-18
**Milestone:** M34 — Copilot UI (sidebar panel + dashboard widget + `Cmd+Shift+K`)
**Depends on:** M33 (Copilot Service + IPC surface), M30 (Command palette for action dispatch)
**Estimated tests:** ~15 unit + 1 E2E spec
**Scope:** Renderer-only. No new bus events. No new IPC channels. No new providers.

---

## 1. Goal

Surface the M33 copilot's proactive insights in a dedicated right-side sidebar
panel and a compact dashboard widget. Wire `Cmd+Shift+K` (Ctrl+Shift+K on
Windows/Linux) as the global toggle. Consume the existing
`window.teamx.copilot.*` bridge (insights / dismiss / ask / configure) and the
`copilot.insight` / `copilot.dismissed` / `copilot.expired` bus events for
cache invalidation per invariant #11.

## 2. Non-goals

- No new IPC channels. M33 T5 already shipped the full four-channel surface.
- No new bus event types. The three M33 copilot events are sufficient.
- No LLM changes. `copilot.ask` routes through the existing `system-copilot`
  agentic path (M33 T6).
- No Settings UI changes — `CopilotSection` shipped in M33 T7.
- No new provider wiring.

## 3. Task breakdown

| # | Task | Files touched | Tests |
|---|------|---------------|-------|
| T1 | Lint fix commit (M33 format errors) | 4 (auto-format) | — |
| T2 | M34 implementation plan doc | this file | — |
| T3 | `use-copilot` React Query hook | `hooks/use-copilot.ts` (NEW) | 4 |
| T4 | `CopilotInsightCard` component | `features/copilot/copilot-insight-card.tsx` (NEW) | 4 |
| T5 | `CopilotSidebar` panel | `features/copilot/copilot-sidebar.tsx` (NEW) | 3 |
| T6 | `CopilotDashboardWidget` | `features/copilot/copilot-dashboard-widget.tsx` (NEW) | 3 |
| T7 | `Cmd+Shift+K` shortcut + toolbar button | `App.tsx`, `app/top-bar.tsx`, `store/app-store.ts` | — |
| T8 | Action dispatch wiring | consumed inside T5 | — |
| T9 | Unit tests (hook + components) | `*.test.tsx` files alongside each | (above) |
| T10 | Playwright E2E | `e2e/copilot-ui.spec.ts` (NEW) | 1 E2E |
| T11 | Docs + verification + milestone marker | CLAUDE.md, CHANGELOG, README, user-guide | — |

**Total:** ~14 unit tests + 1 E2E. Matches the ~15-test estimate in Phase 5
design §9.

## 4. Architectural decisions

### 4.1 Sidebar state location

`copilotSidebarOpen: boolean` lives in `useAppStore` (Zustand) alongside the
existing `chatOpen` slice. Rationale: the widget's "View all (N)" link, the
toolbar button, and the keyboard shortcut all need to toggle the same state
from different mount points. Zustand broadcasts to all subscribers without
prop-drilling.

### 4.2 Bus invalidation (invariant #11)

`use-copilot.ts` attaches a single `ipc.events.onDashboard` listener and
invalidates `['copilot-insights', companyId]` on:

- `copilot.insight` — new insight appeared.
- `copilot.dismissed` — optimistic project-in; still invalidate for server truth.
- `copilot.expired` — insight no longer active.

Matches the pattern in `use-vault.ts` L84 and `use-chat.ts` L57 — single
listener per hook instance, unmount unsubscribe.

### 4.3 Ask input → agentic loop

`copilot.ask` returns `{ runId, threadId }` (same shape as M31
`complex_request`). The sidebar opens the chat drawer with the system-copilot
thread via `openThread({ threadId, isAgentThread: false, isCopilotThread: true, ... })`
so the M31 step-transcript layout renders automatically. **Zero new UI code for
the answer stream** — we reuse `useAgentStepStream` via the existing drawer
path.

### 4.4 Action dispatch

Insight cards with `actionIntent` + `actionEntities` dispatch via the existing
`useCommandExecute` mutation — no new wiring. Destructive/write-side gates
already fire inside `CommandService` (M30 T5, M32 T5). The copilot card is just
another call-site.

### 4.5 Keyboard shortcut collision

`Cmd+K` (palette) and `Cmd+Shift+K` (copilot) share the 'k' key — the existing
handler in `App.tsx` L69 already checks `event.shiftKey`. We extend that same
handler rather than registering a second listener to avoid event-ordering
ambiguity.

## 5. Accessibility

- Radix `Sheet` primitive (already vendored at `components/ui/sheet.tsx`) ships
  with focus trap + Esc dismiss + `role="dialog"`.
- All insight cards are `<article role="listitem">`; the feed is `role="list"`.
- Severity icons include `aria-label` with category name (not decorative-only).
- Ask input is a labeled `<textarea>` with `Cmd/Ctrl+Enter` submit shortcut
  matching `features/chat/composer.tsx`.
- Minimum 44px touch targets on action / dismiss buttons.
- Severity color alone never carries meaning — text badge always paired.

## 6. Test strategy

### 6.1 Unit (Vitest + React Testing Library)

- `use-copilot.test.ts` — query shape, mutation invalidation, bus event
  handler fires `invalidateQueries` with correct key.
- `copilot-insight-card.test.tsx` — all severity × category combinations
  render correct icon + badge, dismiss click fires mutation, action click
  fires `command.execute`.
- `copilot-sidebar.test.tsx` — sort order (critical > warning > info),
  empty state, ask input submission.
- `copilot-dashboard-widget.test.tsx` — top-3 cap, "View all" link toggles
  store state.

### 6.2 E2E (Playwright against canned test-mode provider)

`e2e/copilot-ui.spec.ts`:

1. Create + close a ticket (generates an event for the copilot).
2. Fire `copilot.configure` with a manual tick (test-mode IPC).
3. Assert insight was created via `copilot.insights`.
4. Press `Cmd+Shift+K` → sidebar opens, insight card visible via
   `data-copilot-insight-id`.
5. Click Dismiss → assert card disappears + `copilot.insights` returns 0 active.
6. Open sidebar again, type `__ECHO_AGENT__:[{"answer":"insight count is 0"}]`
   into ask input, submit → assert drawer opens on system-copilot thread with
   terminal answer step.
7. Regression guards: destructive-gate absent, write-side-gate absent, no new
   errors in main-process log.

## 7. Verification sequence (M33 T10 discipline)

1. Node ABI rebuild: `cd node_modules/.pnpm/better-sqlite3@11.10.0/.../better-sqlite3 && npm run install`
2. `pnpm test` (target: 1114 → ~1128 unit tests)
3. Electron ABI rebuild: `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`
4. `pnpm -F @team-x/desktop test:e2e` (target: 9 → 10 specs, all green)
5. `pnpm typecheck` (expanded to all workspaces)
6. `pnpm lint` (0 errors — lint baseline was cleared in T1)

## 8. Out-of-scope follow-ups

- Multi-company copilot aggregation (enters Phase 6+ cross-company UI).
- Insight export to markdown/PDF (nice-to-have for post-launch).
- Customizable insight categories per company (settings-level; M35 candidate).
- Drag-to-reorder insights (user-customizable priority).

---

*Design authority: `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §8.5 and §9 (M34 row).*
