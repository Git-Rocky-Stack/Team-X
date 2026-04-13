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
git clone https://github.com/strategia-x/team-x.git
cd team-x

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
