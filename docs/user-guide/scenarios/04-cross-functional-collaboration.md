# Scenario: Cross-Functional Collaboration

**Status:** Draft | **Last Updated:** 2026-05-03 | **Version:** 1.0

---

## Executive Summary

This scenario demonstrates how design, frontend, and backend teams coordinate on a complex feature requiring tight collaboration across functional boundaries. Cross-functional work in Team-X relies on proper participant management, ticket dependencies, and clear handoffs.

**Scenario Context:** The team is building a "Real-Time Collaboration Panel" for Team-X itself — a feature that requires simultaneous work across design, frontend, and backend with multiple dependencies.

**Collaboration Challenge:** 6 employees, 12 tickets, 15 cross-ticket dependencies, 3-week timeline.

**Outcome:** Feature delivered on time with zero rework, all dependencies satisfied, and full audit trail of decisions.

**Learning Objectives:**
- Managing participants across team boundaries
- Creating and resolving ticket dependencies
- Coordinating handoffs between functions
- Using tickets for cross-functional communication
- Maintaining context in long-running collaborations

---

## Table of Contents

1. [The Feature](#the-feature)
2. [Team Structure](#team-structure)
3. [Ticket Architecture](#ticket-architecture)
4. [Execution](#execution)
5. [Key Takeaways](#key-takeaways)
6. [Related Documentation](#related-documentation)

---

## The Feature

**Real-Time Collaboration Panel** — A sidebar showing who's working on what, with presence indicators, thread summaries, and quick join functionality.

**Requirements:**
- Shows active runs, idle employees, and blocked work
- One-click join to any ticket thread
- Real-time updates (WebSocket-based)
- Collapsible panels for different teams

**Cross-Functional Involvement:**
- **Design:** Lin (UI/UX, interactions, animations)
- **Frontend:** Priya (React components, WebSocket client)
- **Backend:** Mike (WebSocket server, presence API)
- **QA:** Sarah (testing cross-functional flows)
- **Tech Lead:** Elena (architecture, code review)
- **Product:** Alex (requirements, user stories)

---

## Team Structure

**RACI Matrix:**

| Ticket | Responsible | Accountable | Consulted | Informed |
|-------|-------------|-------------|-----------|----------|
| Requirements | Alex | Elena | Lin, Priya, Mike | Sarah, James |
| UX Design | Lin | Elena | Alex, Priya | Mike, Sarah |
| Backend API | Mike | Elena | Priya, Sarah | Alex, Lin |
| Frontend Components | Priya | Elena | Lin, Mike | Alex, Sarah |
| Integration Testing | Sarah | Elena | Mike, Priya | Alex, Lin |
| Code Review | Elena | Elena | All | All |

**Participant Strategy:**
- **Core team** on every ticket: Elena (Tech Lead)
- **Function-specific** participants added as needed
- **All-hands** participants for key decisions

---

## Ticket Architecture

### Decomposition

**Task Planner creates 12 tickets:**

```
Phase 1: Foundation (Tickets #64-66)
├── #64: Requirements & user stories (Alex)
├── #65: UX wireframes and mockups (Lin)
└── #66: Architecture design (Elena)

Phase 2: Backend (Tickets #67-68)
├── #67: WebSocket server implementation (Mike)
└── #68: Presence API and state management (Mike)

Phase 3: Frontend (Tickets #69-70)
├── #69: React component library (Priya)
└── #70: WebSocket client integration (Priya)

Phase 4: Integration (Tickets #71-72)
├── #71: End-to-end integration (Elena)
└── #72: Testing and QA (Sarah)

Phase 5: Polish (Tickets #73-75)
├── #73: Performance optimization (Elena)
├── #74: Accessibility audit (Sarah)
└── #75: Documentation (Alex)
```

### Dependencies

**Dependency Graph:**

```
#67 (WebSocket server)
  └── blocks ──> #69 (React components)
                  └── #70 (WebSocket client)
                      └── blocks ──> #71 (Integration)

#68 (Presence API)
  └── blocks ──> #69 (React components)
                  └── #70 (WebSocket client)

#65 (UX mockups)
  └── blocks ──> #69 (React components)

#64 (Requirements)
  └── blocks ──> All other tickets

#71 (Integration)
  └── blocks ──> #72 (Testing)
  └── blocks ──> #73 (Performance)

#66 (Architecture)
  └── blocks ──> #67, #68, #69
```

---

## Execution

### Phase 1: Foundation (Requirements & Design)

**Ticket #64: Requirements & User Stories**

**Participants:** Alex, Elena, Lin, Priya, Mike

**Thread Highlights:**

**Alex (Product Manager):**
```
Creating requirements for Real-Time Collaboration Panel:

User stories:
1. As an EM, I want to see who's working on what at a glance
2. As a developer, I want to join a ticket thread with one click
3. As a lead, I want to see team capacity and blockages

Non-functional requirements:
- Updates within 500ms (WebSocket)
- Supports 50 concurrent users
- Works across all panels (Dashboard, Tickets, Chat)

Elena — should we include mobile support?
```

**Elena (Tech Lead):**
```
Good requirements. A few questions:

1. Mobile support: Let's defer mobile for MVP. Desktop-first is 
   fine for Phase 1.

2. "Glance-ability": What's the refresh rate? Should we show 
   "last updated 5 seconds ago" badge?

3. Join functionality: Should joining require permission, or can 
   anyone join any ticket? This has privacy implications.

Also, adding Priya and Mike as participants — they'll have questions 
about feasibility.
```

**Priya (Frontend Engineer, added as participant):**
```
Regarding the 500ms update requirement:

This is aggressive for real-time features. To achieve this:
1. WebSocket with server-sent events (not polling)
2. Optimistic UI (show cached data immediately, update in background)
3. Batching updates (send 100ms batches, not per-event)

Question: Should we show "live" indicator when connection is active?
```

**Mike (Backend Engineer, added as participant):**
```
WebSocket server questions:

1. Scaling: 50 concurrent connections = 50 WebSocket 
   connections. This is trivial for a single server.

2. Presence API: How do we track "active" vs "idle"?
   - No activity for 5 min = idle?
   - Active run in progress = active?

3. State storage: In-memory (Postgres NOTIFY for updates)? Or 
   Redis for pub/sub? Redis is better for this scale.

Alex — these decisions affect implementation complexity. Any preferences?
```

**Alex:**
```
Great questions. Here are my decisions:

1. Mobile: Defer (desktop-only for MVP)
2. Refresh rate: Show "last updated" badge, target < 5 sec
3. Join permission: Anyone can join any public ticket (private 
   tickets require permission)
4. Live indicator: Yes, green dot when WebSocket active
5. Active/idle: 5 min threshold sounds right
6. State storage: Use Redis (Mike's recommendation)

Elena — does this architecture work for you?
```

**Elena:**
```
Yes, this is solid. A few additions:

1. For joining tickets: Add audit logging (who joined, when)
2. For presence API: Include "in ticket thread" state (more specific 
   than just "active")
3. For Redis: Add connection pool health check

Updating architecture document now. Lin will use these decisions 
for mockups.
```

**Resolution:** Requirements finalized with cross-functional input. All functions aligned on technical approach. Ticket marked Done.

---

### Phase 2: Backend (Dependency Risk)

**Ticket #67: WebSocket Server Implementation**

**Participants:** Mike, Elena, Priya (consulted)

**Thread Highlights:**

**Mike (Backend Engineer):**
```
Implementing WebSocket server for real-time collaboration:

Tech stack:
- FastAPI with WebSocket support
- Redis pub/sub for message broadcasting
- Connection pool management
- Authentication via existing session tokens

Events to broadcast:
- Agent run started/stopped
- Ticket status changed
- Employee joined/left thread
- Presence changed (active/idle)

API endpoints:
- WS /ws/collaboration — WebSocket endpoint
- GET /api/presence — Get current presence state
- POST /api/presence/heartbeat — Manual presence update

Implementing now...
```

**Priya (Frontend Engineer, participant):**
```
Mike — quick question for frontend integration:

For the WebSocket message format, can we standardize on:

```json
{
  "type": "agent_run.started",
  "timestamp": "2026-05-03T14:32:15Z",
  "data": {
    "ticket_id": 47,
    "employee": "Elena"
  }
}
```

This structure lets us type-safely parse and route to UI updates.

Also: What's the reconnection strategy if WebSocket drops?
```

**Mike:**
```
Good proposal on message format. I'll standardize on that structure.

Reconnection strategy:
1. Client attempts reconnect with exponential backoff (1s, 2s, 4s, 8s)
2. Server maintains connection state across reconnects (session token)
3. If server restarts, client receives "full state sync" message

Elena — should we add a "connection ID" to track individual 
WebSocket connections? This helps with debugging.
```

**Elena (Tech Lead):**
```
Yes, add connection ID. Also:

1. Add rate limiting per connection (100 msg/sec to prevent abuse)
2. Add connection timeout (disconnect if no heartbeat in 30 min)
3. Add monitoring: log connection count, message throughput

These are production-readiness items.

Mike — include these in the implementation. I'll review your PR.
```

**Resolution:** WebSocket server implemented with cross-functional input. Standardized message format enables clean frontend integration. Ticket marked Done.

---

### Phase 3: Frontend (Waiting on Backend)

**Ticket #69: React Component Library**

**Participants:** Priya, Lin, Mike (consulted)

**Thread Highlights:**

**Priya (Frontend Engineer):**
```
Building React components for collaboration panel:

Components:
1. CollaborationPanel (main container)
2. EmployeeCard (avatar, name, status, presence)
3. TicketSummary (ticket title, status, assignee)
4. ActiveRunsPanel (list of runs, progress bars)
5. JoinButton (one-click join action)

Waiting on Mike's WebSocket server for integration testing.

Lin — I have the mockups from #65. Implementing the layout now.
```

**Lin (Designer, participant):**
```
Priya — a few design clarifications from the mockups:

1. EmployeeCard layout:
   - Avatar: 40px circular, left-aligned
   - Status indicator: 8px dot, top-right of avatar
   - Name: Bold, 14px, left of avatar
   - Presence: "Active 2m ago" in gray, below name

2. ActiveRunsPanel:
   - Progress bars: Animated, show percentage
   - Sorting: By start time (newest top)
   - Max visible: 10 runs, "Show more" to expand

3. JoinButton:
   - Primary action: "Join Thread" (brand color)
   - Secondary: "Spectate" (outline style)

Does this match what you're building?
```

**Priya:**
```
Yes, this matches. A few implementation questions:

1. For presence timestamps: Should I use "2m ago" format or absolute 
   time "2:30 PM"? "Ago" format is friendlier but absolute is more 
   precise. Your call?

2. For progress bars: Should they animate smoothly or jump to values? 
   Smooth looks better but is more expensive.

3. For status dots: What's the exact color mapping?
   - Active: green?
   - Idle: gray?
   - In ticket: blue?
   - Blocked: red?

Lin — what's your preference?
```

**Lin:**
```
1. Timestamps: "Ago" format is friendlier. Show absolute on hover.

2. Progress bars: Smooth animation. This is a flagship feature, worth 
   the cost.

3. Status dots: Close to Strategia-X palette:
   - Active: #10B981 (green-600)
   - Idle: #9CA3AF (gray-400)
   - In ticket: #3B82F6 (blue-600)
   - Blocked: #EF4444 (red-600)

Priya — these are design tokens. Let me know if you need the raw hex 
values in a design-tokens.ts file.
```

**Priya:**
```
Perfect, thanks Lin. I have the tokens from the design system.

Mike — how's the WebSocket server coming? I'm ready to test 
integration but need a stable endpoint.

Also: For the "Join Thread" action, what API should I call? Is it 
documented in the presence API (#68)?
```

**Mike (from Ticket #68):**
```
WebSocket server is ready! Endpoint: `wss://api.example.com/ws/collaboration`

For joining threads, use the presence API:
```
POST /api/presence/join
{
  "ticket_id": 47,
  "employee_id": "elena"
}
```

This adds you to the ticket thread participants and broadcasts 
a `participant.joined` event via WebSocket.

Testing instructions:
1. Open two browser tabs
2. Join different tickets in each
3. Trigger an event (change status, add run)
4. Watch both tabs update in real-time

Let me know if you encounter issues.
```

**Priya:**
```
Testing now...

[Tool call: test_integration]
WebSocket connection: ✅
Presence API: ✅
Event broadcasting: ✅
Real-time updates: ✅

Mike — this works perfectly. The real-time updates are < 200ms, which 
exceeds our 500ms target.

Lin — the components look great with the design tokens. I'll attach 
a screenshot for review.

[Attachment: collaboration-panel-screenshot.png]

Ready for integration testing in #71.
```

**Resolution:** Component library completed, integrated with backend, matches design mockups. Ticket marked Done.

---

### Phase 4: Integration (Coordinating Across Tickets)

**Ticket #71: End-to-End Integration**

**Participants:** Elena, Priya, Mike, Sarah

**Thread Highlights:**

**Elena (Tech Lead):**
```
Coordinating end-to-end integration for Real-Time Collaboration Panel.

Integration checklist:
1. ✅ Frontend + Backend API (Priya + Mike)
2. ✅ WebSocket connection (Priya + Mike)
3. ✅ Event broadcasting (all functions)
4. 🔄 Cross-panel testing (Sarah)
5. ⏳ Performance optimization (pending)
6. ⏳ Accessibility audit (pending)

Current status: Core integration complete. Ready for QA handoff.

Sarah — what do you need from me for testing?
```

**Sarah (QA Engineer, participant):**
```
I'm ready to test. A few questions:

1. Test environment: Should I use staging with sample data, or can I 
   use production with real data?

2. Test scenarios: I'm planning:
   - Single user joins/leaves threads
   - Multiple users (up to 10) in different threads
   - Real-time updates (trigger agent run, watch all panels update)
   - Reconnection (disconnect WiFi, reconnect)
   - Edge cases: Empty ticket list, all users idle, all users active

3. Performance: I'll measure load time and WebSocket latency. What 
   targets should I validate?

Elena — let me know if I should add scenarios.
```

**Elena:**
```
Good questions, Sarah:

1. Test environment: Use staging first, then production smoke test. 
   We don't want to disrupt real work during testing.

2. Test scenarios: Your list is comprehensive. Add one more:
   - Concurrent joins (multiple users join same thread simultaneously)

3. Performance targets:
   - Panel load: < 1 second (initial render)
   - WebSocket latency: < 500ms (event to UI update)
   - Reconnection time: < 5 seconds (disconnect to reconnect)

Priya, Mike — be available during testing. Sarah will find bugs.

Proceeding with testing...
```

**Sarah (QA Engineer):**
```
Testing completed. Results:

PASS (11 scenarios):
- Single user joins/leaves: ✅
- Multiple users in different threads: ✅
- Real-time updates: ✅
- Reconnection: ✅
- Edge cases (empty, idle, active): ✅
- Concurrent joins: ✅
- Cross-browser (Chrome, Firefox, Safari): ✅

FAIL (1 scenario):
- Performance: Panel load time 1.3 seconds (target: < 1 sec)
  - Root cause: Large employee roster (50+ employees)
  - Impact: Moderate (misses target but usable)

Recommendation: Optimize before launch or adjust target.

Elena — what's your call on the performance issue?
```

**Elena:**
```
Good work, Sarah. The performance issue is acceptable for MVP:

1. 1.3 seconds is close to target
2. Only affects initial load, not real-time updates
3. Employee roster is large (50+) — this is expected

Decision: Launch with current performance, optimize in Phase 5.

Marking integration ticket Done. Sarah, please file optimization 
ticket for Phase 5.
```

**Resolution:** Integration tested across 11 scenarios. One performance issue deferred to Phase 5. Ticket marked Done.

---

## Key Takeaways

### 1. Participant Management Enables Collaboration

Adding the right people to tickets (not just assignees) ensures cross-functional questions are answered quickly. Lin, Priya, and Mike all contributed to tickets they weren't assigned to.

### 2. Dependencies Must Be Explicit

The dependency graph showed that #67 (WebSocket server) blocked multiple frontend tickets. Making these dependencies explicit in Mission Control prevented premature integration attempts.

### 3. Standardization Reduces Integration Friction

Priya and Mike agreeing on message format before implementation prevented integration issues. Five minutes of discussion saved hours of rework.

### 4. QA Finds Issues That Specialists Miss

Sarah identified the performance issue that Elena, Priya, and Mike all missed. Cross-functional testing catches edge cases that unit tests miss.

### 5. Tech Lead Coordination Is Glue

Elena participated in every major ticket, ensuring architectural consistency and making decisions when functions disagreed. This prevented divergence.

---

## Related Documentation

- [Tickets & Work Management](../comprehensive-user-guide.md#7-tickets--work-management) — Participant wake semantics
- [Command Palette](../comprehensive-user-guide.md#6-command-palette) — Creating tickets with dependencies
- [Mission Control Dashboard](../comprehensive-user-guide.md#5-mission-control-dashboard) — Monitoring cross-team work

---

*Scenario: Cross-Functional Collaboration — Draft v1.0*
