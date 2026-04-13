# Backup and Restore

Team-X stores all data locally — your database and vault files. The backup system lets you create portable archives and restore from them.

## Creating a Backup

1. Go to **Settings > Backup & Restore**
2. Click **Create Backup**
3. Choose a destination folder in the native save dialog
4. Team-X creates a `.teamx-backup` archive containing:
   - The SQLite database (after WAL checkpoint for consistency)
   - All vault files for every company
   - A `manifest.json` with version, timestamp, company count, file count, and total size

The backup runs in the background. A progress indicator shows the status.

## What's Included

| Data | Included |
|------|----------|
| Companies and employees | Yes |
| Org chart relationships | Yes |
| All conversations and threads | Yes |
| Tickets and kanban state | Yes |
| Goals and projects | Yes |
| Meeting minutes and threads | Yes |
| Vault files | Yes |
| Telemetry/run history | Yes |
| Audit event log | Yes |
| Provider configurations | Yes (keys stored separately in keychain) |
| API keys | **No** (stored in OS keychain, not in the database) |

API keys are not included in backups because they live in the OS keychain. After restoring on a new machine, you'll need to re-enter your API keys in Settings > Providers.

## Restoring from Backup

> **Warning:** Restoring replaces your current database and vault files. This operation is destructive.

1. Go to **Settings > Backup & Restore**
2. Click **Restore**
3. Select a `.teamx-backup` archive from the file picker
4. Confirm the restore in the warning dialog
5. Team-X:
   - Validates the archive manifest
   - Stops the orchestrator (pauses all agent work)
   - Replaces the database and vault directories
   - Restarts and reseeds if needed

The app reloads after restore completes.

## Backup History

The **Backup History** section in Settings shows all backups created from Team-X, with:

- Timestamp
- File size
- Number of companies included

Click on a backup entry to see its full manifest details.

## Backup Location

By default, backups are saved wherever you choose in the save dialog. A common pattern:

| Platform | Suggested Location |
|----------|-------------------|
| Windows | `%USERPROFILE%\Documents\Team-X Backups\` |
| macOS | `~/Documents/Team-X Backups/` |
| Linux | `~/Documents/Team-X Backups/` |

## Best Practices

- **Back up before major changes** — before firing employees, restoring a previous backup, or deleting companies
- **Back up before updates** — create a backup before installing a new version of Team-X
- **Store backups externally** — copy backups to an external drive or cloud storage for disaster recovery
- **Test your backups** — periodically restore a backup to verify it works (use a separate machine or user profile to avoid overwriting your live data)
