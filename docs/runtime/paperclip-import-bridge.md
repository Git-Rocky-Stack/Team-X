# Paperclip Import Bridge

> **Status: wired — preview and save in the app; Portability commits.**
> `loadPaperclipExportFolder()` and `previewPaperclipImportBridge()`
> (`apps/desktop/src/main/services/paperclip-import-bridge.ts`) back two IPC
> channels, `paperclip.preview` and `paperclip.savePackage`
> (`apps/desktop/src/main/ipc/paperclip-handlers.ts`), and the
> **Settings → Paperclip Import** panel. This bridge never creates a
> workspace: `paperclip.savePackage` writes the converted package to a
> `.teamx-package.json`, and committing it is the existing Portability import
> (`companies.importPackage`), which owns secret binding, the per-entity plan,
> and conflict resolution.

P2.4 adds a local bridge that maps Paperclip export folders into Team-X workspace package previews. The bridge does not mutate local state directly; it creates the same package/preview contract used by Team-X portability so operators can review the dry-run plan before importing.

## Supported Inputs

`loadPaperclipExportFolder()` reads common export layouts:

- `paperclip-export.json`, `export.json`, or `manifest.json` root files;
- split files such as `company.json`, `workspace.json`, `agents.json`, `workers.json`, `adapters.json`, `runtimes.json`, `tasks.json`, `issues.json`, and `skills.json`.

`previewPaperclipImportBridge()` can also consume an in-memory bundle (used by the tests).

The loader refuses, naming the folder: a path that does not exist, a path that is not a folder, a folder holding none of the export files above, and any export file larger than 50 MB.

## Mapping

- Paperclip agents become Team-X employees.
- Paperclip manager ids become Team-X org-chart edges when both agents exist.
- Supported adapters become runtime profiles: Team-X internal, Bash, HTTP, Codex, Claude Code, and Cursor.
- Unsupported adapters are surfaced as explicit warnings and compatibility notes.
- Paperclip tasks and issues become Team-X tickets.
- Paperclip skills become Team-X skill extensions plus employee skill assignments.
- Secret-looking adapter values become Team-X runtime `secret_ref` entries so inline secrets are not written into the package.

## Operator Workflow

1. In **Settings → Paperclip Import**, click **Choose export folder…** and pick the Paperclip export folder.
2. Review the preview: counts of agents, runtimes, tickets, skills, unsupported adapters, and missing secrets, plus the "Will not convert" and "Secrets you will have to re-enter" lists. Nothing has been written yet.
3. Click **Save as package…** and choose where to write the converted package (the save dialog defaults to `<slug>.teamx-package.json` in Portability's export folder). The package is rebuilt from the folder in the main process, never taken from the renderer.
4. Click **Review & import in Portability** — this stages the saved file into the Portability panel's import field.
5. In Portability, preview the package and bind the missing secrets locally.
6. Import. Portability creates a fresh workspace only after you confirm the preview.
