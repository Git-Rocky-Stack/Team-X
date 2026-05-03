# Integration Guide

**Connect Team-X with your existing tools and services**

---

## Overview

Team-X integrates with popular development tools, project management systems, and communication platforms. This guide covers setting up and configuring these integrations.

---

## Table of Contents

1. [GitHub Integration](#github-integration)
2. [GitLab Integration](#gitlab-integration)
3. [Slack Integration](#slack-integration)
4. [Discord Integration](#discord-integration)
5. [Jira Integration](#jira-integration)
6. [Notion Integration](#notion-integration)
7. [Custom Webhooks](#custom-webhooks)
8. [Troubleshooting](#troubleshooting)

---

## GitHub Integration

### Features

- **Pull Request Reviews:** Auto-review PRs when created
- **Issue Sync:** Create GitHub issues from tickets
- **Status Updates:** Update ticket status based on PR status
- **Commit Context:** Agent runs include commit history

### Setup

**Step 1: Create GitHub Personal Access Token**

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Select scopes:
   - `repo` (Full control of private repositories)
   - `read:org` (Read org and team membership)
   - `admin:org_hook` (Manage org hooks)
4. Copy token

**Step 2: Connect Team-X to GitHub**

```
In Team-X: Settings → Integrations → GitHub → Connect
→ Paste token
→ Select repositories
→ Enable features (PR reviews, Issue sync, etc.)
```

**Step 3: Configure Webhooks (Optional)**

For real-time PR notifications:

```
GitHub: Repository → Settings → Webhooks → Add webhook
→ Payload URL: https://api.teamflow-x.com/webhooks/github
→ Content type: application/json
→ Secret: [generate and copy]
→ Events: Pull requests, Pushes

Copy webhook secret to Team-X:
Settings → Integrations → GitHub → Webhook Secret
```

### Using the Integration

**Auto-review Pull Requests:**

When a PR is created, Team-X can automatically assign a reviewer:

```
PR #123 opened in repo/owner
→ Team-X detects new PR
→ Assigns employee (if configured)
→ Employee reviews code
→ Posts comment with feedback
```

**Create GitHub Issues from Tickets:**

```
Command Palette: "Create GitHub issue for ticket #42"
→ Team-X creates issue on GitHub
-> Links ticket to issue
→ Syncs status updates
```

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| Auto-review | Automatically review PRs | Off |
| Reviewer Assignee | Which employee reviews | First available |
| Issue Sync | Create GitHub issues from tickets | Off |
| Status Sync | Update ticket based on PR status | On |
| Comment Notification | Notify when PR comments added | On |

---

## GitLab Integration

### Features

- **Merge Request Reviews:** Auto-review MRs
- **Issue Sync:** Create GitLab issues from tickets
- **Pipeline Status:** Check pipeline status before review
- **Commit Context:** Agent runs include commit history

### Setup

**Step 1: Create GitLab Personal Access Token**

1. Go to GitLab Settings → Access Tokens
2. Create token with scopes:
   - `api`
   - `read_repository`
   - `read_user`
3. Copy token

**Step 2: Connect Team-X to GitLab**

```
In Team-X: Settings → Integrations → GitLab → Connect
→ Paste token
→ Select projects
→ Enable features
```

**Step 3: Configure Webhooks (Optional)**

```
GitLab: Project → Settings → Webhooks
→ URL: https://api.teamflow-x.com/webhooks/gitlab
→ Secret token: [generate and copy]
→ Trigger: Merge request events, Pipeline events

Copy secret to Team-X:
Settings → Integrations → GitLab → Webhook Secret
```

### Using the Integration

**Auto-review Merge Requests:**

```
MR #45 opened in project
→ Team-X assigns reviewer
→ Employee reviews code
→ Posts comment with feedback
→ Approves or requests changes
```

**Pipeline-Aware Reviews:**

```
MR opened → Pipeline running
→ Team-X waits for pipeline to complete
→ If pipeline passes: Review proceeds
→ If pipeline fails: Comment with failure details
```

---

## Slack Integration

### Features

- **Ticket Notifications:** Post ticket updates to channels
- **Agent Run Alerts:** Notify when agents complete work
- **Command Execution:** Run commands from Slack
- **Thread Sync:** Sync ticket threads with Slack threads

### Setup

**Step 1: Create Slack App**

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create New App → From scratch
3. App Name: "Team-X"
4. Workspace: Select your workspace

**Step 2: Configure OAuth Scopes**

```
Bot Token Scopes:
- chat:write (Post messages)
- channels:read (View channels)
- channels:history (Read message history)
- reactions:write (Add reactions)
```

**Step 3: Install App to Workspace**

1. Basic Information → Install to Workspace
2. Review permissions → Allow
3. Copy Bot User OAuth Token (`xoxb-...`)

**Step 4: Connect Team-X to Slack**

```
In Team-X: Settings → Integrations → Slack → Connect
→ Paste bot token
→ Select channels
→ Configure notifications
```

### Using the Integration

**Ticket Notifications to Slack:**

```
Ticket #47 assigned to Alex
→ Posted to #dev channel:
  "🎫 Ticket #47 assigned to Alex: Fix login bug"
  "Priority: High | Estimated: $2-5"

Agent completes ticket
→ Posted to #dev channel:
  "✅ Ticket #47 completed by Alex"
  "Duration: 2m 34s | Cost: $0.87"
```

**Slack Commands:**

```
In Slack: /teamx [command]

Examples:
/teamx show tickets
/teamx create ticket Fix the signup form
/teamx status What's our spend this month?
/teamx hire QA Engineer
```

### Notification Customization

| Event | Channel | Format | Mention |
|-------|---------|--------|---------|
| Ticket created | #general | Compact | Off |
| Ticket done | #dev | Detailed | Off |
| Agent failed | #alerts | Alert | @here |
| Budget alert | #dev | Warning | Off |

---

## Discord Integration

### Features

- **Ticket Notifications:** Post to Discord channels
- **Agent Run Alerts:** Notify of completion/failures
- **Command Execution:** Slash commands
- **Voice Channel Status:** Show who's working

### Setup

**Step 1: Create Discord Application**

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Name: "Team-X"
3. Create Bot
4. Copy Bot Token

**Step 2: Configure Bot Permissions**

```
Required Permissions:
- Send Messages
- Embed Links
- Add Reactions
- Use Slash Commands
- Connect to Voice (optional)
```

**Step 3: Invite Bot to Server**

1. OAuth2 → URL Generator
2. Select scopes: `bot`, `applications.commands`
3. Select permissions
4. Copy generated URL
5. Open in browser → Authorize

**Step 4: Connect Team-X to Discord**

```
In Team-X: Settings → Integrations → Discord → Connect
→ Paste bot token
→ Select server
→ Configure channels
```

### Using the Integration

**Slash Commands:**

```
In Discord: /teamx [command]

Available commands:
/teamx ticket — Create ticket
/teamx status — Show workspace status
/teamx spend — Show spend metrics
/teamx run — Show active agent runs
```

**Voice Channel Integration:**

```
Employee joins voice channel
→ Shows as "In call" in employee status
→ Other employees can see availability

Ticket discussion starting?
→ Move to voice channel
→ Team-X posts channel link in ticket thread
```

---

## Jira Integration

### Features

- **Issue Sync:** Create Jira issues from tickets
- **Status Mapping:** Sync ticket status to Jira status
- **Comment Sync:** Bidirectional comment sync
- **Time Tracking:** Log agent run time to Jira

### Setup

**Step 1: Create API Token**

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Create API token
3. Label: "Team-X Integration"
4. Copy token

**Step 2: Connect Team-X to Jira**

```
In Team-X: Settings → Integrations → Jira → Connect
→ Enter Jira URL (e.g., https://company.atlassian.net)
→ Enter email
→ Paste API token
→ Select projects
→ Configure field mappings
```

**Step 3: Configure Field Mappings**

```
Ticket Fields → Jira Fields:
Title → Summary
Description → Description
Priority → Priority
Assignee → Assignee
Status → Status (custom mapping)
Tags → Labels
```

### Using the Integration

**Create Jira Issue from Ticket:**

```
Ticket #52: "Add user authentication"
→ Command Palette: "Create Jira issue for this ticket"
→ Creates Jira issue: AUTH-123
→ Links ticket to issue
→ Syncs status updates
```

**Status Mapping:**

```
Team-X Status → Jira Status
Open → To Do
In Progress → In Progress
Done → Done
Cancelled → Closed
```

---

## Notion Integration

### Features

- **Database Sync:** Sync tickets to Notion database
- **Page Creation:** Create pages for deliverables
- **Status Updates:** Update Notion properties
- **Comments:** Sync comments to Notion

### Setup

**Step 1: Create Notion Integration**

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. New Integration → Name: "Team-X"
3. Associated workspace → Select workspace
4. Copy Internal Integration Token

**Step 2: Grant Database Access**

1. Open Notion database to sync
2. Click `...` → Add connections → Team-X
3. Grant access

**Step 3: Connect Team-X to Notion**

```
In Team-X: Settings → Integrations → Notion → Connect
→ Paste integration token
→ Select databases
→ Configure field mappings
```

### Using the Integration

**Sync Tickets to Notion Database:**

```
Notion Database: "Development Tasks"
→ Team-X syncs tickets
→ Properties mapped:
  - Title → Ticket title
  - Status → Ticket status
  - Assignee → Ticket assignee
  - Priority → Ticket priority
  - Due Date → Ticket due date
```

**Create Deliverable Pages:**

```
Ticket done: "Design new landing page"
→ Auto-create Notion page
→ Attach artifacts (Figma file, specs)
→ Link to ticket
→ Page organized in project database
```

---

## Custom Webhooks

### Creating Custom Integrations

For services without native integration, use custom webhooks:

**Step 1: Create Webhook Endpoint**

```
In Team-X: Settings → Integrations → Webhooks → Create
→ Name: "My Custom Integration"
→ URL: https://your-service.com/webhook
→ Events: Select events to send
→ Secret: Generate secret key
```

**Step 2: Handle Webhook Payload**

```python
from flask import Flask, request

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    # Verify signature
    signature = request.headers.get('X-Teamflow-X-Signature')
    # Verify using HMAC-SHA256

    # Process event
    payload = request.json
    event = payload['event']

    if event == 'ticket.done':
        # Your logic here
        pass

    return 'OK', 200
```

**Step 3: Test Integration**

```
In Team-X: Settings → Integrations → Webhooks → [Your webhook] → Test
→ Sends test payload
→ Check your endpoint logs
```

### Webhook Event Reference

| Event | When Fired | Key Fields |
|-------|------------|------------|
| `ticket.created` | New ticket created | ticket_id, title, assignee |
| `ticket.started` | Agent run started | ticket_id, run_id, employee |
| `ticket.done` | Ticket completed | ticket_id, run_id, duration, cost |
| `ticket.cancelled` | Ticket cancelled | ticket_id, reason |
| `run.failed` | Agent run failed | run_id, error, retry_possible |
| `budget.alert` | Budget threshold crossed | budget_id, spent, limit |
| `employee.hired` | Employee hired | employee_id, name, role |
| `employee.fired` | Employee fired | employee_id, reason |

---

## Troubleshooting

### GitHub/GitLab Webhooks Not Firing

**Symptoms:** No auto-reviews, status not syncing

**Solutions:**

1. **Verify webhook URL is correct**
   - GitHub: Repository → Settings → Webhooks
   - Check URL matches: `https://api.teamflow-x.com/webhooks/github`

2. **Check webhook secret**
   - Secret must match in both systems
   - Regenerate if mismatch

3. **Verify event types**
   - Ensure "Pull requests" or "Merge requests" events enabled
   - Test with "Test webhook" button

4. **Check repository access**
   - Token must have access to repository
   - Regenerate token if needed

### Slack/Discord Commands Not Working

**Symptoms:** Slash commands return errors

**Solutions:**

1. **Verify bot permissions**
   - Bot must be in server/channel
   - Re-authorize if permissions changed

2. **Check token validity**
   - Tokens may expire (Slack: User tokens expire)
   - Regenerate and update in Team-X

3. **Test with simple command**
   - `/teamx status` should always work
   - If this fails, integration is broken

### Webhook Signature Verification Failing

**Symptoms:** All webhook requests rejected as invalid

**Solutions:**

1. **Verify secret matches**
   - Team-X: Settings → Integrations → Webhook → Secret
   - Your server: Same secret

2. **Check timestamp**
   - Webhooks expire after 5 minutes
   - Ensure server clock is accurate

3. **Test signature logic**
   ```python
   import hmac
   import hashlib

   def verify_signature(payload, signature, secret):
       expected = hmac.new(
           secret.encode(),
           payload,
           hashlib.sha256
       ).hexdigest()
       return hmac.compare_digest(expected, signature)
   ```

---

## Best Practices

### Integration Security

1. **Use read-only tokens when possible** — Minimize risk
2. **Rotate tokens regularly** — Every 90 days
3. **Limit scope** — Only grant necessary permissions
4. **Use webhook secrets** — Prevent request forgery
5. **Audit access** — Review active integrations monthly

### Performance

1. **Batch operations** — Don't create webhooks per-ticket
2. **Use async processing** — Handle webhooks asynchronously
3. **Cache responses** — Reduce redundant API calls
4. **Set timeouts** — Prevent hanging integration calls

### Error Handling

1. **Retry with backoff** — Handle transient failures
2. **Log everything** — Audit trail for troubleshooting
3. **Degrade gracefully** — Integration failure ≠ app failure
4. **Alert appropriately** — Notify on critical failures only

---

**Need help?** Contact [integrations@teamflow-x.com](mailto:integrations@teamflow-x.com) or join the [Discord community](https://discord.gg/teamflow-x).

---

*Last updated: 2026-05-03*
