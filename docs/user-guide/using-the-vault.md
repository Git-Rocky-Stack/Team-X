# Using the Vault

The File Vault is Team-X's built-in file storage system. Files are stored on your local filesystem with SHA256 integrity verification and full-text search.

## Overview

- **Local storage** — files are copied to a vault directory inside your app data folder
- **SHA256 integrity** — every file is checksummed on upload and can be verified at any time
- **FTS5 search** — file names, extracted text content, and tags are searchable via SQLite full-text search
- **Ticket attachments** — vault files can be linked to tickets for agent-accessible workflows
- **Agent-created deliverables** — employee-generated files can land in the vault and artifact feed with provenance

## Uploading Files

1. Navigate to the **Files** tab
2. Click the **Upload** button
3. Select one or more files from the native file dialog
4. Files are copied to the vault, checksummed, and indexed

## Agent-Created Files

Agents can create deliverables directly from a task when their execution tools are enabled. Supported outputs include:

- Plain text: `.txt`, `.md`, `.csv`, `.json`, `.html`
- Office documents: `.docx`, `.xlsx`, `.pptx`
- Legacy Office requests: `.doc`, `.xls`, and `.ppt` are created as modern `.docx`, `.xlsx`, and `.pptx` files

Generated files are written inside the agent's workspace first. When vault storage is available, Team-X also copies the file into the File Vault, records SHA256 metadata, tags it as `agent-created`, and surfaces it in **Files** and **Autonomy > Artifacts** with the creating employee as provenance.

### Request Pattern

Use ordinary task language in chat or on a ticket:

- "Create a Markdown rollout brief for this ticket."
- "Build an XLSX status table with owner, priority, due date, and blocker columns."
- "Draft a PPTX project update with one slide for scope, one for progress, and one for risks."

The agent should report the created workspace path and, when vault storage succeeds, the vault file reference. Treat the deliverable as complete only after the tool result confirms the file path or vault record.

### What Happens on Upload

- The file is copied to `<app-data>/companies/<company>/vault/<sha256-prefix>/<filename>`
- A SHA256 hash is computed and stored with the file metadata
- For text-based files (Markdown, plain text, source code), the content is extracted and indexed in FTS5
- The file appears in the vault browser immediately

## Browsing Files

The vault browser shows all files for the current company:

- **Grid/list view** — file icons with names, sizes, and upload dates
- **Mime type indicators** — different icons for images, documents, code, and other types
- **Metadata** — file size, upload date, SHA256 hash
- **Provenance** — agent-created files appear with employee attribution through the artifact feed

## Searching

Use the search bar at the top of the Files tab to find files:

- **Filename search** — matches against the original filename
- **Content search** — matches against extracted text from text-based files
- **Tag search** — matches against any tags associated with files

The search uses SQLite FTS5 for fast, ranked results.

## File Detail Panel

Click on a file to open the detail panel showing:

- **Original name** and mime type
- **File size** and upload timestamp
- **SHA256 hash** — the integrity checksum
- **Extracted text** preview (for text-based files)
- **Actions** — download, verify integrity, attach to ticket, delete

## Integrity Verification

To verify a file hasn't been corrupted or tampered with:

1. Open the file detail panel
2. Click **Verify Integrity**
3. Team-X recomputes the SHA256 hash and compares it against the stored value
4. Result: **Pass** (hashes match) or **Fail** (file has been modified)

## Attaching Files to Tickets

Files in the vault can be linked to tickets:

1. Open a ticket's detail panel
2. In the **Attachments** section, click **Attach File**
3. Select a file from the vault picker
4. The file is linked to the ticket

Attached files appear as chips in the ticket detail. Click to preview or download.

### Detaching Files

To remove an attachment:
1. Open the ticket detail
2. Find the attachment chip
3. Click the remove button

Detaching only removes the link — the file stays in the vault.

## Storage Location

Vault files are stored at:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\Team-X\team-x\companies\<company>\vault\` |
| macOS | `~/Library/Application Support/Team-X/team-x/companies/<company>/vault/` |
| Linux | `~/.config/Team-X/team-x/companies/<company>/vault/` |

Files are organized by SHA256 prefix to prevent filename collisions and distribute storage evenly.
