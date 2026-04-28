# Autonomy Benchmark Harness

Status: P2.1 deterministic control-plane harness shipped on 2026-04-28.

Run:

```powershell
pnpm autonomy:benchmark --summary
```

The harness runs the Paperclip benchmark scenarios against Team-X's reference runtime kinds:

- `teamx-internal`
- `bash`
- `http`
- `codex`
- `claude-code`

The first shipped mode is `control-plane-simulated`. It does not launch real external providers. It creates a fresh in-memory Team-X database per scenario/runtime pair and exercises the durable runtime mechanics: sessions, heartbeats, ticket checkouts, conflict prevention, stale-session reaping and recovery, normalized runtime audit events, run-scoped tool-call mirrors, and runtime output artifacts.

Scenarios:

- single ticket claim and completion
- two agents racing for one ticket
- stale worker recovery
- budget hard-stop before execution
- budget hard-stop mid-run
- missing secret failure
- blocked-ticket delegation
- artifact review approval
- import template and run first routine
- reboot/resume with existing checkpoint

Report metrics:

- success rate
- duplicate-work rate
- stale recovery time
- cost
- token count
- latency
- operator interventions
- artifact completeness

Useful filters:

```powershell
pnpm autonomy:benchmark --runtime bash,codex --scenario race-for-one-ticket --summary
pnpm autonomy:benchmark --out .\autonomy-benchmark-report.json
```

Interpretation:

- A passing result means the Team-X control plane enforced the expected contract for that scenario.
- `duplicateWorkRate` should stay `0` for the race scenario; checkout conflicts are expected and healthy.
- `artifactCompleteness` should stay `1` for scenarios where a deliverable is expected.
- The simulated mode is the baseline for future live Bash/HTTP/Codex/Claude Code adapter benchmarks and dashboard trend charts.
