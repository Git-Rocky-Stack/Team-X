# Strategia Official F10 Role Pack

The curated, hand-written, Fortune-10-quality default role library that ships with Team-X.

## What this is

A pre-built library of synthetic-employee role specifications. Each role is a `role.md` file containing YAML frontmatter (machine-readable metadata) plus a Markdown body (the system prompt template). When you hire an employee in Team-X, the orchestrator reads the role's frontmatter to determine model preferences, tool allowlists, escalation rules, and KPIs, then renders the body as the agent's system prompt — substituting `{{company.name}}`, `{{employee.name}}`, `{{team.reports}}`, and other variables at runtime.

The goal is simple: when a user opens Team-X for the first time, they should find a complete corporate org chart populated with role specifications that read like they were written by the best people manager you've ever worked with — not generic templates, not LLM-generated filler.

## Hierarchy

```
roles/
├─ officer/             # C-suite — final decision-makers
├─ senior_management/   # VPs — own a function
├─ management/          # Managers — own a team
├─ supervisor/          # Supervisors — own a workflow
├─ lead/                # Leads — set technical direction
└─ ic/                  # Individual contributors — execute
```

Each level establishes a different decision authority, escalation pattern, and tool allowlist. Officers have final say. Senior managers own functional outcomes. Managers own team outcomes. Supervisors own workflow throughput. Leads own craft excellence. ICs own delivery.

## Quality bar

Every role.md in this pack must meet the same bar:

- **Hand-written**, not LLM-generated. Each role reflects how a real, excellent practitioner of that role thinks and operates.
- **Specific**, not generic. The CEO is a CEO, not a "leadership figure." The Senior Fullstack Engineer has opinions about TDD, YAGNI, and root-cause debugging — not bland platitudes.
- **Frontmatter complete**. Every required field populated, no placeholders.
- **Body sectioned**. Identity → Mission → Operating Principles → Responsibilities → Decision Framework → Communication Style → Escalation Rules → Tool Usage → Output Format.
- **Template variables used**. The body references `{{company.name}}`, `{{company.mission}}`, `{{employee.name}}`, etc., so one role.md serves many companies.
- **Fortune 10 polish**. Read out loud, the role should sound like it was written by the person it describes.

## Versioning

This pack uses semver. Patch bumps for typo/clarity fixes. Minor bumps for new roles or non-breaking frontmatter additions. Major bumps for breaking changes to the role schema.

When a user edits a role through Team-X, the edit is saved as a local override under `~/.team-x/role-overrides/<company>/<employee>.md`. Upstream pack updates **never** clobber overrides — users always see their customizations until they explicitly choose "Reset to upstream."

## License

MIT. See [`LICENSE`](../../LICENSE) at the repository root.
