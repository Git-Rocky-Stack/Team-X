# Proactive Execution Engine Implementation Plan
## Team-X v2.0.1 → v2.1.0

**Status**: 🚀 IN PROGRESS  
**Started**: 2026-04-29  
**Estimated Duration**: 1-2 days (8-16 hours)  
**Complexity**: High - Architectural enhancement

---

## Executive Summary

Team-X has excellent reactive architecture but lacks proactive execution. This plan adds a heartbeat-based wakeup system that transforms agents from reactive responders to proactive drivers.

**The Problem**: Agents create tickets but never execute work autonomously.  
**The Solution**: Build a wakeup queue → execution bridge → proactive loop.  
**The Impact**: MRR goal transitions from impossible to achievable.

---

## Architecture Analysis

### Current State (Team-X v2.0.1)

**✅ What Team-X Has:**
- Reactive orchestrator with work queue and event bus
- Agent tools: `decompose_project`, `delegate_subtask`, `review_deliverable`
- Routine service that schedules tasks and creates tickets
- Role-based permissions and execution controls
- 57 curated F10 roles with proper governance

**❌ What Team-X Missing:**
- Bridge between routine completion and agent execution
- Automatic agent wakeup when work is assigned
- Goal-driven task decomposition triggering
- Heartbeat scheduling for proactive agent execution

### Target State (Team-X v2.1.0)

Based on Paperclip.ai architecture analysis:

**🎯 Proactive Execution Layer:**
1. **Wakeup Queue**: `agentWakeupRequests` table for scheduling agent wakeups
2. **Heartbeat Service**: Manages wakeup scheduling, retry logic, liveness monitoring
3. **Execution Bridge**: Connects routine→issue→agent wakeup automatically
4. **Goal Ancestry**: Tasks carry full goal context (company→project→goal→issue)
5. **Liveness Management**: Monitors agent health and recovers from failures

---

## Implementation Phases

### Phase 1: Wakeup Foundation (4-6 hours)
**Goal**: Build the infrastructure for scheduling and managing agent wakeups

**Deliverables:**
1. Database schema for `agentWakeupRequests` table
2. `heartbeatService` with wakeup queue management
3. Retry logic with exponential backoff: [2min, 10min, 30min, 2hr]
4. Basic wakeup triggers and scheduling

**Files to Create:**
- `apps/desktop/src/main/db/repos/agent-wakeup-requests.ts`
- `apps/desktop/src/main/orchestrator/heartbeat-service.ts`

**Files to Modify:**
- `apps/desktop/src/main/db/schema.ts` (add wakeup requests table)
- `apps/desktop/src/main/db/client.ts` (add wakeup requests repo)

**Success Criteria:**
- Can schedule agent wakeup requests
- Wakeup queue processes requests in order
- Retry logic handles transient failures
- Basic liveness monitoring works

---

### Phase 2: Execution Bridge (3-4 hours)
**Goal**: Connect routine completion to automatic agent execution

**Deliverables:**
1. `queueAgentWakeup()` function for automatic agent triggering
2. Routine service integration with heartbeat system
3. Issue assignment triggers agent wakeup automatically
4. Goal ancestry propagation through execution chain

**Files to Create:**
- `apps/desktop/src/main/orchestrator/agent-wakeup-queue.ts`

**Files to Modify:**
- `apps/desktop/src/main/services/routine-service.ts` (add wakeup bridge)
- `apps/desktop/src/main/orchestrator/index.ts` (wire wakeup queue)
- `apps/desktop/src/main/db/repos/issues.ts` (add goal ancestry)

**The Critical Missing Line:**
```typescript
// This single line transforms Team-X from reactive to proactive
await queueAgentWakeup({
  agentId: issue.assigneeAgentId,
  trigger: { type: 'issue_assigned', issueId: createdIssue.id },
  context: { 
    source: 'routine_execution',
    companyId,
    goalId: routine.goalId 
  }
});
```

**Success Criteria:**
- Routine completion automatically wakes assigned agent
- Issue creation triggers agent execution
- Goal context flows through execution chain
- Agent receives full context when waking up

---

### Phase 3: Proactive Loop (2-3 hours)
**Goal**: Implement continuous proactive execution and monitoring

**Deliverables:**
1. Heartbeat scheduling for recurring agent wakeups
2. Advanced liveness monitoring and recovery
3. Cost tracking and budget enforcement
4. Session persistence across heartbeats

**Files to Create:**
- `apps/desktop/src/main/orchestrator/agent-liveness-service.ts`
- `apps/desktop/src/main/orchestrator/session-persistence.ts`

**Files to Modify:**
- `apps/desktop/src/main/orchestrator/heartbeat-service.ts` (add liveness)
- `apps/desktop/src/main/services/costs.ts` (add execution budgeting)

**Success Criteria:**
- Agents wake on schedule (every 5-15 minutes)
- Failed executions auto-retry with backoff
- Session state persists across heartbeats
- Budget enforcement prevents runaway costs

---

## Database Schema Changes

### New Table: `agentWakeupRequests`

```sql
CREATE TABLE agentWakeupRequests (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  agentId TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'processing' | 'completed' | 'failed'
  triggerType TEXT NOT NULL, -- 'routine' | 'issue_assigned' | 'schedule' | 'manual'
  triggerId TEXT NULL, -- Reference to routineId, issueId, etc.
  priority INTEGER NOT NULL DEFAULT 0,
  scheduledFor TEXT NOT NULL, -- ISO timestamp
  startedAt TEXT NULL,
  completedAt TEXT NULL,
  attemptCount INTEGER NOT NULL DEFAULT 0,
  maxAttempts INTEGER NOT NULL DEFAULT 4,
  nextRetryAt TEXT NULL,
  contextJson TEXT NULL, -- Goal ancestry, execution context
  resultJson TEXT NULL, -- Execution results
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (agentId) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX idx_wakeup_company_pending ON agentWakeupRequests(companyId, status);
CREATE INDEX idx_wakeup_agent_scheduled ON agentWakeupRequests(agentId, scheduledFor);
CREATE INDEX idx_wakeup_priority ON agentWakeupRequests(priority, scheduledFor);
```

### Modified Tables

**`issues`** - Add goal ancestry:
```sql
ALTER TABLE issues ADD COLUMN goalId TEXT NULL;
ALTER TABLE issues ADD COLUMN parentIssueId TEXT NULL;
CREATE INDEX idx_issues_goal ON issues(goalId);
CREATE INDEX idx_issues_parent ON issues(parentIssueId);
```

---

## Service Architecture

### Heartbeat Service (New)

**Responsibilities:**
- Queue and schedule agent wakeup requests
- Process wakeup queue with concurrency limits
- Retry failed wakeups with exponential backoff
- Monitor agent liveness and health
- Manage session persistence

**Key Methods:**
```typescript
interface HeartbeatService {
  // Queue a wakeup request
  scheduleWakeup(input: {
    agentId: string;
    trigger: WakeupTrigger;
    scheduledFor?: Date;
    context?: WakeupContext;
  }): Promise<string>;
  
  // Process pending wakeup requests
  processWakeupQueue(): Promise<void>;
  
  // Retry failed wakeups
  retryFailedWakeup(wakeupId: string): Promise<void>;
  
  // Get agent wakeup history
  getAgentWakeupHistory(agentId: string, limit?: number): Promise<WakeupRequest[]>;
  
  // Monitor agent liveness
  checkAgentLiveness(agentId: string): Promise<LivenessStatus>;
  
  // Start heartbeat processing loop
  start(intervalMs: number): void;
  
  // Stop heartbeat processing
  stop(): void;
}
```

### Agent Wakeup Queue (New)

**Responsibilities:**
- Bridge between high-level events and agent wakeup
- Provide simple API for triggering agent execution
- Handle wakeup prioritization and coalescing
- Manage wakeup context and goal ancestry

**Key Methods:**
```typescript
interface AgentWakeupQueue {
  // Wake agent when issue is assigned
  queueIssueAssignmentWakeup(input: {
    issueId: string;
    assigneeAgentId: string;
    contextSource: string;
  }): Promise<void>;
  
  // Wake agent when routine completes
  queueRoutineCompletionWakeup(input: {
    routineId: string;
    goalId: string;
    ticketId: string;
  }): Promise<void>;
  
  // Schedule recurring agent wakeup
  scheduleRecurringWakeup(input: {
    agentId: string;
    schedule: CronExpression;
    context: WakeupContext;
  }): Promise<void>;
  
  // Wake agent manually
  triggerManualWakeup(input: {
    agentId: string;
    reason: string;
    requestedBy: string;
  }): Promise<void>;
}
```

---

## Integration Points

### Routine Service → Heartbeat Bridge

**Current Flow (Reactive):**
```
Routine Tick → Create Ticket → STOP
```

**Target Flow (Proactive):**
```
Routine Tick → Create Ticket → Queue Agent Wakeup → Agent Executes Work
```

**Implementation:**
```typescript
// In routine-service.ts
async function executeRoutine(routineId: string) {
  // ... existing routine execution logic ...
  
  const ticket = await createTicket({
    title: routine.taskTemplate,
    assigneeId: routine.assignedAgentId,
    goalId: routine.goalId
  });
  
  // ✅ THE MISSING BRIDGE:
  await agentWakeupQueue.queueIssueAssignmentWakeup({
    issueId: ticket.id,
    assigneeAgentId: routine.assignedAgentId,
    contextSource: 'routine_execution',
    goalAncestry: {
      companyId: routine.companyId,
      projectId: routine.projectId,
      goalId: routine.goalId,
      routineId: routine.id
    }
  });
  
  return ticket;
}
```

### Issue Assignment → Agent Wakeup

**Current Flow (Reactive):**
```
User assigns issue → Issue saved → STOP
```

**Target Flow (Proactive):**
```
User assigns issue → Issue saved → Queue Agent Wakeup → Agent sees assignment
```

**Implementation:**
```typescript
// In issues.ts repo
async function assignIssue(input: {
  issueId: string;
  assigneeAgentId: string;
  assignedBy: string;
}) {
  const issue = await update(input.issueId, {
    assigneeAgentId: input.assigneeAgentId,
    assignedAt: Date.now(),
    assignedBy: input.assignedBy
  });
  
  // ✅ AUTOMATIC AGENT WAKEUP:
  await agentWakeupQueue.queueIssueAssignmentWakeup({
    issueId: input.issueId,
    assigneeAgentId: input.assigneeAgentId,
    contextSource: 'manual_assignment'
  });
  
  return issue;
}
```

---

## Testing Strategy

### Unit Tests

**Heartbeat Service:**
- Wakeup queue ordering and prioritization
- Retry logic with exponential backoff
- Liveness detection and recovery
- Session persistence across heartbeats

**Agent Wakeup Queue:**
- Issue assignment triggers wakeup
- Routine completion triggers wakeup
- Manual wakeup requests
- Context propagation and goal ancestry

### Integration Tests

**End-to-End Proactive Flow:**
1. Create routine with assigned agent
2. Routine tick creates ticket
3. Agent automatically wakes up
4. Agent receives ticket with full context
5. Agent executes work and updates ticket
6. Cost tracking captures execution

**Failure Recovery:**
1. Agent execution fails transiently
2. Wakeup system retries with backoff
3. Agent eventually succeeds
4. Session state preserved across retries

### Manual Testing

**MRR Goal Scenario:**
1. Set company MRR goal: "$1M MRR"
2. Create routine: "Daily revenue optimization review"
3. Assign to CEO agent
4. Verify: CEO wakes daily, analyzes metrics, delegates work
5. Verify: Work cascades down org chart
6. Verify: Progress tracked toward MRR goal

---

## Risk Mitigation

### Technical Risks

**Risk**: Wakeup queue grows faster than processing
- **Mitigation**: Concurrency limits, priority scheduling, queue monitoring

**Risk**: Agents get stuck in retry loops
- **Mitigation**: Max attempt limits, exponential backoff, manual override

**Risk**: Runaway execution costs
- **Mitigation**: Budget enforcement, cost tracking, hard limits

### Operational Risks

**Risk**: Performance degradation with many agents
- **Mitigation**: Efficient queue processing, database indexing, batch operations

**Risk**: Data loss during crashes
- **Mitigation**: Atomic operations, transaction safety, recovery procedures

---

## Success Metrics

### Functional Requirements
- ✅ Agents automatically wake when work is assigned
- ✅ Routine completion triggers agent execution  
- ✅ Goals propagate through execution chain
- ✅ Failed executions auto-retry
- ✅ Agent liveness monitored and recovered

### Performance Requirements
- ✅ Wakeup queue processes within 5 seconds
- ✅ Agent wakeup latency < 30 seconds
- ✅ Retry logic prevents duplicate execution
- ✅ System handles 100+ concurrent agents

### Business Requirements
- ✅ MRR goal achievable without manual intervention
- ✅ Agents work proactively toward company objectives
- ✅ Execution costs tracked and controlled
- ✅ Full audit trail of agent activity

---

## Phase 1 Implementation Steps

### Step 1.1: Database Schema (30 min)
1. Add `agentWakeupRequests` table to schema
2. Add goal ancestry columns to `issues` table
3. Create database indexes for performance
4. Run migrations

### Step 1.2: Wakeup Requests Repository (1 hour)
1. Create `agent-wakeup-requests.ts` repo
2. Implement CRUD operations
3. Add queue query methods
4. Add transaction safety

### Step 1.3: Heartbeat Service Foundation (2 hours)
1. Create `heartbeat-service.ts`
2. Implement wakeup scheduling
3. Add queue processing loop
4. Add basic retry logic

### Step 1.4: Testing and Validation (1 hour)
1. Unit tests for wakeup queue
2. Integration tests for scheduling
3. Manual testing with sample agents
4. Performance validation

---

## Next Actions

**Immediate:** Start Phase 1 implementation
1. Create database schema for `agentWakeupRequests`
2. Build wakeup requests repository
3. Implement heartbeat service foundation
4. Test basic wakeup scheduling

**Following Phases:** Complete remaining phases sequentially
- Phase 2: Execution Bridge (connect routines to agents)
- Phase 3: Proactive Loop (continuous autonomous execution)

**Success Criteria Met When:**
- Agent wakes up automatically when routine creates ticket
- Agent receives full goal context and executes work
- MRR goal progresses without manual intervention
- System handles failures gracefully and recovers

---

## References

**Paperclip.ai Analysis:**
- `heartbeat.ts` - Core heartbeat execution engine (7,610 lines)
- `issue-assignment-wakeup.ts` - Automatic agent triggering on assignment
- `routines.ts` - Routine service with wakeup integration
- GitHub: https://github.com/paperclipai/paperclip

**Team-X Architecture:**
- Orchestrator: `apps/desktop/src/main/orchestrator/`
- Services: `apps/desktop/src/main/services/`
- Database: `apps/desktop/src/main/db/`

**Implementation Timeline:**
- Phase 1: 4-6 hours (Foundation)
- Phase 2: 3-4 hours (Bridge)
- Phase 3: 2-3 hours (Loop)
- Total: 1-2 days for full proactive execution

---

*This plan transforms Team-X from a reactive task manager into a proactive autonomous agent organization. The missing 20% is the bridge between having excellent tools and those tools driving execution autonomously.*