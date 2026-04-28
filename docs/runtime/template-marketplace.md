# Template Marketplace Workflow

P1.4 turns Team-X portability into an operator workflow for reusable company templates. A template package is still a local-first `.teamx-package.json` file, but the operator can now source it from disk or from GitHub and inspect the full dry-run plan before installing or creating a workspace.

## Supported Sources

The package preview, install, and import IPC calls accept either `packagePath` or `packageRef`.

- Local file: `C:\templates\support-ops.teamx-package.json`
- GitHub blob URL: `https://github.com/owner/repo/blob/main/templates/support-ops.teamx-package.json`
- GitHub raw URL: `https://raw.githubusercontent.com/owner/repo/main/templates/support-ops.teamx-package.json`
- GitHub shorthand with hash ref: `owner/repo/templates/support-ops.teamx-package.json#main`
- GitHub shorthand with explicit ref separator: `owner/repo@main:templates/support-ops.teamx-package.json`
- GitHub repo default template: `gh:owner/repo`, resolved to `teamx-template.teamx-package.json` on `main`

Only HTTPS GitHub URLs are supported. Other HTTP sources are rejected so template provenance stays narrow and auditable.

## Preview Contract

`companies.previewImportPackage` reads the package, validates the Team-X package schema, and returns:

- manifest, warnings, compatibility, and redactions;
- structured source metadata;
- structured missing-secret rows;
- runtime template diagnostics;
- a dry-run plan with `create`, `rename`, `skip`, and `replace` actions.

The plan is non-destructive. It explains slug rename behavior, remapped employees/org/runtime/routine/budget rows, skipped live state in template packages, skipped starter asset materialization, and secrets that must be replaced locally.

## Secret Binding

Runtime `secret_ref` entries with `key: "apiKey"` are bindable from the preview UI. The renderer sends `secretBindings` to import or install calls, and the main process writes those values to the OS keychain through `SecretsStore.setApiKey`.

Redacted package fields without provider metadata are shown as manual follow-up rows. They are not written blindly because the package cannot prove which local keychain account owns them.

## Operator Flow

1. Open Settings > Portability & Templates.
2. Paste a local package path, GitHub URL, or GitHub shorthand.
3. Review the manifest, source, dry-run plan, runtime diagnostics, warnings, and secret rows.
4. Bind provider API keys when available.
5. Install a template into the local library or import a workspace package as a new workspace.
6. Create new workspaces from installed templates through the workspace create dialog.

Template imports preserve roles, org chart, runtime profiles, routines, budget policies, extension metadata, authority grants, skill assignments, dashboard-facing settings, and origin metadata while keeping the operation local-first and non-destructive.
