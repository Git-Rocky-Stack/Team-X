# Scenario 06: Capabilities, Feedback, Telemetry, and Export

**Phase 6 headline: evidence-backed calibration.** The viewer runs one
planner flow, trains Copilot with explicit feedback, verifies separated
telemetry, and exports the current insight set locally.

| Field | Value |
|---|---|
| **Duration** | 6 minutes |
| **Exercises** | Phase 6 - M36/M37-R capability role-fit, M38 feedback loop, M39 telemetry kind filter, M40 insight export |
| **Starts on** | Dashboard -> Cards |
| **Ends on** | Copilot sidebar open with export status visible |

---

## Hook (narrator, 1 line)

> *"Now we prove the intelligence is calibrated, not just active."*

---

## Setup preconditions

- Default Strategia-X company is present.
- Copilot is enabled.
- Use the exact planner prompt below when recording against the test-mode
  demo build:
  - *"decompose the frontend redesign into tickets"*
- Keyboard targets:
  - `Cmd+K` or `Ctrl+K` for the command palette.
  - `Cmd+Shift+K` for the Copilot sidebar.

---

## Scripted sequence

1. **Open the command palette.**
   - Press `Cmd+K` or `Ctrl+K`.
   - Type: *"decompose the frontend redesign into tickets"*.
   - Confirm the intent chip reads **Route to Agent**.
2. **Pause on the write-side gate.**
   - The confirmation card reads **Confirm write-side agentic run**.
   - Narrator: *"This still uses the M32 safety gate. Phase 6 improves the
     evidence behind the planner; it does not remove approval."*
   - Click **Confirm**.
3. **Show the planner result.**
   - Wait for the answer card:
     `data-step-kind="answer"`.
   - Narrator: *"The role-fit portion of the scorer is now backed by the
     role capability taxonomy reconciled in M36 and M37-R, while the locked
     four-weight formula stays intact."*
4. **Open the Copilot sidebar.**
   - Click the toolbar Sparkles button or use `Cmd+Shift+K`.
   - Stable target: `data-copilot-toolbar-toggle`.
   - Sidebar root: `data-copilot-sidebar-root`.
5. **Generate and dismiss repeated cost insights.**
   - Use the demo build's manual analyzer tick if available, or wait for
     the pre-seeded insight cadence.
   - Dismiss three **cost** insights.
   - Insight cards carry `data-copilot-category="cost"`.
6. **Apply the feedback suggestion.**
   - Suggestion target: `data-copilot-feedback-suggestion`.
   - Apply button: `data-copilot-feedback-apply`.
   - Narrator: *"Team-X suggests the downrank, but the user applies it.
     There is no silent Copilot self-tuning."*
7. **Open Telemetry.**
   - Click **Telemetry** in the left navigation.
   - Total runs card: `data-telemetry-stat="total-runs"`.
8. **Switch kind filters.**
   - Work: `data-telemetry-kind-filter="work"`.
   - Agentic: `data-telemetry-kind-filter="agentic"`.
   - Copilot: `data-telemetry-kind-filter="copilot"`.
   - Narrator: *"The same run table now separates ordinary work, agentic
     loop runs, and Copilot analyzer runs."*
9. **Return to the Copilot sidebar and export.**
   - Reopen the sidebar if needed.
   - Optional category filter:
     `data-copilot-category-filter="<category>"`.
   - JSON export button: `data-copilot-export-format="json"`.
   - CSV export button: `data-copilot-export-format="csv"`.
10. **Show local export status.**
    - Status target: `data-copilot-export-status`.
    - Narrator: *"The export is local. The app reports the row count and the
      saved filename; it does not sync or upload this anywhere."*

---

## Key moments to highlight on camera

- **The amber gate remains.** Capability role-fit improves evidence, not
  permissioning.
- **Feedback is explicit.** The user sees and applies the category-weight
  suggestion.
- **Agentic telemetry has real producer data.** Agentic runs are written as
  `kind="agentic"` and are visible through the Agentic filter.
- **Export is scoped and local.** The viewer sees filters, format buttons,
  row count, and filename status copy.

---

## What the viewer just saw

- Capability-backed planner role-fit without changing the write-side safety
  gate.
- Copilot feedback loop with an append-only event behind the settings
  change.
- Work / Agentic / Copilot telemetry separated in the UI.
- Local JSON/CSV export of active Copilot insights.

---

## Dependencies

- Phase 6 M36/M37-R - capability taxonomy, role parsing, role-loader lookup,
  and role-fit scorer reconciliation.
- Phase 6 M38 - Copilot feedback suggestion and `copilot.weights.changed`.
- Phase 6 M39 - Telemetry kind filter.
- Phase 6 M40 - local insight export.
- Phase 6 M41 T1 - integration E2E proving the flow in one fresh Electron
  boot.

## Data attributes referenced

| Attribute | Location |
|---|---|
| `data-step-kind="answer"` | Command palette step log |
| `data-copilot-toolbar-toggle` | Sparkles toolbar button |
| `data-copilot-sidebar-root` | Copilot sidebar root |
| `data-copilot-category="cost"` | Copilot insight card category marker |
| `data-copilot-feedback-suggestion` | Feedback suggestion container |
| `data-copilot-feedback-apply` | Feedback suggestion apply button |
| `data-telemetry-stat="total-runs"` | Telemetry total-runs stat card |
| `data-telemetry-kind-filter="work"` | Work filter chip |
| `data-telemetry-kind-filter="agentic"` | Agentic filter chip |
| `data-telemetry-kind-filter="copilot"` | Copilot filter chip |
| `data-copilot-category-filter="<category>"` | Sidebar category filter |
| `data-copilot-export-format="json"` | JSON export button |
| `data-copilot-export-format="csv"` | CSV export button |
| `data-copilot-export-status` | Export result status copy |

---

## Close

Narrator, closing 2 lines:
> *"Phase 6 is about proof. You can see why the planner chose a role, teach
> Copilot what to downrank, split system work from normal work, and export
> the evidence locally."*
