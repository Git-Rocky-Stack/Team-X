# Keyboard Shortcuts

Team-X is deliberately keyboard-light: two global shortcuts open the two
command surfaces, and everything else is reachable from the command palette
itself. This page documents the **complete** real shortcut surface — if a
shortcut isn't listed here, it doesn't exist.

> On macOS use `Cmd`; on Windows and Linux use `Ctrl`.

## Global

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open the **command palette** — natural-language commands, slash commands, navigation |
| `Cmd/Ctrl + Shift + K` | Toggle the **Copilot sidebar** — proactive insights and Ask Copilot |

## Inside the command palette

| Shortcut | Action |
|----------|--------|
| `Enter` | Run the parsed command |
| `Arrow Up` (empty input) | Browse recent command history (last 20) |
| `Arrow Up / Down` (clarification list) | Choose between candidate entities |
| `Tab` | Accept an inline suggestion |
| `Esc` | Close the palette |

Navigation is a palette feature, not a chord: type `/show dashboard`,
`/show tickets`, `/show projects`, `/show meetings`, `/show telemetry`,
`/show files`, `/show audit`, `/show schedule`, or `/show settings` for
deterministic view switching, or just say where you want to go in plain
language.

## Composers

| Where | Shortcut | Action |
|-------|----------|--------|
| Chat composer | `Cmd/Ctrl + Enter` | Send the message |
| Ticket discussion | `Enter` | Send the comment |
| Ticket discussion | `Shift + Enter` | Insert a newline |

## Dialogs and sheets

| Shortcut | Action |
|----------|--------|
| `Esc` | Close the open dialog, sheet, or palette |

## Application menu (standard Electron accelerators)

The **View** and **Edit** menus carry the platform-standard accelerators:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + =` / `Cmd/Ctrl + -` | Zoom in / zoom out (whole-UI text scaling) |
| `Cmd/Ctrl + 0` | Reset zoom to 100% |
| `F11` (Windows/Linux) / `Ctrl+Cmd+F` (macOS) | Toggle fullscreen |
| `Cmd/Ctrl + R` | Reload the window |
| `Cmd/Ctrl + C / V / X / A / Z` | Standard clipboard and undo |

## A note on what's *not* here

Earlier drafts of this guide described view-navigation chords
(`Ctrl+D`, `Ctrl+T`, `Ctrl+1–8`), filter shortcuts, and a
"Customize Shortcuts" settings page. Those were never shipped. Use the
command palette's `/show …` commands for fast navigation — they're
deterministic, discoverable, and logged to command history.

---

*Last updated: 2026-07-03*
