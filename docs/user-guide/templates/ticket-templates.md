# Ticket Templates

**Pre-defined ticket templates for common work types.**

---

## Using These Templates

Each template includes:
- **Title:** Suggested ticket title
- **Description:** Detailed requirements
- **Assignee:** Recommended employee role
- **Participants:** Additional roles to include
- **Priority:** Suggested priority level
- **Estimated Cost:** Budget guidance
- **Dependencies:** Common dependencies to consider

---

## 1. Feature Development

**Title:** Implement [Feature Name]

**Description:**
```
Implement [Feature Name] with the following requirements:

## User Stories
As a [user type], I want [action] so that [benefit].

## Functional Requirements
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

## Technical Requirements
- Language/Framework: [e.g., React, TypeScript]
- Dependencies: [List any dependencies]
- Integration points: [What this connects to]

## Acceptance Criteria
- [ ] [Criterion 1 — verifiable condition]
- [ ] [Criterion 2 — verifiable condition]
- [ ] [Criterion 3 — verifiable condition]

## Edge Cases to Handle
- [Edge case 1]
- [Edge case 2]
- [Edge case 3]

## Deliverables
- Production code
- Unit tests (>80% coverage)
- Documentation (JSDoc / docstrings)
- Update to [relevant docs]

## Constraints
- Time limit: [e.g., 4 hours]
- Budget: $[X.XX]
- Must not break: [existing features]
```

**Assignee:** Full Stack Engineer / Backend Engineer / Frontend Engineer
**Participants:** Tech Lead, Designer (if UI involved), QA Engineer
**Priority:** Normal / High / Critical
**Estimated Cost:** $5-50 (depending on complexity)
**Dependencies:** Design mockups, API contracts, architecture decision

---

## 2. Bug Fix

**Title:** Fix [Bug Description] in [Component/Area]

**Description:**
```
## Bug Report
**Summary:** [One-line description of bug]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior:** [What should happen]

**Actual Behavior:** [What actually happens]

**Environment:**
- Browser/OS: [e.g., Chrome 122, Windows 11]
- Workspace: [Workspace name]
- Employee: [Who encountered it]

**Impact:** [Severity — Critical/High/Medium/Low]
- [Who is affected]
- [What functionality is broken]
- [Business impact]

## Fix Requirements
- Identify root cause
- Implement fix
- Add regression test
- Verify no regressions
- Document fix in code comments

## Deliverables
- Fixed code
- Regression test
- Root cause analysis (in comments)

## Constraints
- Must not break existing functionality
- Test in [affected environments]
```

**Assignee:** Full Stack Engineer / Backend Engineer / Frontend Engineer
**Participants:** Tech Lead, QA Engineer
**Priority:** High / Critical
**Estimated Cost:** $2-20
**Dependencies:** None (usually urgent)

---

## 3. Code Review

**Title:** Review PR #[Number]: [PR Title]

**Description:**
```
## Pull Request Details
**PR Link:** [GitHub/GitLab URL]
**Author:** [Employee who created PR]
**Branches:** [source] → [destination]
**Lines changed:** [+XXX -YYY]

## Review Scope
- [ ] Code correctness and logic
- [ ] Architecture and design patterns
- [ ] Performance implications
- [ ] Security considerations
- [ ] Test coverage
- [ ] Documentation
- [ ] Naming and conventions

## Review Checklist
**Functionality:**
- [ ] Does the code do what it claims?
- [ ] Are edge cases handled?
- [ ] Is error handling appropriate?

**Code Quality:**
- [ ] Is code readable and maintainable?
- [ ] Are variable/function names clear?
- [ ] Is complexity reasonable?
- [ ] Are there appropriate comments?

**Tests:**
- [ ] Are tests comprehensive?
- [ ] Do tests pass?
- [ ] Are edge cases tested?

**Security:**
- [ ] No hardcoded secrets?
- [ ] Input validation present?
- [ ] SQL injection / XSS protection?
- [ ] Authentication/authorization correct?

**Performance:**
- [ ] Any obvious performance issues?
- [ ] Database queries optimized?
- [ ] Caching considered?

## Review Outcome
- [ ] Approve
- [ ] Approve with suggestions
- [ ] Request changes

## Comments
[List specific feedback with line numbers]
```

**Assignee:** Tech Lead / Senior Engineer
**Participants:** PR Author (for clarification)
**Priority:** Normal
**Estimated Cost:** $1-10
**Dependencies:** PR must be created first

---

## 4. Documentation

**Title:** Document [Feature/Component/API]

**Description:**
```
## Documentation Requirements
Create comprehensive documentation for [subject].

## Target Audience
- [Primary audience — e.g., API users, end users, developers]
- [Secondary audience — e.g., maintainers, integrators]

## Required Sections

### Overview
- What is [subject]?
- Why does it exist?
- When should it be used?

### Getting Started
- Quick start example
- Minimal working example
- Prerequisites

### Reference
- API reference (if applicable)
- Configuration options
- Parameters and return values

### Examples
- Common use cases (3-5 examples)
- Advanced usage
- Edge cases

### Troubleshooting
- Common issues
- Error messages
- Solutions

## Format
- [ ] Markdown (.md)
- [ ] Inline code examples
- [ ] Syntax highlighting
- [ ] Diagrams (if helpful — Mermaid, ASCII)

## Deliverables
- Documentation file(s)
- Update to table of contents (if applicable)
- Review for accuracy and completeness

## Reviewers
- [ ] Technical accuracy: [Name]
- [ ] User perspective: [Name]
- [ ] Editorial review: [Name]
```

**Assignee:** Technical Writer / Senior Engineer
**Participants:** Subject matter expert(s)
**Priority:** Normal
**Estimated Cost:** $3-15
**Dependencies:** Feature must be complete and stable

---

## 5. Testing

**Title:** Test Coverage for [Component/Feature]

**Description:**
```
## Testing Requirements
Create comprehensive tests for [subject].

## Test Types Required
- [ ] Unit tests (functions, components)
- [ ] Integration tests (interactions)
- [ ] E2E tests (user flows)
- [ ] Performance tests (if applicable)

## Test Coverage Target
- Minimum: 80% code coverage
- Target: 90%+ code coverage
- Critical paths: 100% coverage

## Test Cases to Cover

### Happy Path
- [ ] [Scenario 1 — normal usage]
- [ ] [Scenario 2 — typical workflow]

### Edge Cases
- [ ] [Edge case 1 — empty input]
- [ ] [Edge case 2 — boundary conditions]
- [ ] [Edge case 3 — null/undefined]

### Error Handling
- [ ] [Error scenario 1]
- [ ] [Error scenario 2]

### Performance
- [ ] [Performance scenario 1 — large dataset]
- [ ] [Performance scenario 2 — concurrent load]

## Test Framework
- [ ] Specify framework (Jest, pytest, etc.)
- [ ] Mocking strategy
- [ ] Test data fixtures

## Deliverables
- Test file(s)
- Test report (coverage %)
- Documentation of test approach

## Constraints
- Tests must pass before merge
- No flaky tests
- Fast execution (< 5 min total)
```

**Assignee:** QA Engineer / Developer
**Participants:** Developer (for implementation context)
**Priority:** High
**Estimated Cost:** $3-20
**Dependencies:** Feature implementation complete

---

## 6. Research / Investigation

**Title:** Research: [Topic/Question]

**Description:**
```
## Research Objective
[What we need to learn or decide]

## Research Questions
1. [Question 1]
2. [Question 2]
3. [Question 3]

## Research Areas
- [Technology comparison — e.g., React vs Vue]
- [Architecture options — e.g., SQL vs NoSQL]
- [Best practices — e.g., authentication patterns]
- [Tool evaluation — e.g., testing frameworks]

## Required Output
- [ ] Executive summary (1-2 paragraphs)
- [ ] Comparison table (if evaluating options)
- [ ] Recommendation with rationale
- [ ] Implementation considerations
- [ ] Risks and mitigations

## Sources to Consult
- [Official documentation]
- [Benchmark studies]
- [Community discussions (GitHub, Stack Overflow)]
- [Industry best practices]

## Deliverables
- Research document (Markdown)
- Presentation slides (if team review needed)
- Recommendation summary

## Success Criteria
- [ ] Recommendation is actionable
- [ ] Trade-offs are clear
- [ ] Implementation path is defined
- [ ] Stakeholder questions anticipated
```

**Assignee:** Tech Lead / Senior Engineer / Product Manager
**Participants:** Stakeholders
**Priority:** Normal
**Estimated Cost:** $5-25
**Dependencies:** Clear research scope

---

## 7. Security Review

**Title:** Security Review: [Component/System]

**Description:**
```
## Security Review Scope
[Component/system being reviewed]

## Review Checklist

### Authentication & Authorization
- [ ] Auth flows secure?
- [ ] Authorization checks on all endpoints?
- [ ] Session management correct?
- [ ] Password requirements adequate?

### Input Validation
- [ ] All user inputs validated?
- [ ] SQL injection prevented?
- [ ] XSS prevented?
- [ ] CSRF protection present?

### Data Protection
- [ ] Sensitive data encrypted at rest?
- [ ] Sensitive data encrypted in transit?
- [ ] No sensitive data in logs?
- [ ] Secrets managed properly?

### API Security
- [ ] Rate limiting configured?
- [ ] API authentication secure?
- [ ] Input sanitization on all endpoints?
- [ ] Error messages don't leak info?

### Dependencies
- [ ] Dependencies up to date?
- [ ] No known vulnerabilities (npm audit, etc.)?
- [ ] Dependency pinning in place?

## Review Process
1. Automated scan (if available)
2. Manual review against checklist
3. Threat modeling
4. Penetration testing (if critical)

## Deliverables
- Security review document
- Vulnerability report (if any found)
- Remediation plan (if vulnerabilities found)
- Re-review date

## Severity Levels
- **Critical:** Fix immediately (security risk)
- **High:** Fix within 1 week
- **Medium:** Fix within 1 month
- **Low:** Fix in next cycle
```

**Assignee:** Security Engineer / Senior Engineer
**Participants:** Tech Lead, DevOps
**Priority:** High / Critical
**Estimated Cost:** $5-30
**Dependencies:** Feature complete

---

## 8. Performance Optimization

**Title:** Optimize [Component/Query/Process]

**Description:**
```
## Performance Issue
**Current State:** [Describe slow performance]
**Target:** [Specific improvement goal]

## Performance Metrics
- Current: [e.g., 3.2s load time, 1500ms query]
- Target: [e.g., <1s load time, <200ms query]
- Measurement: [How we're measuring]

## Investigation Areas
- [ ] Algorithm complexity
- [ ] Database query optimization
- [ ] Caching strategy
- [ ] Bundle size (if frontend)
- [ ] Network requests
- [ ] Memory leaks

## Optimization Strategies
1. [Strategy 1 — e.g., Add database index]
2. [Strategy 2 — e.g., Implement caching]
3. [Strategy 3 — e.g., Lazy loading]

## Testing Approach
- [ ] Benchmark before optimization
- [ ] Apply optimization
- [ ] Benchmark after optimization
- [ ] Verify no regressions

## Deliverables
- Optimized code
- Performance comparison (before/after)
- Documentation of changes
- Monitoring setup (if applicable)

## Constraints
- Must maintain functionality
- Must not introduce new bugs
- Must be maintainable
```

**Assignee:** Performance Engineer / Senior Engineer
**Participants:** Tech Lead
**Priority:** High
**Estimated Cost:** $5-40
**Dependencies:** Performance baseline established

---

## 9. Deployment

**Title:** Deploy [Feature/Version] to [Environment]

**Description:**
```
## Deployment Details
**Version:** [Version number]
**Environment:** [Staging / Production]
**Type:** [Full release / Hotfix / Rollback]

## Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Database migrations prepared
- [ ] Rollback plan documented
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled (if needed)

## Deployment Steps
1. [Step 1 — e.g., Run database migrations]
2. [Step 2 — e.g., Deploy application]
3. [Step 3 — e.g., Run smoke tests]
4. [Step 4 — e.g., Verify monitoring]

## Verification
- [ ] Smoke tests pass
- [ ] Key user flows working
- [ ] No errors in logs
- [ ] Performance acceptable

## Rollback Plan
**Trigger:** [What conditions trigger rollback]
**Steps:**
1. [Rollback step 1]
2. [Rollback step 2]
3. [Rollback step 3]

## Post-Deployment
- [ ] Monitor for [X] hours
- [ ] Check logs periodically
- [ ] Gather user feedback
- [ ] Document any issues

## Deliverables
- Deployed software
- Deployment log
- Incident report (if issues arise)
```

**Assignee:** DevOps Engineer / Tech Lead
**Participants:** QA Engineer, Stakeholders
**Priority:** High / Critical
**Estimated Cost:** $2-15
**Dependencies:** All development complete, tests passing

---

## 10. Refactoring

**Title:** Refactor [Component/Module]

**Description:**
```
## Refactoring Objective
**Current State:** [Describe technical debt or issue]
**Goal:** [What we want to achieve]

## Reasons for Refactoring
- [ ] Code is difficult to maintain
- [ ] Performance issues
- [ ] Design patterns not followed
- [ ] Duplication to eliminate
- [ ] Dependencies to decouple

## Refactoring Scope
**Files/Modules affected:**
- [File/Module 1]
- [File/Module 2]
- [File/Module 3]

## Refactoring Approach
1. [Step 1 — e.g., Extract common logic]
2. [Step 2 — e.g., Introduce design pattern]
3. [Step 3 — e.g., Update tests]

## Constraints
- [ ] Must maintain existing functionality
- [ ] All tests must pass
- [ ] No breaking changes to APIs
- [ ] Performance must not degrade

## Testing
- [ ] All existing tests pass
- [ ] Add tests for new structure
- [ ] Manual testing of affected areas
- [ ] Compare before/after behavior

## Deliverables
- Refactored code
- Updated tests
- Refactoring documentation
- Migration guide (if API changes)
```

**Assignee:** Senior Engineer / Tech Lead
**Participants:** QA Engineer
**Priority:** Normal
**Estimated Cost:** $5-30
**Dependencies:** Comprehensive test coverage required first

---

## Tips for Using Templates

1. **Customize for context:** Modify templates to fit your specific needs
2. **Be specific:** Replace placeholders with concrete details
3. **Set clear acceptance criteria:** Define what "done" looks like
4. **Include relevant context:** Link to related tickets, docs, or discussions
5. **Adjust budgets:** Estimated costs are guidelines — adjust based on complexity

---

**Need more examples?** See [scenarios/](../scenarios/) for real-world ticket examples.

---

*Last updated: 2026-05-03*
