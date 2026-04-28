# Private Operator Access

P2.3 adds the policy and read-only data contract for optional private operator supervision. The surface is intentionally local-first:

- bind to `127.0.0.1` by default;
- use Tailscale or another private tunnel in front of the local listener when a phone needs access;
- expose read-only Mission Control first;
- enable approval review only after explicit operator opt-in and membership checks;
- keep runtime launch and secret changes behind late-stage, explicit gates.

The implementation lives in `createPrivateOperatorAccessService`.

## Capabilities

The service returns a machine-readable plan with allowed and blocked actions:

- `mission-control.read`, `runtime.read`, `tickets.read`, and `artifacts.read` are the first-stage mobile supervision actions.
- `approvals.review` requires explicit opt-in and an operator membership that can approve budget or authority work.
- `runtime.launch` requires explicit opt-in and runtime-management membership.
- `secrets.write` stays localhost-only and requires a privileged operator. Tailscale and hosted-bridge modes block it.

## Guardrails

The plan refuses public bind hosts such as `0.0.0.0`, always reports `exposure: "localhost-only"`, and omits runtime snapshots when guardrails fail. Decrypted runtime secrets must never appear in snapshots, URLs, logs, renderer payloads, or hosted callbacks.

## Snapshot Contract

`snapshot()` returns:

- the access plan;
- sharing readiness;
- operator memberships;
- pending invites;
- runtime operations only when read-only Mission Control access is allowed.

This lets Team-X add a local HTTP or hosted bridge adapter later without changing the security model or the mobile-facing payload shape.
