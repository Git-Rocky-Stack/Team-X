# Autonomy Doctor

**Status:** P1 operator health workflow.

Autonomy Doctor produces a deterministic JSON-ready report for the current workspace before an operator launches unattended external runtime work.

## Entry Points

- **In app:** Autonomy > Doctor.
- **CLI:** `pnpm autonomy:doctor -- --company <company-id>`.
- **Custom DB:** `pnpm autonomy:doctor -- --db <absolute-path-to-team-x.sqlite> --company <company-id>`.

## Checks

- SQLite quick-check and required control-plane tables.
- Backup age and manifest availability.
- Runtime profile binding and validation posture.
- Runtime secret refs and inline sensitive config values.
- Live runtime sessions and active ticket checkout leases.
- Workspace path availability.
- Enabled MCP server health.
- Enabled provider readiness.
- Budget warnings, exceeded policies, and pending budget approvals.

The CLI can read SQLite and filesystem state. It cannot decrypt OS keychain credentials, so provider and runtime secret refs that require keychain verification should be confirmed with the in-app doctor.
