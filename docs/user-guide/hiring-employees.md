# Hiring Employees

Team-X ships with 55 curated F10-quality roles across 6 hierarchy levels. This guide covers hiring, firing, promoting, and managing your org chart.

## The Role Catalog

Open the **Hire Dialog** by clicking the "Hire" button in the Dashboard or sidenav. The dialog shows a searchable, filterable catalog:

### Hierarchy Levels

| Level | Count | Examples |
|-------|-------|----------|
| Officer | 5 | CEO, CTO, CFO, COO, CMO |
| Senior Management | 7 | VP Engineering, VP Product, VP Sales |
| Management | 8 | Engineering Manager, Product Manager, Design Manager |
| Supervisor | 5 | Team Supervisor, QA Supervisor |
| Lead | 5 | Tech Lead, Design Lead, Data Lead |
| IC | 25 | Senior Fullstack Engineer, Frontend Developer, Data Scientist, UX Researcher |

### Filtering

- **Search** — type a role name or keyword to filter
- **Level chips** — click a level chip to show only roles at that level
- Filters combine: searching "engineer" with the "IC" chip active shows only IC-level engineering roles

## Hiring an Employee

1. Open the Hire Dialog
2. Browse or search the role catalog
3. Click on a role to select it
4. **Set a manager** — choose who this employee reports to in the "Reports to" dropdown
5. Click **Hire**

The new employee appears on the Dashboard, in the org chart, and is immediately available for chat and ticket assignment.

### What Happens on Hire

- A new row is inserted into the `employees` table
- An org edge is created linking the employee to their manager
- The role's system prompt is rendered with company and employee context variables
- An event is logged in the audit trail

## The Org Chart

Navigate to the **Org** subtab in the Dashboard to see the full hierarchy.

### Reading the Chart

- Employees are displayed in an indented tree, grouped by reporting line
- **Color-coded levels** make it easy to identify the hierarchy at a glance
- The tree starts from the top (Officers) and flows down through management to ICs

### Rearranging

- **Drag an employee** to a new position in the tree to change their reporting line
- The org chart prevents cycles — you cannot make someone report to their own subordinate

## Managing Employees

### Promoting

1. Right-click an employee or use the employee detail panel
2. Select **Promote**
3. Choose the new role from the catalog
4. The employee's role specification, level, and system prompt are updated

### Changing Managers

1. Select an employee
2. Use **Set Manager** to pick a new reporting line
3. The org chart updates immediately

### Firing

1. Select an employee
2. Click **Fire**
3. The employee is soft-deleted (archived) — their data remains in the database for audit purposes
4. Active tickets assigned to them can be reassigned

## Best Practices

- **Start with a CEO.** Give your organization a strategic leader who can delegate to others.
- **Build depth, not just breadth.** A VP of Engineering managing 3 Tech Leads who each manage 5 engineers creates natural delegation patterns.
- **Match roles to goals.** If your company goal is "Ship the MVP," hire engineers, a product manager, and a QA lead — not 5 VPs.
- **Use the right model tier per level.** Officers benefit from planning-tier models (Claude Opus, GPT-4); ICs work well with development-tier models (Sonnet, GPT-4o).
