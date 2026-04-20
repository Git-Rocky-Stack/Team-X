# Phase 6 Walkthrough: Capabilities & Evidence

**Team-X v1.2.0 release-candidate demo.** This is the Phase 6 add-on
script. It assumes the Phase 5 tour has already shown the basic company,
ticket, meeting, command palette, and Copilot sidebar surfaces. This pass
focuses on what changed in Phase 6: evidence-backed delegation, feedback
learning, per-kind telemetry, and local insight export.

> **Hook (2 lines, on camera):**
> *"Phase 5 made Team-X intelligent. Phase 6 makes the intelligence
> explainable, adjustable, and exportable."*

---

## Audience

Founders, product leads, and engineering managers who already understand
the Phase 5 Intelligence Layer and want to see what v1.2.0 adds. No
implementation context is assumed; every new concept is shown through the
product surface before it is named.

---

## Runtime

| Segment | Scenario | Duration |
|---|---|---:|
| 1 | [Capabilities, feedback, telemetry, and export](./scenarios/06-phase-6-capabilities-evidence.md) | 6 min |
| - | Buffer for narration + transitions | ~1 min |
| **Total** | | **~7 min** |

---

## Arc

Phase 6 is a maturity pass over the Phase 5 Intelligence Layer. The
walkthrough uses one continuous session:

1. **Capability-backed role fit.** Ask the write-side planner to break
   down a project. The outcome demonstrates the existing planner path now
   has role capabilities behind the scoring decision while preserving the
   M32 four-weight formula.
2. **Feedback loop.** Dismiss repeated same-category Copilot insights,
   then apply the surfaced downrank suggestion. The important beat is that
   the user applies the change; Team-X does not silently mutate weights.
3. **Telemetry evidence.** Open Telemetry and switch between Work,
   Agentic, and Copilot filters so the viewer sees system work separated
   from ordinary employee work.
4. **Local export.** Export the visible Copilot insights to JSON or CSV and
   show the saved-filename status copy. Nothing leaves the machine.

---

## What the viewer sees by minute 7

- The planner still requires the amber write-side confirmation gate before
  state-changing work.
- Copilot feedback is explicit: suggestions are visible, reversible by
  choosing not to apply, and journaled through the normal event pipeline.
- Telemetry separates user work, agentic runs, and Copilot analyzer runs.
- Insight export is local, scoped, filtered, and visible through status copy.

---

## Close

> *"Phase 6 does not make Copilot autonomous. It makes the system easier to
> calibrate and easier to prove: role-fit evidence, feedback weights,
> separated telemetry, and local exports."*

---

## Recording setup

- **Resolution:** 1920x1080, 60 fps.
- **Start frame:** Dashboard -> Cards with the default Strategia-X company.
- **DevTools:** closed.
- **Audio:** narrator-only.
- **Preconditions:** Copilot enabled, default seeded company present, and
  the command palette and Copilot sidebar reachable by keyboard.

---

## Script hygiene

- Do not claim autonomous action, cloud sync, cross-company rollups,
  telemetry digest, or native save-dialog behavior.
- Use the exact scenario prompt text where the canned test seams depend on
  it.
- Where narration depends on UI state, the scenario lists a stable
  `data-*` attribute.
- If a future build changes a target, update the scenario and the matching
  E2E selector together.

---

## Versioning

This walkthrough is cut against the Phase 6 v1.2.0 release-candidate state
tracked by M41. The final v1.2.0 version bump and Phase 6 badge freeze land
later in M41; this document intentionally avoids claiming that the release
tag already exists.
