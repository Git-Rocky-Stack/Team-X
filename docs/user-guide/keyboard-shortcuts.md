# Keyboard Shortcuts

Team-X supports keyboard navigation for efficient workflow management.

## Global Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Dashboard |
| `Ctrl+2` | Chat |
| `Ctrl+3` | Tickets |
| `Ctrl+4` | Projects |
| `Ctrl+5` | Meetings |
| `Ctrl+6` | Telemetry |
| `Ctrl+7` | Files |
| `Ctrl+8` | Audit |
| `Ctrl+9` | Settings |

On macOS, use `Cmd` instead of `Ctrl`.

## Dashboard

| Shortcut | Action |
|----------|--------|
| `Tab` | Cycle through employee cards |
| `Enter` | Open chat with selected employee |
| `Ctrl+H` | Open hire dialog |

## Chat

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in composer |
| `Escape` | Close chat drawer |

## Tickets

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Create new ticket |
| `Escape` | Close detail panel |

## Meetings

| Shortcut | Action |
|----------|--------|
| `Ctrl+M` | Call new meeting |
| `Enter` | Send interjection (during active meeting) |

## Command Palette and Copilot

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Toggle the command palette (Phase 5 — M30) |
| `Cmd+Shift+K` / `Ctrl+Shift+K` | Toggle the Copilot sidebar (Phase 5 — M34) |
| `Cmd+Enter` / `Ctrl+Enter` | Submit text in the palette / copilot ask input |

Both the palette and the copilot sidebar share the `K` key — a single
handler dispatches on `event.shiftKey`. When focus is inside another
Radix dialog (Hire dialog, confirmation gates), the outer handler
swallows the shortcut so those modals stay in control. The Copilot
sidebar is itself a dialog but sets `data-copilot-sidebar-root` so its
own toggle still works from inside it.

## General

| Shortcut | Action |
|----------|--------|
| `Ctrl+,` | Open Settings |
| `Ctrl+Shift+I` | Toggle DevTools (dev mode only) |
| `Escape` | Close active dialog or panel |
| `Tab` | Navigate between focusable elements |

## Accessibility

All interactive elements are keyboard-navigable and follow WCAG 2.1 AA guidelines:
- Focus indicators are visible on all interactive elements
- Tab order follows visual layout
- Dialog traps focus until dismissed
- Minimum 44px touch targets on interactive elements
