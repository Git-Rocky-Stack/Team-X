# Vault-Backup E2E Regression — Root-Cause Findings

**Date:** 2026-04-13
**Surfaced during:** M29 T10 verification pass
**Status:** Diagnosed. Fix design locked. Implementation queued as M30-T0.
**Scope impact:** UI-only staleness. Functional path (DB + filesystem vault) is correct.

---

## 1. Symptom

`apps/desktop/e2e/vault-backup.spec.ts` fails at line 173:

```ts
await expect(window.getByText('test-document.md')).toBeVisible({ timeout: 10_000 });
```

The prior IPC call at line 159-166 succeeds:

```ts
const uploadResult = await window.evaluate(
  async ({ cid, path }) => w.teamx.vault.upload({ companyId: cid, sourcePath: path }),
  { cid: companyId, path: testFilePath },
);
expect(uploadResult?.fileId).toBeTruthy();   // passes — file IS in DB + on disk
```

The file reaches the `file_vault` table and the on-disk company vault. The renderer never re-renders the file list.

All four other E2E specs (`smoke`, `ticket-flow`, `meeting-flow`, `rag-flow`) pass — they all route through the orchestrator event bus, which already has a renderer-side subscriber wired in `apps/desktop/src/main/ipc/register.ts:691-710`.

## 2. Root cause

**Architectural gap**, not a test bug. Three facts together explain the failure:

1. **`useVaultUpload`'s invalidation is mutation-scoped.** `apps/desktop/src/renderer/src/hooks/use-vault.ts:32-42` invalidates `['vault','files',companyId]` and `['vault','stats',companyId]` **only** inside the `onSuccess` of the React Query mutation. No invalidation fires if the mutation is not the entry point.

2. **The E2E bypasses the hook.** The spec calls `window.teamx.vault.upload(...)` directly via `page.evaluate`. Native file dialogs are not drivable in Playwright-Electron; going through the hook would require driving the real `<Upload>` button + an Electron `dialog.showOpenDialog` stub. So the test intentionally bypasses the mutation and hits IPC directly — which leaves React Query's cache untouched.

3. **The vault service emits no events.** `apps/desktop/src/main/services/vault.ts` writes the DB row and returns. It never calls `bus.emit(...)`. The renderer's dashboard-event subscriber (which drives agent streams, meetings, ticket updates) has nothing to listen for.

Net effect: `useVaultFiles` fetches once on mount, returns `[]` (empty vault), and caches forever. The component stays mounted (test does not navigate away between upload and assertion). The UI is permanently stale until the query is manually invalidated.

## 3. Why the other E2E specs don't trip this

| Spec | Refresh mechanism |
|------|-------------------|
| `smoke.spec.ts` | Chat reply streams via `token.delta` events → renderer's event subscriber → store update. No React Query involvement on the hot path. |
| `ticket-flow.spec.ts` | Agent reply streams via event bus. Ticket thread store subscribes to events, no cache to invalidate. |
| `meeting-flow.spec.ts` | Meeting minutes stream via `meeting.turn` / `meeting.ended` events. Same as above. |
| `rag-flow.spec.ts` | RAG indexer subscribes to `work.completed` events. Renderer reads `rag.stats` manually after explicit user action. |
| `vault-backup.spec.ts` | **No event path. Only React Query. Only the mutation hook invalidates. Bypassed.** |

Vault is the only pure CRUD surface in the app that lacks an event path.

## 4. Fix design — match invariant #6

CLAUDE.md invariant #6: *"Events table is append-only. Source of truth for the realtime dashboard. Orchestrator writes; renderer subscribes."*

The fix aligns vault with this invariant rather than papering over the symptom:

### 4.1 Extend the event schema

Add two new event types in `packages/shared-types/src/events.ts`:

```ts
export type EventType =
  | ... existing ...
  | 'vault.file_created'
  | 'vault.file_deleted';

export interface VaultFileCreatedPayload {
  fileId: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
}

export interface VaultFileDeletedPayload {
  fileId: string;
}
```

### 4.2 Emit from the vault service

`apps/desktop/src/main/services/vault.ts` gains a `bus` dependency. After the DB commit in `upload` and `remove`:

```ts
bus.emit<VaultFileCreatedPayload>({
  type: 'vault.file_created',
  companyId,
  actorId: 'system',
  actorKind: 'system',
  payload: { fileId: id, originalName, sizeBytes, mimeType },
});
```

Ordering guarantee (event-bus docstring): subscribers never see an event before it is durably persisted. Safe to invalidate caches on receipt.

### 4.3 Renderer subscription

New hook `useVaultEventSync(companyId)` in `apps/desktop/src/renderer/src/hooks/use-vault.ts`. Mounts once in `VaultView`. Listens to `window.teamx.events.onEvent` (existing preload bridge), filters by `companyId + type ∈ {vault.file_created, vault.file_deleted}`, calls `queryClient.invalidateQueries({ queryKey: ['vault'] })`.

### 4.4 Audit log side-effect (free win)

Vault mutations become first-class entries in the audit log (M24's `AuditView`) because every emitted event is persisted. Currently, vault operations are invisible to the audit view — this closes the gap.

## 5. Fix scope

| Surface | Files touched | LoC estimate |
|---------|---------------|--------------|
| Shared types | `packages/shared-types/src/events.ts` | +15 |
| Vault service | `apps/desktop/src/main/services/vault.ts` | +25 (bus dep + 2 emit sites) |
| Ticket attachments | `apps/desktop/src/main/services/vault.ts` (via `attachFile`) | 0 (piggybacks on emit) |
| Composition root | `apps/desktop/src/main/index.ts` | +2 (pass bus into vault factory) |
| Renderer hook | `apps/desktop/src/renderer/src/hooks/use-vault.ts` | +30 (new `useVaultEventSync`) |
| Renderer view | `apps/desktop/src/renderer/src/features/vault/vault-view.tsx` | +2 (mount the hook) |
| Unit tests | `apps/desktop/src/main/services/vault.test.ts` | +40 (emit on create, emit on delete, fake bus) |
| Renderer test | deferred (no DOM test infra) | 0 |
| E2E | `apps/desktop/e2e/vault-backup.spec.ts` | 0 (should pass unchanged) |

## 6. Validation plan

1. Rebuild native modules for Vitest: `(cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release)`
2. `pnpm -F @team-x/desktop test` — expect new vault emit tests to pass, all existing tests green.
3. Rebuild for Electron: `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`
4. `pnpm -F @team-x/desktop test:e2e` — all 5 specs green.
5. Manual check: `pnpm dev`, upload a file via the real UI button, confirm no duplicate fetches / infinite loop (the hook must use `companyId` as subscription scope).
6. Manual check: verify `AuditView` now shows vault events.

## 7. Prevention

- **Architectural rule (new, add to CLAUDE.md):** Any IPC channel that mutates DB-backed state must either (a) be consumed exclusively through a React Query mutation with documented invalidation **and** have its main-process handler emit a bus event, OR (b) not be exposed to the renderer at all (internal-only). Pure-CRUD-without-events is disallowed because it creates the exact stale-cache class of bug M30-T0 fixes.
- **Add a lint check (future):** grep `ipcMain.handle` for mutation channels (create/update/delete/add/remove/assign) and assert each one also calls `bus.emit` somewhere in the same file.

## 8. Ownership

- **Diagnosed:** 2026-04-13 during M29 T10 verification.
- **Fix owner:** M30 — folded in as T0 (before NLU work begins) so the vault event surface exists for future RAG-on-vault indexing in M32.
- **Marker commit:** will reference this findings doc.
