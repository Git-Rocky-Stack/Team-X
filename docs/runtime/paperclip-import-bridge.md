# Paperclip Import Bridge

P2.4 adds a local bridge that maps Paperclip export folders into Team-X workspace package previews. The bridge does not mutate local state directly; it creates the same package/preview contract used by Team-X portability so operators can review the dry-run plan before importing.

## Supported Inputs

`loadPaperclipExportFolder()` reads common export layouts:

- `paperclip-export.json`, `export.json`, or `manifest.json` root files;
- split files such as `company.json`, `workspace.json`, `agents.json`, `workers.json`, `adapters.json`, `runtimes.json`, `tasks.json`, `issues.json`, and `skills.json`.

`previewPaperclipImportBridge()` can also consume an in-memory bundle for tests or future UI/CLI wiring.

## Mapping

- Paperclip agents become Team-X employees.
- Paperclip manager ids become Team-X org-chart edges when both agents exist.
- Supported adapters become runtime profiles: Team-X internal, Bash, HTTP, Codex, Claude Code, and Cursor.
- Unsupported adapters are surfaced as explicit warnings and compatibility notes.
- Paperclip tasks and issues become Team-X tickets.
- Paperclip skills become Team-X skill extensions plus employee skill assignments.
- Secret-looking adapter values become Team-X runtime `secret_ref` entries so inline secrets are not written into the package.

## Operator Workflow

1. Load or paste a Paperclip export folder.
2. Generate the bridge preview.
3. Review mapped employees, runtime profiles, tickets, skill assignments, unsupported adapters, and missing secret refs.
4. Bind missing secrets locally through the existing Team-X package import flow.
5. Import the generated workspace package only after the preview is acceptable.
