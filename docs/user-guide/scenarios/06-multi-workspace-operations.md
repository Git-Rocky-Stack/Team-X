# Scenario: Multi-Workspace Operations

**Status:** Draft | **Last Updated:** 2026-05-03 | **Version:** 1.0

---

## Executive Summary

This scenario demonstrates coordinating across multiple company workspaces within Team-X. Multi-workspace operations enable separation of concerns (clients, projects, environments) while sharing resources and best practices.

**Scenario Context:** An agency runs 3 workspaces for different clients. They need to share standard operating procedures while maintaining data isolation and resource allocation.

**Multi-Workspace Outcome:** Shared policies and procedures implemented across 3 workspaces in 4 hours, with 60% reuse of configuration and documentation.

**Learning Objectives:**
- Creating and managing multiple workspaces
- Sharing policies across workspaces
- Coordinating resources and employees
- Maintaining data isolation
- Managing workspace lifecycle (create, archive, delete)

---

## Table of Contents

1. [Workspace Architecture](#workspace-architecture)
2. [Shared Standards](#shared-standards)
3. [Resource Coordination](#resource-coordination)
4. [Data Isolation](#data-isolation)
5. [Workspace Lifecycle](#workspace-lifecycle)
6. [Key Takeaways](#key-takeaways)
7. [Related Documentation](#related-documentation)

---

## Workspace Architecture

### Current Workspaces

**Workspace State (3 workspaces):**

| Workspace | Purpose | Employees | Monthly Spend | Owner |
|-----------|---------|-----------|--------------|-------|
| Strategia-X | Internal (main product) | 12 | $280 | Rocky |
| Client A (Ecommerce) | Ecommerce analytics dashboard | 5 | $95 | Rocky |
| Client B (Fintech) | Financial data pipeline | 3 | $67 | Rocky |

**Total Monthly Spend:** $442 across 3 workspaces

---

### Workspace Switching

**Operator Workflow:**

```
Top Navigation: [Workspace Switcher ▼]

Workspace List:
- Strategia-X (current)
- Client A (Ecommerce)
- Client B (Fintech)
- [+ Create Workspace]

Switching context changes:
- Company name/logo updates
- Employee list filters to workspace
- Tickets filter to workspace
- Projects filter to workspace
- Budgets are workspace-scoped
```

---

## Shared Standards

### Policy Synchronization

**Challenge:** Agency wants standard operating procedures across all client workspaces.

**Approach:** Create policy template, apply to all workspaces.

**Step 1: Define Master Policy**

**Operator creates master policy in primary workspace (Strategia-X):**

**Navigate to:** Settings → Policies → Create Master Policy

```
Master Policy: Agency SOP v1.0

Budget Policy:
- Per-workspace budget: $100/month minimum
- Approval required for spends > $50
- Quarterly budget reviews

Security Policy:
- Provider keys must be workspace-scoped
- No data export without client approval
- Audit logging enabled for all workspaces

Employee Policy:
- Max 10 employees per workspace (basic tier)
- Roles must be approved before hiring
- Timesheet logging required for client work

Documentation Policy:
- All client workspaces must have:
  - Client requirements document
  - Weekly status report template
  - Change request process
```

---

### Step 2: Apply to Client Workspaces

**Operator Action:** Apply master policy to Client A and Client B workspaces.

**Navigate to:** Settings → Policies → Apply to Workspace

```
Applying Master Policy: Agency SOP v1.0

Target Workspaces:
- ✅ Client A (Ecommerce)
- ✅ Client B (Fintech)

Policy Sections to Apply:
- ✅ Budget Policy
- ✅ Security Policy
- ✅ Employee Policy
- ✅ Documentation Policy

Result: Policies applied. Existing workspaces updated to comply.
```

---

### Policy Compliance Check

**Copilot Insight (post-application):**

```
✅ INFO  •  WORKFLOW

Master policy applied to 2 workspaces.

Compliance Status:
- Client A: Compliant ✅ (1 action item: add client requirements doc)
- Client B: Compliant ✅ (0 action items)

Action Required for Client A:
- Missing: Client requirements document
- Template available in Strategia-X vault
- Due: 1 week

[View Template]              [Assign to Elena]
```

**Operator assigns action to Elena:**
```
Ctrl+K → "Assign template task for Client A requirements doc to Elena"

Ticket created: #82 (Create Client A requirements document)
```

---

## Resource Coordination

### Cross-Workspace Employees

**Challenge:** Tech lead (Elena) works across all 3 workspaces. Managing her allocation and capacity.

**Operator Action:** Configure Elena as multi-workspace employee.

**Navigate to:** Settings → Employees → Elena → Edit

```
Employee: Elena (Tech Lead)

Workspace Access:
- Strategia-X: Full access (default)
- Client A: Full access
- Client B: Full access

Allocation Strategy:
- Strategia-X: 50% FTE (Monday-Thursday)
- Client A: 30% FTE (Tuesday, Wednesday)
- Client B: 20% FTE (Friday)

Capacity Tracking:
- Total capacity: 1.0 FTE across 3 workspaces
- Current utilization: 85%
- Availability: Can take on additional work

Cost Allocation:
- Strategia-X: 85% of salary charged
- Client A: 10% of salary charged
- Client B: 5% of salary charged
```

---

### Shared Resources

**Challenge:** Some resources (templates, code libraries) should be shared across workspaces for efficiency.

**Approach:** Create shared resource library accessible to all workspaces.

**Operator Action:** Create shared vault

**Navigate to:** Files → Create Shared Vault

```
Shared Vault: Agency Resources

Contents:
├── Templates/
│   ├── weekly-status-report-template.md
│   ├── change-request-form.md
│   └── client-requirements-template.md
├── Code Libraries/
│   ├── react-component-library (shared across frontend projects)
│   └── python-utils (shared across backend projects)
└── Documentation/
    ├── agency-sops-v1.pdf (agency procedures)
    ├── onboarding-guide.pdf (for new employees)
    └── client-handbook.pdf (client management)

Access Control:
- All employees: Read-only access
- Operator: Read/write access
- Workspaces: Can link resources to their tickets

Benefits:
- Reuse reduces duplication
- Consistency across clients
- Centralized updates propagate to all workspaces
```

---

### Employee Sharing Rules

**Policy Template Applied Across Workspaces:**

```
Employee Sharing Policy:

1. Approval Required:
   - Adding employee to multiple workspaces
   - Changing allocation percentages
   - Removing employee from workspace

2. Timesheet Logging:
   - Employees with multi-workspace access must log time per workspace
   - Automatic via routine (daily at 6pm)
   - Format: "Worked 2h on Strategia-X, 1h on Client A"

3. Budget Charging:
   - Employee costs charged to workspaces based on allocation
   - Updates automatically via routine
   - Visible in Telemetry per workspace

4. Conflict Resolution:
   - If workspace demand exceeds employee allocation, operator is notified
   - Operator can rebalance or increase allocation
```

---

## Data Isolation

### Data Separation

**Database Isolation:**

```
Workspace 1: Strategia-X
├── employees_strategia_x
├── tickets_strategia_x
├── projects_strategia_x
├── events_strategia_x
└── telemetry_strategia_x

Workspace 2: Client A (Ecommerce)
├── employees_client_a
├── tickets_client_a
├── projects_client_a
├── events_client_a
└── telemetry_client_a

Workspace 3: Client B (Fintech)
├── employees_client_b
├── tickets_client_b
├── projects_client_b
├── events_client_b
└── telemetry_client_b
```

**Isolation Benefits:**
- Client A cannot see Client B tickets
- Budgets are workspace-scoped (Client A overspend doesn't affect Client B)
- Employees see only their assigned workspaces
- Data export requires workspace-specific authorization

---

### Cross-Workspace Queries (Rare)

**Use Case:** Agency-level reporting across all client workspaces.

**Operator-only capability:** Operator can query across workspaces for aggregate metrics.

**Command Palette:**
```
Ctrl+K → "Show total spend across all workspaces for this month"
```

**Response:**
```
Total spend across all workspaces (last 30 days):

Workspace          | Spend   | % of Total
---------------------|---------|------------
Strategia-X        | $280    | 63%
Client A            | $95     | 22%
Client B            | $67     | 15%
---------------------|---------|------------
TOTAL               | $442    | 100%

Trend: +12% vs. previous month
```

**Note:** This is operator-only. Employees cannot access cross-workspace data.

---

## Workspace Lifecycle

### Creating a New Workspace

**Scenario:** Agency wins new client (Client C: Healthcare analytics).

**Operator Action:** Create new workspace

**Navigate to:** Workspace Switcher → + Create Workspace

```
Creating Workspace: Client C (Healthcare)

Configuration:
- Name: Client C (Healthcare Analytics)
- Purpose: Healthcare data pipeline and analytics dashboard
- Owner: Rocky
- Budget: $120/month
- Employee quota: 6 employees
- Template: Apply Agency SOP v1.0

Initializing...
✅ Workspace created
✅ Policies applied (Agency SOP v1.0)
✅ Shared vault linked
✅ Budget configured ($120/month limit)
✅ Employee quota assigned (6 employees)

Next steps:
1. Hire employees for Client C workspace
2. Create project for client work
3. Import templates from shared vault
4. Schedule kickoff meeting
```

---

### Archiving a Workspace

**Scenario:** Client A project ends. Workspace should be archived for 90 days then deleted.

**Operator Action:** Archive workspace

**Navigate to:** Workspace Switcher → Client A → Archive

```
Archiving Workspace: Client A (Ecommerce)

Archive settings:
- Retention period: 90 days
- Data export: Full (tickets, events, telemetry)
- Employee access: Read-only during archive
- Budget: Suspended (no new spend)

What happens:
1. Workspace marked as "archived"
2. Employees cannot create new work
3. Existing tickets remain accessible (read-only)
4. Data exported to archival storage
5. Automated deletion in 90 days

Employees affected:
- Elena (Tech Lead): Access changed to read-only
- Priya (Frontend): Access changed to read-only
- Mike (Backend): Access changed to read-only

Reassignment:
- Employees reassigned to Strategia-X and Client B workspaces
- No duplicate work created

Archive date: 2026-05-03
Auto-delete date: 2026-08-01
```

---

## Key Takeaways

### 1. Workspaces Enable Separation of Concerns

Multiple workspaces allow the agency to isolate client data, budgets, and teams while sharing best practices via master policies.

### 2. Master Policies Scale Operations

Creating policies once and applying to all workspaces ensures consistency and reduces configuration overhead. The policy compliance check (via Copilot) ensures adherence.

### 3. Employee Sharing Requires Care

Multi-workspace employees need clear allocation strategies, timesheet logging, and cost allocation. Without these, tracking and billing become chaotic.

### 4. Data Isolation Is Non-Negotiable

Client A must never see Client B data. Database isolation (separate tables per workspace) and access control (workspace-scoped queries) ensure this.

### 5. Workspace Lifecycle Matches Client Lifecycle

Creating workspaces for new clients, archiving when projects end, and deleting after retention periods keeps the workspace ecosystem healthy and costs predictable.

---

## Related Documentation

- [Workspaces & Companies](../comprehensive-user-guide.md#3-workspaces--companies) — Workspace management
- [Settings & Configuration](../comprehensive-user-guide.md#15-settings--configuration) — Policy management
- [Autonomy → Access](../comprehensive-user-guide.md#13-autonomy-control-plane) — Multi-workspace access
- [Files & Deliverables](../comprehensive-user-guide.md#11-files--deliverables) — Shared vault

---

*Scenario: Multi-Workspace Operations — Draft v1.0*
