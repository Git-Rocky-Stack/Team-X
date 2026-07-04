# Accessibility Guide

**Making Team-X usable for everyone**

---

## Overview

Team-X is committed to accessibility. This guide covers the accessibility features, how to use them, and best practices for creating inclusive content.

---

## Table of Contents

1. [Accessibility Features](#accessibility-features)
2. [Keyboard Navigation](#keyboard-navigation)
3. [Screen Reader Support](#screen-reader-support)
4. [Visual Accessibility](#visual-accessibility)
5. [Cognitive Accessibility](#cognitive-accessibility)
6. [Motor Accessibility](#motor-accessibility)
7. [Creating Accessible Content](#creating-accessible-content)
8. [Testing Accessibility](#testing-accessibility)
9. [Accessibility Standards](#accessibility-standards)

---

## Accessibility Features

### Built-In Features

| Feature | Description | How to Enable |
|---------|-------------|---------------|
| **Keyboard Navigation** | Full keyboard control | Default (always on) |
| **Screen Reader Support** | NVDA, JAWS, VoiceOver | Default (always on) |
| **Dual-shift themes** | Night Ops (dark) / Day Shift (silver), both WCAG AA | Top-bar shift toggle |
| **UI Zoom** | Scale the whole interface | View menu: `Ctrl/Cmd + =`, `Ctrl/Cmd + -`, `Ctrl/Cmd + 0` reset |
| **Focus Indicators** | Visible focus on controls | Default (always on) |
| **Word-lamp status** | Status is a stencil word, never color alone | Default (always on) |
| **ARIA Labels** | Contextual labels | Default (always on) |
| **Error Announcements** | Screen reader error alerts | Default (always on) |
| **Color Blind Safe** | WCAG AA compliant colors | Default (always on) |
| **Reduced Motion** | All animation collapses to 0ms | Honors the OS `prefers-reduced-motion` setting |

### Platform-Specific

| Platform | Screen Reader | Notes |
|----------|---------------|-------|
| **Windows** | NVDA (free), JAWS (paid) | NVDA recommended |
| **macOS** | VoiceOver (built-in) | `Cmd+F5` to enable |
| **Linux** | Orca (built-in) | Check distro documentation |

---

## Keyboard Navigation

### Global Shortcuts

Team-X keeps its global keyboard surface deliberately small. Two shortcuts work from anywhere; everything else is reached through the Command Palette or by standard focus navigation:

| Action | Shortcut |
|--------|----------|
| Open the Command Palette | `Ctrl+K` / `Cmd+K` |
| Open the Copilot sidebar | `Ctrl+Shift+K` / `Cmd+Shift+K` |
| Move focus forward / back | `Tab` / `Shift+Tab` |
| Navigate a list or menu | `↑` / `↓` |
| Activate the focused control | `Enter` / `Space` |
| Dismiss a palette, menu, or dialog | `Esc` |

Inside the Command Palette, `↑` / `↓` browse your command history, `Tab` accepts the current suggestion, and `Esc` closes it. Anything you can do with the mouse is reachable by tabbing to the control and pressing `Enter`. For the complete, authoritative list, see [keyboard-shortcuts.md](./keyboard-shortcuts.md).

### Tab Order

The tab order follows the visual layout (left-to-right, top-to-bottom):

```
Typical tab sequence:
1. Main navigation (sidebar)
2. Primary panel content
3. Action buttons
4. Form fields
5. Secondary controls
```

**Focus Indicators:**

All interactive elements show visible focus:

- **Buttons:** Blue outline (2px)
- **Links:** Underline + outline
- **Inputs:** Blue outline + background highlight
- **Panels:** Subtle background highlight

### Keyboard Shortcuts Reference

See [keyboard-shortcuts.md](./keyboard-shortcuts.md) for the complete, authoritative list. The global surface is intentionally minimal; the Command Palette (`Ctrl+K` / `Cmd+K`) is the primary keyboard entry point, so most actions are reached by typing a command or by tabbing to a control and pressing `Enter`.

---

## Screen Reader Support

### Supported Screen Readers

| Screen Reader | Version Tested | Status |
|---------------|----------------|--------|
| **NVDA** | 2024.1+ | ✅ Fully supported |
| **JAWS** | 2024+ | ✅ Fully supported |
| **VoiceOver** | macOS 14+ | ✅ Fully supported |
| **Orca** | GNOME 44+ | ✅ Supported (Linux) |
| **Narrator** | Windows 11+ | ⚠️ Partial support |

### Screen Reader Announcements

**Navigation:**

```
Announcement examples:

Navigating to Mission Control:
"Mission Control dashboard, main region"

Navigating to Tickets panel:
"Tickets panel, list of 12 items"

Navigating to ticket:
"Ticket #42: Fix login bug, In Progress, Assigned to Alex"
```

**Interactive Elements:**

```
Button focus:
"Create ticket, button"

Checkbox focus:
"Show completed tickets, checkbox, not checked"

Link focus:
"View documentation, link"
```

**Dynamic Updates:**

```
Agent run started:
"Agent run started, ticket #42"

Agent run completed:
"Agent run completed, ticket #42, duration 2 minutes 34 seconds"

New insight:
"New Copilot insight, cost warning"
```

### Screen Reader Settings

**Announcement verbosity:**

```
Settings → Accessibility → Announcements

Options:
- Verbose (detailed announcements)
- Standard (balanced)
- Minimal (essential info only)
```

**Announce rate:**

```
Controls frequency of updates during agent runs:
- Live (every message)
- Summarized (every 10 seconds)
- On completion only
```

---

## Visual Accessibility

### Contrast and themes

There is no separate high-contrast toggle; the design system is built to WCAG
AA contrast in **both** of its themes, switchable from the top bar:

- **Night Ops** (default): platinum text on carbon black; status lamps carry
  their meaning as stencil words with LED tones.
- **Day Shift**: engraved dark text on silver-anodized chassis; displays (LCD
  readouts, meters, lamp caps) stay dark in both themes so phosphor values keep
  identical contrast everywhere.

Critical text targets WCAG AAA (7:1); body text meets AA (4.5:1) minimum in
both shifts.

### Color Blindness

**Color combinations tested for:**

- **Protanopia** (red-blind)
- **Deuteranopia** (green-blind)
- **Tritanopia** (blue-blind)
- **Achromatopsia** (monochromacy)

**Design principles:**

- Never rely on color alone to convey meaning
- Status is always a stencil word in a lamp tile (GO / HOLD / NO-GO / STBY / EXEC), never a bare color dot
- Provide tooltips with text descriptions
- Test with color blindness simulators

### Text Scaling

The whole interface scales through the standard **View** menu zoom:

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + =` | Zoom in |
| `Ctrl/Cmd + -` | Zoom out |
| `Ctrl/Cmd + 0` | Reset to 100% |

Zoom applies uniformly to text, lamps, and readouts, so layouts and contrast
relationships are preserved at every scale.

### Reduced Motion

Team-X honors the operating-system **reduce motion** preference
(`prefers-reduced-motion`). When it is enabled, every console animation
(LED ignition ramps, VU meter ballistics, warning blinks, view transitions)
collapses to 0ms, and all states remain fully legible by color and form alone.
There is no separate in-app setting to manage; set it once at the OS level:

- **Windows:** Settings → Accessibility → Visual effects → Animation effects (off)
- **macOS:** System Settings → Accessibility → Display → Reduce motion
- **Linux:** depends on desktop environment (e.g. GNOME → Accessibility → Reduce animation)

---

## Cognitive Accessibility

### Clear Language

**Writing accessible content:**

```
✅ Good:
"Create a ticket to assign work to employees"

❌ Avoid:
"Leverage the ticket creation paradigm to facilitate
delegation of operational responsibilities to AI agents"
```

**Guidelines:**

- Use simple, direct language
- Avoid jargon when possible
- Define technical terms on first use
- Use active voice
- One idea per sentence
- Break long content into sections

### Consistent Navigation

**Navigation structure:**

```
Sidebar (always present):
├── Mission Control
├── Tickets
├── Employees
├── Autonomy
├── Files
├── Chat
└── Settings

Each panel has consistent layout:
- Header with title and actions
- Main content area
- Footer with status
```

### Predictable Interactions

**Consistent patterns:**

| Action | Result | Consistent Across |
|--------|--------|-------------------|
| Click button | Action executes | All panels |
| `Esc` | Close/back | All modals |
| `Enter` | Select/submit | All forms |
| `Tab` | Next field | All forms |

---

## Motor Accessibility

### Input Methods

**Mouse alternatives:**

- **Keyboard only:** Fully functional without mouse
- **Voice control:** Dictate commands (Windows Speech Recognition, Dragon)
- **Eye tracking:** Calibrate for dwell clicking

**Voice control (OS-level tools such as Windows Speech Recognition or Dragon):**

Because the whole app is drivable from two shortcuts and the command palette,
voice workflows reduce to pressing `Ctrl+K` (say "press control K") and then
dictating the command itself: "create a ticket for the login bug",
"show settings", "hire an engineer". Dialogs close with "press escape".

### Click Targets

**Minimum sizes:**

- **Buttons:** 44×44px minimum (WCAG AAA)
- **Links:** Inline text, but 44px hit area
- **Checkboxes:** 24×24px visible, 44×44px hit area
- **Menu items:** Full width, 32px minimum height

**Spacing:**

- 8px minimum between adjacent controls
- 16px preferred for frequently used controls
- Group related controls with visual separators

### Physical Accessibility

**For users with limited mobility:**

```
Settings → Accessibility

Options:
- Increase click target size (up to 60px)
- Extend timeout durations (for forms, sessions)
- Enable sticky modifiers (Shift, Ctrl, Alt stay on)
- Adjust scroll speed
- Disable drag-and-drop (use alternatives)
```

---

## Creating Accessible Content

### Ticket Descriptions

**Accessible ticket format:**

```
Title: Fix login bug for SAML users

Description:
**Problem**
Users cannot login when using SAML authentication.
Error message: "Authentication failed"

**Steps to Reproduce**
1. Go to login page
2. Click "Login with SAML"
3. Enter credentials
4. Click submit

**Expected Behavior**
User should be logged in and redirected to dashboard

**Actual Behavior**
Error message appears, user not logged in

**Impact**
Critical: blocks all SAML users

**Acceptance Criteria**
- [ ] SAML login works
- [ ] Error handling improved
- [ ] User redirected correctly
```

### Agent Artifacts

**Accessible artifact format:**

```
Include in deliverables:
- Plain text description (what this file does)
- Code comments (explaining complex logic)
- Readme files (how to use)
- Examples (concrete usage)

Bad: Just code with no context

Good: Code + comments + documentation + examples
```

### Meeting Notes

**Accessible meeting format:**

```
Meeting: Daily Standup
Date: 2026-05-03
Attendees: Alex, Jamie, Sam

**What I did yesterday**
- Fixed login bug (ticket #42)
- Reviewed PR #123
- Wrote documentation

**What I'll do today**
- Start ticket #44 (API integration)
- Attend design review at 2pm

**Blockers**
- None, ✅ Unblocked

**Announcements**
- Team lunch tomorrow at noon
```

---

## Testing Accessibility

### Manual Testing Checklist

```
Keyboard Navigation:
□ Can navigate entire app without mouse
□ Tab order is logical
□ Focus indicators visible
□ Skip links work
□ All functions accessible via keyboard

Screen Reader:
□ All elements announced clearly
□ Dynamic updates announced
□ Error messages announced
□ Form labels announced
□ Lists announce item count

Visual:
□ Text contrast ≥ 4.5:1
□ Interactive elements ≥ 3:1
□ Color not only indicator
□ Text scalable to 200%
□ High contrast works

Cognitive:
□ Language clear and simple
□ Instructions provided
□ Errors explained clearly
□ Help available
□ Consistent navigation
```

### Automated Testing

**Tools:**

| Tool | What It Tests | Platform |
|------|---------------|----------|
| **axe DevTools** | WCAG compliance | Chrome/Firefox |
| **WAVE** | Accessibility issues | Web |
| **Lighthouse** | Accessibility score | Chrome |
| **NVDA Accessible Output** | Screen reader | Firefox |

**Running axe DevTools:**

```
1. Install axe DevTools extension
2. Open Team-X in browser
3. Open DevTools (F12)
4. Click "axe DevTools" tab
5. Click "Scan ALL of page"
6. Review results
```

### User Testing

**Include users with disabilities:**

```
Recruitment:
- Contact disability organizations
- Post on accessibility forums
- Reach out to local groups

Compensation:
- Pay participants fairly
- Offer free software access
- Provide flexible scheduling

Testing:
- Observe users using product
- Note frustrations and workarounds
- Collect feedback on specific features
```

---

## Accessibility Standards

### WCAG 2.1 Compliance

**Team-X targets WCAG 2.1 Level AA:**

| Principle | Guidelines | Status |
|-----------|------------|--------|
| **Perceivable** | Text alternatives, captions, adaptable | ✅ AA compliant |
| **Operable** | Keyboard accessible, enough time, seizures | ✅ AA compliant |
| **Understandable** | Readable, predictable, input assistance | ✅ AA compliant |
| **Robust** | Compatible with assistive technologies | ✅ AA compliant |

**Level AAA (where possible):**

- Enhanced contrast (7:1 for text)
- Error prevention and correction
- Context-sensitive help

### Section 508

**Team-X meets Section 508 requirements:**

- **502.2:** Text alternatives for images
- **502.3:** Synchronized captions for video
- **504.2:** Keyboard access
- **504.3:** Focus indication
- **508.1:** Accessibility testing

---

## Getting Help with Accessibility

### Report Accessibility Issues

**If you encounter accessibility barriers:**

```
Open an issue at: github.com/Git-Rocky-Stack/Team-X/issues
Apply the `accessibility` label.

Include:
- Your assistive technology (screen reader, etc.)
- The feature or page you're trying to use
- What happened vs. what you expected
- Steps to reproduce the issue
```

### Request Accommodations

**If you need specific accommodations:**

```
Open a discussion at: github.com/Git-Rocky-Stack/Team-X/discussions
Tag with `accessibility`.

Common accommodations:
- Alternative formats for documentation
- Extended support for onboarding
- Custom keyboard shortcut configurations
- Screen reader-specific training
```

### Community Resources

**Accessibility communities:**

- [WebAIM](https://webaim.org): Web accessibility resources
- [A11Y Project](https://www.a11yproject.com): Accessibility checklist
- [NVDA Community](https://www.nvaccess.org): NVDA screen reader

---

**Commitment:** Team-X is committed to continuous accessibility improvement. We welcome feedback and work to make our product usable for everyone.

---

*Last updated: 2026-05-03*
