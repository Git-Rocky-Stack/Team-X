## Summary

<!-- What changes, and why. Link the issue or audit finding (e.g. CODEBASE_AUDIT_2026-10-07 P1-3). -->

## Changes

-

## Verification

<!-- The commands you ran and what they showed. Paste real output; "tests pass" is not evidence. -->

- [ ] `pnpm install --frozen-lockfile` from a clean checkout
- [ ] `pnpm lint` · `pnpm lint:eslint` · `pnpm typecheck`
- [ ] `pnpm test` (or `pnpm test:coverage`: the thresholds must still hold)
- [ ] Electron E2E (`pnpm -F @team-x/desktop test:e2e`, under `xvfb-run` on Linux)
- [ ] `pnpm audit:deps` if dependencies changed

## Trust boundary and privacy

<!-- Does this touch IPC, preload, main/security, the CSP, providers, secrets, the local-network policy, role-pack signing, or the release workflow? If so, say how it was exercised. Otherwise write "None". -->

## Review wall (CR-7)

- [ ] Stage 1: CI green on the latest commit
- [ ] Stage 2: `/review` on the diff, every finding answered
- [ ] Stage 3: Codex review run by the maintainer (required for trust-boundary or release changes)
- [ ] Stage 4: maintainer sign-off

## Release notes

<!-- One line for CHANGELOG.md / What's New, or "Internal only". -->
