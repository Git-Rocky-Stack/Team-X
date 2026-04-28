# Adaptive Runtime Routing

P2.2 adds a deterministic routing policy in `@team-x/provider-router`:
`routeAdaptiveWork(input)`.

The policy turns a work request, available providers, available runtime
profiles, and an optional autonomy benchmark report into one decision:

- `provider`: run through an internal Team-X provider;
- `runtime`: run through an execution-backed runtime profile;
- `blocked`: refuse the route because the required privacy or runtime
  contract cannot be satisfied.

## Policy Lanes

The router encodes the P2 audit routing lanes:

| Work | Default route |
| --- | --- |
| Low-risk triage | Cheap local provider first |
| Planning | Strongest allowed planning tier |
| Review | Strongest allowed review tier |
| Repository work | Codex, Claude Code, Cursor, then Bash runtime profiles |
| Hosted bots | HTTP runtime profiles |
| Private company data | Hard local-only policy |

Private work always clamps `maxPrivacyTier` to `local`. Hosted HTTP profiles
and proprietary cloud providers are not eligible for private data unless the
work is reclassified or a local runtime/provider exists.

## Benchmark Use

When an `AutonomyBenchmarkReport` is provided, runtime candidates are scored
from their benchmark results:

- pass rate;
- duplicate-work prevention;
- artifact completeness;
- latency;
- cost.

Health state and policy order still matter, but benchmark evidence can move
work from one otherwise-valid runtime kind to another. This lets Team-X route
repository or hosted-bot work based on measured control-plane behavior rather
than static preference alone.

## Decision Evidence

Every decision includes:

- selected provider or runtime profile id;
- requested model tier;
- effective privacy tier;
- human-readable reasons;
- `runtimeScores` showing ranked runtime candidates;
- `providerCandidates` showing allowed provider ids.

That evidence is designed for future Mission Control and audit surfaces. It is
also useful in tests because a blocked decision can explain exactly which policy
prevented execution.
