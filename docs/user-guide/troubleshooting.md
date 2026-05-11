# Troubleshooting Guide

**Solutions to common issues in Team-X**

---

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Login & Account Issues](#login--account-issues)
3. [Runtime & Agent Issues](#runtime--agent-issues)
4. [Provider Connection Issues](#provider-connection-issues)
5. [Employee & Ticket Issues](#employee--ticket-issues)
6. [Budget & Billing Issues](#budget--billing-issues)
7. [Performance Issues](#performance-issues)
8. [File & Workspace Issues](#file--workspace-issues)
9. [Advanced Diagnostics](#advanced-diagnostics)

---

## Installation Issues

### Team-X installer won't open

**Symptoms:**
- Double-clicking installer does nothing
- Installer window opens but freezes
- "Corrupted installer" error message

**Solutions:**

1. **Verify download:**
   ```
   Check file size matches download page
   Re-download from github.com/Git-Rocky-Stack/Team-X/releases
   ```

2. **Run as administrator:**
   - **Windows:** Right-click → "Run as administrator"
   - **macOS:** Verify app from unknown developer
     - System Preferences → Security & Privacy → "Open Anyway"

3. **Disable antivirus temporarily:**
   - Antivirus may block installer
   - Add Team-X to antivirus exceptions
   - Retry installation

4. **Check system requirements:**
   - **Windows:** Windows 10/11 (64-bit)
   - **macOS:** macOS 11+ (Big Sur or later)
   - **Linux:** Ubuntu 20.04+, Debian 11+

**Still not working?** Try the portable version (no installation required).

---

### Installation completes but app won't launch

**Symptoms:**
- Installation succeeds
- Clicking Team-X icon does nothing
- App crashes immediately on launch

**Solutions:**

1. **Check crash logs:**
   - **Windows:** `%APPDATA%/Team-X/logs/crash.log`
   - **macOS:** `~/Library/Logs/Team-X/crash.log`
   - **Linux:** `~/.config/Team-X/logs/crash.log`

2. **Clear corrupted cache:**
   ```
   Delete cache directory:
   - Windows: %APPDATA%/Team-X/Cache
   - macOS: ~/Library/Caches/Team-X
   - Linux: ~/.cache/Team-X
   ```

3. **Update graphics drivers:**
   - Team-X uses GPU acceleration
   - Update drivers from GPU manufacturer
   - NVIDIA: nvidia.com/drivers
   - AMD: amd.com/support
   - Intel: intel.com/support

4. **Disable GPU acceleration:**
   - Launch with flag: `Team-X.exe --disable-gpu`
   - Or set environment variable: `TEAM_X_DISABLE_GPU=1`

---

## Login & Account Issues

### "Invalid email or password" error

**Symptoms:**
- Cannot sign in with known credentials
- Error persists after password reset

**Solutions:**

1. **Verify email:**
   - Check for typos
   - Ensure using correct email (not username)

2. **Reset password:**
   - Click "Forgot Password?" on login screen
   - Check email for reset link (may be in spam)
   - Create new password

3. **Clear stored credentials:**
   ```
   Delete credentials file:
   - Windows: %APPDATA%/Team-X/credentials.json
   - macOS: ~/Library/Application Support/Team-X/credentials.json
   - Linux: ~/.config/Team-X/credentials.json
   ```

4. **Check account status:**
   - Verify account is not suspended
   - Contact support if account locked

---

### "Account already exists" error

**Symptoms:**
- Trying to sign up with email returns "already exists"
- Don't remember creating account

**Solutions:**

1. **Reset password:**
   - Use "Forgot Password?" to regain access
   - Email may have been used previously

2. **Check for social login:**
   - Account may be linked to Google/GitHub
   - Try "Sign in with Google" or "Sign in with GitHub"

3. **Contact support:**
   - Verify email ownership
   - Support can merge or close duplicate accounts

---

### Two-factor authentication (2FA) issues

**Symptoms:**
- Cannot receive 2FA code
- Authenticator app not working
- Lost 2FA device

**Solutions:**

1. **Check email/SMS:**
   - 2FA codes sent to registered email or phone
   - Wait up to 5 minutes for delivery
   - Check spam folder

2. **Time-sync authenticator app:**
   - Authenticator apps require accurate time
   - Enable automatic time sync on device
   - Manually sync time if needed

3. **Use backup codes:**
   - Backup codes provided during 2FA setup
   - Enter backup code instead of 2FA code
   - Each code can only be used once

4. **Disable 2FA (if locked out):**
   - Contact support with identity verification
   - Provide: Email, account creation date, recent activity
   - Support will disable 2FA after verification

---

## Runtime & Agent Issues

### Agent stuck in "Running" state

**Symptoms:**
- Agent shows "Running" for > 30 minutes
- No new messages in agent stream
- Provider not responding

**Solutions:**

1. **Check Agent Runs Panel:**
   - Look for error messages in stream
   - Check provider status (may be down)

2. **Wait longer for complex tasks:**
   - Large code generation: 10-30 minutes
   - Data analysis: 5-20 minutes
   - Architecture planning: 15-40 minutes

3. **Cancel the run:**
   - Agent Runs Panel → [Cancel]
   - Choose cancellation scope:
     - "Stop after current tool" (safer)
     - "Stop immediately" (may leave incomplete state)

4. **Review run logs:**
   - Agent run log shows where agent got stuck
   - Look for: timeouts, API errors, provider failures

5. **Prevent future stuck runs:**
   - Set timeout policies: Autonomy → Runtimes → Timeout
   - Enable auto-cancellation after X minutes
   - Configure provider failover

---

### Agent run failed with error

**Symptoms:**
- Agent stopped with error message
- Ticket shows "Failed" status
- No work completed

**Common errors and solutions:**

**Error: "budget_exhausted"**
- **Cause:** Per-ticket or monthly budget exceeded
- **Solution:**
  1. Approve budget override: Autonomy → Approvals
  2. Increase ticket budget
  3. Resume agent run

**Error: "provider_timeout"**
- **Cause:** Provider API not responding
- **Solution:**
  1. Check provider status page
  2. Retry with backup provider
  3. Configure failover for future

**Error: "runtime_disconnected"**
- **Cause:** External runtime (bash, node) disconnected
- **Solution:**
  1. Restart runtime: Autonomy → Runtimes → Restart
  2. Check runtime process (may have crashed)
  3. Verify runtime configuration

**Error: "mcp_server_timeout"**
- **Cause:** MCP server not responding
- **Solution:**
  1. Restart MCP server: Autonomy → MCP → Restart
  2. Check MCP server logs for errors
  3. Verify MCP server configuration

**Error: "tool_execution_failed"**
- **Cause:** Agent tool call failed (file write, bash command, etc.)
- **Solution:**
  1. Review agent run log for specific error
  2. Check file permissions (write access)
  3. Verify command syntax
  4. Provide feedback to agent in ticket thread

---

### Agent produced incorrect output

**Symptoms:**
- Agent completed task but output is wrong
- Code has bugs
- Analysis missed requirements

**Solutions:**

1. **Review the agent run log:**
   - Check if agent misunderstood requirements
   - Look for missing context or unclear instructions

2. **Provide corrective feedback:**
   ```
   In the ticket thread, write:
   "The component is missing the hover state mentioned in requirements.
   Please add hover:bg-blue-600 to the button class."
   ```

3. **Resume agent with feedback:**
   - Agent reads feedback and corrects work
   - No need to create new ticket

4. **Improve ticket descriptions:**
   - Be more specific with requirements
   - Provide examples of expected output
   - Include constraints and edge cases

5. **Add participants for review:**
   - Add senior engineer as participant
   - Participant reviews before agent marks done

---

## Provider Connection Issues

### "401 Unauthorized" error

**Symptoms:**
- Provider returns 401 error
- Agent cannot connect to Anthropic/OpenAI

**Solutions:**

1. **Verify API key:**
   - Settings → Providers → [Provider] → API Key
   - Regenerate key from provider dashboard
   - Copy and paste key (no extra spaces)

2. **Check key expiration:**
   - Some keys have expiration dates
   - Regenerate if expired

3. **Verify key permissions:**
   - Key must have API access
   - Check provider dashboard for key permissions

---

### "429 Rate Limited" error

**Symptoms:**
- Provider returns 429 error
- "Too many requests" message
- Agent unable to continue

**Solutions:**

1. **Wait and retry:**
   - Rate limits reset after 1 minute (typically)
   - Wait 60 seconds then retry

2. **Reduce concurrency:**
   - Fewer simultaneous agent runs
   - Stagger ticket start times

3. **Upgrade provider tier:**
   - Higher tiers have increased rate limits
   - Check provider pricing for details

4. **Use multiple provider accounts:**
   - Add backup API keys
   - Distribute load across keys

---

### "503 Service Unavailable" error

**Symptoms:**
- Provider returns 503 error
- Provider status page shows outage

**Solutions:**

1. **Check provider status:**
   - Anthropic: [status.anthropic.com](https://status.anthropic.com)
   - OpenAI: [status.openai.com](https://status.openai.com)

2. **Switch to backup provider:**
   - Configure failover: Settings → Providers → Failover
   - Agent automatically switches to backup

3. **Wait for provider recovery:**
   - Most outages resolved within 1 hour
   - Monitor provider status page

4. **Use Ollama local:**
   - No external dependency
   - Works during provider outages

---

## Employee & Ticket Issues

### Can't hire employee (quota exceeded)

**Symptoms:**
- "Employee quota exceeded" message
- Cannot create new employee

**Solutions:**

1. **Check current employee count:**
   - Mission Control → Employees
   - Count active employees

2. **Fire unused employees:**
   - Remove employees not contributing
   - Settings → Employees → [Employee] → Fire

3. **Upgrade plan:**
   - Higher tiers have increased employee quotas
   - Settings → Billing → Upgrade

---

### Ticket stuck in "Blocked" status

**Symptoms:**
- Ticket shows "Blocked" indefinitely
- Dependencies not completing

**Solutions:**

1. **Check dependency tickets:**
   - Ticket detail view → "Blocked by" section
   - Verify blocking tickets are actually done

2. **Resolve dependency tickets:**
   - Complete blocking tickets first
   - Or remove invalid dependencies

3. **Manually unblock:**
   - Ticket detail → Edit → Dependencies
   - Remove blocking dependency

4. **Check for circular dependencies:**
   - A depends on B, B depends on A (invalid)
   - Break the cycle

---

### Cannot add participant to ticket

**Symptoms:**
- Participant not receiving notifications
- Participant not showing in ticket

**Solutions:**

1. **Verify participant is employee:**
   - Only employees can be participants
   - Hire employee first if needed

2. **Check employee workspace access:**
   - Employee must have access to workspace
   - Settings → Employees → [Employee] → Workspace Access

3. **Re-add participant:**
   - Remove and re-add participant
   - Forces participant wake

---

## Budget & Billing Issues

### Budget exhausted unexpectedly

**Symptoms:**
- "budget_exhausted" error on active ticket
- Monthly budget exceeded early in month

**Solutions:**

1. **Review spend breakdown:**
   - Autonomy → Budgets → Spend Analysis
   - Identify highest-cost tickets

2. **Check for runaway agents:**
   - Agent Runs Panel → Look for long-running agents
   - Cancel if stuck

3. **Review routine costs:**
   - Autonomy → Routines → Check routine spend
   - Pause or reduce frequency of expensive routines

4. **Approve budget override:**
   - Autonomy → Approvals → Review override request
   - Approve if legitimate spend

5. **Adjust budgets:**
   - Increase monthly budget if needed
   - Set lower per-ticket limits for risky work

---

### Charges seem too high

**Symptoms:**
- Spend higher than expected
- Cannot explain costs

**Solutions:**

1. **Review Copilot cost insights:**
   - Copilot → Cost Insights
   - Shows breakdown by employee, ticket, provider

2. **Check provider costs:**
   - Autonomy → Budgets → Provider Costs
   - Compare token usage vs. expected

3. **Review agent run logs:**
   - Look for repeated failed attempts (retries cost money)
   - Check for unnecessary tool calls

4. **Optimize provider selection:**
   - Use cheaper models for routine tasks
   - Reserve expensive models for complex work

5. **Set aggressive budgets:**
   - Lower per-ticket limits catch overspend early
   - Monthly cap prevents runaway spend

---

## Performance Issues

### Team-X running slowly

**Symptoms:**
- Lagging UI
- Slow panel switching
- Delayed updates

**Solutions:**

1. **Check CPU/memory usage:**
   - Open Task Manager / Activity Monitor
   - Team-X should use < 500MB RAM normally
   - Restart if using > 2GB RAM (memory leak)

2. **Close unused panels:**
   - Each open panel consumes resources
   - Close panels not actively used

3. **Clear cache:**
   - Settings → Advanced → Clear Application Cache
   - Restart Team-X

4. **Disable animations:**
   - Settings → Appearance → Disable Animations
   - Reduces GPU usage

5. **Reduce concurrent agent runs:**
   - Each active run consumes resources
   - Limit to 3-5 concurrent runs

---

### High memory usage

**Symptoms:**
- Team-X using > 2GB RAM
- System slows down when Team-X open

**Solutions:**

1. **Restart Team-X:**
   - Memory leaks accumulate over time
   - Daily restart recommended

2. **Reduce concurrent agent runs:**
   - Each run holds conversation context in memory
   - Limit concurrent runs

3. **Clear old ticket data:**
   - Archive old tickets (removes from memory)
   - Settings → Data → Archive Old Tickets

4. **Disable unnecessary features:**
   - Disable Copilot if not needed (Settings → Copilot)
   - Disable routine auto-execution

---

## File & Workspace Issues

### Files not saving

**Symptoms:**
- Agent reports file saved but file not found
- Write operations fail silently

**Solutions:**

1. **Check approval workflow:**
   - Write operations may require approval
   - Autonomy → Approvals → Review pending approvals
   - Approve write operations

2. **Check disk space:**
   - Verify sufficient space on target drive
   - Free up space if needed

3. **Check file permissions:**
   - Verify Team-X has write access to directory
   - Check file is not read-only
   - Check directory is not locked by another process

4. **Review Audit Trail:**
   - Audit Trail → Filter by "write" operations
   - Check if file operation failed
   - Look for error messages

5. **Manually save file:**
   - Copy content from agent artifact
   - Manually save to target location
   - Report bug if this works (approval workflow issue)

---

### Workspace data corrupted

**Symptoms:**
- Crashes when opening workspace
- Missing tickets or employees
- Data inconsistencies

**Solutions:**

1. **Restore from backup:**
   - Team-X creates automatic backups hourly
   - Settings → Data → Restore from Backup
   - Select backup point before corruption

2. **Export and reimport:**
   - Settings → Data → Export Workspace
   - Create new workspace
   - Import exported data

3. **Contact support:**
   - Provide workspace ID and corruption symptoms
   - Support may be able to repair database
   - Backup your data before attempting repairs

---

## Advanced Diagnostics

### Run Doctor for health check

**Doctor** provides comprehensive system health check:

**Navigate to:** Autonomy → Doctor → Run Doctor

**Doctor report includes:**
- Database integrity
- Recovery readiness
- Runtime posture
- Secrets status
- Provider health
- MCP health
- Budget blockers

**Doctor actions:**
- **Run Doctor:** Full health check
- **Export Report:** Save report for support
- **Auto-Fix:** Attempt to fix issues automatically

---

### Enable debug logging

**For complex issues, enable debug logging:**

1. **Enable debug mode:**
   - Settings → Advanced → Enable Debug Logging
   - Restart Team-X

2. **Reproduce issue:**
   - Perform actions that cause problem
   - Debug logs capture detailed information

3. **Collect logs:**
   - **Windows:** `%APPDATA%/Team-X/logs/debug.log`
   - **macOS:** `~/Library/Logs/Team-X/debug.log`
   - **Linux:** `~/.config/Team-X/logs/debug.log`

4. **Disable debug mode:**
   - Settings → Advanced → Disable Debug Logging
   - Debug logs are large and slow down app

5. **Share with support:**
   - Attach debug log to support ticket
   - Include steps to reproduce issue

---

### Reset Team-X to factory settings

**Last resort: Reset Team-X (loses all local data):**

**Warning:** This deletes all workspace data, employees, tickets, and settings. Only do this if:

- No other solutions work
- You have a backup to restore
- Starting fresh is acceptable

**Steps:**

1. **Close Team-X completely**

2. **Delete application data:**
   - **Windows:** Delete `%APPDATA%/Team-X/`
   - **macOS:** Delete `~/Library/Application Support/Team-X/`
   - **Linux:** Delete `~/.config/Team-X/`

3. **Reinstall Team-X:**
   - Download fresh installer
   - Install and create new workspace

4. **Restore from backup (if available):**
   - Settings → Data → Restore from Backup

---

## Still Need Help?

### Open a GitHub issue

Team-X is open-source and community-supported — there is no support email or hosted help desk. Bugs and reproducible issues go in the issue tracker:

**Issues:** [github.com/Git-Rocky-Stack/Team-X/issues](https://github.com/Git-Rocky-Stack/Team-X/issues)

**Include with your report:**
- Operating system and version
- Team-X version (Help → About)
- Detailed description of issue
- Steps to reproduce (if applicable)
- Relevant logs (debug.log, crash.log)
- Screenshots (if visual issue)

### Community Support

- **Discussions:** [github.com/Git-Rocky-Stack/Team-X/discussions](https://github.com/Git-Rocky-Stack/Team-X/discussions) — Q&A, ideas, show-and-tell

### Documentation

- **Comprehensive User Guide:** [Full documentation](./comprehensive-user-guide.md)
- **Quick Start Guide:** [Get started in 15 minutes](./getting-started/quick-start.md)
- **FAQ:** [Frequently asked questions](./faq.md)
- **Scenarios:** [Real-world examples](./scenarios/)

---

*Last updated: 2026-05-03*
