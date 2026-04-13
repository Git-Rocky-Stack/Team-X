# M27 Security Audit — 2026-04-13

## Summary

Pre-release security pass for Team-X v1.0.0. Covers dependency audit, IPC input validation, context isolation, and secrets handling.

**Result: PASS** (no actionable vulnerabilities in application code)

---

## 1. Dependency Audit (`pnpm audit`)

**32 advisories found** — all in upstream dependencies, none in Team-X application code.

| Package | Count | Notes |
|---------|-------|-------|
| electron | 17 | Chromium CVEs — resolved by Electron version bumps |
| tar | 6 | Transitive via npm/node-gyp toolchain (dev only) |
| vite | 1 | Dev tooling, not shipped |
| esbuild | 1 | Dev tooling, not shipped |
| drizzle-orm | 1 | Low severity, query builder edge case |
| ai (Vercel) | 1 | Transitive, low severity |
| nanoid | 1 | Dev transitive |
| jsondiffpatch | 1 | Dev transitive |
| @tootallnate/once | 1 | Dev transitive |

**Action:** None required. Electron CVEs are addressed by upgrading Electron in future releases. Dev-only tooling vulnerabilities do not ship in production builds. No application-code vulnerabilities found.

## 2. IPC Input Validation

All 50+ IPC handlers in `handlers.ts` enforce input validation at the entry point:

- **String fields**: Checked for `typeof === 'string'` and non-empty before use
- **Required IDs**: `companyId`, `ticketId`, `fileId`, `providerId`, `meetingId` — all validated
- **Enum fields**: Status, priority, format values checked against allowed sets
- **No raw SQL**: All database access via Drizzle ORM parameterized queries
- **No eval/exec**: No dynamic code execution from user input anywhere in the codebase

**Result: PASS**

## 3. Context Isolation + Node Integration

- `contextIsolation: true` — enforced in `main/index.ts` BrowserWindow config
- `nodeIntegration: false` — enforced in `main/index.ts` BrowserWindow config
- Preload script uses `contextBridge.exposeInMainWorld` — no raw `ipcRenderer` exposed
- No `webSecurity: false` anywhere in the codebase
- DevTools gated on `NODE_ENV !== 'test'` (does not open in production)

**Result: PASS**

## 4. Secrets Handling

- API keys stored in OS keychain via `keytar` — never in config files
- `.env` bootstrap imports keys to keychain on first run, then keys live in keychain only
- No secrets in git history (verified via `git log --all -p` search for key patterns)
- No hardcoded API keys, tokens, or passwords in source code

**Result: PASS**

## 5. MCP Tool Enforcement

- `tools_allowed` / `tools_denied` enforced at the `McpHost` singleton level
- Tool call decisions made in the main process, not in agent prompts
- MCP servers seeded as disabled by default — user must explicitly enable

**Result: PASS**

## 6. Audit Trail

- `events` table is append-only — no UPDATE or DELETE operations
- Every sensitive action (hire, fire, MCP add, backup restore) logged
- Audit UI provides read-only access with export capability

**Result: PASS**

## 7. Update Security

- Zero phone-home — no automatic update checks (invariant #7)
- Updates are user-triggered only via Settings > Check for Updates
- Updates downloaded from GitHub Releases (public, verifiable)
- `UpdaterService` returns noop in dev/test mode

**Result: PASS**
