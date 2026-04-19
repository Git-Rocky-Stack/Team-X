# Phase 5.6 M-D Step (d) QA Evidence — Chat Tab Enable

Date: 2026-04-19

## Scope

Step (d) restores the Chat entry point without adding IPC:

- Chat top-bar tab enabled
- `ChatView` added as the Chat landing surface
- `ChatView` reuses `useThreadList` and the existing `ThreadList` component
- Thread selection opens the already-mounted `ChatDrawer` through app-store thread state
- Workspace-switcher E2E expanded with a Chat tab thread-selection case

## Verification

| Gate | Result |
| --- | --- |
| `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/chat/chat-view.test.tsx` | RED first, then PASS — 6/6 |
| Focused renderer suite: `chat-view.test.tsx`, `top-bar.test.tsx`, `event-sync-hooks.test.ts` | PASS — 3 files / 105 tests |
| `pnpm -F @team-x/desktop typecheck` | PASS |
| `pnpm lint` | PASS — 0 errors / 21 warnings |
| `pnpm -F @team-x/desktop build` | PASS |
| `pnpm -F @team-x/desktop exec playwright test e2e/workspace-switcher.spec.ts` | PASS — 4/4 cases |

## Result

Step (d) is implemented and verified in the working tree. No new IPC channels were added; M-D preserves the M-C exit allowlist shape.
