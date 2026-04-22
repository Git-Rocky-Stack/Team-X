> **Status:** Drafted 2026-04-22 from the approved product direction.
> **Scope:** Add a unified `Extensions & Authority` control plane for skills, MCP servers, and filesystem/capability grants, with user-selectable autonomy behavior in Settings.
> **Primary driver:** Team-X can already manage providers and enforce MCP tool allow/deny, but it has no first-class way to install skills, govern MCP provenance, or grant scoped authority to directories and files.

---

## 1. Problem Statement

Team-X currently has three disconnected trust surfaces:

1. AI providers are managed in Settings.
2. MCP servers exist in main-process storage and IPC, but there is no renderer management surface for them.
3. Employee authority is implicitly derived from role-pack `tools_allowed` / `tools_denied` plus main-process enforcement, with no user-facing way to broaden or narrow directory/file access.

That leaves the product short in three ways:

- users cannot install or assign reusable skills
- users cannot manage MCPs and skills through one coherent trust model
- users cannot explicitly decide which directories, files, or capabilities an employee may use

The result is flexibility without a usable control plane.

---

## 2. Goals

- Add a visible Settings surface for `Skills`, `MCP Servers`, and `Authority`.
- Support skill installation from:
  - local folder
  - GitHub repo
  - marketplace manifest
- Preserve existing MCP execution infrastructure instead of replacing it.
- Introduce workspace/company default authority plus per-employee overrides.
- Let users grant explicit path-scoped filesystem authority:
  - files
  - directories
  - read
  - write
  - execute
- Add a user-selectable autonomy policy in Settings.
- Default autonomy to an auto-enabled mode that still stops clearly sensitive expansions from happening silently.
- Keep provenance, requested authority, effective authority, and health visible in one place.

---

## 3. Non-goals

- No generic remote code execution sandbox in this pass.
- No attempt to hot-load Codex-session MCP config directly from Team-X. Team-X manages its own runtime registry.
- No marketplace backend implementation in the first slice. Marketplace support can start from a signed manifest format plus local catalog.
- No automatic trust of arbitrary GitHub repositories beyond the selected autonomy policy and explicit review surfaces.
- No attempt to replace role-pack authority defaults. This layer extends and governs them.

---

## 4. Product Decisions

### 4.1 One control plane, not three

The Settings app gets a new top-level section:

- `Extensions & Authority`

It contains four panels:

- `Autonomy Policy`
- `Skills`
- `MCP Servers`
- `Authority`

This keeps install source, trust state, requested access, and effective access in one place.

### 4.2 Default autonomy is `Balanced`

The default mode should feel auto-enabled without being reckless.

- `Balanced`:
  - installs are enabled automatically
  - low-risk capability requests are approved automatically
  - sensitive capability or path-expansion requests require review
- `Conservative`:
  - installs land disabled
  - all new authority requests require review
- `Autonomous`:
  - installs are enabled automatically
  - requested authority is auto-granted unless blocked by hard-deny rules

This satisfies the user requirement that the default experience be auto-enabled while still preserving a trust boundary.

### 4.3 Skills are first-class extensions

Skills are not hidden prompt fragments. They become installable records with:

- provenance
- version
- source kind
- requested capabilities
- requested path grants
- enablement
- assignment scope
- health / validation status

### 4.4 MCP stays execution-native

Existing MCP tables, IPC, and `McpHost` remain the runtime substrate. The new control plane wraps them with:

- provenance
- trust state
- authority review
- install/import flows

This avoids destabilizing the already-working `mcp_servers` and `mcp_host` path.

### 4.5 Authority is scoped and layered

Authority resolves from four layers:

1. hard platform denies
2. role-pack defaults
3. workspace/company defaults
4. per-employee overrides

Extension requests never bypass hard denies. They only become effective through the autonomy policy or explicit approval.

---

## 5. Recommended Architecture

## 5.1 Settings surface

Extend [settings-view.tsx](../../apps/desktop/src/renderer/src/features/settings/settings-view.tsx) with a new `ExtensionsSection`.

Recommended internal layout:

- `Autonomy Policy Card`
- `Installed Skills Card`
- `Installed MCP Servers Card`
- `Authority Matrix Card`

This should live beside, not under, `ProvidersSection`. Providers answer “which model runtime do we use?” while extensions answer “what can the runtime do?”

## 5.2 Registry layer

Add a new extension registry service in main that owns:

- install metadata
- source validation
- enable/disable state
- assignment metadata
- requested authority metadata
- health checks

Existing `mcp_servers` rows remain runtime entries. The new registry becomes the durable source for UI-facing extension metadata.

## 5.3 Authority resolver

Add a dedicated authority resolver in main that computes effective access for a given employee from:

- role defaults from `toolsAllowedJson` / `toolsDeniedJson`
- workspace defaults
- employee overrides
- approved extension grants

This resolver feeds:

- MCP tool execution
- future filesystem-aware skills
- future shell/network capability checks

## 5.4 Assignment model

Skills need an execution scope or installation alone does nothing.

Recommended assignment levels:

- workspace enabled
- employee enabled
- employee disabled override

Phase 1 should ship workspace install + per-employee enablement. More granular “activate only for this thread” can wait.

---

## 6. Data Model

## 6.1 New tables

### `extensions`

One row per installed extension record.

Suggested fields:

- `id`
- `kind` (`skill` | `mcp`)
- `company_id` nullable
- `name`
- `slug`
- `source_kind` (`local` | `github` | `marketplace` | `template`)
- `source_ref`
- `version`
- `update_channel`
- `manifest_json`
- `requested_capabilities_json`
- `requested_paths_json`
- `enabled`
- `trust_state` (`trusted` | `pending-review` | `denied`)
- `installed_at`
- `updated_at`
- `runtime_ref_id` nullable

`runtime_ref_id` points at an execution-native row when needed, especially existing `mcp_servers.id`.

### `skill_assignments`

Maps installed skills to the workspace or employee scope.

Suggested fields:

- `id`
- `extension_id`
- `company_id`
- `employee_id` nullable
- `enabled`
- `source` (`workspace-default` | `employee-override`)
- `created_at`
- `updated_at`

### `authority_grants`

Unified capability/path grants.

Suggested fields:

- `id`
- `scope_kind` (`company` | `employee` | `extension`)
- `scope_id`
- `resource_kind` (`capability` | `path`)
- `resource_id`
- `permission` (`allow` | `deny` | `prompt`)
- `metadata_json`
- `created_at`
- `updated_at`

`resource_id` examples:

- capability: `shell`, `network`, `filesystem.read`, `filesystem.write`, `skills.install`, `mcp.manage`
- path: absolute normalized Windows path

### `authority_requests`

Tracks requested but not yet approved grants.

Suggested fields:

- `id`
- `extension_id`
- `employee_id` nullable
- `resource_kind`
- `resource_id`
- `requested_permission`
- `status` (`pending` | `approved` | `denied`)
- `requested_at`
- `reviewed_at`

## 6.2 Existing tables kept intact

- `mcp_servers`
- `tool_calls`
- `employees.tools_allowed_json`
- `employees.tools_denied_json`
- `settings`

The plan should extend, not replace, these surfaces.

## 6.3 Settings keys

Add new global settings keys:

- `extensions_autonomy_mode`
- `extensions_marketplace_url` optional
- `extensions_default_install_scope`
- `extensions_sensitive_capabilities_json`

If desired, company-specific defaults can remain in `companies.settings_json` rather than the global `settings` table.

---

## 7. Authority Model

## 7.1 Capability classes

Split capability grants from path grants.

Initial capability set:

- `skills.install`
- `skills.update`
- `mcp.manage`
- `network`
- `shell`
- `filesystem.read`
- `filesystem.write`
- `filesystem.execute`
- `secrets.read`
- `secrets.write`

## 7.2 Path grants

Every path grant must store:

- normalized absolute path
- path type (`file` or `directory`)
- permissions (`read`, `write`, `execute`)
- whether the grant is recursive

Recommended default rule:

- directory grants are recursive by default
- file grants are exact by default

## 7.3 Resolution order

Effective authority should resolve in this order:

1. hard deny
2. explicit employee deny
3. explicit company deny
4. approved employee allow
5. approved company allow
6. approved extension-scoped allow
7. role defaults
8. implicit deny

This keeps user overrides authoritative while preserving a deterministic fallback.

---

## 8. Install And Import Flows

## 8.1 Local skill install

User flow:

1. choose local folder
2. Team-X validates manifest / folder structure
3. requested capabilities and paths are parsed
4. autonomy policy decides:
   - enabled immediately
   - enabled with pending authority review
   - installed disabled

## 8.2 GitHub install

User flow:

1. paste repo or manifest URL
2. Team-X fetches manifest / release metadata
3. Team-X snapshots the install into the local extension directory
4. requested authority goes through the same review path

GitHub installs should pin to a commit SHA in metadata, not just a branch name.

## 8.3 Marketplace install

Phase 1 marketplace support can be a signed catalog manifest:

- metadata
- download location
- version
- requested authority
- publisher identity

This is enough to support discovery without building a full remote service first.

## 8.4 MCP import

Supported MCP entry paths:

- manual add from Settings
- import template from built-in catalog
- import manifest from marketplace/GitHub

Every imported MCP entry materializes both:

- extension metadata
- execution runtime row in `mcp_servers`

---

## 9. Runtime Integration

## 9.1 Skills

Phase 1 skill runtime should focus on prompt/runtime augmentation, not arbitrary code execution.

Skills may contribute:

- system-prompt snippets
- tool definitions or aliases
- instruction bundles
- recommended authority requests

That keeps the first implementation powerful but still inspectable.

## 9.2 MCP execution

`McpHost` remains the only MCP execution pool. The new authority resolver wraps its current allow/deny check.

Current call path:

- `runAgent`
- `resolveTools`
- `mcpHost.callTool`

Future path:

- `runAgent`
- `resolveTools`
- `authorityResolver.resolveEmployeeAuthority(...)`
- `mcpHost.callTool`

## 9.3 Filesystem-aware tools

Any future filesystem tool must ask the authority resolver before read/write/execute.

This design intentionally creates that resolver before Team-X ships file-manipulating skills.

---

## 10. Error Handling And Trust UX

- Invalid manifest: install blocked with explicit reason
- Missing local path: install remains present but unhealthy
- GitHub fetch failure: install stays unchanged, update marked failed
- MCP connection failure: show unhealthy state without deleting the extension
- Pending authority request: extension may remain enabled but capability/path stays unavailable until approved

The UI should never hide why an extension is partially functional.

---

## 11. Rollout Strategy

### Phase 1

- ship the settings section
- ship extension registry
- wrap current MCP management in the new UI
- ship local/GitHub skill installs
- ship company + employee authority grants

### Phase 2

- signed marketplace catalog
- update channels
- richer skill assignment and thread-scoped activation
- deeper shell/network/filesystem integrations

---

## 12. Recommended First Cut

The best first implementation slice is:

1. add the registry tables and authority tables
2. add `Extensions & Authority` Settings UI
3. migrate current MCP management into that surface
4. add local skill install only
5. add company defaults + employee overrides for capability/path grants

This delivers visible value fast without waiting on marketplace or GitHub distribution.
