# Command Palette

The Command Palette is Team-X's natural-language command surface. Instead of clicking through menus to hire an employee, assign a ticket, or call a meeting, type what you want and Team-X classifies the intent, resolves the entities, and executes — with a confirmation gate for destructive actions.

## Overview

- **One keystroke** — `Ctrl+K` (Windows / Linux) or `Cmd+K` (macOS) opens the palette from any view
- **15 intents** — covers the full spectrum of org operations: hire, fire, promote, assign, create, close, reopen, project, goal, meeting, status, navigation, vault search, and a fallback to the conversational agent
- **Local-first** — classification runs through your configured LLM provider; with Ollama on the local privacy tier, nothing leaves your machine
- **Destructive-action gate** — fire, close, end-meeting, and promote require an explicit confirm click before the IPC fires
- **History + audit** — every executed command is written to history (recallable with `ArrowUp`) and appended to the audit log as a `command.executed` event

## Opening the Palette

| Action | Shortcut |
|--------|----------|
| Open the palette | `Ctrl+K` (Win/Linux) or `Cmd+K` (macOS) |
| Close the palette | `Esc` |
| Submit / confirm | `Enter` |
| Cycle history (from empty input) | `ArrowUp` / `ArrowDown` |

The keybinding is platform-aware and resolves at runtime in `app-shell.tsx`. There is no per-view variation — the palette is global.

## What You Can Say

Team-X classifies your input into one of 15 intents. Each intent has required and optional entity slots; the palette will ask for clarification when an entity is ambiguous and for confirmation when an action is destructive.

| Intent | Examples |
|--------|----------|
| `hire_employee` | "Hire a senior backend engineer", "We need a CTO" |
| `fire_employee` | "Fire James", "Let go of Sarah Chen" |
| `promote_employee` | "Promote Mike to VP Engineering", "Move Sarah to tech lead" |
| `assign_ticket` | "Assign the auth bug to Sarah", "Give ticket #42 to James" |
| `create_ticket` | "File a ticket for the login crash", "New ticket: optimize the dashboard query" |
| `close_ticket` | "Close ticket #17", "Mark the auth bug as done" |
| `reopen_ticket` | "Reopen ticket #17", "The login bug is back — reopen it" |
| `create_project` | "Start a project called Onboarding Redesign", "New project for Q2 launch" |
| `create_goal` | "Add a goal: ship MVP by end of quarter", "Set a goal for 99.9% uptime" |
| `call_meeting` | "All-hands with the engineering team", "Call a meeting with Sarah and Mike about the launch" |
| `end_meeting` | "End the meeting", "Wrap up the all-hands" |
| `check_status` | "What is everyone working on?", "Show me the team's status" |
| `show_view` | "Take me to projects", "Open the audit log" |
| `search_vault` | "Find the API spec", "Search vault for onboarding docs" |
| `complex_request` | "Why is the frontend team behind schedule?", "Plan the next sprint based on open tickets" |

`complex_request` is the catch-all: anything ambiguous, multi-step, or below the confidence threshold gets routed to the conversational agent (M31's agentic loop). You will never get a hard "I don't understand" response — you will get a thoughtful one.

## Destructive Actions

Four intents are gated by an explicit confirmation step:

- `fire_employee`
- `close_ticket`
- `end_meeting`
- `promote_employee`

When the palette classifies one of these, you will see a summary line ("Fire Sarah Chen (Senior Frontend Engineer)?") with a **Confirm** and **Cancel** button. Pressing `Enter` while focused on Confirm executes; `Esc` or Cancel aborts. Non-destructive actions (`hire_employee`, `assign_ticket`, `create_*`) execute on the first `Enter` and surface an undo toast.

The gate is enforced in main-process code (`CommandService.execute` rejects without `confirmed: true` on destructive intents). The renderer cannot bypass it.

## Ambiguous Matches

If the entity resolver finds 2-5 candidates for a name or reference, the palette asks you to pick:

- "Sarah" with two Sarahs in the org → palette shows both, you click one
- "the auth bug" matching three open tickets → palette ranks by FTS5 relevance and shows the top three
- "frontend engineer" matching multiple roles in the catalog → palette lists role names with level chips

Use `ArrowDown` / `ArrowUp` to navigate the candidate list, `Enter` to select. If no match is found, the palette returns `not_found` and you can refine the input or use a more specific reference (e.g., `#42` for tickets, full names for employees).

## History

Every successful command is written to history (last 20, FIFO) and persisted in the `settings` key-value store. Recall:

- Open the palette with empty input
- Press `ArrowUp` to cycle through your last 20 commands, newest first
- `ArrowDown` to cycle forward
- `Enter` to re-execute, or edit the recalled text first

History also appears as a "Recent Commands" panel on the Dashboard subview.

## Slash Commands

For navigation without going through the classifier, use the structured `/show` syntax:

| Command | Action |
|---------|--------|
| `/show dashboard` | Switch to Dashboard tab |
| `/show tickets` | Switch to Tickets tab |
| `/show projects` | Switch to Projects tab |
| `/show meetings` | Switch to Meetings tab |
| `/show telemetry` | Switch to Telemetry tab |
| `/show files` | Switch to Files tab |
| `/show audit` | Switch to Audit tab |
| `/show settings` | Switch to Settings tab |

Slash commands bypass NLU entirely — no LLM call, instant navigation. Use them when you know exactly where you want to go.

## Troubleshooting

**"It didn't understand me."** Below the 0.5 confidence threshold, the classifier falls back to `complex_request` and routes the input to the conversational agent. The agent will either complete the multi-step request or ask a clarifying question. If you want a deterministic intent resolution, rephrase using a verb the classifier recognizes ("hire", "fire", "assign", "create", "close", "call", "end", "show", "find").

**"I want more intents."** The 15-intent set is intentionally tight — it covers the deterministic operations Team-X exposes today. New intents land alongside new IPC handlers (M31 adds the agentic loop, M32 adds RAG-on-vault). For org-specific commands, contribute to the role pack or wait for the M31 plugin surface.

**"The classifier is slow."** Classification cost depends on the configured provider. Local Ollama on a modest CPU can take 1-3 seconds for the first call, faster on subsequent calls (model stays warm). Cloud providers (Anthropic, OpenAI) typically respond in 200-500ms. If latency matters, configure a fast model in the `'balanced'` tier in Settings > Providers.

**"I get malformed JSON errors."** Smaller local models (Ollama 8B parameter range) occasionally produce invalid JSON. The classifier retries once with a "your previous output was not valid JSON" nudge, then falls back to `complex_request`. Switch to a larger model or a cloud provider for higher reliability.

## Privacy

The classifier runs through your configured LLM provider via the provider router — same path as every other LLM call in Team-X. Privacy tier filtering applies: if your max tier is `local`, only Ollama is used. If you allow `proprietary-cloud`, the classifier may use Anthropic / OpenAI / Google. Your text never leaves your machine unless you have explicitly enabled a cloud provider.

No phone-home. No analytics. No third-party telemetry. The command palette honors invariant #7 — same as the rest of the app.
