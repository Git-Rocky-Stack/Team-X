# Autonomy Control Plane

The **Autonomy** tab is the operating control plane for Team-X execution. Mission Control shows what is happening now; Autonomy explains why execution is allowed, how it is governed, and which recurring or external systems are shaping the workload.

Use this page when preparing unattended work, reviewing runtime health, approving risky actions, or turning repeated failures into durable tickets.

## Subviews

| Subview | Use it for |
|---------|------------|
| Doctor | Run deterministic readiness checks for database integrity, backups, runtime posture, secrets, providers, MCP health, and budget blockers. |
| Benchmarks | Replay deterministic autonomy scenarios and inspect pass rates, duplicate-work prevention, recovery timing, spend, and artifact evidence. |
| Improve | Run the agent self-improvement loop and review open improvement tickets plus recent loop history. |
| Runtimes | Bind employees to explicit execution profiles and inspect live runtime posture. |
| Routines | Define recurring operating loops that materialize as visible work instead of hidden background automation. |
| Budgets | Review spend governance, warnings, hard caps, and approval thresholds across company, employee, runtime, and routine scopes. |
| Approvals | Process authority, planner, budget, and routine decisions from one operator inbox. |
| Artifacts | Review concrete runtime outputs, agent-created files, and evidence captured from autonomous execution. |
| Memory | Inspect thread digests, resumable checkpoints, and packed-context posture for long-running work. |
| Access | Review local, invited, and cloud-ready operator membership posture for the workspace. |

## Agent Self-Improvement Loop

The **Improve** subview turns operational patterns into ordinary tickets so the team fixes process problems through the same durable queue as product work.

When you click **Run Improvement Loop**, Team-X inspects recent events and tickets for these signals:

- repeated `work.failed` events
- `runtime.execution.failed` or `runtime.session.stale` events
- tickets currently in `blocked`
- tickets left `in-progress` for 48 hours or more

For each signal, Team-X opens a self-improvement ticket unless an open ticket for that same signal already exists. Improvement tickets are labeled with `agent-improvement`, `self-improvement`, `agent-improvement:auto-created`, and the signal-specific label such as `agent-improvement:blocked-tickets`.

The Improve panel shows:

- open self-improvement ticket count
- recent loop-run history
- the latest run result, including inspected event count, inspected ticket count, recommendations, and created ticket IDs
- direct links into the Tickets view for any open improvement ticket

## Operating Pattern

Before launching long or external work:

1. Run **Doctor** to confirm the workspace is ready.
2. Check **Runtimes** so every employee has explicit execution posture.
3. Review **Budgets** and **Approvals** so spend and authority blockers are visible before work starts.
4. Use **Benchmarks** when you need repeatable evidence that runtime mechanics still behave correctly.
5. Run **Improve** after failures, stalls, or a heavy work session so repeated problems become actionable correction tickets.
6. Inspect **Artifacts** and **Memory** when the question is what a runtime produced or what context a long thread retained.

## Agent-Created File Evidence

When an employee creates a deliverable with execution tools, Team-X writes the file inside that employee's workspace. If vault storage is available, the same output is copied into the File Vault, tagged `agent-created`, and recorded as an Artifact with employee provenance.

Use **Files** to browse, verify integrity, search, and attach the output to tickets. Use **Autonomy > Artifacts** when you need the execution record: which employee created it, which vault record it points to, and how it fits into recent autonomous work.

## Related Runtime Docs

- [Autonomy Doctor](../runtime/autonomy-doctor.md)
- [Autonomy benchmark harness](../runtime/autonomy-benchmark-harness.md)
