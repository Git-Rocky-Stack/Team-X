# Branch Governance

How changes reach `main`, and how releases are tagged. This page answers finding P1-5 of the [2026-10-07 engineering audit](../CODEBASE_AUDIT_2026-10-07.md): `main` had no protection, large changes landed by direct merge with failing CI, and pull requests merged with zero reviews.

## The rules

The rulesets are checked in under [`.github/rulesets/`](../../.github/rulesets). `apps/desktop/src/governance.test.ts` keeps them in sync with the workflows: a required check must be a job a PR workflow actually reports, and every CODEOWNERS path must exist.

**`main` (default branch):**

- Changes arrive through a pull request. Direct pushes, force-pushes and deletion are refused.
- One approving review, from a code owner ([`.github/CODEOWNERS`](../../.github/CODEOWNERS)). A new push dismisses earlier approvals, the last push must itself be approved, and every review thread must be resolved.
- Required checks, which must pass on a branch up to date with `main`:
  - Lint · Typecheck · Test on Ubuntu, macOS and Windows
  - E2E smoke (Electron)
  - Policy gates (dependency audit)
  - Claim-evidence audit
- Merge commits only. This matches the repository's history; rebase and squash are off.

**Release tags (`v*`):**

- Only the maintainer can create, move or delete them.
- Every tag must be signed (see [Signing release tags](#signing-release-tags)).

## The review wall

The rulesets enforce the mechanical part of [CR-7](../../CLAUDE.md):

1. CI green.
2. `/review` on the diff.
3. A Codex review, run by the maintainer. It is required for changes under the trust-boundary and release paths that CODEOWNERS marks (main process, preload, IPC, CSP, privacy and providers, local-network policy, role-pack signing, workflows, dependencies).
4. Maintainer sign-off.

The audit asks for two approvals on security and release changes. GitHub cannot require a different approval count per path, and Team-X has one human maintainer. Until a second reviewer joins, the Codex gate is the independent review for those paths. When a second maintainer joins, raise `required_approving_review_count` to 2 for all changes.

## Applying the rulesets

This is a repository-settings change, so the maintainer applies it with admin rights:

```bash
gh auth login                       # as a repository admin
scripts/apply-github-rulesets.sh    # creates or updates both rulesets by name
```

Re-run the script after editing a JSON file. It updates the existing rulesets in place.

## Break-glass

As the only human reviewer, the maintainer cannot approve their own pull request. The `main` ruleset therefore lets the repository admin role bypass the review requirement, **only through a pull request**. The PR, its CI and its history remain the record.

A direct push to `main` is never allowed, even in an emergency. If something must land immediately (a revert of a broken release, a leaked-secret rotation):

1. Open an issue labelled `break-glass` that says what and why.
2. Open the PR, and merge it with the admin bypass once the required checks pass, or with them pending if the incident cannot wait.
3. Link the PR from the issue and close the issue.

## Signing release tags

`release.yml` publishes from a `v*` tag, and the tag ruleset refuses an unsigned one. Configure signing once, with an SSH key you already use for GitHub:

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global tag.gpgSign true
```

Add the same public key to GitHub as a **Signing key** (Settings → SSH and GPG keys). Then tag the release:

```bash
git tag -s v3.5.0 -m "Team-X v3.5.0"
git push origin v3.5.0
```

Run the release workflow's dry run (Actions → Release → Run workflow) before you tag; see [Release Signing](release-signing.md).
