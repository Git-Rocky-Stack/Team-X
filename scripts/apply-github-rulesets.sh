#!/usr/bin/env bash
# Create or update the repository rulesets in .github/rulesets/*.json
# (audit 2026-10-07 P1-5). Idempotent: a ruleset whose name already exists
# is updated in place, so re-running after editing a JSON file applies it.
#
# Requires the GitHub CLI, authenticated as a repository admin:
#   gh auth login
#   scripts/apply-github-rulesets.sh [owner/repo]
set -euo pipefail

repo="${1:-Git-Rocky-Stack/Team-X}"
dir="$(cd "$(dirname "$0")/../.github/rulesets" && pwd)"

existing="$(gh api "repos/${repo}/rulesets" --paginate --jq '.[] | "\(.id)\t\(.name)"')"

for file in "${dir}"/*.json; do
  name="$(jq -r .name "${file}")"
  id="$(printf '%s\n' "${existing}" | awk -F'\t' -v n="${name}" '$2 == n { print $1 }')"
  if [ -n "${id}" ]; then
    gh api --method PUT "repos/${repo}/rulesets/${id}" --input "${file}" >/dev/null
    echo "updated ruleset \"${name}\" (#${id})"
  else
    gh api --method POST "repos/${repo}/rulesets" --input "${file}" --jq '"created ruleset \"\(.name)\" (#\(.id))"'
  fi
done
