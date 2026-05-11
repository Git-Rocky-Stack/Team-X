# Contributing to Team-X

Thank you for your interest in contributing to Team-X. This guide covers everything you need to get started.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Testing](#testing)
- [Contributing Role Packs](#contributing-role-packs)
- [IPC Channel Conventions](#ipc-channel-conventions)
- [Process Safeguards](#process-safeguards)
- [Branch Policy](#branch-policy)
- [Quarterly Conformance Re-Audit](#quarterly-conformance-re-audit)
- [Troubleshooting](#troubleshooting)

---

## Development Setup

### Prerequisites

- **Node.js** 20.11.0+ (see `.nvmrc`)
- **pnpm** 9.0.0+
- **Git**
- **Windows 11**, **macOS 13+**, or **Ubuntu 22.04+** (native module compilation)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/Git-Rocky-Stack/Team-X.git
cd Team-X

# Install dependencies (triggers electron-rebuild postinstall)
pnpm install

# Start the dev server with HMR
pnpm dev
```

The app opens with a seeded Strategia-X company, a CEO, and a Senior Fullstack Engineer. If you have Ollama running locally with `llama3.1:8b` pulled, you can chat with the agents immediately.

### Environment Variables

Create `apps/desktop/.env` for local development:

```env
# Optional — only needed for cloud providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...
TOGETHER_API_KEY=...
FIREWORKS_API_KEY=fw_...
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Keys are imported into the OS keychain on first boot via `bootstrapEnvKeys`. After that, the `.env` file can be removed.

---

## Project Structure

```
Team-X/
  apps/desktop/               Electron application
    src/main/                 Main process
      db/                     SQLite schema, migrations, repos
      ipc/                    IPC handlers + channel registration
      orchestrator/           Agent scheduler, event bus, work queue
      services/               Business logic (vault, backup, MCP, etc.)
    src/preload/              Context-isolated bridge
    src/renderer/             React UI
      features/               Feature-scoped components
      hooks/                  React Query IPC hooks
      store/                  Zustand store
    e2e/                      Playwright E2E specs
  packages/
    shared-types/             IPC contract types (TeamXApi)
    role-schema/              Role.md frontmatter parser + template renderer
    provider-router/          LLM provider registry + streaming adapters
    telemetry-core/           Cost calculation math
  role-packs/
    strategia-official/       55 curated roles (the default pack)
  docs/                       Plans, audits, user guide
  scripts/                    Build helpers, smoke tests
```

### Workspace Packages

Team-X uses pnpm workspaces. The four shared packages under `packages/` are consumed by `apps/desktop` via TypeScript project references:

- **shared-types** — the IPC contract (`TeamXApi` interface). Rebuild declarations after editing: `pnpm -F @team-x/shared-types exec tsc --build`
- **role-schema** — parses `role.md` frontmatter and renders Handlebars-style template variables
- **provider-router** — registry of LLM provider adapters, enforces privacy tiers + concurrency caps
- **telemetry-core** — token-to-cost math for supported models

---

## Development Workflow

### Branching

- `main` — the primary development branch
- Feature branches: `feat/<description>`
- Bug fixes: `fix/<description>`

### Commit Messages

Use conventional commits:

```
feat(scope): short description
fix(scope): short description
refactor(scope): short description
test(scope): short description
docs(scope): short description
```

Scopes: `vault`, `tickets`, `meetings`, `orchestrator`, `mcp`, `providers`, `telemetry`, `audit`, `backup`, `updater`, `roles`, `renderer`, `installer`.

### Useful Commands

```bash
pnpm dev                        # Dev server with HMR
pnpm test                       # Unit tests (Vitest)
pnpm test:watch                 # Watch mode
pnpm typecheck                  # TypeScript across all workspaces
pnpm lint                       # Biome check
pnpm lint:fix                   # Biome auto-fix
pnpm format                     # Biome format
pnpm -F @team-x/desktop test:e2e  # Playwright E2E (builds first)
```

**Important:** Always run `pnpm typecheck` at the repo root. The workspace-scoped `pnpm -F @team-x/desktop typecheck` does not traverse project references and silently misses regressions in shared packages.

---

## Coding Standards

### TypeScript

- **Strict mode** everywhere. No `any` types in new code.
- Use Biome for formatting and linting (not ESLint/Prettier).
- Prefer `const` over `let`. Never use `var`.
- Use explicit return types on exported functions.
- Avoid default exports (use named exports).

### Architecture Rules

These are non-negotiable. Violating them requires a design-doc amendment:

1. **Renderer is a pure view.** No LLM or MCP calls from the renderer. Everything goes through the typed IPC bridge.
2. **Orchestrator is the only scheduler.** Do not dispatch agent work outside the orchestrator.
3. **MCP Host is a singleton.** One connection pool in the main process.
4. **Provider router is the only LLM gateway.** All LLM calls flow through it.
5. **Events table is append-only.** Never update or delete rows.
6. **Zero phone-home.** No analytics, telemetry, or auto-update checks.
7. **Secrets in the OS keychain only.** Never in config files or environment at runtime.

### File Organization

- **Main process services**: one file per service in `src/main/services/`, factory pattern with dependency injection
- **IPC handlers**: interface in `src/main/ipc/handlers.ts`, implementation per-domain, registration in `register-channels.ts`
- **Renderer features**: one directory per feature in `src/renderer/src/features/`, co-located components
- **Hooks**: one file per IPC domain in `src/renderer/src/hooks/`

### Naming Conventions

- Files: `kebab-case.ts`
- Components: `PascalCase.tsx`
- IPC channels: `namespace.verb` (e.g., `tickets.create`, `vault.upload`)
- Database tables: `snake_case`
- TypeScript types/interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`

---

## Pull Request Guidelines

1. **One logical change per PR.** Don't bundle unrelated changes.
2. **All checks must pass:** `pnpm test`, `pnpm typecheck`, `pnpm lint`.
3. **Write tests** for new features and bug fixes. Unit tests at minimum; E2E for user-facing workflows.
4. **Update types.** If you add or modify IPC channels, update `packages/shared-types/src/ipc.ts` and the preload bridge.
5. **No new `any` types.** Use `unknown` and narrow with type guards if needed.
6. **Run the full E2E suite** before submitting: `pnpm -F @team-x/desktop test:e2e`.

### PR Template

```markdown
## What

Brief description of what changed and why.

## How

Key implementation decisions or trade-offs.

## Testing

- [ ] Unit tests added/updated
- [ ] E2E tests pass
- [ ] Manual verification (describe what you tested)

## Checklist

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes (run at repo root)
- [ ] `pnpm lint` passes
- [ ] No new `any` types
- [ ] IPC types updated if channels changed
```

---

## Testing

### Unit Tests (Vitest)

Every service, repository, and handler should have unit tests. Test files live alongside their source:

```
services/vault.ts
services/vault.test.ts      (Vitest will pick this up)
```

Run tests:

```bash
pnpm test                   # All workspaces
pnpm test:watch             # Watch mode
pnpm test:coverage          # With coverage report
```

### E2E Tests (Playwright)

E2E specs live in `apps/desktop/e2e/`. They launch a real Electron instance against a test-mode provider (no network, no API keys).

```bash
pnpm -F @team-x/desktop test:e2e       # Build + run
pnpm -F @team-x/desktop test:e2e:run   # Run without rebuilding
```

When writing E2E tests:
- Use `getByRole` and `getByText` for accessible selectors
- Scope locators to containers when text appears in multiple DOM nodes
- The test-mode provider returns canned responses — no real LLM calls

### Test-Mode Provider

Setting `NODE_ENV=test` activates the canned-reply provider. This is how E2E tests run without Ollama or API keys. The provider returns deterministic responses that the specs assert against.

---

## Contributing Role Packs

Role packs are the crown jewel of Team-X. The default pack (`role-packs/strategia-official/`) contains 55 hand-written roles.

### Role File Structure

Each role is a Markdown file with YAML frontmatter:

```markdown
---
id: chief-technology-officer
name: Chief Technology Officer
level: officer
reports_to: [chief-executive-officer]
manages: [vp-engineering, vp-product]
preferred_model_tier: planning
preferred_providers: [anthropic, openai]
fallback_providers: [openrouter, groq]
tools_allowed: ["*"]
tools_denied: []
decision_authority: strategic
kpis: [system-uptime, deployment-frequency, engineering-velocity]
output_format: structured
temperature: 0.7
license: MIT
author: Strategia-X
version: 1.0.0
---

# Identity

You are {{employee.name}}, the {{role.name}} at {{company.name}}.
...
```

### Writing a New Role

1. Choose the appropriate level directory under `role-packs/strategia-official/roles/`:
   - `officer/` — C-suite (CEO, CTO, CFO, etc.)
   - `senior-mgmt/` — VPs and Directors
   - `management/` — Department heads and managers
   - `supervisor/` — Team supervisors
   - `lead/` — Tech leads and team leads
   - `ic/` — Individual contributors (engineers, designers, analysts)

2. Create a new `.md` file with the full frontmatter schema.

3. Structure the body with these sections:
   - `# Identity` — who the agent is
   - `# Mission` — what they're responsible for
   - `# Responsibilities` — specific duties
   - `# Decision Framework` — how they make choices
   - `# Communication Style` — tone and approach
   - `# Escalation Rules` — when to defer to a manager
   - `# Output Format` — how they structure responses

4. Use template variables: `{{company.name}}`, `{{company.mission}}`, `{{employee.name}}`, etc.

5. Version bumps follow semver. Breaking changes to frontmatter keys are major bumps.

### Community Role Packs

Community packs will support Ed25519 signature verification (M27). Pack structure mirrors the official pack — a `pack.json` manifest plus a `roles/` directory tree.

---

## IPC Channel Conventions

All IPC channels follow a typed contract defined in `packages/shared-types/src/ipc.ts`. When adding a new channel:

1. **Define the type** in the `TeamXApi` interface
2. **Implement the handler** in `apps/desktop/src/main/ipc/handlers/`
3. **Register the channel** in `register-channels.ts`
4. **Expose via preload** in `preload/index.ts`
5. **Create a React hook** in `src/renderer/src/hooks/`

Channel naming: `namespace.verb` (e.g., `vault.upload`, `meetings.call`).

---

## Process Safeguards

> Phase 5.6 M-E shipped a six-point safeguard suite (S1–S6) that catches CLAUDE.md/reality drift before it merges. Drift was allowed to accumulate for 10+ milestones before the M-A conformance audit ([`docs/audits/2026-04-17-conformance-audit.md`](docs/audits/2026-04-17-conformance-audit.md)) caught it; the safeguards make the same drift impossible to recur.
>
> Plan: [`docs/plans/2026-04-17-team-x-phase-5.6-remediation.md`](docs/plans/2026-04-17-team-x-phase-5.6-remediation.md) §7.

| ID | Safeguard | Lives at | Enforcement |
|---|---|---|---|
| **S1** | Milestone DoD template | [`docs/templates/milestone-dod.md`](docs/templates/milestone-dod.md) | Every milestone exit checklist (M-C onward + every future phase) |
| **S2** | CI conformance check | [`.github/workflows/conformance.yml`](.github/workflows/conformance.yml) + [`scripts/check-claim-evidence.mjs`](scripts/check-claim-evidence.mjs) | Runs on every push + PR via `pnpm audit:claims`; fails on any unallowed missing-evidence claim |
| **S3** | Pre-commit claim-evidence hook | [`.husky/pre-commit`](.husky/pre-commit) | Local fast-path of S2 scoped to staged CLAUDE.md diffs |
| **S4** | Loki ledger `verifiedBy` field | [`.loki/queue/schema.json`](.loki/queue/schema.json) + [`apps/desktop/src/loki-verified-by.test.ts`](apps/desktop/src/loki-verified-by.test.ts) | Every shipped sub-milestone names concrete evidence artifacts; vitest fails if missing |
| **S5** | Branch policy | This file's [§Branch Policy](#branch-policy) section | Stranded `worktree-*` branches caught at the 14-day mark; merge-or-delete by 30 days |
| **S6** | Quarterly re-audit cadence | [`docs/audits/SCHEDULE.md`](docs/audits/SCHEDULE.md) + this file's [§Quarterly Conformance Re-Audit](#quarterly-conformance-re-audit) section | Re-audit every 3 months OR every 5 milestones, whichever first |

### Engaging the safeguards locally

```bash
# One-time per clone — point Git at the husky-style hooks directory.
git config core.hooksPath .husky

# Manually run the full conformance check (matches what CI runs).
pnpm audit:claims

# Strict mode (zero allowlist) — used at M-G ship and at quarterly re-audits.
pnpm audit:claims:strict

# JSON output for tooling.
pnpm audit:claims:json > audit-claims.json
```

### When the conformance check fails

If `pnpm audit:claims` reports an unallowed gap, you have three paths:

1. **Add the evidence.** Implement the IPC handler / bus event / migration / etc. that the claim requires. Re-run.
2. **Allowlist the gap with an audit row.** Add an entry to [`scripts/check-claim-evidence.allowlist.json`](scripts/check-claim-evidence.allowlist.json) with `claim`, `auditRow`, `disposition`, `owner`, `reason`. Open a paired audit-doc row first — the allowlist is NOT a free pass, it is a cross-reference to a tracked gap.
3. **Remove the claim from CLAUDE.md.** If the feature was never actually built and never will be, delete the row from CLAUDE.md and add an `M-F docs-truth-up` style explanation in the commit message.

`--no-verify` is reserved for emergency commits and MUST be paired with a follow-up commit that addresses the root cause.

---

## Branch Policy

> **S5 of the Phase 5.6 M-E process safeguards suite.** The root cause of the M7/M9 drift surfaced in the M-A conformance audit was a stranded `worktree-phase-2-the-org` branch that everyone assumed had been merged but never was. This policy makes the same failure mode impossible to recur.

### Long-lived branches

- `main` — the primary development branch. All ship traffic flows through here.
- `feat/<description>` — short-lived feature branches. Target lifetime: ≤2 weeks.
- `fix/<description>` — short-lived bug-fix branches. Target lifetime: ≤1 week.
- `worktree-*` prefix — RESERVED for short-lived scratch / experiment branches under `git worktree`. **NOT** a long-lived integration target.

### Stranded-branch detection

- Any branch with un-merged commits older than **14 days** triggers a stale-branch warning at the next quarterly conformance re-audit.
- A merge plan or deletion is required before the **30-day** mark.
- Branches preserved for evidence (e.g. `worktree-phase-2-the-org` during Phase 5.6 M-A → M-G) are documented in the active phase plan with an explicit deletion gate. They are NOT exempt from the policy — they are exempt by-name with a paper trail.

### Cherry-pick contract

Cherry-picking IS a valid restoration tactic when a branch is stranded but its content is salvageable (Phase 5.5 hotfix used it for the 20 stranded role.md files; Phase 5.6 M-C uses it for Cluster A + Cluster B). Rules:

1. The cherry-pick commit message MUST cite the source SHA AND the audit row that justifies the restoration.
2. The commit MUST adapt the cherry-picked code to the current main HEAD (no force-merge of stale APIs).
3. The cherry-pick MUST be paired with a passing test that exercises the restored surface.
4. If the cherry-pick fails on conflict and the conflict is non-trivial (>20 lines OR involves a renamed module), abandon the cherry-pick and re-implement from scratch with the branch as a reference, not a source.

### Merge-before-delete workflow

Branches are deleted by:

1. Merging into `main` (preferred — preserves the commit chain).
2. OR cherry-picking the salvage-worthy commits into a fresh branch, merging that, then deleting the original (used when the stranded branch's history is too divergent to merge cleanly).
3. OR explicitly deprecating the branch with a `docs/audits/<date>-branch-deprecation-<name>.md` row that names every commit the project is choosing to drop and the reason.

Path 3 is the LAST RESORT and requires the milestone-completion ledger entry to enumerate the dropped SHAs.

### Stranded-branch sweep cadence

Performed at every quarterly conformance re-audit (S6). Output: a row in the audit doc per branch — name, age, last-touch SHA, owner, recommendation (merge / cherry-pick / deprecate / preserve-with-reason).

---

## Quarterly Conformance Re-Audit

> **S6 of the Phase 5.6 M-E process safeguards suite.** Drift accumulated for 10+ milestones before the first audit caught it; quarterly cycles cap the next remediation at ≤3 months of accumulated drift, not 10+ milestones'.

### Cadence

> **Every 3 months OR every 5 milestones, whichever first.**

The 5-milestone counter is the safety net for fast-shipping seasons. Phase 5 shipped 8 milestones in ~2 weeks; under 3-month-only cadence, a similar burst could ship 10+ milestones before the next audit. The 5-milestone trip wire keeps the audit cycle in lockstep with delivery velocity.

### Schedule

The single source of truth for upcoming audits + audit history lives at [`docs/audits/SCHEDULE.md`](docs/audits/SCHEDULE.md). That doc carries:

- Audit log (date / trigger / audit doc / drift surfaced / remediation)
- Next scheduled re-audit date + 5-milestone counter state
- Delta-diff template (re-audits compare against the previous audit, NOT a full re-author)

### Outcome routing

If a re-audit surfaces:

- **≥1 P0 row OR ≥3 P1 rows** → open a Phase 5.6-style remediation playbook (M-A audit → M-B triage → M-E safeguards (already in place — re-verify) → M-C/M-D restore → M-F docs → M-G ship).
- **<1 P0 + <3 P1** → fold remediation into the next regular phase; track gaps via the audit doc + allowlist.

### Owner

Currently: **Rocky Elsalaymeh** (delegated to Loki/Claude on the day, supervised review). Once Team-X has a deployment cadence with multiple maintainers (Phase 6+), the audit owner rotates per the audit log entry.

---

## Troubleshooting

### Native Module Errors

```bash
pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar
```

### Database Out of Sync

Delete the dev database and let it reseed:

```bash
# Windows (PowerShell)
Remove-Item -Force "$env:APPDATA\Team-X\team-x\team-x.sqlite*"
```

### Typecheck Passes but Tests Fail

Vitest may pick up Playwright E2E files. Confirm `apps/desktop/vitest.config.ts` excludes `e2e/**`.

### E2E Tests Hang

Check for DevTools auto-opening (gated on `NODE_ENV !== 'test'`) or Playwright locators matching multiple DOM nodes.

See the full troubleshooting section in [CLAUDE.md](CLAUDE.md) for more.

---

## Code of Conduct

Be respectful, constructive, and collaborative. We're building something meaningful — treat every contributor's time and effort with the same care you'd want for your own.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
