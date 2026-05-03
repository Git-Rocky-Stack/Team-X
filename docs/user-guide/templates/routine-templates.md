# Routine Templates

**Pre-configured routine templates for common automation tasks.**

---

## Using These Templates

Each template includes:
- **Purpose:** What the routine does
- **Schedule:** Suggested frequency (cron format)
- **Work Template:** Ticket template for routine-generated work
- **Budget:** Estimated monthly cost
- **Configuration:** Tools and settings

---

## 1. Daily Code Review

**Purpose:** Review all code changes from the past 24 hours and provide feedback

**Schedule:** `0 9 * * MON,WED,FRI` (9am, Monday/Wednesday/Friday)

**Work Template:**
```
Title: Daily code review for [date]

Description:
Review all code changes from the past 24 hours and provide feedback.

For each pull request/commit:
1. Review code for correctness and best practices
2. Check for security issues
3. Assess test coverage
4. Provide constructive feedback
5. Flag any critical issues requiring immediate attention

Focus areas:
- Security vulnerabilities
- Performance issues
- Code quality and maintainability
- Test coverage

Output format:
Summary of changes reviewed
List of issues found (critical/high/medium/low)
Specific feedback for each PR
Recommendations for improvements
```

**Assignee:** Tech Lead / Senior Engineer
**Tools:** git, GitHub API, code analysis tools
**Budget:** ~$20-40/month (3 runs/month)
**Configuration:** Provide GitHub token, repo list

---

## 2. Nightly Data Sync

**Purpose:** Synchronize data between external systems and workspace database

**Schedule:** `0 2 * * *` (2am daily)

**Work Template:**
```
Title: Nightly data sync - [date]

Description:
Perform data synchronization between [system A] and [system B].

Sync operations:
1. Fetch updates from source system
2. Transform data to target format
3. Update target system
4. Handle conflicts and errors
5. Generate sync report

Error handling:
- Log all errors
- Retry failed operations (max 3 attempts)
- Alert if error rate > 10%
- Partial sync acceptable (resume next run)

Deliverables:
- Sync report (records processed, errors, warnings)
- Error log (if any errors occurred)
```

**Assignee:** Backend Engineer / Data Engineer
**Tools:** Database connectors, API clients, data transformation tools
**Budget:** ~$30-50/month (30 runs/month)
**Configuration:** API keys, database connections, sync mappings

---

## 3. Weekly Summary Report

**Purpose:** Generate weekly summary of workspace activity and key metrics

**Schedule:** `0 9 * * MON` (9am every Monday)

**Work Template:**
```
Title: Weekly summary - [Week of MM/DD]

Description:
Generate comprehensive weekly summary report for workspace.

Report sections:
1. Activity Overview
   - Tickets created/completed
   - Agent runs executed
   - Total spend

2. Team Performance
   - Top performing employees
   - Tickets completed by employee
   - Average completion time

3. Key Achievements
   - Features shipped
   - Milestones reached
   - Improvements made

4. Issues and Blockers
   - Critical issues encountered
   - Blockers and resolutions
   - Outstanding concerns

5. Financial Summary
   - Spend vs budget
   - Cost per ticket
   - Cost trends

6. Upcoming Work
   - Tickets in progress
   - Planned features
   - Resource needs

Format: Markdown report with tables and metrics
Audience: Operator and stakeholders
```

**Assignee:** Product Manager / Tech Lead
**Tools:** Database queries, metrics aggregation, report generation
**Budget:** ~$10-15/month (4 runs/month)
**Configuration:** Workspace access, report recipients

---

## 4. Security Vulnerability Scan

**Purpose:** Scan dependencies and code for known security vulnerabilities

**Schedule:** `0 3 * * *` (3am daily)

**Work Template:**
```
Title: Security scan - [date]

Description:
Run security vulnerability scan on [repositories/workspace].

Scan targets:
- Package dependencies (npm, pip, cargo, etc.)
- Docker images
- Code patterns for security issues

For each vulnerability found:
- Assess severity (CRITICAL, HIGH, MEDIUM, LOW)
- Identify affected packages/versions
- Check for available fixes
- Create ticket if action needed

Actions by severity:
- CRITICAL: Create ticket, assign immediately
- HIGH: Create ticket, assign to queue
- MEDIUM: Weekly summary ticket
- LOW: Log only

Deliverables:
- Vulnerability report
- Tickets created for CRITICAL/HIGH issues
- Summary of MEDIUM/LOW findings
```

**Assignee:** Security Engineer / DevOps Engineer
**Tools:** npm audit, cargo audit, pip-audit, Snyk, Docker security scanning
**Budget:** ~$15-25/month (30 runs/month)
**Configuration:** Repository list, vulnerability database access

---

## 5. Cost Anomaly Detection

**Purpose:** Monitor for unusual spending patterns and cost anomalies

**Schedule:** `0 */6 * * *` (Every 6 hours)

**Work Template:**
```
Title: Cost anomaly check - [timestamp]

Description:
Check for cost anomalies and unusual spending patterns.

Checks to perform:
1. Compare current spend to same period yesterday
2. Check for tickets exceeding budget estimates
3. Identify agents running > 30 minutes
4. Check routine spend vs baseline
5. Identify unusual provider usage

Alert conditions:
- Spend > 150% of same period yesterday
- Single ticket > $10
- Agent running > 45 minutes
- Routine spend > 200% of average

Actions:
- If alert: Create ticket for operator review
- Include: Details of anomaly, likely cause, recommended action
- If no alert: Log "normal" status

Deliverables:
- Anomaly report (if anomalies found)
- Alert ticket (if conditions met)
```

**Assignee:** Auto (no employee assigned)
**Tools:** Budget queries, spend analytics, comparison logic
**Budget:** ~$10-20/month (120 runs/month)
**Configuration:** Anomaly thresholds, alert recipients

---

## 6. Database Backup

**Purpose:** Automated backup of workspace database to external storage

**Schedule:** `0 4 * * *` (4am daily)

**Work Template:**
```
Title: Database backup - [date]

Description:
Perform automated backup of workspace database.

Backup operations:
1. Create database dump
2. Compress backup file
3. Upload to external storage ([S3, GCS, etc.])
4. Verify backup integrity
5. Clean up old backups (retain last 30 days)

Backup contents:
- Tickets
- Employees
- Projects
- Events (audit trail)
- Telemetry data

Error handling:
- Log all errors
- Retry failed uploads (max 3 attempts)
- Alert if backup fails
- Verify backup size (detect incomplete backups)

Deliverables:
- Backup file in external storage
- Backup verification report
- Alert if backup failed
```

**Assignee:** Auto (no employee assigned)
**Tools:** Database dump tools, compression utilities, storage SDK
**Budget:** ~$5-15/month (storage costs)
**Configuration:** Database credentials, storage credentials, retention policy

---

## 7. Performance Monitoring

**Purpose:** Check system performance and identify degradation

**Schedule:** `0 */4 * * *` (Every 4 hours)

**Work Template:**
```
Title: Performance check - [timestamp]

Description:
Monitor system performance metrics and identify degradation.

Metrics to check:
1. Agent run duration (vs baseline)
2. Provider response times
3. Database query performance
4. Runtime health status
5. Workspace responsiveness

Alert conditions:
- Agent run duration > 200% of baseline
- Provider timeout rate > 5%
- Database query time > 2x baseline
- Runtime unhealthy
- Workspace load time > 5 seconds

Actions:
- If alert: Create ticket for investigation
- Include: Metric details, trend analysis, likely cause
- If no alert: Log metrics for trend analysis

Deliverables:
- Performance report (if issues found)
- Alert ticket (if conditions met)
- Metrics log (for trend analysis)
```

**Assignee:** DevOps Engineer
**Tools:** Performance monitoring, metrics collection, logging
**Budget:** ~$15-30/month (180 runs/month)
**Configuration:** Monitoring endpoints, alert thresholds

---

## 8. Dependency Updates

**Purpose:** Check for and apply dependency updates (with approval)

**Schedule:** `0 6 * * MON` (6am every Monday)

**Work Template:**
```
Title: Dependency update check - [date]

Description:
Check for available dependency updates and create update tickets.

Checks to perform:
1. Run outdated dependency check
2. Check for security updates
3. Check for major version updates
4. Assess update risk (breaking changes)
5. Create update tickets for safe updates

Categories:
- Security updates: High priority, create ticket
- Minor/patch updates: Medium priority, batch ticket
- Major updates: Low priority, review ticket only

For each update:
- List package, current version, available version
- Assess breaking changes
- Estimate effort to update
- Recommend action (update now / schedule / defer)

Deliverables:
- Update report (available updates, recommendations)
- Tickets for recommended updates
- Breaking change analysis for major versions
```

**Assignee:** DevOps Engineer / Backend Engineer
**Tools:** npm outdated, cargo outdated, pip list --outdated
**Budget:** ~$5-10/month (4 runs/month)
**Configuration:** Package manager, repository list

---

## 9. Documentation Sync

**Purpose:** Keep documentation in sync with code changes

**Schedule:** `0 10 * * FRI` (10am every Friday)

**Work Template:**
```
Title: Documentation sync - [week of MM/DD]

Description:
Review code changes from past week and update documentation.

Checks to perform:
1. Review merged PRs from past week
2. Identify changes requiring doc updates
3. Check for new features/behaviors not documented
4. Find outdated documentation
5. Update or flag for update

Documentation to update:
- API documentation (if API changes)
- User guides (if user-facing changes)
- Developer docs (if internal changes)
- README files (if setup/config changes)
- Comments/JSDoc (if code changes)

Actions:
- Trivial updates: Apply directly
- Moderate updates: Create ticket
- Complex updates: Create ticket and flag for review

Deliverables:
- Sync report (changes reviewed, updates applied)
- Tickets for pending documentation work
```

**Assignee:** Technical Writer / Senior Engineer
**Tools:** Git, documentation tools, markdown editors
**Budget:** ~$8-15/month (4 runs/month)
**Configuration:** Repository list, documentation locations

---

## 10. Health Check

**Purpose:** Comprehensive system health check (like Doctor, but scheduled)

**Schedule:** `0 8 * * *` (8am daily)

**Work Template:**
```
Title: System health check - [date]

Description:
Run comprehensive health check on all systems.

Checks to perform:
1. Database integrity
2. Runtime health
3. Provider connectivity
4. MCP server status
5. Budget status
6. Active agent runs (stuck?)
7. Routine execution status
8. Error log analysis

For each check:
- Report status (PASS/FAIL/WARNING)
- Include details and metrics
- Flag issues requiring attention

Severity levels:
- CRITICAL: System down, immediate action
- HIGH: Degraded performance, address soon
- MEDIUM: Minor issues, schedule fix
- LOW: Informational, monitor

Deliverables:
- Health check report
- Tickets for CRITICAL/HIGH issues
- Summary for operator review
```

**Assignee:** Auto (no employee assigned)
**Tools:** Doctor API, health checks, log analysis
**Budget:** ~$10-20/month (30 runs/month)
**Configuration:** System endpoints, check thresholds

---

## Routine Configuration Best Practices

### 1. Start Simple
- Begin with low-frequency schedules (daily, weekly)
- Increase frequency once validated
- Monitor costs before adding runs

### 2. Set Budget Caps
- Always set monthly budget limits
- Include buffer for unexpected usage
- Monitor first few runs to calibrate

### 3. Use Approval Gates
- Require approval for routine-generated tickets
- Prevents ticket spam if routine malfunctions
- Review and adjust thresholds based on feedback

### 4. Monitor Early
- Check first few executions carefully
- Validate output quality
- Adjust work template as needed

### 5. Handle Errors Gracefully
- Include error handling in work template
- Set retry limits (3-5 attempts max)
- Alert on failures, don't fail silently

### 6. Document Routines
- Keep routine documentation updated
- Explain purpose, schedule, expected output
- Help operators understand routine behavior

---

## Routine Maintenance

### Quarterly Review

Every quarter, review all routines:

```
- [ ] Is routine still needed?
- [ ] Is schedule appropriate?
- [ ] Is budget on target?
- [ ] Is output quality good?
- [ ] Can routine be optimized?
- [ ] Are there new requirements?
```

### Deprecation Process

When retiring a routine:

1. **Week 1:** Add deprecation notice to routine output
2. **Week 2:** Reduce frequency (daily → weekly)
3. **Week 3:** Disable routine
4. **Week 4:** Delete routine

---

**Need more guidance?** See [scenarios/05-autonomous-routine-governance.md](../scenarios/05-autonomous-routine-governance.md) for routine governance examples.

---

*Last updated: 2026-05-03*
