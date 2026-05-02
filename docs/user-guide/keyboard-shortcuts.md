# Keyboard Shortcuts

Team-X keeps the main shell keyboard-light and relies on visible, focusable controls for navigation. The shortcuts below are the live shortcuts wired in the current desktop app.

## Global

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Toggle the command palette |
| `Cmd+Shift+K` / `Ctrl+Shift+K` | Toggle the Copilot sidebar |
| `Escape` | Close the active dialog or sheet when the focused surface supports dismissal |
| `Tab` / `Shift+Tab` | Move through focusable controls |

The command palette and Copilot sidebar share the `K` key. Team-X dispatches based on `Shift`, and it avoids hijacking the shortcut while focus is inside another dialog unless the focus is already inside the Copilot sidebar.

## Chat

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` / `Ctrl+Enter` | Send the current message, or queue it while a reply is in progress |
| `Enter` | Insert a new line in the chat composer |
| Send button | Send or queue the current message |

When an employee is already replying, the composer enters queue mode. Follow-up messages are queued and sent in order after the current reply finishes.

## Tickets

| Shortcut | Action |
|----------|--------|
| `Enter` | Send a ticket comment from the ticket detail composer |
| `Shift+Enter` | Insert a new line in the ticket comment composer |

Sending a ticket comment wakes every employee participant and historical employee author on that ticket thread.

## Meetings

| Shortcut | Action |
|----------|--------|
| `Enter` | Send an interjection during an active meeting |
| `Shift+Enter` | Insert a new line in the meeting interjection composer |

## Command Palette and Copilot

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Toggle the command palette |
| `Cmd+Shift+K` / `Ctrl+Shift+K` | Toggle the Copilot sidebar |
| `Cmd+Enter` / `Ctrl+Enter` | Submit text in the palette or Copilot ask input |

## Spellcheck and Text Editing

Chromium spellcheck is enabled for editable fields. When a word is underlined, right-click it to open the native context menu with spelling suggestions, **Add to Dictionary**, and standard edit actions such as Undo, Redo, Cut, Copy, Paste, Delete, and Select All.

## Accessibility

All major shell controls are keyboard-navigable and follow the same focus model as the rest of the desktop app:

- Focus indicators are visible on interactive controls.
- Tab order follows the visible layout.
- Dialogs and sheets keep dismissal and focus handling inside the active surface.
- Primary interactive targets are designed for pointer and keyboard use.
