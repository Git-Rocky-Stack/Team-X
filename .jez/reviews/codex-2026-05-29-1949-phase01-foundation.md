OpenAI Codex v0.132.0
--------
workdir: C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: xhigh
reasoning summaries: none
session id: 019e76c9-a483-71c0-ac9d-4e348eb2ecf1
--------
user
changes against 'main'
deprecated: `[features].collab` is deprecated. Use `[features].multi_agent` instead.
Enable it with `--enable multi_agent` or `[features].multi_agent` in config.toml. See https://developers.openai.com/codex/config-basic#feature-flags for details.
2026-05-30T02:49:48.883000Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer error=\"invalid_request\", error_description=\"No access token was provided in this request\", resource_metadata=\"https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp\"" })
2026-05-30T02:49:48.882998Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://huggingface.co/.well-known/oauth-protected-resource/mcp?login\"" })
2026-05-30T02:49:48.978027Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=https://mcp.stripe.com/.well-known/oauth-protected-resource" })
2026-05-30T02:49:49.065870Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer error=\"invalid_request\", error_description=\"No access token was provided in this request\", resource_metadata=\"https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/\"" })
2026-05-30T02:49:49.326515Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Auth(TokenRefreshFailed("Server returned error response: invalid_grant: Grant not found"))
deprecated: `[features].collab` is deprecated. Use `[features].multi_agent` instead.
Enable it with `--enable multi_agent` or `[features].multi_agent` in config.toml. See https://developers.openai.com/codex/config-basic#feature-flags for details.
2026-05-30T02:49:50.572833Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer error=\"invalid_request\", error_description=\"No access token was provided in this request\", resource_metadata=\"https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp\"" })
2026-05-30T02:49:50.597854Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://huggingface.co/.well-known/oauth-protected-resource/mcp?login\"" })
2026-05-30T02:49:50.660694Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=https://mcp.stripe.com/.well-known/oauth-protected-resource" })
2026-05-30T02:49:50.723185Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Auth(TokenRefreshFailed("Server returned error response: invalid_grant: Grant not found"))
2026-05-30T02:49:50.765335Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer error=\"invalid_request\", error_description=\"No access token was provided in this request\", resource_metadata=\"https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/\"" })
  → Inspect review guidance and skill instructions
  • Read merge-base diff and changed files
  • Verify suspected issues against code context
  • Produce prioritized JSON review
exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'C:\\Users\\User\\.agents\\skills\\code-quality-review\\SKILL.md' -TotalCount 220" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 15086ms:
---
name: code-quality-review
description: Conducts comprehensive code quality reviews including code smells detection, maintainability assessment, complexity analysis, design pattern evaluation, naming conventions, code duplication, technical debt identification, and best practices validation. Produces detailed review reports with specific issues, severity ratings, metrics analysis, and actionable improvement recommendations. Use when reviewing code quality, analyzing code maintainability, detecting code smells, checking coding standards, measuring code complexity, identifying technical debt, or when users mention "code quality review", "code quality check", "maintainability analysis", "code smells", "clean code", "refactoring candidates", or "technical debt assessment".
---

# Code Quality Review

## Overview

Conducts systematic code quality analysis across multiple dimensions: maintainability, readability, complexity, design patterns, naming conventions, code duplication, and adherence to best practices. Produces actionable feedback with severity ratings and specific improvement recommendations.

## Core Capabilities

1. **Code Smells Detection** - Identifies bloaters, object-orientation abusers, change preventers, dispensables, and couplers
2. **Complexity Analysis** - Measures cyclomatic and cognitive complexity with risk assessment
3. **Maintainability Assessment** - Evaluates code maintainability index and technical debt
4. **Design Pattern Evaluation** - Reviews architectural patterns and SOLID principles
5. **Best Practices Validation** - Checks adherence to language-specific standards and conventions

## Review Workflow

## Step 1: Scope Assessment

Determine review scope based on change size:

- **Small (<100 lines)**: Quick correctness check, 15-30 minutes
- **Medium (100-500 lines)**: Full quality analysis, 1-2 hours  
- **Large (>500 lines)**: Architectural review, break into smaller reviews if possible, 2-4 hours

For scope-specific guidance, see [review-scope-guidelines.md](references/review-scope-guidelines.md)

### Step 2: Initial Assessment

**Gather Context:**

- Identify programming language and framework
- Understand project type (web app, API, library, CLI, etc.)
- Note existing coding standards or style guides
- Check for linter configuration files (.eslintrc, .pylintrc, checkstyle.xml, etc.)

**Read the Code:**

- Start with entry points (main files, index files)
- Review module/package organization
- Check dependency management
- Examine test files if available

### Step 3: Quality Analysis

Analyze code across key dimensions:

- **Code Smells**: Long methods, large classes, duplicate code, dead code, etc.
- **Complexity**: Cyclomatic complexity (target <15), cognitive complexity, nesting depth
- **Maintainability**: Clear naming, proper abstraction, separation of concerns
- **Design Patterns**: Appropriate pattern usage, SOLID principles adherence
- **Best Practices**: Language idioms, error handling, resource management

For detailed analysis criteria and thresholds, see [review-workflow.md](references/review-workflow.md)

For quality metrics and thresholds, see [quality-metrics-reference.md](references/quality-metrics-reference.md)

### Step 4: Document Findings

Structure the review report with:

- Executive summary with scores and top priorities
- Detailed findings with severity, location, description, and recommendations
- Metrics summary with current vs. target values
- Prioritized recommendations (P0-P3)
- Positive observations acknowledging good practices
- Technical debt summary with effort estimates

For complete report structure and output guidelines, see [review-report-format.md](references/review-report-format.md)

## Quality Assurance

Use the checklist to ensure comprehensive reviews:

- Code organization and structure
- Naming conventions and clarity
- Complexity thresholds
- Error handling patterns
- Testing and documentation
- Security considerations
- Performance implications

For complete checklist, see [best-practices-checklist.md](references/best-practices-checklist.md)

## Common Pitfalls

Avoid these common review mistakes:

- Focusing only on style issues instead of substantive problems
- Being overly critical without actionable suggestions
- Ignoring context and business constraints
- Overwhelming with too many issues at once
- Using vague terms without explanation
- Forgetting to acknowledge good practices

For detailed guidance, see [common-pitfalls-to-avoid.md](references/common-pitfalls-to-avoid.md)

## Example Patterns

For reference when identifying critical issues in your review, see examples of common high-severity problems in [critical-issues.md](references/critical-issues.md)

  ✓ Inspect review guidance and skill instructions
  → Read merge-base diff and changed files
  • Verify suspected issues against code context
  • Produce prioritized JSON review
exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'git status --short; git diff --stat e52e373101fe0d413b423704c1ebd2eecb98afa6; git diff --name-status e52e373101fe0d413b423704c1ebd2eecb98afa6' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:50:50.746678Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.3 seconds
Output:
fatal: detected dubious ownership in repository at 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X'
'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' is owned by:
	ROCK-MILSPEC/User (S-1-5-21-3913449058-1645406423-3900345437-1001)
but the current user is:
	ROCK-MILSPEC/CodexSandboxOffline (S-1-5-21-3913449058-1645406423-3900345437-1004)
To add an exception for this directory, call:

	git config --global --add safe.directory 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X'
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file

warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file


 exited 1 in 1338ms:
fatal: detected dubious ownership in repository at 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X'
'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' is owned by:
	ROCK-MILSPEC/User (S-1-5-21-3913449058-1645406423-3900345437-1001)
but the current user is:
	ROCK-MILSPEC/CodexSandboxOffline (S-1-5-21-3913449058-1645406423-3900345437-1004)
To add an exception for this directory, call:

	git config --global --add safe.directory 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X'
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file

warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '$repo='"'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X'; git -c safe.directory=\""'$repo" status --short; git -c safe.directory="$repo" diff --stat e52e373101fe0d413b423704c1ebd2eecb98afa6; git -c safe.directory="$repo" diff --name-status e52e373101fe0d413b423704c1ebd2eecb98afa6' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1307ms:
?? .jez/
 CHANGELOG.md                                       |  19 ++
 .../src/main/db/0036-local-gguf-migration.test.ts  | 325 +++++++++++++++++++++
 .../src/main/db/migrations/0036_local_gguf.sql     | 137 +++++++++
 .../src/main/db/migrations/meta/_journal.json      |   7 +
 .../db/repos/local-model-advanced-params.test.ts   | 142 +++++++++
 .../main/db/repos/local-model-advanced-params.ts   | 105 +++++++
 .../main/db/repos/local-model-endpoints.test.ts    | 101 +++++++
 .../src/main/db/repos/local-model-endpoints.ts     | 120 ++++++++
 .../db/repos/local-model-watch-folders.test.ts     |  69 +++++
 .../src/main/db/repos/local-model-watch-folders.ts | 101 +++++++
 .../desktop/src/main/db/repos/local-models.test.ts | 173 +++++++++++
 apps/desktop/src/main/db/repos/local-models.ts     | 190 ++++++++++++
 apps/desktop/src/main/db/schema.ts                 | 197 +++++++++++++
 apps/desktop/src/main/index.ts                     |  17 ++
 .../main/ipc/local-gguf-benchmark-handlers.test.ts |  42 +++
 .../src/main/ipc/local-gguf-benchmark-handlers.ts  |  27 ++
 .../main/ipc/local-gguf-endpoint-handlers.test.ts  |  42 +++
 .../src/main/ipc/local-gguf-endpoint-handlers.ts   |  49 ++++
 .../src/main/ipc/local-gguf-hf-handlers.test.ts    |  36 +++
 .../desktop/src/main/ipc/local-gguf-hf-handlers.ts |  55 ++++
 .../main/ipc/local-gguf-library-handlers.test.ts   |  42 +++
 .../src/main/ipc/local-gguf-library-handlers.ts    |  85 ++++++
 .../src/main/ipc/local-gguf-not-implemented.ts     |  12 +
 .../main/ipc/local-gguf-runtime-handlers.test.ts   |  42 +++
 .../src/main/ipc/local-gguf-runtime-handlers.ts    |  71 +++++
 .../runtime-settings/local-gguf-settings.test.ts   |  95 ++++++
 .../runtime-settings/local-gguf-settings.ts        | 122 ++++++++
 apps/desktop/src/preload/api.test.ts               | 256 ++++++++++++++++
 apps/desktop/src/preload/api.ts                    | 220 +++++++++++++-
 package.json                                       |   1 +
 packages/local-gguf-runtime/README.md              |  41 +++
 packages/local-gguf-runtime/package.json           |  23 ++
 packages/local-gguf-runtime/src/errors.ts          |   9 +
 packages/local-gguf-runtime/src/index.ts           |   6 +
 packages/local-gguf-runtime/tsconfig.json          |  13 +
 packages/shared-types/src/index.ts                 |   1 +
 packages/shared-types/src/ipc.ts                   |  10 +
 packages/shared-types/src/local-gguf.test.ts       | 308 +++++++++++++++++++
 packages/shared-types/src/local-gguf.ts            | 300 +++++++++++++++++++
 pnpm-lock.yaml                                     |  13 +
 40 files changed, 3622 insertions(+), 2 deletions(-)
M	CHANGELOG.md
A	apps/desktop/src/main/db/0036-local-gguf-migration.test.ts
A	apps/desktop/src/main/db/migrations/0036_local_gguf.sql
M	apps/desktop/src/main/db/migrations/meta/_journal.json
A	apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts
A	apps/desktop/src/main/db/repos/local-model-advanced-params.ts
A	apps/desktop/src/main/db/repos/local-model-endpoints.test.ts
A	apps/desktop/src/main/db/repos/local-model-endpoints.ts
A	apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts
A	apps/desktop/src/main/db/repos/local-model-watch-folders.ts
A	apps/desktop/src/main/db/repos/local-models.test.ts
A	apps/desktop/src/main/db/repos/local-models.ts
M	apps/desktop/src/main/db/schema.ts
M	apps/desktop/src/main/index.ts
A	apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.test.ts
A	apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.ts
A	apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.test.ts
A	apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.ts
A	apps/desktop/src/main/ipc/local-gguf-hf-handlers.test.ts
A	apps/desktop/src/main/ipc/local-gguf-hf-handlers.ts
A	apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts
A	apps/desktop/src/main/ipc/local-gguf-library-handlers.ts
A	apps/desktop/src/main/ipc/local-gguf-not-implemented.ts
A	apps/desktop/src/main/ipc/local-gguf-runtime-handlers.test.ts
A	apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts
A	apps/desktop/src/main/services/runtime-settings/local-gguf-settings.test.ts
A	apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts
M	apps/desktop/src/preload/api.test.ts
M	apps/desktop/src/preload/api.ts
M	package.json
A	packages/local-gguf-runtime/README.md
A	packages/local-gguf-runtime/package.json
A	packages/local-gguf-runtime/src/errors.ts
A	packages/local-gguf-runtime/src/index.ts
A	packages/local-gguf-runtime/tsconfig.json
M	packages/shared-types/src/index.ts
M	packages/shared-types/src/ipc.ts
A	packages/shared-types/src/local-gguf.test.ts
A	packages/shared-types/src/local-gguf.ts
M	pnpm-lock.yaml

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '$repo='"'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X'; git -c safe.directory=\""'$repo" diff --unified=80 e52e373101fe0d413b423704c1ebd2eecb98afa6 -- apps/desktop/src/main/db/schema.ts apps/desktop/src/main/db/migrations/0036_local_gguf.sql apps/desktop/src/main/db/migrations/meta/_journal.json' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1074ms:
diff --git a/apps/desktop/src/main/db/migrations/0036_local_gguf.sql b/apps/desktop/src/main/db/migrations/0036_local_gguf.sql
new file mode 100644
index 0000000..3c4b3d6
--- /dev/null
+++ b/apps/desktop/src/main/db/migrations/0036_local_gguf.sql
@@ -0,0 +1,137 @@
+-- Migration 0036 — Local & Networked GGUF Support (v3.3.0 — Phase 1, spec § 7).
+--
+-- Introduces five tables backing the local GGUF feature:
+--   * local_model_endpoints      — remote LAN endpoints (LM Studio / Ollama / …)
+--   * local_model_watch_folders  — folder-scan sources (local + UNC/SMB)
+--   * local_models               — the library (file / folder-entry / remote-endpoint)
+--   * local_model_advanced_params — per-model tuning overrides (PK = model_id)
+--   * local_model_benchmarks     — benchmark history per model (CRUD in Phase 10)
+--
+-- Declared endpoints-first so every FK target precedes its referrer. CHECK
+-- constraints enforce the source_type / status / privacy_tier value domains,
+-- the 0/1 domain on boolean-typed integers, and the source-shape invariant
+-- that disambiguates how a local_models row points at its backing source
+-- (file/folder → source_path, no endpoint; remote-endpoint → endpoint_id, no
+-- source_path).
+--
+-- Hand-authored to match this repo's migration workflow (drizzle-kit
+-- generate is not used past 0002 — no meta snapshots are maintained; the
+-- runtime + sql.js migrators apply NNNN_*.sql in journal order). Mirrors the
+-- table/index/check declarations in schema.ts.
+--
+-- Forward-only. Rollback note: dropping these five tables is safe (no other
+-- table references them). To fully roll back, also remove every consumer in
+-- packages/local-gguf-runtime/, the local-gguf adapters in
+-- packages/provider-router/, the local-gguf-embed branch in
+-- packages/intelligence/src/rag/embeddings.ts, and
+-- apps/desktop/src/main/services/local-gguf/. Not reversible by SQL alone.
+CREATE TABLE `local_model_endpoints` (
+	`id` text PRIMARY KEY NOT NULL,
+	`name` text NOT NULL,
+	`base_url` text NOT NULL,
+	`auth_header_key_ref` text,
+	`privacy_tier` text DEFAULT 'Local' NOT NULL,
+	`status` text DEFAULT 'unknown' NOT NULL,
+	`last_checked_at` integer,
+	`last_error` text,
+	`created_at` integer NOT NULL,
+	`updated_at` integer NOT NULL,
+	CONSTRAINT `local_model_endpoints_privacy_tier_check` CHECK (`privacy_tier` = 'Local'),
+	CONSTRAINT `local_model_endpoints_status_check` CHECK (`status` in ('unknown', 'reachable', 'unreachable', 'auth-failed'))
+);
+--> statement-breakpoint
+CREATE TABLE `local_model_watch_folders` (
+	`id` text PRIMARY KEY NOT NULL,
+	`path` text NOT NULL,
+	`recursive` integer DEFAULT true NOT NULL,
+	`status` text DEFAULT 'unknown' NOT NULL,
+	`last_scan_at` integer,
+	`last_scan_error` text,
+	`created_at` integer NOT NULL,
+	`updated_at` integer NOT NULL,
+	CONSTRAINT `local_model_watch_folders_recursive_check` CHECK (`recursive` in (0, 1)),
+	CONSTRAINT `local_model_watch_folders_status_check` CHECK (`status` in ('unknown', 'reachable', 'unreachable'))
+);
+--> statement-breakpoint
+CREATE TABLE `local_models` (
+	`id` text PRIMARY KEY NOT NULL,
+	`display_name` text NOT NULL,
+	`source_type` text NOT NULL,
+	`source_path` text,
+	`endpoint_id` text,
+	`gguf_arch` text,
+	`gguf_params_b` real,
+	`gguf_quant` text,
+	`gguf_context_max` integer,
+	`gguf_size_bytes` integer,
+	`gguf_sha256` text,
+	`gguf_chat_template` text,
+	`is_embedding_model` integer DEFAULT false NOT NULL,
+	`is_tool_capable` integer DEFAULT false NOT NULL,
+	`hf_repo_id` text,
+	`hf_filename` text,
+	`license` text,
+	`chat_template_override` text,
+	`system_prompt_override` text,
+	`status` text DEFAULT 'cold' NOT NULL,
+	`status_detail` text,
+	`last_used_at` integer,
+	`created_at` integer NOT NULL,
+	`updated_at` integer NOT NULL,
+	FOREIGN KEY (`endpoint_id`) REFERENCES `local_model_endpoints`(`id`) ON UPDATE no action ON DELETE cascade,
+	CONSTRAINT `local_models_source_type_check` CHECK (`source_type` in ('file', 'folder-entry', 'remote-endpoint')),
+	CONSTRAINT `local_models_status_check` CHECK (`status` in ('cold', 'loading', 'loaded', 'error', 'unreachable', 'missing')),
+	CONSTRAINT `local_models_is_embedding_model_check` CHECK (`is_embedding_model` in (0, 1)),
+	CONSTRAINT `local_models_is_tool_capable_check` CHECK (`is_tool_capable` in (0, 1)),
+	CONSTRAINT `local_models_source_shape_check` CHECK (
+		(`source_type` = 'file' AND `source_path` IS NOT NULL AND `endpoint_id` IS NULL) OR
+		(`source_type` = 'folder-entry' AND `source_path` IS NOT NULL AND `endpoint_id` IS NULL) OR
+		(`source_type` = 'remote-endpoint' AND `endpoint_id` IS NOT NULL AND `source_path` IS NULL)
+	)
+);
+--> statement-breakpoint
+CREATE TABLE `local_model_advanced_params` (
+	`model_id` text PRIMARY KEY NOT NULL,
+	`n_ctx` integer,
+	`n_gpu_layers` integer,
+	`n_batch` integer,
+	`n_threads` integer,
+	`temperature` real,
+	`top_p` real,
+	`top_k` integer,
+	`repeat_penalty` real,
+	`mmap` integer,
+	`mlock` integer,
+	`flash_attention` integer,
+	`updated_at` integer NOT NULL,
+	FOREIGN KEY (`model_id`) REFERENCES `local_models`(`id`) ON UPDATE no action ON DELETE cascade,
+	CONSTRAINT `local_model_advanced_params_mmap_check` CHECK (`mmap` IS NULL OR `mmap` in (0, 1)),
+	CONSTRAINT `local_model_advanced_params_mlock_check` CHECK (`mlock` IS NULL OR `mlock` in (0, 1)),
+	CONSTRAINT `local_model_advanced_params_flash_attention_check` CHECK (`flash_attention` IS NULL OR `flash_attention` in (0, 1))
+);
+--> statement-breakpoint
+CREATE TABLE `local_model_benchmarks` (
+	`id` text PRIMARY KEY NOT NULL,
+	`model_id` text NOT NULL,
+	`prompt_eval_tok_s` real NOT NULL,
+	`gen_tok_s` real NOT NULL,
+	`ttft_ms` integer NOT NULL,
+	`vram_peak_mb` integer,
+	`backend` text NOT NULL,
+	`n_ctx_used` integer NOT NULL,
+	`n_gpu_layers_used` integer NOT NULL,
+	`ran_at` integer NOT NULL,
+	FOREIGN KEY (`model_id`) REFERENCES `local_models`(`id`) ON UPDATE no action ON DELETE cascade
+);
+--> statement-breakpoint
+CREATE INDEX `idx_local_models_source_type` ON `local_models` (`source_type`);
+--> statement-breakpoint
+CREATE INDEX `idx_local_models_status` ON `local_models` (`status`);
+--> statement-breakpoint
+CREATE INDEX `idx_local_models_last_used_at` ON `local_models` (`last_used_at`);
+--> statement-breakpoint
+CREATE INDEX `idx_local_models_endpoint_id` ON `local_models` (`endpoint_id`);
+--> statement-breakpoint
+CREATE INDEX `idx_local_model_benchmarks_model_id_ran_at` ON `local_model_benchmarks` (`model_id`,`ran_at`);
+--> statement-breakpoint
+CREATE INDEX `idx_local_model_watch_folders_status` ON `local_model_watch_folders` (`status`);
diff --git a/apps/desktop/src/main/db/migrations/meta/_journal.json b/apps/desktop/src/main/db/migrations/meta/_journal.json
index ef552db..c1b8814 100644
--- a/apps/desktop/src/main/db/migrations/meta/_journal.json
+++ b/apps/desktop/src/main/db/migrations/meta/_journal.json
@@ -176,83 +176,90 @@
       "when": 1778044800000,
       "tag": "0024_operator_invites",
       "breakpoints": true
     },
     {
       "idx": 25,
       "version": "6",
       "when": 1778131200000,
       "tag": "0025_operator_invite_acceptance",
       "breakpoints": true
     },
     {
       "idx": 26,
       "version": "6",
       "when": 1778217600000,
       "tag": "0026_shared_cloud_linkage",
       "breakpoints": true
     },
     {
       "idx": 27,
       "version": "6",
       "when": 1778304000000,
       "tag": "0027_hosted_operator_bridge",
       "breakpoints": true
     },
     {
       "idx": 28,
       "version": "6",
       "when": 1778390400000,
       "tag": "0028_project_target_date",
       "breakpoints": true
     },
     {
       "idx": 29,
       "version": "6",
       "when": 1778476800000,
       "tag": "0029_runtime_sessions_checkouts",
       "breakpoints": true
     },
     {
       "idx": 30,
       "version": "6",
       "when": 1778563200000,
       "tag": "0030_tickets_goal_id",
       "breakpoints": true
     },
     {
       "idx": 31,
       "version": "6",
       "when": 1778649600000,
       "tag": "0031_agent_wakeup_requests",
       "breakpoints": true
     },
     {
       "idx": 32,
       "version": "6",
       "when": 1778736000000,
       "tag": "0032_schedule_items",
       "breakpoints": true
     },
     {
       "idx": 33,
       "version": "6",
       "when": 1778822400000,
       "tag": "0033_runs_cache_tokens",
       "breakpoints": true
     },
     {
       "idx": 34,
       "version": "6",
       "when": 1778908800000,
       "tag": "0034_pending_delegations",
       "breakpoints": true
     },
     {
       "idx": 35,
       "version": "6",
       "when": 1778995200000,
       "tag": "0035_runs_events_trace_id",
       "breakpoints": true
+    },
+    {
+      "idx": 36,
+      "version": "6",
+      "when": 1779081600000,
+      "tag": "0036_local_gguf",
+      "breakpoints": true
     }
   ]
 }
diff --git a/apps/desktop/src/main/db/schema.ts b/apps/desktop/src/main/db/schema.ts
index 74cdfaf..556e3f8 100644
--- a/apps/desktop/src/main/db/schema.ts
+++ b/apps/desktop/src/main/db/schema.ts
@@ -1,109 +1,110 @@
 /**
  * Team-X SQLite schema (Phase 1 + Phase 2 + Phase 3 + Phase 4).
  *
  * Phase 1 tables: companies, employees, threads, threadMembers, messages,
  * events, runs, providers, settings.
  * Phase 2 additions: mcpServers, toolCalls (M10), tickets (M12),
  * threads.ticketId FK (M12).
  * Phase 3 additions: goals, projects, projectTickets (M15),
  * meetings + companies.status (M16).
  * Phase 4 additions: fileVault (M21).
  *
  * Design notes:
  * - Primary keys are text-typed to hold nanoid values (see packages/shared-types).
  * - Timestamps are integer UNIX ms (SQLite has no native datetime; ms ints sort
  *   lexicographically, are language-neutral, and round-trip through JSON cleanly).
  * - Money is stored as a decimal string (`cost_usd`) to avoid float drift on
  *   fractional-cent values. Parse with `Number()` or a bigdecimal library at
  *   the edge, never inside aggregate SQL.
  * - JSON blobs are stored as text with a `_json` suffix. Callers are
  *   responsible for JSON.parse/stringify. Drizzle's `.$type<T>()` helper will
  *   be wired up in Task 20+ alongside the typed query helpers.
  * - Foreign keys are declared but will only be enforced once the DB init
  *   helper runs `PRAGMA foreign_keys = ON` (landing in Task 20).
  */
 
 import { sql } from 'drizzle-orm';
 import {
   type AnySQLiteColumn,
   blob,
+  check,
   index,
   integer,
   real,
   sqliteTable,
   text,
   uniqueIndex,
 } from 'drizzle-orm/sqlite-core';
 
 /** One row per AI company the user has created (multi-company is Phase 2+). */
 export const companies = sqliteTable(
   'companies',
   {
     id: text('id').primaryKey(),
     name: text('name').notNull(),
     slug: text('slug').notNull().unique(),
     createdAt: integer('created_at').notNull(),
     /** Serialized company-scoped settings (mission, values, etc.). */
     settingsJson: text('settings_json').notNull().default('{}'),
     /** Optional emoji or short icon identifier rendered in the company switcher. */
     icon: text('icon'),
     theme: text('theme').notNull().default('dark'),
     /** running | meeting | paused. Controls orchestrator dispatch for this company. */
     status: text('status').notNull().default('running'),
     /**
      * Stable lineage ids for portable company packages. Null only exists on
      * pre-portability rows until the migration backfill lands or when a test
      * seeds a company directly through the schema instead of the repo.
      */
     workspaceOriginId: text('workspace_origin_id'),
     companyOriginId: text('company_origin_id'),
     /** Optional Team-X Cloud linkage metadata for shared workspaces. */
     cloudWorkspaceId: text('cloud_workspace_id'),
     cloudTenantId: text('cloud_tenant_id'),
     cloudLinkState: text('cloud_link_state').notNull().default('unlinked'),
     linkedDeviceId: text('linked_device_id'),
     lastSyncedCursorJson: text('last_synced_cursor_json'),
     lastSnapshotId: text('last_snapshot_id'),
     lastSyncAt: integer('last_sync_at'),
     lastSyncError: text('last_sync_error'),
   },
   (table) => ({
     workspaceOriginIdx: index('idx_companies_workspace_origin').on(table.workspaceOriginId),
     companyOriginIdx: index('idx_companies_company_origin').on(table.companyOriginId),
     cloudWorkspaceIdx: index('idx_companies_cloud_workspace').on(table.cloudWorkspaceId),
     cloudLinkStateIdx: index('idx_companies_cloud_link_state').on(table.cloudLinkState),
   }),
 );
 
 /** Human supervisors who can operate one or more companies. */
 export const operators = sqliteTable('operators', {
   id: text('id').primaryKey(),
   displayName: text('display_name').notNull(),
   email: text('email'),
   /** local | invited | cloud */
   authMode: text('auth_mode').notNull().default('local'),
   createdAt: integer('created_at').notNull(),
   updatedAt: integer('updated_at').notNull(),
 });
 
 /** Company-scoped operator access and control permissions. */
 export const operatorMemberships = sqliteTable(
   'operator_memberships',
   {
     id: text('id').primaryKey(),
     operatorId: text('operator_id')
       .notNull()
       .references(() => operators.id, { onDelete: 'cascade' }),
     companyId: text('company_id')
       .notNull()
       .references(() => companies.id, { onDelete: 'cascade' }),
     /** owner | admin | operator | reviewer */
     role: text('role').notNull(),
     /** local | hosted */
     sourceKind: text('source_kind').notNull().default('local'),
     cloudWorkspaceId: text('cloud_workspace_id'),
     hostedInviteId: text('hosted_invite_id'),
     canApproveBudget: integer('can_approve_budget', { mode: 'boolean' }).notNull().default(false),
     canApproveAuthority: integer('can_approve_authority', { mode: 'boolean' })
       .notNull()
       .default(false),
@@ -1589,80 +1590,276 @@ export const commandHistory = sqliteTable('command_history', {
  */
 export const copilotInsights = sqliteTable('copilot_insights', {
   id: text('id').primaryKey(),
   companyId: text('company_id')
     .notNull()
     .references(() => companies.id, { onDelete: 'cascade' }),
   /** operational | cost | org | workflow | anomaly. CHECK at DDL. */
   category: text('category').notNull(),
   /** critical | warning | info. CHECK at DDL. */
   severity: text('severity').notNull(),
   /** Short headline rendered as the insight card title. */
   title: text('title').notNull(),
   /** Markdown body — supporting evidence, numbers, source attribution. */
   detail: text('detail').notNull(),
   /** Optional human-readable suggestion ("Reassign blocked tickets to Bob"). */
   actionSuggestion: text('action_suggestion'),
   /** Optional NLU intent name to dispatch when the user clicks the action button (M34). */
   actionIntent: text('action_intent'),
   /** Optional JSON-serialized entity map for the action intent. */
   actionEntitiesJson: text('action_entities_json'),
   /** Stamped when the user dismisses the insight. NULL = active. */
   dismissedAt: integer('dismissed_at'),
   createdAt: integer('created_at').notNull(),
   /** Hard expiry — `expireStale` deletes rows where `expires_at < now`. */
   expiresAt: integer('expires_at').notNull(),
 });
 
 // ---------------------------------------------------------------------------
 // Phase 2 — M9: Org Chart (restored in Phase 5.6 M-C, migration 0013)
 // ---------------------------------------------------------------------------
 
 /**
  * Org chart edges. One row per (manager → report) reporting relationship.
  *
  * Originally shipped on the `worktree-phase-2-the-org` branch as part of
  * M9 but never merged into main (audit row 2.16, P0). Restored here under
  * Phase 5.6 M-C with two design upgrades over the worktree original:
  *   1. `ON DELETE CASCADE` on every FK (worktree had bare FKs) — keeps
  *      hard-deletes safe when companies.delete (M-C step e) ships.
  *   2. Composite index on `(company_id, manager_id)` — accelerates the
  *      hot-path `orgchart.get` tree projection (walking the org from CEO
  *      down requires repeated "list reports of manager X" queries).
  *
  * The UNIQUE constraint on `report_id` enforces single-manager-per-report
  * at the SQL layer (no diamond inheritance, no orphan reports).
  *
  * Cycle prevention is the repo layer's job (`wouldCycle()` walks up the
  * manager chain before any insert/update). The SQL layer cannot detect
  * cycles without a recursive CTE; embedding the check in a trigger
  * would surprise non-app callers (drizzle-studio, raw queries).
  *
  * CASCADE behavior:
  * - `company_id`: when a company is hard-deleted, every org edge for
  *   that company drops cleanly.
  * - `manager_id` / `report_id`: hard-deleting an employee row (test
  *   fixtures, M-G branch cleanup) cascades the edge. Production
  *   `employees.fire` is a soft-delete (firedAt column); soft-deleted
  *   managers retain edges, surfacing as "fired but still appears as
  *   manager" — the repo's tree projection filters these at read time.
  */
 export const orgEdges = sqliteTable(
   'org_edges',
   {
     id: text('id').primaryKey(),
     companyId: text('company_id')
       .notNull()
       .references(() => companies.id, { onDelete: 'cascade' }),
     managerId: text('manager_id')
       .notNull()
       .references(() => employees.id, { onDelete: 'cascade' }),
     reportId: text('report_id')
       .notNull()
       .unique()
       .references(() => employees.id, { onDelete: 'cascade' }),
     createdAt: integer('created_at').notNull(),
   },
   (table) => ({
     companyManagerIdx: index('idx_org_edges_company_manager').on(table.companyId, table.managerId),
   }),
 );
+
+// ---------------------------------------------------------------------------
+// Local & Networked GGUF Support (v3.3.0 — Phase 1, spec § 7)
+//
+// Five tables backing the local GGUF library, per-model tuning, benchmark
+// history, remote LAN endpoints, and watched folders. Declared
+// endpoints-first so every FK target precedes its referrer. See
+// docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md.
+// ---------------------------------------------------------------------------
+
+/**
+ * Remote LAN endpoints (LM Studio / Ollama / llama-server / KoboldCPP / vLLM).
+ * `privacy_tier` is constrained to 'Local' at the SQL layer — these endpoints
+ * are local-network, never cloud.
+ */
+export const localModelEndpoints = sqliteTable(
+  'local_model_endpoints',
+  {
+    id: text('id').primaryKey(),
+    name: text('name').notNull(),
+    baseUrl: text('base_url').notNull(),
+    /** keytar reference for an optional auth header; never the secret itself. */
+    authHeaderKeyRef: text('auth_header_key_ref'),
+    privacyTier: text('privacy_tier').notNull().default('Local'),
+    status: text('status').notNull().default('unknown'),
+    lastCheckedAt: integer('last_checked_at'),
+    lastError: text('last_error'),
+    createdAt: integer('created_at').notNull(),
+    updatedAt: integer('updated_at').notNull(),
+  },
+  (table) => ({
+    privacyTierCheck: check(
+      'local_model_endpoints_privacy_tier_check',
+      sql`${table.privacyTier} = 'Local'`,
+    ),
+    statusCheck: check(
+      'local_model_endpoints_status_check',
+      sql`${table.status} in ('unknown', 'reachable', 'unreachable', 'auth-failed')`,
+    ),
+  }),
+);
+
+/** Watched folders (local paths or UNC/SMB) scanned for GGUF files. */
+export const localModelWatchFolders = sqliteTable(
+  'local_model_watch_folders',
+  {
+    id: text('id').primaryKey(),
+    path: text('path').notNull(),
+    recursive: integer('recursive', { mode: 'boolean' }).notNull().default(true),
+    status: text('status').notNull().default('unknown'),
+    lastScanAt: integer('last_scan_at'),
+    lastScanError: text('last_scan_error'),
+    createdAt: integer('created_at').notNull(),
+    updatedAt: integer('updated_at').notNull(),
+  },
+  (table) => ({
+    statusIdx: index('idx_local_model_watch_folders_status').on(table.status),
+    recursiveCheck: check(
+      'local_model_watch_folders_recursive_check',
+      sql`${table.recursive} in (0, 1)`,
+    ),
+    statusCheck: check(
+      'local_model_watch_folders_status_check',
+      sql`${table.status} in ('unknown', 'reachable', 'unreachable')`,
+    ),
+  }),
+);
+
+/**
+ * The library: every model the user has registered, of any source type.
+ * The source-shape CHECK disambiguates how a row points at its backing
+ * source — file/folder rows carry a source_path with no endpoint;
+ * remote-endpoint rows carry an endpoint_id with no source_path.
+ */
+export const localModels = sqliteTable(
+  'local_models',
+  {
+    id: text('id').primaryKey(),
+    displayName: text('display_name').notNull(),
+    sourceType: text('source_type').notNull(),
+    sourcePath: text('source_path'),
+    endpointId: text('endpoint_id').references(() => localModelEndpoints.id, {
+      onDelete: 'cascade',
+    }),
+    ggufArch: text('gguf_arch'),
+    ggufParamsB: real('gguf_params_b'),
+    ggufQuant: text('gguf_quant'),
+    ggufContextMax: integer('gguf_context_max'),
+    ggufSizeBytes: integer('gguf_size_bytes'),
+    ggufSha256: text('gguf_sha256'),
+    ggufChatTemplate: text('gguf_chat_template'),
+    isEmbeddingModel: integer('is_embedding_model', { mode: 'boolean' }).notNull().default(false),
+    isToolCapable: integer('is_tool_capable', { mode: 'boolean' }).notNull().default(false),
+    hfRepoId: text('hf_repo_id'),
+    hfFilename: text('hf_filename'),
+    license: text('license'),
+    chatTemplateOverride: text('chat_template_override'),
+    systemPromptOverride: text('system_prompt_override'),
+    status: text('status').notNull().default('cold'),
+    statusDetail: text('status_detail'),
+    lastUsedAt: integer('last_used_at'),
+    createdAt: integer('created_at').notNull(),
+    updatedAt: integer('updated_at').notNull(),
+  },
+  (table) => ({
+    sourceTypeIdx: index('idx_local_models_source_type').on(table.sourceType),
+    statusIdx: index('idx_local_models_status').on(table.status),
+    lastUsedAtIdx: index('idx_local_models_last_used_at').on(table.lastUsedAt),
+    endpointIdIdx: index('idx_local_models_endpoint_id').on(table.endpointId),
+    sourceTypeCheck: check(
+      'local_models_source_type_check',
+      sql`${table.sourceType} in ('file', 'folder-entry', 'remote-endpoint')`,
+    ),
+    statusCheck: check(
+      'local_models_status_check',
+      sql`${table.status} in ('cold', 'loading', 'loaded', 'error', 'unreachable', 'missing')`,
+    ),
+    isEmbeddingModelCheck: check(
+      'local_models_is_embedding_model_check',
+      sql`${table.isEmbeddingModel} in (0, 1)`,
+    ),
+    isToolCapableCheck: check(
+      'local_models_is_tool_capable_check',
+      sql`${table.isToolCapable} in (0, 1)`,
+    ),
+    sourceShapeCheck: check(
+      'local_models_source_shape_check',
+      sql`(${table.sourceType} = 'file' AND ${table.sourcePath} IS NOT NULL AND ${table.endpointId} IS NULL) OR (${table.sourceType} = 'folder-entry' AND ${table.sourcePath} IS NOT NULL AND ${table.endpointId} IS NULL) OR (${table.sourceType} = 'remote-endpoint' AND ${table.endpointId} IS NOT NULL AND ${table.sourcePath} IS NULL)`,
+    ),
+  }),
+);
+
+/**
+ * Per-model Advanced-panel overrides. The PK is `model_id`, so the row
+ * exists at most once per model. NULL in any tuning column means
+ * "fall back to auto-tune."
+ */
+export const localModelAdvancedParams = sqliteTable(
+  'local_model_advanced_params',
+  {
+    modelId: text('model_id')
+      .primaryKey()
+      .references(() => localModels.id, { onDelete: 'cascade' }),
+    nCtx: integer('n_ctx'),
+    nGpuLayers: integer('n_gpu_layers'),
+    nBatch: integer('n_batch'),
+    nThreads: integer('n_threads'),
+    temperature: real('temperature'),
+    topP: real('top_p'),
+    topK: integer('top_k'),
+    repeatPenalty: real('repeat_penalty'),
+    mmap: integer('mmap', { mode: 'boolean' }),
+    mlock: integer('mlock', { mode: 'boolean' }),
+    flashAttention: integer('flash_attention', { mode: 'boolean' }),
+    updatedAt: integer('updated_at').notNull(),
+  },
+  (table) => ({
+    mmapCheck: check(
+      'local_model_advanced_params_mmap_check',
+      sql`${table.mmap} is null or ${table.mmap} in (0, 1)`,
+    ),
+    mlockCheck: check(
+      'local_model_advanced_params_mlock_check',
+      sql`${table.mlock} is null or ${table.mlock} in (0, 1)`,
+    ),
+    flashAttentionCheck: check(
+      'local_model_advanced_params_flash_attention_check',
+      sql`${table.flashAttention} is null or ${table.flashAttention} in (0, 1)`,
+    ),
+  }),
+);
+
+/** Benchmark history per model. Full CRUD lands in Phase 10. */
+export const localModelBenchmarks = sqliteTable(
+  'local_model_benchmarks',
+  {
+    id: text('id').primaryKey(),
+    modelId: text('model_id')
+      .notNull()
+      .references(() => localModels.id, { onDelete: 'cascade' }),
+    promptEvalTokS: real('prompt_eval_tok_s').notNull(),
+    genTokS: real('gen_tok_s').notNull(),
+    ttftMs: integer('ttft_ms').notNull(),
+    vramPeakMb: integer('vram_peak_mb'),
+    backend: text('backend').notNull(),
+    nCtxUsed: integer('n_ctx_used').notNull(),
+    nGpuLayersUsed: integer('n_gpu_layers_used').notNull(),
+    ranAt: integer('ran_at').notNull(),
+  },
+  (table) => ({
+    modelRanAtIdx: index('idx_local_model_benchmarks_model_id_ran_at').on(
+      table.modelId,
+      table.ranAt,
+    ),
+  }),
+);

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '$repo='"'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X'; git -c safe.directory=\""'$repo" diff --unified=80 e52e373101fe0d413b423704c1ebd2eecb98afa6 -- apps/desktop/src/main/db/repos/local-models.ts apps/desktop/src/main/db/repos/local-model-endpoints.ts apps/desktop/src/main/db/repos/local-model-watch-folders.ts apps/desktop/src/main/db/repos/local-model-advanced-params.ts' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 976ms:
diff --git a/apps/desktop/src/main/db/repos/local-model-advanced-params.ts b/apps/desktop/src/main/db/repos/local-model-advanced-params.ts
new file mode 100644
index 0000000..cc6eae5
--- /dev/null
+++ b/apps/desktop/src/main/db/repos/local-model-advanced-params.ts
@@ -0,0 +1,105 @@
+/**
+ * Local model advanced-params repository — per-model Advanced-panel
+ * overrides (v3.3.0 local GGUF support, spec § 7).
+ *
+ * The PK is `model_id`, so a model has at most one row. NULL in any tuning
+ * column means "fall back to auto-tune." `clear()` deletes the row entirely
+ * (the "Reset to Auto" affordance). Boolean columns map directly because the
+ * schema declares them with `integer({ mode: 'boolean' })`.
+ */
+
+import type { AdvancedParams } from '@team-x/shared-types';
+import { eq } from 'drizzle-orm';
+import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
+
+import type { Schema } from '../client.js';
+import { localModelAdvancedParams } from '../schema.js';
+
+export interface UpsertAdvancedParamsInput {
+  nCtx: number | null;
+  nGpuLayers: number | null;
+  nBatch: number | null;
+  nThreads: number | null;
+  temperature: number | null;
+  topP: number | null;
+  topK: number | null;
+  repeatPenalty: number | null;
+  mmap: boolean | null;
+  mlock: boolean | null;
+  flashAttention: boolean | null;
+}
+
+type AdvancedParamsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;
+
+export function createLocalModelAdvancedParamsRepo<TRunResult>(db: AdvancedParamsDb<TRunResult>) {
+  function getByModelId(modelId: string): AdvancedParams | null {
+    const row = db
+      .select()
+      .from(localModelAdvancedParams)
+      .where(eq(localModelAdvancedParams.modelId, modelId))
+      .get();
+    return row ?? null;
+  }
+
+  return {
+    /**
+     * Insert or update (by model_id PK) the tuning overrides for a model.
+     * Always overwrites the full tuple — callers pass the complete desired
+     * state, not a partial patch.
+     */
+    upsert(modelId: string, params: UpsertAdvancedParamsInput): AdvancedParams {
+      const updatedAt = Date.now();
+      const values = {
+        modelId,
+        nCtx: params.nCtx,
+        nGpuLayers: params.nGpuLayers,
+        nBatch: params.nBatch,
+        nThreads: params.nThreads,
+        temperature: params.temperature,
+        topP: params.topP,
+        topK: params.topK,
+        repeatPenalty: params.repeatPenalty,
+        mmap: params.mmap,
+        mlock: params.mlock,
+        flashAttention: params.flashAttention,
+        updatedAt,
+      };
+      db.insert(localModelAdvancedParams)
+        .values(values)
+        .onConflictDoUpdate({
+          target: localModelAdvancedParams.modelId,
+          set: {
+            nCtx: values.nCtx,
+            nGpuLayers: values.nGpuLayers,
+            nBatch: values.nBatch,
+            nThreads: values.nThreads,
+            temperature: values.temperature,
+            topP: values.topP,
+            topK: values.topK,
+            repeatPenalty: values.repeatPenalty,
+            mmap: values.mmap,
+            mlock: values.mlock,
+            flashAttention: values.flashAttention,
+            updatedAt: values.updatedAt,
+          },
+        })
+        .run();
+      const row = getByModelId(modelId);
+      if (!row)
+        throw new Error(`local_model_advanced_params row ${modelId} not found after upsert`);
+      return row;
+    },
+
+    /** Return the override row for a model, or null if none (= use auto-tune). */
+    getByModelId,
+
+    /** Delete the override row — used for "Reset to Auto." No-op if absent. */
+    clear(modelId: string): void {
+      db.delete(localModelAdvancedParams)
+        .where(eq(localModelAdvancedParams.modelId, modelId))
+        .run();
+    },
+  };
+}
+
+export type LocalModelAdvancedParamsRepo = ReturnType<typeof createLocalModelAdvancedParamsRepo>;
diff --git a/apps/desktop/src/main/db/repos/local-model-endpoints.ts b/apps/desktop/src/main/db/repos/local-model-endpoints.ts
new file mode 100644
index 0000000..d6a7cab
--- /dev/null
+++ b/apps/desktop/src/main/db/repos/local-model-endpoints.ts
@@ -0,0 +1,120 @@
+/**
+ * Local model endpoints repository — remote LAN endpoints (LM Studio /
+ * Ollama / llama-server / KoboldCPP / vLLM) for v3.3.0 local GGUF support
+ * (spec § 7).
+ *
+ * `privacy_tier` is constrained to 'Local' at the SQL layer — these
+ * endpoints are local-network, never cloud. Deleting an endpoint cascades
+ * to any local_models rows that reference it (ON DELETE CASCADE).
+ */
+
+import type { EndpointStatus, RemoteEndpoint } from '@team-x/shared-types';
+import { desc, eq } from 'drizzle-orm';
+import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
+import { nanoid } from 'nanoid';
+
+import type { Schema } from '../client.js';
+import { localModelEndpoints } from '../schema.js';
+
+export interface InsertEndpointInput {
+  name: string;
+  baseUrl: string;
+  authHeaderKeyRef: string | null;
+}
+
+type EndpointsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;
+
+function mapRow(row: typeof localModelEndpoints.$inferSelect): RemoteEndpoint {
+  return {
+    ...row,
+    privacyTier: row.privacyTier as 'Local',
+    status: row.status as EndpointStatus,
+  };
+}
+
+export function createLocalModelEndpointsRepo<TRunResult>(db: EndpointsDb<TRunResult>) {
+  function getById(id: string): RemoteEndpoint | null {
+    const row = db.select().from(localModelEndpoints).where(eq(localModelEndpoints.id, id)).get();
+    return row ? mapRow(row) : null;
+  }
+
+  function readBack(id: string): RemoteEndpoint {
+    const row = getById(id);
+    if (!row) throw new Error(`local_model_endpoints row ${id} not found after write`);
+    return row;
+  }
+
+  return {
+    /** Insert a new endpoint (status starts 'unknown') and return the stored row. */
+    insert(input: InsertEndpointInput): RemoteEndpoint {
+      const id = nanoid();
+      const now = Date.now();
+      db.insert(localModelEndpoints)
+        .values({
+          id,
+          name: input.name,
+          baseUrl: input.baseUrl,
+          authHeaderKeyRef: input.authHeaderKeyRef,
+          privacyTier: 'Local',
+          status: 'unknown',
+          lastCheckedAt: null,
+          lastError: null,
+          createdAt: now,
+          updatedAt: now,
+        })
+        .run();
+      return readBack(id);
+    },
+
+    /** Return the endpoint with a matching id, or null if none exists. */
+    getById,
+
+    /** Every endpoint, newest first. */
+    list(): RemoteEndpoint[] {
+      return db
+        .select()
+        .from(localModelEndpoints)
+        .orderBy(desc(localModelEndpoints.createdAt))
+        .all()
+        .map(mapRow);
+    },
+
+    /** Record a reachability check result; stamps last_checked_at = now. */
+    updateStatus(id: string, status: EndpointStatus, lastError: string | null): RemoteEndpoint {
+      const now = Date.now();
+      db.update(localModelEndpoints)
+        .set({ status, lastCheckedAt: now, lastError, updatedAt: now })
+        .where(eq(localModelEndpoints.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /** Rotate (or clear, with null) the keytar reference for the auth header. */
+    updateAuthRef(id: string, ref: string | null): RemoteEndpoint {
+      db.update(localModelEndpoints)
+        .set({ authHeaderKeyRef: ref, updatedAt: Date.now() })
+        .where(eq(localModelEndpoints.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /** Rename an endpoint. */
+    rename(id: string, name: string): RemoteEndpoint {
+      db.update(localModelEndpoints)
+        .set({ name, updatedAt: Date.now() })
+        .where(eq(localModelEndpoints.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /**
+     * Hard-delete an endpoint. Cascades to local_models rows referencing it
+     * (ON DELETE CASCADE). No-op on unknown id.
+     */
+    remove(id: string): void {
+      db.delete(localModelEndpoints).where(eq(localModelEndpoints.id, id)).run();
+    },
+  };
+}
+
+export type LocalModelEndpointsRepo = ReturnType<typeof createLocalModelEndpointsRepo>;
diff --git a/apps/desktop/src/main/db/repos/local-model-watch-folders.ts b/apps/desktop/src/main/db/repos/local-model-watch-folders.ts
new file mode 100644
index 0000000..7a2cebf
--- /dev/null
+++ b/apps/desktop/src/main/db/repos/local-model-watch-folders.ts
@@ -0,0 +1,101 @@
+/**
+ * Local model watch-folders repository — folder sources scanned for GGUF
+ * files (v3.3.0 local GGUF support, spec § 7). Paths are stored verbatim,
+ * including UNC (\\\\NAS\\share) and mapped-drive paths.
+ */
+
+import type { WatchFolder, WatchFolderStatus } from '@team-x/shared-types';
+import { asc, eq } from 'drizzle-orm';
+import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
+import { nanoid } from 'nanoid';
+
+import type { Schema } from '../client.js';
+import { localModelWatchFolders } from '../schema.js';
+
+export interface InsertWatchFolderInput {
+  path: string;
+  recursive?: boolean;
+}
+
+type WatchFoldersDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;
+
+function mapRow(row: typeof localModelWatchFolders.$inferSelect): WatchFolder {
+  return { ...row, status: row.status as WatchFolderStatus };
+}
+
+export function createLocalModelWatchFoldersRepo<TRunResult>(db: WatchFoldersDb<TRunResult>) {
+  function getById(id: string): WatchFolder | null {
+    const row = db
+      .select()
+      .from(localModelWatchFolders)
+      .where(eq(localModelWatchFolders.id, id))
+      .get();
+    return row ? mapRow(row) : null;
+  }
+
+  function readBack(id: string): WatchFolder {
+    const row = getById(id);
+    if (!row) throw new Error(`local_model_watch_folders row ${id} not found after write`);
+    return row;
+  }
+
+  return {
+    /** Insert a watched folder (recursive defaults to true) and return it. */
+    insert(input: InsertWatchFolderInput): WatchFolder {
+      const id = nanoid();
+      const now = Date.now();
+      db.insert(localModelWatchFolders)
+        .values({
+          id,
+          path: input.path,
+          recursive: input.recursive ?? true,
+          status: 'unknown',
+          lastScanAt: null,
+          lastScanError: null,
+          createdAt: now,
+          updatedAt: now,
+        })
+        .run();
+      return readBack(id);
+    },
+
+    /** Return the watched folder with a matching id, or null if none exists. */
+    getById,
+
+    /** Every watched folder, oldest first (stable ordering for the UI list). */
+    list(): WatchFolder[] {
+      return db
+        .select()
+        .from(localModelWatchFolders)
+        .orderBy(asc(localModelWatchFolders.createdAt))
+        .all()
+        .map(mapRow);
+    },
+
+    /** Record a scan result; stamps last_scan_at = now. */
+    updateStatus(id: string, status: WatchFolderStatus, lastScanError: string | null): WatchFolder {
+      const now = Date.now();
+      db.update(localModelWatchFolders)
+        .set({ status, lastScanAt: now, lastScanError, updatedAt: now })
+        .where(eq(localModelWatchFolders.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /** Flip the recursive-scan flag. */
+    updateRecursive(id: string, recursive: boolean): WatchFolder {
+      db.update(localModelWatchFolders)
+        .set({ recursive, updatedAt: Date.now() })
+        .where(eq(localModelWatchFolders.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /** Hard-delete a watched folder. No-op on unknown id. */
+    remove(id: string): void {
+      db.delete(localModelWatchFolders).where(eq(localModelWatchFolders.id, id)).run();
+    },
+  };
+}
+
+export type LocalModelWatchFoldersRepo = ReturnType<typeof createLocalModelWatchFoldersRepo>;
diff --git a/apps/desktop/src/main/db/repos/local-models.ts b/apps/desktop/src/main/db/repos/local-models.ts
new file mode 100644
index 0000000..c399e7b
--- /dev/null
+++ b/apps/desktop/src/main/db/repos/local-models.ts
@@ -0,0 +1,190 @@
+/**
+ * Local models repository — factory-pattern CRUD for the `local_models`
+ * table (v3.3.0 local GGUF support, spec § 7).
+ *
+ * Typed over the generic `BaseSQLiteDatabase<'sync', TRunResult, Schema>`
+ * so the same factory accepts the `BetterSQLite3Database` returned by
+ * `getDb()` at runtime and the `SQLJsDatabase` returned by `makeTestDb()`
+ * under Vitest — the workspace convention (see companies.ts / test-helpers.ts).
+ *
+ * The boolean flags map cleanly because the schema declares them with
+ * `integer({ mode: 'boolean' })`, so `$inferSelect` already yields booleans;
+ * mapRow only narrows the text discriminant columns to their string-literal
+ * unions. The source-shape CHECK constraint is enforced at the SQL layer —
+ * callers (the library service, Phase 3) supply file/folder rows with a
+ * source_path and no endpoint, and remote-endpoint rows the other way around.
+ */
+
+import { desc, eq, sql } from 'drizzle-orm';
+import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
+import { nanoid } from 'nanoid';
+
+import type { LocalModel, ModelStatus, SourceType } from '@team-x/shared-types';
+
+import type { Schema } from '../client.js';
+import { localModels } from '../schema.js';
+
+export interface InsertLocalModelInput {
+  displayName: string;
+  sourceType: SourceType;
+  sourcePath: string | null;
+  endpointId: string | null;
+  ggufArch: string | null;
+  ggufParamsB: number | null;
+  ggufQuant: string | null;
+  ggufContextMax: number | null;
+  ggufSizeBytes: number | null;
+  ggufSha256: string | null;
+  ggufChatTemplate: string | null;
+  isEmbeddingModel: boolean;
+  isToolCapable: boolean;
+  hfRepoId: string | null;
+  hfFilename: string | null;
+  license: string | null;
+  chatTemplateOverride: string | null;
+  systemPromptOverride: string | null;
+}
+
+type LocalModelsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;
+
+function mapRow(row: typeof localModels.$inferSelect): LocalModel {
+  return {
+    ...row,
+    sourceType: row.sourceType as SourceType,
+    status: row.status as ModelStatus,
+  };
+}
+
+export function createLocalModelsRepo<TRunResult>(db: LocalModelsDb<TRunResult>) {
+  function getById(id: string): LocalModel | null {
+    const row = db.select().from(localModels).where(eq(localModels.id, id)).get();
+    return row ? mapRow(row) : null;
+  }
+
+  /** Re-read a row after a write; throws if it vanished (it never should). */
+  function readBack(id: string): LocalModel {
+    const row = getById(id);
+    if (!row) throw new Error(`local_models row ${id} not found after write`);
+    return row;
+  }
+
+  return {
+    /** Insert a new model (status starts 'cold') and return the stored row. */
+    insert(input: InsertLocalModelInput): LocalModel {
+      const id = nanoid();
+      const now = Date.now();
+      db.insert(localModels)
+        .values({
+          id,
+          displayName: input.displayName,
+          sourceType: input.sourceType,
+          sourcePath: input.sourcePath,
+          endpointId: input.endpointId,
+          ggufArch: input.ggufArch,
+          ggufParamsB: input.ggufParamsB,
+          ggufQuant: input.ggufQuant,
+          ggufContextMax: input.ggufContextMax,
+          ggufSizeBytes: input.ggufSizeBytes,
+          ggufSha256: input.ggufSha256,
+          ggufChatTemplate: input.ggufChatTemplate,
+          isEmbeddingModel: input.isEmbeddingModel,
+          isToolCapable: input.isToolCapable,
+          hfRepoId: input.hfRepoId,
+          hfFilename: input.hfFilename,
+          license: input.license,
+          chatTemplateOverride: input.chatTemplateOverride,
+          systemPromptOverride: input.systemPromptOverride,
+          status: 'cold',
+          statusDetail: null,
+          lastUsedAt: null,
+          createdAt: now,
+          updatedAt: now,
+        })
+        .run();
+      return readBack(id);
+    },
+
+    /** Return the model with a matching id, or null if none exists. */
+    getById,
+
+    /**
+     * Every model, most-recently-used first. NULL last_used_at rows sort
+     * after used rows, then created_at DESC breaks ties.
+     */
+    list(): LocalModel[] {
+      return db
+        .select()
+        .from(localModels)
+        .orderBy(
+          sql`${localModels.lastUsedAt} is null`,
+          desc(localModels.lastUsedAt),
+          desc(localModels.createdAt),
+        )
+        .all()
+        .map(mapRow);
+    },
+
+    /** Models of a single source type, same ordering as `list()`. */
+    listBySourceType(sourceType: SourceType): LocalModel[] {
+      return db
+        .select()
+        .from(localModels)
+        .where(eq(localModels.sourceType, sourceType))
+        .orderBy(
+          sql`${localModels.lastUsedAt} is null`,
+          desc(localModels.lastUsedAt),
+          desc(localModels.createdAt),
+        )
+        .all()
+        .map(mapRow);
+    },
+
+    /** Set the lifecycle status + optional detail; bumps updated_at. */
+    updateStatus(id: string, status: ModelStatus, detail: string | null): LocalModel {
+      db.update(localModels)
+        .set({ status, statusDetail: detail, updatedAt: Date.now() })
+        .where(eq(localModels.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /** Persist (or clear, with null) the per-model system-prompt override. */
+    setSystemPrompt(id: string, prompt: string | null): LocalModel {
+      db.update(localModels)
+        .set({ systemPromptOverride: prompt, updatedAt: Date.now() })
+        .where(eq(localModels.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /** Persist (or clear, with null) the per-model chat-template override. */
+    setChatTemplateOverride(id: string, template: string | null): LocalModel {
+      db.update(localModels)
+        .set({ chatTemplateOverride: template, updatedAt: Date.now() })
+        .where(eq(localModels.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /** Stamp last_used_at = now (called when a model is loaded / chatted with). */
+    touchLastUsed(id: string): LocalModel {
+      const now = Date.now();
+      db.update(localModels)
+        .set({ lastUsedAt: now, updatedAt: now })
+        .where(eq(localModels.id, id))
+        .run();
+      return readBack(id);
+    },
+
+    /**
+     * Hard-delete a model. Cascades to local_model_advanced_params and
+     * local_model_benchmarks via their ON DELETE CASCADE FKs. No-op on
+     * unknown id.
+     */
+    remove(id: string): void {
+      db.delete(localModels).where(eq(localModels.id, id)).run();
+    },
+  };
+}
+
+export type LocalModelsRepo = ReturnType<typeof createLocalModelsRepo>;

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '$repo='"'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X'; git -c safe.directory=\""'$repo" diff --unified=80 e52e373101fe0d413b423704c1ebd2eecb98afa6 -- apps/desktop/src/main/ipc apps/desktop/src/preload/api.ts apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts packages/shared-types/src/local-gguf.ts packages/shared-types/src/ipc.ts apps/desktop/src/main/index.ts packages/local-gguf-runtime/src/index.ts packages/local-gguf-runtime/src/errors.ts package.json pnpm-lock.yaml' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1426ms:
diff --git a/apps/desktop/src/main/index.ts b/apps/desktop/src/main/index.ts
index 23d89e2..a7241ba 100644
--- a/apps/desktop/src/main/index.ts
+++ b/apps/desktop/src/main/index.ts
@@ -60,160 +60,165 @@ import {
 } from '@team-x/intelligence';
 import {
   type StreamContentPart,
   type StreamMessage,
   type ToolSpec,
   buildProviderTools,
   createEmbedText,
 } from '@team-x/provider-router';
 import { streamAgent } from '@team-x/provider-router';
 import type {
   EmbeddingSourceType,
   Employee,
   Meeting,
   RuntimeStrategy,
   Ticket,
 } from '@team-x/shared-types';
 import {
   CONCURRENCY_SETTINGS_CLAMPS,
   DEFAULT_CONCURRENCY_CAPS,
   SYSTEM_AGENT_ROLE_ID,
   SYSTEM_COPILOT_ROLE_ID,
 } from '@team-x/shared-types';
 import { calcCostUsd } from '@team-x/telemetry-core';
 import { eq } from 'drizzle-orm';
 import { BrowserWindow, app, dialog, ipcMain } from 'electron';
 
 import { configureStableUserDataPath } from './app-user-data.js';
 import { closeDb, getDb, initDb } from './db/client.js';
 import { initFts5 } from './db/fts5-init.js';
 import { runMigrations } from './db/migrate.js';
 import { dbPath, userDataDir } from './db/paths.js';
 import { createAgentWakeupRequestsRepo } from './db/repos/agent-wakeup-requests.js';
 import { createArtifactsRepo } from './db/repos/artifacts.js';
 import { createAuditRepo } from './db/repos/audit.js';
 import { createBudgetsRepo } from './db/repos/budgets.js';
 import { createCommandHistoryRepo } from './db/repos/command-history.js';
 import { createCompaniesRepo } from './db/repos/companies.js';
 import { createCopilotInsightsRepo } from './db/repos/copilot-insights.js';
 import { createEmbeddingsRepo } from './db/repos/embeddings.js';
 import { createEmployeesRepo } from './db/repos/employees.js';
 import { createEventsRepo } from './db/repos/events.js';
 import {
   createAuthorityRepo,
   createExtensionsRepo,
   createSkillAssignmentsRepo,
 } from './db/repos/extensions.js';
 import { createGoalsRepo } from './db/repos/goals.js';
 import {
   createMcpServersRepo,
   createToolCallsRepo,
   seedDefaultMcpServers,
 } from './db/repos/mcp-servers.js';
 import { createMeetingsRepo } from './db/repos/meetings.js';
 import { createMessagesRepo } from './db/repos/messages.js';
 import { createOperatorsRepo } from './db/repos/operators.js';
 import { createOrgEdgesRepo } from './db/repos/orgchart.js';
 import { createPendingDelegationsRepo } from './db/repos/pending-delegations.js';
 import { createProjectsRepo } from './db/repos/projects.js';
 import { createRoutinesRepo } from './db/repos/routines.js';
 import { createRunCheckpointsRepo } from './db/repos/run-checkpoints.js';
 import { createRunsRepo } from './db/repos/runs.js';
 import {
   type RuntimeProfilesRepo,
   createRuntimeProfilesRepo,
 } from './db/repos/runtime-profiles.js';
 import { createRuntimeSessionsRepo } from './db/repos/runtime-sessions.js';
 import { createScheduleItemsRepo } from './db/repos/schedule-items.js';
 import { createSettingsRepo } from './db/repos/settings.js';
 import { createThreadDigestsRepo } from './db/repos/thread-digests.js';
 import { createThreadsRepo } from './db/repos/threads.js';
 import { createTicketAttachmentsRepo } from './db/repos/ticket-attachments.js';
 import { createTicketCheckoutsRepo } from './db/repos/ticket-checkouts.js';
 import { createTicketsRepo } from './db/repos/tickets.js';
 import { createVaultRepo } from './db/repos/vault.js';
 import { messages as messagesTable } from './db/schema.js';
 import { seed } from './db/seed.js';
 import { buildCommandHandlers } from './ipc/command-handlers.js';
 import { buildCopilotHandlers } from './ipc/copilot-handlers.js';
 import { buildEnhancedAiHandlers } from './ipc/enhanced-ai-handlers.js';
 import { HUMAN_USER_ID, createIpcHandlers } from './ipc/handlers.js';
+import { registerLocalGgufBenchmarkHandlers } from './ipc/local-gguf-benchmark-handlers.js';
+import { registerLocalGgufEndpointHandlers } from './ipc/local-gguf-endpoint-handlers.js';
+import { registerLocalGgufHfHandlers } from './ipc/local-gguf-hf-handlers.js';
+import { registerLocalGgufLibraryHandlers } from './ipc/local-gguf-library-handlers.js';
+import { registerLocalGgufRuntimeHandlers } from './ipc/local-gguf-runtime-handlers.js';
 import { buildRagHandlers } from './ipc/rag-handlers.js';
 import { registerIpcHandlers } from './ipc/register.js';
 import { setupApplicationMenu } from './menu.js';
 import { createAgentWakeupQueue } from './orchestrator/agent-wakeup-queue.js';
 import { createEventBus } from './orchestrator/event-bus.js';
 import { createHeartbeatService } from './orchestrator/heartbeat-service.js';
 import {
   type Orchestrator,
   type ResolveProvider,
   type ResolveTools,
   buildOrchestrator,
 } from './orchestrator/index.js';
 import { createMeetingService } from './orchestrator/meeting-service.js';
 import type { CostCalculator } from './orchestrator/run-agent.js';
 import { createAgentImprovementService } from './services/agent-improvement-service.js';
 import {
   type AgenticLoopService,
   createAgenticLoopService,
 } from './services/agentic-loop-service.js';
 import { buildCopilotToolRegistry } from './services/agentic-tools-copilot.js';
 import {
   type WriteSideCompleteFn,
   type WriteSideOrchestrator,
   type WriteSideWorkloadProvider,
   buildWriteSideTools,
 } from './services/agentic-tools-write.js';
 import { createAgenticTools } from './services/agentic-tools.js';
 import { createApprovalInboxService } from './services/approval-inbox-service.js';
 import { createArtifactService } from './services/artifact-service.js';
 import { createAuthorityResolverService } from './services/authority-resolver-service.js';
 import { createInMemoryAutonomyBenchmarkScenarioContext } from './services/autonomy-benchmark-memory-context.js';
 import { createAutonomyBenchmarkService } from './services/autonomy-benchmark-service.js';
 import { createAutonomyDoctorService } from './services/autonomy-doctor-service.js';
 import { createBackupService } from './services/backup.js';
 import { createBudgetGovernanceService } from './services/budget-governance-service.js';
 import { buildChatActionTools } from './services/chat-action-tools.js';
 import { createCloudLinkService } from './services/cloud-link-service.js';
 import { type CommandService, createCommandService } from './services/command-service.js';
 import { createCompanyPortabilityService } from './services/company-portability-service.js';
 import { createContextAssemblerService } from './services/context-assembler-service.js';
 import { createContextPackerService } from './services/context-packer-service.js';
 import {
   type CopilotAnalyzerCompleteFn,
   type CopilotAnalyzerService,
   createCopilotAnalyzerService,
 } from './services/copilot-analyzer-service.js';
 import {
   type CopilotEventTrigger,
   createCopilotEventTrigger,
 } from './services/copilot-event-trigger.js';
 import { createCopilotEventWindow } from './services/copilot-event-window.js';
 import type { CopilotEventWindow } from './services/copilot-event-window.js';
 import { createCopilotService } from './services/copilot-service.js';
 import { type EnhancedAiService, createEnhancedAiService } from './services/enhanced-ai.js';
 import { bootstrapEnvKeys } from './services/env-key-bootstrap.js';
 import { createExtensionsRegistryService } from './services/extensions-registry-service.js';
 import { createExternalRuntimeAdapters } from './services/external-runtime-adapters.js';
 import { type McpHost, createMcpHost } from './services/mcp-host.js';
 import {
   createFileAllowlist,
   defaultAllowlistPath as mcpDefaultAllowlistPath,
 } from './services/mcp-security.js';
 import { createOperatorAccessService } from './services/operator-access-service.js';
 import {
   type ProactiveTriggerService,
   createProactiveTriggerService,
 } from './services/proactive-trigger-service.js';
 import { detectHardware } from './services/profiler.js';
 import {
   buildEmbedAdapter,
   createProviderFactory,
   createTestModeResolveProvider,
   isTestMode,
   makeFakeEmbedAdapter,
 } from './services/provider-factory.js';
 import { getProvidersService, seedDefaultProviders } from './services/providers.js';
 import { createRagIndexer } from './services/rag-indexer.js';
 import { rebuildCompanyRagSources } from './services/rag-rebuild.js';
 import { createRetrievalOrchestrator } from './services/retrieval-orchestrator.js';
 import { createRoleLoader } from './services/role-loader.js';
@@ -2822,160 +2827,172 @@ app
     );
     ipcMain.handle(
       'command.execute',
       (_evt, req: import('@team-x/shared-types').IpcExecuteRequest) =>
         commandHandlers['command.execute'](req),
     );
     ipcMain.handle(
       'command.history',
       (_evt, req: import('@team-x/shared-types').CommandHistoryRequest) =>
         commandHandlers['command.history'](req),
     );
     ipcMain.handle(
       'command.suggest',
       (_evt, req: import('@team-x/shared-types').CommandSuggestRequest) =>
         commandHandlers['command.suggest'](req),
     );
     ipcMain.handle('command.stop', (_evt, req: import('@team-x/shared-types').CommandStopRequest) =>
       commandHandlers['command.stop'](req),
     );
     // Phase 5 — M32 T0 / F1. Palette step-log backfill on mount.
     ipcMain.handle('command.getRunSnapshot', (_evt, req: { runId: string }) =>
       commandHandlers['command.getRunSnapshot'](req),
     );
 
     // ---- Copilot IPC handlers (Phase 5 — M33 T5) ---------------------------
     //
     // Sibling registration block on the same pattern RAG and Command
     // use — the Copilot subsystem has its own runtime deps (analyzer
     // singleton + insights repo + bus emit for dismissals) and the
     // handlers module lives in `ipc/copilot-handlers.ts` alongside
     // `rag-handlers.ts`. The four channel strings are listed in
     // `REQUEST_CHANNELS` so `unregisterIpc()` strips them on shutdown.
     //
     // M33 T6 — `agenticLoopStart` is now wired via the copilot-service
     // front-door. The service resolves the per-company system-copilot
     // pseudo-employee via `findSystemByRoleId` and passes the id
     // through to `AgenticLoopService.start` as the explicit
     // `employeeId`, which selects the copilot branch in `buildTools`
     // above (readSide + query_copilot_insights, no write-side tools).
     // Wire contract (M31 parity): returns `{ runId, threadId }` — same
     // shape as `command.execute` complex_request so the M34 sidebar
     // can attach `useAgentStepStream` with zero wire-format branching.
     if (copilotAnalyzerServiceInstance === null) {
       throw new Error('copilotAnalyzerServiceInstance must be initialized before copilot handlers');
     }
     const copilotServiceInstance = createCopilotService({
       agenticLoopService: agenticLoopSvc,
       employeesRepo: {
         findSystemByRoleId: (cid, rid) => employeesRepo.findSystemByRoleId(cid, rid),
       },
     });
     const copilotHandlers = buildCopilotHandlers({
       copilotInsightsRepo,
       copilotAnalyzerService: copilotAnalyzerServiceInstance,
       bus,
       auditRepo,
       settingsRepo,
       isTestMode,
       agenticLoopStart: (req) =>
         copilotServiceInstance.ask({ companyId: req.companyId, text: req.text }),
     });
     ipcMain.handle(
       'copilot.insights',
       (_evt, req: import('@team-x/shared-types').CopilotInsightListArgs) =>
         copilotHandlers.insights(req),
     );
     ipcMain.handle(
       'copilot.dismiss',
       (_evt, req: import('@team-x/shared-types').CopilotDismissArgs) =>
         copilotHandlers.dismiss(req),
     );
     ipcMain.handle('copilot.ask', (_evt, req: import('@team-x/shared-types').CopilotAskArgs) =>
       copilotHandlers.ask(req),
     );
     ipcMain.handle(
       'copilot.configure',
       (_evt, req: import('@team-x/shared-types').CopilotConfigureArgs) =>
         copilotHandlers.configure(req),
     );
 
+    // Local & Networked GGUF Support (v3.3.0). Phase 1 registers the full
+    // `localGguf.*` channel surface so the preload bridge has live handlers
+    // to invoke; each handler throws a not-implemented error until its
+    // owning phase lands the real service (runtime/pool → P2, library → P3,
+    // endpoint → P5, hf → P7, benchmark → P10). The registration functions
+    // grow a `deps` argument at that point — this single call-site updates.
+    registerLocalGgufLibraryHandlers(ipcMain);
+    registerLocalGgufRuntimeHandlers(ipcMain);
+    registerLocalGgufHfHandlers(ipcMain);
+    registerLocalGgufBenchmarkHandlers(ipcMain);
+    registerLocalGgufEndpointHandlers(ipcMain);
+
     console.log('[main] orchestrator + IPC ready');
 
     // ---- Application menu ---------------------------------------------------
     setupApplicationMenu();
 
     // ---- 6. Window ---------------------------------------------------------
     createWindow();
     app.on('activate', () => {
       if (BrowserWindow.getAllWindows().length === 0) createWindow();
     });
   })
   .catch((err) => {
     console.error('[main] fatal: app initialization failed:', err);
     dialog.showErrorBox(
       'Team-X failed to start',
       `Initialization error:\n\n${err instanceof Error ? err.message : String(err)}\n\nThe application will now exit.`,
     );
     app.exit(1);
   });
 
 app.on('window-all-closed', () => {
   if (process.platform !== 'darwin') app.quit();
 });
 
 /**
  * Graceful shutdown — runs once on app teardown. Order matters:
  *
  *   1. Stop the orchestrator first so no new turns fire and any
  *      in-flight runs get a chance to complete (or surface their
  *      `work.failed` events to subscribers that are still alive).
  *   2. Tear down the IPC layer so the renderer cannot fire late
  *      invokes that would land on a half-disposed handler.
  *   3. Close the SQLite handle last — anything above this line might
  *      still want to write a final row.
  *
  * Errors at every step are caught and logged. The will-quit hook
  * MUST return promptly even if a step rejects, otherwise Electron
  * sits waiting for the event loop to drain.
  */
 app.on('will-quit', (event) => {
   if (
     orchestrator === null &&
     unregisterIpc === null &&
     ragIndexerInstance === null &&
     copilotEventWindowInstance === null &&
     copilotEventTriggerInstance === null &&
     copilotAnalyzerServiceInstance === null &&
     commandServiceInstance === null &&
     agenticLoopServiceInstance === null
   ) {
     closeDb();
     return;
   }
   // Defer the actual quit until shutdown completes. The original
   // implementation called `app.quit()` after the async chain, which
   // re-fires `will-quit` recursively — the second pass took the
   // null-state branch above and let Electron continue, but the cycle
   // turned out to be racy under Playwright's `app.close()` driver
   // and the process never exited. Switching to `app.exit(0)` short-
   // circuits the event loop entirely after our shutdown chain is
   // complete, which is exactly what we want here: shutdown is done,
   // there is nothing left to clean up, just terminate. Production
   // users see the same behaviour — the renderer windows are already
   // closed by the time will-quit fires, so there is no UI to lose.
   event.preventDefault();
   void (async () => {
     // Stop the RAG indexer BEFORE draining the orchestrator: the indexer
     // subscribes to the event bus, and the orchestrator writes events
     // during its drain. Stopping the subscriber first means any final
     // drain events simply have no listener — no in-flight embed call
     // can land while the process is tearing down.
     try {
       if (ragIndexerInstance !== null) {
         ragIndexerInstance.stop();
         ragIndexerInstance = null;
       }
     } catch (err) {
       console.error('[main] rag indexer stop failed:', err);
     }
     // Stop the CopilotEventWindow alongside the RAG indexer — both are
diff --git a/apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.test.ts b/apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.test.ts
new file mode 100644
index 0000000..035cb0e
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.test.ts
@@ -0,0 +1,42 @@
+import type { IpcMain } from 'electron';
+import { describe, expect, it } from 'vitest';
+
+import {
+  LOCAL_GGUF_BENCHMARK_CHANNELS,
+  registerLocalGgufBenchmarkHandlers,
+} from './local-gguf-benchmark-handlers.js';
+
+function makeFakeIpc() {
+  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
+  const ipc = {
+    handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
+      handlers.set(channel, fn);
+    },
+  } as unknown as IpcMain;
+  return {
+    ipc,
+    channels: () => [...handlers.keys()],
+    invoke: (channel: string, ...args: unknown[]) => {
+      const fn = handlers.get(channel);
+      if (!fn) throw new Error(`no handler for ${channel}`);
+      return fn({}, ...args);
+    },
+  };
+}
+
+describe('localGguf benchmark IPC handlers (Phase 1 stubs)', () => {
+  it('registers every benchmark channel', () => {
+    const f = makeFakeIpc();
+    registerLocalGgufBenchmarkHandlers(f.ipc);
+    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_BENCHMARK_CHANNELS].sort());
+  });
+
+  it.each([...LOCAL_GGUF_BENCHMARK_CHANNELS])(
+    'handler %s throws not-implemented',
+    async (channel) => {
+      const f = makeFakeIpc();
+      registerLocalGgufBenchmarkHandlers(f.ipc);
+      await expect(f.invoke(channel)).rejects.toThrow(/not implemented/i);
+    },
+  );
+});
diff --git a/apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.ts b/apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.ts
new file mode 100644
index 0000000..dbc71e2
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.ts
@@ -0,0 +1,27 @@
+/**
+ * IPC handlers for the localGguf.benchmark.* channels.
+ *
+ * Phase 1: typed not-implemented stubs. Phase 10 (benchmark runner)
+ * replaces them with real implementations against the BenchmarkService.
+ */
+
+import type { BenchmarkResult } from '@team-x/shared-types';
+import type { IpcMain } from 'electron';
+
+import { notImplemented } from './local-gguf-not-implemented.js';
+
+export const LOCAL_GGUF_BENCHMARK_CHANNELS = [
+  'localGguf.benchmark.run',
+  'localGguf.benchmark.history',
+] as const;
+
+export function registerLocalGgufBenchmarkHandlers(ipc: IpcMain): void {
+  ipc.handle(
+    'localGguf.benchmark.run',
+    async (): Promise<BenchmarkResult> => notImplemented('localGguf.benchmark.run'),
+  );
+  ipc.handle(
+    'localGguf.benchmark.history',
+    async (): Promise<BenchmarkResult[]> => notImplemented('localGguf.benchmark.history'),
+  );
+}
diff --git a/apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.test.ts b/apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.test.ts
new file mode 100644
index 0000000..87dd92b
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.test.ts
@@ -0,0 +1,42 @@
+import type { IpcMain } from 'electron';
+import { describe, expect, it } from 'vitest';
+
+import {
+  LOCAL_GGUF_ENDPOINT_CHANNELS,
+  registerLocalGgufEndpointHandlers,
+} from './local-gguf-endpoint-handlers.js';
+
+function makeFakeIpc() {
+  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
+  const ipc = {
+    handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
+      handlers.set(channel, fn);
+    },
+  } as unknown as IpcMain;
+  return {
+    ipc,
+    channels: () => [...handlers.keys()],
+    invoke: (channel: string, ...args: unknown[]) => {
+      const fn = handlers.get(channel);
+      if (!fn) throw new Error(`no handler for ${channel}`);
+      return fn({}, ...args);
+    },
+  };
+}
+
+describe('localGguf endpoint IPC handlers (Phase 1 stubs)', () => {
+  it('registers every endpoint channel', () => {
+    const f = makeFakeIpc();
+    registerLocalGgufEndpointHandlers(f.ipc);
+    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_ENDPOINT_CHANNELS].sort());
+  });
+
+  it.each([...LOCAL_GGUF_ENDPOINT_CHANNELS])(
+    'handler %s throws not-implemented',
+    async (channel) => {
+      const f = makeFakeIpc();
+      registerLocalGgufEndpointHandlers(f.ipc);
+      await expect(f.invoke(channel)).rejects.toThrow(/not implemented/i);
+    },
+  );
+});
diff --git a/apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.ts b/apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.ts
new file mode 100644
index 0000000..638cd8e
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.ts
@@ -0,0 +1,49 @@
+/**
+ * IPC handlers for the localGguf.endpoint.* channels (remote LAN endpoints).
+ *
+ * Phase 1: typed not-implemented stubs. Phase 5 (endpoints UI / service)
+ * replaces them with real implementations against the EndpointService.
+ */
+
+import type { LocalGgufError, RemoteEndpoint } from '@team-x/shared-types';
+import type { IpcMain } from 'electron';
+
+import { notImplemented } from './local-gguf-not-implemented.js';
+
+/** Result of a localGguf.endpoint.test reachability probe. */
+export interface EndpointTestResult {
+  reachable: boolean;
+  latencyMs?: number;
+  error?: LocalGgufError;
+}
+
+export const LOCAL_GGUF_ENDPOINT_CHANNELS = [
+  'localGguf.endpoint.list',
+  'localGguf.endpoint.add',
+  'localGguf.endpoint.remove',
+  'localGguf.endpoint.test',
+  'localGguf.endpoint.update',
+] as const;
+
+export function registerLocalGgufEndpointHandlers(ipc: IpcMain): void {
+  ipc.handle(
+    'localGguf.endpoint.list',
+    async (): Promise<RemoteEndpoint[]> => notImplemented('localGguf.endpoint.list'),
+  );
+  ipc.handle(
+    'localGguf.endpoint.add',
+    async (): Promise<RemoteEndpoint> => notImplemented('localGguf.endpoint.add'),
+  );
+  ipc.handle(
+    'localGguf.endpoint.remove',
+    async (): Promise<void> => notImplemented('localGguf.endpoint.remove'),
+  );
+  ipc.handle(
+    'localGguf.endpoint.test',
+    async (): Promise<EndpointTestResult> => notImplemented('localGguf.endpoint.test'),
+  );
+  ipc.handle(
+    'localGguf.endpoint.update',
+    async (): Promise<RemoteEndpoint> => notImplemented('localGguf.endpoint.update'),
+  );
+}
diff --git a/apps/desktop/src/main/ipc/local-gguf-hf-handlers.test.ts b/apps/desktop/src/main/ipc/local-gguf-hf-handlers.test.ts
new file mode 100644
index 0000000..b00d4ba
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-hf-handlers.test.ts
@@ -0,0 +1,36 @@
+import type { IpcMain } from 'electron';
+import { describe, expect, it } from 'vitest';
+
+import { LOCAL_GGUF_HF_CHANNELS, registerLocalGgufHfHandlers } from './local-gguf-hf-handlers.js';
+
+function makeFakeIpc() {
+  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
+  const ipc = {
+    handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
+      handlers.set(channel, fn);
+    },
+  } as unknown as IpcMain;
+  return {
+    ipc,
+    channels: () => [...handlers.keys()],
+    invoke: (channel: string, ...args: unknown[]) => {
+      const fn = handlers.get(channel);
+      if (!fn) throw new Error(`no handler for ${channel}`);
+      return fn({}, ...args);
+    },
+  };
+}
+
+describe('localGguf hf IPC handlers (Phase 1 stubs)', () => {
+  it('registers every hf channel', () => {
+    const f = makeFakeIpc();
+    registerLocalGgufHfHandlers(f.ipc);
+    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_HF_CHANNELS].sort());
+  });
+
+  it.each([...LOCAL_GGUF_HF_CHANNELS])('handler %s throws not-implemented', async (channel) => {
+    const f = makeFakeIpc();
+    registerLocalGgufHfHandlers(f.ipc);
+    await expect(f.invoke(channel)).rejects.toThrow(/not implemented/i);
+  });
+});
diff --git a/apps/desktop/src/main/ipc/local-gguf-hf-handlers.ts b/apps/desktop/src/main/ipc/local-gguf-hf-handlers.ts
new file mode 100644
index 0000000..cc2595b
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-hf-handlers.ts
@@ -0,0 +1,55 @@
+/**
+ * IPC handlers for the localGguf.hf.* channels (Hugging Face Hub browser).
+ *
+ * Phase 1: typed not-implemented stubs. Phase 7 (HF browser) replaces them
+ * with real implementations against the HfService. The result shapes
+ * (`HfSearchResult`, `HfModelCard`, `DownloadProgress`) live in
+ * @team-x/shared-types so the preload bridge and renderer share one
+ * definition with these handlers.
+ */
+
+import type { DownloadProgress, HfModelCard, HfSearchResult } from '@team-x/shared-types';
+import type { IpcMain } from 'electron';
+
+import { notImplemented } from './local-gguf-not-implemented.js';
+
+export const LOCAL_GGUF_HF_CHANNELS = [
+  'localGguf.hf.search',
+  'localGguf.hf.modelCard',
+  'localGguf.hf.startDownload',
+  'localGguf.hf.pauseDownload',
+  'localGguf.hf.resumeDownload',
+  'localGguf.hf.cancelDownload',
+  'localGguf.hf.activeDownloads',
+] as const;
+
+export function registerLocalGgufHfHandlers(ipc: IpcMain): void {
+  ipc.handle(
+    'localGguf.hf.search',
+    async (): Promise<HfSearchResult[]> => notImplemented('localGguf.hf.search'),
+  );
+  ipc.handle(
+    'localGguf.hf.modelCard',
+    async (): Promise<HfModelCard> => notImplemented('localGguf.hf.modelCard'),
+  );
+  ipc.handle(
+    'localGguf.hf.startDownload',
+    async (): Promise<{ handleId: string }> => notImplemented('localGguf.hf.startDownload'),
+  );
+  ipc.handle(
+    'localGguf.hf.pauseDownload',
+    async (): Promise<void> => notImplemented('localGguf.hf.pauseDownload'),
+  );
+  ipc.handle(
+    'localGguf.hf.resumeDownload',
+    async (): Promise<void> => notImplemented('localGguf.hf.resumeDownload'),
+  );
+  ipc.handle(
+    'localGguf.hf.cancelDownload',
+    async (): Promise<void> => notImplemented('localGguf.hf.cancelDownload'),
+  );
+  ipc.handle(
+    'localGguf.hf.activeDownloads',
+    async (): Promise<DownloadProgress[]> => notImplemented('localGguf.hf.activeDownloads'),
+  );
+}
diff --git a/apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts b/apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts
new file mode 100644
index 0000000..60f927e
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts
@@ -0,0 +1,42 @@
+import type { IpcMain } from 'electron';
+import { describe, expect, it } from 'vitest';
+
+import {
+  LOCAL_GGUF_LIBRARY_CHANNELS,
+  registerLocalGgufLibraryHandlers,
+} from './local-gguf-library-handlers.js';
+
+function makeFakeIpc() {
+  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
+  const ipc = {
+    handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
+      handlers.set(channel, fn);
+    },
+  } as unknown as IpcMain;
+  return {
+    ipc,
+    channels: () => [...handlers.keys()],
+    invoke: (channel: string, ...args: unknown[]) => {
+      const fn = handlers.get(channel);
+      if (!fn) throw new Error(`no handler for ${channel}`);
+      return fn({}, ...args);
+    },
+  };
+}
+
+describe('localGguf library IPC handlers (Phase 1 stubs)', () => {
+  it('registers every library channel', () => {
+    const f = makeFakeIpc();
+    registerLocalGgufLibraryHandlers(f.ipc);
+    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_LIBRARY_CHANNELS].sort());
+  });
+
+  it.each([...LOCAL_GGUF_LIBRARY_CHANNELS])(
+    'handler %s throws not-implemented',
+    async (channel) => {
+      const f = makeFakeIpc();
+      registerLocalGgufLibraryHandlers(f.ipc);
+      await expect(f.invoke(channel)).rejects.toThrow(/not implemented/i);
+    },
+  );
+});
diff --git a/apps/desktop/src/main/ipc/local-gguf-library-handlers.ts b/apps/desktop/src/main/ipc/local-gguf-library-handlers.ts
new file mode 100644
index 0000000..e5bea1a
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-library-handlers.ts
@@ -0,0 +1,85 @@
+/**
+ * IPC handlers for the localGguf.library.* channels.
+ *
+ * Phase 1: every handler is a typed stub that throws a not-implemented
+ * error so callers fail fast and visibly. Phase 3 (library + scanning)
+ * replaces these with real implementations against the LibraryService —
+ * the registration function grows a `deps` argument at that point and the
+ * single boot call-site in main/index.ts is updated.
+ *
+ * Return-type annotations encode the contract each channel must satisfy
+ * once implemented; `notImplemented` returns `never`, which is assignable
+ * to every annotated Promise.
+ */
+
+import type { AdvancedParams, LocalModel, WatchFolder } from '@team-x/shared-types';
+import type { IpcMain } from 'electron';
+
+import { notImplemented } from './local-gguf-not-implemented.js';
+
+export const LOCAL_GGUF_LIBRARY_CHANNELS = [
+  'localGguf.library.list',
+  'localGguf.library.get',
+  'localGguf.library.addFile',
+  'localGguf.library.addFolder',
+  'localGguf.library.removeModel',
+  'localGguf.library.removeFolder',
+  'localGguf.library.scanFolder',
+  'localGguf.library.setSystemPrompt',
+  'localGguf.library.setChatTemplate',
+  'localGguf.library.setAdvancedParams',
+  'localGguf.library.resetAdvanced',
+  'localGguf.library.listBySourceType',
+] as const;
+
+export function registerLocalGgufLibraryHandlers(ipc: IpcMain): void {
+  ipc.handle(
+    'localGguf.library.list',
+    async (): Promise<LocalModel[]> => notImplemented('localGguf.library.list'),
+  );
+  ipc.handle(
+    'localGguf.library.get',
+    async (): Promise<LocalModel | null> => notImplemented('localGguf.library.get'),
+  );
+  ipc.handle(
+    'localGguf.library.addFile',
+    async (): Promise<LocalModel> => notImplemented('localGguf.library.addFile'),
+  );
+  ipc.handle(
+    'localGguf.library.addFolder',
+    async (): Promise<WatchFolder> => notImplemented('localGguf.library.addFolder'),
+  );
+  ipc.handle(
+    'localGguf.library.removeModel',
+    async (): Promise<void> => notImplemented('localGguf.library.removeModel'),
+  );
+  ipc.handle(
+    'localGguf.library.removeFolder',
+    async (): Promise<void> => notImplemented('localGguf.library.removeFolder'),
+  );
+  ipc.handle(
+    'localGguf.library.scanFolder',
+    async (): Promise<{ addedCount: number; removedCount: number }> =>
+      notImplemented('localGguf.library.scanFolder'),
+  );
+  ipc.handle(
+    'localGguf.library.setSystemPrompt',
+    async (): Promise<LocalModel> => notImplemented('localGguf.library.setSystemPrompt'),
+  );
+  ipc.handle(
+    'localGguf.library.setChatTemplate',
+    async (): Promise<LocalModel> => notImplemented('localGguf.library.setChatTemplate'),
+  );
+  ipc.handle(
+    'localGguf.library.setAdvancedParams',
+    async (): Promise<AdvancedParams> => notImplemented('localGguf.library.setAdvancedParams'),
+  );
+  ipc.handle(
+    'localGguf.library.resetAdvanced',
+    async (): Promise<AdvancedParams> => notImplemented('localGguf.library.resetAdvanced'),
+  );
+  ipc.handle(
+    'localGguf.library.listBySourceType',
+    async (): Promise<LocalModel[]> => notImplemented('localGguf.library.listBySourceType'),
+  );
+}
diff --git a/apps/desktop/src/main/ipc/local-gguf-not-implemented.ts b/apps/desktop/src/main/ipc/local-gguf-not-implemented.ts
new file mode 100644
index 0000000..2e09169
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-not-implemented.ts
@@ -0,0 +1,12 @@
+/**
+ * Shared thrower for Phase 1 localGguf IPC stubs.
+ *
+ * Every localGguf.* channel is registered in Phase 1 so the contract surface
+ * exists, but the real logic lands in a later phase. Until then the handler
+ * throws this — callers fail fast with a clear, greppable message instead of
+ * silently receiving undefined. Returns `never`, so it satisfies any
+ * handler's annotated return type.
+ */
+export function notImplemented(channel: string): never {
+  throw new Error(`localGguf channel "${channel}" is not implemented yet (Phase 1 stub)`);
+}
diff --git a/apps/desktop/src/main/ipc/local-gguf-runtime-handlers.test.ts b/apps/desktop/src/main/ipc/local-gguf-runtime-handlers.test.ts
new file mode 100644
index 0000000..dabfde9
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-runtime-handlers.test.ts
@@ -0,0 +1,42 @@
+import type { IpcMain } from 'electron';
+import { describe, expect, it } from 'vitest';
+
+import {
+  LOCAL_GGUF_RUNTIME_CHANNELS,
+  registerLocalGgufRuntimeHandlers,
+} from './local-gguf-runtime-handlers.js';
+
+function makeFakeIpc() {
+  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
+  const ipc = {
+    handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
+      handlers.set(channel, fn);
+    },
+  } as unknown as IpcMain;
+  return {
+    ipc,
+    channels: () => [...handlers.keys()],
+    invoke: (channel: string, ...args: unknown[]) => {
+      const fn = handlers.get(channel);
+      if (!fn) throw new Error(`no handler for ${channel}`);
+      return fn({}, ...args);
+    },
+  };
+}
+
+describe('localGguf runtime + pool IPC handlers (Phase 1 stubs)', () => {
+  it('registers every runtime and pool channel', () => {
+    const f = makeFakeIpc();
+    registerLocalGgufRuntimeHandlers(f.ipc);
+    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_RUNTIME_CHANNELS].sort());
+  });
+
+  it.each([...LOCAL_GGUF_RUNTIME_CHANNELS])(
+    'handler %s throws not-implemented',
+    async (channel) => {
+      const f = makeFakeIpc();
+      registerLocalGgufRuntimeHandlers(f.ipc);
+      await expect(f.invoke(channel)).rejects.toThrow(/not implemented/i);
+    },
+  );
+});
diff --git a/apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts b/apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts
new file mode 100644
index 0000000..fa87109
--- /dev/null
+++ b/apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts
@@ -0,0 +1,71 @@
+/**
+ * IPC handlers for the localGguf.runtime.* and localGguf.pool.* channels.
+ *
+ * Phase 1: typed not-implemented stubs. Phase 2 (runtime + pool) replaces
+ * them with real implementations against the RuntimeService (GPU probe,
+ * backend selection, binaries version) and PoolService (LRU load/unload).
+ */
+
+import type { GpuInventory, LocalGgufRuntimeSettings } from '@team-x/shared-types';
+import type { IpcMain } from 'electron';
+
+import { notImplemented } from './local-gguf-not-implemented.js';
+
+/** A loaded model's runtime handle, surfaced by the pool channels. */
+export interface LoadedModelHandle {
+  modelId: string;
+  baseUrl: string;
+  pid: number;
+}
+
+export const LOCAL_GGUF_RUNTIME_CHANNELS = [
+  'localGguf.runtime.gpuInventory',
+  'localGguf.runtime.reprobeGpu',
+  'localGguf.runtime.settings',
+  'localGguf.runtime.setSettings',
+  'localGguf.runtime.binariesVersion',
+  'localGguf.pool.status',
+  'localGguf.pool.load',
+  'localGguf.pool.unload',
+  'localGguf.pool.setMaxConcurrent',
+] as const;
+
+export function registerLocalGgufRuntimeHandlers(ipc: IpcMain): void {
+  ipc.handle(
+    'localGguf.runtime.gpuInventory',
+    async (): Promise<GpuInventory> => notImplemented('localGguf.runtime.gpuInventory'),
+  );
+  ipc.handle(
+    'localGguf.runtime.reprobeGpu',
+    async (): Promise<GpuInventory> => notImplemented('localGguf.runtime.reprobeGpu'),
+  );
+  ipc.handle(
+    'localGguf.runtime.settings',
+    async (): Promise<LocalGgufRuntimeSettings> => notImplemented('localGguf.runtime.settings'),
+  );
+  ipc.handle(
+    'localGguf.runtime.setSettings',
+    async (): Promise<LocalGgufRuntimeSettings> => notImplemented('localGguf.runtime.setSettings'),
+  );
+  ipc.handle(
+    'localGguf.runtime.binariesVersion',
+    async (): Promise<string> => notImplemented('localGguf.runtime.binariesVersion'),
+  );
+  ipc.handle(
+    'localGguf.pool.status',
+    async (): Promise<{ loaded: LoadedModelHandle[]; maxConcurrent: number }> =>
+      notImplemented('localGguf.pool.status'),
+  );
+  ipc.handle(
+    'localGguf.pool.load',
+    async (): Promise<LoadedModelHandle> => notImplemented('localGguf.pool.load'),
+  );
+  ipc.handle(
+    'localGguf.pool.unload',
+    async (): Promise<void> => notImplemented('localGguf.pool.unload'),
+  );
+  ipc.handle(
+    'localGguf.pool.setMaxConcurrent',
+    async (): Promise<void> => notImplemented('localGguf.pool.setMaxConcurrent'),
+  );
+}
diff --git a/apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts b/apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts
new file mode 100644
index 0000000..6bd1edd
--- /dev/null
+++ b/apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts
@@ -0,0 +1,122 @@
+/**
+ * Typed accessor for the `localGguf.*` settings namespace, layered on top of
+ * the app's existing key-value settings store (v3.3.0 local GGUF support,
+ * spec § 7 runtime settings).
+ *
+ * The accessor depends only on a tiny `LocalGgufSettingsStore` interface
+ * (get/set by string key), not on the concrete settings repo. Phase 2 wires
+ * the real store by adapting the settings repo's getRaw/set with JSON
+ * (de)serialization. Phase 1 unit-tests it against an in-memory map.
+ *
+ * Each field of LocalGgufRuntimeSettings persists under a `localGguf.<key>`
+ * entry; reads overlay persisted values on DEFAULT_LOCAL_GGUF_SETTINGS so a
+ * partially-written store still returns a complete, valid settings object.
+ */
+
+import type { GpuBackend, LocalGgufRuntimeSettings } from '@team-x/shared-types';
+
+export interface LocalGgufSettingsStore {
+  get<T>(key: string): T | undefined;
+  set<T>(key: string, value: T): void;
+}
+
+export interface LocalGgufSettingsAccessor {
+  get(): LocalGgufRuntimeSettings;
+  updateBackend(backend: GpuBackend, autoDetected: boolean): void;
+  recordFallback(backend: GpuBackend, reason: string): void;
+  setMaxConcurrent(n: number): void;
+  setDefaultLibraryFolder(path: string | null): void;
+  setEmbeddingModelId(id: string | null): void;
+  setHfTokenKeyRef(ref: string | null): void;
+  setLlamaBinariesVersion(version: string): void;
+}
+
+export const DEFAULT_LOCAL_GGUF_SETTINGS: LocalGgufRuntimeSettings = {
+  activeBackend: 'cpu',
+  activeBackendIsAutoDetected: true,
+  autoFallbackReason: null,
+  maxConcurrentLocalModels: 1,
+  defaultLibraryFolder: null,
+  embeddingModelId: null,
+  hfTokenKeyRef: null,
+  llamaBinariesVersion: 'unknown',
+};
+
+const KEYS = {
+  activeBackend: 'localGguf.activeBackend',
+  activeBackendIsAutoDetected: 'localGguf.activeBackendIsAutoDetected',
+  autoFallbackReason: 'localGguf.autoFallbackReason',
+  maxConcurrentLocalModels: 'localGguf.maxConcurrentLocalModels',
+  defaultLibraryFolder: 'localGguf.defaultLibraryFolder',
+  embeddingModelId: 'localGguf.embeddingModelId',
+  hfTokenKeyRef: 'localGguf.hfTokenKeyRef',
+  llamaBinariesVersion: 'localGguf.llamaBinariesVersion',
+} as const;
+
+export function createLocalGgufSettingsAccessor(
+  store: LocalGgufSettingsStore,
+): LocalGgufSettingsAccessor {
+  return {
+    get(): LocalGgufRuntimeSettings {
+      return {
+        activeBackend:
+          store.get<GpuBackend>(KEYS.activeBackend) ?? DEFAULT_LOCAL_GGUF_SETTINGS.activeBackend,
+        activeBackendIsAutoDetected:
+          store.get<boolean>(KEYS.activeBackendIsAutoDetected) ??
+          DEFAULT_LOCAL_GGUF_SETTINGS.activeBackendIsAutoDetected,
+        autoFallbackReason:
+          store.get<string | null>(KEYS.autoFallbackReason) ??
+          DEFAULT_LOCAL_GGUF_SETTINGS.autoFallbackReason,
+        maxConcurrentLocalModels:
+          store.get<number>(KEYS.maxConcurrentLocalModels) ??
+          DEFAULT_LOCAL_GGUF_SETTINGS.maxConcurrentLocalModels,
+        defaultLibraryFolder:
+          store.get<string | null>(KEYS.defaultLibraryFolder) ??
+          DEFAULT_LOCAL_GGUF_SETTINGS.defaultLibraryFolder,
+        embeddingModelId:
+          store.get<string | null>(KEYS.embeddingModelId) ??
+          DEFAULT_LOCAL_GGUF_SETTINGS.embeddingModelId,
+        hfTokenKeyRef:
+          store.get<string | null>(KEYS.hfTokenKeyRef) ?? DEFAULT_LOCAL_GGUF_SETTINGS.hfTokenKeyRef,
+        llamaBinariesVersion:
+          store.get<string>(KEYS.llamaBinariesVersion) ??
+          DEFAULT_LOCAL_GGUF_SETTINGS.llamaBinariesVersion,
+      };
+    },
+
+    /** Set the active backend + whether it was auto-detected; clears any prior fallback reason. */
+    updateBackend(backend: GpuBackend, autoDetected: boolean): void {
+      store.set(KEYS.activeBackend, backend);
+      store.set(KEYS.activeBackendIsAutoDetected, autoDetected);
+      store.set<string | null>(KEYS.autoFallbackReason, null);
+    },
+
+    /** Record a forced fallback to another backend, capturing the reason. */
+    recordFallback(backend: GpuBackend, reason: string): void {
+      store.set(KEYS.activeBackend, backend);
+      store.set(KEYS.activeBackendIsAutoDetected, false);
+      store.set(KEYS.autoFallbackReason, reason);
+    },
+
+    setMaxConcurrent(n: number): void {
+      if (n < 1) throw new Error('maxConcurrentLocalModels must be at least 1');
+      store.set(KEYS.maxConcurrentLocalModels, Math.floor(n));
+    },
+
+    setDefaultLibraryFolder(path: string | null): void {
+      store.set(KEYS.defaultLibraryFolder, path);
+    },
+
+    setEmbeddingModelId(id: string | null): void {
+      store.set(KEYS.embeddingModelId, id);
+    },
+
+    setHfTokenKeyRef(ref: string | null): void {
+      store.set(KEYS.hfTokenKeyRef, ref);
+    },
+
+    setLlamaBinariesVersion(version: string): void {
+      store.set(KEYS.llamaBinariesVersion, version);
+    },
+  };
+}
diff --git a/apps/desktop/src/preload/api.ts b/apps/desktop/src/preload/api.ts
index cd0f544..5ed96c5 100644
--- a/apps/desktop/src/preload/api.ts
+++ b/apps/desktop/src/preload/api.ts
@@ -228,160 +228,165 @@ import type {
   SettingsSetCopilotWeightsResponse,
   SettingsSetEnhancedAiConfigRequest,
   SettingsSetExtensionsRequest,
   SettingsSetMemoryRequest,
   SettingsSetPlannerRequest,
   SettingsSetPrivacyRequest,
   SettingsSetProactiveRequest,
   SettingsSetRagConfigRequest,
   SettingsSetRuntimeRequest,
   SkillAssignment,
   StopChatRequest,
   StopChatResponse,
   TeamXApi,
   TelemetryCompanyStatsRequest,
   TelemetryCompanyStatsResponse,
   TelemetryCostBreakdownRequest,
   TelemetryCostBreakdownRow,
   TelemetryDailyUsageRequest,
   TelemetryDailyUsageRow,
   TelemetryEmployeeStatsRequest,
   TelemetryEmployeeStatsRow,
   TelemetryRecentRunRow,
   TelemetryRecentRunsRequest,
   TestMcpConnectionRequest,
   TestMcpConnectionResponse,
   TestProviderConnectionResponse,
   Thread,
   ThreadDigest,
   Ticket,
   TicketAttachment,
   TicketDetail,
   UnlinkCloudWorkspaceRequest,
   UnsubscribeFn,
   UpdateBudgetPolicyRequest,
   UpdateCheckResult,
   UpdateGoalRequest,
   UpdateInstallResult,
   UpdateProjectRequest,
   UpdateProviderRequest,
   UpdateRoutineRequest,
   UpdateRuntimeProfileRequest,
   UpdateScheduleItemRequest,
   UpdateTicketRequest,
   ValidateRuntimeProfileRequest,
   VaultDownloadResponse,
   VaultFile,
   VaultSearchResult,
   VaultStatsResponse,
   VaultUploadRequest,
   VaultUploadResponse,
   VaultVerifyResponse,
 } from '@team-x/shared-types';
 
 /**
  * Minimal structural subset of Electron's `IpcRenderer` that the
  * preload API factory actually uses. Kept intentionally narrow:
  *
  *   - `invoke` for the three request/response channels,
  *   - `on` to attach a dashboard-event listener,
  *   - `removeListener` to detach it inside the unsubscribe function
  *     we hand back to the renderer.
  *
  * The real `ipcRenderer` singleton from `'electron'` has a much
  * wider surface (`send`, `sendSync`, `postMessage`, `once`,
  * `removeAllListeners`, …). None of those are used by the Team-X
  * bridge; omitting them here makes the factory's test doubles
  * trivial to write.
  */
 export interface IpcRendererLike {
   invoke(channel: string, ...args: unknown[]): Promise<unknown>;
   on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
   removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
 }
 
 /**
  * Channel name constants. Extracted to their own block so a grep for
  * a channel name hits exactly ONE location and so the main process's
  * register layer in `main/ipc/register.ts` can be diff-matched against
  * this file when the IPC contract changes. Mirrors the keys of
  * `IpcContract` in `@team-x/shared-types/ipc.ts`.
+ *
+ * Exception: the `localGguf.*` channels are registered by the dedicated
+ * `registerLocalGguf*Handlers` functions wired in `main/index.ts`, not by
+ * `register.ts`. Diff-match those against the `LOCAL_GGUF_*_CHANNELS`
+ * tuples in `main/ipc/local-gguf-*-handlers.ts` instead.
  */
 const CHANNELS = {
   systemSelectDirectory: 'system.selectDirectory',
   companiesList: 'companies.list',
   companiesExportPackage: 'companies.exportPackage',
   companiesPreviewImportPackage: 'companies.previewImportPackage',
   companiesImportPackage: 'companies.importPackage',
   companiesListTemplates: 'companies.listTemplates',
   companiesInstallTemplate: 'companies.installTemplate',
   companiesArchive: 'companies.archive',
   companiesCreate: 'companies.create',
   // Multi-company CRUD write-side (Phase 5.6 M-C step e; audit rows 10.13 + 10.15)
   companiesUpdate: 'companies.update',
   companiesDelete: 'companies.delete',
   employeesList: 'employees.list',
   operatorsList: 'operators.list',
   operatorsReadiness: 'operators.readiness',
   cloudGetWorkspaceLink: 'cloud.getWorkspaceLink',
   cloudLinkWorkspace: 'cloud.linkWorkspace',
   cloudUnlinkWorkspace: 'cloud.unlinkWorkspace',
   cloudReconnectWorkspace: 'cloud.reconnectWorkspace',
   operatorsListInvites: 'operators.listInvites',
   operatorsCreateInvite: 'operators.createInvite',
   operatorsRevokeInvite: 'operators.revokeInvite',
   operatorsAcceptInvite: 'operators.acceptInvite',
   runtimeProfilesList: 'runtimeProfiles.list',
   runtimeProfilesCreate: 'runtimeProfiles.create',
   runtimeProfilesUpdate: 'runtimeProfiles.update',
   runtimeProfilesDelete: 'runtimeProfiles.delete',
   runtimeProfilesBindEmployee: 'runtimeProfiles.bindEmployee',
   runtimeProfilesValidate: 'runtimeProfiles.validate',
   runtimeOperationsSnapshot: 'runtimeOperations.snapshot',
   autonomyDoctorRun: 'autonomyDoctor.run',
   autonomyBenchmarkRun: 'autonomyBenchmark.run',
   agentImprovementList: 'agentImprovement.list',
   agentImprovementRun: 'agentImprovement.run',
   routinesList: 'routines.list',
   routinesCreate: 'routines.create',
   routinesUpdate: 'routines.update',
   routinesDelete: 'routines.delete',
   routinesListRuns: 'routines.listRuns',
   routinesRunNow: 'routines.runNow',
   budgetsListPolicies: 'budgets.listPolicies',
   budgetsCreatePolicy: 'budgets.createPolicy',
   budgetsUpdatePolicy: 'budgets.updatePolicy',
   budgetsDeletePolicy: 'budgets.deletePolicy',
   budgetsListLedger: 'budgets.listLedger',
   budgetsGetOverview: 'budgets.getOverview',
   budgetsListApprovals: 'budgets.listApprovals',
   approvalsList: 'approvals.list',
   approvalsReview: 'approvals.review',
   artifactsList: 'artifacts.list',
   memoryGetThreadDigest: 'memory.getThreadDigest',
   memoryListRunCheckpoints: 'memory.listRunCheckpoints',
   memoryPackThreadContext: 'memory.packThreadContext',
   scheduleList: 'schedule.list',
   scheduleCreate: 'schedule.create',
   scheduleUpdate: 'schedule.update',
   scheduleComplete: 'schedule.complete',
   scheduleDelete: 'schedule.delete',
   employeesCreate: 'employees.create',
   employeesFire: 'employees.fire',
   employeesUpdate: 'employees.update',
   // Org chart write-side (Phase 2 — M9; restored Phase 5.6 M-C step d)
   employeesPromote: 'employees.promote',
   employeesSetManager: 'employees.setManager',
   // Org chart (Phase 2 — M9; restored Phase 5.6 M-C step c)
   orgchartGet: 'orgchart.get',
   chatSend: 'chat.send',
   chatList: 'chat.list',
   chatStop: 'chat.stop',
   chatResolveThread: 'chat.resolveThread',
   chatListThreads: 'chat.listThreads',
   eventsDashboard: 'events.dashboard',
   eventsList: 'events.list',
   // MCP management (Phase 2 — M10)
   mcpList: 'mcp.list',
   mcpListTemplates: 'mcp.listTemplates',
   mcpToggle: 'mcp.toggle',
   mcpAddServer: 'mcp.addServer',
@@ -442,160 +447,201 @@ const CHANNELS = {
   settingsSetRagConfig: 'settings.setRagConfig',
   // Agentic loop (Phase 5 — M31)
   settingsGetAgentic: 'settings.getAgentic',
   settingsSetAgentic: 'settings.setAgentic',
   // Task planner (Phase 5 — M32)
   settingsGetPlanner: 'settings.getPlanner',
   settingsSetPlanner: 'settings.setPlanner',
   settingsGetCopilot: 'settings.getCopilot',
   settingsSetCopilot: 'settings.setCopilot',
   settingsGetCopilotWeights: 'settings.getCopilotWeights',
   settingsSetCopilotWeights: 'settings.setCopilotWeights',
   settingsGetProactive: 'settings.getProactive',
   settingsSetProactive: 'settings.setProactive',
   settingsGetEnhancedAiConfig: 'settings.getEnhancedAiConfig',
   settingsSetEnhancedAiConfig: 'settings.setEnhancedAiConfig',
   // Provider management (Phase 3 — M18)
   providersList: 'providers.list',
   providersAdd: 'providers.add',
   providersUpdate: 'providers.update',
   providersRemove: 'providers.remove',
   providersTestConnection: 'providers.testConnection',
   providersListModels: 'providers.listModels',
   // Vault management (Phase 4 — M21)
   vaultUpload: 'vault.upload',
   vaultDownload: 'vault.download',
   vaultList: 'vault.list',
   vaultSearch: 'vault.search',
   vaultDelete: 'vault.delete',
   vaultVerify: 'vault.verify',
   vaultStats: 'vault.stats',
   // Ticket management (Phase 2 — M12)
   ticketsCreate: 'tickets.create',
   ticketsUpdate: 'tickets.update',
   ticketsAssign: 'tickets.assign',
   ticketsAddParticipant: 'tickets.addParticipant',
   ticketsRemoveParticipant: 'tickets.removeParticipant',
   ticketsClose: 'tickets.close',
   ticketsReopen: 'tickets.reopen',
   ticketsAddComment: 'tickets.addComment',
   ticketsList: 'tickets.list',
   ticketsGet: 'tickets.get',
   // Backup/restore (Phase 4 — M23)
   backupCreate: 'backup.create',
   backupRestore: 'backup.restore',
   backupList: 'backup.list',
   backupDelete: 'backup.delete',
   // Ticket attachments (Phase 4 — M22)
   ticketsAttachFile: 'tickets.attachFile',
   ticketsDetachFile: 'tickets.detachFile',
   ticketsListAttachments: 'tickets.listAttachments',
   // Audit log (Phase 4 — M24)
   auditList: 'audit.list',
   auditStats: 'audit.stats',
   auditExport: 'audit.export',
   // Updater (Phase 4 — M25)
   updaterCheck: 'updater.check',
   updaterInstall: 'updater.install',
   // RAG management (Phase 5 — M29)
   ragStats: 'rag.stats',
   ragRebuildAll: 'rag.rebuildAll',
   ragDeleteForCompany: 'rag.deleteForCompany',
   // Command palette (Phase 5 — M30)
   commandParse: 'command.parse',
   commandExecute: 'command.execute',
   commandHistory: 'command.history',
   commandSuggest: 'command.suggest',
   // Agentic-loop cancellation (Phase 5 — M31 T6)
   commandStop: 'command.stop',
   // Agentic-loop snapshot for palette backfill-on-mount (Phase 5 — M32 T0 / F1)
   commandGetRunSnapshot: 'command.getRunSnapshot',
   // Copilot service (Phase 5 — M33 T5)
   copilotInsights: 'copilot.insights',
   copilotDismiss: 'copilot.dismiss',
   copilotAsk: 'copilot.ask',
   copilotConfigure: 'copilot.configure',
   copilotExport: 'copilot.export',
   proactiveSetEnabled: 'proactive.setEnabled',
   proactiveDecomposeGoal: 'proactive.decomposeGoal',
   proactiveScanForWork: 'proactive.scanForWork',
   proactiveGetState: 'proactive.getState',
+  // Local & Networked GGUF Support (v3.3.0 — Phase 1 contract surface).
+  // library.* (Phase 3)
+  localGgufLibraryList: 'localGguf.library.list',
+  localGgufLibraryGet: 'localGguf.library.get',
+  localGgufLibraryAddFile: 'localGguf.library.addFile',
+  localGgufLibraryAddFolder: 'localGguf.library.addFolder',
+  localGgufLibraryRemoveModel: 'localGguf.library.removeModel',
+  localGgufLibraryRemoveFolder: 'localGguf.library.removeFolder',
+  localGgufLibraryScanFolder: 'localGguf.library.scanFolder',
+  localGgufLibrarySetSystemPrompt: 'localGguf.library.setSystemPrompt',
+  localGgufLibrarySetChatTemplate: 'localGguf.library.setChatTemplate',
+  localGgufLibrarySetAdvancedParams: 'localGguf.library.setAdvancedParams',
+  localGgufLibraryResetAdvanced: 'localGguf.library.resetAdvanced',
+  localGgufLibraryListBySourceType: 'localGguf.library.listBySourceType',
+  // runtime.* + pool.* (Phase 2)
+  localGgufRuntimeGpuInventory: 'localGguf.runtime.gpuInventory',
+  localGgufRuntimeReprobeGpu: 'localGguf.runtime.reprobeGpu',
+  localGgufRuntimeSettings: 'localGguf.runtime.settings',
+  localGgufRuntimeSetSettings: 'localGguf.runtime.setSettings',
+  localGgufRuntimeBinariesVersion: 'localGguf.runtime.binariesVersion',
+  localGgufPoolStatus: 'localGguf.pool.status',
+  localGgufPoolLoad: 'localGguf.pool.load',
+  localGgufPoolUnload: 'localGguf.pool.unload',
+  localGgufPoolSetMaxConcurrent: 'localGguf.pool.setMaxConcurrent',
+  // endpoint.* (Phase 5)
+  localGgufEndpointList: 'localGguf.endpoint.list',
+  localGgufEndpointAdd: 'localGguf.endpoint.add',
+  localGgufEndpointRemove: 'localGguf.endpoint.remove',
+  localGgufEndpointTest: 'localGguf.endpoint.test',
+  localGgufEndpointUpdate: 'localGguf.endpoint.update',
+  // hf.* (Phase 7)
+  localGgufHfSearch: 'localGguf.hf.search',
+  localGgufHfModelCard: 'localGguf.hf.modelCard',
+  localGgufHfStartDownload: 'localGguf.hf.startDownload',
+  localGgufHfPauseDownload: 'localGguf.hf.pauseDownload',
+  localGgufHfResumeDownload: 'localGguf.hf.resumeDownload',
+  localGgufHfCancelDownload: 'localGguf.hf.cancelDownload',
+  localGgufHfActiveDownloads: 'localGguf.hf.activeDownloads',
+  // benchmark.* (Phase 10)
+  localGgufBenchmarkRun: 'localGguf.benchmark.run',
+  localGgufBenchmarkHistory: 'localGguf.benchmark.history',
 } as const;
 
 function telemetryCompanyStatsRequest(
   req: string | TelemetryCompanyStatsRequest,
 ): TelemetryCompanyStatsRequest {
   return typeof req === 'string' ? { companyId: req } : req;
 }
 
 function telemetryEmployeeStatsRequest(
   req: string | TelemetryEmployeeStatsRequest,
 ): TelemetryEmployeeStatsRequest {
   return typeof req === 'string' ? { companyId: req } : req;
 }
 
 /**
  * Build the `TeamXApi` object the preload hands to `contextBridge`.
  * Captures the supplied `ipc` handle in a closure so each returned
  * method routes through the same transport.
  */
 export function buildTeamXApi(ipc: IpcRendererLike): TeamXApi {
   return {
     system: {
       selectDirectory: () =>
         ipc.invoke(CHANNELS.systemSelectDirectory) as Promise<SelectDirectoryResponse>,
     },
     companies: {
       list: () => ipc.invoke(CHANNELS.companiesList) as ReturnType<TeamXApi['companies']['list']>,
       exportPackage: (req: ExportCompanyPackageRequest) =>
         ipc.invoke(CHANNELS.companiesExportPackage, req) as Promise<ExportCompanyPackageResponse>,
       previewImportPackage: (req: PreviewCompanyPackageImportRequest) =>
         ipc.invoke(
           CHANNELS.companiesPreviewImportPackage,
           req,
         ) as Promise<PreviewCompanyPackageImportResponse>,
       importPackage: (req: ImportCompanyPackageRequest) =>
         ipc.invoke(CHANNELS.companiesImportPackage, req) as Promise<ImportCompanyPackageResponse>,
       listTemplates: (req?: ListCompanyTemplatesRequest) =>
         ipc.invoke(
           CHANNELS.companiesListTemplates,
           req ?? {},
         ) as Promise<ListCompanyTemplatesResponse>,
       installTemplate: (req: InstallCompanyTemplateRequest) =>
         ipc.invoke(
           CHANNELS.companiesInstallTemplate,
           req,
         ) as Promise<InstallCompanyTemplateResponse>,
       create: (req: CompaniesCreateRequest) =>
         ipc.invoke(CHANNELS.companiesCreate, req) as Promise<CompaniesCreateResponse>,
       archive: (companyId: string) =>
         ipc.invoke(CHANNELS.companiesArchive, { companyId }) as ReturnType<
           TeamXApi['companies']['archive']
         >,
       update: (req: CompaniesUpdateRequest) =>
         ipc.invoke(CHANNELS.companiesUpdate, req) as Promise<void>,
       delete: (req: CompaniesDeleteRequest) =>
         ipc.invoke(CHANNELS.companiesDelete, req) as Promise<void>,
     },
     operators: {
       list: (companyId: string) =>
         ipc.invoke(CHANNELS.operatorsList, { companyId }) as Promise<OperatorAccessEntry[]>,
       readiness: (companyId: string) =>
         ipc.invoke(CHANNELS.operatorsReadiness, {
           companyId,
         } satisfies GetOperatorSharingReadinessRequest) as Promise<CompanySharingReadinessSummary>,
       listInvites: (companyId: string) =>
         ipc.invoke(CHANNELS.operatorsListInvites, { companyId }) as Promise<OperatorInvite[]>,
       createInvite: (req: CreateOperatorInviteRequest) =>
         ipc.invoke(CHANNELS.operatorsCreateInvite, req) as Promise<CreateOperatorInviteResponse>,
       revokeInvite: (req: RevokeOperatorInviteRequest) =>
         ipc.invoke(CHANNELS.operatorsRevokeInvite, req) as Promise<OperatorInvite>,
       acceptInvite: (req: AcceptOperatorInviteRequest) =>
         ipc.invoke(CHANNELS.operatorsAcceptInvite, req) as Promise<AcceptOperatorInviteResponse>,
     },
     cloud: {
       getWorkspaceLink: (companyId: string) =>
         ipc.invoke(CHANNELS.cloudGetWorkspaceLink, {
           companyId,
         } satisfies GetCloudWorkspaceLinkRequest) as Promise<CompanyCloudLinkStatus>,
       linkWorkspace: (req: LinkCloudWorkspaceRequest) =>
         ipc.invoke(CHANNELS.cloudLinkWorkspace, req) as Promise<CompanyCloudLinkStatus>,
@@ -971,91 +1017,261 @@ export function buildTeamXApi(ipc: IpcRendererLike): TeamXApi {
       stats: (companyId: string) =>
         ipc.invoke(CHANNELS.auditStats, { companyId }) as Promise<AuditStats>,
       export: (req: AuditExportRequest) =>
         ipc.invoke(CHANNELS.auditExport, req) as Promise<AuditExportResponse>,
     },
     updater: {
       check: () => ipc.invoke(CHANNELS.updaterCheck) as Promise<UpdateCheckResult>,
       install: () => ipc.invoke(CHANNELS.updaterInstall) as Promise<UpdateInstallResult>,
     },
     rag: {
       stats: (companyId: string) =>
         ipc.invoke(CHANNELS.ragStats, companyId) as Promise<RagStatsResponse>,
       rebuildAll: (companyId: string) =>
         ipc.invoke(CHANNELS.ragRebuildAll, companyId) as Promise<RagRebuildAllResponse>,
       deleteForCompany: (companyId: string) =>
         ipc.invoke(CHANNELS.ragDeleteForCompany, companyId) as Promise<RagDeleteForCompanyResponse>,
     },
     command: {
       parse: (req: CommandParseRequest) =>
         ipc.invoke(CHANNELS.commandParse, req) as Promise<IpcParseResult>,
       execute: (req: IpcExecuteRequest) =>
         ipc.invoke(CHANNELS.commandExecute, req) as Promise<IpcExecuteResult>,
       history: (req?: CommandHistoryRequest) =>
         ipc.invoke(CHANNELS.commandHistory, req ?? {}) as Promise<IpcCommandHistoryEntry[]>,
       suggest: (req: CommandSuggestRequest) =>
         ipc.invoke(CHANNELS.commandSuggest, req) as Promise<IpcSuggestItem[]>,
       stop: (req: CommandStopRequest) =>
         ipc.invoke(CHANNELS.commandStop, req) as Promise<CommandStopResult>,
       getRunSnapshot: (runId: string) =>
         ipc.invoke(CHANNELS.commandGetRunSnapshot, { runId }) as Promise<AgenticRunSnapshot | null>,
     },
     copilot: {
       insights: (args: CopilotInsightListArgs) =>
         ipc.invoke(CHANNELS.copilotInsights, args) as Promise<CopilotInsightListResult>,
       dismiss: (args: CopilotDismissArgs) =>
         ipc.invoke(CHANNELS.copilotDismiss, args) as Promise<CopilotDismissResult>,
       ask: (args: CopilotAskArgs) =>
         ipc.invoke(CHANNELS.copilotAsk, args) as Promise<CopilotAskResult>,
       configure: (args: CopilotConfigureArgs) =>
         ipc.invoke(CHANNELS.copilotConfigure, args) as Promise<CopilotConfigureResult>,
       export: (args: CopilotExportRequest) =>
         ipc.invoke(CHANNELS.copilotExport, args) as Promise<CopilotExportResponse>,
     },
     tickets: {
       create: (req: CreateTicketRequest) =>
         ipc.invoke(CHANNELS.ticketsCreate, req) as Promise<CreateTicketResponse>,
       update: (req: UpdateTicketRequest) =>
         ipc.invoke(CHANNELS.ticketsUpdate, req) as Promise<void>,
       assign: (req: { ticketId: string; assigneeId: string }) =>
         ipc.invoke(CHANNELS.ticketsAssign, req) as Promise<void>,
       addParticipant: (req: AddTicketParticipantRequest) =>
         ipc.invoke(CHANNELS.ticketsAddParticipant, req) as Promise<void>,
       removeParticipant: (req: RemoveTicketParticipantRequest) =>
         ipc.invoke(CHANNELS.ticketsRemoveParticipant, req) as Promise<void>,
       close: (ticketId: string) => ipc.invoke(CHANNELS.ticketsClose, { ticketId }) as Promise<void>,
       reopen: (ticketId: string) =>
         ipc.invoke(CHANNELS.ticketsReopen, { ticketId }) as Promise<void>,
       addComment: (req: AddTicketCommentRequest) =>
         ipc.invoke(CHANNELS.ticketsAddComment, req) as Promise<AddTicketCommentResponse>,
       list: (companyId: string) =>
         ipc.invoke(CHANNELS.ticketsList, { companyId }) as Promise<Ticket[]>,
       get: (ticketId: string) =>
         ipc.invoke(CHANNELS.ticketsGet, { ticketId }) as Promise<TicketDetail>,
       attachFile: (req: AttachFileRequest) =>
         ipc.invoke(CHANNELS.ticketsAttachFile, req) as Promise<AttachFileResponse>,
       detachFile: (req: DetachFileRequest) =>
         ipc.invoke(CHANNELS.ticketsDetachFile, req) as Promise<void>,
       listAttachments: (ticketId: string) =>
         ipc.invoke(CHANNELS.ticketsListAttachments, { ticketId }) as Promise<TicketAttachment[]>,
     },
     proactive: {
       setEnabled: (req: ProactiveSetEnabledRequest) =>
         ipc.invoke(CHANNELS.proactiveSetEnabled, req) as Promise<void>,
       decomposeGoal: (req: ProactiveDecomposeGoalRequest) =>
         ipc.invoke(CHANNELS.proactiveDecomposeGoal, req) as Promise<ProactiveDecomposeGoalResponse>,
       scanForWork: (req: ProactiveScanForWorkRequest) =>
         ipc.invoke(CHANNELS.proactiveScanForWork, req) as Promise<ProactiveScanForWorkResponse>,
       getState: (req: ProactiveGetStateRequest) =>
         ipc.invoke(CHANNELS.proactiveGetState, req) as Promise<ProactiveGetStateResponse>,
     },
+    // Local & Networked GGUF Support (v3.3.0). Every method routes through
+    // the captured `ipc` to a `localGguf.*` channel whose handler is a
+    // Phase 1 not-implemented stub; the invoke rejects until the owning
+    // phase lands the real handler. Return casts pin each call to the
+    // `LocalGgufApi` contract in @team-x/shared-types via `ReturnType<…>`
+    // so no domain types need importing into this file.
+    localGguf: {
+      library: {
+        list: () =>
+          ipc.invoke(CHANNELS.localGgufLibraryList) as ReturnType<
+            TeamXApi['localGguf']['library']['list']
+          >,
+        get: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryGet, id) as ReturnType<
+            TeamXApi['localGguf']['library']['get']
+          >,
+        addFile: (path: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryAddFile, path) as ReturnType<
+            TeamXApi['localGguf']['library']['addFile']
+          >,
+        addFolder: (path: string, recursive: boolean) =>
+          ipc.invoke(CHANNELS.localGgufLibraryAddFolder, path, recursive) as ReturnType<
+            TeamXApi['localGguf']['library']['addFolder']
+          >,
+        removeModel: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryRemoveModel, id) as ReturnType<
+            TeamXApi['localGguf']['library']['removeModel']
+          >,
+        removeFolder: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryRemoveFolder, id) as ReturnType<
+            TeamXApi['localGguf']['library']['removeFolder']
+          >,
+        scanFolder: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryScanFolder, id) as ReturnType<
+            TeamXApi['localGguf']['library']['scanFolder']
+          >,
+        setSystemPrompt: (id: string, prompt: string | null) =>
+          ipc.invoke(CHANNELS.localGgufLibrarySetSystemPrompt, id, prompt) as ReturnType<
+            TeamXApi['localGguf']['library']['setSystemPrompt']
+          >,
+        setChatTemplate: (id: string, template: string | null) =>
+          ipc.invoke(CHANNELS.localGgufLibrarySetChatTemplate, id, template) as ReturnType<
+            TeamXApi['localGguf']['library']['setChatTemplate']
+          >,
+        setAdvancedParams: (
+          id: string,
+          params: Parameters<TeamXApi['localGguf']['library']['setAdvancedParams']>[1],
+        ) =>
+          ipc.invoke(CHANNELS.localGgufLibrarySetAdvancedParams, id, params) as ReturnType<
+            TeamXApi['localGguf']['library']['setAdvancedParams']
+          >,
+        resetAdvanced: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryResetAdvanced, id) as ReturnType<
+            TeamXApi['localGguf']['library']['resetAdvanced']
+          >,
+        listBySourceType: (
+          sourceType: Parameters<TeamXApi['localGguf']['library']['listBySourceType']>[0],
+        ) =>
+          ipc.invoke(CHANNELS.localGgufLibraryListBySourceType, sourceType) as ReturnType<
+            TeamXApi['localGguf']['library']['listBySourceType']
+          >,
+      },
+      runtime: {
+        gpuInventory: () =>
+          ipc.invoke(CHANNELS.localGgufRuntimeGpuInventory) as ReturnType<
+            TeamXApi['localGguf']['runtime']['gpuInventory']
+          >,
+        reprobeGpu: () =>
+          ipc.invoke(CHANNELS.localGgufRuntimeReprobeGpu) as ReturnType<
+            TeamXApi['localGguf']['runtime']['reprobeGpu']
+          >,
+        settings: () =>
+          ipc.invoke(CHANNELS.localGgufRuntimeSettings) as ReturnType<
+            TeamXApi['localGguf']['runtime']['settings']
+          >,
+        setSettings: (partial: Parameters<TeamXApi['localGguf']['runtime']['setSettings']>[0]) =>
+          ipc.invoke(CHANNELS.localGgufRuntimeSetSettings, partial) as ReturnType<
+            TeamXApi['localGguf']['runtime']['setSettings']
+          >,
+        binariesVersion: () =>
+          ipc.invoke(CHANNELS.localGgufRuntimeBinariesVersion) as ReturnType<
+            TeamXApi['localGguf']['runtime']['binariesVersion']
+          >,
+      },
+      pool: {
+        status: () =>
+          ipc.invoke(CHANNELS.localGgufPoolStatus) as ReturnType<
+            TeamXApi['localGguf']['pool']['status']
+          >,
+        load: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufPoolLoad, id) as ReturnType<
+            TeamXApi['localGguf']['pool']['load']
+          >,
+        unload: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufPoolUnload, id) as ReturnType<
+            TeamXApi['localGguf']['pool']['unload']
+          >,
+        setMaxConcurrent: (n: number) =>
+          ipc.invoke(CHANNELS.localGgufPoolSetMaxConcurrent, n) as ReturnType<
+            TeamXApi['localGguf']['pool']['setMaxConcurrent']
+          >,
+      },
+      endpoint: {
+        list: () =>
+          ipc.invoke(CHANNELS.localGgufEndpointList) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['list']
+          >,
+        add: (config: Parameters<TeamXApi['localGguf']['endpoint']['add']>[0]) =>
+          ipc.invoke(CHANNELS.localGgufEndpointAdd, config) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['add']
+          >,
+        remove: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufEndpointRemove, id) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['remove']
+          >,
+        test: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufEndpointTest, id) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['test']
+          >,
+        update: (id: string, partial: Parameters<TeamXApi['localGguf']['endpoint']['update']>[1]) =>
+          ipc.invoke(CHANNELS.localGgufEndpointUpdate, id, partial) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['update']
+          >,
+      },
+      hf: {
+        search: (query: string, filters: Record<string, unknown>) =>
+          ipc.invoke(CHANNELS.localGgufHfSearch, query, filters) as ReturnType<
+            TeamXApi['localGguf']['hf']['search']
+          >,
+        modelCard: (repoId: string) =>
+          ipc.invoke(CHANNELS.localGgufHfModelCard, repoId) as ReturnType<
+            TeamXApi['localGguf']['hf']['modelCard']
+          >,
+        startDownload: (repoId: string, filename: string, targetFolder: string) =>
+          ipc.invoke(
+            CHANNELS.localGgufHfStartDownload,
+            repoId,
+            filename,
+            targetFolder,
+          ) as ReturnType<TeamXApi['localGguf']['hf']['startDownload']>,
+        pauseDownload: (handleId: string) =>
+          ipc.invoke(CHANNELS.localGgufHfPauseDownload, handleId) as ReturnType<
+            TeamXApi['localGguf']['hf']['pauseDownload']
+          >,
+        resumeDownload: (handleId: string) =>
+          ipc.invoke(CHANNELS.localGgufHfResumeDownload, handleId) as ReturnType<
+            TeamXApi['localGguf']['hf']['resumeDownload']
+          >,
+        cancelDownload: (handleId: string) =>
+          ipc.invoke(CHANNELS.localGgufHfCancelDownload, handleId) as ReturnType<
+            TeamXApi['localGguf']['hf']['cancelDownload']
+          >,
+        activeDownloads: () =>
+          ipc.invoke(CHANNELS.localGgufHfActiveDownloads) as ReturnType<
+            TeamXApi['localGguf']['hf']['activeDownloads']
+          >,
+      },
+      benchmark: {
+        run: (modelId: string) =>
+          ipc.invoke(CHANNELS.localGgufBenchmarkRun, modelId) as ReturnType<
+            TeamXApi['localGguf']['benchmark']['run']
+          >,
+        history: (modelId: string) =>
+          ipc.invoke(CHANNELS.localGgufBenchmarkHistory, modelId) as ReturnType<
+            TeamXApi['localGguf']['benchmark']['history']
+          >,
+      },
+    },
   };
 }
 
 /**
  * Channel name constants — exported primarily for tests that want to
  * verify the preload invokes the right strings without string-comparing
  * literals. The main process's register layer has its own copy of the
- * same constants; if either side drifts, the renderer's invoke lands
- * on a ghost handler and the handler's `ipcMain.handle` never fires.
+ * same constants (for `localGguf.*`, the `LOCAL_GGUF_*_CHANNELS` tuples in
+ * `main/ipc/local-gguf-*-handlers.ts`); if either side drifts, the
+ * renderer's invoke lands on a ghost handler and the handler's
+ * `ipcMain.handle` never fires.
  */
 export { CHANNELS as PRELOAD_CHANNELS };
diff --git a/package.json b/package.json
index d5593c4..844192c 100644
--- a/package.json
+++ b/package.json
@@ -1,61 +1,62 @@
 {
   "name": "team-x",
   "version": "3.2.1",
+  "llamaCppRelease": "b9371",
   "private": true,
   "type": "module",
   "description": "Run an AI company. Not a prompt.",
   "license": "MIT",
   "author": "Rocky Elsalaymeh",
   "engines": {
     "node": ">=22.13.0",
     "pnpm": ">=9.0.0"
   },
   "packageManager": "pnpm@9.15.9",
   "scripts": {
     "lint": "biome check .",
     "lint:fix": "biome check --write .",
     "lint:eslint": "pnpm -F @team-x/desktop lint",
     "lint:eslint:fix": "pnpm -F @team-x/desktop lint:fix",
     "format": "biome format --write .",
     "typecheck": "pnpm -r typecheck",
     "test": "vitest run",
     "test:watch": "vitest",
     "test:coverage": "vitest run --coverage",
     "build": "pnpm -r build",
     "dev": "pnpm -F @team-x/desktop dev",
     "dist": "pnpm -F @team-x/desktop dist",
     "dist:win": "pnpm -F @team-x/desktop dist:win",
     "dist:mac": "pnpm -F @team-x/desktop dist:mac",
     "dist:linux": "pnpm -F @team-x/desktop dist:linux",
     "dist:publish": "pnpm -F @team-x/desktop dist:publish",
     "sign:pack": "npx tsx scripts/sign-pack.mjs strategia-official",
     "sign:pack:keygen": "npx tsx scripts/generate-pack-key.mjs strategia-official",
     "audit:claims": "node scripts/check-claim-evidence.mjs",
     "audit:claims:strict": "node scripts/check-claim-evidence.mjs --strict",
     "audit:claims:json": "node scripts/check-claim-evidence.mjs --json",
     "autonomy:doctor": "node scripts/autonomy-doctor.mjs",
     "autonomy:benchmark": "pnpm -F @team-x/desktop autonomy:benchmark",
     "clean": "pnpm -r exec rimraf dist out .turbo && rimraf node_modules"
   },
   "devDependencies": {
     "@biomejs/biome": "~1.9.4",
     "@eslint/js": "^9.18.0",
     "@types/node": "^20.19.39",
     "@vitest/coverage-v8": "^2.1.9",
     "eslint": "^9.18.0",
     "eslint-import-resolver-typescript": "^3.7.0",
     "eslint-plugin-import": "^2.31.0",
     "eslint-plugin-jsx-a11y": "^6.10.2",
     "eslint-plugin-react": "^7.37.2",
     "eslint-plugin-react-hooks": "^5.1.0",
     "@typescript-eslint/eslint-plugin": "^8.19.1",
     "@typescript-eslint/parser": "^8.19.1",
     "globals": "^15.14.0",
     "rimraf": "^6.1.3",
     "typescript": "^5.5.4",
     "vitest": "^2.1.9"
   },
   "pnpm": {
     "onlyBuiltDependencies": ["electron", "keytar"]
   }
 }
diff --git a/packages/local-gguf-runtime/src/errors.ts b/packages/local-gguf-runtime/src/errors.ts
new file mode 100644
index 0000000..4a1662b
--- /dev/null
+++ b/packages/local-gguf-runtime/src/errors.ts
@@ -0,0 +1,9 @@
+// packages/local-gguf-runtime/src/errors.ts
+//
+// Re-exports the canonical LocalGgufError union from @team-x/shared-types
+// (a direct dependency of this package). The re-export gives runtime
+// consumers a single import surface — `@team-x/local-gguf-runtime` — for
+// both the error helpers and the runtime APIs that later phases add here,
+// so call sites don't reach into shared-types for error types separately.
+
+export { isLocalGgufError, type GpuBackend, type LocalGgufError } from '@team-x/shared-types';
diff --git a/packages/local-gguf-runtime/src/index.ts b/packages/local-gguf-runtime/src/index.ts
new file mode 100644
index 0000000..e485073
--- /dev/null
+++ b/packages/local-gguf-runtime/src/index.ts
@@ -0,0 +1,6 @@
+// Public exports for @team-x/local-gguf-runtime.
+// Phase 1 ships only the errors re-export; subsequent phases extend this
+// surface with the GPU probe, llama-server lifecycle, LRU pool, HF client,
+// GGUF metadata parser, and benchmark runner.
+
+export * from './errors.js';
diff --git a/packages/shared-types/src/ipc.ts b/packages/shared-types/src/ipc.ts
index f7e1f1e..3f074d2 100644
--- a/packages/shared-types/src/ipc.ts
+++ b/packages/shared-types/src/ipc.ts
@@ -42,160 +42,161 @@ import type {
   IpcParseResult,
   IpcSuggestItem,
 } from './command.js';
 import type {
   CopilotAskArgs,
   CopilotAskResult,
   CopilotConfigureArgs,
   CopilotConfigureResult,
   CopilotDismissArgs,
   CopilotDismissResult,
   CopilotExportRequest,
   CopilotExportResponse,
   CopilotInsightListArgs,
   CopilotInsightListResult,
 } from './copilot.js';
 import type {
   ApprovalDecisionStatus,
   ApprovalItem,
   ApprovalItemKind,
   ApprovalItemStatus,
   ArtifactRecord,
   AuthorityGrant,
   AuthorityRequest,
   AutonomyBenchmarkReport,
   AutonomyBenchmarkScenarioId,
   AutonomyDoctorReport,
   BudgetLedgerEntry,
   BudgetOverview,
   BudgetPolicy,
   BudgetPolicyPeriod,
   BudgetScopeKind,
   ChatMessage,
   Company,
   CompanyCloudLinkStatus,
   CompanyImportPreview,
   CompanyPackageManifest,
   CompanyPackageMode,
   CompanyPackageSecretBinding,
   CompanySharingReadinessSummary,
   CompanyTemplateSummary,
   EffectiveAuthoritySnapshot,
   Employee,
   EmployeeRuntimeBinding,
   ExtensionSummary,
   ExtensionsAutonomyMode,
   Goal,
   Meeting,
   MeetingActionItem,
   MeetingMode,
   OperatorAccessEntry,
   OperatorInvite,
   OperatorMembershipRole,
   PackedThreadContext,
   Project,
   Routine,
   RoutineRun,
   RoutineSchedule,
   RoutineTicketWorkConfig,
   RunCheckpoint,
   RuntimeProfileKind,
   RuntimeProfileSummary,
   RuntimeProfileValidation,
   RuntimeSession,
   ScheduleItem,
   ScheduleItemKind,
   ScheduleItemStatus,
   SharedOperatorAuthMode,
   SkillAssignment,
   Thread,
   ThreadDigest,
   Ticket,
   TicketCheckout,
   TicketPriority,
 } from './entities.js';
 import type {
   AgenticRunSnapshot,
   CopilotCategory,
   CopilotCategoryWeights,
   DashboardEvent,
 } from './events.js';
+import type { LocalGgufApi } from './local-gguf.js';
 import type { PrivacyTier, ProviderConfig, ProviderKind } from './providers.js';
 
 export type { CopilotCategoryWeights } from './events.js';
 
 // ---------------------------------------------------------------------------
 // Low-level request / response shapes
 // ---------------------------------------------------------------------------
 
 /**
  * `companies.archive` request (M33 T3 follow-up F3).
  *
  * Idempotent — if the company is already archived, the handler re-runs
  * the full three-step quiesce (analyzer stop, event-window clear,
  * status flip) and re-emits `company.archived`. That is intentional:
  * we would rather repeat the cleanup than silently skip it on a retry.
  */
 export interface ArchiveCompanyRequest {
   companyId: string;
 }
 
 /**
  * `companies.create` request (Phase 5.6 M-C step b — restores Cluster A
  * multi-company CRUD per audit row 10.12; the locked M7 architectural
  * decision).
  *
  * `slug` MUST be unique app-wide. The handler enforces a non-empty
  * trimmed `name` and a slug matching `/^[a-z0-9][a-z0-9-]{0,62}$/`
  * (lowercase alphanumerics + hyphen, 1–63 chars, no leading hyphen) so
  * the renderer can rely on a stable URL-safe identifier without
  * server-side rewriting. Duplicate slug surfaces as a SQL UNIQUE
  * constraint failure that the handler rethrows with a friendlier
  * message; callers should pre-check via `companies.list` if they want
  * to validate before submit.
  *
  * `settings` is a free-form JSON object persisted as a text column;
  * Phase 1 used `mission` + `hq` + `description`. The schema lives in
  * `CompanySettings` from `./entities.js`.
  *
  * `icon` is an optional emoji or short visual marker; `theme` defaults
  * to `'dark'` per the Strategia design system.
  */
 export interface CompaniesCreateRequest {
   name: string;
   slug: string;
   settings?: Record<string, unknown>;
   icon?: string;
   theme?: string;
 }
 
 /**
  * `companies.create` response. Returns the new company id PLUS the two
  * system pseudo-employee ids the bootstrap seeded inline (`system-agent`
  * from M31 + `system-copilot` from M33). The renderer can use the
  * agent/copilot ids immediately to open Copilot Conversations or the
  * command palette without a follow-up `employees.list` round-trip.
  *
  * The bootstrap is part of the `companies.create` write transaction
  * surface in spirit — the IPC handler invokes `ensureSystemForCompany`
  * synchronously after `companiesRepo.create` succeeds and BEFORE the
  * `company.created` bus event fires, so subscribers see a fully-formed
  * company on first observation (matches the `seedIfEmpty` invariant).
  */
 export interface CompaniesCreateResponse {
   companyId: string;
   systemAgentEmployeeId: string;
   systemCopilotEmployeeId: string;
 }
 
 /**
  * `companies.update` request (Phase 5.6 M-C step e — restores Cluster A
  * multi-company CRUD per audit row 10.13).
  *
  * Every mutable field is optional — only keys present in the request
  * get written. The handler:
  *
  *   - Validates every supplied field using the same rules as
  *     `companies.create` (non-empty trimmed name ≤120 chars, slug
  *     matching `/^[a-z0-9][a-z0-9-]{0,62}$/`, settings plain-object,
  *     icon/theme string).
  *   - Refuses archived companies via `assertCompanyActive` so an
@@ -3564,89 +3565,98 @@ export interface TeamXApi {
      * for the company, newest-first. Cursor is the `createdAt` of the
      * last row from the previous page; pass `undefined` for the first
      * page. `nextCursor` is `null` when the page was the last one.
      * Optional category + severity filters narrow the result set
      * server-side so the UI does not paginate through dismissed or
      * filtered-out rows. Phase 5 — M33 T5.
      */
     insights(args: CopilotInsightListArgs): Promise<CopilotInsightListResult>;
     /**
      * Mark an insight as dismissed. Idempotent when invoked on an
      * already-dismissed row (the handler returns the prior
      * `dismissedAt`). Emits `copilot.dismissed` on the event bus per
      * invariant #11 so the renderer's React Query cache invalidates.
      * Phase 5 — M33 T5.
      */
     dismiss(args: CopilotDismissArgs): Promise<CopilotDismissResult>;
     /**
      * Ask the `system-copilot` pseudo-employee a question. Routes
      * through the agentic loop in the same shape M31's
      * `complex_request` uses — the response `{ runId, threadId }`
      * mirrors `IpcExecuteResult` so the palette's step-stream hook
      * can subscribe with no wire-format divergence. Phase 5 — M33 T5
      * ships the IPC slot; T6 wires the full loop.
      */
     ask(args: CopilotAskArgs): Promise<CopilotAskResult>;
     /**
      * Test-only: force a manual analyzer tick for the given company
      * and resolve when it completes. Production callers receive an
      * error directing them to `settings.setCopilot` (T7). Sole
      * intended caller is the T9 Playwright spec, which needs to
      * synchronously force a copilot cycle rather than wait on the
      * 5-minute scheduled interval. Phase 5 — M33 T5.
      */
     configure(args: CopilotConfigureArgs): Promise<CopilotConfigureResult>;
     /**
      * Read-only local export of active Copilot insights as CSV or JSON.
      * Company scope requires `companyId`; all-company scope applies the
      * same optional category/severity filters globally. Emits no bus event.
      * Phase 6 — M40.
      */
     export(args: CopilotExportRequest): Promise<CopilotExportResponse>;
   };
   tickets: {
     /** Create a new ticket. If assigneeId is provided, triggers agent assignment. */
     create(req: CreateTicketRequest): Promise<CreateTicketResponse>;
     /** Update ticket fields (title, description, priority, status, labels, SLA, due). */
     update(req: UpdateTicketRequest): Promise<void>;
     /** Assign a ticket to an employee. Creates ticket thread and enqueues WorkItem. */
     assign(req: AssignTicketRequest): Promise<void>;
     /** Add an employee to the ticket discussion and wake them into the thread. */
     addParticipant(req: AddTicketParticipantRequest): Promise<void>;
     /** Remove an employee from the ticket discussion. */
     removeParticipant(req: RemoveTicketParticipantRequest): Promise<void>;
     /** Close a ticket (sets status to 'done' and records closedAt). */
     close(ticketId: string): Promise<void>;
     /** Reopen a previously closed ticket. */
     reopen(ticketId: string): Promise<void>;
     /** Add a comment to a ticket's discussion thread. */
     addComment(req: AddTicketCommentRequest): Promise<AddTicketCommentResponse>;
     /** List all tickets for a company. */
     list(companyId: string): Promise<Ticket[]>;
     /** Get full ticket detail with thread messages and assignee. */
     get(ticketId: string): Promise<TicketDetail>;
     /** Attach a vault file to a ticket. */
     attachFile(req: AttachFileRequest): Promise<AttachFileResponse>;
     /** Detach a file from a ticket. */
     detachFile(req: DetachFileRequest): Promise<void>;
     /** List all file attachments for a ticket. */
     listAttachments(ticketId: string): Promise<TicketAttachment[]>;
   };
   proactive: {
     /** Enable or disable proactive mode for a company. */
     setEnabled(req: ProactiveSetEnabledRequest): Promise<void>;
     /** Trigger immediate goal decomposition. */
     decomposeGoal(req: ProactiveDecomposeGoalRequest): Promise<ProactiveDecomposeGoalResponse>;
     /** Trigger background work scan. */
     scanForWork(req: ProactiveScanForWorkRequest): Promise<ProactiveScanForWorkResponse>;
     /** Query proactive state. */
     getState(req: ProactiveGetStateRequest): Promise<ProactiveGetStateResponse>;
   };
+
+  /**
+   * Local & Networked GGUF Support (v3.3.0). The full typed surface ships
+   * in Phase 1; every channel is a not-implemented stub until its owning
+   * phase lands the real handler (runtime/pool → P2, library → P3,
+   * endpoint → P5, hf → P7, benchmark → P10). See `LocalGgufApi` in
+   * `local-gguf.ts` for the per-area method contracts.
+   */
+  localGguf: LocalGgufApi;
 }
 
 /**
  * Sentinel value the renderer passes as `threadId` to
  * `chat.send` to request the user↔employee DM thread be looked up or
  * created on the fly. Exported from shared-types so both the preload
  * and the renderer reference the same string constant.
  */
 export const AUTO_THREAD_ID = 'auto';
diff --git a/packages/shared-types/src/local-gguf.ts b/packages/shared-types/src/local-gguf.ts
new file mode 100644
index 0000000..98ec832
--- /dev/null
+++ b/packages/shared-types/src/local-gguf.ts
@@ -0,0 +1,300 @@
+// packages/shared-types/src/local-gguf.ts
+//
+// Canonical types for the Local & Networked GGUF Support feature (v3.3.0).
+// Locked in Phase 1; changes require master-plan update + migration of all
+// consumers in the same commit.
+
+export type GpuBackend = 'cuda' | 'rocm' | 'vulkan' | 'metal' | 'cpu';
+
+export type SourceType = 'file' | 'folder-entry' | 'remote-endpoint';
+
+export type ModelStatus = 'cold' | 'loading' | 'loaded' | 'error' | 'unreachable' | 'missing';
+
+export type EndpointStatus = 'unknown' | 'reachable' | 'unreachable' | 'auth-failed';
+
+export type WatchFolderStatus = 'unknown' | 'reachable' | 'unreachable';
+
+export interface GpuDevice {
+  name: string;
+  vramMb: number;
+  backend: GpuBackend;
+  // --- Optional shape extensions (Spike S2, confirmed on real hardware 2026-05-29).
+  // All optional → backward-compatible. See docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md
+  // "Shape adjustments to GpuInventory". Strict set (load-bearing for backend ranking):
+  computeCap?: string; // nvidia-smi compute_cap, e.g. "5.2" (Maxwell) / "12.0". Gates CUDA-build compatibility (S2 F16, S4 F13).
+  gfxTarget?: string; // rocminfo gfxNNNN, e.g. "gfx1100". Confirms HIP --device-targets match.
+  uuid?: string; // nvidia-smi -L UUID (CUDA) / deviceUUID (Vulkan). Stable per-device key; coalesce by UUID, not index (S2 F17).
+  coreCount?: number; // Apple Silicon GPU core count; drives n_gpu_layers heuristic on Metal.
+  metalSupport?: string; // system_profiler "Metal Support", e.g. "Metal 3"; gates shader-bundle compatibility.
+  // Liberal set (display + cross-vendor coalescing):
+  vendorId?: string; // vulkaninfo vendorID, e.g. "0x10de". Cross-vendor coalescing key.
+  deviceId?: string; // vulkaninfo deviceID, e.g. "0x17c2".
+  deviceType?: string; // vulkaninfo deviceType, e.g. "PHYSICAL_DEVICE_TYPE_DISCRETE_GPU".
+  driverInfo?: string; // vulkaninfo driverInfo, e.g. "582.28" — human-readable for Settings → Runtime.
+  apiVersion?: string; // vulkaninfo apiVersion, e.g. "1.4.312".
+}
+
+export interface GpuInventory {
+  detectedAt: number;
+  cuda: {
+    available: boolean;
+    devices: GpuDevice[];
+    driverVersion?: string;
+    cudaVersion?: string;
+  };
+  rocm: {
+    available: boolean;
+    devices: GpuDevice[];
+    rocmVersion?: string;
+  };
+  vulkan: { available: boolean; devices: GpuDevice[] };
+  metal: { available: boolean; devices: GpuDevice[] };
+  cpu: { cores: number; ramMb: number };
+}
+
+export interface GgufMetadata {
+  arch: string;
+  paramsBillions: number | null;
+  quant: string | null;
+  contextMax: number | null;
+  chatTemplate: string | null;
+  isEmbeddingModel: boolean;
+  isToolCapable: boolean;
+  fileSizeBytes: number;
+  sha256: string | null;
+}
+
+export interface LocalModel {
+  id: string;
+  displayName: string;
+  sourceType: SourceType;
+  sourcePath: string | null;
+  endpointId: string | null;
+  ggufArch: string | null;
+  ggufParamsB: number | null;
+  ggufQuant: string | null;
+  ggufContextMax: number | null;
+  ggufSizeBytes: number | null;
+  ggufSha256: string | null;
+  ggufChatTemplate: string | null;
+  isEmbeddingModel: boolean;
+  isToolCapable: boolean;
+  hfRepoId: string | null;
+  hfFilename: string | null;
+  license: string | null;
+  chatTemplateOverride: string | null;
+  systemPromptOverride: string | null;
+  status: ModelStatus;
+  statusDetail: string | null;
+  lastUsedAt: number | null;
+  createdAt: number;
+  updatedAt: number;
+}
+
+export interface AdvancedParams {
+  modelId: string;
+  nCtx: number | null;
+  nGpuLayers: number | null;
+  nBatch: number | null;
+  nThreads: number | null;
+  temperature: number | null;
+  topP: number | null;
+  topK: number | null;
+  repeatPenalty: number | null;
+  mmap: boolean | null;
+  mlock: boolean | null;
+  flashAttention: boolean | null;
+  updatedAt: number;
+}
+
+export interface BenchmarkResult {
+  id: string;
+  modelId: string;
+  promptEvalTokS: number;
+  genTokS: number;
+  ttftMs: number;
+  vramPeakMb: number | null;
+  backend: GpuBackend;
+  nCtxUsed: number;
+  nGpuLayersUsed: number;
+  ranAt: number;
+}
+
+export interface RemoteEndpoint {
+  id: string;
+  name: string;
+  baseUrl: string;
+  authHeaderKeyRef: string | null;
+  privacyTier: 'Local';
+  status: EndpointStatus;
+  lastCheckedAt: number | null;
+  lastError: string | null;
+  createdAt: number;
+  updatedAt: number;
+}
+
+export interface WatchFolder {
+  id: string;
+  path: string;
+  recursive: boolean;
+  status: WatchFolderStatus;
+  lastScanAt: number | null;
+  lastScanError: string | null;
+  createdAt: number;
+  updatedAt: number;
+}
+
+export interface LocalGgufRuntimeSettings {
+  activeBackend: GpuBackend;
+  activeBackendIsAutoDetected: boolean;
+  autoFallbackReason: string | null;
+  maxConcurrentLocalModels: number; // pool size, default 1
+  defaultLibraryFolder: string | null;
+  embeddingModelId: string | null;
+  hfTokenKeyRef: string | null; // optional, stored in keytar
+  llamaBinariesVersion: string; // e.g. "b9371"
+}
+
+export type LocalGgufError =
+  | { kind: 'binary-not-found'; backend: GpuBackend; path: string }
+  | { kind: 'binary-unsupported'; backend: GpuBackend; osVersion: string }
+  | { kind: 'gpu-probe-failed'; reason: string }
+  | { kind: 'oom-predicted'; requiredMb: number; availableMb: number }
+  | { kind: 'oom-runtime'; lastStderr: string }
+  | { kind: 'gguf-parse-failed'; path: string; reason: string }
+  | { kind: 'gguf-corrupt'; path: string; sha256Mismatch?: boolean }
+  | { kind: 'server-spawn-failed'; exitCode: number | null; stderr: string }
+  | { kind: 'server-crashed'; pid: number; exitCode: number | null; stderr: string }
+  | { kind: 'port-exhausted' }
+  | { kind: 'source-unreachable'; path: string }
+  | { kind: 'hf-download-failed'; repo: string; file: string; httpStatus: number; body: string }
+  | { kind: 'hf-rate-limited'; retryAfterS: number }
+  | { kind: 'endpoint-unreachable'; url: string; httpStatus?: number }
+  | { kind: 'endpoint-auth-failed'; url: string }
+  | { kind: 'pool-full'; current: number; max: number }
+  | { kind: 'context-too-large'; requested: number; max: number };
+
+/**
+ * Structural type guard. Confirms an unknown value is shaped like a
+ * LocalGgufError (object with a string `kind`). Does NOT enforce that
+ * `kind` is one of the declared variants — that's TypeScript's job at
+ * compile time. Useful at IPC + JSON deserialization boundaries.
+ */
+export function isLocalGgufError(value: unknown): value is LocalGgufError {
+  if (typeof value !== 'object' || value === null) return false;
+  const v = value as { kind?: unknown };
+  return typeof v.kind === 'string';
+}
+
+// ---------------------------------------------------------------------------
+// Hugging Face Hub browser types
+// ---------------------------------------------------------------------------
+//
+// Surfaced by the `localGguf.hf.*` channels. Phase 1 introduces them at the
+// contract level so the preload bridge and IPC stubs share one definition;
+// Phase 7 (HF browser) wires them to the real HfService. They live here in
+// shared-types — not inline in the handler module — so the main process,
+// preload, and renderer all type-check against a single source of truth.
+
+/** One row of a Hugging Face Hub model search result. */
+export interface HfSearchResult {
+  repoId: string;
+  downloads: number;
+  likes: number;
+  description: string;
+  tags: string[];
+}
+
+/** A Hugging Face model card with its downloadable file siblings. */
+export interface HfModelCard {
+  repoId: string;
+  description: string;
+  license: string | null;
+  siblings: Array<{ rfilename: string; sizeBytes: number | null }>;
+}
+
+/** Live progress for an in-flight Hugging Face download. */
+export interface DownloadProgress {
+  handleId: string;
+  repoId: string;
+  filename: string;
+  bytesReceived: number;
+  bytesTotal: number;
+  state: 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'failed';
+  errorMessage: string | null;
+}
+
+// ---------------------------------------------------------------------------
+// Bridge surface — the `localGguf` namespace on `window.teamx`
+// ---------------------------------------------------------------------------
+//
+// The high-level, renderer-facing shape of the `localGguf.*` IPC namespace.
+// Composed into `TeamXApi` (see ipc.ts) so renderer code calls
+// `window.teamx.localGguf.<area>.<method>(...)` and type-checks against the
+// same contract the main-process handler layer implements. Phase 1 ships the
+// full typed surface even though every handler is a not-implemented stub;
+// later phases swap the implementations in behind these stable signatures.
+
+export interface LocalGgufApi {
+  library: {
+    list(): Promise<LocalModel[]>;
+    get(id: string): Promise<LocalModel | null>;
+    addFile(path: string): Promise<LocalModel>;
+    addFolder(path: string, recursive: boolean): Promise<WatchFolder>;
+    removeModel(id: string): Promise<void>;
+    removeFolder(id: string): Promise<void>;
+    scanFolder(id: string): Promise<{ addedCount: number; removedCount: number }>;
+    setSystemPrompt(id: string, prompt: string | null): Promise<LocalModel>;
+    setChatTemplate(id: string, template: string | null): Promise<LocalModel>;
+    setAdvancedParams(id: string, params: Partial<AdvancedParams>): Promise<AdvancedParams>;
+    resetAdvanced(id: string): Promise<AdvancedParams>;
+    listBySourceType(sourceType: SourceType): Promise<LocalModel[]>;
+  };
+  runtime: {
+    gpuInventory(): Promise<GpuInventory>;
+    reprobeGpu(): Promise<GpuInventory>;
+    settings(): Promise<LocalGgufRuntimeSettings>;
+    setSettings(partial: Partial<LocalGgufRuntimeSettings>): Promise<LocalGgufRuntimeSettings>;
+    binariesVersion(): Promise<string>;
+  };
+  pool: {
+    status(): Promise<{
+      loaded: Array<{ modelId: string; baseUrl: string; pid: number }>;
+      maxConcurrent: number;
+    }>;
+    load(id: string): Promise<{ modelId: string; baseUrl: string; pid: number }>;
+    unload(id: string): Promise<void>;
+    setMaxConcurrent(n: number): Promise<void>;
+  };
+  endpoint: {
+    list(): Promise<RemoteEndpoint[]>;
+    add(config: {
+      name: string;
+      baseUrl: string;
+      authHeaderKeyRef: string | null;
+    }): Promise<RemoteEndpoint>;
+    remove(id: string): Promise<void>;
+    test(id: string): Promise<{ reachable: boolean; latencyMs?: number; error?: LocalGgufError }>;
+    update(
+      id: string,
+      partial: { name?: string; baseUrl?: string; authHeaderKeyRef?: string | null },
+    ): Promise<RemoteEndpoint>;
+  };
+  hf: {
+    search(query: string, filters: Record<string, unknown>): Promise<HfSearchResult[]>;
+    modelCard(repoId: string): Promise<HfModelCard>;
+    startDownload(
+      repoId: string,
+      filename: string,
+      targetFolder: string,
+    ): Promise<{ handleId: string }>;
+    pauseDownload(handleId: string): Promise<void>;
+    resumeDownload(handleId: string): Promise<void>;
+    cancelDownload(handleId: string): Promise<void>;
+    activeDownloads(): Promise<DownloadProgress[]>;
+  };
+  benchmark: {
+    run(modelId: string): Promise<BenchmarkResult>;
+    history(modelId: string): Promise<BenchmarkResult[]>;
+  };
+}
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 1943e3e..d31f748 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -186,160 +186,173 @@ importers:
       '@types/react-dom':
         specifier: ^19.0.0
         version: 19.2.3(@types/react@19.2.14)
       '@types/sql.js':
         specifier: ^1.4.0
         version: 1.4.11
       '@vitejs/plugin-react':
         specifier: ^4.3.0
         version: 4.7.0(vite@5.4.21(@types/node@20.19.39))
       autoprefixer:
         specifier: ^10.4.27
         version: 10.4.27(postcss@8.5.9)
       drizzle-kit:
         specifier: ^0.24.0
         version: 0.24.2
       electron:
         specifier: ^31.0.0
         version: 31.7.7
       electron-builder:
         specifier: ^26.8.1
         version: 26.8.1(electron-builder-squirrel-windows@26.8.1)
       electron-vite:
         specifier: ^2.3.0
         version: 2.3.0(vite@5.4.21(@types/node@20.19.39))
       postcss:
         specifier: ^8.5.9
         version: 8.5.9
       react:
         specifier: ^19.0.0
         version: 19.2.4
       react-dom:
         specifier: ^19.0.0
         version: 19.2.4(react@19.2.4)
       sql.js:
         specifier: ^1.11.0
         version: 1.14.1
       tailwindcss:
         specifier: ^3.4.19
         version: 3.4.19(tsx@4.21.0)(yaml@2.8.3)
       tsx:
         specifier: ^4.21.0
         version: 4.21.0
       typescript:
         specifier: 5.5.4
         version: 5.5.4
       vite:
         specifier: ^5.4.0
         version: 5.4.21(@types/node@20.19.39)
       vitest:
         specifier: ^2
         version: 2.1.9(@types/node@20.19.39)
 
   packages/intelligence:
     dependencies:
       '@team-x/provider-router':
         specifier: workspace:*
         version: link:../provider-router
       '@team-x/shared-types':
         specifier: workspace:*
         version: link:../shared-types
       commander:
         specifier: ^12.0.0
         version: 12.1.0
       zod:
         specifier: ^3.23.0
         version: 3.25.76
       zod-to-json-schema:
         specifier: ^3.25.0
         version: 3.25.2(zod@3.25.76)
     devDependencies:
       tsx:
         specifier: ^4.7.0
         version: 4.21.0
       typescript:
         specifier: 5.5.4
         version: 5.5.4
       vitest:
         specifier: ^2
         version: 2.1.9(@types/node@20.19.39)
 
+  packages/local-gguf-runtime:
+    dependencies:
+      '@team-x/shared-types':
+        specifier: workspace:*
+        version: link:../shared-types
+    devDependencies:
+      typescript:
+        specifier: 5.5.4
+        version: 5.5.4
+      vitest:
+        specifier: ^2
+        version: 2.1.9(@types/node@20.19.39)
+
   packages/provider-router:
     dependencies:
       '@ai-sdk/anthropic':
         specifier: ^0.0.50
         version: 0.0.50(zod@3.25.76)
       '@ai-sdk/google':
         specifier: 0.0.55
         version: 0.0.55(zod@3.25.76)
       '@ai-sdk/groq':
         specifier: 0.0.3
         version: 0.0.3(zod@3.25.76)
       '@ai-sdk/openai':
         specifier: 0.0.72
         version: 0.0.72(zod@3.25.76)
       '@openrouter/ai-sdk-provider':
         specifier: 0.0.6
         version: 0.0.6(zod@3.25.76)
       '@team-x/shared-types':
         specifier: workspace:*
         version: link:../shared-types
       ai:
         specifier: ^3.4.0
         version: 3.4.33(react@19.2.4)(sswr@2.2.0(svelte@5.55.2))(svelte@5.55.2)(vue@3.5.32(typescript@5.5.4))(zod@3.25.76)
       ollama-ai-provider:
         specifier: ^0.15.0
         version: 0.15.2(zod@3.25.76)
     devDependencies:
       typescript:
         specifier: 5.5.4
         version: 5.5.4
       vitest:
         specifier: ^2
         version: 2.1.9(@types/node@20.19.39)
 
   packages/role-schema:
     dependencies:
       '@team-x/shared-types':
         specifier: workspace:*
         version: link:../shared-types
       yaml:
         specifier: ^2.8.3
         version: 2.8.3
       zod:
         specifier: ^3.23.0
         version: 3.25.76
     devDependencies:
       typescript:
         specifier: 5.5.4
         version: 5.5.4
       vitest:
         specifier: ^2
         version: 2.1.9(@types/node@20.19.39)
 
   packages/shared-types:
     devDependencies:
       typescript:
         specifier: 5.5.4
         version: 5.5.4
 
   packages/telemetry-core:
     dependencies:
       '@team-x/shared-types':
         specifier: workspace:*
         version: link:../shared-types
     devDependencies:
       typescript:
         specifier: 5.5.4
         version: 5.5.4
       vitest:
         specifier: ^2
         version: 2.1.9(@types/node@20.19.39)
 
 packages:
 
   7zip-bin@5.2.0:
     resolution: {integrity: sha512-ukTPVhqG4jNzMro2qA9HSCSSVJN3aN7tlb+hfqYCt3ER0yWroeA2VR38MNrOHLQ/cVj+DaIMad0kFCtWWowh/A==}
 
   '@ai-sdk/anthropic@0.0.50':
     resolution: {integrity: sha512-++mqmFcUoQgjoCchAU6eVG3QfKdwkeJVNdMZ+jUiNdawn8diA6BlARlu7xFT4F7W3bcStfYv4hK1jwRyzAQtCg==}
     engines: {node: '>=18'}

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'apps/desktop/src/preload/api.ts' -TotalCount 340; Write-Host '--- shared ipc import local?'; Get-Content -LiteralPath 'packages/shared-types/src/ipc.ts' -TotalCount 140; Write-Host '--- handlers'; Get-Content -LiteralPath 'apps/desktop/src/main/ipc/local-gguf-library-handlers.ts'; Get-Content -LiteralPath 'apps/desktop/src/main/ipc/local-gguf-runtime-handlers.ts'; Get-Content -LiteralPath 'apps/desktop/src/main/ipc/local-gguf-endpoint-handlers.ts'; Get-Content -LiteralPath 'apps/desktop/src/main/ipc/local-gguf-hf-handlers.ts'; Get-Content -LiteralPath 'apps/desktop/src/main/ipc/local-gguf-benchmark-handlers.ts'; Get-Content -LiteralPath 'apps/desktop/src/main/ipc/local-gguf-not-implemented.ts'" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 8058ms:
/**
 * Preload API factory — pure function that builds the `TeamXApi`
 * surface the renderer consumes as `window.teamx`.
 *
 * The split between this file and `./index.ts` is the same pattern
 * the rest of the codebase uses: pure factories for testable logic,
 * thin electron-bound wrappers for the actual runtime wiring.
 *
 * `./index.ts` is the one line of code that actually touches
 * `contextBridge.exposeInMainWorld`. Everything that maps method
 * signatures to ipc channel names, wraps `ipcRenderer.on` in an
 * unsubscribe pattern, and narrows the request/response shapes lives
 * here and can be unit-tested with a hand-rolled fake that
 * structurally satisfies `IpcRendererLike`.
 *
 * Why `IpcRendererLike` instead of importing `IpcRenderer` from
 * `'electron'`:
 *
 *   The preload runs in a Chromium isolated world with `contextBridge`,
 *   not in Node, so pulling in the full `electron` module at test time
 *   is expensive and requires the Electron ABI binary. Vitest runs in
 *   plain Node. Declaring our own structural subset lets us:
 *     - test the factory with `{ invoke: vi.fn(), on: vi.fn(), ... }`,
 *     - verify channel names and argument shapes pin exactly, and
 *     - keep electron entirely out of the test runner's dependency
 *       graph.
 *
 *   The real `ipcRenderer` object exported from `'electron'`
 *   structurally satisfies `IpcRendererLike` with zero casts, so
 *   `./index.ts` just does `buildTeamXApi(ipcRenderer)`.
 *
 * Method signature philosophy is documented on the `TeamXApi`
 * interface in `@team-x/shared-types` — positional args where there
 * is exactly one, object literals where there are more.
 */

import type {
  AcceptOperatorInviteRequest,
  AcceptOperatorInviteResponse,
  AddMcpServerRequest,
  AddProviderRequest,
  AddProviderResponse,
  AddTicketCommentRequest,
  AddTicketCommentResponse,
  AddTicketParticipantRequest,
  AgentImprovementRunResult,
  AgentImprovementSnapshot,
  AgenticRunSnapshot,
  ApprovalItem,
  ArtifactRecord,
  AttachFileRequest,
  AttachFileResponse,
  AuditEvent,
  AuditExportRequest,
  AuditExportResponse,
  AuditFilter,
  AuditStats,
  AuthorityGrant,
  AuthorityRequest,
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  BackupCreateRequest,
  BackupCreateResponse,
  BackupDeleteRequest,
  BackupDeleteResponse,
  BackupEntry,
  BackupRestoreRequest,
  BackupRestoreResponse,
  BindEmployeeRuntimeProfileRequest,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  CallMeetingRequest,
  CallMeetingResponse,
  CommandHistoryRequest,
  CommandParseRequest,
  CommandStopRequest,
  CommandStopResult,
  CommandSuggestRequest,
  CompaniesCreateRequest,
  CompaniesCreateResponse,
  CompaniesDeleteRequest,
  CompaniesUpdateRequest,
  CompanyCloudLinkStatus,
  CompanySharingReadinessSummary,
  CompleteScheduleItemRequest,
  CopilotAskArgs,
  CopilotAskResult,
  CopilotConfigureArgs,
  CopilotConfigureResult,
  CopilotDismissArgs,
  CopilotDismissResult,
  CopilotExportRequest,
  CopilotExportResponse,
  CopilotInsightListArgs,
  CopilotInsightListResult,
  CreateAuthorityGrantRequest,
  CreateBudgetPolicyRequest,
  CreateGoalRequest,
  CreateGoalResponse,
  CreateOperatorInviteRequest,
  CreateOperatorInviteResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateRoutineRequest,
  CreateRuntimeProfileRequest,
  CreateScheduleItemRequest,
  CreateScheduleItemResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  DashboardEvent,
  DashboardEventListener,
  DeleteRoutineRequest,
  DeleteRuntimeProfileRequest,
  DeleteScheduleItemRequest,
  DetachFileRequest,
  EffectiveAuthoritySnapshot,
  EmployeeRuntimeBinding,
  EmployeesPromoteRequest,
  EmployeesPromoteResponse,
  EmployeesSetManagerRequest,
  EmployeesUpdateRequest,
  EmployeesUpdateResponse,
  EndMeetingResponse,
  ExportCompanyPackageRequest,
  ExportCompanyPackageResponse,
  ExtensionSummary,
  FireEmployeeRequest,
  GetCloudWorkspaceLinkRequest,
  GetEffectiveAuthorityRequest,
  GetOperatorSharingReadinessRequest,
  GetThreadDigestRequest,
  Goal,
  GoalDetail,
  HireEmployeeRequest,
  HireEmployeeResponse,
  ImportCompanyPackageRequest,
  ImportCompanyPackageResponse,
  InstallCompanyTemplateRequest,
  InstallCompanyTemplateResponse,
  InstallGithubSkillRequest,
  InstallLocalSkillRequest,
  InstallMcpTemplateRequest,
  InterjectMeetingRequest,
  InterjectMeetingResponse,
  IpcCommandHistoryEntry,
  IpcExecuteRequest,
  IpcExecuteResult,
  IpcParseResult,
  IpcSuggestItem,
  LinkCloudWorkspaceRequest,
  ListApprovalItemsRequest,
  ListArtifactsRequest,
  ListAuthorityGrantsRequest,
  ListBudgetLedgerEntriesRequest,
  ListCompanyTemplatesRequest,
  ListCompanyTemplatesResponse,
  ListEventsRequest,
  ListEventsResponse,
  ListMcpTemplatesRequest,
  ListProviderModelsResponse,
  ListRoutineRunsRequest,
  ListRunCheckpointsRequest,
  ListScheduleItemsRequest,
  ListSkillAssignmentsRequest,
  McpServerSummary,
  McpTemplateSummary,
  Meeting,
  MeetingDetail,
  OperatorAccessEntry,
  OperatorInvite,
  OrgchartGetResponse,
  PackThreadContextRequest,
  PackedThreadContext,
  PreviewCompanyPackageImportRequest,
  PreviewCompanyPackageImportResponse,
  ProactiveDecomposeGoalRequest,
  ProactiveDecomposeGoalResponse,
  ProactiveGetStateRequest,
  ProactiveGetStateResponse,
  ProactiveScanForWorkRequest,
  ProactiveScanForWorkResponse,
  ProactiveSetEnabledRequest,
  Project,
  ProjectDetail,
  ProviderConfig,
  RagDeleteForCompanyResponse,
  RagRebuildAllResponse,
  RagStatsResponse,
  ReconnectCloudWorkspaceRequest,
  RemoveSkillRequest,
  RemoveTicketParticipantRequest,
  ResolveThreadRequest,
  ResolveThreadResponse,
  ReviewApprovalItemRequest,
  RevokeOperatorInviteRequest,
  Routine,
  RoutineRun,
  RunAgentImprovementRequest,
  RunAutonomyBenchmarkRequest,
  RunAutonomyDoctorRequest,
  RunCheckpoint,
  RunRoutineNowRequest,
  RuntimeOperationsSnapshot,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
  ScheduleItem,
  SelectDirectoryResponse,
  SendChatRequest,
  SendChatResponse,
  SettingsGetAgenticResponse,
  SettingsGetConcurrencyResponse,
  SettingsGetCopilotResponse,
  SettingsGetCopilotWeightsRequest,
  SettingsGetCopilotWeightsResponse,
  SettingsGetEnhancedAiConfigResponse,
  SettingsGetExtensionsResponse,
  SettingsGetMemoryResponse,
  SettingsGetPlannerResponse,
  SettingsGetPrivacyResponse,
  SettingsGetProactiveResponse,
  SettingsGetRagConfigResponse,
  SettingsGetRuntimeResponse,
  SettingsSetAgenticRequest,
  SettingsSetConcurrencyRequest,
  SettingsSetCopilotRequest,
  SettingsSetCopilotWeightsRequest,
  SettingsSetCopilotWeightsResponse,
  SettingsSetEnhancedAiConfigRequest,
  SettingsSetExtensionsRequest,
  SettingsSetMemoryRequest,
  SettingsSetPlannerRequest,
  SettingsSetPrivacyRequest,
  SettingsSetProactiveRequest,
  SettingsSetRagConfigRequest,
  SettingsSetRuntimeRequest,
  SkillAssignment,
  StopChatRequest,
  StopChatResponse,
  TeamXApi,
  TelemetryCompanyStatsRequest,
  TelemetryCompanyStatsResponse,
  TelemetryCostBreakdownRequest,
  TelemetryCostBreakdownRow,
  TelemetryDailyUsageRequest,
  TelemetryDailyUsageRow,
  TelemetryEmployeeStatsRequest,
  TelemetryEmployeeStatsRow,
  TelemetryRecentRunRow,
  TelemetryRecentRunsRequest,
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  TestProviderConnectionResponse,
  Thread,
  ThreadDigest,
  Ticket,
  TicketAttachment,
  TicketDetail,
  UnlinkCloudWorkspaceRequest,
  UnsubscribeFn,
  UpdateBudgetPolicyRequest,
  UpdateCheckResult,
  UpdateGoalRequest,
  UpdateInstallResult,
  UpdateProjectRequest,
  UpdateProviderRequest,
  UpdateRoutineRequest,
  UpdateRuntimeProfileRequest,
  UpdateScheduleItemRequest,
  UpdateTicketRequest,
  ValidateRuntimeProfileRequest,
  VaultDownloadResponse,
  VaultFile,
  VaultSearchResult,
  VaultStatsResponse,
  VaultUploadRequest,
  VaultUploadResponse,
  VaultVerifyResponse,
} from '@team-x/shared-types';

/**
 * Minimal structural subset of Electron's `IpcRenderer` that the
 * preload API factory actually uses. Kept intentionally narrow:
 *
 *   - `invoke` for the three request/response channels,
 *   - `on` to attach a dashboard-event listener,
 *   - `removeListener` to detach it inside the unsubscribe function
 *     we hand back to the renderer.
 *
 * The real `ipcRenderer` singleton from `'electron'` has a much
 * wider surface (`send`, `sendSync`, `postMessage`, `once`,
 * `removeAllListeners`, …). None of those are used by the Team-X
 * bridge; omitting them here makes the factory's test doubles
 * trivial to write.
 */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

/**
 * Channel name constants. Extracted to their own block so a grep for
 * a channel name hits exactly ONE location and so the main process's
 * register layer in `main/ipc/register.ts` can be diff-matched against
 * this file when the IPC contract changes. Mirrors the keys of
 * `IpcContract` in `@team-x/shared-types/ipc.ts`.
 *
 * Exception: the `localGguf.*` channels are registered by the dedicated
 * `registerLocalGguf*Handlers` functions wired in `main/index.ts`, not by
 * `register.ts`. Diff-match those against the `LOCAL_GGUF_*_CHANNELS`
 * tuples in `main/ipc/local-gguf-*-handlers.ts` instead.
 */
const CHANNELS = {
  systemSelectDirectory: 'system.selectDirectory',
  companiesList: 'companies.list',
  companiesExportPackage: 'companies.exportPackage',
  companiesPreviewImportPackage: 'companies.previewImportPackage',
  companiesImportPackage: 'companies.importPackage',
  companiesListTemplates: 'companies.listTemplates',
  companiesInstallTemplate: 'companies.installTemplate',
  companiesArchive: 'companies.archive',
  companiesCreate: 'companies.create',
  // Multi-company CRUD write-side (Phase 5.6 M-C step e; audit rows 10.13 + 10.15)
  companiesUpdate: 'companies.update',
  companiesDelete: 'companies.delete',
  employeesList: 'employees.list',
  operatorsList: 'operators.list',
  operatorsReadiness: 'operators.readiness',
  cloudGetWorkspaceLink: 'cloud.getWorkspaceLink',
  cloudLinkWorkspace: 'cloud.linkWorkspace',
  cloudUnlinkWorkspace: 'cloud.unlinkWorkspace',
  cloudReconnectWorkspace: 'cloud.reconnectWorkspace',
  operatorsListInvites: 'operators.listInvites',
  operatorsCreateInvite: 'operators.createInvite',
  operatorsRevokeInvite: 'operators.revokeInvite',
  operatorsAcceptInvite: 'operators.acceptInvite',
  runtimeProfilesList: 'runtimeProfiles.list',
  runtimeProfilesCreate: 'runtimeProfiles.create',
  runtimeProfilesUpdate: 'runtimeProfiles.update',
--- shared ipc import local?
/**
 * IPC contracts between the Team-X Electron main process and the
 * renderer. Two layers:
 *
 *   1. `IpcContract` — the low-level request/response shapes keyed
 *      by channel name. Used by the typed `ipcMain.handle` registration
 *      in `apps/desktop/src/main/ipc/register.ts` and by the generic
 *      helper types that derive per-channel argument and return types.
 *
 *   2. `TeamXApi` — the high-level bridge surface the preload exposes
 *      to the renderer via `contextBridge.exposeInMainWorld('teamx', ...)`.
 *      This is the shape the renderer consumes as `window.teamx`. It
 *      mirrors `IpcContract` but:
 *        - wraps each channel in an ergonomic method signature
 *          (positional args where it makes sense, single-object args
 *          where it doesn't),
 *        - adds a one-way event subscription (`events.onDashboard`)
 *          for the live dashboard stream,
 *        - returns an unsubscribe function from `onDashboard` so the
 *          renderer can clean up listeners on unmount.
 *
 * Keeping both layers here — in `@team-x/shared-types` — means:
 *   - preload can type-check its implementation against `TeamXApi`
 *     without cross-app imports,
 *   - the renderer's `window.d.ts` can import the same `TeamXApi`
 *     via the workspace package without reaching across rootDir
 *     boundaries into `apps/desktop/src/preload/`,
 *   - any change to a request or response shape lands in exactly one
 *     place and both sides of the bridge catch the diff at typecheck
 *     time.
 */

import type {
  CommandHistoryRequest,
  CommandParseRequest,
  CommandStopRequest,
  CommandStopResult,
  CommandSuggestRequest,
  IpcCommandHistoryEntry,
  IpcExecuteRequest,
  IpcExecuteResult,
  IpcParseResult,
  IpcSuggestItem,
} from './command.js';
import type {
  CopilotAskArgs,
  CopilotAskResult,
  CopilotConfigureArgs,
  CopilotConfigureResult,
  CopilotDismissArgs,
  CopilotDismissResult,
  CopilotExportRequest,
  CopilotExportResponse,
  CopilotInsightListArgs,
  CopilotInsightListResult,
} from './copilot.js';
import type {
  ApprovalDecisionStatus,
  ApprovalItem,
  ApprovalItemKind,
  ApprovalItemStatus,
  ArtifactRecord,
  AuthorityGrant,
  AuthorityRequest,
  AutonomyBenchmarkReport,
  AutonomyBenchmarkScenarioId,
  AutonomyDoctorReport,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  BudgetPolicyPeriod,
  BudgetScopeKind,
  ChatMessage,
  Company,
  CompanyCloudLinkStatus,
  CompanyImportPreview,
  CompanyPackageManifest,
  CompanyPackageMode,
  CompanyPackageSecretBinding,
  CompanySharingReadinessSummary,
  CompanyTemplateSummary,
  EffectiveAuthoritySnapshot,
  Employee,
  EmployeeRuntimeBinding,
  ExtensionSummary,
  ExtensionsAutonomyMode,
  Goal,
  Meeting,
  MeetingActionItem,
  MeetingMode,
  OperatorAccessEntry,
  OperatorInvite,
  OperatorMembershipRole,
  PackedThreadContext,
  Project,
  Routine,
  RoutineRun,
  RoutineSchedule,
  RoutineTicketWorkConfig,
  RunCheckpoint,
  RuntimeProfileKind,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
  RuntimeSession,
  ScheduleItem,
  ScheduleItemKind,
  ScheduleItemStatus,
  SharedOperatorAuthMode,
  SkillAssignment,
  Thread,
  ThreadDigest,
  Ticket,
  TicketCheckout,
  TicketPriority,
} from './entities.js';
import type {
  AgenticRunSnapshot,
  CopilotCategory,
  CopilotCategoryWeights,
  DashboardEvent,
} from './events.js';
import type { LocalGgufApi } from './local-gguf.js';
import type { PrivacyTier, ProviderConfig, ProviderKind } from './providers.js';

export type { CopilotCategoryWeights } from './events.js';

// ---------------------------------------------------------------------------
// Low-level request / response shapes
// ---------------------------------------------------------------------------

/**
 * `companies.archive` request (M33 T3 follow-up F3).
 *
 * Idempotent — if the company is already archived, the handler re-runs
 * the full three-step quiesce (analyzer stop, event-window clear,
 * status flip) and re-emits `company.archived`. That is intentional:
 * we would rather repeat the cleanup than silently skip it on a retry.
 */
export interface ArchiveCompanyRequest {
  companyId: string;
--- handlers
/**
 * IPC handlers for the localGguf.library.* channels.
 *
 * Phase 1: every handler is a typed stub that throws a not-implemented
 * error so callers fail fast and visibly. Phase 3 (library + scanning)
 * replaces these with real implementations against the LibraryService —
 * the registration function grows a `deps` argument at that point and the
 * single boot call-site in main/index.ts is updated.
 *
 * Return-type annotations encode the contract each channel must satisfy
 * once implemented; `notImplemented` returns `never`, which is assignable
 * to every annotated Promise.
 */

import type { AdvancedParams, LocalModel, WatchFolder } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

export const LOCAL_GGUF_LIBRARY_CHANNELS = [
  'localGguf.library.list',
  'localGguf.library.get',
  'localGguf.library.addFile',
  'localGguf.library.addFolder',
  'localGguf.library.removeModel',
  'localGguf.library.removeFolder',
  'localGguf.library.scanFolder',
  'localGguf.library.setSystemPrompt',
  'localGguf.library.setChatTemplate',
  'localGguf.library.setAdvancedParams',
  'localGguf.library.resetAdvanced',
  'localGguf.library.listBySourceType',
] as const;

export function registerLocalGgufLibraryHandlers(ipc: IpcMain): void {
  ipc.handle(
    'localGguf.library.list',
    async (): Promise<LocalModel[]> => notImplemented('localGguf.library.list'),
  );
  ipc.handle(
    'localGguf.library.get',
    async (): Promise<LocalModel | null> => notImplemented('localGguf.library.get'),
  );
  ipc.handle(
    'localGguf.library.addFile',
    async (): Promise<LocalModel> => notImplemented('localGguf.library.addFile'),
  );
  ipc.handle(
    'localGguf.library.addFolder',
    async (): Promise<WatchFolder> => notImplemented('localGguf.library.addFolder'),
  );
  ipc.handle(
    'localGguf.library.removeModel',
    async (): Promise<void> => notImplemented('localGguf.library.removeModel'),
  );
  ipc.handle(
    'localGguf.library.removeFolder',
    async (): Promise<void> => notImplemented('localGguf.library.removeFolder'),
  );
  ipc.handle(
    'localGguf.library.scanFolder',
    async (): Promise<{ addedCount: number; removedCount: number }> =>
      notImplemented('localGguf.library.scanFolder'),
  );
  ipc.handle(
    'localGguf.library.setSystemPrompt',
    async (): Promise<LocalModel> => notImplemented('localGguf.library.setSystemPrompt'),
  );
  ipc.handle(
    'localGguf.library.setChatTemplate',
    async (): Promise<LocalModel> => notImplemented('localGguf.library.setChatTemplate'),
  );
  ipc.handle(
    'localGguf.library.setAdvancedParams',
    async (): Promise<AdvancedParams> => notImplemented('localGguf.library.setAdvancedParams'),
  );
  ipc.handle(
    'localGguf.library.resetAdvanced',
    async (): Promise<AdvancedParams> => notImplemented('localGguf.library.resetAdvanced'),
  );
  ipc.handle(
    'localGguf.library.listBySourceType',
    async (): Promise<LocalModel[]> => notImplemented('localGguf.library.listBySourceType'),
  );
}
/**
 * IPC handlers for the localGguf.runtime.* and localGguf.pool.* channels.
 *
 * Phase 1: typed not-implemented stubs. Phase 2 (runtime + pool) replaces
 * them with real implementations against the RuntimeService (GPU probe,
 * backend selection, binaries version) and PoolService (LRU load/unload).
 */

import type { GpuInventory, LocalGgufRuntimeSettings } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

/** A loaded model's runtime handle, surfaced by the pool channels. */
export interface LoadedModelHandle {
  modelId: string;
  baseUrl: string;
  pid: number;
}

export const LOCAL_GGUF_RUNTIME_CHANNELS = [
  'localGguf.runtime.gpuInventory',
  'localGguf.runtime.reprobeGpu',
  'localGguf.runtime.settings',
  'localGguf.runtime.setSettings',
  'localGguf.runtime.binariesVersion',
  'localGguf.pool.status',
  'localGguf.pool.load',
  'localGguf.pool.unload',
  'localGguf.pool.setMaxConcurrent',
] as const;

export function registerLocalGgufRuntimeHandlers(ipc: IpcMain): void {
  ipc.handle(
    'localGguf.runtime.gpuInventory',
    async (): Promise<GpuInventory> => notImplemented('localGguf.runtime.gpuInventory'),
  );
  ipc.handle(
    'localGguf.runtime.reprobeGpu',
    async (): Promise<GpuInventory> => notImplemented('localGguf.runtime.reprobeGpu'),
  );
  ipc.handle(
    'localGguf.runtime.settings',
    async (): Promise<LocalGgufRuntimeSettings> => notImplemented('localGguf.runtime.settings'),
  );
  ipc.handle(
    'localGguf.runtime.setSettings',
    async (): Promise<LocalGgufRuntimeSettings> => notImplemented('localGguf.runtime.setSettings'),
  );
  ipc.handle(
    'localGguf.runtime.binariesVersion',
    async (): Promise<string> => notImplemented('localGguf.runtime.binariesVersion'),
  );
  ipc.handle(
    'localGguf.pool.status',
    async (): Promise<{ loaded: LoadedModelHandle[]; maxConcurrent: number }> =>
      notImplemented('localGguf.pool.status'),
  );
  ipc.handle(
    'localGguf.pool.load',
    async (): Promise<LoadedModelHandle> => notImplemented('localGguf.pool.load'),
  );
  ipc.handle(
    'localGguf.pool.unload',
    async (): Promise<void> => notImplemented('localGguf.pool.unload'),
  );
  ipc.handle(
    'localGguf.pool.setMaxConcurrent',
    async (): Promise<void> => notImplemented('localGguf.pool.setMaxConcurrent'),
  );
}
/**
 * IPC handlers for the localGguf.endpoint.* channels (remote LAN endpoints).
 *
 * Phase 1: typed not-implemented stubs. Phase 5 (endpoints UI / service)
 * replaces them with real implementations against the EndpointService.
 */

import type { LocalGgufError, RemoteEndpoint } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

/** Result of a localGguf.endpoint.test reachability probe. */
export interface EndpointTestResult {
  reachable: boolean;
  latencyMs?: number;
  error?: LocalGgufError;
}

export const LOCAL_GGUF_ENDPOINT_CHANNELS = [
  'localGguf.endpoint.list',
  'localGguf.endpoint.add',
  'localGguf.endpoint.remove',
  'localGguf.endpoint.test',
  'localGguf.endpoint.update',
] as const;

export function registerLocalGgufEndpointHandlers(ipc: IpcMain): void {
  ipc.handle(
    'localGguf.endpoint.list',
    async (): Promise<RemoteEndpoint[]> => notImplemented('localGguf.endpoint.list'),
  );
  ipc.handle(
    'localGguf.endpoint.add',
    async (): Promise<RemoteEndpoint> => notImplemented('localGguf.endpoint.add'),
  );
  ipc.handle(
    'localGguf.endpoint.remove',
    async (): Promise<void> => notImplemented('localGguf.endpoint.remove'),
  );
  ipc.handle(
    'localGguf.endpoint.test',
    async (): Promise<EndpointTestResult> => notImplemented('localGguf.endpoint.test'),
  );
  ipc.handle(
    'localGguf.endpoint.update',
    async (): Promise<RemoteEndpoint> => notImplemented('localGguf.endpoint.update'),
  );
}
/**
 * IPC handlers for the localGguf.hf.* channels (Hugging Face Hub browser).
 *
 * Phase 1: typed not-implemented stubs. Phase 7 (HF browser) replaces them
 * with real implementations against the HfService. The result shapes
 * (`HfSearchResult`, `HfModelCard`, `DownloadProgress`) live in
 * @team-x/shared-types so the preload bridge and renderer share one
 * definition with these handlers.
 */

import type { DownloadProgress, HfModelCard, HfSearchResult } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

export const LOCAL_GGUF_HF_CHANNELS = [
  'localGguf.hf.search',
  'localGguf.hf.modelCard',
  'localGguf.hf.startDownload',
  'localGguf.hf.pauseDownload',
  'localGguf.hf.resumeDownload',
  'localGguf.hf.cancelDownload',
  'localGguf.hf.activeDownloads',
] as const;

export function registerLocalGgufHfHandlers(ipc: IpcMain): void {
  ipc.handle(
    'localGguf.hf.search',
    async (): Promise<HfSearchResult[]> => notImplemented('localGguf.hf.search'),
  );
  ipc.handle(
    'localGguf.hf.modelCard',
    async (): Promise<HfModelCard> => notImplemented('localGguf.hf.modelCard'),
  );
  ipc.handle(
    'localGguf.hf.startDownload',
    async (): Promise<{ handleId: string }> => notImplemented('localGguf.hf.startDownload'),
  );
  ipc.handle(
    'localGguf.hf.pauseDownload',
    async (): Promise<void> => notImplemented('localGguf.hf.pauseDownload'),
  );
  ipc.handle(
    'localGguf.hf.resumeDownload',
    async (): Promise<void> => notImplemented('localGguf.hf.resumeDownload'),
  );
  ipc.handle(
    'localGguf.hf.cancelDownload',
    async (): Promise<void> => notImplemented('localGguf.hf.cancelDownload'),
  );
  ipc.handle(
    'localGguf.hf.activeDownloads',
    async (): Promise<DownloadProgress[]> => notImplemented('localGguf.hf.activeDownloads'),
  );
}
/**
 * IPC handlers for the localGguf.benchmark.* channels.
 *
 * Phase 1: typed not-implemented stubs. Phase 10 (benchmark runner)
 * replaces them with real implementations against the BenchmarkService.
 */

import type { BenchmarkResult } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

export const LOCAL_GGUF_BENCHMARK_CHANNELS = [
  'localGguf.benchmark.run',
  'localGguf.benchmark.history',
] as const;

export function registerLocalGgufBenchmarkHandlers(ipc: IpcMain): void {
  ipc.handle(
    'localGguf.benchmark.run',
    async (): Promise<BenchmarkResult> => notImplemented('localGguf.benchmark.run'),
  );
  ipc.handle(
    'localGguf.benchmark.history',
    async (): Promise<BenchmarkResult[]> => notImplemented('localGguf.benchmark.history'),
  );
}
/**
 * Shared thrower for Phase 1 localGguf IPC stubs.
 *
 * Every localGguf.* channel is registered in Phase 1 so the contract surface
 * exists, but the real logic lands in a later phase. Until then the handler
 * throws this — callers fail fast with a clear, greppable message instead of
 * silently receiving undefined. Returns `never`, so it satisfies any
 * handler's annotated return type.
 */
export function notImplemented(channel: string): never {
  throw new Error(`localGguf channel "${channel}" is not implemented yet (Phase 1 stub)`);
}

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'apps/desktop/src/preload/api.ts' -Pattern 'localGguf|binariesVersion|setAdvancedParams|resetAdvanced' -Context 5,12" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 7666ms:

  apps\desktop\src\preload\api.ts:304: * a channel name hits exactly ONE location and so the main process's
  apps\desktop\src\preload\api.ts:305: * register layer in `main/ipc/register.ts` can be diff-matched against
  apps\desktop\src\preload\api.ts:306: * this file when the IPC contract changes. Mirrors the keys of
  apps\desktop\src\preload\api.ts:307: * `IpcContract` in `@team-x/shared-types/ipc.ts`.
  apps\desktop\src\preload\api.ts:308: *
> apps\desktop\src\preload\api.ts:309: * Exception: the `[7mlocalGguf[0m.*` channels are registered by the dedicated[0m
> apps\desktop\src\preload\api.ts:310: * `register[7mLocalGguf[0m*Handlers` functions wired in `main/index.ts`, not by[0m
[7m[0m  apps\desktop\src\preload\api.ts:311: * `register.ts`. Diff-match those against the `LOCAL_GGUF_*_CHANNELS`[0m
[7m[0m  apps\desktop\src\preload\api.ts:312: * tuples in `main/ipc/local-gguf-*-handlers.ts` instead.[0m
[7m[0m  apps\desktop\src\preload\api.ts:313: */[0m
[7m[0m  apps\desktop\src\preload\api.ts:314:const CHANNELS = {[0m
[7m[0m  apps\desktop\src\preload\api.ts:315:  systemSelectDirectory: 'system.selectDirectory',[0m
[7m[0m  apps\desktop\src\preload\api.ts:316:  companiesList: 'companies.list',[0m
[7m[0m  apps\desktop\src\preload\api.ts:317:  companiesExportPackage: 'companies.exportPackage',[0m
[7m[0m  apps\desktop\src\preload\api.ts:318:  companiesPreviewImportPackage: 'companies.previewImportPackage',[0m
[7m[0m  apps\desktop\src\preload\api.ts:319:  companiesImportPackage: 'companies.importPackage',[0m
[7m[0m  apps\desktop\src\preload\api.ts:320:  companiesListTemplates: 'companies.listTemplates',[0m
[7m[0m  apps\desktop\src\preload\api.ts:321:  companiesInstallTemplate: 'companies.installTemplate',[0m
[7m[0m  apps\desktop\src\preload\api.ts:322:  companiesArchive: 'companies.archive',[0m
  apps\desktop\src\preload\api.ts:524:  proactiveDecomposeGoal: 'proactive.decomposeGoal',
  apps\desktop\src\preload\api.ts:525:  proactiveScanForWork: 'proactive.scanForWork',
  apps\desktop\src\preload\api.ts:526:  proactiveGetState: 'proactive.getState',
  apps\desktop\src\preload\api.ts:527:  // Local & Networked GGUF Support (v3.3.0 — Phase 1 contract surface).
  apps\desktop\src\preload\api.ts:528:  // library.* (Phase 3)
> apps\desktop\src\preload\api.ts:529:  [7mlocalGguf[0mLibraryList: 'localGguf.library.list',[0m
> apps\desktop\src\preload\api.ts:530:  [7mlocalGguf[0mLibraryGet: 'localGguf.library.get',
> apps\desktop\src\preload\api.ts:531:  [7mlocalGguf[0mLibraryAddFile: 'localGguf.library.addFile',
> apps\desktop\src\preload\api.ts:532:  [7mlocalGguf[0mLibraryAddFolder: 'localGguf.library.addFolder',
> apps\desktop\src\preload\api.ts:533:  [7mlocalGguf[0mLibraryRemoveModel: 'localGguf.library.removeModel',
> apps\desktop\src\preload\api.ts:534:  [7mlocalGguf[0mLibraryRemoveFolder: 'localGguf.library.removeFolder',
> apps\desktop\src\preload\api.ts:535:  [7mlocalGguf[0mLibraryScanFolder: 'localGguf.library.scanFolder',
> apps\desktop\src\preload\api.ts:536:  [7mlocalGguf[0mLibrarySetSystemPrompt: 'localGguf.library.setSystemPrompt',
> apps\desktop\src\preload\api.ts:537:  [7mlocalGguf[0mLibrarySetChatTemplate: 'localGguf.library.setChatTemplate',
> apps\desktop\src\preload\api.ts:538:  [7mlocalGguf[0mLibrarySetAdvancedParams: 'localGguf.library.setAdvancedParams',
> apps\desktop\src\preload\api.ts:539:  [7mlocalGguf[0mLibraryResetAdvanced: 'localGguf.library.resetAdvanced',
> apps\desktop\src\preload\api.ts:540:  [7mlocalGguf[0mLibraryListBySourceType: 'localGguf.library.listBySourceType',[0m
[7m[0m  apps\desktop\src\preload\api.ts:541:  // runtime.* + pool.* (Phase 2)[0m
> apps\desktop\src\preload\api.ts:542:  [7mlocalGguf[0mRuntimeGpuInventory: 'localGguf.runtime.gpuInventory',
> apps\desktop\src\preload\api.ts:543:  [7mlocalGguf[0mRuntimeReprobeGpu: 'localGguf.runtime.reprobeGpu',
> apps\desktop\src\preload\api.ts:544:  [7mlocalGguf[0mRuntimeSettings: 'localGguf.runtime.settings',
> apps\desktop\src\preload\api.ts:545:  [7mlocalGguf[0mRuntimeSetSettings: 'localGguf.runtime.setSettings',
> apps\desktop\src\preload\api.ts:546:  [7mlocalGguf[0mRuntimeBinariesVersion: 'localGguf.runtime.binariesVersion',
> apps\desktop\src\preload\api.ts:547:  [7mlocalGguf[0mPoolStatus: 'localGguf.pool.status',
> apps\desktop\src\preload\api.ts:548:  [7mlocalGguf[0mPoolLoad: 'localGguf.pool.load',
> apps\desktop\src\preload\api.ts:549:  [7mlocalGguf[0mPoolUnload: 'localGguf.pool.unload',
> apps\desktop\src\preload\api.ts:550:  [7mlocalGguf[0mPoolSetMaxConcurrent: 'localGguf.pool.setMaxConcurrent',[0m
[7m[0m  apps\desktop\src\preload\api.ts:551:  // endpoint.* (Phase 5)[0m
> apps\desktop\src\preload\api.ts:552:  [7mlocalGguf[0mEndpointList: 'localGguf.endpoint.list',
> apps\desktop\src\preload\api.ts:553:  [7mlocalGguf[0mEndpointAdd: 'localGguf.endpoint.add',
> apps\desktop\src\preload\api.ts:554:  [7mlocalGguf[0mEndpointRemove: 'localGguf.endpoint.remove',
> apps\desktop\src\preload\api.ts:555:  [7mlocalGguf[0mEndpointTest: 'localGguf.endpoint.test',
> apps\desktop\src\preload\api.ts:556:  [7mlocalGguf[0mEndpointUpdate: 'localGguf.endpoint.update',[0m
[7m[0m  apps\desktop\src\preload\api.ts:557:  // hf.* (Phase 7)[0m
> apps\desktop\src\preload\api.ts:558:  [7mlocalGguf[0mHfSearch: 'localGguf.hf.search',
> apps\desktop\src\preload\api.ts:559:  [7mlocalGguf[0mHfModelCard: 'localGguf.hf.modelCard',
> apps\desktop\src\preload\api.ts:560:  [7mlocalGguf[0mHfStartDownload: 'localGguf.hf.startDownload',
> apps\desktop\src\preload\api.ts:561:  [7mlocalGguf[0mHfPauseDownload: 'localGguf.hf.pauseDownload',
> apps\desktop\src\preload\api.ts:562:  [7mlocalGguf[0mHfResumeDownload: 'localGguf.hf.resumeDownload',
> apps\desktop\src\preload\api.ts:563:  [7mlocalGguf[0mHfCancelDownload: 'localGguf.hf.cancelDownload',
> apps\desktop\src\preload\api.ts:564:  [7mlocalGguf[0mHfActiveDownloads: 'localGguf.hf.activeDownloads',[0m
[7m[0m  apps\desktop\src\preload\api.ts:565:  // benchmark.* (Phase 10)[0m
> apps\desktop\src\preload\api.ts:566:  [7mlocalGguf[0mBenchmarkRun: 'localGguf.benchmark.run',
> apps\desktop\src\preload\api.ts:567:  [7mlocalGguf[0mBenchmarkHistory: 'localGguf.benchmark.history',[0m
[7m[0m  apps\desktop\src\preload\api.ts:568:} as const;[0m
[7m[0m  apps\desktop\src\preload\api.ts:569:[0m
[7m[0m  apps\desktop\src\preload\api.ts:570:function telemetryCompanyStatsRequest([0m
[7m[0m  apps\desktop\src\preload\api.ts:571:  req: string | TelemetryCompanyStatsRequest,[0m
[7m[0m  apps\desktop\src\preload\api.ts:572:): TelemetryCompanyStatsRequest {[0m
[7m[0m  apps\desktop\src\preload\api.ts:573:  return typeof req === 'string' ? { companyId: req } : req;[0m
[7m[0m  apps\desktop\src\preload\api.ts:574:}[0m
[7m[0m  apps\desktop\src\preload\api.ts:575:[0m
[7m[0m  apps\desktop\src\preload\api.ts:576:function telemetryEmployeeStatsRequest([0m
[7m[0m  apps\desktop\src\preload\api.ts:577:  req: string | TelemetryEmployeeStatsRequest,[0m
[7m[0m  apps\desktop\src\preload\api.ts:578:): TelemetryEmployeeStatsRequest {[0m
[7m[0m  apps\desktop\src\preload\api.ts:579:  return typeof req === 'string' ? { companyId: req } : req;[0m
  apps\desktop\src\preload\api.ts:1093:        ipc.invoke(CHANNELS.proactiveScanForWork, req) as 
Promise<ProactiveScanForWorkResponse>,
  apps\desktop\src\preload\api.ts:1094:      getState: (req: ProactiveGetStateRequest) =>
  apps\desktop\src\preload\api.ts:1095:        ipc.invoke(CHANNELS.proactiveGetState, req) as 
Promise<ProactiveGetStateResponse>,
  apps\desktop\src\preload\api.ts:1096:    },
  apps\desktop\src\preload\api.ts:1097:    // Local & Networked GGUF Support (v3.3.0). Every method routes through
> apps\desktop\src\preload\api.ts:1098:    // the captured `ipc` to a `[7mlocalGguf[0m.*` channel whose handler is a[0m
[7m[0m  apps\desktop\src\preload\api.ts:1099:    // Phase 1 not-implemented stub; the invoke rejects until the owning[0m
[7m[0m  apps\desktop\src\preload\api.ts:1100:    // phase lands the real handler. Return casts pin each call to the[0m
> apps\desktop\src\preload\api.ts:1101:    // `[7mLocalGguf[0mApi` contract in @team-x/shared-types via `ReturnType<…>`[0m
[7m[0m  apps\desktop\src\preload\api.ts:1102:    // so no domain types need importing into this file.[0m
> apps\desktop\src\preload\api.ts:1103:    [7mlocalGguf[0m: {[0m
[7m[0m  apps\desktop\src\preload\api.ts:1104:      library: {[0m
[7m[0m  apps\desktop\src\preload\api.ts:1105:        list: () =>[0m
> apps\desktop\src\preload\api.ts:1106:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryList) as ReturnType<
> apps\desktop\src\preload\api.ts:1107:            TeamXApi['[7mlocalGguf[0m']['library']['list'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1108:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1109:        get: (id: string) =>[0m
> apps\desktop\src\preload\api.ts:1110:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryGet, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1111:            TeamXApi['[7mlocalGguf[0m']['library']['get'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1112:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1113:        addFile: (path: string) =>[0m
> apps\desktop\src\preload\api.ts:1114:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryAddFile, path) as ReturnType<
> apps\desktop\src\preload\api.ts:1115:            TeamXApi['[7mlocalGguf[0m']['library']['addFile'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1116:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1117:        addFolder: (path: string, recursive: boolean) =>[0m
> apps\desktop\src\preload\api.ts:1118:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryAddFolder, [0m[7m[0mpath, [0m[7m[0mrecursive) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1119:            TeamXApi['[7mlocalGguf[0m']['library']['addFolder'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1120:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1121:        removeModel: (id: string) =>[0m
> apps\desktop\src\preload\api.ts:1122:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryRemoveModel, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1123:            TeamXApi['[7mlocalGguf[0m']['library']['removeModel'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1124:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1125:        removeFolder: (id: string) =>[0m
> apps\desktop\src\preload\api.ts:1126:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryRemoveFolder, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1127:            TeamXApi['[7mlocalGguf[0m']['library']['removeFolder'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1128:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1129:        scanFolder: (id: string) =>[0m
> apps\desktop\src\preload\api.ts:1130:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryScanFolder, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1131:            TeamXApi['[7mlocalGguf[0m']['library']['scanFolder'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1132:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1133:        setSystemPrompt: (id: string, prompt: string | null) =>[0m
> apps\desktop\src\preload\api.ts:1134:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibrarySetSystemPrompt, [0m[7m[0mid, [0m[7m[0mprompt) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1135:            TeamXApi['[7mlocalGguf[0m']['library']['setSystemPrompt'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1136:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1137:        setChatTemplate: (id: string, template: string | null) =>[0m
> apps\desktop\src\preload\api.ts:1138:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibrarySetChatTemplate, [0m[7m[0mid, [0m[7m[0mtemplate) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1139:            TeamXApi['[7mlocalGguf[0m']['library']['setChatTemplate'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1140:          >,[0m
> apps\desktop\src\preload\api.ts:1141:        [7msetAdvancedParams[0m: ([0m
[7m[0m  apps\desktop\src\preload\api.ts:1142:          id: string,[0m
> apps\desktop\src\preload\api.ts:1143:          params: 
Parameters<TeamXApi['[7mlocalGguf[0m']['library']['setAdvancedParams']>[1],[0m
[7m[0m  apps\desktop\src\preload\api.ts:1144:        ) =>[0m
> apps\desktop\src\preload\api.ts:1145:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibrarySetAdvancedParams, [0m[7m[0mid, [0m[7m[0mparams) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1146:            TeamXApi['[7mlocalGguf[0m']['library']['setAdvancedParams'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1147:          >,[0m
> apps\desktop\src\preload\api.ts:1148:        [7mresetAdvanced[0m: (id: string) =>
> apps\desktop\src\preload\api.ts:1149:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryResetAdvanced, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1150:            TeamXApi['[7mlocalGguf[0m']['library']['resetAdvanced'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1151:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1152:        listBySourceType: ([0m
> apps\desktop\src\preload\api.ts:1153:          sourceType: 
Parameters<TeamXApi['[7mlocalGguf[0m']['library']['listBySourceType']>[0],[0m
[7m[0m  apps\desktop\src\preload\api.ts:1154:        ) =>[0m
> apps\desktop\src\preload\api.ts:1155:          ipc.invoke(CHANNELS.[7mlocalGguf[0mLibraryListBySourceType, [0m[7m[0msourceType) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1156:            TeamXApi['[7mlocalGguf[0m']['library']['listBySourceType'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1157:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1158:      },[0m
[7m[0m  apps\desktop\src\preload\api.ts:1159:      runtime: {[0m
[7m[0m  apps\desktop\src\preload\api.ts:1160:        gpuInventory: () =>[0m
> apps\desktop\src\preload\api.ts:1161:          ipc.invoke(CHANNELS.[7mlocalGguf[0mRuntimeGpuInventory) as ReturnType<
> apps\desktop\src\preload\api.ts:1162:            TeamXApi['[7mlocalGguf[0m']['runtime']['gpuInventory'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1163:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1164:        reprobeGpu: () =>[0m
> apps\desktop\src\preload\api.ts:1165:          ipc.invoke(CHANNELS.[7mlocalGguf[0mRuntimeReprobeGpu) as ReturnType<
> apps\desktop\src\preload\api.ts:1166:            TeamXApi['[7mlocalGguf[0m']['runtime']['reprobeGpu'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1167:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1168:        settings: () =>[0m
> apps\desktop\src\preload\api.ts:1169:          ipc.invoke(CHANNELS.[7mlocalGguf[0mRuntimeSettings) as ReturnType<
> apps\desktop\src\preload\api.ts:1170:            TeamXApi['[7mlocalGguf[0m']['runtime']['settings'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1171:          >,[0m
> apps\desktop\src\preload\api.ts:1172:        setSettings: (partial: 
Parameters<TeamXApi['[7mlocalGguf[0m']['runtime']['setSettings']>[0]) [0m[7m[0m=>[0m
> apps\desktop\src\preload\api.ts:1173:          ipc.invoke(CHANNELS.[7mlocalGguf[0mRuntimeSetSettings, [0m[7m[0mpartial) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1174:            TeamXApi['[7mlocalGguf[0m']['runtime']['setSettings'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1175:          >,[0m
> apps\desktop\src\preload\api.ts:1176:        [7mbinariesVersion[0m: () =>
> apps\desktop\src\preload\api.ts:1177:          ipc.invoke(CHANNELS.[7mlocalGguf[0mRuntimeBinariesVersion) as ReturnType<
> apps\desktop\src\preload\api.ts:1178:            TeamXApi['[7mlocalGguf[0m']['runtime']['binariesVersion'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1179:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1180:      },[0m
[7m[0m  apps\desktop\src\preload\api.ts:1181:      pool: {[0m
[7m[0m  apps\desktop\src\preload\api.ts:1182:        status: () =>[0m
> apps\desktop\src\preload\api.ts:1183:          ipc.invoke(CHANNELS.[7mlocalGguf[0mPoolStatus) as ReturnType<
> apps\desktop\src\preload\api.ts:1184:            TeamXApi['[7mlocalGguf[0m']['pool']['status'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1185:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1186:        load: (id: string) =>[0m
> apps\desktop\src\preload\api.ts:1187:          ipc.invoke(CHANNELS.[7mlocalGguf[0mPoolLoad, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1188:            TeamXApi['[7mlocalGguf[0m']['pool']['load'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1189:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1190:        unload: (id: string) =>[0m
> apps\desktop\src\preload\api.ts:1191:          ipc.invoke(CHANNELS.[7mlocalGguf[0mPoolUnload, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1192:            TeamXApi['[7mlocalGguf[0m']['pool']['unload'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1193:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1194:        setMaxConcurrent: (n: number) =>[0m
> apps\desktop\src\preload\api.ts:1195:          ipc.invoke(CHANNELS.[7mlocalGguf[0mPoolSetMaxConcurrent, n) as ReturnType<
> apps\desktop\src\preload\api.ts:1196:            TeamXApi['[7mlocalGguf[0m']['pool']['setMaxConcurrent'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1197:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1198:      },[0m
[7m[0m  apps\desktop\src\preload\api.ts:1199:      endpoint: {[0m
[7m[0m  apps\desktop\src\preload\api.ts:1200:        list: () =>[0m
> apps\desktop\src\preload\api.ts:1201:          ipc.invoke(CHANNELS.[7mlocalGguf[0mEndpointList) as ReturnType<
> apps\desktop\src\preload\api.ts:1202:            TeamXApi['[7mlocalGguf[0m']['endpoint']['list'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1203:          >,[0m
> apps\desktop\src\preload\api.ts:1204:        add: (config: Parameters<TeamXApi['[7mlocalGguf[0m']['endpoint']['add']>[0]) [0m
[7m[0m=>[0m
> apps\desktop\src\preload\api.ts:1205:          ipc.invoke(CHANNELS.[7mlocalGguf[0mEndpointAdd, config) as ReturnType<
> apps\desktop\src\preload\api.ts:1206:            TeamXApi['[7mlocalGguf[0m']['endpoint']['add'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1207:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1208:        remove: (id: string) =>[0m
> apps\desktop\src\preload\api.ts:1209:          ipc.invoke(CHANNELS.[7mlocalGguf[0mEndpointRemove, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1210:            TeamXApi['[7mlocalGguf[0m']['endpoint']['remove'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1211:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1212:        test: (id: string) =>[0m
> apps\desktop\src\preload\api.ts:1213:          ipc.invoke(CHANNELS.[7mlocalGguf[0mEndpointTest, id) as ReturnType<
> apps\desktop\src\preload\api.ts:1214:            TeamXApi['[7mlocalGguf[0m']['endpoint']['test'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1215:          >,[0m
> apps\desktop\src\preload\api.ts:1216:        update: (id: string, partial: 
Parameters<TeamXApi['[7mlocalGguf[0m']['endpoint']['update']>[1]) [0m[7m[0m=>[0m
> apps\desktop\src\preload\api.ts:1217:          ipc.invoke(CHANNELS.[7mlocalGguf[0mEndpointUpdate, [0m[7m[0mid, [0m[7m[0mpartial) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1218:            TeamXApi['[7mlocalGguf[0m']['endpoint']['update'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1219:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1220:      },[0m
[7m[0m  apps\desktop\src\preload\api.ts:1221:      hf: {[0m
[7m[0m  apps\desktop\src\preload\api.ts:1222:        search: (query: string, filters: Record<string, unknown>) =>[0m
> apps\desktop\src\preload\api.ts:1223:          ipc.invoke(CHANNELS.[7mlocalGguf[0mHfSearch, query, filters) as ReturnType<
> apps\desktop\src\preload\api.ts:1224:            TeamXApi['[7mlocalGguf[0m']['hf']['search'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1225:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1226:        modelCard: (repoId: string) =>[0m
> apps\desktop\src\preload\api.ts:1227:          ipc.invoke(CHANNELS.[7mlocalGguf[0mHfModelCard, repoId) as ReturnType<
> apps\desktop\src\preload\api.ts:1228:            TeamXApi['[7mlocalGguf[0m']['hf']['modelCard'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1229:          >,[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.ts:1230: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mstartDownload: [0m[7m[0m(repoId: [0m[7m[0mstring, [0m[7m[0mfilename: [0m[7m[0mstring, [0m[7m[0mtargetFolder: [0m[7m[0mstring) [0m
[7m[0m=>[0m
[7m[0m  apps\desktop\src\preload\api.ts:1231:          ipc.invoke([0m
> apps\desktop\src\preload\api.ts:1232:            CHANNELS.[7mlocalGguf[0mHfStartDownload,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1233:            repoId,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1234:            filename,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1235:            targetFolder,[0m
> apps\desktop\src\preload\api.ts:1236:          ) as ReturnType<TeamXApi['[7mlocalGguf[0m']['hf']['startDownload']>,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1237:        pauseDownload: (handleId: string) =>[0m
> apps\desktop\src\preload\api.ts:1238:          ipc.invoke(CHANNELS.[7mlocalGguf[0mHfPauseDownload, handleId) as ReturnType<
> apps\desktop\src\preload\api.ts:1239:            TeamXApi['[7mlocalGguf[0m']['hf']['pauseDownload'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1240:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1241:        resumeDownload: (handleId: string) =>[0m
> apps\desktop\src\preload\api.ts:1242:          ipc.invoke(CHANNELS.[7mlocalGguf[0mHfResumeDownload, [0m[7m[0mhandleId) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1243:            TeamXApi['[7mlocalGguf[0m']['hf']['resumeDownload'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1244:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1245:        cancelDownload: (handleId: string) =>[0m
> apps\desktop\src\preload\api.ts:1246:          ipc.invoke(CHANNELS.[7mlocalGguf[0mHfCancelDownload, [0m[7m[0mhandleId) [0m[7m[0mas [0m
[7m[0mReturnType<[0m
> apps\desktop\src\preload\api.ts:1247:            TeamXApi['[7mlocalGguf[0m']['hf']['cancelDownload'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1248:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1249:        activeDownloads: () =>[0m
> apps\desktop\src\preload\api.ts:1250:          ipc.invoke(CHANNELS.[7mlocalGguf[0mHfActiveDownloads) as ReturnType<
> apps\desktop\src\preload\api.ts:1251:            TeamXApi['[7mlocalGguf[0m']['hf']['activeDownloads'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1252:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1253:      },[0m
[7m[0m  apps\desktop\src\preload\api.ts:1254:      benchmark: {[0m
[7m[0m  apps\desktop\src\preload\api.ts:1255:        run: (modelId: string) =>[0m
> apps\desktop\src\preload\api.ts:1256:          ipc.invoke(CHANNELS.[7mlocalGguf[0mBenchmarkRun, modelId) as ReturnType<
> apps\desktop\src\preload\api.ts:1257:            TeamXApi['[7mlocalGguf[0m']['benchmark']['run'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1258:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1259:        history: (modelId: string) =>[0m
> apps\desktop\src\preload\api.ts:1260:          ipc.invoke(CHANNELS.[7mlocalGguf[0mBenchmarkHistory, modelId) as ReturnType<
> apps\desktop\src\preload\api.ts:1261:            TeamXApi['[7mlocalGguf[0m']['benchmark']['history'][0m
[7m[0m  apps\desktop\src\preload\api.ts:1262:          >,[0m
[7m[0m  apps\desktop\src\preload\api.ts:1263:      },[0m
[7m[0m  apps\desktop\src\preload\api.ts:1264:    },[0m
[7m[0m  apps\desktop\src\preload\api.ts:1265:  };[0m
[7m[0m  apps\desktop\src\preload\api.ts:1266:}[0m
[7m[0m  apps\desktop\src\preload\api.ts:1267:[0m
[7m[0m  apps\desktop\src\preload\api.ts:1268:/**[0m
[7m[0m  apps\desktop\src\preload\api.ts:1269: * Channel name constants — exported primarily for tests that want to[0m
[7m[0m  apps\desktop\src\preload\api.ts:1270: * verify the preload invokes the right strings without string-comparing[0m
[7m[0m  apps\desktop\src\preload\api.ts:1271: * literals. The main process's register layer has its own copy of the[0m
> apps\desktop\src\preload\api.ts:1272: * same constants (for `[7mlocalGguf[0m.*`, the `LOCAL_GGUF_*_CHANNELS` tuples in[0m
[7m[0m  apps\desktop\src\preload\api.ts:1273: * `main/ipc/local-gguf-*-handlers.ts`); if either side drifts, the[0m
[7m[0m  apps\desktop\src\preload\api.ts:1274: * renderer's invoke lands on a ghost handler and the handler's[0m
[7m[0m  apps\desktop\src\preload\api.ts:1275: * `ipcMain.handle` never fires.[0m
[7m[0m  apps\desktop\src\preload\api.ts:1276: */[0m
[7m[0m  apps\desktop\src\preload\api.ts:1277:export { CHANNELS as PRELOAD_CHANNELS };[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'apps/desktop/src/main/services/runtime-settings/local-gguf-settings.ts'; Write-Host '--- tests'; Get-Content -LiteralPath 'apps/desktop/src/main/services/runtime-settings/local-gguf-settings.test.ts'" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 8473ms:
/**
 * Typed accessor for the `localGguf.*` settings namespace, layered on top of
 * the app's existing key-value settings store (v3.3.0 local GGUF support,
 * spec § 7 runtime settings).
 *
 * The accessor depends only on a tiny `LocalGgufSettingsStore` interface
 * (get/set by string key), not on the concrete settings repo. Phase 2 wires
 * the real store by adapting the settings repo's getRaw/set with JSON
 * (de)serialization. Phase 1 unit-tests it against an in-memory map.
 *
 * Each field of LocalGgufRuntimeSettings persists under a `localGguf.<key>`
 * entry; reads overlay persisted values on DEFAULT_LOCAL_GGUF_SETTINGS so a
 * partially-written store still returns a complete, valid settings object.
 */

import type { GpuBackend, LocalGgufRuntimeSettings } from '@team-x/shared-types';

export interface LocalGgufSettingsStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

export interface LocalGgufSettingsAccessor {
  get(): LocalGgufRuntimeSettings;
  updateBackend(backend: GpuBackend, autoDetected: boolean): void;
  recordFallback(backend: GpuBackend, reason: string): void;
  setMaxConcurrent(n: number): void;
  setDefaultLibraryFolder(path: string | null): void;
  setEmbeddingModelId(id: string | null): void;
  setHfTokenKeyRef(ref: string | null): void;
  setLlamaBinariesVersion(version: string): void;
}

export const DEFAULT_LOCAL_GGUF_SETTINGS: LocalGgufRuntimeSettings = {
  activeBackend: 'cpu',
  activeBackendIsAutoDetected: true,
  autoFallbackReason: null,
  maxConcurrentLocalModels: 1,
  defaultLibraryFolder: null,
  embeddingModelId: null,
  hfTokenKeyRef: null,
  llamaBinariesVersion: 'unknown',
};

const KEYS = {
  activeBackend: 'localGguf.activeBackend',
  activeBackendIsAutoDetected: 'localGguf.activeBackendIsAutoDetected',
  autoFallbackReason: 'localGguf.autoFallbackReason',
  maxConcurrentLocalModels: 'localGguf.maxConcurrentLocalModels',
  defaultLibraryFolder: 'localGguf.defaultLibraryFolder',
  embeddingModelId: 'localGguf.embeddingModelId',
  hfTokenKeyRef: 'localGguf.hfTokenKeyRef',
  llamaBinariesVersion: 'localGguf.llamaBinariesVersion',
} as const;

export function createLocalGgufSettingsAccessor(
  store: LocalGgufSettingsStore,
): LocalGgufSettingsAccessor {
  return {
    get(): LocalGgufRuntimeSettings {
      return {
        activeBackend:
          store.get<GpuBackend>(KEYS.activeBackend) ?? DEFAULT_LOCAL_GGUF_SETTINGS.activeBackend,
        activeBackendIsAutoDetected:
          store.get<boolean>(KEYS.activeBackendIsAutoDetected) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.activeBackendIsAutoDetected,
        autoFallbackReason:
          store.get<string | null>(KEYS.autoFallbackReason) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.autoFallbackReason,
        maxConcurrentLocalModels:
          store.get<number>(KEYS.maxConcurrentLocalModels) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.maxConcurrentLocalModels,
        defaultLibraryFolder:
          store.get<string | null>(KEYS.defaultLibraryFolder) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.defaultLibraryFolder,
        embeddingModelId:
          store.get<string | null>(KEYS.embeddingModelId) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.embeddingModelId,
        hfTokenKeyRef:
          store.get<string | null>(KEYS.hfTokenKeyRef) ?? DEFAULT_LOCAL_GGUF_SETTINGS.hfTokenKeyRef,
        llamaBinariesVersion:
          store.get<string>(KEYS.llamaBinariesVersion) ??
          DEFAULT_LOCAL_GGUF_SETTINGS.llamaBinariesVersion,
      };
    },

    /** Set the active backend + whether it was auto-detected; clears any prior fallback reason. */
    updateBackend(backend: GpuBackend, autoDetected: boolean): void {
      store.set(KEYS.activeBackend, backend);
      store.set(KEYS.activeBackendIsAutoDetected, autoDetected);
      store.set<string | null>(KEYS.autoFallbackReason, null);
    },

    /** Record a forced fallback to another backend, capturing the reason. */
    recordFallback(backend: GpuBackend, reason: string): void {
      store.set(KEYS.activeBackend, backend);
      store.set(KEYS.activeBackendIsAutoDetected, false);
      store.set(KEYS.autoFallbackReason, reason);
    },

    setMaxConcurrent(n: number): void {
      if (n < 1) throw new Error('maxConcurrentLocalModels must be at least 1');
      store.set(KEYS.maxConcurrentLocalModels, Math.floor(n));
    },

    setDefaultLibraryFolder(path: string | null): void {
      store.set(KEYS.defaultLibraryFolder, path);
    },

    setEmbeddingModelId(id: string | null): void {
      store.set(KEYS.embeddingModelId, id);
    },

    setHfTokenKeyRef(ref: string | null): void {
      store.set(KEYS.hfTokenKeyRef, ref);
    },

    setLlamaBinariesVersion(version: string): void {
      store.set(KEYS.llamaBinariesVersion, version);
    },
  };
}
--- tests
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCAL_GGUF_SETTINGS,
  type LocalGgufSettingsAccessor,
  type LocalGgufSettingsStore,
  createLocalGgufSettingsAccessor,
} from './local-gguf-settings.js';

function inMemoryStore(): LocalGgufSettingsStore {
  const m = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return m.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      m.set(key, value);
    },
  };
}

describe('localGgufSettingsAccessor', () => {
  let store: LocalGgufSettingsStore;
  let accessor: LocalGgufSettingsAccessor;

  beforeEach(() => {
    store = inMemoryStore();
    accessor = createLocalGgufSettingsAccessor(store);
  });

  it('returns defaults when the store is empty', () => {
    expect(accessor.get()).toEqual(DEFAULT_LOCAL_GGUF_SETTINGS);
  });

  it('overlays persisted values on the defaults', () => {
    store.set('localGguf.activeBackend', 'cuda');
    store.set('localGguf.maxConcurrentLocalModels', 3);
    const s = accessor.get();
    expect(s.activeBackend).toBe('cuda');
    expect(s.maxConcurrentLocalModels).toBe(3);
    expect(s.activeBackendIsAutoDetected).toBe(
      DEFAULT_LOCAL_GGUF_SETTINGS.activeBackendIsAutoDetected,
    );
  });

  it('updateBackend persists backend + autoDetected and clears the fallback reason', () => {
    accessor.recordFallback('vulkan', 'stale');
    accessor.updateBackend('cuda', true);
    const s = accessor.get();
    expect(s.activeBackend).toBe('cuda');
    expect(s.activeBackendIsAutoDetected).toBe(true);
    expect(s.autoFallbackReason).toBeNull();
  });

  it('recordFallback stores the reason and flips activeBackendIsAutoDetected to false', () => {
    accessor.updateBackend('cuda', true);
    accessor.recordFallback('vulkan', 'CUDA initialization failed');
    const s = accessor.get();
    expect(s.activeBackend).toBe('vulkan');
    expect(s.activeBackendIsAutoDetected).toBe(false);
    expect(s.autoFallbackReason).toBe('CUDA initialization failed');
  });

  it('setMaxConcurrent rejects values < 1', () => {
    expect(() => accessor.setMaxConcurrent(0)).toThrow(/at least 1/i);
    expect(() => accessor.setMaxConcurrent(-1)).toThrow(/at least 1/i);
  });

  it('setMaxConcurrent floors and persists valid values', () => {
    accessor.setMaxConcurrent(4.9);
    expect(accessor.get().maxConcurrentLocalModels).toBe(4);
  });

  it('setDefaultLibraryFolder persists and clears', () => {
    accessor.setDefaultLibraryFolder('/Users/rocky/models');
    expect(accessor.get().defaultLibraryFolder).toBe('/Users/rocky/models');
    accessor.setDefaultLibraryFolder(null);
    expect(accessor.get().defaultLibraryFolder).toBeNull();
  });

  it('setEmbeddingModelId persists', () => {
    accessor.setEmbeddingModelId('mod-uuid');
    expect(accessor.get().embeddingModelId).toBe('mod-uuid');
  });

  it('setHfTokenKeyRef persists', () => {
    accessor.setHfTokenKeyRef('team-x.local-gguf.hf-token');
    expect(accessor.get().hfTokenKeyRef).toBe('team-x.local-gguf.hf-token');
  });

  it('setLlamaBinariesVersion persists', () => {
    accessor.setLlamaBinariesVersion('b9371');
    expect(accessor.get().llamaBinariesVersion).toBe('b9371');
  });
});

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content package.json; Write-Host '--- runtime pkg'; Get-Content packages/local-gguf-runtime/package.json; Get-Content packages/local-gguf-runtime/tsconfig.json; Get-Content packages/local-gguf-runtime/src/index.ts; Get-Content packages/local-gguf-runtime/src/errors.ts; Get-Content packages/shared-types/src/index.ts" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 7162ms:
{
  "name": "team-x",
  "version": "3.2.1",
  "llamaCppRelease": "b9371",
  "private": true,
  "type": "module",
  "description": "Run an AI company. Not a prompt.",
  "license": "MIT",
  "author": "Rocky Elsalaymeh",
  "engines": {
    "node": ">=22.13.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.15.9",
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "lint:eslint": "pnpm -F @team-x/desktop lint",
    "lint:eslint:fix": "pnpm -F @team-x/desktop lint:fix",
    "format": "biome format --write .",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "build": "pnpm -r build",
    "dev": "pnpm -F @team-x/desktop dev",
    "dist": "pnpm -F @team-x/desktop dist",
    "dist:win": "pnpm -F @team-x/desktop dist:win",
    "dist:mac": "pnpm -F @team-x/desktop dist:mac",
    "dist:linux": "pnpm -F @team-x/desktop dist:linux",
    "dist:publish": "pnpm -F @team-x/desktop dist:publish",
    "sign:pack": "npx tsx scripts/sign-pack.mjs strategia-official",
    "sign:pack:keygen": "npx tsx scripts/generate-pack-key.mjs strategia-official",
    "audit:claims": "node scripts/check-claim-evidence.mjs",
    "audit:claims:strict": "node scripts/check-claim-evidence.mjs --strict",
    "audit:claims:json": "node scripts/check-claim-evidence.mjs --json",
    "autonomy:doctor": "node scripts/autonomy-doctor.mjs",
    "autonomy:benchmark": "pnpm -F @team-x/desktop autonomy:benchmark",
    "clean": "pnpm -r exec rimraf dist out .turbo && rimraf node_modules"
  },
  "devDependencies": {
    "@biomejs/biome": "~1.9.4",
    "@eslint/js": "^9.18.0",
    "@types/node": "^20.19.39",
    "@vitest/coverage-v8": "^2.1.9",
    "eslint": "^9.18.0",
    "eslint-import-resolver-typescript": "^3.7.0",
    "eslint-plugin-import": "^2.31.0",
    "eslint-plugin-jsx-a11y": "^6.10.2",
    "eslint-plugin-react": "^7.37.2",
    "eslint-plugin-react-hooks": "^5.1.0",
    "@typescript-eslint/eslint-plugin": "^8.19.1",
    "@typescript-eslint/parser": "^8.19.1",
    "globals": "^15.14.0",
    "rimraf": "^6.1.3",
    "typescript": "^5.5.4",
    "vitest": "^2.1.9"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["electron", "keytar"]
  }
}
--- runtime pkg
{
  "name": "@team-x/local-gguf-runtime",
  "version": "3.2.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./errors": "./src/errors.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@team-x/shared-types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "vitest": "^2"
  }
}
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "outDir": "./dist",
    "noEmit": false,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx"],
  "references": [{ "path": "../shared-types" }]
}
// Public exports for @team-x/local-gguf-runtime.
// Phase 1 ships only the errors re-export; subsequent phases extend this
// surface with the GPU probe, llama-server lifecycle, LRU pool, HF client,
// GGUF metadata parser, and benchmark runner.

export * from './errors.js';
// packages/local-gguf-runtime/src/errors.ts
//
// Re-exports the canonical LocalGgufError union from @team-x/shared-types
// (a direct dependency of this package). The re-export gives runtime
// consumers a single import surface — `@team-x/local-gguf-runtime` — for
// both the error helpers and the runtime APIs that later phases add here,
// so call sites don't reach into shared-types for error types separately.

export { isLocalGgufError, type GpuBackend, type LocalGgufError } from '@team-x/shared-types';
export const SHARED_TYPES_VERSION = '0.0.1';

export * from './roles.js';
export * from './providers.js';
export * from './entities.js';
export * from './events.js';
export * from './ipc.js';
export * from './rag.js';
export * from './command.js';
export * from './copilot.js';
export * from './capabilities.js';
export * from './trace.js';
export * from './local-gguf.js';

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content pnpm-workspace.yaml; Get-ChildItem packages | Select-Object Name' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 3404ms:
packages:
  - "apps/*"
  - "packages/*"

[32;1mName[0m
[32;1m----[0m
intelligence
local-gguf-runtime
provider-router
role-schema
shared-types
telemetry-core


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'apps/desktop/src/main/db/0036-local-gguf-migration.test.ts'" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 6129ms:
/**
 * Migration 0036 — Local & Networked GGUF Support table verification
 * (v3.3.0 — Phase 1, spec § 7).
 *
 * Pure migration-shape test — the repos land in sibling tasks. Modeled on
 * `0013-org-edges-migration.test.ts`: drives the real migration chain through
 * `makeTestDb()` (sql.js + `PRAGMA foreign_keys = ON`) and introspects with
 * PRAGMA against `ctx.raw`. Verifies:
 *   1. All five tables exist with the expected column inventory + PKs.
 *   2. Indexes present (4 on local_models, 1 on benchmarks, 1 on watch_folders).
 *   3. ON DELETE CASCADE: endpoint → models, model → advanced_params, model →
 *      benchmarks.
 *   4. CHECK constraints fire: source_type union, status union, privacy_tier,
 *      boolean 0/1 domains, and the source-shape cross-constraint.
 *   5. The forward migration applies in well under 100 ms on an empty DB
 *      (Phase 1 structural perf target — master plan § CR-6).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from './test-helpers.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const migration0036Path = join(thisDir, 'migrations', '0036_local_gguf.sql');

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

const NOW = 1779081600000;

describe('migration 0036 — local gguf tables', () => {
  let ctx: TestDbHandle;

  beforeEach(async () => {
    ctx = await makeTestDb();
  });

  afterEach(() => {
    ctx.close();
  });

  function tableInfo(name: string): TableInfoRow[] {
    const stmt = ctx.raw.prepare(`PRAGMA table_info('${name}')`);
    const rows: TableInfoRow[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as TableInfoRow);
    stmt.free();
    return rows;
  }

  function indexNames(table: string): string[] {
    const stmt = ctx.raw.prepare(`PRAGMA index_list('${table}')`);
    const names: string[] = [];
    while (stmt.step()) names.push((stmt.getAsObject() as unknown as IndexListRow).name);
    stmt.free();
    return names;
  }

  function count(table: string): number {
    const stmt = ctx.raw.prepare(`SELECT COUNT(*) AS c FROM ${table}`);
    stmt.step();
    const { c } = stmt.getAsObject() as { c: number };
    stmt.free();
    return c;
  }

  function insertEndpoint(id: string): void {
    ctx.raw.run(
      `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
       VALUES (?, ?, ?, 'Local', 'unknown', ?, ?)`,
      [id, `EP ${id}`, 'http://192.168.1.50:1234', NOW, NOW],
    );
  }

  function insertFileModel(id: string): void {
    ctx.raw.run(
      `INSERT INTO local_models (id, display_name, source_type, source_path, created_at, updated_at)
       VALUES (?, ?, 'file', ?, ?, ?)`,
      [id, `M ${id}`, `/models/${id}.gguf`, NOW, NOW],
    );
  }

  // ---------------------------------------------------------------------------
  // 1. Tables + columns
  // ---------------------------------------------------------------------------

  it('creates all five local-gguf tables', () => {
    const stmt = ctx.raw.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'local_model%' ORDER BY name`,
    );
    const names: string[] = [];
    while (stmt.step()) names.push((stmt.getAsObject() as { name: string }).name);
    stmt.free();
    expect(names).toEqual([
      'local_model_advanced_params',
      'local_model_benchmarks',
      'local_model_endpoints',
      'local_model_watch_folders',
      'local_models',
    ]);
  });

  it('creates local_models with the expected columns and a text PK on id', () => {
    const cols = tableInfo('local_models');
    expect(cols.map((c) => c.name).sort()).toEqual(
      [
        'chat_template_override',
        'created_at',
        'display_name',
        'endpoint_id',
        'gguf_arch',
        'gguf_chat_template',
        'gguf_context_max',
        'gguf_params_b',
        'gguf_quant',
        'gguf_sha256',
        'gguf_size_bytes',
        'hf_filename',
        'hf_repo_id',
        'id',
        'is_embedding_model',
        'is_tool_capable',
        'last_used_at',
        'license',
        'source_path',
        'source_type',
        'status',
        'status_detail',
        'system_prompt_override',
        'updated_at',
      ].sort(),
    );
    const id = cols.find((c) => c.name === 'id');
    expect(id?.type.toLowerCase()).toBe('text');
    expect(id?.pk).toBe(1);
  });

  it('uses model_id as the PK of local_model_advanced_params', () => {
    const cols = tableInfo('local_model_advanced_params');
    const modelId = cols.find((c) => c.name === 'model_id');
    expect(modelId?.pk).toBe(1);
    expect(cols).toHaveLength(13);
  });

  // ---------------------------------------------------------------------------
  // 2. Indexes
  // ---------------------------------------------------------------------------

  it('creates the four hot-path indexes on local_models', () => {
    const names = indexNames('local_models');
    expect(names).toContain('idx_local_models_source_type');
    expect(names).toContain('idx_local_models_status');
    expect(names).toContain('idx_local_models_last_used_at');
    expect(names).toContain('idx_local_models_endpoint_id');
  });

  it('creates the benchmark and watch-folder indexes', () => {
    expect(indexNames('local_model_benchmarks')).toContain(
      'idx_local_model_benchmarks_model_id_ran_at',
    );
    expect(indexNames('local_model_watch_folders')).toContain(
      'idx_local_model_watch_folders_status',
    );
  });

  // ---------------------------------------------------------------------------
  // 3. ON DELETE CASCADE
  // ---------------------------------------------------------------------------

  it('cascades local_models when its endpoint is deleted', () => {
    insertEndpoint('ep1');
    ctx.raw.run(
      `INSERT INTO local_models (id, display_name, source_type, endpoint_id, created_at, updated_at)
       VALUES ('m-remote', 'Remote', 'remote-endpoint', 'ep1', ?, ?)`,
      [NOW, NOW],
    );
    expect(count('local_models')).toBe(1);
    ctx.raw.run(`DELETE FROM local_model_endpoints WHERE id = 'ep1'`);
    expect(count('local_models')).toBe(0);
  });

  it('cascades advanced_params and benchmarks when the model is deleted', () => {
    insertFileModel('m1');
    ctx.raw.run(
      `INSERT INTO local_model_advanced_params (model_id, n_ctx, updated_at) VALUES ('m1', 8192, ?)`,
      [NOW],
    );
    ctx.raw.run(
      `INSERT INTO local_model_benchmarks
        (id, model_id, prompt_eval_tok_s, gen_tok_s, ttft_ms, backend, n_ctx_used, n_gpu_layers_used, ran_at)
       VALUES ('b1', 'm1', 120.5, 42.0, 350, 'vulkan', 8192, 35, ?)`,
      [NOW],
    );
    expect(count('local_model_advanced_params')).toBe(1);
    expect(count('local_model_benchmarks')).toBe(1);
    ctx.raw.run(`DELETE FROM local_models WHERE id = 'm1'`);
    expect(count('local_model_advanced_params')).toBe(0);
    expect(count('local_model_benchmarks')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 4. CHECK constraints
  // ---------------------------------------------------------------------------

  it('rejects an invalid source_type', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, source_path, created_at, updated_at)
         VALUES ('bad', 'Bad', 'totally-invalid', '/x.gguf', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('rejects an invalid model status', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, source_path, status, created_at, updated_at)
         VALUES ('bad', 'Bad', 'file', '/x.gguf', 'on-fire', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('enforces the source-shape cross-constraint (file requires source_path, no endpoint)', () => {
    // file with NULL source_path → fails
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, created_at, updated_at)
         VALUES ('bad', 'Bad', 'file', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('enforces the source-shape cross-constraint (remote-endpoint requires endpoint_id, no path)', () => {
    insertEndpoint('ep1');
    // remote-endpoint with NULL endpoint_id → fails
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, created_at, updated_at)
         VALUES ('bad', 'Bad', 'remote-endpoint', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
    // remote-endpoint carrying BOTH a path and an endpoint → fails
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_models (id, display_name, source_type, source_path, endpoint_id, created_at, updated_at)
         VALUES ('bad2', 'Bad', 'remote-endpoint', '/x.gguf', 'ep1', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('rejects a non-Local privacy_tier on an endpoint', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
         VALUES ('bad', 'Bad', 'http://x', 'Cloud', 'unknown', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  it('rejects an advanced_params boolean column outside {0, 1, NULL}', () => {
    insertFileModel('m1');
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_model_advanced_params (model_id, mmap, updated_at) VALUES ('m1', 2, ?)`,
        [NOW],
      ),
    ).toThrow();
  });

  it('rejects an invalid watch-folder status', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_model_watch_folders (id, path, recursive, status, created_at, updated_at)
         VALUES ('bad', '/x', 1, 'frobnicated', ?, ?)`,
        [NOW, NOW],
      ),
    ).toThrow();
  });

  // ---------------------------------------------------------------------------
  // 5. Performance — the forward migration is structural and must be cheap.
  // ---------------------------------------------------------------------------

  it('applies the 0036 forward migration in under 100 ms on an empty DB', async () => {
    const { readFileSync } = await import('node:fs');
    const sqlText = readFileSync(migration0036Path, 'utf8');
    const statements = sqlText
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const SQL = await initSqlJs();
    const raw = new SQL.Database();
    raw.run('PRAGMA foreign_keys = ON');
    const t0 = performance.now();
    for (const stmt of statements) raw.run(stmt);
    const elapsedMs = performance.now() - t0;
    raw.close();

    expect(elapsedMs).toBeLessThan(100);
  });
});

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'apps/desktop/src/main/db/migrate.ts'; Get-Content -LiteralPath 'apps/desktop/src/main/db/test-helpers.ts'; Get-Content -LiteralPath 'apps/desktop/src/main/db/client.ts' -TotalCount 140" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 7754ms:
/**
 * Thin wrapper around Drizzle's better-sqlite3 migrator. Kept as its own
 * module so main/index.ts can call it without importing the migrator at
 * the top level (which pulls in better-sqlite3 eagerly), and so unit tests
 * can mock the migrator while testing the call-through contract.
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { TeamXDb } from './client.js';

/**
 * Apply all pending migrations to the given database. The migrations
 * folder must contain drizzle-kit output — a `meta/_journal.json` plus
 * `NNNN_*.sql` files. The caller is responsible for resolving the folder
 * path; in dev the path is relative to the compiled main-process bundle,
 * in production it will resolve to an electron-builder extraResource
 * (landing in Task 49).
 */
export function runMigrations(db: TeamXDb, migrationsFolder: string): void {
  migrate(db, { migrationsFolder });
}
/**
 * Test helpers for the DB layer — in-memory SQLite built on sql.js.
 *
 * Why sql.js and not better-sqlite3:
 *
 * The better-sqlite3 native binding in this workspace is built against
 * Electron's ABI only (see Task 18 — we intentionally do NOT allowlist
 * better-sqlite3's Node-ABI install script, because both install scripts
 * target the same `build/Release/better_sqlite3.node` path and the second
 * writer wins). That means Vitest running under plain Node cannot
 * `require('better-sqlite3')` at all — it would fail with a
 * NODE_MODULE_VERSION mismatch.
 *
 * sql.js is a pure-JavaScript/WASM SQLite engine. Zero native bindings,
 * runs in any JS runtime, supports in-memory databases, and Drizzle ships
 * a first-class `drizzle-orm/sql-js` driver that reads the exact same
 * dialect-agnostic schema definitions from `schema.ts`. The drizzle-kit
 * migrations generated for better-sqlite3 also apply cleanly under sql.js
 * because they are plain SQLite DDL.
 *
 * Trade-off: sql.js ships with a recent but not bleeding-edge SQLite
 * version and runs slightly slower than native. Neither matters for repo
 * unit tests. Edge cases that depend on specific better-sqlite3 type
 * coercion or native-level behavior must be covered by integration tests
 * under `pnpm dev` instead (same pattern as the Task 18 smoke run).
 *
 * Repos that need to work across both drivers are typed over a generic
 * `BaseSQLiteDatabase<'sync', TRunResult, Schema>` so the same factory
 * function accepts `BetterSQLite3Database<Schema>` at runtime and
 * `SQLJsDatabase<Schema>` under tests.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type SQLJsDatabase, drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import initSqlJs, { type Database as RawSqlJsDatabase } from 'sql.js';

import * as schema from './schema.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(thisDir, 'migrations');

let _SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/**
 * Lazily initialize the sql.js WASM module once per test process. Subsequent
 * calls reuse the cached module and create new in-memory databases cheaply.
 *
 * Note: In production (bundled Electron), we need to tell sql.js where to
 * find its WASM file. The WASM file is copied to out/main/sql-wasm.wasm
 * during the build process.
 */
async function getSqlModule() {
  if (_SQL !== null) return _SQL;

  // Determine the correct WASM file path based on the environment
  _SQL = await initSqlJs({
    locateFile: (file) => {
      // In the bundled app, thisDir is out/main/db/, so we go up two levels to out/main/
      // The WASM file is copied directly to out/main/sql-wasm.wasm
      const bundledPath = join(thisDir, '..', '..', file);
      // In dev (unbundled), use node_modules path
      const nodeModulesPath = join(
        thisDir,
        '..',
        '..',
        '..',
        'node_modules',
        'sql.js',
        'dist',
        file,
      );

      // In production, the WASM file will be in the same directory as the bundled JS.
      // In Vitest/dev, use the package asset from node_modules.
      return existsSync(bundledPath) ? bundledPath : nodeModulesPath;
    },
  });
  return _SQL;
}

export interface TestDbHandle {
  db: SQLJsDatabase<typeof schema>;
  raw: RawSqlJsDatabase;
  close: () => void;
}

/**
 * Create a fresh in-memory SQLite database with every Team-X migration
 * applied, wrapped in the Drizzle sql-js driver. Each test should create
 * its own handle in `beforeEach` and close it in `afterEach`.
 */
export async function makeTestDb(): Promise<TestDbHandle> {
  const SQL = await getSqlModule();
  const raw = new SQL.Database();
  // Match the runtime pragmas from `createDb` that are meaningful under
  // sql.js. `journal_mode=WAL` and `synchronous=NORMAL` are no-ops in an
  // in-memory database, but `foreign_keys=ON` is essential — without it
  // FK-enforcement tests silently pass invalid inserts.
  raw.run('PRAGMA foreign_keys = ON');
  const db = drizzle(raw, { schema });
  migrate(db, { migrationsFolder });
  return {
    db,
    raw,
    close: () => raw.close(),
  };
}
/**
 * SQLite / Drizzle client for the Team-X main process.
 *
 * Two layers:
 *
 * 1. `createDb(path)` — a pure factory that opens a better-sqlite3 connection,
 *    applies the three pragmas every Team-X database needs
 *    (journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL), wraps the
 *    connection with Drizzle, and returns a { db, raw } handle. This layer
 *    has no side effects on module state and no dependency on Electron,
 *    which is what makes it unit-testable.
 *
 * 2. `initDb / getDb / closeDb` — a thin singleton state machine layered on
 *    top of `createDb`. The main process calls `initDb(dbPath())` once inside
 *    `app.whenReady()`, and every other main-process module accesses the db
 *    via `getDb()`. `closeDb()` is called on `app.will-quit`.
 *
 * Why explicit init: lazy singletons that self-open on first access hide
 * electron-dependent side effects behind a pure-looking call, making them
 * impossible to unit-test without mocking both the electron module and fs.
 * An explicit `initDb` keeps the electron wiring in one place (main/index.ts)
 * and lets tests drive the client with `:memory:` directly.
 *
 * Pragmas chosen:
 * - journal_mode=WAL: concurrent reads while a writer is active. Critical
 *   for the live cockpit which streams events from multiple workers.
 * - foreign_keys=ON: enforces the FK constraints declared in schema.ts.
 *   SQLite defaults to OFF for historical reasons.
 * - synchronous=NORMAL: durability on transaction commit but not every
 *   write. Safe under WAL and substantially faster than FULL.
 */

import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

export type Schema = typeof schema;
export type TeamXDb = BetterSQLite3Database<Schema>;

export interface DbHandle {
  db: TeamXDb;
  raw: Database.Database;
}

/**
 * Pure factory: opens a database at `path`, applies the standard pragmas,
 * and returns a { db, raw } handle. Callers own the lifecycle.
 */
export function createDb(path: string): DbHandle {
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('synchronous = NORMAL');
  const db = drizzle(raw, { schema });
  return { db, raw };
}

let _handle: DbHandle | null = null;

/**
 * Initialize the process-wide singleton. Must be called exactly once,
 * from `main/index.ts` inside `app.whenReady()`. Subsequent callers
 * read the singleton via `getDb()`.
 */
export function initDb(path: string): DbHandle {
  if (_handle !== null) {
    throw new Error('DB already initialized — call closeDb() before re-initializing');
  }
  _handle = createDb(path);
  return _handle;
}

/**
 * Return the singleton drizzle db. Throws if `initDb` has not been called.
 * Callers that need the raw connection should import `createDb` or hold on
 * to the handle returned by `initDb`.
 */
export function getDb(): TeamXDb {
  if (_handle === null) {
    throw new Error('DB not initialized — call initDb(path) first');
  }
  return _handle.db;
}

/**
 * Close the underlying connection and reset the singleton. Safe to call
 * before `initDb` — in that case it is a no-op. Idempotent.
 */
export function closeDb(): void {
  if (_handle === null) return;
  _handle.raw.close();
  _handle = null;
}

export { schema };

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm -r typecheck' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:53:12.414410Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 6.9 seconds
Output:
 ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)

Your Node version is incompatible with "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X".

Expected version: >=22.13.0
Got: v20.20.2

This is happening because the package's manifest has an engines.node field specified.
To fix this issue, install the required Node version.

 exited 1 in 6915ms:
 ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)

Your Node version is incompatible with "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X".

Expected version: >=22.13.0
Got: v20.20.2

This is happening because the package's manifest has an engines.node field specified.
To fix this issue, install the required Node version.

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'apps/desktop/src/preload/api.test.ts' -Pattern 'localGguf|PRELOAD_CHANNELS' -Context 6,12" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 14240ms:

  apps\desktop\src\preload\api.test.ts:1:import type { DashboardEvent } from '@team-x/shared-types';
  apps\desktop\src\preload\api.test.ts:2:import { beforeEach, describe, expect, it, vi } from 'vitest';
  apps\desktop\src\preload\api.test.ts:3:
> apps\desktop\src\preload\api.test.ts:4:import { type IpcRendererLike, [7mPRELOAD_CHANNELS[0m, [0m[7m[0mbuildTeamXApi [0m[7m[0m} [0m[7m[0mfrom [0m
[7m[0m'./api.js';[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:5:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:6:/**[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:7: * Tests for the preload `buildTeamXApi` factory.[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:8: *[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:9: * The factory is pure TypeScript — it captures an `IpcRendererLike`[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:10: * in a closure and routes each `TeamXApi` method through it. These[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:11: * tests exercise the factory with a hand-rolled fake that records[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:12: * every invoke / on / removeListener call so we can assert:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:13: *[0m
> apps\desktop\src\preload\api.test.ts:14: *   1. Channel names pin exactly to the `[7mPRELOAD_CHANNELS[0m` table[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:15: *      (so a typo here would match the channel constant check but[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:16: *      diverge from the main-process register layer's string, and[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:17: *      that would be caught by the Playwright smoke test in T49).[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:18: *[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:19: *   2. Argument shapes pin exactly (positional companyId becomes[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:20: *      `{ companyId }`, raw threadId becomes `{ threadId }`,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:21: *      chat.send request is forwarded verbatim).[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:22: *[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:23: *   3. Return values from `ipc.invoke` pass through untouched — we[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:24: *      do not double-wrap promises, we do not map properties.[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:25: *[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:26: *   4. `events.onDashboard` attaches a listener, strips the ipc[0m
  apps\desktop\src\preload\api.test.ts:106:
  apps\desktop\src\preload\api.test.ts:107:  describe('system.selectDirectory', () => {
  apps\desktop\src\preload\api.test.ts:108:    it('invokes system.selectDirectory without request args', async () => {
  apps\desktop\src\preload\api.test.ts:109:      fake.setNextInvokeResult({ canceled: false, folderPath: 
'C:/skills/ops' });
  apps\desktop\src\preload\api.test.ts:110:      await api.system.selectDirectory();
  apps\desktop\src\preload\api.test.ts:111:      expect(fake.invokeCalls).toEqual([
> apps\desktop\src\preload\api.test.ts:112:        { channel: [7mPRELOAD_CHANNELS[0m.systemSelectDirectory, args: [] },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:113:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:114:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:115:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:116:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:117:  describe('employees.list', () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:118:    it('invokes employees.list with a { companyId } object', async () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:119:      fake.setNextInvokeResult([]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:120:      await api.employees.list('co-1');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:121:      expect(fake.invokeCalls).toEqual([[0m
> apps\desktop\src\preload\api.test.ts:122:        { channel: [7mPRELOAD_CHANNELS[0m.employeesList, [0m[7m[0margs: [0m[7m[0m[{ [0m[7m[0mcompanyId: [0m
[7m[0m'co-1' [0m[7m[0m}] [0m[7m[0m},[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:123:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:124:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:125:[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:126: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('passes [0m[7m[0mthrough [0m[7m[0mthe [0m[7m[0mresolved [0m[7m[0marray [0m[7m[0mof [0m[7m[0memployees [0m[7m[0mfrom [0m[7m[0minvoke', [0m[7m[0masync [0m
[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:127:      const stub = [{ id: 'e1' }, { id: 'e2' }];[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:128:      fake.setNextInvokeResult(stub);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:129:      const result = await api.employees.list('co-1');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:130:      expect(result).toBe(stub);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:131:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:132:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:133:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:134:  describe('employees.update', () => {[0m
  apps\desktop\src\preload\api.test.ts:135:    it('invokes employees.update with the request object verbatim', async 
() => {
  apps\desktop\src\preload\api.test.ts:136:      fake.setNextInvokeResult({ employee: { id: 'emp-1', name: 'Nadia' } 
});
  apps\desktop\src\preload\api.test.ts:137:      const req = { employeeId: 'emp-1', name: 'Nadia', title: 'CTO' } as 
const;
  apps\desktop\src\preload\api.test.ts:138:      await api.employees.update(req);
  apps\desktop\src\preload\api.test.ts:139:      expect(fake.invokeCalls).toEqual([
> apps\desktop\src\preload\api.test.ts:140:        { channel: ([7mPRELOAD_CHANNELS [0m[7m[0mas [0m[7m[0mRecord<string, [0m
[7m[0mstring>).employeesUpdate, [0m[7m[0margs: [0m[7m[0m[req] [0m[7m[0m},[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:141:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:142:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:143:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:144:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:145:  describe('chat.send', () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:146:    it('invokes chat.send with the request object verbatim', async () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:147:      fake.setNextInvokeResult({ threadId: 't-1', messageId: 'm-1' });[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:148: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mconst [0m[7m[0mreq [0m[7m[0m= [0m[7m[0m{ [0m[7m[0mthreadId: [0m[7m[0m'auto', [0m[7m[0memployeeId: [0m[7m[0m'e-1', [0m[7m[0mcontent: [0m[7m[0m'hi' [0m[7m[0m} [0m[7m[0mas [0m
[7m[0mconst;[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:149:      await api.chat.send(req);[0m
> apps\desktop\src\preload\api.test.ts:150:      expect(fake.invokeCalls).toEqual([{ channel: 
[7mPRELOAD_CHANNELS[0m.chatSend, [0m[7m[0margs: [0m[7m[0m[req] [0m[7m[0m}]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:151:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:152:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:153:    it('passes through the SendChatResponse from invoke', async () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:154:      const stub = { threadId: 't-resolved', messageId: 'm-99' };[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:155:      fake.setNextInvokeResult(stub);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:156:      const result = await api.chat.send({[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:157:        threadId: 'auto',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:158:        employeeId: 'e-1',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:159:        content: 'hi',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:160:      });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:161:      expect(result).toBe(stub);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:162:    });[0m
  apps\desktop\src\preload\api.test.ts:164:
  apps\desktop\src\preload\api.test.ts:165:  describe('chat.list', () => {
  apps\desktop\src\preload\api.test.ts:166:    it('invokes chat.list with a { threadId } object', async () => {
  apps\desktop\src\preload\api.test.ts:167:      fake.setNextInvokeResult([]);
  apps\desktop\src\preload\api.test.ts:168:      await api.chat.list('thread-7');
  apps\desktop\src\preload\api.test.ts:169:      expect(fake.invokeCalls).toEqual([
> apps\desktop\src\preload\api.test.ts:170:        { channel: [7mPRELOAD_CHANNELS[0m.chatList, [0m[7m[0margs: [0m[7m[0m[{ [0m[7m[0mthreadId: [0m[7m[0m'thread-7' [0m
[7m[0m}] [0m[7m[0m},[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:171:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:172:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:173:[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:174: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('passes [0m[7m[0mthrough [0m[7m[0mthe [0m[7m[0mresolved [0m[7m[0marray [0m[7m[0mof [0m[7m[0mmessages [0m[7m[0mfrom [0m[7m[0minvoke', [0m[7m[0masync [0m
[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:175:      const stub = [{ id: 'm1' }, { id: 'm2' }];[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:176:      fake.setNextInvokeResult(stub);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:177:      const result = await api.chat.list('thread-7');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:178:      expect(result).toBe(stub);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:179:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:180:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:181:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:182:  describe('chat.stop', () => {[0m
  apps\desktop\src\preload\api.test.ts:183:    it('invokes chat.stop with the request object verbatim', async () => {
  apps\desktop\src\preload\api.test.ts:184:      fake.setNextInvokeResult({ stopped: true });
  apps\desktop\src\preload\api.test.ts:185:      const stop = (api.chat as unknown as { stop(req: { threadId: string 
}): Promise<unknown> })
  apps\desktop\src\preload\api.test.ts:186:        .stop;
> apps\desktop\src\preload\api.test.ts:187:      const channels = [7mPRELOAD_CHANNELS[0m as Record<string, string>;[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:188:      await stop({ threadId: 'thread-7' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:189:      expect(fake.invokeCalls).toEqual([[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:190:        { channel: channels.chatStop, args: [{ threadId: 'thread-7' }] },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:191:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:192:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:193:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:194:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:195:  describe('chat.resolveThread', () => {[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:196: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('invokes [0m[7m[0mchat.resolveThread [0m[7m[0mwith [0m[7m[0mthe [0m[7m[0mrequest [0m[7m[0mobject [0m[7m[0mverbatim', [0m[7m[0masync [0m
[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:197:      fake.setNextInvokeResult({ threadId: 'dm-1' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:198:      await api.chat.resolveThread({ employeeId: 'emp-iris' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:199:      expect(fake.invokeCalls).toEqual([[0m
> apps\desktop\src\preload\api.test.ts:200:        { channel: [7mPRELOAD_CHANNELS[0m.chatResolveThread, [0m[7m[0margs: [0m[7m[0m[{ [0m[7m[0memployeeId: [0m
[7m[0m'emp-iris' [0m[7m[0m}] [0m[7m[0m},[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:201:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:202:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:203:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:204:    it('passes through the ResolveThreadResponse from invoke', async () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:205:      const stub = { threadId: 'dm-resolved' };[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:206:      fake.setNextInvokeResult(stub);[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:207: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mconst [0m[7m[0mresult [0m[7m[0m= [0m[7m[0mawait [0m[7m[0mapi.chat.resolveThread({ [0m[7m[0memployeeId: [0m[7m[0m'emp-iris' [0m
[7m[0m});[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:208:      expect(result).toBe(stub);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:209:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:210:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:211:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:212:  describe('providers.listModels', () => {[0m
  apps\desktop\src\preload\api.test.ts:213:    it('invokes providers.listModels with a { providerId } object', async 
() => {
  apps\desktop\src\preload\api.test.ts:214:      fake.setNextInvokeResult({ models: ['glm-5:cloud'] });
  apps\desktop\src\preload\api.test.ts:215:      await (
  apps\desktop\src\preload\api.test.ts:216:        api.providers as unknown as { listModels(providerId: string): 
Promise<unknown> }
  apps\desktop\src\preload\api.test.ts:217:      ).listModels('ollama-local');
  apps\desktop\src\preload\api.test.ts:218:      expect(fake.invokeCalls).toEqual([
> apps\desktop\src\preload\api.test.ts:219:        { channel: [7mPRELOAD_CHANNELS[0m.providersListModels, [0m[7m[0margs: [0m[7m[0m[{ [0m
[7m[0mproviderId: [0m[7m[0m'ollama-local' [0m[7m[0m}] [0m[7m[0m},[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:220:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:221:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:222:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:223:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:224:  describe('telemetry.recentRuns', () => {[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:225: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('invokes [0m[7m[0mtelemetry.recentRuns [0m[7m[0mwith [0m[7m[0mthe [0m[7m[0mrequest [0m[7m[0mobject [0m[7m[0mverbatim', [0m
[7m[0masync [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:226:      fake.setNextInvokeResult([]);[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:227: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mawait [0m[7m[0mapi.telemetry.recentRuns({ [0m[7m[0mcompanyId: [0m[7m[0m'co-1', [0m[7m[0mkind: [0m[7m[0m'agentic', [0m
[7m[0mlimit: [0m[7m[0m6 [0m[7m[0m});[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:228:      expect(fake.invokeCalls).toEqual([[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:229:        {[0m
> apps\desktop\src\preload\api.test.ts:230:          channel: [7mPRELOAD_CHANNELS[0m.telemetryRecentRuns,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:231:          args: [{ companyId: 'co-1', kind: 'agentic', limit: 6 }],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:232:        },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:233:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:234:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:235:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:236:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:237:  describe('runtimeOperations.snapshot', () => {[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:238: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('invokes [0m[7m[0mruntimeOperations.snapshot [0m[7m[0mwith [0m[7m[0ma [0m[7m[0m{ [0m[7m[0mcompanyId [0m[7m[0m} [0m[7m[0mobject', [0m
[7m[0masync [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:239:      fake.setNextInvokeResult({[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:240:        companyId: 'co-1',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:241:        generatedAt: 1,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:242:        sessions: [],[0m
  apps\desktop\src\preload\api.test.ts:243:        activeCheckouts: [],
  apps\desktop\src\preload\api.test.ts:244:      });
  apps\desktop\src\preload\api.test.ts:245:      await api.runtimeOperations.snapshot('co-1');
  apps\desktop\src\preload\api.test.ts:246:      expect(fake.invokeCalls).toEqual([
  apps\desktop\src\preload\api.test.ts:247:        {
> apps\desktop\src\preload\api.test.ts:248:          channel: ([7mPRELOAD_CHANNELS [0m[7m[0mas [0m[7m[0mRecord<string, [0m
[7m[0mstring>).runtimeOperationsSnapshot,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:249:          args: [{ companyId: 'co-1' }],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:250:        },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:251:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:252:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:253:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:254:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:255:  describe('autonomyDoctor.run', () => {[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:256: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('invokes [0m[7m[0mautonomyDoctor.run [0m[7m[0mwith [0m[7m[0ma [0m[7m[0m{ [0m[7m[0mcompanyId [0m[7m[0m} [0m[7m[0mobject', [0m[7m[0masync [0m[7m[0m() [0m
[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:257:      fake.setNextInvokeResult({[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:258:        companyId: 'co-1',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:259:        generatedAt: 1,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:260:        status: 'ok',[0m
  apps\desktop\src\preload\api.test.ts:261:        checks: [],
  apps\desktop\src\preload\api.test.ts:262:        totals: { ok: 0, warning: 0, blocked: 0, findingCount: 0 },
  apps\desktop\src\preload\api.test.ts:263:      });
  apps\desktop\src\preload\api.test.ts:264:      await api.autonomyDoctor.run('co-1');
  apps\desktop\src\preload\api.test.ts:265:      expect(fake.invokeCalls).toEqual([
  apps\desktop\src\preload\api.test.ts:266:        {
> apps\desktop\src\preload\api.test.ts:267:          channel: ([7mPRELOAD_CHANNELS [0m[7m[0mas [0m[7m[0mRecord<string, [0m
[7m[0mstring>).autonomyDoctorRun,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:268:          args: [{ companyId: 'co-1' }],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:269:        },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:270:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:271:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:272:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:273:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:274:  describe('autonomyBenchmark.run', () => {[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:275: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('invokes [0m[7m[0mautonomyBenchmark.run [0m[7m[0mwith [0m[7m[0mthe [0m[7m[0mrequest [0m[7m[0mobject [0m[7m[0mverbatim', [0m
[7m[0masync [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:276:      fake.setNextInvokeResult({[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:277:        id: 'benchmark-1',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:278:        generatedAt: 1,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:279:        mode: 'control-plane-simulated',[0m
  apps\desktop\src\preload\api.test.ts:301:      };
  apps\desktop\src\preload\api.test.ts:302:
  apps\desktop\src\preload\api.test.ts:303:      await api.autonomyBenchmark.run(req);
  apps\desktop\src\preload\api.test.ts:304:
  apps\desktop\src\preload\api.test.ts:305:      expect(fake.invokeCalls).toEqual([
  apps\desktop\src\preload\api.test.ts:306:        {
> apps\desktop\src\preload\api.test.ts:307:          channel: ([7mPRELOAD_CHANNELS [0m[7m[0mas [0m[7m[0mRecord<string, [0m
[7m[0mstring>).autonomyBenchmarkRun,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:308:          args: [req],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:309:        },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:310:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:311:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:312:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:313:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:314:  describe('agentImprovement', () => {[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:315: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('invokes [0m[7m[0magentImprovement.list [0m[7m[0mwith [0m[7m[0ma [0m[7m[0m{ [0m[7m[0mcompanyId [0m[7m[0m} [0m[7m[0mobject', [0m[7m[0masync [0m
[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:316:      fake.setNextInvokeResult({[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:317:        companyId: 'co-1',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:318:        generatedAt: 1,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:319:        openTicketCount: 0,[0m
  apps\desktop\src\preload\api.test.ts:322:      });
  apps\desktop\src\preload\api.test.ts:323:
  apps\desktop\src\preload\api.test.ts:324:      await api.agentImprovement.list('co-1');
  apps\desktop\src\preload\api.test.ts:325:
  apps\desktop\src\preload\api.test.ts:326:      expect(fake.invokeCalls).toEqual([
  apps\desktop\src\preload\api.test.ts:327:        {
> apps\desktop\src\preload\api.test.ts:328:          channel: ([7mPRELOAD_CHANNELS [0m[7m[0mas [0m[7m[0mRecord<string, [0m
[7m[0mstring>).agentImprovementList,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:329:          args: [{ companyId: 'co-1' }],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:330:        },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:331:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:332:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:333:[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:334: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('invokes [0m[7m[0magentImprovement.run [0m[7m[0mwith [0m[7m[0mthe [0m[7m[0mrequest [0m[7m[0mobject [0m[7m[0mverbatim', [0m
[7m[0masync [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:335:      const req = { companyId: 'co-1', eventLimit: 50 };[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:336:      fake.setNextInvokeResult({[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:337:        companyId: 'co-1',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:338:        ranAt: 1,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:339:        inspectedEventCount: 0,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:340:        inspectedTicketCount: 0,[0m
  apps\desktop\src\preload\api.test.ts:344:      });
  apps\desktop\src\preload\api.test.ts:345:
  apps\desktop\src\preload\api.test.ts:346:      await api.agentImprovement.run(req);
  apps\desktop\src\preload\api.test.ts:347:
  apps\desktop\src\preload\api.test.ts:348:      expect(fake.invokeCalls).toEqual([
  apps\desktop\src\preload\api.test.ts:349:        {
> apps\desktop\src\preload\api.test.ts:350:          channel: ([7mPRELOAD_CHANNELS [0m[7m[0mas [0m[7m[0mRecord<string, [0m
[7m[0mstring>).agentImprovementRun,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:351:          args: [req],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:352:        },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:353:      ]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:354:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:355:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:356:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:357:  describe('events.onDashboard', () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:358:    it('attaches a listener to events.dashboard', () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:359:      const cb = vi.fn();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:360:      api.events.onDashboard(cb);[0m
> apps\desktop\src\preload\api.test.ts:361:      
expect(fake.listeners.get([7mPRELOAD_CHANNELS[0m.eventsDashboard)?.size).toBe(1);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:362:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:363:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:364:    it('forwards event payloads without the ipc event argument', () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:365:      const cb = vi.fn();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:366:      api.events.onDashboard(cb);[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:367: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mconst [0m[7m[0mfakeEvent [0m[7m[0m= [0m[7m[0m{ [0m[7m[0mid: [0m[7m[0m'evt-1', [0m[7m[0mtype: [0m[7m[0m'token.delta' [0m[7m[0m} [0m[7m[0mas [0m[7m[0munknown [0m[7m[0mas [0m
[7m[0mDashboardEvent;[0m
> apps\desktop\src\preload\api.test.ts:368:      fake.emit([7mPRELOAD_CHANNELS[0m.eventsDashboard, fakeEvent);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:369:      expect(cb).toHaveBeenCalledTimes(1);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:370:      // The callback should receive ONLY the payload — no leading[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:371:      // IpcRendererEvent-like first arg.[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:372:      expect(cb).toHaveBeenCalledWith(fakeEvent);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:373:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:374:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:375:    it('calls the listener once per emitted event', () => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:376:      const cb = vi.fn();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:377:      api.events.onDashboard(cb);[0m
> apps\desktop\src\preload\api.test.ts:378:      fake.emit([7mPRELOAD_CHANNELS[0m.eventsDashboard, { id: 'a' });
> apps\desktop\src\preload\api.test.ts:379:      fake.emit([7mPRELOAD_CHANNELS[0m.eventsDashboard, { id: 'b' });
> apps\desktop\src\preload\api.test.ts:380:      fake.emit([7mPRELOAD_CHANNELS[0m.eventsDashboard, { id: 'c' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:381:      expect(cb).toHaveBeenCalledTimes(3);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:382:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:383:[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:384: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('returns [0m[7m[0man [0m[7m[0munsubscribe [0m[7m[0mthat [0m[7m[0mstops [0m[7m[0mfuture [0m[7m[0mevents [0m[7m[0mfrom [0m[7m[0mreaching [0m[7m[0mthe [0m
[7m[0mlistener', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:385:      const cb = vi.fn();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:386:      const unsubscribe = api.events.onDashboard(cb);[0m
> apps\desktop\src\preload\api.test.ts:387:      fake.emit([7mPRELOAD_CHANNELS[0m.eventsDashboard, { id: 'before' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:388:      unsubscribe();[0m
> apps\desktop\src\preload\api.test.ts:389:      fake.emit([7mPRELOAD_CHANNELS[0m.eventsDashboard, { id: 'after' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:390:      expect(cb).toHaveBeenCalledTimes(1);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:391:      expect(cb).toHaveBeenCalledWith({ id: 'before' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:392:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:393:[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:394: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('unsubscribe [0m[7m[0mremoves [0m[7m[0mthe [0m[7m[0mexact [0m[7m[0msame [0m[7m[0mwrapped [0m[7m[0mlistener [0m[7m[0mthat [0m[7m[0mwas [0m
[7m[0mattached', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:395:      const cb = vi.fn();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:396:      const unsubscribe = api.events.onDashboard(cb);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:397:      // Snapshot the attached listener — there should be exactly one.[0m
> apps\desktop\src\preload\api.test.ts:398:      const attached = fake.listeners.get([7mPRELOAD_CHANNELS[0m.eventsDashboard);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:399:      expect(attached?.size).toBe(1);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:400:      const listenerFn = [...(attached ?? [])][0];[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:401:      unsubscribe();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:402:      expect(fake.removed).toHaveLength(1);[0m
> apps\desktop\src\preload\api.test.ts:403:      
expect(fake.removed[0]?.channel).toBe([7mPRELOAD_CHANNELS[0m.eventsDashboard);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:404:      expect(fake.removed[0]?.fn).toBe(listenerFn);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:405:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:406:[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:407: [0m[7m [0m[7m [0m[7m [0m[7m[0mit('supports [0m[7m[0mmultiple [0m[7m[0mconcurrent [0m[7m[0msubscribers [0m[7m[0mwith [0m[7m[0mindependent [0m
[7m[0munsubscribes', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:408:      const a = vi.fn();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:409:      const b = vi.fn();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:410:      const c = vi.fn();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:411:      const unsubA = api.events.onDashboard(a);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:412:      api.events.onDashboard(b);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:413:      api.events.onDashboard(c);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:414:[0m
> apps\desktop\src\preload\api.test.ts:415:      fake.emit([7mPRELOAD_CHANNELS[0m.eventsDashboard, { id: '1' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:416:      expect(a).toHaveBeenCalledTimes(1);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:417:      expect(b).toHaveBeenCalledTimes(1);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:418:      expect(c).toHaveBeenCalledTimes(1);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:419:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:420:      unsubA();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:421:[0m
> apps\desktop\src\preload\api.test.ts:422:      fake.emit([7mPRELOAD_CHANNELS[0m.eventsDashboard, { id: '2' });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:423:      expect(a).toHaveBeenCalledTimes(1); // no more events for a[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:424:      expect(b).toHaveBeenCalledTimes(2);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:425:      expect(c).toHaveBeenCalledTimes(2);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:426:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:427:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:428:[0m
> apps\desktop\src\preload\api.test.ts:429:  describe('[7mlocalGguf[0m namespace', () => {
> apps\desktop\src\preload\api.test.ts:430:    // Every [7mlocalGguf[0m method is a thin pass-through: it routes to a fixed[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:431:    // channel with positional args forwarded verbatim. This table pins the[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:432: [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m[7m[0mchannel [0m[7m[0m+ [0m[7m[0marg [0m[7m[0mshape [0m[7m[0mfor [0m[7m[0mall [0m[7m[0m35 [0m[7m[0mmethods [0m[7m[0mso [0m[7m[0ma [0m[7m[0mtypo [0m[7m[0m(wrong [0m[7m[0mchannel, [0m
[7m[0mwrong[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:433:    // arg order) is caught here rather than at runtime in a later phase.[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:434:    const cases: Array<{[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:435:      name: string;[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:436:      call: (a: ReturnType<typeof buildTeamXApi>) => Promise<unknown>;[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:437:      channel: string;[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:438:      args: unknown[];[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:439:    }> = [[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:440:      // library.*[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:441:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:442:        name: 'library.list',[0m
> apps\desktop\src\preload\api.test.ts:443:        call: (a) => a.[7mlocalGguf[0m.library.list(),
> apps\desktop\src\preload\api.test.ts:444:        channel: '[7mlocalGguf[0m.library.list',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:445:        args: [],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:446:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:447:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:448:        name: 'library.get',[0m
> apps\desktop\src\preload\api.test.ts:449:        call: (a) => a.[7mlocalGguf[0m.library.get('m1'),
> apps\desktop\src\preload\api.test.ts:450:        channel: '[7mlocalGguf[0m.library.get',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:451:        args: ['m1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:452:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:453:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:454:        name: 'library.addFile',[0m
> apps\desktop\src\preload\api.test.ts:455:        call: (a) => a.[7mlocalGguf[0m.library.addFile('/p/x.gguf'),
> apps\desktop\src\preload\api.test.ts:456:        channel: '[7mlocalGguf[0m.library.addFile',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:457:        args: ['/p/x.gguf'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:458:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:459:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:460:        name: 'library.addFolder',[0m
> apps\desktop\src\preload\api.test.ts:461:        call: (a) => a.[7mlocalGguf[0m.library.addFolder('/models', true),
> apps\desktop\src\preload\api.test.ts:462:        channel: '[7mlocalGguf[0m.library.addFolder',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:463:        args: ['/models', true],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:464:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:465:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:466:        name: 'library.removeModel',[0m
> apps\desktop\src\preload\api.test.ts:467:        call: (a) => a.[7mlocalGguf[0m.library.removeModel('m1'),
> apps\desktop\src\preload\api.test.ts:468:        channel: '[7mlocalGguf[0m.library.removeModel',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:469:        args: ['m1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:470:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:471:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:472:        name: 'library.removeFolder',[0m
> apps\desktop\src\preload\api.test.ts:473:        call: (a) => a.[7mlocalGguf[0m.library.removeFolder('f1'),
> apps\desktop\src\preload\api.test.ts:474:        channel: '[7mlocalGguf[0m.library.removeFolder',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:475:        args: ['f1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:476:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:477:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:478:        name: 'library.scanFolder',[0m
> apps\desktop\src\preload\api.test.ts:479:        call: (a) => a.[7mlocalGguf[0m.library.scanFolder('f1'),
> apps\desktop\src\preload\api.test.ts:480:        channel: '[7mlocalGguf[0m.library.scanFolder',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:481:        args: ['f1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:482:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:483:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:484:        name: 'library.setSystemPrompt',[0m
> apps\desktop\src\preload\api.test.ts:485:        call: (a) => a.[7mlocalGguf[0m.library.setSystemPrompt('m1', 'hi'),
> apps\desktop\src\preload\api.test.ts:486:        channel: '[7mlocalGguf[0m.library.setSystemPrompt',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:487:        args: ['m1', 'hi'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:488:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:489:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:490:        name: 'library.setChatTemplate',[0m
> apps\desktop\src\preload\api.test.ts:491:        call: (a) => a.[7mlocalGguf[0m.library.setChatTemplate('m1', null),
> apps\desktop\src\preload\api.test.ts:492:        channel: '[7mlocalGguf[0m.library.setChatTemplate',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:493:        args: ['m1', null],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:494:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:495:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:496:        name: 'library.setAdvancedParams',[0m
> apps\desktop\src\preload\api.test.ts:497:        call: (a) => a.[7mlocalGguf[0m.library.setAdvancedParams('m1', [0m[7m[0m{ [0m
[7m[0mtemperature: [0m[7m[0m0.7 [0m[7m[0m}),[0m
> apps\desktop\src\preload\api.test.ts:498:        channel: '[7mlocalGguf[0m.library.setAdvancedParams',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:499:        args: ['m1', { temperature: 0.7 }],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:500:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:501:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:502:        name: 'library.resetAdvanced',[0m
> apps\desktop\src\preload\api.test.ts:503:        call: (a) => a.[7mlocalGguf[0m.library.resetAdvanced('m1'),
> apps\desktop\src\preload\api.test.ts:504:        channel: '[7mlocalGguf[0m.library.resetAdvanced',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:505:        args: ['m1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:506:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:507:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:508:        name: 'library.listBySourceType',[0m
> apps\desktop\src\preload\api.test.ts:509:        call: (a) => a.[7mlocalGguf[0m.library.listBySourceType('file'),
> apps\desktop\src\preload\api.test.ts:510:        channel: '[7mlocalGguf[0m.library.listBySourceType',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:511:        args: ['file'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:512:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:513:      // runtime.* + pool.*[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:514:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:515:        name: 'runtime.gpuInventory',[0m
> apps\desktop\src\preload\api.test.ts:516:        call: (a) => a.[7mlocalGguf[0m.runtime.gpuInventory(),
> apps\desktop\src\preload\api.test.ts:517:        channel: '[7mlocalGguf[0m.runtime.gpuInventory',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:518:        args: [],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:519:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:520:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:521:        name: 'runtime.reprobeGpu',[0m
> apps\desktop\src\preload\api.test.ts:522:        call: (a) => a.[7mlocalGguf[0m.runtime.reprobeGpu(),
> apps\desktop\src\preload\api.test.ts:523:        channel: '[7mlocalGguf[0m.runtime.reprobeGpu',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:524:        args: [],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:525:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:526:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:527:        name: 'runtime.settings',[0m
> apps\desktop\src\preload\api.test.ts:528:        call: (a) => a.[7mlocalGguf[0m.runtime.settings(),
> apps\desktop\src\preload\api.test.ts:529:        channel: '[7mlocalGguf[0m.runtime.settings',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:530:        args: [],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:531:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:532:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:533:        name: 'runtime.setSettings',[0m
> apps\desktop\src\preload\api.test.ts:534:        call: (a) => a.[7mlocalGguf[0m.runtime.setSettings({ [0m
[7m[0mmaxConcurrentLocalModels: [0m[7m[0m2 [0m[7m[0m}),[0m
> apps\desktop\src\preload\api.test.ts:535:        channel: '[7mlocalGguf[0m.runtime.setSettings',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:536:        args: [{ maxConcurrentLocalModels: 2 }],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:537:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:538:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:539:        name: 'runtime.binariesVersion',[0m
> apps\desktop\src\preload\api.test.ts:540:        call: (a) => a.[7mlocalGguf[0m.runtime.binariesVersion(),
> apps\desktop\src\preload\api.test.ts:541:        channel: '[7mlocalGguf[0m.runtime.binariesVersion',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:542:        args: [],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:543:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:544:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:545:        name: 'pool.status',[0m
> apps\desktop\src\preload\api.test.ts:546:        call: (a) => a.[7mlocalGguf[0m.pool.status(),
> apps\desktop\src\preload\api.test.ts:547:        channel: '[7mlocalGguf[0m.pool.status',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:548:        args: [],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:549:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:550:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:551:        name: 'pool.load',[0m
> apps\desktop\src\preload\api.test.ts:552:        call: (a) => a.[7mlocalGguf[0m.pool.load('m1'),
> apps\desktop\src\preload\api.test.ts:553:        channel: '[7mlocalGguf[0m.pool.load',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:554:        args: ['m1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:555:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:556:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:557:        name: 'pool.unload',[0m
> apps\desktop\src\preload\api.test.ts:558:        call: (a) => a.[7mlocalGguf[0m.pool.unload('m1'),
> apps\desktop\src\preload\api.test.ts:559:        channel: '[7mlocalGguf[0m.pool.unload',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:560:        args: ['m1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:561:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:562:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:563:        name: 'pool.setMaxConcurrent',[0m
> apps\desktop\src\preload\api.test.ts:564:        call: (a) => a.[7mlocalGguf[0m.pool.setMaxConcurrent(3),
> apps\desktop\src\preload\api.test.ts:565:        channel: '[7mlocalGguf[0m.pool.setMaxConcurrent',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:566:        args: [3],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:567:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:568:      // endpoint.*[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:569:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:570:        name: 'endpoint.list',[0m
> apps\desktop\src\preload\api.test.ts:571:        call: (a) => a.[7mlocalGguf[0m.endpoint.list(),
> apps\desktop\src\preload\api.test.ts:572:        channel: '[7mlocalGguf[0m.endpoint.list',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:573:        args: [],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:574:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:575:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:576:        name: 'endpoint.add',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:577:        call: (a) =>[0m
> apps\desktop\src\preload\api.test.ts:578:          a.[7mlocalGguf[0m.endpoint.add({[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:579:            name: 'lan',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:580:            baseUrl: 'http://h:8080',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:581:            authHeaderKeyRef: null,[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:582:          }),[0m
> apps\desktop\src\preload\api.test.ts:583:        channel: '[7mlocalGguf[0m.endpoint.add',[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.test.ts:584: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0margs: [0m[7m[0m[{ [0m[7m[0mname: [0m[7m[0m'lan', [0m[7m[0mbaseUrl: [0m[7m[0m'http://h:8080', [0m[7m[0mauthHeaderKeyRef: [0m
[7m[0mnull [0m[7m[0m}],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:585:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:586:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:587:        name: 'endpoint.remove',[0m
> apps\desktop\src\preload\api.test.ts:588:        call: (a) => a.[7mlocalGguf[0m.endpoint.remove('e1'),
> apps\desktop\src\preload\api.test.ts:589:        channel: '[7mlocalGguf[0m.endpoint.remove',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:590:        args: ['e1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:591:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:592:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:593:        name: 'endpoint.test',[0m
> apps\desktop\src\preload\api.test.ts:594:        call: (a) => a.[7mlocalGguf[0m.endpoint.test('e1'),
> apps\desktop\src\preload\api.test.ts:595:        channel: '[7mlocalGguf[0m.endpoint.test',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:596:        args: ['e1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:597:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:598:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:599:        name: 'endpoint.update',[0m
> apps\desktop\src\preload\api.test.ts:600:        call: (a) => a.[7mlocalGguf[0m.endpoint.update('e1', { name: 'lan2' }),
> apps\desktop\src\preload\api.test.ts:601:        channel: '[7mlocalGguf[0m.endpoint.update',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:602:        args: ['e1', { name: 'lan2' }],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:603:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:604:      // hf.*[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:605:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:606:        name: 'hf.search',[0m
> apps\desktop\src\preload\api.test.ts:607:        call: (a) => a.[7mlocalGguf[0m.hf.search('llama', { library: 'gguf' }),
> apps\desktop\src\preload\api.test.ts:608:        channel: '[7mlocalGguf[0m.hf.search',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:609:        args: ['llama', { library: 'gguf' }],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:610:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:611:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:612:        name: 'hf.modelCard',[0m
> apps\desktop\src\preload\api.test.ts:613:        call: (a) => a.[7mlocalGguf[0m.hf.modelCard('TheBloke/x'),
> apps\desktop\src\preload\api.test.ts:614:        channel: '[7mlocalGguf[0m.hf.modelCard',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:615:        args: ['TheBloke/x'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:616:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:617:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:618:        name: 'hf.startDownload',[0m
> apps\desktop\src\preload\api.test.ts:619:        call: (a) => a.[7mlocalGguf[0m.hf.startDownload('TheBloke/x', [0m[7m[0m'x.gguf', [0m
[7m[0m'/models'),[0m
> apps\desktop\src\preload\api.test.ts:620:        channel: '[7mlocalGguf[0m.hf.startDownload',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:621:        args: ['TheBloke/x', 'x.gguf', '/models'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:622:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:623:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:624:        name: 'hf.pauseDownload',[0m
> apps\desktop\src\preload\api.test.ts:625:        call: (a) => a.[7mlocalGguf[0m.hf.pauseDownload('h1'),
> apps\desktop\src\preload\api.test.ts:626:        channel: '[7mlocalGguf[0m.hf.pauseDownload',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:627:        args: ['h1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:628:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:629:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:630:        name: 'hf.resumeDownload',[0m
> apps\desktop\src\preload\api.test.ts:631:        call: (a) => a.[7mlocalGguf[0m.hf.resumeDownload('h1'),
> apps\desktop\src\preload\api.test.ts:632:        channel: '[7mlocalGguf[0m.hf.resumeDownload',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:633:        args: ['h1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:634:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:635:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:636:        name: 'hf.cancelDownload',[0m
> apps\desktop\src\preload\api.test.ts:637:        call: (a) => a.[7mlocalGguf[0m.hf.cancelDownload('h1'),
> apps\desktop\src\preload\api.test.ts:638:        channel: '[7mlocalGguf[0m.hf.cancelDownload',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:639:        args: ['h1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:640:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:641:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:642:        name: 'hf.activeDownloads',[0m
> apps\desktop\src\preload\api.test.ts:643:        call: (a) => a.[7mlocalGguf[0m.hf.activeDownloads(),
> apps\desktop\src\preload\api.test.ts:644:        channel: '[7mlocalGguf[0m.hf.activeDownloads',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:645:        args: [],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:646:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:647:      // benchmark.*[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:648:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:649:        name: 'benchmark.run',[0m
> apps\desktop\src\preload\api.test.ts:650:        call: (a) => a.[7mlocalGguf[0m.benchmark.run('m1'),
> apps\desktop\src\preload\api.test.ts:651:        channel: '[7mlocalGguf[0m.benchmark.run',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:652:        args: ['m1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:653:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:654:      {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:655:        name: 'benchmark.history',[0m
> apps\desktop\src\preload\api.test.ts:656:        call: (a) => a.[7mlocalGguf[0m.benchmark.history('m1'),
> apps\desktop\src\preload\api.test.ts:657:        channel: '[7mlocalGguf[0m.benchmark.history',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:658:        args: ['m1'],[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:659:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:660:    ];[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:661:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:662:    it.each(cases)([0m
[7m[0m  apps\desktop\src\preload\api.test.ts:663:      '$name routes to its channel with verbatim args',[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:664:      async ({ call, channel, args }) => {[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:665:        await call(api);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:666:        expect(fake.invokeCalls).toEqual([{ channel, args }]);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:667:      },[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:668:    );[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:669:[0m
  apps\desktop\src\preload\api.test.ts:670:    it('passes the resolved value through untouched (no wrapping)', async 
() => {
  apps\desktop\src\preload\api.test.ts:671:      const stub = [{ id: 'm1' }, { id: 'm2' }];
  apps\desktop\src\preload\api.test.ts:672:      fake.setNextInvokeResult(stub);
> apps\desktop\src\preload\api.test.ts:673:      const result = await api.[7mlocalGguf[0m.library.list();[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:674:      expect(result).toBe(stub);[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:675:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:676:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:677:[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:678:  describe('channel constants', () => {[0m
> apps\desktop\src\preload\api.test.ts:679:    it('[7mPRELOAD_CHANNELS [0m[7m[0mmatches [0m[7m[0mthe [0m[7m[0mshared-types [0m[7m[0mIpcContract [0m[7m[0mchannel [0m
[7m[0mnames', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
> apps\desktop\src\preload\api.test.ts:680:      const channels = [7mPRELOAD_CHANNELS[0m as Record<string, string>;
> apps\desktop\src\preload\api.test.ts:681:      expect([7mPRELOAD_CHANNELS[0m.employeesList).toBe('employees.list');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:682:      expect(channels.employeesUpdate).toBe('employees.update');[0m
> apps\desktop\src\preload\api.test.ts:683:      expect([7mPRELOAD_CHANNELS[0m.chatSend).toBe('chat.send');
> apps\desktop\src\preload\api.test.ts:684:      expect([7mPRELOAD_CHANNELS[0m.chatList).toBe('chat.list');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:685:      expect(channels.chatStop).toBe('chat.stop');[0m
> apps\desktop\src\preload\api.test.ts:686:      expect([7mPRELOAD_CHANNELS[0m.chatResolveThread).toBe('chat.resolveThread');
> apps\desktop\src\preload\api.test.ts:687:      expect([7mPRELOAD_CHANNELS[0m.eventsDashboard).toBe('events.dashboard');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:688:      expect(channels.telemetryRecentRuns).toBe('telemetry.recentRuns');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:689:      expect(channels.autonomyDoctorRun).toBe('autonomyDoctor.run');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:690:      expect(channels.autonomyBenchmarkRun).toBe('autonomyBenchmark.run');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:691:      expect(channels.agentImprovementList).toBe('agentImprovement.list');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:692:      expect(channels.agentImprovementRun).toBe('agentImprovement.run');[0m
> apps\desktop\src\preload\api.test.ts:693:      
expect([7mPRELOAD_CHANNELS[0m.providersListModels).toBe('providers.listModels');[0m
> apps\desktop\src\preload\api.test.ts:694:      // [7mlocalGguf[0m.* (v3.3.0) — spot-check one channel per area.
> apps\desktop\src\preload\api.test.ts:695:      expect(channels.[7mlocalGguf[0mLibraryList).toBe('localGguf.library.list');
> apps\desktop\src\preload\api.test.ts:696:      
expect(channels.[7mlocalGguf[0mRuntimeGpuInventory).toBe('localGguf.runtime.gpuInventory');[0m
> apps\desktop\src\preload\api.test.ts:697:      expect(channels.[7mlocalGguf[0mPoolStatus).toBe('localGguf.pool.status');
> apps\desktop\src\preload\api.test.ts:698:      
expect(channels.[7mlocalGguf[0mEndpointList).toBe('localGguf.endpoint.list');[0m
> apps\desktop\src\preload\api.test.ts:699:      expect(channels.[7mlocalGguf[0mHfSearch).toBe('localGguf.hf.search');
> apps\desktop\src\preload\api.test.ts:700:      
expect(channels.[7mlocalGguf[0mBenchmarkRun).toBe('localGguf.benchmark.run');[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:701:    });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:702:  });[0m
[7m[0m  apps\desktop\src\preload\api.test.ts:703:});[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'packages/shared-types/src/local-gguf.test.ts'" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 2230ms:
import { describe, expect, it } from 'vitest';

import {
  type AdvancedParams,
  type GpuBackend,
  type GpuInventory,
  type LocalGgufError,
  type LocalGgufRuntimeSettings,
  type LocalModel,
  type ModelStatus,
  type RemoteEndpoint,
  type SourceType,
  type WatchFolder,
  isLocalGgufError,
} from './local-gguf.js';

describe('isLocalGgufError', () => {
  it('returns true for any LocalGgufError variant', () => {
    const variants: LocalGgufError[] = [
      { kind: 'binary-not-found', backend: 'cuda', path: '/nope' },
      { kind: 'binary-unsupported', backend: 'rocm', osVersion: 'Windows 7' },
      { kind: 'gpu-probe-failed', reason: 'nvidia-smi missing' },
      { kind: 'oom-predicted', requiredMb: 9000, availableMb: 4000 },
      { kind: 'oom-runtime', lastStderr: 'CUDA OOM' },
      { kind: 'gguf-parse-failed', path: '/x.gguf', reason: 'EOF' },
      { kind: 'gguf-corrupt', path: '/x.gguf' },
      { kind: 'server-spawn-failed', exitCode: 1, stderr: 'no model' },
      { kind: 'server-crashed', pid: 1234, exitCode: null, stderr: 'sigsegv' },
      { kind: 'port-exhausted' },
      { kind: 'source-unreachable', path: '//NAS/models' },
      { kind: 'hf-download-failed', repo: 'a/b', file: 'c.gguf', httpStatus: 500, body: 'oops' },
      { kind: 'hf-rate-limited', retryAfterS: 60 },
      { kind: 'endpoint-unreachable', url: 'http://x:1234' },
      { kind: 'endpoint-auth-failed', url: 'http://x:1234' },
      { kind: 'pool-full', current: 1, max: 1 },
      { kind: 'context-too-large', requested: 99999, max: 4096 },
    ];
    for (const v of variants) {
      expect(isLocalGgufError(v)).toBe(true);
    }
  });

  it('returns false for non-error values', () => {
    expect(isLocalGgufError(null)).toBe(false);
    expect(isLocalGgufError(undefined)).toBe(false);
    expect(isLocalGgufError('error')).toBe(false);
    expect(isLocalGgufError(42)).toBe(false);
    expect(isLocalGgufError({})).toBe(false);
    expect(isLocalGgufError({ kind: 42 })).toBe(false);
    // Any non-empty (or empty) string `kind` passes the structural check;
    // spec-level validity of the discriminant is enforced by TypeScript.
    expect(isLocalGgufError({ kind: '' })).toBe(true);
  });
});

describe('LocalGgufError kind exhaustiveness', () => {
  // Compile-time exhaustiveness check — if a new variant is added to
  // LocalGgufError, this switch fails TypeScript compilation unless the new
  // variant is added here. The runtime assertion is incidental.
  it('every kind has a discriminator case', () => {
    function exhaustive(e: LocalGgufError): string {
      switch (e.kind) {
        case 'binary-not-found':
          return e.path;
        case 'binary-unsupported':
          return e.osVersion;
        case 'gpu-probe-failed':
          return e.reason;
        case 'oom-predicted':
          return `${e.requiredMb}/${e.availableMb}`;
        case 'oom-runtime':
          return e.lastStderr;
        case 'gguf-parse-failed':
          return e.reason;
        case 'gguf-corrupt':
          return e.path;
        case 'server-spawn-failed':
          return e.stderr;
        case 'server-crashed':
          return e.stderr;
        case 'port-exhausted':
          return 'port-exhausted';
        case 'source-unreachable':
          return e.path;
        case 'hf-download-failed':
          return e.repo;
        case 'hf-rate-limited':
          return String(e.retryAfterS);
        case 'endpoint-unreachable':
          return e.url;
        case 'endpoint-auth-failed':
          return e.url;
        case 'pool-full':
          return `${e.current}/${e.max}`;
        case 'context-too-large':
          return `${e.requested}/${e.max}`;
        default: {
          const _never: never = e;
          return _never;
        }
      }
    }
    expect(exhaustive({ kind: 'port-exhausted' })).toBe('port-exhausted');
  });
});

describe('GpuBackend type', () => {
  it('accepts the five backend values', () => {
    const backends: GpuBackend[] = ['cuda', 'rocm', 'vulkan', 'metal', 'cpu'];
    expect(backends).toHaveLength(5);
  });
});

describe('SourceType type', () => {
  it('accepts the three source-type values', () => {
    const sources: SourceType[] = ['file', 'folder-entry', 'remote-endpoint'];
    expect(sources).toHaveLength(3);
  });
});

describe('ModelStatus type', () => {
  it('accepts the six status values', () => {
    const statuses: ModelStatus[] = [
      'cold',
      'loading',
      'loaded',
      'error',
      'unreachable',
      'missing',
    ];
    expect(statuses).toHaveLength(6);
  });
});

describe('LocalModel shape', () => {
  it('accepts a fully-populated file-sourced model', () => {
    const m: LocalModel = {
      id: 'uuid-1',
      displayName: 'Llama-3.1-8B-Q4_K_M',
      sourceType: 'file',
      sourcePath: '/models/llama-3.1-8b.gguf',
      endpointId: null,
      ggufArch: 'llama',
      ggufParamsB: 8.0,
      ggufQuant: 'Q4_K_M',
      ggufContextMax: 131072,
      ggufSizeBytes: 4_900_000_000,
      ggufSha256: 'abc',
      ggufChatTemplate: '<|begin_of_text|>...',
      isEmbeddingModel: false,
      isToolCapable: false,
      hfRepoId: 'TheBloke/Meta-Llama-3.1-8B-Instruct-GGUF',
      hfFilename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
      license: 'Llama 3.1 Community License',
      chatTemplateOverride: null,
      systemPromptOverride: null,
      status: 'cold',
      statusDetail: null,
      lastUsedAt: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(m.id).toBe('uuid-1');
  });

  it('accepts a remote-endpoint-sourced model', () => {
    const m: LocalModel = {
      id: 'uuid-2',
      displayName: 'Remote LM Studio',
      sourceType: 'remote-endpoint',
      sourcePath: null,
      endpointId: 'ep-1',
      ggufArch: null,
      ggufParamsB: null,
      ggufQuant: null,
      ggufContextMax: null,
      ggufSizeBytes: null,
      ggufSha256: null,
      ggufChatTemplate: null,
      isEmbeddingModel: false,
      isToolCapable: false,
      hfRepoId: null,
      hfFilename: null,
      license: null,
      chatTemplateOverride: null,
      systemPromptOverride: null,
      status: 'cold',
      statusDetail: null,
      lastUsedAt: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(m.endpointId).toBe('ep-1');
  });
});

describe('GpuInventory shape', () => {
  it('accepts a fully populated NVIDIA inventory with S2 device extensions', () => {
    const inv: GpuInventory = {
      detectedAt: 1716750000000,
      cuda: {
        available: true,
        devices: [
          {
            name: 'NVIDIA GeForce GTX TITAN X',
            vramMb: 12288,
            backend: 'cuda',
            computeCap: '5.2',
            uuid: 'GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          },
        ],
        driverVersion: '582.28',
        cudaVersion: '13.0',
      },
      rocm: { available: false, devices: [] },
      vulkan: {
        available: true,
        devices: [
          {
            name: 'NVIDIA GeForce GTX TITAN X',
            vramMb: 12288,
            backend: 'vulkan',
            vendorId: '0x10de',
            deviceId: '0x17c2',
            deviceType: 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU',
            apiVersion: '1.4.312',
          },
        ],
      },
      metal: { available: false, devices: [] },
      cpu: { cores: 24, ramMb: 65536 },
    };
    expect(inv.cuda.devices[0]?.vramMb).toBe(12288);
    expect(inv.cuda.devices[0]?.computeCap).toBe('5.2');
    expect(inv.vulkan.devices[0]?.vendorId).toBe('0x10de');
  });
});

describe('LocalGgufRuntimeSettings shape', () => {
  it('accepts a default settings record', () => {
    const s: LocalGgufRuntimeSettings = {
      activeBackend: 'cpu',
      activeBackendIsAutoDetected: true,
      autoFallbackReason: null,
      maxConcurrentLocalModels: 1,
      defaultLibraryFolder: null,
      embeddingModelId: null,
      hfTokenKeyRef: null,
      llamaBinariesVersion: 'b9371',
    };
    expect(s.maxConcurrentLocalModels).toBe(1);
  });
});

describe('AdvancedParams shape (all-null = use auto-tune)', () => {
  it('accepts an all-null params record', () => {
    const p: AdvancedParams = {
      modelId: 'uuid-1',
      nCtx: null,
      nGpuLayers: null,
      nBatch: null,
      nThreads: null,
      temperature: null,
      topP: null,
      topK: null,
      repeatPenalty: null,
      mmap: null,
      mlock: null,
      flashAttention: null,
      updatedAt: 1716750000000,
    };
    expect(p.modelId).toBe('uuid-1');
  });
});

describe('RemoteEndpoint shape', () => {
  it('accepts a Local-tier endpoint', () => {
    const e: RemoteEndpoint = {
      id: 'ep-1',
      name: 'LM Studio on bench',
      baseUrl: 'http://192.168.1.50:1234',
      authHeaderKeyRef: null,
      privacyTier: 'Local',
      status: 'unknown',
      lastCheckedAt: null,
      lastError: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(e.privacyTier).toBe('Local');
  });
});

describe('WatchFolder shape', () => {
  it('accepts a UNC-path watched folder', () => {
    const w: WatchFolder = {
      id: 'wf-1',
      path: '\\\\NAS-01\\models\\meta',
      recursive: true,
      status: 'unknown',
      lastScanAt: null,
      lastScanError: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(w.path.startsWith('\\\\')).toBe(true);
  });
});

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm --config.engine-strict=false -r typecheck' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:53:58.965480Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 12.1 seconds
Output:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})
Scope: 7 of 8 workspace projects
packages/shared-types typecheck$ tsc --build
packages/shared-types typecheck: Done
packages/local-gguf-runtime typecheck$ tsc --noEmit
packages/provider-router typecheck$ tsc --noEmit
packages/role-schema typecheck$ tsc --noEmit
packages/telemetry-core typecheck$ tsc --noEmit
packages/telemetry-core typecheck: Done
packages/local-gguf-runtime typecheck: error TS5033: Could not write file 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/packages/local-gguf-runtime/tsconfig.tsbuildinfo': EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime\tsconfig.tsbuildinfo'.
packages/local-gguf-runtime typecheck: src/errors.ts(9,72): error TS2307: Cannot find module '@team-x/shared-types' or its corresponding type declarations.
packages/local-gguf-runtime typecheck: Failed
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @team-x/local-gguf-runtime@3.2.1 typecheck: `tsc --noEmit`
Exit status 2
 WARN   Local package.json exists, but node_modules missing, did you mean to install?

 exited 1 in 12078ms:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})
Scope: 7 of 8 workspace projects
packages/shared-types typecheck$ tsc --build
packages/shared-types typecheck: Done
packages/local-gguf-runtime typecheck$ tsc --noEmit
packages/provider-router typecheck$ tsc --noEmit
packages/role-schema typecheck$ tsc --noEmit
packages/telemetry-core typecheck$ tsc --noEmit
packages/telemetry-core typecheck: Done
packages/local-gguf-runtime typecheck: error TS5033: Could not write file 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/packages/local-gguf-runtime/tsconfig.tsbuildinfo': EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime\tsconfig.tsbuildinfo'.
packages/local-gguf-runtime typecheck: src/errors.ts(9,72): error TS2307: Cannot find module '@team-x/shared-types' or its corresponding type declarations.
packages/local-gguf-runtime typecheck: Failed
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @team-x/local-gguf-runtime@3.2.1 typecheck: `tsc --noEmit`
Exit status 2
 WARN   Local package.json exists, but node_modules missing, did you mean to install?

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content tsconfig.base.json; Get-ChildItem -Force packages/local-gguf-runtime | Format-List Name,Attributes,Mode; Get-Acl packages/local-gguf-runtime | Format-List' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1774ms:
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "useDefineForClassFields": true,
    "verbatimModuleSyntax": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "incremental": true
  }
}

[32;1mName       : [0msrc
[32;1mAttributes : [0mDirectory
[32;1mMode       : [0md----

[32;1mName       : [0mpackage.json
[32;1mAttributes : [0mArchive
[32;1mMode       : [0m-a---

[32;1mName       : [0mREADME.md
[32;1mAttributes : [0mArchive
[32;1mMode       : [0m-a---

[32;1mName       : [0mtsconfig.json
[32;1mAttributes : [0mArchive
[32;1mMode       : [0m-a---


[32;1mPath   : [0mMicrosoft.PowerShell.Core\FileSystem::C:\Users\User\Desktop\Development 
         Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime
[32;1mOwner  : [0mROCK-MILSPEC\User
[32;1mGroup  : [0mROCK-MILSPEC\None
[32;1mAccess : [0mS-1-5-21-577186432-3439525314-688626398-337205461 Allow  DeleteSubdirectoriesAndFiles, Modify, Synchronize
         ROCK-MILSPEC\CodexSandboxUsers Allow  DeleteSubdirectoriesAndFiles, Modify, Synchronize
         S-1-5-21-723469437-1496667196-98657571-4112109778 Allow  DeleteSubdirectoriesAndFiles, Modify, Synchronize
         NT AUTHORITY\SYSTEM Allow  FullControl
         BUILTIN\Administrators Allow  FullControl
         ROCK-MILSPEC\User Allow  FullControl
[32;1mAudit  : [0m
[32;1mSddl   : [0mO:S-1-5-21-3913449058-1645406423-3900345437-1001G:S-1-5-21-3913449058-1645406423-3900345437-513D:AI(A;OICIID;0
         x1301ff;;;S-1-5-21-577186432-3439525314-688626398-337205461)(A;OICIID;0x1301ff;;;S-1-5-21-3913449058-164540642
         3-3900345437-1003)(A;OICIID;0x1301ff;;;S-1-5-21-723469437-1496667196-98657571-4112109778)(A;OICIID;FA;;;SY)(A;
         OICIID;FA;;;BA)(A;OICIID;FA;;;S-1-5-21-3913449058-1645406423-3900345437-1001)


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-ChildItem packages/shared-types -Force | Select Name; Get-Content packages/provider-router/package.json; Get-Content packages/provider-router/tsconfig.json' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1207ms:

[32;1mName[0m
[32;1m----[0m
dist
node_modules
src
package.json
tsconfig.json
tsconfig.tsbuildinfo
{
  "name": "@team-x/provider-router",
  "version": "3.2.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@team-x/shared-types": "workspace:*",
    "ai": "^3.4.0",
    "@ai-sdk/anthropic": "^0.0.50",
    "@ai-sdk/openai": "0.0.72",
    "@ai-sdk/google": "0.0.55",
    "@ai-sdk/groq": "0.0.3",
    "@openrouter/ai-sdk-provider": "0.0.6",
    "ollama-ai-provider": "^0.15.0"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "vitest": "^2"
  }
}
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "outDir": "./dist",
    "noEmit": false,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx"],
  "references": [{ "path": "../shared-types" }]
}


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'apps/desktop/src/main/db/repos/local-models.test.ts'; Write-Host '--- endpoints test'; Get-Content -LiteralPath 'apps/desktop/src/main/db/repos/local-model-endpoints.test.ts'; Write-Host '--- advanced test'; Get-Content -LiteralPath 'apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts'; Write-Host '--- watch test'; Get-Content -LiteralPath 'apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts'" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1341ms:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { type InsertLocalModelInput, createLocalModelsRepo } from './local-models.js';

const NANOID = /^[A-Za-z0-9_-]{21}$/;

function fileFixture(name: string): InsertLocalModelInput {
  return {
    displayName: name,
    sourceType: 'file',
    sourcePath: `/m/${name}.gguf`,
    endpointId: null,
    ggufArch: 'llama',
    ggufParamsB: 7.0,
    ggufQuant: 'Q4_K_M',
    ggufContextMax: 4096,
    ggufSizeBytes: 4_000_000_000,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
  };
}

describe('localModelsRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  function seedEndpoint(id: string): void {
    ctx.raw.run(
      `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
       VALUES (?, 'EP', 'http://192.168.1.50:1234', 'Local', 'unknown', ?, ?)`,
      [id, Date.now(), Date.now()],
    );
  }

  it('insert + getById round-trips a file-source model', () => {
    const created = repo.insert(fileFixture('Llama-3.1-8B-Q4_K_M'));
    expect(created.id).toMatch(NANOID);
    expect(created.displayName).toBe('Llama-3.1-8B-Q4_K_M');
    expect(created.sourceType).toBe('file');
    expect(created.ggufParamsB).toBe(7.0);
    expect(created.isEmbeddingModel).toBe(false);
    expect(created.status).toBe('cold');
    expect(created.statusDetail).toBeNull();
    expect(created.lastUsedAt).toBeNull();
    expect(created.createdAt).toBeGreaterThan(0);
    expect(created.updatedAt).toBe(created.createdAt);

    expect(repo.getById(created.id)).toEqual(created);
  });

  it('getById returns null for an unknown id', () => {
    expect(repo.getById('does-not-exist')).toBeNull();
  });

  it('insert persists a remote-endpoint-sourced model', () => {
    seedEndpoint('ep-1');
    const created = repo.insert({
      ...fileFixture('Remote'),
      sourceType: 'remote-endpoint',
      sourcePath: null,
      endpointId: 'ep-1',
      ggufArch: null,
      ggufParamsB: null,
      ggufQuant: null,
      ggufContextMax: null,
      ggufSizeBytes: null,
    });
    expect(created.endpointId).toBe('ep-1');
    expect(created.sourcePath).toBeNull();
  });

  it('list orders most-recently-used first', () => {
    repo.insert(fileFixture('M1'));
    const m2 = repo.insert(fileFixture('M2'));
    repo.insert(fileFixture('M3'));
    repo.touchLastUsed(m2.id);

    const list = repo.list();
    expect(list).toHaveLength(3);
    expect(list[0]?.displayName).toBe('M2');
    expect(new Set(list.slice(1).map((m) => m.displayName))).toEqual(new Set(['M1', 'M3']));
  });

  it('list breaks ties on created_at DESC for never-used models', () => {
    const a = repo.insert(fileFixture('A'));
    const b = repo.insert(fileFixture('B'));
    // Force distinct created_at so the secondary sort key is deterministic.
    ctx.raw.run('UPDATE local_models SET created_at = ? WHERE id = ?', [1000, a.id]);
    ctx.raw.run('UPDATE local_models SET created_at = ? WHERE id = ?', [2000, b.id]);
    expect(repo.list().map((m) => m.displayName)).toEqual(['B', 'A']);
  });

  it('listBySourceType filters correctly', () => {
    const m1 = repo.insert(fileFixture('M1'));
    const m2 = repo.insert(fileFixture('M2'));
    seedEndpoint('ep-1');
    const m3 = repo.insert({
      ...fileFixture('M3'),
      sourceType: 'remote-endpoint',
      sourcePath: null,
      endpointId: 'ep-1',
    });

    expect(
      repo
        .listBySourceType('file')
        .map((m) => m.id)
        .sort(),
    ).toEqual([m1.id, m2.id].sort());
    expect(repo.listBySourceType('remote-endpoint').map((m) => m.id)).toEqual([m3.id]);
  });

  it('updateStatus updates status + detail + updatedAt', () => {
    const m = repo.insert(fileFixture('M1'));
    const result = repo.updateStatus(m.id, 'error', 'failed to load');
    expect(result.status).toBe('error');
    expect(result.statusDetail).toBe('failed to load');
    expect(result.updatedAt).toBeGreaterThanOrEqual(m.updatedAt);
  });

  it('setSystemPrompt persists and clears the per-model override', () => {
    const m = repo.insert(fileFixture('M1'));
    expect(repo.setSystemPrompt(m.id, 'You are a sarcastic assistant.').systemPromptOverride).toBe(
      'You are a sarcastic assistant.',
    );
    expect(repo.setSystemPrompt(m.id, null).systemPromptOverride).toBeNull();
  });

  it('setChatTemplateOverride persists', () => {
    const m = repo.insert(fileFixture('M1'));
    const updated = repo.setChatTemplateOverride(m.id, '<|user|>{{prompt}}<|assistant|>');
    expect(updated.chatTemplateOverride).toBe('<|user|>{{prompt}}<|assistant|>');
  });

  it('remove deletes the row', () => {
    const m = repo.insert(fileFixture('M1'));
    repo.remove(m.id);
    expect(repo.getById(m.id)).toBeNull();
  });

  it('remove cascades to local_model_advanced_params', () => {
    const m = repo.insert(fileFixture('M1'));
    ctx.raw.run(
      'INSERT INTO local_model_advanced_params (model_id, n_ctx, updated_at) VALUES (?, 8192, ?)',
      [m.id, Date.now()],
    );
    const before = ctx.raw.exec('SELECT COUNT(*) FROM local_model_advanced_params')[0]
      ?.values[0]?.[0];
    expect(before).toBe(1);
    repo.remove(m.id);
    const after = ctx.raw.exec('SELECT COUNT(*) FROM local_model_advanced_params')[0]
      ?.values[0]?.[0];
    expect(after).toBe(0);
  });
});
--- endpoints test
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createLocalModelEndpointsRepo } from './local-model-endpoints.js';

const NANOID = /^[A-Za-z0-9_-]{21}$/;

describe('localModelEndpointsRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelEndpointsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelEndpointsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  it('insert + getById round-trips', () => {
    const created = repo.insert({
      name: 'LM Studio on bench',
      baseUrl: 'http://192.168.1.50:1234',
      authHeaderKeyRef: null,
    });
    expect(created.id).toMatch(NANOID);
    expect(created.name).toBe('LM Studio on bench');
    expect(created.baseUrl).toBe('http://192.168.1.50:1234');
    expect(created.privacyTier).toBe('Local');
    expect(created.status).toBe('unknown');
    expect(created.lastCheckedAt).toBeNull();
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('getById returns null for an unknown id', () => {
    expect(repo.getById('nope')).toBeNull();
  });

  it('list returns endpoints newest-first', () => {
    const a = repo.insert({ name: 'A', baseUrl: 'http://a', authHeaderKeyRef: null });
    const b = repo.insert({ name: 'B', baseUrl: 'http://b', authHeaderKeyRef: null });
    const c = repo.insert({ name: 'C', baseUrl: 'http://c', authHeaderKeyRef: null });
    // Force distinct created_at so the DESC ordering is deterministic.
    ctx.raw.run('UPDATE local_model_endpoints SET created_at = ? WHERE id = ?', [1000, a.id]);
    ctx.raw.run('UPDATE local_model_endpoints SET created_at = ? WHERE id = ?', [2000, b.id]);
    ctx.raw.run('UPDATE local_model_endpoints SET created_at = ? WHERE id = ?', [3000, c.id]);
    expect(repo.list().map((e) => e.name)).toEqual(['C', 'B', 'A']);
  });

  it('updateStatus sets status + lastCheckedAt + lastError', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    const updated = repo.updateStatus(e.id, 'unreachable', 'ECONNREFUSED');
    expect(updated.status).toBe('unreachable');
    expect(updated.lastError).toBe('ECONNREFUSED');
    expect(updated.lastCheckedAt).toBeGreaterThan(0);
  });

  it('updateAuthRef rotates and clears the keytar reference', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    expect(repo.updateAuthRef(e.id, 'team-x.local-gguf.endpoint:X-v1').authHeaderKeyRef).toBe(
      'team-x.local-gguf.endpoint:X-v1',
    );
    expect(repo.updateAuthRef(e.id, null).authHeaderKeyRef).toBeNull();
  });

  it('rename updates the name', () => {
    const e = repo.insert({ name: 'Old', baseUrl: 'http://x', authHeaderKeyRef: null });
    expect(repo.rename(e.id, 'New').name).toBe('New');
  });

  it('remove deletes the endpoint', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    repo.remove(e.id);
    expect(repo.getById(e.id)).toBeNull();
  });

  it('removing an endpoint cascades to its local_models rows', () => {
    const e = repo.insert({ name: 'X', baseUrl: 'http://x', authHeaderKeyRef: null });
    ctx.raw.run(
      `INSERT INTO local_models (id, display_name, source_type, endpoint_id, created_at, updated_at)
       VALUES ('m1', 'M', 'remote-endpoint', ?, ?, ?)`,
      [e.id, Date.now(), Date.now()],
    );
    repo.remove(e.id);
    const count = ctx.raw.exec("SELECT COUNT(*) FROM local_models WHERE id = 'm1'")[0]
      ?.values[0]?.[0];
    expect(count).toBe(0);
  });

  it('rejects a non-Local privacy_tier (CHECK constraint)', () => {
    expect(() =>
      ctx.raw.run(
        `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
         VALUES ('bad', 'Bad', 'http://x', 'Cloud', 'unknown', ?, ?)`,
        [Date.now(), Date.now()],
      ),
    ).toThrow();
  });
});
--- advanced test
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createLocalModelAdvancedParamsRepo } from './local-model-advanced-params.js';
import { createLocalModelsRepo } from './local-models.js';

function fileModel(name: string) {
  return {
    displayName: name,
    sourceType: 'file' as const,
    sourcePath: `/m/${name}.gguf`,
    endpointId: null,
    ggufArch: null,
    ggufParamsB: null,
    ggufQuant: null,
    ggufContextMax: null,
    ggufSizeBytes: null,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
  };
}

const ALL_NULL = {
  nCtx: null,
  nGpuLayers: null,
  nBatch: null,
  nThreads: null,
  temperature: null,
  topP: null,
  topK: null,
  repeatPenalty: null,
  mmap: null,
  mlock: null,
  flashAttention: null,
};

describe('localModelAdvancedParamsRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelAdvancedParamsRepo>;
  let modelId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelAdvancedParamsRepo(ctx.db);
    // Seed a model so the FK target is valid.
    modelId = createLocalModelsRepo(ctx.db).insert(fileModel('M')).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it('upsert inserts when no row exists', () => {
    const result = repo.upsert(modelId, {
      nCtx: 8192,
      nGpuLayers: 35,
      nBatch: 512,
      nThreads: 8,
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      repeatPenalty: 1.1,
      mmap: true,
      mlock: false,
      flashAttention: true,
    });
    expect(result.modelId).toBe(modelId);
    expect(result.nCtx).toBe(8192);
    expect(result.temperature).toBe(0.7);
    expect(result.mmap).toBe(true);
    expect(result.mlock).toBe(false);
    expect(result.flashAttention).toBe(true);
  });

  it('upsert updates an existing row in place (PK is model_id)', () => {
    repo.upsert(modelId, { ...ALL_NULL, nCtx: 4096, nGpuLayers: 0 });
    const updated = repo.upsert(modelId, { ...ALL_NULL, nCtx: 8192, nGpuLayers: 35 });
    expect(updated.nCtx).toBe(8192);
    expect(updated.nGpuLayers).toBe(35);

    const count = ctx.raw.exec(
      `SELECT COUNT(*) FROM local_model_advanced_params WHERE model_id = '${modelId}'`,
    )[0]?.values[0]?.[0];
    expect(count).toBe(1);
  });

  it('getByModelId returns null for an unknown model', () => {
    expect(repo.getByModelId('does-not-exist')).toBeNull();
  });

  it('getByModelId returns the row when present', () => {
    repo.upsert(modelId, { ...ALL_NULL, nCtx: 4096 });
    expect(repo.getByModelId(modelId)?.nCtx).toBe(4096);
  });

  it('clear removes the row (caller uses this for Reset-to-Auto)', () => {
    repo.upsert(modelId, { ...ALL_NULL, nCtx: 4096, nGpuLayers: 35 });
    repo.clear(modelId);
    expect(repo.getByModelId(modelId)).toBeNull();
  });

  it('clear is a no-op for an unknown model', () => {
    expect(() => repo.clear('does-not-exist')).not.toThrow();
  });

  it('cascade-deletes when the parent model row is removed', () => {
    repo.upsert(modelId, { ...ALL_NULL, nCtx: 4096 });
    ctx.raw.run('DELETE FROM local_models WHERE id = ?', [modelId]);
    expect(repo.getByModelId(modelId)).toBeNull();
  });

  it('rejects an mmap value outside {0, 1, NULL}', () => {
    expect(() =>
      ctx.raw.run(
        'INSERT INTO local_model_advanced_params (model_id, mmap, updated_at) VALUES (?, 2, ?)',
        [modelId, Date.now()],
      ),
    ).toThrow();
  });

  it('upsert throws a greppable error if the row vanishes between write and read-back', () => {
    // The only way getByModelId can come back empty immediately after a
    // successful upsert is a DB-layer fault. The defensive guard turns that
    // silent corruption into a loud error instead of returning a bad row.
    // We drive it with a db whose write succeeds but whose read-back is empty.
    const noopRun = { run: () => undefined };
    const fakeDb = {
      insert: () => ({ values: () => ({ onConflictDoUpdate: () => noopRun }) }),
      select: () => ({ from: () => ({ where: () => ({ get: () => undefined }) }) }),
    } as unknown as Parameters<typeof createLocalModelAdvancedParamsRepo>[0];
    const guardedRepo = createLocalModelAdvancedParamsRepo(fakeDb);
    expect(() => guardedRepo.upsert('ghost', ALL_NULL)).toThrow(/not found after upsert/i);
  });
});
--- watch test
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createLocalModelWatchFoldersRepo } from './local-model-watch-folders.js';

const NANOID = /^[A-Za-z0-9_-]{21}$/;

describe('localModelWatchFoldersRepo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createLocalModelWatchFoldersRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createLocalModelWatchFoldersRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  it('insert + getById round-trips a UNC path', () => {
    const created = repo.insert({ path: '\\\\NAS-01\\models', recursive: true });
    expect(created.id).toMatch(NANOID);
    expect(created.path).toBe('\\\\NAS-01\\models');
    expect(created.recursive).toBe(true);
    expect(created.status).toBe('unknown');
    expect(created.lastScanAt).toBeNull();
    expect(repo.getById(created.id)).toEqual(created);
  });

  it('insert defaults recursive to true when omitted', () => {
    expect(repo.insert({ path: '/Users/rocky/models' }).recursive).toBe(true);
  });

  it('insert honors recursive=false', () => {
    expect(repo.insert({ path: '/x', recursive: false }).recursive).toBe(false);
  });

  it('list returns folders oldest-first (stable UI ordering)', () => {
    const a = repo.insert({ path: '/a' });
    const b = repo.insert({ path: '/b' });
    const c = repo.insert({ path: '/c' });
    // Force distinct created_at so the ASC ordering is deterministic.
    ctx.raw.run('UPDATE local_model_watch_folders SET created_at = ? WHERE id = ?', [1000, a.id]);
    ctx.raw.run('UPDATE local_model_watch_folders SET created_at = ? WHERE id = ?', [2000, b.id]);
    ctx.raw.run('UPDATE local_model_watch_folders SET created_at = ? WHERE id = ?', [3000, c.id]);
    expect(repo.list().map((w) => w.path)).toEqual(['/a', '/b', '/c']);
  });

  it('updateStatus sets status + lastScanAt + lastScanError', () => {
    const w = repo.insert({ path: '/x' });
    const updated = repo.updateStatus(w.id, 'unreachable', 'EACCES');
    expect(updated.status).toBe('unreachable');
    expect(updated.lastScanError).toBe('EACCES');
    expect(updated.lastScanAt).toBeGreaterThan(0);
  });

  it('updateRecursive flips the recursive flag', () => {
    const w = repo.insert({ path: '/x', recursive: true });
    expect(repo.updateRecursive(w.id, false).recursive).toBe(false);
  });

  it('remove deletes the row', () => {
    const w = repo.insert({ path: '/x' });
    repo.remove(w.id);
    expect(repo.getById(w.id)).toBeNull();
  });
});

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-ChildItem apps/desktop/src/main/db/migrations/meta | Select-Object Name; Get-ChildItem apps/desktop/src/main/db/migrations | Select-Object Name | Sort-Object Name | Select-Object -Last 8' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 972ms:

[32;1mName[0m
[32;1m----[0m
_journal.json
0000_snapshot.json
0001_snapshot.json
0002_snapshot.json
0030_tickets_goal_id.sql
0031_agent_wakeup_requests.sql
0032_schedule_items.sql
0033_runs_cache_tokens.sql
0034_pending_delegations.sql
0035_runs_events_trace_id.sql
0036_local_gguf.sql
meta


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content apps/desktop/src/main/ipc/register.ts -TotalCount 220' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 878ms:
/**
 * IPC register — the electron-glue layer for the pure handlers in
 * `./handlers.ts`. Two responsibilities:
 *
 *   1. Mount each handler on `ipcMain.handle` against the channel name
 *      from the shared-types `IpcContract`. The Electron `invoke` /
 *      `handle` pair is the only IPC pattern Team-X uses for
 *      request/response — fire-and-forget signaling goes through the
 *      dashboard event channel below.
 *
 *   2. Subscribe a forwarder to the orchestrator's event bus that
 *      fans every `DashboardEvent` out to every live `BrowserWindow`
 *      via `webContents.send('events.dashboard', evt)`. This is the
 *      one-way push channel the renderer subscribes to via the
 *      preload bridge (T34) so the cockpit can update in real time.
 *
 * Why this file is intentionally tiny:
 *
 *   Everything interesting (request validation, repo coordination,
 *   row → public-shape mapping, fail-closed checks, fire-and-forget
 *   orchestrator wiring) lives in `handlers.ts` where it can be
 *   exhaustively unit-tested without electron. This file is just the
 *   wiring — three `ipcMain.handle` calls and one bus subscription —
 *   so it has zero unit tests by design. Integration coverage lands
 *   in the Playwright smoke test (T49) which boots a real Electron
 *   instance.
 *
 * Lifecycle:
 *
 *   `registerIpcHandlers` returns an `unregister` function that the
 *   main process invokes from `app.will-quit`. The unregister:
 *
 *     - removes every `ipcMain.handle` mapping (so a stray late
 *       invoke from a teardown sequence doesn't hit a ghost handler),
 *     - and detaches the bus subscriber (so the bus does not keep a
 *       dead reference to a `webContents` that has already been
 *       garbage collected).
 *
 *   The forwarder also defends against destroyed windows: a
 *   `webContents.send` on a destroyed `BrowserWindow` throws, and
 *   that throw must NOT cascade into the bus and break delivery to
 *   the rest of the windows. We pre-filter via `isDestroyed()` and
 *   wrap the `send` in try/catch as a belt-and-suspenders measure.
 */

import type { MeetingMode } from '@team-x/shared-types';
import { BrowserWindow, ipcMain } from 'electron';

import type { EventBus } from '../orchestrator/event-bus.js';

import type { IpcHandlers } from './handlers.js';

/**
 * Channel names — kept as a const tuple so the matching unregister
 * call can iterate them without re-typing the strings (and so a
 * future change to the contract has exactly one source of truth).
 *
 * Mirrors the channel keys in `@team-x/shared-types` `IpcContract`;
 * the typed preload bridge in T34 hands the renderer a wrapper that
 * uses these exact strings.
 */
const REQUEST_CHANNELS = [
  'system.selectDirectory',
  'companies.list',
  'companies.exportPackage',
  'companies.previewImportPackage',
  'companies.importPackage',
  'companies.listTemplates',
  'companies.installTemplate',
  'companies.archive',
  'companies.create',
  // Multi-company CRUD write-side (Phase 5.6 M-C step e; audit rows 10.13 + 10.15).
  // Both emit bus events per architectural invariant #11.
  'companies.update',
  'companies.delete',
  'employees.list',
  'operators.list',
  'operators.readiness',
  'cloud.getWorkspaceLink',
  'cloud.linkWorkspace',
  'cloud.unlinkWorkspace',
  'cloud.reconnectWorkspace',
  'operators.listInvites',
  'operators.createInvite',
  'operators.revokeInvite',
  'operators.acceptInvite',
  'runtimeProfiles.list',
  'runtimeProfiles.create',
  'runtimeProfiles.update',
  'runtimeProfiles.delete',
  'runtimeProfiles.bindEmployee',
  'runtimeProfiles.validate',
  'runtimeOperations.snapshot',
  'autonomyDoctor.run',
  'autonomyBenchmark.run',
  'agentImprovement.list',
  'agentImprovement.run',
  'routines.list',
  'routines.create',
  'routines.update',
  'routines.delete',
  'routines.listRuns',
  'routines.runNow',
  'budgets.listPolicies',
  'budgets.createPolicy',
  'budgets.updatePolicy',
  'budgets.deletePolicy',
  'budgets.listLedger',
  'budgets.getOverview',
  'budgets.listApprovals',
  'approvals.list',
  'approvals.review',
  'artifacts.list',
  'memory.getThreadDigest',
  'memory.listRunCheckpoints',
  'memory.packThreadContext',
  'schedule.list',
  'schedule.create',
  'schedule.update',
  'schedule.complete',
  'schedule.delete',
  'employees.create',
  'employees.fire',
  'employees.update',
  // Org chart write-side (Phase 2 — M9; restored Phase 5.6 M-C step d
  // per audit rows 2.19 + 2.20). Both emit bus events per invariant #11.
  'employees.promote',
  'employees.setManager',
  // Org chart (Phase 2 — M9; restored Phase 5.6 M-C step c per audit row 2.21)
  'orgchart.get',
  'chat.send',
  'chat.list',
  'chat.stop',
  'chat.resolveThread',
  'chat.listThreads',
  // Events / timeline (Phase 3 — M14)
  'events.list',
  // MCP management (Phase 2 — M10)
  'mcp.list',
  'mcp.listTemplates',
  'mcp.toggle',
  'mcp.addServer',
  'mcp.installTemplate',
  'mcp.removeServer',
  'mcp.testConnection',
  'extensions.list',
  'extensions.installLocalSkill',
  'extensions.installGithubSkill',
  'extensions.removeSkill',
  'extensions.listSkillAssignments',
  'extensions.upsertSkillAssignment',
  'extensions.deleteSkillAssignment',
  'authority.list',
  'authority.listRequests',
  'authority.create',
  'authority.delete',
  'authority.reviewRequest',
  'authority.getEffective',
  // Goals management (Phase 3 — M15)
  'goals.create',
  'goals.update',
  'goals.list',
  'goals.get',
  'goals.delete',
  // Projects management (Phase 3 — M15)
  'projects.create',
  'projects.update',
  'projects.list',
  'projects.get',
  'projects.delete',
  'projects.linkTicket',
  'projects.unlinkTicket',
  // Meeting management (Phase 3 — M16)
  'meetings.call',
  'meetings.end',
  'meetings.interject',
  'meetings.list',
  'meetings.get',
  // Telemetry (Phase 3 — M17)
  'telemetry.companyStats',
  'telemetry.dailyUsage',
  'telemetry.employeeStats',
  'telemetry.recentRuns',
  'telemetry.costBreakdown',
  // Settings (Phase 3 — M19)
  'settings.getRuntime',
  'settings.setRuntime',
  'settings.getPrivacy',
  'settings.setPrivacy',
  'settings.getConcurrency',
  'settings.setConcurrency',
  'settings.getExtensions',
  'settings.setExtensions',
  'settings.getMemory',
  'settings.setMemory',
  'settings.getRagConfig',
  'settings.setRagConfig',
  // Enhanced AI (Phase 5 — M32)
  'settings.getEnhancedAiConfig',
  'settings.setEnhancedAiConfig',
  // Agentic loop (Phase 5 — M31)
  'settings.getAgentic',
  'settings.setAgentic',
  // Task planner (Phase 5 — M32)
  'settings.getPlanner',
  'settings.setPlanner',
  'settings.getCopilot',
  'settings.setCopilot',
  'settings.getCopilotWeights',
  'settings.setCopilotWeights',
  // Proactive settings (Phase 6 — Proactive Execution System)
  'settings.getProactive',
  'settings.setProactive',
  // Provider management (Phase 3 — M18)
  'providers.list',
  'providers.add',
  'providers.update',
  'providers.remove',
  'providers.testConnection',
  'providers.listModels',

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content apps/desktop/src/main/ipc/register.ts -Tail 120' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 917ms:

  ipcMain.handle(
    'tickets.update',
    async (
      _event,
      request: {
        ticketId: string;
        title?: string;
        description?: string;
        priority?: string;
        status?: string;
        labelsJson?: string;
        slaHours?: number | null;
        dueAt?: number | null;
      },
    ) => {
      return handlers.ticketsUpdate(request);
    },
  );

  ipcMain.handle(
    'tickets.assign',
    async (_event, request: { ticketId: string; assigneeId: string }) => {
      return handlers.ticketsAssign(request);
    },
  );

  ipcMain.handle(
    'tickets.addParticipant',
    async (_event, request: { ticketId: string; employeeId: string }) => {
      return handlers.ticketsAddParticipant(request);
    },
  );

  ipcMain.handle(
    'tickets.removeParticipant',
    async (_event, request: { ticketId: string; employeeId: string }) => {
      return handlers.ticketsRemoveParticipant(request);
    },
  );

  ipcMain.handle('tickets.close', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsClose(request);
  });

  ipcMain.handle('tickets.reopen', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsReopen(request);
  });

  ipcMain.handle(
    'tickets.addComment',
    async (_event, request: { ticketId: string; content: string }) => {
      return handlers.ticketsAddComment(request);
    },
  );

  ipcMain.handle('tickets.list', async (_event, request: { companyId: string }) => {
    return handlers.ticketsList(request);
  });

  ipcMain.handle('tickets.get', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsGet(request);
  });

  // Ticket attachment handlers (Phase 4 — M22)
  ipcMain.handle(
    'tickets.attachFile',
    async (_event, request: { ticketId: string; fileId: string }) => {
      return handlers.ticketsAttachFile(request);
    },
  );

  ipcMain.handle(
    'tickets.detachFile',
    async (_event, request: { ticketId: string; fileId: string }) => {
      return handlers.ticketsDetachFile(request);
    },
  );

  ipcMain.handle('tickets.listAttachments', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsListAttachments(request);
  });

  // Updater handlers (Phase 4 — M25)
  ipcMain.handle('updater.check', async () => {
    return handlers.updaterCheck();
  });

  ipcMain.handle('updater.install', async () => {
    return handlers.updaterInstall();
  });

  // Bus → renderer forwarder. The bus is synchronous fan-out, so the
  // listener runs on the same tick as the orchestrator's `emit` call —
  // tokens reach the renderer with no extra event-loop hop.
  const unsubscribe = bus.subscribe((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send(EVENT_CHANNEL, event);
      } catch (err) {
        // A `webContents.send` failure on one window must not break
        // delivery to the others, and must not propagate back into
        // the bus (where the orchestrator would see a thrown listener).
        // Log so the failure is not silent and move on.
        console.error(
          `[ipc/register] failed to forward event ${event.id} (${event.type}) to window ${win.id}:`,
          err,
        );
      }
    }
  });

  return function unregister(): void {
    for (const channel of REQUEST_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
    unsubscribe();
  };
}

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "git -c safe.directory='C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' diff --unified=40 e52e373101fe0d413b423704c1ebd2eecb98afa6 -- CHANGELOG.md" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 942ms:
diff --git a/CHANGELOG.md b/CHANGELOG.md
index b214415..5c8189e 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -1,52 +1,71 @@
 # Changelog
 
 All notable changes to Team-X are documented in this file.
 
 The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
 and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
 
 ---
 
 ## [Unreleased]
 
 ### Added
+- **Local & Networked GGUF Support (Phase 1 — Foundation)**: scaffolded the
+  `@team-x/local-gguf-runtime` package and the shared TypeScript contracts in
+  `@team-x/shared-types` (`LocalGgufError` union, `LocalModel`, `GpuInventory`,
+  `GgufMetadata`, `AdvancedParams`, `BenchmarkResult`, `RemoteEndpoint`,
+  `WatchFolder`, `LocalGgufRuntimeSettings`, plus the `LocalGgufApi` bridge
+  surface and Hugging Face result shapes). Added Drizzle migration
+  `0036_local_gguf` with five new tables (`local_models`,
+  `local_model_advanced_params`, `local_model_benchmarks`,
+  `local_model_endpoints`, `local_model_watch_folders`), CHECK constraints
+  disambiguating source-type/path/endpoint, and indexes covering hot queries
+  plus FK-cascade paths. Added four Drizzle-native db repos (local-models,
+  local-model-advanced-params, local-model-endpoints, local-model-watch-folders)
+  and the `localGguf.*` runtime-settings accessor. Registered all five IPC
+  handler modules — library, runtime + pool, hf, benchmark, endpoint — as
+  typed stubs (every channel throws a not-implemented error; later phases swap
+  in the real services). Exposed the typed `window.teamx.localGguf` surface
+  through the preload bridge, and pinned the llama.cpp release (`b9371`,
+  Spike S1) at the repo root. No user-visible feature in this phase — pure
+  foundation.
 
 ### Changed
 
 ### Fixed
 
 ### Deprecated
 
 ### Removed
 
 ### Security
 
 ---
 
 ## [3.2.1] — 2026-05-12 — Release pipeline hardening · electron-updater enablement
 
 Patch release focused entirely on release engineering. **No user-facing
 functional changes** vs v3.2.0 — same desktop app, same role packs, same
 provider routing. What changed is everything downstream of `git tag`:
 the v3.2.0 ship surfaced four latent bugs in `release.yml` and
 `electron-builder.yml` that the cross-platform CI matrix had been
 masking. Three are closed here; the fourth (`mac.identity: null`
 removal) is still gated on Apple Developer enrollment landing
 externally.
 
 The single user-visible effect is that **auto-update now works**.
 v3.2.0 users who click "Check for Updates" in Settings will see v3.2.1
 offered as a differential download (~hundreds of KB vs the ~95 MB full
 installer), thanks to the `latest*.yml` discovery manifests and
 `.blockmap` files this release ships. The v3.2.0 release itself was
 backfilled with the same 7 files (sourced from the still-cached
 release.yml run 25707677222 artifact bundles) so the v3.2.0 → v3.2.1
 update path works retroactively, not just for releases tagged from this
 commit forward.
 
 Pipeline-side, this release validates end-to-end on real CI: every
 future `release.yml` run produces exactly 14 assets — 6 installers + 4
 `.blockmap` + 3 `latest*.yml` + 1 consolidated `SHA256SUMS.txt`.
 
 ### Added
 

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Select-String -Path pnpm-lock.yaml -Pattern "drizzle-orm@" -Context 0,3 | Select-Object -First 3' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1286ms:

> pnpm-lock.yaml:3098:  [7mdrizzle-orm@[0m0.33.0:[0m
[7m [0m[7m [0m[7m[0mpnpm-lock.yaml:3099: [0m[7m [0m[7m [0m[7m [0m[7m[0mresolution: [0m[7m[0m{integrity: [0m
[7m[0msha512-SHy72R2Rdkz0LEq0PSG/IdvnT3nGiWuRk+2tXZQ90GVq/XQhpCzu/EFT3V2rox+w8MlkBQxifF8pCStNYnERfA==}[0m
[7m[0m  pnpm-lock.yaml:3100:    peerDependencies:[0m
[7m[0m  pnpm-lock.yaml:3101:      '@aws-sdk/client-rds-data': '>=3'[0m
> pnpm-lock.yaml:8341:  [7mdrizzle-orm@[0m0.33.0(@opentelemetry/api@1.9.0)(@types/better-sqlite3@7.6.13)(@types/react@19.2.14[0m
[7m[0m)(@types/sql.js@1.4.11)(better-sqlite3@11.10.0)(react@19.2.4)(sql.js@1.14.1):[0m
[7m[0m  pnpm-lock.yaml:8342:    optionalDependencies:[0m
[7m[0m  pnpm-lock.yaml:8343:      '@opentelemetry/api': 1.9.0[0m
[7m[0m  pnpm-lock.yaml:8344:      '@types/better-sqlite3': 7.6.13[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'apps/desktop/src/main/db/schema.ts' -Pattern 'check\\(' -Context 1,4" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1091ms:

  apps\desktop\src\main\db\schema.ts:1700:  (table) => ({
> apps\desktop\src\main\db\schema.ts:1701:    privacyTierCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1702:      'local_model_endpoints_privacy_tier_check',[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1703:      sql`${table.privacyTier} = 'Local'`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1704:    ),[0m
> apps\desktop\src\main\db\schema.ts:1705:    statusCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1706:      'local_model_endpoints_status_check',[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\main\db\schema.ts:1707: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0msql`${table.status} [0m[7m[0min [0m[7m[0m('unknown', [0m[7m[0m'reachable', [0m[7m[0m'unreachable', [0m
[7m[0m'auth-failed')`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1708:    ),[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1709:  }),[0m
  apps\desktop\src\main\db\schema.ts:1726:    statusIdx: 
index('idx_local_model_watch_folders_status').on(table.status),
> apps\desktop\src\main\db\schema.ts:1727:    recursiveCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1728:      'local_model_watch_folders_recursive_check',[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1729:      sql`${table.recursive} in (0, 1)`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1730:    ),[0m
> apps\desktop\src\main\db\schema.ts:1731:    statusCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1732:      'local_model_watch_folders_status_check',[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1733:      sql`${table.status} in ('unknown', 'reachable', 'unreachable')`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1734:    ),[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1735:  }),[0m
  apps\desktop\src\main\db\schema.ts:1778:    endpointIdIdx: 
index('idx_local_models_endpoint_id').on(table.endpointId),
> apps\desktop\src\main\db\schema.ts:1779:    sourceTypeCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1780:      'local_models_source_type_check',[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\main\db\schema.ts:1781: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0msql`${table.sourceType} [0m[7m[0min [0m[7m[0m('file', [0m[7m[0m'folder-entry', [0m
[7m[0m'remote-endpoint')`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1782:    ),[0m
> apps\desktop\src\main\db\schema.ts:1783:    statusCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1784:      'local_models_status_check',[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\main\db\schema.ts:1785: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0msql`${table.status} [0m[7m[0min [0m[7m[0m('cold', [0m[7m[0m'loading', [0m[7m[0m'loaded', [0m[7m[0m'error', [0m
[7m[0m'unreachable', [0m[7m[0m'missing')`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1786:    ),[0m
> apps\desktop\src\main\db\schema.ts:1787:    isEmbeddingModelCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1788:      'local_models_is_embedding_model_check',[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1789:      sql`${table.isEmbeddingModel} in (0, 1)`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1790:    ),[0m
> apps\desktop\src\main\db\schema.ts:1791:    isToolCapableCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1792:      'local_models_is_tool_capable_check',[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1793:      sql`${table.isToolCapable} in (0, 1)`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1794:    ),[0m
> apps\desktop\src\main\db\schema.ts:1795:    sourceShapeCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1796:      'local_models_source_shape_check',[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\main\db\schema.ts:1797: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0msql`(${table.sourceType} [0m[7m[0m= [0m[7m[0m'file' [0m[7m[0mAND [0m[7m[0m${table.sourcePath} [0m[7m[0mIS [0m[7m[0mNOT [0m[7m[0mNULL [0m
[7m[0mAND [0m[7m[0m${table.endpointId} [0m[7m[0mIS [0m[7m[0mNULL) [0m[7m[0mOR [0m[7m[0m(${table.sourceType} [0m[7m[0m= [0m[7m[0m'folder-entry' [0m[7m[0mAND [0m[7m[0m${table.sourcePath} [0m[7m[0mIS [0m[7m[0mNOT [0m[7m[0mNULL [0m[7m[0mAND [0m
[7m[0m${table.endpointId} [0m[7m[0mIS [0m[7m[0mNULL) [0m[7m[0mOR [0m[7m[0m(${table.sourceType} [0m[7m[0m= [0m[7m[0m'remote-endpoint' [0m[7m[0mAND [0m[7m[0m${table.endpointId} [0m[7m[0mIS [0m[7m[0mNOT [0m[7m[0mNULL [0m[7m[0mAND [0m
[7m[0m${table.sourcePath} [0m[7m[0mIS [0m[7m[0mNULL)`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1798:    ),[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1799:  }),[0m
  apps\desktop\src\main\db\schema.ts:1826:  (table) => ({
> apps\desktop\src\main\db\schema.ts:1827:    mmapCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1828:      'local_model_advanced_params_mmap_check',[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1829:      sql`${table.mmap} is null or ${table.mmap} in (0, 1)`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1830:    ),[0m
> apps\desktop\src\main\db\schema.ts:1831:    mlockCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1832:      'local_model_advanced_params_mlock_check',[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1833:      sql`${table.mlock} is null or ${table.mlock} in (0, 1)`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1834:    ),[0m
> apps\desktop\src\main\db\schema.ts:1835:    flashAttentionCheck: [7mcheck([0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1836:      'local_model_advanced_params_flash_attention_check',[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\main\db\schema.ts:1837: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0msql`${table.flashAttention} [0m[7m[0mis [0m[7m[0mnull [0m[7m[0mor [0m[7m[0m${table.flashAttention} [0m[7m[0min [0m[7m[0m(0, [0m
[7m[0m1)`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1838:    ),[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1839:  }),[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content packages/shared-types/package.json; Get-Content apps/desktop/package.json | Select-String -Pattern 'build|dependencies|local-gguf' -Context 2,2" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1088ms:
{
  "name": "@team-x/shared-types",
  "version": "3.2.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --build",
    "build": "tsc --build --force",
    "clean": "tsc --build --clean"
  },
  "devDependencies": {
    "typescript": "5.5.4"
  }
}

    "scripts": {
      "dev": "electron-vite dev",
>     "[7mbuild[0m": "electron-vite build",[0m
[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m"typecheck": [0m[7m[0m"tsc [0m[7m[0m-p [0m[7m[0mtsconfig.main.json [0m[7m[0m--noEmit [0m[7m[0m&& [0m[7m[0mtsc [0m[7m[0m-p [0m[7m[0mtsconfig.preload.json [0m[7m[0m--noEmit [0m[7m[0m&& [0m[7m[0mtsc [0m[7m[0m-p [0m
[7m[0mtsconfig.renderer.json [0m[7m[0m--noEmit [0m[7m[0m&& [0m[7m[0mtsc [0m[7m[0m-p [0m[7m[0mtsconfig.e2e.json [0m[7m[0m--noEmit",[0m
[7m[0m      "test": "vitest run",[0m
>     "test:e2e": "electron-vite [7mbuild[0m && playwright test",[0m
[7m[0m      "test:e2e:run": "playwright test",[0m
[7m[0m      "lint": "eslint .",[0m
      "lint:fix": "eslint . --fix",
>     "dist": "electron-vite [7mbuild[0m && electron-builder --publish never",[0m
>     "dist:win": "electron-vite [7mbuild[0m && electron-builder --win --publish never",
>     "dist:mac": "electron-vite [7mbuild[0m && electron-builder --mac --publish never",
>     "dist:linux": "electron-vite [7mbuild[0m && electron-builder --linux --publish never",
>     "dist:publish": "electron-vite [7mbuild[0m && electron-builder --publish always",[0m
[7m[0m      "autonomy:benchmark": "tsx scripts/autonomy-benchmark.ts",[0m
>     "postinstall": "electron-re[7mbuild[0m -f -w better-sqlite3,keytar"[0m
[7m[0m    },[0m
>   "[7mdependencies[0m": {[0m
[7m[0m      "@fontsource-variable/inter": "^5.2.8",[0m
[7m[0m      "@fontsource-variable/jetbrains-mono": "^5.2.8",[0m
      "zustand": "^5.0.12"
    },
>   "dev[7mDependencies[0m": {[0m
>     "@electron/re[7mbuild[0m": "^3.6.0",[0m
[7m[0m      "@playwright/test": "^1.59.1",[0m
[7m[0m      "@tailwindcss/typography": "^0.5.19",[0m
      "drizzle-kit": "^0.24.0",
      "electron": "^31.0.0",
>     "electron-[7mbuild[0mer": "^26.8.1",[0m
[7m[0m      "electron-vite": "^2.3.0",[0m
[7m[0m      "postcss": "^8.5.9",[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content apps/desktop/package.json' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 910ms:
{
  "name": "@team-x/desktop",
  "version": "3.2.1",
  "private": true,
  "type": "module",
  "description": "Strategia-X Team-X desktop app for operating an AI company.",
  "license": "MIT",
  "author": {
    "name": "Rocky Elsalaymeh",
    "email": "info@strategia-x.com",
    "url": "https://github.com/Git-Rocky-Stack/"
  },
  "homepage": "https://github.com/Git-Rocky-Stack/",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit && tsc -p tsconfig.renderer.json --noEmit && tsc -p tsconfig.e2e.json --noEmit",
    "test": "vitest run",
    "test:e2e": "electron-vite build && playwright test",
    "test:e2e:run": "playwright test",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "dist": "electron-vite build && electron-builder --publish never",
    "dist:win": "electron-vite build && electron-builder --win --publish never",
    "dist:mac": "electron-vite build && electron-builder --mac --publish never",
    "dist:linux": "electron-vite build && electron-builder --linux --publish never",
    "dist:publish": "electron-vite build && electron-builder --publish always",
    "autonomy:benchmark": "tsx scripts/autonomy-benchmark.ts",
    "postinstall": "electron-rebuild -f -w better-sqlite3,keytar"
  },
  "dependencies": {
    "@fontsource-variable/inter": "^5.2.8",
    "@fontsource-variable/jetbrains-mono": "^5.2.8",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-collapsible": "^1.1.1",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-radio-group": "^1.2.1",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.1",
    "@tanstack/react-query": "^5.97.0",
    "@team-x/intelligence": "workspace:*",
    "@team-x/provider-router": "workspace:*",
    "@team-x/role-schema": "workspace:*",
    "@team-x/shared-types": "workspace:*",
    "@team-x/telemetry-core": "workspace:*",
    "better-sqlite3": "^11.3.0",
    "class-variance-authority": "^0.7.1",
    "@vlcn.io/crsqlite-wasm": "^0.12.0",
    "sqlite-vec": "^0.1.1",
    "clsx": "^2.1.1",
    "dotenv": "^16.4.5",
    "drizzle-orm": "^0.33.0",
    "electron-updater": "^6.8.3",
    "keytar": "^7.9.0",
    "lucide-react": "^1.8.0",
    "nanoid": "^5.0.0",
    "recharts": "^3.8.1",
    "tailwind-merge": "^3.5.0",
    "zod": "^3.25.76",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@playwright/test": "^1.59.1",
    "@tailwindcss/typography": "^0.5.19",
    "@types/better-sqlite3": "^7.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/sql.js": "^1.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.27",
    "drizzle-kit": "^0.24.0",
    "electron": "^31.0.0",
    "electron-builder": "^26.8.1",
    "electron-vite": "^2.3.0",
    "postcss": "^8.5.9",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sql.js": "^1.11.0",
    "tailwindcss": "^3.4.19",
    "tsx": "^4.21.0",
    "typescript": "5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2"
  }
}

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-ChildItem -Filter 'tsconfig*.json' | Select Name; if (Test-Path tsconfig.json) { Get-Content tsconfig.json }" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 919ms:

[32;1mName[0m
[32;1m----[0m
tsconfig.base.json
tsconfig.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "files": [],
  "references": [
    { "path": "./packages/shared-types" },
    { "path": "./packages/role-schema" },
    { "path": "./packages/provider-router" },
    { "path": "./packages/telemetry-core" },
    { "path": "./apps/desktop" }
  ]
}


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm --config.engine-strict=false -F @team-x/desktop typecheck' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:56:22.984654Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 16.4 seconds
Output:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})

> @team-x/desktop@3.2.1 typecheck C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop
> tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit && tsc -p tsconfig.renderer.json --noEmit && tsc -p tsconfig.e2e.json --noEmit

error TS5033: Could not write file 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/apps/desktop/out/tsconfig.main.tsbuildinfo': EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\out\tsconfig.main.tsbuildinfo'.
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @team-x/desktop@3.2.1 typecheck: `tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit && tsc -p tsconfig.renderer.json --noEmit && tsc -p tsconfig.e2e.json --noEmit`
Exit status 2

 exited 1 in 16443ms:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})

> @team-x/desktop@3.2.1 typecheck C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop
> tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit && tsc -p tsconfig.renderer.json --noEmit && tsc -p tsconfig.e2e.json --noEmit

error TS5033: Could not write file 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/apps/desktop/out/tsconfig.main.tsbuildinfo': EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\out\tsconfig.main.tsbuildinfo'.
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @team-x/desktop@3.2.1 typecheck: `tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit && tsc -p tsconfig.renderer.json --noEmit && tsc -p tsconfig.e2e.json --noEmit`
Exit status 2

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm --config.engine-strict=false exec tsc -p apps/desktop/tsconfig.main.json --noEmit --incremental false' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:56:44.065836Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 15.9 seconds
Output:
error TS5033: Could not write file 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/apps/desktop/out/tsconfig.main.tsbuildinfo': EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\out\tsconfig.main.tsbuildinfo'.
apps/desktop/tsconfig.main.json(3,3): error TS6379: Composite projects may not disable incremental compilation.

 exited 1 in 15949ms:
error TS5033: Could not write file 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/apps/desktop/out/tsconfig.main.tsbuildinfo': EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\out\tsconfig.main.tsbuildinfo'.
apps/desktop/tsconfig.main.json(3,3): error TS6379: Composite projects may not disable incremental compilation.

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm --config.engine-strict=false exec tsc -p apps/desktop/tsconfig.main.json --noEmit --tsBuildInfoFile C:/tmp/teamx-main.tsbuildinfo' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:57:05.887956Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 15.9 seconds
Output:
error TS5033: Could not write file 'C:/tmp/teamx-main.tsbuildinfo': EPERM: operation not permitted, open 'C:\tmp\teamx-main.tsbuildinfo'.

 exited 1 in 15924ms:
error TS5033: Could not write file 'C:/tmp/teamx-main.tsbuildinfo': EPERM: operation not permitted, open 'C:\tmp\teamx-main.tsbuildinfo'.

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm --config.engine-strict=false exec tsc -p apps/desktop/tsconfig.main.json --noEmit --incremental false --composite false' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:57:31.155809Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 17.6 seconds
Output:
apps/desktop/tsconfig.main.json(9,5): error TS5069: Option 'tsBuildInfoFile' cannot be specified without specifying option 'incremental' or option 'composite'.

 exited 1 in 17559ms:
apps/desktop/tsconfig.main.json(9,5): error TS5069: Option 'tsBuildInfoFile' cannot be specified without specifying option 'incremental' or option 'composite'.

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content apps/desktop/tsconfig.main.json; Get-Content apps/desktop/tsconfig.base.json' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:57:36.888684Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.1 seconds
Output:
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "rootDir": "./src/main",
    "outDir": "./out/main",
    "tsBuildInfoFile": "./out/tsconfig.main.tsbuildinfo",
    "noEmit": false,
    "types": ["node", "electron-vite/node"]
  },
  "include": ["src/main/**/*"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx"],
  "references": [
    { "path": "../../packages/shared-types" },
    { "path": "../../packages/role-schema" },
    { "path": "../../packages/provider-router" },
    { "path": "../../packages/telemetry-core" },
    { "path": "../../packages/intelligence" }
  ]
}
[31;1mGet-Content: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m … sktop/tsconfig.main.json; [36;1mGet-Content apps/desktop/tsconfig.base.json[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mCannot find path 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\tsconfig.base.json' because it does not exist.[0m

 exited 1 in 1128ms:
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "rootDir": "./src/main",
    "outDir": "./out/main",
    "tsBuildInfoFile": "./out/tsconfig.main.tsbuildinfo",
    "noEmit": false,
    "types": ["node", "electron-vite/node"]
  },
  "include": ["src/main/**/*"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx"],
  "references": [
    { "path": "../../packages/shared-types" },
    { "path": "../../packages/role-schema" },
    { "path": "../../packages/provider-router" },
    { "path": "../../packages/telemetry-core" },
    { "path": "../../packages/intelligence" }
  ]
}
[31;1mGet-Content: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m … sktop/tsconfig.main.json; [36;1mGet-Content apps/desktop/tsconfig.base.json[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mCannot find path 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\tsconfig.base.json' because it does not exist.[0m

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "'x' | Set-Content -LiteralPath 'C:\\tmp\\codex-write-test.txt'; Get-Content 'C:\\tmp\\codex-write-test.txt'; Remove-Item -LiteralPath 'C:\\tmp\\codex-write-test.txt'" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:57:42.795862Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.1 seconds
Output:
[31;1mSet-Content: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m 'x' | [36;1mSet-Content -LiteralPath 'C:\tmp\codex-write-test.txt'[0m; Get-Con …[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mAccess to the path 'C:\tmp\codex-write-test.txt' is denied.[0m
[31;1mGet-Content: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m … ex-write-test.txt'; [36;1mGet-Content 'C:\tmp\codex-write-test.txt'[0m; Remove …[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mCannot find path 'C:\tmp\codex-write-test.txt' because it does not exist.[0m
[31;1mRemove-Item: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m … ite-test.txt'; [36;1mRemove-Item -LiteralPath 'C:\tmp\codex-write-test.txt'[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mCannot find path 'C:\tmp\codex-write-test.txt' because it does not exist.[0m

 exited 1 in 1148ms:
[31;1mSet-Content: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m 'x' | [36;1mSet-Content -LiteralPath 'C:\tmp\codex-write-test.txt'[0m; Get-Con …[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mAccess to the path 'C:\tmp\codex-write-test.txt' is denied.[0m
[31;1mGet-Content: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m … ex-write-test.txt'; [36;1mGet-Content 'C:\tmp\codex-write-test.txt'[0m; Remove …[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mCannot find path 'C:\tmp\codex-write-test.txt' because it does not exist.[0m
[31;1mRemove-Item: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m … ite-test.txt'; [36;1mRemove-Item -LiteralPath 'C:\tmp\codex-write-test.txt'[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mCannot find path 'C:\tmp\codex-write-test.txt' because it does not exist.[0m

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm --config.engine-strict=false -F @team-x/desktop test -- apps/desktop/src/main/db/0036-local-gguf-migration.test.ts apps/desktop/src/main/db/repos/local-models.test.ts apps/desktop/src/main/db/repos/local-model-endpoints.test.ts apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts apps/desktop/src/preload/api.test.ts' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:57:54.571166Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 4 seconds
Output:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})

> @team-x/desktop@3.2.1 test C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop
> vitest run "apps/desktop/src/main/db/0036-local-gguf-migration.test.ts" "apps/desktop/src/main/db/repos/local-models.test.ts" "apps/desktop/src/main/db/repos/local-model-endpoints.test.ts" "apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts" "apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts" "apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts" "apps/desktop/src/preload/api.test.ts"

C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @team-x/desktop@3.2.1 test: `vitest run "apps/desktop/src/main/db/0036-local-gguf-migration.test.ts" "apps/desktop/src/main/db/repos/local-models.test.ts" "apps/desktop/src/main/db/repos/local-model-endpoints.test.ts" "apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts" "apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts" "apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts" "apps/desktop/src/preload/api.test.ts"`
Exit status 1
[31mfailed to load config from C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\vitest.config.ts[39m

[31m⎯⎯⎯⎯⎯⎯⎯[1m[7m Startup Error [27m[22m⎯⎯⎯⎯⎯⎯⎯⎯[39m
Error: EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\vitest.config.ts.timestamp-1780109874060-ec4d35da3d6c5.mjs'
    at async open (node:internal/fs/promises:637:25)
    at async Object.writeFile (node:internal/fs/promises:1219:14)
    at async loadConfigFromBundledFile (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:66973:5)
    at async loadConfigFromFile (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:66816:24)
    at async resolveConfig (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:66416:24)
    at async _createServer (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:63015:18)
    at async createViteServer (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.39/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:9842:18)
    at async createVitest (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.39/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:11461:18)
    at async prepareVitest (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.39/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:11884:15)
    at async startVitest (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.39/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:11813:15) {
  errno: -4048,
  code: 'EPERM',
  syscall: 'open',
  path: 'C:\\Users\\User\\Desktop\\Development Projects\\Strategia-Enhanced-App\\Team-X\\apps\\desktop\\vitest.config.ts.timestamp-1780109874060-ec4d35da3d6c5.mjs'
}




 exited 1 in 4020ms:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})

> @team-x/desktop@3.2.1 test C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop
> vitest run "apps/desktop/src/main/db/0036-local-gguf-migration.test.ts" "apps/desktop/src/main/db/repos/local-models.test.ts" "apps/desktop/src/main/db/repos/local-model-endpoints.test.ts" "apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts" "apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts" "apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts" "apps/desktop/src/preload/api.test.ts"

C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @team-x/desktop@3.2.1 test: `vitest run "apps/desktop/src/main/db/0036-local-gguf-migration.test.ts" "apps/desktop/src/main/db/repos/local-models.test.ts" "apps/desktop/src/main/db/repos/local-model-endpoints.test.ts" "apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts" "apps/desktop/src/main/db/repos/local-model-advanced-params.test.ts" "apps/desktop/src/main/ipc/local-gguf-library-handlers.test.ts" "apps/desktop/src/preload/api.test.ts"`
Exit status 1
[31mfailed to load config from C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\vitest.config.ts[39m

[31m⎯⎯⎯⎯⎯⎯⎯[1m[7m Startup Error [27m[22m⎯⎯⎯⎯⎯⎯⎯⎯[39m
Error: EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\vitest.config.ts.timestamp-1780109874060-ec4d35da3d6c5.mjs'
    at async open (node:internal/fs/promises:637:25)
    at async Object.writeFile (node:internal/fs/promises:1219:14)
    at async loadConfigFromBundledFile (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:66973:5)
    at async loadConfigFromFile (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:66816:24)
    at async resolveConfig (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:66416:24)
    at async _createServer (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:63015:18)
    at async createViteServer (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.39/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:9842:18)
    at async createVitest (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.39/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:11461:18)
    at async prepareVitest (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.39/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:11884:15)
    at async startVitest (file:///C:/Users/User/Desktop/Development%20Projects/Strategia-Enhanced-App/Team-X/node_modules/.pnpm/vitest@2.1.9_@types+node@20.19.39/node_modules/vitest/dist/chunks/cli-api.DqsSTaIi.js:11813:15) {
  errno: -4048,
  code: 'EPERM',
  syscall: 'open',
  path: 'C:\\Users\\User\\Desktop\\Development Projects\\Strategia-Enhanced-App\\Team-X\\apps\\desktop\\vitest.config.ts.timestamp-1780109874060-ec4d35da3d6c5.mjs'
}




exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'apps/desktop/src/preload/api.ts' -Pattern 'function buildTeamXApi' -Context 3,5" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 904ms:

  apps\desktop\src\preload\api.ts:584: * Captures the supplied `ipc` handle in a closure so each returned
  apps\desktop\src\preload\api.ts:585: * method routes through the same transport.
  apps\desktop\src\preload\api.ts:586: */
> apps\desktop\src\preload\api.ts:587:export [7mfunction buildTeamXApi[0m(ipc: IpcRendererLike): TeamXApi {[0m
[7m[0m  apps\desktop\src\preload\api.ts:588:  return {[0m
[7m[0m  apps\desktop\src\preload\api.ts:589:    system: {[0m
[7m[0m  apps\desktop\src\preload\api.ts:590:      selectDirectory: () =>[0m
[7m [0m[7m [0m[7m[0mapps\desktop\src\preload\api.ts:591: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mipc.invoke(CHANNELS.systemSelectDirectory) [0m[7m[0mas [0m
[7m[0mPromise<SelectDirectoryResponse>,[0m
[7m[0m  apps\desktop\src\preload\api.ts:592:    },[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content apps/desktop/src/main/db/repos/companies.ts -TotalCount 60; Get-Content apps/desktop/src/main/db/repos/orgchart.ts -TotalCount 80' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 829ms:
/**
 * Companies repository — factory-pattern CRUD for the `companies` table.
 *
 * The repo is typed over a generic `BaseSQLiteDatabase<'sync', TRunResult, Schema>`
 * so the same factory accepts both:
 *
 *   - `BetterSQLite3Database<Schema>` returned by `getDb()` at runtime, and
 *   - `SQLJsDatabase<Schema>` returned by `makeTestDb()` under Vitest.
 *
 * This lets us unit-test the repo with real SQL against an in-memory sql.js
 * database without having to load the Electron-ABI better-sqlite3 binding.
 * See `test-helpers.ts` for the rationale.
 *
 * Settings are serialized to a JSON text column. Callers pass/receive
 * plain objects at the repo boundary for `create`, but all read methods
 * return the raw row shape so consumers can parse `settingsJson` lazily
 * and decide their own schema validation strategy. Stricter typed
 * accessors land in later tasks alongside the first consumers.
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import {
  events,
  commandHistory,
  companies,
  copilotInsights,
  embeddings,
  employees,
  fileVault,
  goals,
  mcpServers,
  meetings,
  messages,
  projectTickets,
  projects,
  runs,
  threadMembers,
  threads,
  ticketAttachments,
  tickets,
} from '../schema.js';

export type CompanyRow = typeof companies.$inferSelect;

export interface CreateCompanyInput {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
  icon?: string;
  theme?: string;
  workspaceOriginId?: string;
  companyOriginId?: string;
}

/**
 * Patch shape for `update()`. Every field is optional — only the keys
/**
 * Org-edges repository — factory-pattern CRUD for the `org_edges`
 * table plus a `wouldCycle` guard that prevents the caller from
 * introducing directed cycles into the reporting graph.
 *
 * Shipped under Phase 5.6 M-C step (c) to restore the Cluster B
 * (M9 org chart) backend surface per audit rows 2.16 / 2.21. The
 * `org_edges` table itself was restored by step (a) (migration 0013);
 * this repo is the SQL-facing surface that `orgchart.get` IPC +
 * `employees.setManager` IPC (shipping in step d) call into.
 *
 * Design notes:
 *
 * - Single-manager-per-report is enforced at the SQL layer by the
 *   UNIQUE constraint on `report_id`. `setManager` therefore has
 *   upsert semantics: if an edge already exists for the given
 *   reportId, update its managerId in place; otherwise insert a
 *   new row.
 *
 * - Cycle detection runs BEFORE every write. `wouldCycle` walks
 *   up the manager chain starting from the proposed new manager
 *   and returns true if it ever lands on the reportId (directed
 *   cycle) OR revisits any node (defense against pre-existing
 *   data corruption). The SQL layer cannot catch this — a
 *   recursive CTE would work but embedding the check in a trigger
 *   would surprise non-app callers (drizzle-studio, raw queries).
 *
 * - Cross-driver generic typing: same pattern as `companies.ts` /
 *   `employees.ts`. Accepts both `BetterSQLite3Database<Schema>`
 *   at runtime and `SQLJsDatabase<Schema>` under Vitest so unit
 *   tests run without the Electron-ABI better-sqlite3 binding.
 *
 * The companion `orgchart.get` IPC handler composes this repo with
 * the employees repo to project the full tree (employees +
 * edges + root ids) in one round-trip. Tree-building lives in the
 * handler — not here — because the handler needs to filter
 * framework-internal system pseudo-employees (is_system = 1) out
 * of the response, and the repo stays pure SQL.
 */

import { and, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { orgEdges } from '../schema.js';

export type OrgEdgeRow = typeof orgEdges.$inferSelect;

export interface SetManagerInput {
  companyId: string;
  managerId: string;
  reportId: string;
}

type OrgEdgesDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

/**
 * Defensive upper bound on the manager-chain walk inside
 * `wouldCycle`. A healthy org tree rooted at a single CEO will be
 * far shallower than this (F10 companies cap around 8 levels); the
 * cap exists purely to make sure `wouldCycle` terminates on
 * pathological pre-existing data that somehow slipped past the
 * guard in earlier writes. Paired with the `visited` set below —
 * either mechanism alone would be sufficient; having both keeps
 * the guard boring.
 */
const MAX_CHAIN_DEPTH = 256;

export function createOrgEdgesRepo<TRunResult>(db: OrgEdgesDb<TRunResult>) {
  const repo = {
    /**
     * Return every edge belonging to a given company. Used by the
     * `orgchart.get` handler to project the full reporting graph.
     * No ordering guarantees — the handler sorts client-side.
     */
    listByCompany(companyId: string): OrgEdgeRow[] {
      return db.select().from(orgEdges).where(eq(orgEdges.companyId, companyId)).all();
    },


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "git -c safe.directory='C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' diff --unified=30 e52e373101fe0d413b423704c1ebd2eecb98afa6 -- packages/shared-types/src/ipc.ts packages/shared-types/src/index.ts" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 892ms:
diff --git a/packages/shared-types/src/index.ts b/packages/shared-types/src/index.ts
index 860f151..39b0d57 100644
--- a/packages/shared-types/src/index.ts
+++ b/packages/shared-types/src/index.ts
@@ -1,12 +1,13 @@
 export const SHARED_TYPES_VERSION = '0.0.1';
 
 export * from './roles.js';
 export * from './providers.js';
 export * from './entities.js';
 export * from './events.js';
 export * from './ipc.js';
 export * from './rag.js';
 export * from './command.js';
 export * from './copilot.js';
 export * from './capabilities.js';
 export * from './trace.js';
+export * from './local-gguf.js';
diff --git a/packages/shared-types/src/ipc.ts b/packages/shared-types/src/ipc.ts
index f7e1f1e..3f074d2 100644
--- a/packages/shared-types/src/ipc.ts
+++ b/packages/shared-types/src/ipc.ts
@@ -92,60 +92,61 @@ import type {
   OperatorInvite,
   OperatorMembershipRole,
   PackedThreadContext,
   Project,
   Routine,
   RoutineRun,
   RoutineSchedule,
   RoutineTicketWorkConfig,
   RunCheckpoint,
   RuntimeProfileKind,
   RuntimeProfileSummary,
   RuntimeProfileValidation,
   RuntimeSession,
   ScheduleItem,
   ScheduleItemKind,
   ScheduleItemStatus,
   SharedOperatorAuthMode,
   SkillAssignment,
   Thread,
   ThreadDigest,
   Ticket,
   TicketCheckout,
   TicketPriority,
 } from './entities.js';
 import type {
   AgenticRunSnapshot,
   CopilotCategory,
   CopilotCategoryWeights,
   DashboardEvent,
 } from './events.js';
+import type { LocalGgufApi } from './local-gguf.js';
 import type { PrivacyTier, ProviderConfig, ProviderKind } from './providers.js';
 
 export type { CopilotCategoryWeights } from './events.js';
 
 // ---------------------------------------------------------------------------
 // Low-level request / response shapes
 // ---------------------------------------------------------------------------
 
 /**
  * `companies.archive` request (M33 T3 follow-up F3).
  *
  * Idempotent — if the company is already archived, the handler re-runs
  * the full three-step quiesce (analyzer stop, event-window clear,
  * status flip) and re-emits `company.archived`. That is intentional:
  * we would rather repeat the cleanup than silently skip it on a retry.
  */
 export interface ArchiveCompanyRequest {
   companyId: string;
 }
 
 /**
  * `companies.create` request (Phase 5.6 M-C step b — restores Cluster A
  * multi-company CRUD per audit row 10.12; the locked M7 architectural
  * decision).
  *
  * `slug` MUST be unique app-wide. The handler enforces a non-empty
  * trimmed `name` and a slug matching `/^[a-z0-9][a-z0-9-]{0,62}$/`
  * (lowercase alphanumerics + hyphen, 1–63 chars, no leading hyphen) so
  * the renderer can rely on a stable URL-safe identifier without
  * server-side rewriting. Duplicate slug surfaces as a SQL UNIQUE
@@ -3614,39 +3615,48 @@ export interface TeamXApi {
     addParticipant(req: AddTicketParticipantRequest): Promise<void>;
     /** Remove an employee from the ticket discussion. */
     removeParticipant(req: RemoveTicketParticipantRequest): Promise<void>;
     /** Close a ticket (sets status to 'done' and records closedAt). */
     close(ticketId: string): Promise<void>;
     /** Reopen a previously closed ticket. */
     reopen(ticketId: string): Promise<void>;
     /** Add a comment to a ticket's discussion thread. */
     addComment(req: AddTicketCommentRequest): Promise<AddTicketCommentResponse>;
     /** List all tickets for a company. */
     list(companyId: string): Promise<Ticket[]>;
     /** Get full ticket detail with thread messages and assignee. */
     get(ticketId: string): Promise<TicketDetail>;
     /** Attach a vault file to a ticket. */
     attachFile(req: AttachFileRequest): Promise<AttachFileResponse>;
     /** Detach a file from a ticket. */
     detachFile(req: DetachFileRequest): Promise<void>;
     /** List all file attachments for a ticket. */
     listAttachments(ticketId: string): Promise<TicketAttachment[]>;
   };
   proactive: {
     /** Enable or disable proactive mode for a company. */
     setEnabled(req: ProactiveSetEnabledRequest): Promise<void>;
     /** Trigger immediate goal decomposition. */
     decomposeGoal(req: ProactiveDecomposeGoalRequest): Promise<ProactiveDecomposeGoalResponse>;
     /** Trigger background work scan. */
     scanForWork(req: ProactiveScanForWorkRequest): Promise<ProactiveScanForWorkResponse>;
     /** Query proactive state. */
     getState(req: ProactiveGetStateRequest): Promise<ProactiveGetStateResponse>;
   };
+
+  /**
+   * Local & Networked GGUF Support (v3.3.0). The full typed surface ships
+   * in Phase 1; every channel is a not-implemented stub until its owning
+   * phase lands the real handler (runtime/pool → P2, library → P3,
+   * endpoint → P5, hf → P7, benchmark → P10). See `LocalGgufApi` in
+   * `local-gguf.ts` for the per-area method contracts.
+   */
+  localGguf: LocalGgufApi;
 }
 
 /**
  * Sentinel value the renderer passes as `threadId` to
  * `chat.send` to request the user↔employee DM thread be looked up or
  * created on the fly. Exported from shared-types so both the preload
  * and the renderer reference the same string constant.
  */
 export const AUTO_THREAD_ID = 'auto';

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "git -c safe.directory='C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' diff --check e52e373101fe0d413b423704c1ebd2eecb98afa6" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1087ms:
exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'apps/desktop/src/**/*.test.ts' -Pattern 'LessThan\\(100|performance.now|under 100' -Recurse" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T02:59:06.503302Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.3 seconds
Output:
[31;1mSelect-String: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m … .test.ts' -Pattern 'LessThan\(100|performance.now|under 100' [36;1m-Recurse[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m                                                                ~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mA parameter cannot be found that matches parameter name 'Recurse'.[0m

 exited 1 in 1297ms:
[31;1mSelect-String: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m … .test.ts' -Pattern 'LessThan\(100|performance.now|under 100' [36;1m-Recurse[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m                                                                ~~~~~~~~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mA parameter cannot be found that matches parameter name 'Recurse'.[0m

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-ChildItem apps/desktop/src -Recurse -Filter *.test.ts | Select-String -Pattern 'LessThan\\(100|performance.now|under 100'" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1012ms:

apps\desktop\src\main\db\0036-local-gguf-migration.test.ts:15: *   5. The forward migration applies in well [7munder [0m[7m100 [0m
[7m[0mms [0m[7m[0mon [0m[7m[0man [0m[7m[0mempty [0m[7m[0mDB[0m
apps\desktop\src\main\db\0036-local-gguf-migration.test.ts:307:  it('applies the 0036 forward migration in [7munder [0m[7m100 [0m
[7m[0mms [0m[7m[0mon [0m[7m[0man [0m[7m[0mempty [0m[7m[0mDB', [0m[7m[0masync [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
apps\desktop\src\main\db\0036-local-gguf-migration.test.ts:318:    const t0 = [7mperformance.now[0m();
apps\desktop\src\main\db\0036-local-gguf-migration.test.ts:320:    const elapsedMs = [7mperformance.now[0m() - t0;
apps\desktop\src\main\db\0036-local-gguf-migration.test.ts:323:    expect(elapsedMs).toBe[7mLessThan(100[0m);
apps\desktop\src\main\services\agentic-loop-service.test.ts:913:    expect(Date.now() - before).toBe[7mLessThan(100[0m);


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "git -c safe.directory='C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' diff e52e373101fe0d413b423704c1ebd2eecb98afa6 | Select-String -Pattern 'TODO|FIXME|any|unknown|not implemented|throws not' -Context 1,1" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 5719ms:

  +    const rows: TableInfoRow[] = [];
> +    while (stmt.step()) rows.push(stmt.getAsObject() as [7munknown[0m as TableInfoRow);[0m
[7m[0m  +    stmt.free();[0m
  +    const names: string[] = [];
> +    while (stmt.step()) names.push((stmt.getAsObject() as [7munknown[0m as IndexListRow).name);[0m
[7m[0m  +    stmt.free();[0m
  +      `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
> +       VALUES (?, ?, ?, 'Local', '[7munknown[0m', ?, ?)`,[0m
[7m[0m  +      [id, `EP ${id}`, 'http://192.168.1.50:1234', NOW, NOW],[0m
  +        `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
> +         VALUES ('bad', 'Bad', 'http://x', 'Cloud', '[7munknown[0m', ?, ?)`,[0m
[7m[0m  +        [NOW, NOW],[0m
  +	`privacy_tier` text DEFAULT 'Local' NOT NULL,
> +	`status` text DEFAULT '[7munknown[0m' NOT NULL,[0m
[7m[0m  +	`last_checked_at` integer,[0m
  +	CONSTRAINT `local_model_endpoints_privacy_tier_check` CHECK (`privacy_tier` = 'Local'),
> +	CONSTRAINT `local_model_endpoints_status_check` CHECK (`status` in ('[7munknown[0m', [0m[7m[0m'reachable', [0m[7m[0m'unreachable', [0m
[7m[0m'auth-failed'))[0m
[7m[0m  +);[0m
  +	`recursive` integer DEFAULT true NOT NULL,
> +	`status` text DEFAULT '[7munknown[0m' NOT NULL,[0m
[7m[0m  +	`last_scan_at` integer,[0m
  +	CONSTRAINT `local_model_watch_folders_recursive_check` CHECK (`recursive` in (0, 1)),
> +	CONSTRAINT `local_model_watch_folders_status_check` CHECK (`status` in ('[7munknown[0m', 'reachable', 'unreachable'))[0m
[7m[0m  +);[0m
  +
> +  it('getByModelId returns null for an [7munknown[0m model', () => {[0m
[7m[0m  +    expect(repo.getByModelId('does-not-exist')).toBeNull();[0m
  +
> +  it('clear is a no-op for an [7munknown[0m model', () => {[0m
[7m[0m  +    expect(() => repo.clear('does-not-exist')).not.toThrow();[0m
  +      select: () => ({ from: () => ({ where: () => ({ get: () => undefined }) }) }),
> +    } as [7munknown[0m as Parameters<typeof createLocalModelAdvancedParamsRepo>[0];[0m
[7m[0m  +    const guardedRepo = createLocalModelAdvancedParamsRepo(fakeDb);[0m
  + *
> + * The PK is `model_id`, so a model has at most one row. NULL in [7many[0m tuning[0m
[7m[0m  + * column means "fall back to auto-tune." `clear()` deletes the row entirely[0m
  +    expect(created.privacyTier).toBe('Local');
> +    expect(created.status).toBe('[7munknown[0m');[0m
[7m[0m  +    expect(created.lastCheckedAt).toBeNull();[0m
  +
> +  it('getById returns null for an [7munknown[0m id', () => {[0m
[7m[0m  +    expect(repo.getById('nope')).toBeNull();[0m
  +        `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
> +         VALUES ('bad', 'Bad', 'http://x', 'Cloud', '[7munknown[0m', ?, ?)`,[0m
[7m[0m  +        [Date.now(), Date.now()],[0m
  + * endpoints are local-network, never cloud. Deleting an endpoint cascades
> + * to [7many[0m local_models rows that reference it (ON DELETE CASCADE).[0m
[7m[0m  + */[0m
  +  return {
> +    /** Insert a new endpoint (status starts '[7munknown[0m') and return the stored row. */[0m
[7m[0m  +    insert(input: InsertEndpointInput): RemoteEndpoint {[0m
  +          privacyTier: 'Local',
> +          status: '[7munknown[0m',[0m
[7m[0m  +          lastCheckedAt: null,[0m
  +     * Hard-delete an endpoint. Cascades to local_models rows referencing it
> +     * (ON DELETE CASCADE). No-op on [7munknown[0m id.[0m
[7m[0m  +     */[0m
  +    expect(created.recursive).toBe(true);
> +    expect(created.status).toBe('[7munknown[0m');[0m
[7m[0m  +    expect(created.lastScanAt).toBeNull();[0m
  +          recursive: input.recursive ?? true,
> +          status: '[7munknown[0m',[0m
[7m[0m  +          lastScanAt: null,[0m
  +
> +    /** Hard-delete a watched folder. No-op on [7munknown[0m id. */[0m
[7m[0m  +    remove(id: string): void {[0m
  +      `INSERT INTO local_model_endpoints (id, name, base_url, privacy_tier, status, created_at, updated_at)
> +       VALUES (?, 'EP', 'http://192.168.1.50:1234', 'Local', '[7munknown[0m', ?, ?)`,[0m
[7m[0m  +      [id, Date.now(), Date.now()],[0m
  +
> +  it('getById returns null for an [7munknown[0m id', () => {[0m
[7m[0m  +    expect(repo.getById('does-not-exist')).toBeNull();[0m
  +     * local_model_benchmarks via their ON DELETE CASCADE FKs. No-op on
> +     * [7munknown[0m id.[0m
[7m[0m  +     */[0m
   import {
>    type [7mAny[0mSQLiteColumn,[0m
[7m[0m     blob,[0m
  @@ -1666,3 +1667,199 @@ export const orgEdges = sqliteTable(
>      comp[7many[0mManagerIdx: index('idx_org_edges_company_manager').on(table.companyId, table.managerId),[0m
[7m[0m     }),[0m
  +    privacyTier: text('privacy_tier').notNull().default('Local'),
> +    status: text('status').notNull().default('[7munknown[0m'),[0m
[7m[0m  +    lastCheckedAt: integer('last_checked_at'),[0m
  +      'local_model_endpoints_status_check',
> +      sql`${table.status} in ('[7munknown[0m', 'reachable', 'unreachable', 'auth-failed')`,[0m
[7m[0m  +    ),[0m
  +    recursive: integer('recursive', { mode: 'boolean' }).notNull().default(true),
> +    status: text('status').notNull().default('[7munknown[0m'),[0m
[7m[0m  +    lastScanAt: integer('last_scan_at'),[0m
  +      'local_model_watch_folders_status_check',
> +      sql`${table.status} in ('[7munknown[0m', 'reachable', 'unreachable')`,[0m
[7m[0m  +    ),[0m
  +/**
> + * The library: every model the user has registered, of [7many[0m source type.[0m
[7m[0m  + * The source-shape CHECK disambiguates how a row points at its backing[0m
  + * Per-model Advanced-panel overrides. The PK is `model_id`, so the row
> + * exists at most once per model. NULL in [7many[0m tuning column means[0m
[7m[0m  + * "fall back to auto-tune."[0m
  +function makeFakeIpc() {
> +  const handlers = new Map<string, (event: [7munknown[0m, ...args: unknown[]) => unknown>();[0m
[7m[0m  +  const ipc = {[0m
> +    handle(channel: string, fn: (event: [7munknown[0m, ...args: unknown[]) => unknown) {[0m
[7m[0m  +      handlers.set(channel, fn);[0m
  +    },
> +  } as [7munknown[0m as IpcMain;[0m
[7m[0m  +  return {[0m
  +    channels: () => [...handlers.keys()],
> +    invoke: (channel: string, ...args: [7munknown[0m[]) => {[0m
[7m[0m  +      const fn = handlers.get(channel);[0m
  +  it.each([...LOCAL_GGUF_BENCHMARK_CHANNELS])(
> +    'handler %s [7mthrows not[0m-implemented',[0m
[7m[0m  +    async (channel) => {[0m
  +      registerLocalGgufBenchmarkHandlers(f.ipc);
> +      await expect(f.invoke(channel)).rejects.toThrow(/[7mnot implemented[0m/i);[0m
[7m[0m  +    },[0m
  +function makeFakeIpc() {
> +  const handlers = new Map<string, (event: [7munknown[0m, ...args: unknown[]) => unknown>();[0m
[7m[0m  +  const ipc = {[0m
> +    handle(channel: string, fn: (event: [7munknown[0m, ...args: unknown[]) => unknown) {[0m
[7m[0m  +      handlers.set(channel, fn);[0m
  +    },
> +  } as [7munknown[0m as IpcMain;[0m
[7m[0m  +  return {[0m
  +    channels: () => [...handlers.keys()],
> +    invoke: (channel: string, ...args: [7munknown[0m[]) => {[0m
[7m[0m  +      const fn = handlers.get(channel);[0m
  +  it.each([...LOCAL_GGUF_ENDPOINT_CHANNELS])(
> +    'handler %s [7mthrows not[0m-implemented',[0m
[7m[0m  +    async (channel) => {[0m
  +      registerLocalGgufEndpointHandlers(f.ipc);
> +      await expect(f.invoke(channel)).rejects.toThrow(/[7mnot implemented[0m/i);[0m
[7m[0m  +    },[0m
  +function makeFakeIpc() {
> +  const handlers = new Map<string, (event: [7munknown[0m, ...args: unknown[]) => unknown>();[0m
[7m[0m  +  const ipc = {[0m
> +    handle(channel: string, fn: (event: [7munknown[0m, ...args: unknown[]) => unknown) {[0m
[7m[0m  +      handlers.set(channel, fn);[0m
  +    },
> +  } as [7munknown[0m as IpcMain;[0m
[7m[0m  +  return {[0m
  +    channels: () => [...handlers.keys()],
> +    invoke: (channel: string, ...args: [7munknown[0m[]) => {[0m
[7m[0m  +      const fn = handlers.get(channel);[0m
  +
> +  it.each([...LOCAL_GGUF_HF_CHANNELS])('handler %s [7mthrows not[0m-implemented', async (channel) => {[0m
[7m[0m  +    const f = makeFakeIpc();[0m
  +    registerLocalGgufHfHandlers(f.ipc);
> +    await expect(f.invoke(channel)).rejects.toThrow(/[7mnot implemented[0m/i);[0m
[7m[0m  +  });[0m
  +function makeFakeIpc() {
> +  const handlers = new Map<string, (event: [7munknown[0m, ...args: unknown[]) => unknown>();[0m
[7m[0m  +  const ipc = {[0m
> +    handle(channel: string, fn: (event: [7munknown[0m, ...args: unknown[]) => unknown) {[0m
[7m[0m  +      handlers.set(channel, fn);[0m
  +    },
> +  } as [7munknown[0m as IpcMain;[0m
[7m[0m  +  return {[0m
  +    channels: () => [...handlers.keys()],
> +    invoke: (channel: string, ...args: [7munknown[0m[]) => {[0m
[7m[0m  +      const fn = handlers.get(channel);[0m
  +  it.each([...LOCAL_GGUF_LIBRARY_CHANNELS])(
> +    'handler %s [7mthrows not[0m-implemented',[0m
[7m[0m  +    async (channel) => {[0m
  +      registerLocalGgufLibraryHandlers(f.ipc);
> +      await expect(f.invoke(channel)).rejects.toThrow(/[7mnot implemented[0m/i);[0m
[7m[0m  +    },[0m
  + * throws this — callers fail fast with a clear, greppable message instead of
> + * silently receiving undefined. Returns `never`, so it satisfies [7many[0m
[7m[0m  + * handler's annotated return type.[0m
  +export function notImplemented(channel: string): never {
> +  throw new Error(`localGguf channel "${channel}" is [7mnot implemented[0m yet (Phase 1 stub)`);[0m
[7m[0m  +}[0m
  +function makeFakeIpc() {
> +  const handlers = new Map<string, (event: [7munknown[0m, ...args: unknown[]) => unknown>();[0m
[7m[0m  +  const ipc = {[0m
> +    handle(channel: string, fn: (event: [7munknown[0m, ...args: unknown[]) => unknown) {[0m
[7m[0m  +      handlers.set(channel, fn);[0m
  +    },
> +  } as [7munknown[0m as IpcMain;[0m
[7m[0m  +  return {[0m
  +    channels: () => [...handlers.keys()],
> +    invoke: (channel: string, ...args: [7munknown[0m[]) => {[0m
[7m[0m  +      const fn = handlers.get(channel);[0m
  +  it.each([...LOCAL_GGUF_RUNTIME_CHANNELS])(
> +    'handler %s [7mthrows not[0m-implemented',[0m
[7m[0m  +    async (channel) => {[0m
  +      registerLocalGgufRuntimeHandlers(f.ipc);
> +      await expect(f.invoke(channel)).rejects.toThrow(/[7mnot implemented[0m/i);[0m
[7m[0m  +    },[0m
  +function inMemoryStore(): LocalGgufSettingsStore {
> +  const m = new Map<string, [7munknown[0m>();[0m
[7m[0m  +  return {[0m
  +  hfTokenKeyRef: null,
> +  llamaBinariesVersion: '[7munknown[0m',[0m
[7m[0m  +};[0m
  +
> +    /** Set the active backend + whether it was auto-detected; clears [7many[0m prior fallback reason. */[0m
[7m[0m  +    updateBackend(backend: GpuBackend, autoDetected: boolean): void {[0m
  +      name: string;
> +      call: (a: ReturnType<typeof buildTeamXApi>) => Promise<[7munknown[0m>;[0m
[7m[0m  +      channel: string;[0m
> +      args: [7munknown[0m[];[0m
[7m[0m  +    }> = [[0m
   
>  function telemetryComp[7many[0mStatsRequest([0m
[7m[0m  @@ -1048,6 +1094,174 @@ export function buildTeamXApi(ipc: IpcRendererLike): TeamXApi {[0m
  +      hf: {
> +        search: (query: string, filters: Record<string, [7munknown[0m>) =>[0m
[7m[0m  +          ipc.invoke(CHANNELS.localGgufHfSearch, query, filters) as ReturnType<[0m
     "type": "module",
>    "description": "Run an AI comp[7many[0m. Not a prompt.",[0m
[7m[0m  diff --git a/packages/local-gguf-runtime/README.md b/packages/local-gguf-runtime/README.md[0m
  +describe('isLocalGgufError', () => {
> +  it('returns true for [7many[0m LocalGgufError variant', () => {[0m
[7m[0m  +    const variants: LocalGgufError[] = [[0m
  +    expect(isLocalGgufError({ kind: 42 })).toBe(false);
> +    // [7mAny[0m non-empty (or empty) string `kind` passes the structural check;[0m
[7m[0m  +    // spec-level validity of the discriminant is enforced by TypeScript.[0m
  +      privacyTier: 'Local',
> +      status: '[7munknown[0m',[0m
[7m[0m  +      lastCheckedAt: null,[0m
  +      recursive: true,
> +      status: '[7munknown[0m',[0m
[7m[0m  +      lastScanAt: null,[0m
  +
> +export type EndpointStatus = '[7munknown[0m' | 'reachable' | 'unreachable' | 'auth-failed';[0m
[7m[0m  +[0m
> +export type WatchFolderStatus = '[7munknown[0m' | 'reachable' | 'unreachable';[0m
[7m[0m  +[0m
  +/**
> + * Structural type guard. Confirms an [7munknown[0m value is shaped like a[0m
[7m[0m  + * LocalGgufError (object with a string `kind`). Does NOT enforce that[0m
  + */
> +export function isLocalGgufError(value: [7munknown[0m): value is LocalGgufError {[0m
[7m[0m  +  if (typeof value !== 'object' || value === null) return false;[0m
> +  const v = value as { kind?: [7munknown[0m };[0m
[7m[0m  +  return typeof v.kind === 'string';[0m
  +  hf: {
> +    search(query: string, filters: Record<string, [7munknown[0m>): Promise<HfSearchResult[]>;[0m
[7m[0m  +    modelCard(repoId: string): Promise<HfModelCard>;[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "git -c safe.directory='C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' diff --unified=20 e52e373101fe0d413b423704c1ebd2eecb98afa6 -- apps/desktop/src/preload/api.ts | Select-Object -First 260" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 8779ms:
diff --git a/apps/desktop/src/preload/api.ts b/apps/desktop/src/preload/api.ts
index cd0f544..5ed96c5 100644
--- a/apps/desktop/src/preload/api.ts
+++ b/apps/desktop/src/preload/api.ts
@@ -288,40 +288,45 @@ import type {
  *     we hand back to the renderer.
  *
  * The real `ipcRenderer` singleton from `'electron'` has a much
  * wider surface (`send`, `sendSync`, `postMessage`, `once`,
  * `removeAllListeners`, …). None of those are used by the Team-X
  * bridge; omitting them here makes the factory's test doubles
  * trivial to write.
  */
 export interface IpcRendererLike {
   invoke(channel: string, ...args: unknown[]): Promise<unknown>;
   on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
   removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
 }
 
 /**
  * Channel name constants. Extracted to their own block so a grep for
  * a channel name hits exactly ONE location and so the main process's
  * register layer in `main/ipc/register.ts` can be diff-matched against
  * this file when the IPC contract changes. Mirrors the keys of
  * `IpcContract` in `@team-x/shared-types/ipc.ts`.
+ *
+ * Exception: the `localGguf.*` channels are registered by the dedicated
+ * `registerLocalGguf*Handlers` functions wired in `main/index.ts`, not by
+ * `register.ts`. Diff-match those against the `LOCAL_GGUF_*_CHANNELS`
+ * tuples in `main/ipc/local-gguf-*-handlers.ts` instead.
  */
 const CHANNELS = {
   systemSelectDirectory: 'system.selectDirectory',
   companiesList: 'companies.list',
   companiesExportPackage: 'companies.exportPackage',
   companiesPreviewImportPackage: 'companies.previewImportPackage',
   companiesImportPackage: 'companies.importPackage',
   companiesListTemplates: 'companies.listTemplates',
   companiesInstallTemplate: 'companies.installTemplate',
   companiesArchive: 'companies.archive',
   companiesCreate: 'companies.create',
   // Multi-company CRUD write-side (Phase 5.6 M-C step e; audit rows 10.13 + 10.15)
   companiesUpdate: 'companies.update',
   companiesDelete: 'companies.delete',
   employeesList: 'employees.list',
   operatorsList: 'operators.list',
   operatorsReadiness: 'operators.readiness',
   cloudGetWorkspaceLink: 'cloud.getWorkspaceLink',
   cloudLinkWorkspace: 'cloud.linkWorkspace',
   cloudUnlinkWorkspace: 'cloud.unlinkWorkspace',
@@ -502,40 +507,81 @@ const CHANNELS = {
   ragDeleteForCompany: 'rag.deleteForCompany',
   // Command palette (Phase 5 — M30)
   commandParse: 'command.parse',
   commandExecute: 'command.execute',
   commandHistory: 'command.history',
   commandSuggest: 'command.suggest',
   // Agentic-loop cancellation (Phase 5 — M31 T6)
   commandStop: 'command.stop',
   // Agentic-loop snapshot for palette backfill-on-mount (Phase 5 — M32 T0 / F1)
   commandGetRunSnapshot: 'command.getRunSnapshot',
   // Copilot service (Phase 5 — M33 T5)
   copilotInsights: 'copilot.insights',
   copilotDismiss: 'copilot.dismiss',
   copilotAsk: 'copilot.ask',
   copilotConfigure: 'copilot.configure',
   copilotExport: 'copilot.export',
   proactiveSetEnabled: 'proactive.setEnabled',
   proactiveDecomposeGoal: 'proactive.decomposeGoal',
   proactiveScanForWork: 'proactive.scanForWork',
   proactiveGetState: 'proactive.getState',
+  // Local & Networked GGUF Support (v3.3.0 — Phase 1 contract surface).
+  // library.* (Phase 3)
+  localGgufLibraryList: 'localGguf.library.list',
+  localGgufLibraryGet: 'localGguf.library.get',
+  localGgufLibraryAddFile: 'localGguf.library.addFile',
+  localGgufLibraryAddFolder: 'localGguf.library.addFolder',
+  localGgufLibraryRemoveModel: 'localGguf.library.removeModel',
+  localGgufLibraryRemoveFolder: 'localGguf.library.removeFolder',
+  localGgufLibraryScanFolder: 'localGguf.library.scanFolder',
+  localGgufLibrarySetSystemPrompt: 'localGguf.library.setSystemPrompt',
+  localGgufLibrarySetChatTemplate: 'localGguf.library.setChatTemplate',
+  localGgufLibrarySetAdvancedParams: 'localGguf.library.setAdvancedParams',
+  localGgufLibraryResetAdvanced: 'localGguf.library.resetAdvanced',
+  localGgufLibraryListBySourceType: 'localGguf.library.listBySourceType',
+  // runtime.* + pool.* (Phase 2)
+  localGgufRuntimeGpuInventory: 'localGguf.runtime.gpuInventory',
+  localGgufRuntimeReprobeGpu: 'localGguf.runtime.reprobeGpu',
+  localGgufRuntimeSettings: 'localGguf.runtime.settings',
+  localGgufRuntimeSetSettings: 'localGguf.runtime.setSettings',
+  localGgufRuntimeBinariesVersion: 'localGguf.runtime.binariesVersion',
+  localGgufPoolStatus: 'localGguf.pool.status',
+  localGgufPoolLoad: 'localGguf.pool.load',
+  localGgufPoolUnload: 'localGguf.pool.unload',
+  localGgufPoolSetMaxConcurrent: 'localGguf.pool.setMaxConcurrent',
+  // endpoint.* (Phase 5)
+  localGgufEndpointList: 'localGguf.endpoint.list',
+  localGgufEndpointAdd: 'localGguf.endpoint.add',
+  localGgufEndpointRemove: 'localGguf.endpoint.remove',
+  localGgufEndpointTest: 'localGguf.endpoint.test',
+  localGgufEndpointUpdate: 'localGguf.endpoint.update',
+  // hf.* (Phase 7)
+  localGgufHfSearch: 'localGguf.hf.search',
+  localGgufHfModelCard: 'localGguf.hf.modelCard',
+  localGgufHfStartDownload: 'localGguf.hf.startDownload',
+  localGgufHfPauseDownload: 'localGguf.hf.pauseDownload',
+  localGgufHfResumeDownload: 'localGguf.hf.resumeDownload',
+  localGgufHfCancelDownload: 'localGguf.hf.cancelDownload',
+  localGgufHfActiveDownloads: 'localGguf.hf.activeDownloads',
+  // benchmark.* (Phase 10)
+  localGgufBenchmarkRun: 'localGguf.benchmark.run',
+  localGgufBenchmarkHistory: 'localGguf.benchmark.history',
 } as const;
 
 function telemetryCompanyStatsRequest(
   req: string | TelemetryCompanyStatsRequest,
 ): TelemetryCompanyStatsRequest {
   return typeof req === 'string' ? { companyId: req } : req;
 }
 
 function telemetryEmployeeStatsRequest(
   req: string | TelemetryEmployeeStatsRequest,
 ): TelemetryEmployeeStatsRequest {
   return typeof req === 'string' ? { companyId: req } : req;
 }
 
 /**
  * Build the `TeamXApi` object the preload hands to `contextBridge`.
  * Captures the supplied `ipc` handle in a closure so each returned
  * method routes through the same transport.
  */
 export function buildTeamXApi(ipc: IpcRendererLike): TeamXApi {
@@ -1031,31 +1077,201 @@ export function buildTeamXApi(ipc: IpcRendererLike): TeamXApi {
         ipc.invoke(CHANNELS.ticketsList, { companyId }) as Promise<Ticket[]>,
       get: (ticketId: string) =>
         ipc.invoke(CHANNELS.ticketsGet, { ticketId }) as Promise<TicketDetail>,
       attachFile: (req: AttachFileRequest) =>
         ipc.invoke(CHANNELS.ticketsAttachFile, req) as Promise<AttachFileResponse>,
       detachFile: (req: DetachFileRequest) =>
         ipc.invoke(CHANNELS.ticketsDetachFile, req) as Promise<void>,
       listAttachments: (ticketId: string) =>
         ipc.invoke(CHANNELS.ticketsListAttachments, { ticketId }) as Promise<TicketAttachment[]>,
     },
     proactive: {
       setEnabled: (req: ProactiveSetEnabledRequest) =>
         ipc.invoke(CHANNELS.proactiveSetEnabled, req) as Promise<void>,
       decomposeGoal: (req: ProactiveDecomposeGoalRequest) =>
         ipc.invoke(CHANNELS.proactiveDecomposeGoal, req) as Promise<ProactiveDecomposeGoalResponse>,
       scanForWork: (req: ProactiveScanForWorkRequest) =>
         ipc.invoke(CHANNELS.proactiveScanForWork, req) as Promise<ProactiveScanForWorkResponse>,
       getState: (req: ProactiveGetStateRequest) =>
         ipc.invoke(CHANNELS.proactiveGetState, req) as Promise<ProactiveGetStateResponse>,
     },
+    // Local & Networked GGUF Support (v3.3.0). Every method routes through
+    // the captured `ipc` to a `localGguf.*` channel whose handler is a
+    // Phase 1 not-implemented stub; the invoke rejects until the owning
+    // phase lands the real handler. Return casts pin each call to the
+    // `LocalGgufApi` contract in @team-x/shared-types via `ReturnType<…>`
+    // so no domain types need importing into this file.
+    localGguf: {
+      library: {
+        list: () =>
+          ipc.invoke(CHANNELS.localGgufLibraryList) as ReturnType<
+            TeamXApi['localGguf']['library']['list']
+          >,
+        get: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryGet, id) as ReturnType<
+            TeamXApi['localGguf']['library']['get']
+          >,
+        addFile: (path: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryAddFile, path) as ReturnType<
+            TeamXApi['localGguf']['library']['addFile']
+          >,
+        addFolder: (path: string, recursive: boolean) =>
+          ipc.invoke(CHANNELS.localGgufLibraryAddFolder, path, recursive) as ReturnType<
+            TeamXApi['localGguf']['library']['addFolder']
+          >,
+        removeModel: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryRemoveModel, id) as ReturnType<
+            TeamXApi['localGguf']['library']['removeModel']
+          >,
+        removeFolder: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryRemoveFolder, id) as ReturnType<
+            TeamXApi['localGguf']['library']['removeFolder']
+          >,
+        scanFolder: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryScanFolder, id) as ReturnType<
+            TeamXApi['localGguf']['library']['scanFolder']
+          >,
+        setSystemPrompt: (id: string, prompt: string | null) =>
+          ipc.invoke(CHANNELS.localGgufLibrarySetSystemPrompt, id, prompt) as ReturnType<
+            TeamXApi['localGguf']['library']['setSystemPrompt']
+          >,
+        setChatTemplate: (id: string, template: string | null) =>
+          ipc.invoke(CHANNELS.localGgufLibrarySetChatTemplate, id, template) as ReturnType<
+            TeamXApi['localGguf']['library']['setChatTemplate']
+          >,
+        setAdvancedParams: (
+          id: string,
+          params: Parameters<TeamXApi['localGguf']['library']['setAdvancedParams']>[1],
+        ) =>
+          ipc.invoke(CHANNELS.localGgufLibrarySetAdvancedParams, id, params) as ReturnType<
+            TeamXApi['localGguf']['library']['setAdvancedParams']
+          >,
+        resetAdvanced: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufLibraryResetAdvanced, id) as ReturnType<
+            TeamXApi['localGguf']['library']['resetAdvanced']
+          >,
+        listBySourceType: (
+          sourceType: Parameters<TeamXApi['localGguf']['library']['listBySourceType']>[0],
+        ) =>
+          ipc.invoke(CHANNELS.localGgufLibraryListBySourceType, sourceType) as ReturnType<
+            TeamXApi['localGguf']['library']['listBySourceType']
+          >,
+      },
+      runtime: {
+        gpuInventory: () =>
+          ipc.invoke(CHANNELS.localGgufRuntimeGpuInventory) as ReturnType<
+            TeamXApi['localGguf']['runtime']['gpuInventory']
+          >,
+        reprobeGpu: () =>
+          ipc.invoke(CHANNELS.localGgufRuntimeReprobeGpu) as ReturnType<
+            TeamXApi['localGguf']['runtime']['reprobeGpu']
+          >,
+        settings: () =>
+          ipc.invoke(CHANNELS.localGgufRuntimeSettings) as ReturnType<
+            TeamXApi['localGguf']['runtime']['settings']
+          >,
+        setSettings: (partial: Parameters<TeamXApi['localGguf']['runtime']['setSettings']>[0]) =>
+          ipc.invoke(CHANNELS.localGgufRuntimeSetSettings, partial) as ReturnType<
+            TeamXApi['localGguf']['runtime']['setSettings']
+          >,
+        binariesVersion: () =>
+          ipc.invoke(CHANNELS.localGgufRuntimeBinariesVersion) as ReturnType<
+            TeamXApi['localGguf']['runtime']['binariesVersion']
+          >,
+      },
+      pool: {
+        status: () =>
+          ipc.invoke(CHANNELS.localGgufPoolStatus) as ReturnType<
+            TeamXApi['localGguf']['pool']['status']
+          >,
+        load: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufPoolLoad, id) as ReturnType<
+            TeamXApi['localGguf']['pool']['load']
+          >,
+        unload: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufPoolUnload, id) as ReturnType<
+            TeamXApi['localGguf']['pool']['unload']
+          >,
+        setMaxConcurrent: (n: number) =>
+          ipc.invoke(CHANNELS.localGgufPoolSetMaxConcurrent, n) as ReturnType<
+            TeamXApi['localGguf']['pool']['setMaxConcurrent']
+          >,
+      },
+      endpoint: {
+        list: () =>
+          ipc.invoke(CHANNELS.localGgufEndpointList) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['list']
+          >,

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "git -c safe.directory='C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' diff --unified=20 e52e373101fe0d413b423704c1ebd2eecb98afa6 -- apps/desktop/src/preload/api.ts | Select-Object -Skip 260 -First 260" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 3128ms:
+        add: (config: Parameters<TeamXApi['localGguf']['endpoint']['add']>[0]) =>
+          ipc.invoke(CHANNELS.localGgufEndpointAdd, config) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['add']
+          >,
+        remove: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufEndpointRemove, id) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['remove']
+          >,
+        test: (id: string) =>
+          ipc.invoke(CHANNELS.localGgufEndpointTest, id) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['test']
+          >,
+        update: (id: string, partial: Parameters<TeamXApi['localGguf']['endpoint']['update']>[1]) =>
+          ipc.invoke(CHANNELS.localGgufEndpointUpdate, id, partial) as ReturnType<
+            TeamXApi['localGguf']['endpoint']['update']
+          >,
+      },
+      hf: {
+        search: (query: string, filters: Record<string, unknown>) =>
+          ipc.invoke(CHANNELS.localGgufHfSearch, query, filters) as ReturnType<
+            TeamXApi['localGguf']['hf']['search']
+          >,
+        modelCard: (repoId: string) =>
+          ipc.invoke(CHANNELS.localGgufHfModelCard, repoId) as ReturnType<
+            TeamXApi['localGguf']['hf']['modelCard']
+          >,
+        startDownload: (repoId: string, filename: string, targetFolder: string) =>
+          ipc.invoke(
+            CHANNELS.localGgufHfStartDownload,
+            repoId,
+            filename,
+            targetFolder,
+          ) as ReturnType<TeamXApi['localGguf']['hf']['startDownload']>,
+        pauseDownload: (handleId: string) =>
+          ipc.invoke(CHANNELS.localGgufHfPauseDownload, handleId) as ReturnType<
+            TeamXApi['localGguf']['hf']['pauseDownload']
+          >,
+        resumeDownload: (handleId: string) =>
+          ipc.invoke(CHANNELS.localGgufHfResumeDownload, handleId) as ReturnType<
+            TeamXApi['localGguf']['hf']['resumeDownload']
+          >,
+        cancelDownload: (handleId: string) =>
+          ipc.invoke(CHANNELS.localGgufHfCancelDownload, handleId) as ReturnType<
+            TeamXApi['localGguf']['hf']['cancelDownload']
+          >,
+        activeDownloads: () =>
+          ipc.invoke(CHANNELS.localGgufHfActiveDownloads) as ReturnType<
+            TeamXApi['localGguf']['hf']['activeDownloads']
+          >,
+      },
+      benchmark: {
+        run: (modelId: string) =>
+          ipc.invoke(CHANNELS.localGgufBenchmarkRun, modelId) as ReturnType<
+            TeamXApi['localGguf']['benchmark']['run']
+          >,
+        history: (modelId: string) =>
+          ipc.invoke(CHANNELS.localGgufBenchmarkHistory, modelId) as ReturnType<
+            TeamXApi['localGguf']['benchmark']['history']
+          >,
+      },
+    },
   };
 }
 
 /**
  * Channel name constants — exported primarily for tests that want to
  * verify the preload invokes the right strings without string-comparing
  * literals. The main process's register layer has its own copy of the
- * same constants; if either side drifts, the renderer's invoke lands
- * on a ghost handler and the handler's `ipcMain.handle` never fires.
+ * same constants (for `localGguf.*`, the `LOCAL_GGUF_*_CHANNELS` tuples in
+ * `main/ipc/local-gguf-*-handlers.ts`); if either side drifts, the
+ * renderer's invoke lands on a ghost handler and the handler's
+ * `ipcMain.handle` never fires.
  */
 export { CHANNELS as PRELOAD_CHANNELS };

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "node - <<'NODE'
import initSqlJs from 'sql.js';
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run('create table t (b integer default true not null, constraint c check (b in (0,1)))');
db.run('insert into t default values');
console.log(db.exec('select b, typeof(b) as t from t')[0].values);
NODE" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T03:00:25.366408Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 3.4 seconds
Output:
[31;1mParserError: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m node - <[36;1m<[0m'NODE'[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m         ~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mMissing file specification after redirection operator.[0m

 exited 1 in 3358ms:
[31;1mParserError: [0m
[31;1m[36;1mLine |[0m
[31;1m[36;1m[36;1m   2 | [0m node - <[36;1m<[0m'NODE'[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m     | [31;1m         ~[0m
[31;1m[36;1m[36;1m[0m[36;1m[0m[36;1m[31;1m[31;1m[36;1m     | [31;1mMissing file specification after redirection operator.[0m

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "@'
import initSqlJs from 'sql.js';
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run('create table t (b integer default true not null, constraint c check (b in (0,1)))');
db.run('insert into t default values');
console.log(JSON.stringify(db.exec('select b, typeof(b) as t from t')[0].values));
'@ | node --input-type=module -" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T03:00:36.853030Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 3.5 seconds
Output:
node:internal/modules/esm/resolve:873
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
        ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'sql.js' imported from C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\[eval1]
    at packageResolve (node:internal/modules/esm/resolve:873:9)
    at moduleResolve (node:internal/modules/esm/resolve:946:18)
    at defaultResolve (node:internal/modules/esm/resolve:1188:11)
    at ModuleLoader.defaultResolve (node:internal/modules/esm/loader:708:12)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:657:25)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:640:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:264:38)
    at ModuleJob._link (node:internal/modules/esm/module_job:168:49)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5) {
  code: 'ERR_MODULE_NOT_FOUND'
}

Node.js v20.20.2

 exited 1 in 3513ms:
node:internal/modules/esm/resolve:873
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
        ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'sql.js' imported from C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\[eval1]
    at packageResolve (node:internal/modules/esm/resolve:873:9)
    at moduleResolve (node:internal/modules/esm/resolve:946:18)
    at defaultResolve (node:internal/modules/esm/resolve:1188:11)
    at ModuleLoader.defaultResolve (node:internal/modules/esm/loader:708:12)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:657:25)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:640:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:264:38)
    at ModuleJob._link (node:internal/modules/esm/module_job:168:49)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5) {
  code: 'ERR_MODULE_NOT_FOUND'
}

Node.js v20.20.2

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "@'
import initSqlJs from 'sql.js';
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run('create table t (b integer default true not null, constraint c check (b in (0,1)))');
db.run('insert into t default values');
console.log(JSON.stringify(db.exec('select b, typeof(b) as t from t')[0].values));
'@ | node --input-type=module -" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop
 succeeded in 6488ms:
[[1,"integer"]]

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path packages/shared-types/src/providers.ts -Pattern 'PrivacyTier' -Context 2,5; Select-String -Path apps/desktop/src/main/db/schema.ts -Pattern 'privacy_tier' -Context 0,2 | Select-Object -First 20" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 3030ms:

  packages\shared-types\src\providers.ts:1:import type { ModelTier } from './roles.js';
  packages\shared-types\src\providers.ts:2:
> packages\shared-types\src\providers.ts:3:export type [7mPrivacyTier [0m[7m[0m= [0m[7m[0m'local' [0m[7m[0m| [0m[7m[0m'open-source-cloud' [0m[7m[0m| [0m
[7m[0m'proprietary-cloud';[0m
[7m[0m  packages\shared-types\src\providers.ts:4:[0m
[7m[0m  packages\shared-types\src\providers.ts:5:export type ProviderKind =[0m
[7m[0m  packages\shared-types\src\providers.ts:6:  | 'ollama'[0m
[7m[0m  packages\shared-types\src\providers.ts:7:  | 'anthropic'[0m
[7m[0m  packages\shared-types\src\providers.ts:8:  | 'openai'[0m
  packages\shared-types\src\providers.ts:18:  name: string;
  packages\shared-types\src\providers.ts:19:  kind: ProviderKind;
> packages\shared-types\src\providers.ts:20:  [7mprivacyTier[0m: PrivacyTier;[0m
[7m[0m  packages\shared-types\src\providers.ts:21:  baseUrl?: string;[0m
[7m [0m[7m [0m[7m[0mpackages\shared-types\src\providers.ts:22: [0m[7m [0m[7m[0m/** [0m[7m[0mOptional [0m[7m[0mprovider-level [0m[7m[0mdefault [0m[7m[0mmodel [0m[7m[0mused [0m[7m[0mwhen [0m[7m[0mno [0m[7m[0memployee [0m[7m[0moverride [0m
[7m[0mis [0m[7m[0mset. [0m[7m[0m*/[0m
[7m[0m  packages\shared-types\src\providers.ts:23:  defaultModel?: string;[0m
[7m[0m  packages\shared-types\src\providers.ts:24:  enabled: boolean;[0m
[7m[0m  packages\shared-types\src\providers.ts:25:}[0m
  packages\shared-types\src\providers.ts:51:
  packages\shared-types\src\providers.ts:52:/** Numeric rank for privacy tiers — lower = more private. */
> packages\shared-types\src\providers.ts:53:export const PRIVACY_TIER_RANK: Record<[7mPrivacyTier[0m, number> = {[0m
[7m[0m  packages\shared-types\src\providers.ts:54:  local: 0,[0m
[7m[0m  packages\shared-types\src\providers.ts:55:  'open-source-cloud': 1,[0m
[7m[0m  packages\shared-types\src\providers.ts:56:  'proprietary-cloud': 2,[0m
[7m[0m  packages\shared-types\src\providers.ts:57:};[0m
[7m[0m  packages\shared-types\src\providers.ts:58:[0m
> apps\desktop\src\main\db\schema.ts:862:  privacyTier: text('[7mprivacy_tier[0m').notNull(),[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:863:  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:864:});[0m
> apps\desktop\src\main\db\schema.ts:1682: * `[7mprivacy_tier[0m` [0m[7m[0mis [0m[7m[0mconstrained [0m[7m[0mto [0m[7m[0m'Local' [0m[7m[0mat [0m[7m[0mthe [0m[7m[0mSQL [0m[7m[0mlayer [0m[7m[0m— [0m[7m[0mthese [0m
[7m[0mendpoints[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1683: * are local-network, never cloud.[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1684: */[0m
> apps\desktop\src\main\db\schema.ts:1693:    privacyTier: text('[7mprivacy_tier[0m').notNull().default('Local'),[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1694:    status: text('status').notNull().default('unknown'),[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1695:    lastCheckedAt: integer('last_checked_at'),[0m
> apps\desktop\src\main\db\schema.ts:1702:      'local_model_endpoints_[7mprivacy_tier[0m_check',[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1703:      sql`${table.privacyTier} = 'Local'`,[0m
[7m[0m  apps\desktop\src\main\db\schema.ts:1704:    ),[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content packages/local-gguf-runtime/README.md' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 1576ms:
# @team-x/local-gguf-runtime

Runtime engine for Team-X's **Local & Networked GGUF Support** (v3.3.0).

This package owns the platform-facing machinery for running GGUF models
locally and against LAN endpoints:

- **GPU probe** — cross-platform detection (CUDA / ROCm / Vulkan / Metal / CPU)
  and backend ranking.
- **llama-server lifecycle** — spawn, ready-detection, OpenAI-compatible HTTP,
  graceful termination, failure triage.
- **LRU pool** — bounded concurrent model loading with auto-swap.
- **GGUF metadata parser** — arch, params, quant, context window, chat template,
  embedding/tool-capability detection.
- **Hugging Face Hub client** — search, model cards, resumable downloads.
- **Benchmark runner** — per-model throughput + TTFT + VRAM measurement.

## Phase 1 status

This package currently ships only the `errors` re-export (the canonical
`LocalGgufError` union lives in `@team-x/shared-types`). Each subsequent
phase extends the public surface:

| Area | Phase |
|---|---|
| GPU probe (`src/gpu-probe/`) | Phase 2 (Spike S2 findings) |
| Runtime + pool (`src/runtime/`, `src/pool/`) | Phase 2 (Spike S4 findings) |
| Library scanning (`src/library/`) | Phase 3 |
| GGUF metadata (`src/metadata/`) | Phases 3, 6, 8, 9 (Spike S3 findings) |
| HF client (`src/hf-client/`) | Phase 7 (Spike S5 findings) |
| Benchmark runner (`src/benchmark/`) | Phase 10 |

See `docs/superpowers/plans/2026-05-27-local-gguf-support.md` for the master plan.

## Imports

```ts
import { isLocalGgufError, type LocalGgufError } from '@team-x/local-gguf-runtime';
// or, scoped:
import { isLocalGgufError } from '@team-x/local-gguf-runtime/errors';
```

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "if (Test-Path 'docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md') { Get-Content 'docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md' -TotalCount 240 } elseif (Test-Path 'docs/superpowers/plans/2026-05-27-local-gguf-support.md') { Get-Content 'docs/superpowers/plans/2026-05-27-local-gguf-support.md' -TotalCount 240 } else { 'no plan' }" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 5753ms:
# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Cross-phase rules:** Re-read `docs/superpowers/plans/2026-05-27-local-gguf-support.md` § "Cross-phase rules" before starting. Branch naming, commit style, TDD discipline, coverage targets, quality gate, and review wall are canonical there. This phase plan only restates phase-specific items.
>
> **Codex Stage 3 review:** REQUIRED (this phase introduces IPC contracts + SQL migration — both security-sensitive boundaries).

**Goal:** Scaffold the foundation that every subsequent phase depends on — new `@team-x/local-gguf-runtime` package, shared-types contracts, Drizzle migration `0014_local_gguf` with 5 tables + indexes, IPC handler stubs (typed-but-not-implemented), preload bridge, 4 db repos, runtime-settings accessor.

**Architecture:** Phase 1 introduces no business logic — only structural surfaces and type contracts. Every IPC handler stub throws a typed `not-implemented` error that subsequent phases replace with real implementations. The migration is forward-only; rollback is documented but not implemented. All public types are exported from `@team-x/shared-types`.

**Spec coverage:** Implements spec § 6 (package structure setup), § 7 (data model — all 5 tables), and lays the foundation for §§ 8–15 by defining the shared types they consume.

**Estimated PR size:** ~1,500–2,000 LOC net production code + ~2,000 LOC tests + the migration SQL. Single PR.

---

## Files this phase touches

### New files

```
packages/local-gguf-runtime/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── biome.json
├── src/
│   ├── index.ts                                   (public exports)
│   └── errors.ts                                  (LocalGgufError union re-export)

packages/shared-types/src/
├── local-gguf.ts                                  (all entities, IPC contracts, error union)
└── local-gguf.test.ts                             (runtime guard + type-shape tests)

apps/desktop/src/main/
├── db/migrations/0014_local_gguf.sql              (5 tables + indexes)
├── db/repos/
│   ├── local-models.ts                            (CRUD)
│   ├── local-models.test.ts
│   ├── local-model-advanced-params.ts             (CRUD)
│   ├── local-model-advanced-params.test.ts
│   ├── local-model-endpoints.ts                   (CRUD)
│   ├── local-model-endpoints.test.ts
│   ├── local-model-watch-folders.ts               (CRUD)
│   └── local-model-watch-folders.test.ts
├── ipc/
│   ├── local-gguf-library-handlers.ts             (typed stubs)
│   ├── local-gguf-library-handlers.test.ts
│   ├── local-gguf-runtime-handlers.ts             (typed stubs)
│   ├── local-gguf-runtime-handlers.test.ts
│   ├── local-gguf-hf-handlers.ts                  (typed stubs)
│   ├── local-gguf-hf-handlers.test.ts
│   ├── local-gguf-benchmark-handlers.ts           (typed stubs)
│   ├── local-gguf-benchmark-handlers.test.ts
│   ├── local-gguf-endpoint-handlers.ts            (typed stubs)
│   └── local-gguf-endpoint-handlers.test.ts
└── services/runtime-settings/
    ├── local-gguf-settings.ts                     (typed accessor)
    └── local-gguf-settings.test.ts

apps/desktop/src/preload/
└── local-gguf-api.ts                              (preload bridge module)
```

### Modified files

```
pnpm-workspace.yaml                                (register new package)
package.json                                       (add llamaCppRelease pin; ensure scripts pick up new package)
apps/desktop/package.json                          (add @team-x/local-gguf-runtime + @team-x/shared-types deps if not already)
apps/desktop/drizzle.config.ts                     (verify migrations dir picks up 0014)
apps/desktop/src/main/db/client.ts                 (register the 4 new repos)
apps/desktop/src/preload/index.ts                  (mount the local-gguf-api surface)
apps/desktop/src/renderer/src/types/window.d.ts    (extend TeamXApi with localGguf)
CHANGELOG.md                                       (Unreleased entry for Phase 1)
```

---

## Tasks

### Task 1: Branch off `main` and verify clean tree

- [ ] **Step 1: Confirm `main` is clean and up to date.**

```bash
git status
git checkout main
git pull --ff-only
git log -1 --oneline
```

Expected: working tree clean, on `main`, HEAD matches origin.

- [ ] **Step 2: Confirm Phase 0 spikes are all merged.**

```bash
git log --oneline --all | grep -i "spike(S" | head -20
```

Expected: see merge commits for S1, S2, S3, S4, S5 spikes. If any spike is still open, STOP and finish Phase 0 first.

- [ ] **Step 3: Create the phase branch.**

```bash
git checkout -b feat/v3.3.0-phase-01-foundation
git status
```

Expected: on `feat/v3.3.0-phase-01-foundation`, clean tree.

---

### Task 2: Scaffold the `@team-x/local-gguf-runtime` package skeleton

**Files:**
- Create: `packages/local-gguf-runtime/package.json`
- Create: `packages/local-gguf-runtime/tsconfig.json`
- Create: `packages/local-gguf-runtime/vitest.config.ts`
- Create: `packages/local-gguf-runtime/biome.json`
- Create: `packages/local-gguf-runtime/src/index.ts`

- [ ] **Step 1: Create `packages/local-gguf-runtime/package.json`.**

```json
{
  "name": "@team-x/local-gguf-runtime",
  "version": "3.2.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./errors": {
      "types": "./src/errors.ts",
      "import": "./src/errors.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@team-x/shared-types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.1.9"
  }
}
```

Note: `version` matches the workspace freeze-pin convention (master plan global rules CR-10).

- [ ] **Step 2: Create `packages/local-gguf-runtime/tsconfig.json`.**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": false,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create `packages/local-gguf-runtime/vitest.config.ts`.**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
```

- [ ] **Step 4: Create `packages/local-gguf-runtime/biome.json`.**

```json
{
  "$schema": "../../node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["../../biome.json"]
}
```

- [ ] **Step 5: Create `packages/local-gguf-runtime/src/index.ts` (placeholder until subsequent tasks add exports).**

```ts
// Public exports for @team-x/local-gguf-runtime.
// Phase 1 ships only the errors re-export; subsequent phases extend this surface.

export * from './errors';
```

- [ ] **Step 6: Commit.**

```bash
git add packages/local-gguf-runtime/
git commit -m "$(cat <<'EOF'
feat(local-gguf): scaffold @team-x/local-gguf-runtime package skeleton

Adds package.json, tsconfig, vitest config, and Biome config for the
new local-gguf-runtime package. Index.ts re-exports errors only;
subsequent phases extend the public surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Register the new package in the workspace

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'docs/superpowers/plans/2026-05-27-local-gguf-support.md','docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md' -Pattern 'privacy|llamaBinariesVersion|resetAdvanced|local_model_endpoints|watch_folders|RemoteEndpoint|LocalGgufRuntimeSettings|build' -Context 2,3" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 10579ms:

  docs\superpowers\plans\2026-05-27-local-gguf-support.md:58:```
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:59:
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:60:Where `<type>` ∈ `{feat, fix, refactor, test, docs, 
chore, perf, [7mbuild[0m}`, [0m[7m[0m`<scope>` [0m[7m[0mis [0m[7m[0mshort [0m[7m[0m(e.g. [0m[7m[0m`local-gguf`, [0m[7m[0m`provider-router`, [0m[7m[0m`intelligence`, [0m[7m[0m`db`, [0m[7m[0m`ui`, [0m[7m[0m`e2e`), [0m
[7m[0m`<subject>` [0m[7m[0mis [0m[7m[0mimperative [0m[7m[0m("add", [0m[7m[0m"wire", [0m[7m[0m"fix"), [0m[7m[0mstarts [0m[7m[0mlowercase, [0m[7m[0mno [0m[7m[0mtrailing [0m[7m[0mperiod. [0m[7m[0mBody [0m[7m[0mexplains [0m[7m[0mWHY [0m[7m[0mwhen [0m
[7m[0mnon-obvious. [0m[7m[0m**NEVER [0m[7m[0muse [0m[7m[0mplaceholder [0m[7m[0msubjects [0m[7m[0mlike [0m[7m[0m`re`, [0m[7m[0m`wip`, [0m[7m[0m`update`, [0m[7m[0m`fix [0m[7m[0mstuff`** [0m[7m[0m— [0m[7m[0mRocky's [0m[7m[0mmemory [0m
[7m[0m`feedback_commit_messages` [0m[7m[0mexplicitly [0m[7m[0mprohibits [0m[7m[0mthis.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:61:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support.md:62:Co-author [0m[7m[0mtrailer [0m[7m[0mon [0m[7m[0mevery [0m[7m[0mcommit [0m[7m[0m(Claude [0m
[7m[0mpair-programming [0m[7m[0mconvention):[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:63:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:412:```
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:413:package.json                                         ← 
Phase 0/1 (add llamaCppRelease pin)
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:414:apps/desktop/package.json                            ← 
Phase 2 (prepack hook, electron-[7mbuild[0mer [0m[7m[0mfile [0m[7m[0mallowlist)[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:415:apps/desktop/electron-[7mbuild[0mer.yml [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m← [0m
[7m[0mPhase [0m[7m[0m2 [0m[7m[0m(resources [0m[7m[0mallowlist [0m[7m[0m+ [0m[7m[0masarUnpack [0m[7m[0mfor [0m[7m[0mbinaries)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support.md:416:apps/desktop/drizzle.config.ts [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m← [0m
[7m[0mPhase [0m[7m[0m1 [0m[7m[0m(no [0m[7m[0mfunctional [0m[7m[0mchange, [0m[7m[0mverify [0m[7m[0mconfig)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support.md:417:apps/desktop/src/main/db/client.ts [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m← [0m
[7m[0mPhase [0m[7m[0m1 [0m[7m[0m(register [0m[7m[0mnew [0m[7m[0mrepos)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support.md:418:apps/desktop/src/main/db/migrate.ts [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m← [0m
[7m[0mPhase [0m[7m[0m1 [0m[7m[0m(no [0m[7m[0mchange [0m[7m[0mtypically, [0m[7m[0mverify [0m[7m[0mmigration [0m[7m[0mruns)[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:549:}
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:550:
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:551:export interface [7mRemoteEndpoint[0m {[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:552:  id: string;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:553:  name: string;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:554:  baseUrl: string;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:555:  authHeaderKeyRef: string | null;
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:556:  [7mprivacy[0mTier: 'Local';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:557:  status: EndpointStatus;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:558:  lastCheckedAt: number | null;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:559:  lastError: string | null;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:573:}
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:574:
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:575:export interface [7mLocalGgufRuntimeSettings[0m {[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:576:  activeBackend: GpuBackend;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:577:  activeBackendIsAutoDetected: boolean;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:578:  autoFallbackReason: string | null;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:581:  embeddingModelId: string | null;
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:582:  hfTokenKeyRef: string | null; // optional, stored in 
keytar
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:583:  [7mllamaBinariesVersion[0m: string; // e.g. "b4321"[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:584:}[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:585:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:586:export type LocalGgufError =[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:629:'localGguf.library.setChatTemplate'  // (id, 
template|null) → LocalModel
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:630:'localGguf.library.setAdvancedParams'// (id, params: 
Partial<AdvancedParams>) → AdvancedParams
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:631:'localGguf.library.[7mresetAdvanced[0m' [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m[7m[0m(id) [0m[7m[0m→ [0m
[7m[0mAdvancedParams [0m[7m[0m(auto-tuned)[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:632:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:633:// Runtime[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:634:'localGguf.runtime.gpuInventory'     // → GpuInventory[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:635:'localGguf.runtime.reprobeGpu'       // → GpuInventory
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:636:'localGguf.runtime.settings'         // → 
[7mLocalGgufRuntimeSettings[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:637:'localGguf.runtime.setSettings'      // 
(Partial<[7mLocalGgufRuntimeSettings[0m>) [0m[7m[0m→ [0m[7m[0mLocalGgufRuntimeSettings[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:638:'localGguf.runtime.binariesVersion'  // → string[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:639:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:640:// Pool[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:645:
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:646:// Endpoints
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:647:'localGguf.endpoint.list'            // → 
[7mRemoteEndpoint[0m[][0m
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:648:'localGguf.endpoint.add'             // (config) → 
[7mRemoteEndpoint[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:649:'localGguf.endpoint.remove'          // (id) → void[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support.md:650:'localGguf.endpoint.test' [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m[7m[0m(id) [0m[7m[0m→ [0m[7m[0m{ [0m
[7m[0mreachable: [0m[7m[0mboolean; [0m[7m[0mlatencyMs?: [0m[7m[0mnumber; [0m[7m[0merror?: [0m[7m[0mLocalGgufError [0m[7m[0m}[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:651:'localGguf.endpoint.update'          // (id, partial) → 
[7mRemoteEndpoint[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:652:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:653:// HF[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support.md:654:'localGguf.hf.search' [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m[7m[0m(query, [0m[7m[0mfilters) [0m
[7m[0m→ [0m[7m[0mHfSearchResult[][0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:667:### Settings store namespace
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:668:
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:669:Runtime settings live under the existing app settings 
store under the `localGguf` namespace. Existing precedent: see how `runtime-strategy.ts` reads/writes its config. Each 
key in `[7mLocalGgufRuntimeSettings[0m` [0m[7m[0mmaps [0m[7m[0mto [0m[7m[0mone [0m[7m[0mstore [0m[7m[0mentry [0m[7m[0munder [0m[7m[0m`localGguf.<camelKey>`.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:670:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:671:---[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:672:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:1186:```
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:1187:
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:1188:- [ ] **Step 3: Acquire the CPU [7mbuild [0m[7m[0mof [0m
[7m[0mllama.cpp-server [0m[7m[0mfor [0m[7m[0mthis [0m[7m[0mmachine.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:1189:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:1190:Use the asset from S1's findings (CPU [7mbuild[0m). [0m[7m[0mExtract [0m
[7m[0mto [0m[7m[0m`.spike-s4-bin/`.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:1191:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:1192:- [ ] **Step 4: Write throwaway lifecycle test.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:1193:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:144:  },
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:145:  "scripts": {
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:146:    "[7mbuild[0m": [0m[7m[0m"tsc [0m[7m[0m-p [0m[7m[0mtsconfig.json [0m
[7m[0m--noEmit",[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:147: [0m[7m [0m[7m [0m[7m [0m[7m[0m"typecheck": [0m[7m[0m"tsc [0m[7m[0m-p [0m
[7m[0mtsconfig.json [0m[7m[0m--noEmit",[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:148:    "test": "vitest run",[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:149:    "test:watch": "vitest"[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:336:  type ModelStatus,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:337:  type AdvancedParams,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:338:  type [7mRemoteEndpoint[0m,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:339:  type WatchFolder,[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:340:  type [7mLocalGgufRuntimeSettings[0m,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:341:} from './local-gguf';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:342:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:343:describe('isLocalGgufError', () => {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:513:});
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:514:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:515:describe('[7mLocalGgufRuntimeSettings [0m
[7m[0mshape', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:516: [0m[7m [0m[7m[0mit('accepts [0m[7m[0ma [0m[7m[0mdefault [0m[7m[0msettings [0m
[7m[0mrecord', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:517:    const s: 
[7mLocalGgufRuntimeSettings [0m[7m[0m= [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:518:      activeBackend: 'cpu',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:519: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mactiveBackendIsAutoDetected: [0m
[7m[0mtrue,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:520:      autoFallbackReason: null,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:523:      embeddingModelId: null,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:524:      hfTokenKeyRef: null,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:525:      [7mllamaBinariesVersion[0m: 'b4321',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:526:    };[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:527: [0m[7m [0m[7m [0m[7m [0m
[7m[0mexpect(s.maxConcurrentLocalModels).toBe(1);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:528:  });[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:550:});
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:551:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:552:describe('[7mRemoteEndpoint [0m[7m[0mshape', [0m[7m[0m() [0m
[7m[0m=> [0m[7m[0m{[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:553: [0m[7m [0m[7m[0mit('accepts [0m[7m[0ma [0m[7m[0mLocal-tier [0m
[7m[0mendpoint', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:554:    const e: [7mRemoteEndpoint[0m = {[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:555:      id: 'ep-1',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:556:      name: 'LM Studio on bench',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:557: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mbaseUrl: [0m
[7m[0m'http://192.168.1.50:1234',[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:558:      authHeaderKeyRef: null,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:559:      [7mprivacy[0mTier: 'Local',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:560:      status: 'unknown',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:561:      lastCheckedAt: null,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:562:      lastError: null,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:564:      updatedAt: 1716750000000,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:565:    };
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:566:    
expect(e.[7mprivacy[0mTier).toBe('Local');[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:567:  });[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:568:});[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:569:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:629:  // All optional → 
backward-compatible. See docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:630:  // "Shape adjustments to 
GpuInventory". Strict set (load-bearing for backend ranking):
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:631:  computeCap?: string;   // 
nvidia-smi compute_cap, e.g. "5.2" (Maxwell) / "12.0". Gates CUDA-[7mbuild [0m[7m[0mcompatibility [0m[7m[0m(S2 [0m[7m[0mF16, [0m[7m[0mS4 [0m[7m[0mF13).[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:632: [0m[7m [0m[7m[0mgfxTarget?: [0m[7m[0mstring; [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m[7m[0mrocminfo [0m
[7m[0mgfxNNNN, [0m[7m[0me.g. [0m[7m[0m"gfx1100". [0m[7m[0mConfirms [0m[7m[0mHIP [0m[7m[0m--device-targets [0m[7m[0mmatch.[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:633: [0m[7m [0m[7m[0muuid?: [0m[7m[0mstring; [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m
[7m[0mnvidia-smi [0m[7m[0m-L [0m[7m[0mUUID [0m[7m[0m(CUDA) [0m[7m[0m/ [0m[7m[0mdeviceUUID [0m[7m[0m(Vulkan). [0m[7m[0mStable [0m[7m[0mper-device [0m[7m[0mkey; [0m[7m[0mcoalesce [0m[7m[0mby [0m[7m[0mUUID, [0m[7m[0mnot [0m[7m[0mindex [0m[7m[0m(S2 [0m[7m[0mF17).[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:634: [0m[7m [0m[7m[0mcoreCount?: [0m[7m[0mnumber; [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m[7m[0mApple [0m
[7m[0mSilicon [0m[7m[0mGPU [0m[7m[0mcore [0m[7m[0mcount; [0m[7m[0mdrives [0m[7m[0mn_gpu_layers [0m[7m[0mheuristic [0m[7m[0mon [0m[7m[0mMetal.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:728:}
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:729:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:730:export interface [7mRemoteEndpoint[0m {[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:731:  id: string;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:732:  name: string;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:733:  baseUrl: string;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:734:  authHeaderKeyRef: string | null;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:735:  [7mprivacy[0mTier: 'Local';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:736:  status: EndpointStatus;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:737:  lastCheckedAt: number | null;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:738:  lastError: string | null;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:752:}
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:753:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:754:export interface 
[7mLocalGgufRuntimeSettings [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:755:  activeBackend: GpuBackend;[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:756: [0m[7m [0m[7m[0mactiveBackendIsAutoDetected: [0m
[7m[0mboolean;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:757:  autoFallbackReason: string | null;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:760:  embeddingModelId: string | null;
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:761:  hfTokenKeyRef: string | null;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:762:  [7mllamaBinariesVersion[0m: string;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:763:}[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:764:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:765:export type LocalGgufError =[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:853:Locks in the canonical TypeScript 
contracts for the v3.3.0 local GGUF
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:854:support feature: LocalGgufError 
discriminated union (17 variants),
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:855:LocalModel entity, AdvancedParams, 
BenchmarkResult, [7mRemoteEndpoint[0m,[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:856:WatchFolder, 
[7mLocalGgufRuntimeSettings[0m, [0m[7m[0mand [0m[7m[0mGpuInventory [0m[7m[0mshape.[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:857:Includes [0m[7m[0mstructural [0m[7m[0mtype [0m[7m[0mguard [0m
[7m[0misLocalGgufError() [0m[7m[0mand [0m[7m[0mcompile-time[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:858:exhaustiveness [0m[7m[0mcoverage [0m[7m[0min [0m[7m[0mthe [0m[7m[0mtest [0m
[7m[0mfile.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:859:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:941:Lets downstream phases import errors 
from
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:942:`@team-x/local-gguf-runtime/errors` 
without crossing shared-types
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:943:directly. Vitest config sets 
passWithNoTests so the package [7mbuild[0ms[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:944:green [0m[7m[0mbefore [0m[7m[0mits [0m[7m[0mreal [0m[7m[0mtest [0m[7m[0msuite [0m
[7m[0marrives [0m[7m[0min [0m[7m[0mPhase [0m[7m[0m2.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:945:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:946:Co-Authored-By: [0m[7m[0mClaude [0m[7m[0mOpus [0m[7m[0m4.7 [0m[7m[0m(1M [0m
[7m[0mcontext) [0m[7m[0m<noreply@anthropic.com>[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1161:      'local_model_advanced_params',
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1162:      'local_model_benchmarks',
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1163:      '[7mlocal_model_endpoints[0m',[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1164:      'local_model_[7mwatch_folders[0m',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1165:      'local_models',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1166:    ]);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1167:  });[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1198:--   - local_model_advanced_params  
 (per-model overrides; PK = model_id)
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1199:--   - local_model_benchmarks       
 (benchmark history per model)
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1200:--   - [7mlocal_model_endpoints [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m
[7m [0m[7m[0m(remote [0m[7m[0mLAN [0m[7m[0mendpoints)[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1201:--   - local_model_[7mwatch_folders [0m[7m [0m[7m [0m[7m [0m
[7m [0m[7m[0m(folder-scan [0m[7m[0msources)[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1202:--[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1203:-- [0m[7m[0mForward-only. [0m[7m[0mRollback [0m[7m[0mnote: [0m
[7m[0mdropping [0m[7m[0mthese [0m[7m[0mtables [0m[7m[0mis [0m[7m[0msafe [0m[7m[0m(no [0m[7m[0mother[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1204:-- [0m[7m[0mtable [0m[7m[0mreferences [0m[7m[0mthem), [0m[7m[0mbut [0m
[7m[0mdownstream [0m[7m[0mfeatures [0m[7m[0min [0m[7m[0mv3.3.0+ [0m[7m[0mdepend [0m[7m[0mon[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1216:                              
('file', 'folder-entry', 'remote-endpoint')),
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1217:  source_path              TEXT,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1218:  endpoint_id              TEXT 
REFERENCES [7mlocal_model_endpoints[0m(id) [0m[7m[0mON [0m[7m[0mDELETE [0m[7m[0mCASCADE,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1219:  gguf_arch                TEXT,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1220:  gguf_params_b            REAL,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1221:  gguf_quant               TEXT,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1285:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1286:-- 4. Remote LAN endpoints.
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1287:CREATE TABLE [7mlocal_model_endpoints[0m ([0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1288: [0m[7m [0m[7m[0mid [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mTEXT [0m
[7m[0mPRIMARY [0m[7m[0mKEY,[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1289: [0m[7m [0m[7m[0mname [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mTEXT [0m[7m[0mNOT [0m
[7m[0mNULL,[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1290: [0m[7m [0m[7m[0mbase_url [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mTEXT [0m[7m[0mNOT [0m
[7m[0mNULL,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1291:  auth_header_key_ref      TEXT,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1292:  [7mprivacy[0m_tier [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mTEXT [0m[7m[0mNOT [0m
[7m[0mNULL [0m[7m[0mDEFAULT [0m[7m[0m'Local'[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1293:                              CHECK 
([7mprivacy[0m_tier [0m[7m[0m= [0m[7m[0m'Local'),[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1294: [0m[7m [0m[7m[0mstatus [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mTEXT [0m[7m[0mNOT [0m
[7m[0mNULL [0m[7m[0mDEFAULT [0m[7m[0m'unknown'[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1295: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mCHECK [0m
[7m[0m(status [0m[7m[0mIN [0m[7m[0m('unknown', [0m[7m[0m'reachable',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1296: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m
[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m'unreachable', [0m[7m[0m'auth-failed')),[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1302:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1303:-- 5. Watched folders (file-system 
source — local paths or UNC/SMB).
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1304:CREATE TABLE 
local_model_[7mwatch_folders [0m[7m[0m([0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1305: [0m[7m [0m[7m[0mid [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mTEXT [0m[7m[0mPRIMARY [0m
[7m[0mKEY,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1306:  path              TEXT NOT NULL,[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1307: [0m[7m [0m[7m[0mrecursive [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mINTEGER [0m[7m[0mNOT [0m
[7m[0mNULL [0m[7m[0mDEFAULT [0m[7m[0m1 [0m[7m[0mCHECK [0m[7m[0m(recursive [0m[7m[0mIN [0m[7m[0m(0, [0m[7m[0m1)),[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1314:);
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1315:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1316:CREATE INDEX 
idx_local_model_[7mwatch_folders[0m_status [0m[7m[0mON [0m[7m[0mlocal_model_watch_folders(status);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1317:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1318:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1319:- [0m[7m[0m[ [0m[7m[0m] [0m[7m[0m**Step [0m[7m[0m5: [0m[7m[0mGenerate [0m[7m[0mthe [0m
[7m[0mDrizzle [0m[7m[0msnapshot.**[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1366:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1367:Introduces local_models, 
local_model_advanced_params,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1368:local_model_benchmarks, 
[7mlocal_model_endpoints[0m, [0m[7m[0mlocal_model_watch_folders.[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1369:CHECK [0m[7m[0mconstraints [0m[7m[0menforce [0m
[7m[0msource_type [0m[7m[0munion, [0m[7m[0mstatus [0m[7m[0munion, [0m[7m[0mand [0m[7m[0mthe[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1370:source-type/path/endpoint [0m
[7m[0mcross-constraint [0m[7m[0mthat [0m[7m[0mdisambiguates [0m[7m[0mhow [0m[7m[0ma[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1371:LocalModel [0m[7m[0mrow [0m[7m[0mpoints [0m[7m[0mat [0m[7m[0mits [0m
[7m[0mbacking [0m[7m[0msource. [0m[7m[0mIndexes [0m[7m[0mcover [0m[7m[0mthe[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1473:    const now = Date.now();
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1474:    db.prepare(`
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1475:      INSERT INTO 
[7mlocal_model_endpoints [0m[7m[0m(id, [0m[7m[0mname, [0m[7m[0mbase_url, [0m[7m[0mprivacy_tier, [0m[7m[0mstatus, [0m[7m[0mcreated_at, [0m[7m[0mupdated_at)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1476: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mVALUES [0m[7m[0m('ep-1', [0m[7m[0m'LM [0m[7m[0mStudio', [0m
[7m[0m'http://192.168.1.50:1234', [0m[7m[0m'Local', [0m[7m[0m'unknown', [0m[7m[0m?, [0m[7m[0m?)[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1477:    `).run(now, now);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1478:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1515:    const m2 = 
repo.insert(fileFixture('M2'));
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1516:    db.prepare(`
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1517:      INSERT INTO 
[7mlocal_model_endpoints [0m[7m[0m(id, [0m[7m[0mname, [0m[7m[0mbase_url, [0m[7m[0mprivacy_tier, [0m[7m[0mstatus, [0m[7m[0mcreated_at, [0m[7m[0mupdated_at)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1518: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mVALUES [0m[7m[0m('ep-1', [0m[7m[0m'EP', [0m
[7m[0m'http://x', [0m[7m[0m'Local', [0m[7m[0m'unknown', [0m[7m[0m1, [0m[7m[0m1)[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1519:    `).run();[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1520: [0m[7m [0m[7m [0m[7m [0m[7m[0mconst [0m[7m[0mm3 [0m[7m[0m= [0m
[7m[0mrepo.insert(remoteFixture('M3', [0m[7m[0m'ep-1'));[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2216:    expect(created.name).toBe('LM 
Studio on bench');
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2217:    
expect(created.baseUrl).toBe('http://192.168.1.50:1234');
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2218:    
expect(created.[7mprivacy[0mTier).toBe('Local');[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2219: [0m[7m [0m[7m [0m[7m [0m
[7m[0mexpect(created.status).toBe('unknown');[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2220: [0m[7m [0m[7m [0m[7m [0m[7m[0mconst [0m[7m[0mfetched [0m[7m[0m= [0m
[7m[0mrepo.getById(created.id);[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2221: [0m[7m [0m[7m [0m[7m [0m
[7m[0mexpect(fetched).toEqual(created);[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2274:  });
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2275:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2276:  it('rejects non-Local 
[7mprivacy[0m_tier [0m[7m[0m(CHECK [0m[7m[0mconstraint)', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2277:    expect(() => db.prepare(`[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2278:      INSERT INTO 
[7mlocal_model_endpoints [0m[7m[0m(id, [0m[7m[0mname, [0m[7m[0mbase_url, [0m[7m[0mprivacy_tier, [0m[7m[0mstatus, [0m[7m[0mcreated_at, [0m[7m[0mupdated_at)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2279: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mVALUES [0m[7m[0m('bad', [0m[7m[0m'Bad', [0m
[7m[0m'http://x', [0m[7m[0m'Cloud', [0m[7m[0m'unknown', [0m[7m[0m0, [0m[7m[0m0)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2280: [0m[7m [0m[7m [0m[7m [0m[7m[0m`).run()).toThrow(/CHECK [0m
[7m[0mconstraint [0m[7m[0mfailed/);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2281:  });[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2296:// 
apps/desktop/src/main/db/repos/local-model-endpoints.ts
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2297://
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2298:// Repository for the 
[7mlocal_model_endpoints [0m[7m[0mtable. [0m[7m[0mRemote [0m[7m[0mLAN[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2299:// [0m[7m[0mendpoints [0m[7m[0m(LM [0m[7m[0mStudio, [0m[7m[0mOllama, [0m
[7m[0mllama-server, [0m[7m[0mKoboldCPP, [0m[7m[0mvLLM).[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2300:// [7mprivacy[0m_tier [0m[7m[0mis [0m[7m[0mconstrained [0m[7m[0mto [0m
[7m[0m'Local' [0m[7m[0mat [0m[7m[0mthe [0m[7m[0mSQL [0m[7m[0mlevel [0m[7m[0m— [0m[7m[0mthese[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2301:// [0m[7m[0mendpoints [0m[7m[0mare [0m[7m[0mlocal-network, [0m[7m[0mnot [0m
[7m[0mcloud.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2302:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2303:import [0m[7m[0mtype [0m[7m[0mDatabase [0m[7m[0mfrom [0m
[7m[0m'better-sqlite3';[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2304:import { randomUUID } from 
'node:crypto';
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2305:import type { EndpointStatus, 
[7mRemoteEndpoint [0m[7m[0m} [0m[7m[0mfrom [0m[7m[0m'@team-x/shared-types';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2306:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2307:export [0m[7m[0minterface [0m
[7m[0mInsertEndpointInput [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2308:  name: string;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2312:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2313:export interface 
LocalModelEndpointsRepo {
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2314:  insert(input: 
InsertEndpointInput): [7mRemoteEndpoint[0m;[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2315:  getById(id: string): 
[7mRemoteEndpoint [0m[7m[0m| [0m[7m[0mnull;[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2316:  list(): [7mRemoteEndpoint[0m[];
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2317:  updateStatus(id: string, status: 
EndpointStatus, lastError: string | null): [7mRemoteEndpoint[0m;[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2318:  updateAuthRef(id: string, ref: 
string | null): [7mRemoteEndpoint[0m;[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2319:  rename(id: string, name: string): 
[7mRemoteEndpoint[0m;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2320:  remove(id: string): void;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2321:}[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2322:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2326:  base_url: string;
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2327:  auth_header_key_ref: string | 
null;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2328:  [7mprivacy[0m_tier: 'Local';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2329:  status: EndpointStatus;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2330:  last_checked_at: number | null;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2331:  last_error: string | null;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2334:}
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2335:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2336:function mapRow(row: EndpointRow): 
[7mRemoteEndpoint [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2337:  return {[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2338:    id: row.id,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2339:    name: row.name,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2340:    baseUrl: row.base_url,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2341:    authHeaderKeyRef: 
row.auth_header_key_ref,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2342:    [7mprivacy[0mTier: row.privacy_tier,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2343:    status: row.status,[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2344: [0m[7m [0m[7m [0m[7m [0m[7m[0mlastCheckedAt: [0m
[7m[0mrow.last_checked_at,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2345:    lastError: row.last_error,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2351:export function 
createLocalModelEndpointsRepo(db: Database.Database): LocalModelEndpointsRepo {
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2352:  const insertStmt = db.prepare(`
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2353:    INSERT INTO 
[7mlocal_model_endpoints [0m[7m[0m([0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2354:      id, name, base_url, 
auth_header_key_ref, [7mprivacy[0m_tier,[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2355: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mstatus, [0m[7m[0mlast_checked_at, [0m
[7m[0mlast_error, [0m[7m[0mcreated_at, [0m[7m[0mupdated_at[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2356:    ) VALUES ([0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2357: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m@id, [0m[7m[0m@name, [0m[7m[0m@base_url, [0m
[7m[0m@auth_header_key_ref, [0m[7m[0m'Local',[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2360:  `);
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2361:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2362:  const getStmt = 
db.prepare(`SELECT * FROM [7mlocal_model_endpoints [0m[7m[0mWHERE [0m[7m[0mid [0m[7m[0m= [0m[7m[0m?`);[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2363:  const listStmt = 
db.prepare(`SELECT * FROM [7mlocal_model_endpoints [0m[7m[0mORDER [0m[7m[0mBY [0m[7m[0mcreated_at [0m[7m[0mDESC`);[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2364: [0m[7m [0m[7m[0mconst [0m[7m[0mupdateStatusStmt [0m[7m[0m= [0m
[7m[0mdb.prepare(`[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2365:    UPDATE [7mlocal_model_endpoints[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2366: [0m[7m [0m[7m [0m[7m [0m[7m[0mSET [0m[7m[0mstatus [0m[7m[0m= [0m[7m[0m?, [0m[7m[0mlast_checked_at [0m
[7m[0m= [0m[7m[0m?, [0m[7m[0mlast_error [0m[7m[0m= [0m[7m[0m?, [0m[7m[0mupdated_at [0m[7m[0m= [0m[7m[0m?[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2367:    WHERE id = ?[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2368:  `);[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2369:  const updateAuthStmt = 
db.prepare(`
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2370:    UPDATE [7mlocal_model_endpoints [0m
[7m[0mSET [0m[7m[0mauth_header_key_ref [0m[7m[0m= [0m[7m[0m?, [0m[7m[0mupdated_at [0m[7m[0m= [0m[7m[0m? [0m[7m[0mWHERE [0m[7m[0mid [0m[7m[0m= [0m[7m[0m?[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2371:  `);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2372:  const renameStmt = db.prepare(`[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2373:    UPDATE [7mlocal_model_endpoints [0m
[7m[0mSET [0m[7m[0mname [0m[7m[0m= [0m[7m[0m?, [0m[7m[0mupdated_at [0m[7m[0m= [0m[7m[0m? [0m[7m[0mWHERE [0m[7m[0mid [0m[7m[0m= [0m[7m[0m?[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2374:  `);[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2375:  const removeStmt = 
db.prepare(`DELETE FROM [7mlocal_model_endpoints [0m[7m[0mWHERE [0m[7m[0mid [0m[7m[0m= [0m[7m[0m?`);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2376:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2377:  return {[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2378:    insert(input) {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2437:git add 
apps/desktop/src/main/db/repos/local-model-endpoints.ts apps/desktop/src/main/db/repos/local-model-endpoints.test.ts
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2438:git commit -m "$(cat <<'EOF'
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2439:feat(db): add [7mlocal_model_endpoints [0m
[7m[0mrepo [0m[7m[0mfor [0m[7m[0mremote [0m[7m[0mLAN [0m[7m[0mendpoints[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2440:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2441:createLocalModelEndpointsRepo(db) [0m
[7m[0mreturns [0m[7m[0minsert [0m[7m[0m/ [0m[7m[0mgetById [0m[7m[0m/ [0m[7m[0mlist [0m[7m[0m/[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2442:updateStatus [0m[7m[0m/ [0m[7m[0mupdateAuthRef [0m
[7m[0m(keytar [0m[7m[0mreference [0m[7m[0mrotation) [0m[7m[0m/ [0m[7m[0mrename [0m[7m[0m/[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2443:remove. [7mprivacy[0m_tier [0m[7m[0mis [0m[7m[0menforced [0m[7m[0mat [0m
[7m[0m'Local' [0m[7m[0mby [0m[7m[0mSQL [0m[7m[0mCHECK. [0m[7m[0mEndpoint[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2444:removal [0m[7m[0mcascades [0m[7m[0mto [0m[7m[0mlocal_models [0m
[7m[0mrows [0m[7m[0mreferencing [0m[7m[0mit [0m[7m[0m(FK [0m[7m[0mis[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2445:ON [0m[7m[0mDELETE [0m[7m[0mCASCADE [0m[7m[0mper [0m[7m[0mthe [0m
[7m[0mmigration).[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2446:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2447:Implements spec § 7 
[7mlocal_model_endpoints [0m[7m[0moperations.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2448:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2449:Co-Authored-By: [0m[7m[0mClaude [0m[7m[0mOpus [0m[7m[0m4.7 [0m[7m[0m(1M [0m
[7m[0mcontext) [0m[7m[0m<noreply@anthropic.com>[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2450:EOF[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2542:// 
apps/desktop/src/main/db/repos/local-model-watch-folders.ts
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2543://
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2544:// Repository for the 
local_model_[7mwatch_folders [0m[7m[0mtable. [0m[7m[0mFolder [0m[7m[0msources[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2545:// [0m[7m[0mfor [0m[7m[0mGGUF [0m[7m[0mdiscovery [0m[7m[0m— [0m[7m[0mlocal [0m[7m[0mpaths [0m
[7m[0mor [0m[7m[0mUNC/SMB [0m[7m[0mpaths.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2546:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2547:import [0m[7m[0mtype [0m[7m[0mDatabase [0m[7m[0mfrom [0m
[7m[0m'better-sqlite3';[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2589:export function 
createLocalModelWatchFoldersRepo(db: Database.Database): LocalModelWatchFoldersRepo {
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2590:  const insertStmt = db.prepare(`
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2591:    INSERT INTO 
local_model_[7mwatch_folders [0m[7m[0m([0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2592: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mid, [0m[7m[0mpath, [0m[7m[0mrecursive, [0m[7m[0mstatus, [0m
[7m[0mlast_scan_at, [0m[7m[0mlast_scan_error, [0m[7m[0mcreated_at, [0m[7m[0mupdated_at[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2593:    ) VALUES ([0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2594: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m@id, [0m[7m[0m@path, [0m[7m[0m@recursive, [0m
[7m[0m'unknown', [0m[7m[0mNULL, [0m[7m[0mNULL, [0m[7m[0m@created_at, [0m[7m[0m@updated_at[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2595:    )
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2596:  `);
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2597:  const getStmt = 
db.prepare(`SELECT * FROM local_model_[7mwatch_folders [0m[7m[0mWHERE [0m[7m[0mid [0m[7m[0m= [0m[7m[0m?`);[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2598:  const listStmt = 
db.prepare(`SELECT * FROM local_model_[7mwatch_folders [0m[7m[0mORDER [0m[7m[0mBY [0m[7m[0mcreated_at [0m[7m[0mASC`);[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2599: [0m[7m [0m[7m[0mconst [0m[7m[0mupdateStatusStmt [0m[7m[0m= [0m
[7m[0mdb.prepare(`[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2600:    UPDATE local_model_[7mwatch_folders[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2601: [0m[7m [0m[7m [0m[7m [0m[7m[0mSET [0m[7m[0mstatus [0m[7m[0m= [0m[7m[0m?, [0m[7m[0mlast_scan_at [0m[7m[0m= [0m
[7m[0m?, [0m[7m[0mlast_scan_error [0m[7m[0m= [0m[7m[0m?, [0m[7m[0mupdated_at [0m[7m[0m= [0m[7m[0m?[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2602:    WHERE id = ?[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2603:  `);[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2604:  const updateRecursiveStmt = 
db.prepare(`
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2605:    UPDATE 
local_model_[7mwatch_folders [0m[7m[0mSET [0m[7m[0mrecursive [0m[7m[0m= [0m[7m[0m?, [0m[7m[0mupdated_at [0m[7m[0m= [0m[7m[0m? [0m[7m[0mWHERE [0m[7m[0mid [0m[7m[0m= [0m[7m[0m?[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2606:  `);[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2607:  const removeStmt = 
db.prepare(`DELETE FROM local_model_[7mwatch_folders [0m[7m[0mWHERE [0m[7m[0mid [0m[7m[0m= [0m[7m[0m?`);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2608:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2609:  return {[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2610:    insert(input) {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2665:git add 
apps/desktop/src/main/db/repos/local-model-watch-folders.ts 
apps/desktop/src/main/db/repos/local-model-watch-folders.test.ts
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2666:git commit -m "$(cat <<'EOF'
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2667:feat(db): add 
local_model_[7mwatch_folders [0m[7m[0mrepo[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2668:[0m
[7m [0m[7m [0m
[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2669:createLocalModelWatchFoldersRepo(db) [0m
[7m[0mreturns [0m[7m[0minsert [0m[7m[0m(recursive[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2670:defaults [0m[7m[0mto [0m[7m[0mtrue), [0m[7m[0mgetById, [0m[7m[0mlist [0m
[7m[0m(oldest [0m[7m[0mfirst [0m[7m[0m— [0m[7m[0mstable [0m[7m[0mordering [0m[7m[0mfor[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2672:including UNC (\\\\NAS\\share) and 
mapped-drive paths.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2673:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2674:Implements spec § 7 
local_model_[7mwatch_folders [0m[7m[0moperations.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2675:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2676:Co-Authored-By: [0m[7m[0mClaude [0m[7m[0mOpus [0m[7m[0m4.7 [0m[7m[0m(1M [0m
[7m[0mcontext) [0m[7m[0m<noreply@anthropic.com>[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2677:EOF[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2771:- Create: 
`apps/desktop/src/main/services/runtime-settings/local-gguf-settings.test.ts`
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2772:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2773:This wraps the existing app 
settings store with a typed accessor for `[7mLocalGgufRuntimeSettings[0m`. [0m[7m[0mThe [0m[7m[0mactual [0m[7m[0msettings [0m[7m[0mpersistence [0m[7m[0mis [0m[7m[0munchanged [0m[7m[0m— [0m
[7m[0msame [0m[7m[0mkey-value [0m[7m[0mstore [0m[7m[0mthe [0m[7m[0mrest [0m[7m[0mof [0m[7m[0mTeam-X [0m[7m[0muses.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2774:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2775:- [0m[7m[0m[ [0m[7m[0m] [0m[7m[0m**Step [0m[7m[0m1: [0m[7m[0mRead [0m[7m[0mthe [0m[7m[0mexisting [0m
[7m[0msettings-store [0m[7m[0mpattern.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2776:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2874:  });
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2875:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2876:  it('set[7mLlamaBinariesVersion [0m
[7m[0mpersists', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2877:    
accessor.set[7mLlamaBinariesVersion[0m('b4321');[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2878:    
expect(accessor.get().[7mllamaBinariesVersion[0m).toBe('b4321');[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2879:  });[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2880:});[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2881:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2901:// 
localGguf.activeBackendIsAutoDetected, etc.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2902:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2903:import type { GpuBackend, 
[7mLocalGgufRuntimeSettings [0m[7m[0m} [0m[7m[0mfrom [0m[7m[0m'@team-x/shared-types';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2904:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2905:export [0m[7m[0minterface [0m
[7m[0mLocalGgufSettingsStore [0m[7m[0m{[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2906: [0m[7m [0m[7m[0mget<T>(key: [0m[7m[0mstring): [0m[7m[0mT [0m[7m[0m| [0m
[7m[0mundefined;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2909:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2910:export interface 
LocalGgufSettingsAccessor {
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2911:  get(): [7mLocalGgufRuntimeSettings[0m;[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2912: [0m[7m [0m[7m[0mupdateBackend(backend: [0m
[7m[0mGpuBackend, [0m[7m[0mautoDetected: [0m[7m[0mboolean): [0m[7m[0mvoid;[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2913: [0m[7m [0m[7m[0mrecordFallback(backend: [0m
[7m[0mGpuBackend, [0m[7m[0mreason: [0m[7m[0mstring): [0m[7m[0mvoid;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2914:  setMaxConcurrent(n: number): void;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2916:  setEmbeddingModelId(id: string | 
null): void;
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2917:  setHfTokenKeyRef(ref: string | 
null): void;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2918:  set[7mLlamaBinariesVersion[0m(version: [0m
[7m[0mstring): [0m[7m[0mvoid;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2919:}[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2920:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2921:export const 
DEFAULT_LOCAL_GGUF_SETTINGS: [7mLocalGgufRuntimeSettings [0m[7m[0m= [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2922:  activeBackend: 'cpu',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2923:  activeBackendIsAutoDetected: true,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2924:  autoFallbackReason: null,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2927:  embeddingModelId: null,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2928:  hfTokenKeyRef: null,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2929:  [7mllamaBinariesVersion[0m: 'unknown',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2930:};[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2931:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2932:const KEYS = {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2938:  embeddingModelId: 
'localGguf.embeddingModelId',
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2939:  hfTokenKeyRef: 
'localGguf.hfTokenKeyRef',
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2940:  [7mllamaBinariesVersion[0m: [0m
[7m[0m'localGguf.llamaBinariesVersion',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2941:} as const;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2942:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2943:export [0m[7m[0mfunction [0m
[7m[0mcreateLocalGgufSettingsAccessor([0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2961:        hfTokenKeyRef:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2962:          store.get<string | 
null>(KEYS.hfTokenKeyRef) ?? DEFAULT_LOCAL_GGUF_SETTINGS.hfTokenKeyRef,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2963:        [7mllamaBinariesVersion[0m:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2964:          
store.get<string>(KEYS.[7mllamaBinariesVersion[0m) [0m[7m[0m?? [0m[7m[0mDEFAULT_LOCAL_GGUF_SETTINGS.llamaBinariesVersion,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2965:      };[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2966:    },[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2967: [0m[7m [0m[7m [0m[7m [0m[7m[0mupdateBackend(backend, [0m
[7m[0mautoDetected) [0m[7m[0m{[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2988:      store.set(KEYS.hfTokenKeyRef, 
ref);
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2989:    },
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2990:    
set[7mLlamaBinariesVersion[0m(version) [0m[7m[0m{[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2991:      
store.set(KEYS.[7mllamaBinariesVersion[0m, [0m[7m[0mversion);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2992:    },[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2993:  };[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2994:}[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3011:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3012:createLocalGgufSettingsAccessor 
wraps the app key-value store with a
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3013:typed surface for the eight 
[7mLocalGgufRuntimeSettings [0m[7m[0mfields:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3014:activeBackend, [0m
[7m[0mactiveBackendIsAutoDetected, [0m[7m[0mautoFallbackReason,[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3015:maxConcurrentLocalModels, [0m
[7m[0mdefaultLibraryFolder, [0m[7m[0membeddingModelId,[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3016:hfTokenKeyRef, 
[7mllamaBinariesVersion[0m. [0m[7m[0mDefaults [0m[7m[0mdefined [0m[7m[0min[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3017:DEFAULT_LOCAL_GGUF_SETTINGS [0m[7m[0mand [0m
[7m[0moverlay [0m[7m[0many [0m[7m[0mpersisted [0m[7m[0mvalues [0m[7m[0mfrom[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3018:the [0m[7m[0mstore. [0m[7m[0mupdateBackend [0m[7m[0mclears [0m[7m[0mthe [0m
[7m[0mfallback [0m[7m[0mreason; [0m[7m[0mrecordFallback[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3019:captures [0m[7m[0mthe [0m[7m[0mreason [0m[7m[0mand [0m[7m[0mflips [0m
[7m[0mautoDetected [0m[7m[0mto [0m[7m[0mfalse.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3136:  );
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3137:  ipc.handle(
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3138:    
'localGguf.library.[7mresetAdvanced[0m',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3139: [0m[7m [0m[7m [0m[7m [0m[7m[0masync [0m[7m[0m(_e, [0m[7m[0m_id: [0m[7m[0mstring): [0m
[7m[0mPromise<AdvancedParams> [0m[7m[0m=> [0m[7m[0m{[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3140:      throw 
NOT_IMPLEMENTED('localGguf.library.[7mresetAdvanced[0m');[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3141:    },[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3142:  );[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3143:  ipc.handle([0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3189:      
'localGguf.library.removeFolder',
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3190:      
'localGguf.library.removeModel',
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3191:      
'localGguf.library.[7mresetAdvanced[0m',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3192: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m
[7m[0m'localGguf.library.scanFolder',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3193: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m
[7m[0m'localGguf.library.setAdvancedParams',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3194: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m
[7m[0m'localGguf.library.setChatTemplate',[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3208:    
'localGguf.library.setChatTemplate',
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3209:    
'localGguf.library.setAdvancedParams',
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3210:    
'localGguf.library.[7mresetAdvanced[0m',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3211: [0m[7m [0m[7m [0m[7m [0m
[7m[0m'localGguf.library.listBySourceType',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3212: [0m[7m [0m[7m[0m])('handler [0m[7m[0m%s [0m[7m[0mthrows [0m[7m[0ma [0m
[7m[0mnot-implemented [0m[7m[0merror', [0m[7m[0masync [0m[7m[0m(channel) [0m[7m[0m=> [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3213:    const ipc = makeFakeIpcMain();[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3253:- `localGguf.runtime.gpuInventory` 
→ `GpuInventory`
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3254:- `localGguf.runtime.reprobeGpu` → 
`GpuInventory`
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3255:- `localGguf.runtime.settings` → 
`[7mLocalGgufRuntimeSettings[0m`[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3256:- `localGguf.runtime.setSettings` → 
`[7mLocalGgufRuntimeSettings[0m` [0m[7m[0m(takes [0m[7m[0m`Partial<LocalGgufRuntimeSettings>`)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3257:- [0m
[7m[0m`localGguf.runtime.binariesVersion` [0m[7m[0m→ [0m[7m[0m`string`[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3258:- [0m[7m[0m`localGguf.pool.status` [0m[7m[0m→ [0m[7m[0m`{ [0m
[7m[0mloaded: [0m[7m[0m{ [0m[7m[0mmodelId: [0m[7m[0mstring; [0m[7m[0mbaseUrl: [0m[7m[0mstring; [0m[7m[0mpid: [0m[7m[0mnumber [0m[7m[0m}[]; [0m[7m[0mmaxConcurrent: [0m[7m[0mnumber [0m[7m[0m}`[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3259:- [0m[7m[0m`localGguf.pool.load` [0m[7m[0m→ [0m[7m[0m`{ [0m
[7m[0mmodelId: [0m[7m[0mstring; [0m[7m[0mbaseUrl: [0m[7m[0mstring; [0m[7m[0mpid: [0m[7m[0mnumber [0m[7m[0m}` [0m[7m[0m(takes [0m[7m[0m`id: [0m[7m[0mstring`)[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3302:
  
docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3303:**`local-gguf-endpoint-handlers.ts`** 
channels:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3304:- `localGguf.endpoint.list` → 
`[7mRemoteEndpoint[0m[]`[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3305:- `localGguf.endpoint.add` → 
`[7mRemoteEndpoint[0m` [0m[7m[0m(takes [0m[7m[0m`{ [0m[7m[0mname: [0m[7m[0mstring; [0m[7m[0mbaseUrl: [0m[7m[0mstring; [0m[7m[0mauthHeaderKeyRef: [0m[7m[0mstring [0m[7m[0m| [0m[7m[0mnull [0m[7m[0m}`)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3306:- [0m[7m[0m`localGguf.endpoint.remove` [0m[7m[0m→ [0m
[7m[0m`void` [0m[7m[0m(takes [0m[7m[0m`id: [0m[7m[0mstring`)[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3307:- [0m[7m[0m`localGguf.endpoint.test` [0m[7m[0m→ [0m[7m[0m`{ [0m
[7m[0mreachable: [0m[7m[0mboolean; [0m[7m[0mlatencyMs?: [0m[7m[0mnumber; [0m[7m[0merror?: [0m[7m[0mLocalGgufError [0m[7m[0m}` [0m[7m[0m(takes [0m[7m[0m`id: [0m[7m[0mstring`)[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3308:- `localGguf.endpoint.update` → 
`[7mRemoteEndpoint[0m` [0m[7m[0m(takes [0m[7m[0m`id: [0m[7m[0mstring` [0m[7m[0m+ [0m[7m[0m`partial: [0m[7m[0m{ [0m[7m[0mname?: [0m[7m[0mstring; [0m[7m[0mbaseUrl?: [0m[7m[0mstring; [0m[7m[0mauthHeaderKeyRef?: [0m[7m[0mstring [0m[7m[0m| [0m[7m[0mnull [0m
[7m[0m}`)[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3309:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3310:Each [0m[7m[0mmodule [0m[7m[0mfollows [0m[7m[0mthe [0m[7m[0msame [0m
[7m[0mstructure [0m[7m[0mas [0m[7m[0mthe [0m[7m[0mlibrary [0m[7m[0mmodule [0m[7m[0mabove. [0m[7m[0mEach [0m[7m[0mtest [0m[7m[0masserts:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3311:1. [0m[7m[0mAll [0m[7m[0mdeclared [0m[7m[0mchannels [0m[7m[0mare [0m
[7m[0mregistered.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3380:  GpuInventory,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3381:  LocalGgufError,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3382:  [7mLocalGgufRuntimeSettings[0m,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3383:  LocalModel,[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3384:  [7mRemoteEndpoint[0m,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3385:  SourceType,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3386:  WatchFolder,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3387:} from '@team-x/shared-types';[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3423:    setChatTemplate: (id: string, 
template: string | null) => Promise<LocalModel>;
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3424:    setAdvancedParams: (id: string, 
params: Partial<AdvancedParams>) => Promise<AdvancedParams>;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3425:    [7mresetAdvanced[0m: [0m[7m[0m(id: [0m[7m[0mstring) [0m[7m[0m=> [0m
[7m[0mPromise<AdvancedParams>;[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3426: [0m[7m [0m[7m [0m[7m [0m[7m[0mlistBySourceType: [0m[7m[0m(sourceType: [0m
[7m[0mSourceType) [0m[7m[0m=> [0m[7m[0mPromise<LocalModel[]>;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3427:  };[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3428:  runtime: {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3429:    gpuInventory: () => 
Promise<GpuInventory>;
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3430:    reprobeGpu: () => 
Promise<GpuInventory>;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3431:    settings: () => 
Promise<[7mLocalGgufRuntimeSettings[0m>;[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3432:    setSettings: (partial: 
Partial<[7mLocalGgufRuntimeSettings[0m>) [0m[7m[0m=> [0m[7m[0mPromise<LocalGgufRuntimeSettings>;[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3433: [0m[7m [0m[7m [0m[7m [0m[7m[0mbinariesVersion: [0m[7m[0m() [0m[7m[0m=> [0m
[7m[0mPromise<string>;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3434:  };[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3435:  pool: {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3443:  };
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3444:  endpoint: {
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3445:    list: () => 
Promise<[7mRemoteEndpoint[0m[]>;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3446:    add: (config: {[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3447:      name: string;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3448:      baseUrl: string;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3449:      authHeaderKeyRef: string | 
null;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3450:    }) => Promise<[7mRemoteEndpoint[0m>;[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3451: [0m[7m [0m[7m [0m[7m [0m[7m[0mremove: [0m[7m[0m(id: [0m[7m[0mstring) [0m[7m[0m=> [0m
[7m[0mPromise<void>;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3452:    test: (id: string) => Promise<{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3453:      reachable: boolean;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3458:      id: string,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3459:      partial: { name?: string; 
baseUrl?: string; authHeaderKeyRef?: string | null },
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3460:    ) => Promise<[7mRemoteEndpoint[0m>;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3461:  };[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3462:  hf: {[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3463: [0m[7m [0m[7m [0m[7m [0m[7m[0msearch: [0m[7m[0m(query: [0m[7m[0mstring, [0m
[7m[0mfilters: [0m[7m[0mRecord<string, [0m[7m[0munknown>) [0m[7m[0m=> [0m[7m[0mPromise<HfSearchResult[]>;[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3495:    setAdvancedParams: (id, params) 
=>
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3496:      
ipcRenderer.invoke('localGguf.library.setAdvancedParams', id, params),
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3497:    [7mresetAdvanced[0m: [0m[7m[0m(id) [0m[7m[0m=> [0m
[7m[0mipcRenderer.invoke('localGguf.library.resetAdvanced', [0m[7m[0mid),[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3498: [0m[7m [0m[7m [0m[7m [0m[7m[0mlistBySourceType: [0m[7m[0m(sourceType) [0m
[7m[0m=>[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3499: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m
[7m[0mipcRenderer.invoke('localGguf.library.listBySourceType', [0m[7m[0msourceType),[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3500:  },[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3541:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3542:```ts
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3543:// Existing preload code that 
[7mbuild[0ms [0m[7m[0mthe [0m[7m[0mteamXApi [0m[7m[0mobject:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3544:import [0m[7m[0m{ [0m[7m[0mlocalGgufApi [0m[7m[0m} [0m[7m[0mfrom [0m
[7m[0m'./local-gguf-api';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3545:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3546:const teamXApi = {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3695:  `@team-x/local-gguf-runtime` 
package with shared TypeScript contracts
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3696:  (`LocalGgufError` union, 
`LocalModel`, `GpuInventory`, `AdvancedParams`,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3697:  `[7mRemoteEndpoint[0m`, [0m[7m[0m`WatchFolder`, [0m
[7m[0m`LocalGgufRuntimeSettings` [0m[7m[0m—[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3698: [0m[7m [0m[7m[0mall [0m[7m[0min [0m[7m[0m`@team-x/shared-types`). [0m
[7m[0mAdded [0m[7m[0mDrizzle [0m[7m[0mmigration[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3699: [0m[7m [0m[7m[0m`0014_local_gguf` [0m[7m[0mwith [0m[7m[0mfive [0m[7m[0mnew [0m
[7m[0mtables [0m[7m[0m(`local_models`,[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3700: [0m[7m [0m[7m[0m`local_model_advanced_params`, [0m
[7m[0m`local_model_benchmarks`,[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3701:  `[7mlocal_model_endpoints[0m`, [0m
[7m[0m`local_model_watch_folders`), [0m[7m[0mCHECK[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3702: [0m[7m [0m[7m[0mconstraints [0m[7m[0mdisambiguating [0m
[7m[0msource-type/path/endpoint, [0m[7m[0mand [0m[7m[0mindexes[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3703: [0m[7m [0m[7m[0mcovering [0m[7m[0mhot [0m[7m[0mqueries [0m[7m[0m+ [0m[7m[0mFK [0m[7m[0mcascade [0m
[7m[0mpaths. [0m[7m[0mAdded [0m[7m[0mfour [0m[7m[0mdb [0m[7m[0mrepos[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3704: [0m[7m [0m[7m[0m(LocalModelsRepo, [0m
[7m[0mLocalModelAdvancedParamsRepo, [0m[7m[0mLocalModelEndpointsRepo,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3882:## What lands in this PR
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3883:- New package 
`@team-x/local-gguf-runtime` scaffold (index re-exports errors only — future phases extend)
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3884:- `@team-x/shared-types` extended 
with `LocalGgufError` discriminated union (17 variants), `LocalModel`, `GpuInventory`, `AdvancedParams`, 
`BenchmarkResult`, `[7mRemoteEndpoint[0m`, [0m[7m[0m`WatchFolder`, [0m[7m[0m`LocalGgufRuntimeSettings`[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3885:- [0m[7m[0mDrizzle [0m[7m[0mmigration [0m
[7m[0m`0014_local_gguf.sql` [0m[7m[0m— [0m[7m[0m5 [0m[7m[0mtables, [0m[7m[0mCHECK [0m[7m[0mconstraints [0m[7m[0mdisambiguating [0m[7m[0msource-type/path/endpoint, [0m[7m[0mindexes [0m[7m[0mcovering [0m[7m[0mhot [0m
[7m[0mqueries [0m[7m[0m+ [0m[7m[0mFK [0m[7m[0mcascade [0m[7m[0mpaths[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3886:- [0m[7m[0mFour [0m[7m[0mnew [0m[7m[0mdb [0m[7m[0mrepos: [0m
[7m[0m`LocalModelsRepo`, [0m[7m[0m`LocalModelAdvancedParamsRepo`, [0m[7m[0m`LocalModelEndpointsRepo`, [0m[7m[0m`LocalModelWatchFoldersRepo`[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3887:- [0m[7m[0m`LocalGgufSettingsAccessor` [0m[7m[0mfor [0m
[7m[0m`localGguf.*` [0m[7m[0mruntime [0m[7m[0msettings [0m[7m[0mnamespace[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3949:| § 7 table `local_models` | Tasks 
6, 7 |
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3950:| § 7 table 
`local_model_advanced_params` | Tasks 6, 8 |
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3951:| § 7 table `[7mlocal_model_endpoints[0m` [0m
[7m[0m| [0m[7m[0mTasks [0m[7m[0m6, [0m[7m[0m9 [0m[7m[0m|[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3952:| § 7 table 
`local_model_[7mwatch_folders[0m` [0m[7m[0m| [0m[7m[0mTasks [0m[7m[0m6, [0m[7m[0m10 [0m[7m[0m|[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3953:| [0m[7m[0m§ [0m[7m[0m7 [0m[7m[0mtable [0m
[7m[0m`local_model_benchmarks` [0m[7m[0m| [0m[7m[0mTask [0m[7m[0m6 [0m[7m[0m(table [0m[7m[0mcreated); [0m[7m[0mCRUD [0m[7m[0mlands [0m[7m[0min [0m[7m[0mPhase [0m[7m[0m10 [0m[7m[0m|[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3954:| § 7 indexes (4 on `local_models`, 
1 on `benchmarks`, 1 on `[7mwatch_folders[0m`) [0m[7m[0m| [0m[7m[0mTask [0m[7m[0m6 [0m[7m[0m|[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3955:| [0m[7m[0m§ [0m[7m[0m7 [0m[7m[0mCHECK [0m[7m[0mconstraints [0m[7m[0m| [0m[7m[0mTask [0m[7m[0m6 [0m[7m[0m+ [0m
[7m[0mtests [0m[7m[0min [0m[7m[0mTask [0m[7m[0m6 [0m[7m[0m+ [0m[7m[0mTask [0m[7m[0m7 [0m[7m[0m|[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3956:| [0m[7m[0m§ [0m[7m[0m7 [0m[7m[0mruntime [0m[7m[0msettings [0m[7m[0mvia [0m[7m[0mexisting [0m
[7m[0mapp [0m[7m[0mstore [0m[7m[0m(no [0m[7m[0mnew [0m[7m[0mtable) [0m[7m[0m| [0m[7m[0mTask [0m[7m[0m12 [0m[7m[0m|[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3957:| [0m[7m[0m§ [0m[7m[0m8 [0m[7m[0mIPC [0m[7m[0mchannel [0m[7m[0mnamespace [0m
[7m[0mdeclaration [0m[7m[0m| [0m[7m[0mTask [0m[7m[0m13 [0m[7m[0m(stubs) [0m[7m[0m|[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md' -Pattern 'DEFAULT_LOCAL|default settings|llamaBinariesVersion' -Context 2,5" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 5252ms:

  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:514:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:515:describe('LocalGgufRuntimeSettings 
shape', () => {
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:516:  it('accepts a [7mdefault [0m[7msettings [0m
[7m[0mrecord', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:517: [0m[7m [0m[7m [0m[7m [0m[7m[0mconst [0m[7m[0ms: [0m
[7m[0mLocalGgufRuntimeSettings [0m[7m[0m= [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:518:      activeBackend: 'cpu',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:519: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mactiveBackendIsAutoDetected: [0m
[7m[0mtrue,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:520:      autoFallbackReason: null,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:521:      maxConcurrentLocalModels: 1,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:523:      embeddingModelId: null,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:524:      hfTokenKeyRef: null,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:525:      [7mllamaBinariesVersion[0m: 'b4321',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:526:    };[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:527: [0m[7m [0m[7m [0m[7m [0m
[7m[0mexpect(s.maxConcurrentLocalModels).toBe(1);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:528:  });[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:529:});[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:530:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:760:  embeddingModelId: string | null;
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:761:  hfTokenKeyRef: string | null;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:762:  [7mllamaBinariesVersion[0m: string;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:763:}[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:764:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:765:export type LocalGgufError =[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:766: [0m[7m [0m[7m[0m| [0m[7m[0m{ [0m[7m[0mkind: [0m[7m[0m'binary-not-found'; [0m
[7m[0mbackend: [0m[7m[0mGpuBackend; [0m[7m[0mpath: [0m[7m[0mstring [0m[7m[0m}[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:767: [0m[7m [0m[7m[0m| [0m[7m[0m{ [0m[7m[0mkind: [0m[7m[0m'binary-unsupported'; [0m
[7m[0mbackend: [0m[7m[0mGpuBackend; [0m[7m[0mosVersion: [0m[7m[0mstring [0m[7m[0m}[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2790:import {
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2791:  createLocalGgufSettingsAccessor,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2792:  [7mDEFAULT_LOCAL[0m_GGUF_SETTINGS,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2793:  type LocalGgufSettingsAccessor,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2794:  type LocalGgufSettingsStore,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2795:} from './local-gguf-settings';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2796:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2797:function [0m[7m[0minMemoryStore(): [0m
[7m[0mLocalGgufSettingsStore [0m[7m[0m{[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2818:  it('returns defaults when store 
is empty', () => {
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2819:    const s = accessor.get();
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2820:    
expect(s).toEqual([7mDEFAULT_LOCAL[0m_GGUF_SETTINGS);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2821:  });[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2822:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2823: [0m[7m [0m[7m[0mit('returns [0m[7m[0mpersisted [0m[7m[0mvalues [0m
[7m[0moverlaid [0m[7m[0mon [0m[7m[0mdefaults', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2824: [0m[7m [0m[7m [0m[7m [0m
[7m[0mstore.set('localGguf.activeBackend', [0m[7m[0m'cuda');[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2825: [0m[7m [0m[7m [0m[7m [0m
[7m[0mstore.set('localGguf.maxConcurrentLocalModels', [0m[7m[0m3);[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2827:    
expect(s.activeBackend).toBe('cuda');
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2828:    
expect(s.maxConcurrentLocalModels).toBe(3);
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2829:    
expect(s.activeBackendIsAutoDetected).toBe([7mDEFAULT_LOCAL[0m_GGUF_SETTINGS.activeBackendIsAutoDetected);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2830:  });[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2831:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2832: [0m[7m [0m[7m[0mit('updateBackend [0m[7m[0mpersists [0m
[7m[0mactiveBackend [0m[7m[0m+ [0m[7m[0mautoDetected [0m[7m[0mflag [0m[7m[0m+ [0m[7m[0mclears [0m[7m[0mfallback [0m[7m[0mreason', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2833: [0m[7m [0m[7m [0m[7m [0m[7m[0maccessor.updateBackend('cuda', [0m
[7m[0m/*autoDetected*/ [0m[7m[0mtrue);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2834:    const s = accessor.get();[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2874:  });
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2875:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2876:  it('set[7mLlamaBinariesVersion [0m
[7m[0mpersists', [0m[7m[0m() [0m[7m[0m=> [0m[7m[0m{[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2877:    
accessor.set[7mLlamaBinariesVersion[0m('b4321');[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2878:    
expect(accessor.get().[7mllamaBinariesVersion[0m).toBe('b4321');[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2879:  });[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2880:});[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2881:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2882:import { beforeEach } from 'vitest';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2883:```[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2916:  setEmbeddingModelId(id: string | 
null): void;
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2917:  setHfTokenKeyRef(ref: string | 
null): void;
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2918:  set[7mLlamaBinariesVersion[0m(version: [0m
[7m[0mstring): [0m[7m[0mvoid;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2919:}[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2920:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2921:export const 
[7mDEFAULT_LOCAL[0m_GGUF_SETTINGS: [0m[7m[0mLocalGgufRuntimeSettings [0m[7m[0m= [0m[7m[0m{[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2922:  activeBackend: 'cpu',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2923:  activeBackendIsAutoDetected: true,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2924:  autoFallbackReason: null,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2925:  maxConcurrentLocalModels: 1,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2926:  defaultLibraryFolder: null,[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2927:  embeddingModelId: null,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2928:  hfTokenKeyRef: null,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2929:  [7mllamaBinariesVersion[0m: 'unknown',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2930:};[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2931:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2932:const KEYS = {[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2933: [0m[7m [0m[7m[0mactiveBackend: [0m
[7m[0m'localGguf.activeBackend',[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2934: [0m[7m [0m[7m[0mactiveBackendIsAutoDetected: [0m
[7m[0m'localGguf.activeBackendIsAutoDetected',[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2938:  embeddingModelId: 
'localGguf.embeddingModelId',
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2939:  hfTokenKeyRef: 
'localGguf.hfTokenKeyRef',
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2940:  [7mllamaBinariesVersion[0m: [0m
[7m[0m'localGguf.llamaBinariesVersion',[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2941:} as const;[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2942:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2943:export [0m[7m[0mfunction [0m
[7m[0mcreateLocalGgufSettingsAccessor([0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2944:  store: LocalGgufSettingsStore,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2945:): LocalGgufSettingsAccessor {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2948:      return {
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2949:        activeBackend:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2950:          
store.get<GpuBackend>(KEYS.activeBackend) ?? [7mDEFAULT_LOCAL[0m_GGUF_SETTINGS.activeBackend,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2951:        activeBackendIsAutoDetected:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2952:          
store.get<boolean>(KEYS.activeBackendIsAutoDetected) ?? [7mDEFAULT_LOCAL[0m_GGUF_SETTINGS.activeBackendIsAutoDetected,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2953:        autoFallbackReason:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2954:          store.get<string | 
null>(KEYS.autoFallbackReason) ?? [7mDEFAULT_LOCAL[0m_GGUF_SETTINGS.autoFallbackReason,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2955:        maxConcurrentLocalModels:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2956:          
store.get<number>(KEYS.maxConcurrentLocalModels) ?? [7mDEFAULT_LOCAL[0m_GGUF_SETTINGS.maxConcurrentLocalModels,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2957:        defaultLibraryFolder:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2958:          store.get<string | 
null>(KEYS.defaultLibraryFolder) ?? [7mDEFAULT_LOCAL[0m_GGUF_SETTINGS.defaultLibraryFolder,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2959:        embeddingModelId:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2960:          store.get<string | 
null>(KEYS.embeddingModelId) ?? [7mDEFAULT_LOCAL[0m_GGUF_SETTINGS.embeddingModelId,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2961:        hfTokenKeyRef:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2962:          store.get<string | 
null>(KEYS.hfTokenKeyRef) ?? [7mDEFAULT_LOCAL[0m_GGUF_SETTINGS.hfTokenKeyRef,[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2963:        [7mllamaBinariesVersion[0m:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2964:          
store.get<string>(KEYS.[7mllamaBinariesVersion[0m) [0m[7m[0m?? [0m[7m[0mDEFAULT_LOCAL_GGUF_SETTINGS.llamaBinariesVersion,[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2965:      };[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2966:    },[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2967: [0m[7m [0m[7m [0m[7m [0m[7m[0mupdateBackend(backend, [0m
[7m[0mautoDetected) [0m[7m[0m{[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2968: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0mstore.set(KEYS.activeBackend, [0m
[7m[0mbackend);[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2969: [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m
[7m[0mstore.set(KEYS.activeBackendIsAutoDetected, [0m[7m[0mautoDetected);[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2988:      store.set(KEYS.hfTokenKeyRef, 
ref);
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2989:    },
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2990:    
set[7mLlamaBinariesVersion[0m(version) [0m[7m[0m{[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2991:      
store.set(KEYS.[7mllamaBinariesVersion[0m, [0m[7m[0mversion);[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2992:    },[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2993:  };[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2994:}[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2995:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2996:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3014:activeBackend, 
activeBackendIsAutoDetected, autoFallbackReason,
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3015:maxConcurrentLocalModels, 
defaultLibraryFolder, embeddingModelId,
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3016:hfTokenKeyRef, 
[7mllamaBinariesVersion[0m. [0m[7m[0mDefaults [0m[7m[0mdefined [0m[7m[0min[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3017:[7mDEFAULT_LOCAL[0m_GGUF_SETTINGS [0m[7m[0mand [0m
[7m[0moverlay [0m[7m[0many [0m[7m[0mpersisted [0m[7m[0mvalues [0m[7m[0mfrom[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3018:the [0m[7m[0mstore. [0m[7m[0mupdateBackend [0m[7m[0mclears [0m[7m[0mthe [0m
[7m[0mfallback [0m[7m[0mreason; [0m[7m[0mrecordFallback[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3019:captures [0m[7m[0mthe [0m[7m[0mreason [0m[7m[0mand [0m[7m[0mflips [0m
[7m[0mautoDetected [0m[7m[0mto [0m[7m[0mfalse.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3020:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3021:Implements [0m[7m[0mspec [0m[7m[0m§ [0m[7m[0m7 [0m
[7m[0m(runtime-settings) [0m[7m[0m+ [0m[7m[0msupports [0m[7m[0mlater [0m[7m[0mphases'[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3022:backend detection persistence.[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'docs/superpowers/plans/2026-05-27-local-gguf-support/phase-01-foundation.md' -Pattern 'pnpm -r build|typecheck|quality gate|build' -Context 2,3 | Select-Object -First 80" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 3973ms:

  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3:> **For agentic workers:** REQUIRED 
SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute 
this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:4:>
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:5:> **Cross-phase rules:** Re-read 
`docs/superpowers/plans/2026-05-27-local-gguf-support.md` § "Cross-phase rules" before starting. Branch naming, commit 
style, TDD discipline, coverage targets, [7mquality [0m[7mgate[0m, [0m[7m[0mand [0m[7m[0mreview [0m[7m[0mwall [0m[7m[0mare [0m[7m[0mcanonical [0m[7m[0mthere. [0m[7m[0mThis [0m[7m[0mphase [0m[7m[0mplan [0m[7m[0monly [0m
[7m[0mrestates [0m[7m[0mphase-specific [0m[7m[0mitems.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:6:>[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:7:> [0m[7m[0m**Codex [0m[7m[0mStage [0m[7m[0m3 [0m[7m[0mreview:** [0m[7m[0mREQUIRED [0m
[7m[0m(this [0m[7m[0mphase [0m[7m[0mintroduces [0m[7m[0mIPC [0m[7m[0mcontracts [0m[7m[0m+ [0m[7m[0mSQL [0m[7m[0mmigration [0m[7m[0m— [0m[7m[0mboth [0m[7m[0msecurity-sensitive [0m[7m[0mboundaries).[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:8:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:144:  },
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:145:  "scripts": {
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:146:    "[7mbuild[0m": [0m[7m[0m"tsc [0m[7m[0m-p [0m[7m[0mtsconfig.json [0m
[7m[0m--noEmit",[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:147:    "[7mtypecheck[0m": [0m[7m[0m"tsc [0m[7m[0m-p [0m
[7m[0mtsconfig.json [0m[7m[0m--noEmit",[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:148:    "test": "vitest run",[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:149:    "test:watch": "vitest"[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:150:  },[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:277:Expected: install completes, no 
errors. New entry visible in `node_modules/.pnpm/@team-x+local-gguf-runtime@...`.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:278:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:279:- [ ] **Step 4: Verify [7mtypecheck [0m
[7m[0mpicks [0m[7m[0mup [0m[7m[0mthe [0m[7m[0mnew [0m[7m[0mpackage.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:280:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:281:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:282:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:283:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:284:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:285:Expected: [0m[7m[0mzero [0m[7m[0merrors. [0m[7m[0mThe [0m[7m[0mnew [0m
[7m[0mpackage [0m[7m[0mcompiles [0m[7m[0mcleanly [0m[7m[0m(it's [0m[7m[0meffectively [0m[7m[0mempty [0m[7m[0m+ [0m[7m[0mthe [0m[7m[0merrors [0m[7m[0mre-export, [0m[7m[0mwhich [0m[7m[0mdepends [0m[7m[0mon [0m[7m[0mshared-types [0m[7m[0mnot [0m[7m[0myet [0m[7m[0mupdated [0m
[7m[0m— [0m[7m[0mthat [0m[7m[0mcomes [0m[7m[0min [0m[7m[0mTask [0m[7m[0m4. [0m[7m[0mIf [0m[7m[0mthis [0m[7m[0mfails [0m[7m[0mon [0m[7m[0m`Cannot [0m[7m[0mfind [0m[7m[0mmodule [0m[7m[0m'./errors'`, [0m[7m[0mthat's [0m[7m[0mexpected [0m[7m[0m— [0m[7m[0mwe'll [0m[7m[0mfix [0m[7m[0min [0m[7m[0mTask [0m[7m[0m5).[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:292:```
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:293:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:294:Re-run `pnpm [7mtypecheck[0m` [0m[7m[0m— [0m[7m[0mexpected [0m
[7m[0mzero [0m[7m[0merrors.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:295:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:296:- [0m[7m[0m[ [0m[7m[0m] [0m[7m[0m**Step [0m[7m[0m5: [0m[7m[0mCommit [0m[7m[0mworkspace [0m
[7m[0mwiring.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:297:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:629:  // All optional → 
backward-compatible. See docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:630:  // "Shape adjustments to 
GpuInventory". Strict set (load-bearing for backend ranking):
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:631:  computeCap?: string;   // 
nvidia-smi compute_cap, e.g. "5.2" (Maxwell) / "12.0". Gates CUDA-[7mbuild [0m[7m[0mcompatibility [0m[7m[0m(S2 [0m[7m[0mF16, [0m[7m[0mS4 [0m[7m[0mF13).[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:632: [0m[7m [0m[7m[0mgfxTarget?: [0m[7m[0mstring; [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m[7m[0mrocminfo [0m
[7m[0mgfxNNNN, [0m[7m[0me.g. [0m[7m[0m"gfx1100". [0m[7m[0mConfirms [0m[7m[0mHIP [0m[7m[0m--device-targets [0m[7m[0mmatch.[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:633: [0m[7m [0m[7m[0muuid?: [0m[7m[0mstring; [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m
[7m[0mnvidia-smi [0m[7m[0m-L [0m[7m[0mUUID [0m[7m[0m(CUDA) [0m[7m[0m/ [0m[7m[0mdeviceUUID [0m[7m[0m(Vulkan). [0m[7m[0mStable [0m[7m[0mper-device [0m[7m[0mkey; [0m[7m[0mcoalesce [0m[7m[0mby [0m[7m[0mUUID, [0m[7m[0mnot [0m[7m[0mindex [0m[7m[0m(S2 [0m[7m[0mF17).[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:634: [0m[7m [0m[7m[0mcoreCount?: [0m[7m[0mnumber; [0m[7m [0m[7m [0m[7m [0m[7m[0m// [0m[7m[0mApple [0m
[7m[0mSilicon [0m[7m[0mGPU [0m[7m[0mcore [0m[7m[0mcount; [0m[7m[0mdrives [0m[7m[0mn_gpu_layers [0m[7m[0mheuristic [0m[7m[0mon [0m[7m[0mMetal.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:836:Expected: all existing tests pass + 
the new ones.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:837:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:838:- [ ] **Step 7: [7mTypecheck [0m[7m[0mthe [0m[7m[0mwhole [0m
[7m[0mworkspace.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:839:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:840:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:841:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:842:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:843:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:844:Expected: [0m[7m[0mzero [0m[7m[0merrors. [0m[7m[0mIf [0m[7m[0mthe [0m
[7m[0m`@team-x/local-gguf-runtime` [0m[7m[0mpackage [0m[7m[0mcomplains [0m[7m[0mabout [0m[7m[0m`./errors`, [0m[7m[0mthat's [0m[7m[0mstill [0m[7m[0mexpected [0m[7m[0m— [0m[7m[0mTask [0m[7m[0m5 [0m[7m[0mfixes [0m[7m[0mit.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:902:```
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:903:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:904:- [ ] **Step 3: [7mTypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:905:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:906:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:907:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:908:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:909:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:910:Expected: zero errors.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:941:Lets downstream phases import errors 
from
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:942:`@team-x/local-gguf-runtime/errors` 
without crossing shared-types
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:943:directly. Vitest config sets 
passWithNoTests so the package [7mbuild[0ms[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:944:green [0m[7m[0mbefore [0m[7m[0mits [0m[7m[0mreal [0m[7m[0mtest [0m[7m[0msuite [0m
[7m[0marrives [0m[7m[0min [0m[7m[0mPhase [0m[7m[0m2.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:945:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:946:Co-Authored-By: [0m[7m[0mClaude [0m[7m[0mOpus [0m[7m[0m4.7 [0m[7m[0m(1M [0m
[7m[0mcontext) [0m[7m[0m<noreply@anthropic.com>[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1858:Expected: all 10 tests pass.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1859:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1860:- [ ] **Step 6: Run [7mtypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1861:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1862:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1863:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1864:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1865:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:1866:Expected: zero errors.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2145:Expected: all 7 tests pass.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2146:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2147:- [ ] **Step 5: [7mTypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2148:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2149:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2150:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2151:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2152:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2153:Expected: zero errors.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2424:Expected: all 8 tests pass.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2425:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2426:- [ ] **Step 5: [7mTypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2427:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2428:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2429:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2430:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2431:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2432:Expected: zero errors.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2652:Expected: all 6 tests pass.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2653:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2654:- [ ] **Step 5: [7mTypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2655:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2656:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2657:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2658:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2659:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2660:Expected: zero errors.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2729:If the existing pattern uses a 
different shape (e.g. lazy properties, dependency-injected sub-clients), match that pattern instead.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2730:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2731:- [ ] **Step 3: Run [7mtypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2732:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2733:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2734:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2735:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2736:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:2737:Expected: zero errors.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3338:Expected: every channel asserts 
registration + throws-on-invoke.
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3339:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3340:- [ ] **Step 8: [7mTypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3341:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3342:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3343:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3344:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3345:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3346:Expected: zero errors.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3541:
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3542:```ts
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3543:// Existing preload code that 
[7mbuild[0ms [0m[7m[0mthe [0m[7m[0mteamXApi [0m[7m[0mobject:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3544:import [0m[7m[0m{ [0m[7m[0mlocalGgufApi [0m[7m[0m} [0m[7m[0mfrom [0m
[7m[0m'./local-gguf-api';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3545:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3546:const teamXApi = {[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3573:(Match the exact declaration style 
used by the existing file — `interface Window` extension, `declare global { ... }`, etc.)
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3574:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3575:- [ ] **Step 5: [7mTypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3576:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3577:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3578:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3579:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3580:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3581:Expected: [0m[7m[0mzero [0m[7m[0merrors. [0m[7m[0mIf [0m[7m[0merrors [0m
[7m[0mfire [0m[7m[0mbecause [0m[7m[0mthe [0m[7m[0mexisting [0m[7m[0m`Window['teamXApi']` [0m[7m[0mis [0m[7m[0mdeclared [0m[7m[0mas [0m[7m[0ma [0m[7m[0mliteral [0m[7m[0mtype [0m[7m[0mnot [0m[7m[0man [0m[7m[0minterface, [0m[7m[0mrefactor [0m[7m[0mto [0m[7m[0minterface [0m
[7m[0mOR [0m[7m[0muse [0m[7m[0mintersection [0m[7m[0mtypes [0m[7m[0mto [0m[7m[0madd [0m[7m[0m`localGguf` [0m[7m[0mwithout [0m[7m[0mbreaking [0m[7m[0mexisting [0m[7m[0mcode.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3643:```
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3644:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3645:- [ ] **Step 3: [7mTypecheck [0m[7m[0m+ [0m[7m[0mrun [0m[7m[0mall [0m
[7m[0mdesktop [0m[7m[0mtests.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3646:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3647:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3648:pnpm [7mtypecheck [0m[7m[0m&& [0m[7m[0mpnpm [0m[7m[0m-F [0m
[7m[0m@team-x/desktop [0m[7m[0mtest[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3649:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3650:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3651:Expected: all green.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3728:(Use the actual tag from the S1 
writeup, not the placeholder `b4321`.)
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3729:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3730:- [ ] **Step 4: [7mTypecheck [0m[7m[0m(verifies [0m
[7m[0mnothing [0m[7m[0mdepending [0m[7m[0mon [0m[7m[0mpackage.json [0m[7m[0mshape [0m[7m[0mbreaks).**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3731:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3732:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3733:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3734:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3735:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3736:Expected: zero errors.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3755:---
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3756:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3757:### Task 17: Phase 1 [7mQuality [0m[7mGate [0m[7m[0m— [0m
[7m[0mrun [0m[7m[0mthe [0m[7m[0mfull [0m[7m[0mchecklist[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3758:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3759:Before [0m[7m[0mopening [0m[7m[0mthe [0m[7m[0mPR, [0m[7m[0mrun [0m[7m[0mevery [0m
[7m[0mblocking [0m[7m[0mgate [0m[7m[0mfrom [0m[7m[0mmaster-plan [0m[7m[0m§ [0m[7m[0mCR-6 [0m[7m[0mand [0m[7m[0m§ [0m[7m[0mCR-7.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3760:[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3761:- [ ] **Step 1: [7mTypecheck[0m.**[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3762:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3763:```bash[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3764:pnpm [7mtypecheck[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3765:```[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3766:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3767:Expected: [0m[7m[0mzero [0m[7m[0merrors. [0m[7m[0mIf [0m[7m[0many [0m
[7m[0merror: [0m[7m[0mfix [0m[7m[0mbefore [0m[7m[0mproceeding.[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3891:- `CHANGELOG.md` `[Unreleased]` 
entry
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3892:
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3893:## [7mQuality gate[0ms[0m
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3894:- ✅ `pnpm [7mtypecheck[0m` [0m[7m[0m— [0m[7m[0mzero [0m[7m[0merrors; [0m
[7m[0mno [0m[7m[0mnew [0m[7m[0m`any`[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3895:- [0m[7m[0m✅ [0m[7m[0m`pnpm [0m[7m[0mlint` [0m[7m[0m+ [0m[7m[0m`pnpm [0m
[7m[0mlint:eslint` [0m[7m[0m— [0m[7m[0mclean[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3896:- [0m[7m[0m✅ [0m[7m[0m`pnpm [0m[7m[0mtest` [0m[7m[0m— [0m[7m[0m100% [0m[7m[0mpass; [0m[7m[0m≥ [0m[7m[0m90% [0m
[7m[0mline+branch [0m[7m[0mon [0m[7m[0mevery [0m[7m[0mnew [0m[7m[0mmodule[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3897:- [0m[7m[0m✅ [0m[7m[0m`pnpm [0m[7m[0m-F [0m[7m[0m@team-x/desktop [0m
[7m[0mtest:e2e` [0m[7m[0m— [0m[7m[0m100% [0m[7m[0mpass [0m[7m[0m(existing [0m[7m[0mspecs)[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3959:| § 15 `LocalGgufError` union | 
Task 4 |
  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3960:| § 16.1 TDD discipline | applied 
throughout |
> docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3961:| § 16.3 [7mquality gate[0ms | Task 17 |[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3962:[0m
[7m [0m[7m [0m[7m[0mdocs\superpowers\plans\2026-05-27-local-gguf-support\phase-01-foundation.md:3963:Any [0m[7m[0mspec [0m[7m[0mrequirement [0m[7m[0mNOT [0m[7m[0mlisted [0m[7m[0mis [0m
[7m[0mimplemented [0m[7m[0min [0m[7m[0ma [0m[7m[0mlater [0m[7m[0mphase. [0m[7m[0mSee [0m[7m[0mmaster [0m[7m[0mplan [0m[7m[0m§ [0m[7m[0m"Phases [0m[7m[0m1–11 [0m[7m[0m— [0m[7m[0mIndex" [0m[7m[0mfor [0m[7m[0mthe [0m[7m[0mmapping.[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-ChildItem -Recurse -Filter 'vitest.config.*' | Select-Object FullName; if (Test-Path vitest.config.ts) { Get-Content vitest.config.ts -TotalCount 120 } ; if (Test-Path apps/desktop/vitest.config.ts) { Get-Content apps/desktop/vitest.config.ts -TotalCount 120 }" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 7380ms:

[32;1mFullName[0m
[32;1m--------[0m
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\vitest.config.ts
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 2 exits non-zero on empty test suites by default; remove this flag
    // once test files exist in every workspace package.
    passWithNoTests: true,
    globals: false,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // `e2e/**` is excluded because Playwright owns those specs — they
    // import `@playwright/test` and would crash Vitest with a missing
    // global `test` reference. The Playwright runner picks them up via
    // `playwright.config.ts` instead. Both relative and `**/e2e/**`
    // patterns are listed because the workspace projects resolve
    // includes/excludes against their own root, so a single `**`
    // pattern is not enough for both root + workspace scopes.
    exclude: [
      'node_modules',
      'dist',
      'out',
      '.idea',
      '.git',
      '.cache',
      '**/e2e/**',
      'e2e/**',
      'apps/desktop/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/out/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test-utils/**',
      ],
    },
  },
});
/**
 * Per-workspace Vitest config for `apps/desktop`.
 *
 * Why this exists: the root `vitest.workspace.ts` resolves each
 * `apps/*` and `packages/*` directory as an independent Vitest
 * project, and a project's include/exclude globs are evaluated
 * against the project root — NOT the repo root. The root
 * `vitest.config.ts` is consulted for shared coverage/reporters,
 * but its `exclude` does not propagate to a project that has its
 * own `vitest.config.ts`. Without an `e2e/**` exclude scoped to
 * this workspace, Vitest picks up `e2e/smoke.spec.ts` (Playwright
 * owns it) and crashes with `test is not defined` because the file
 * imports `@playwright/test`, not Vitest.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'out', 'e2e/**'],
  },
});


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content vitest.workspace.ts' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 2762ms:
export default ['packages/*', 'apps/*'];

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'docs/superpowers/plans/2026-05-27-local-gguf-support.md' -Pattern 'local_models|watch_folder|folder-entry|source_path|source_type' -Context 3,5 | Select-Object -First 120" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 3241ms:

  docs\superpowers\plans\2026-05-27-local-gguf-support.md:166:
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:167:### CR-10 — Spec-anchored task IDs
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:168:
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:169:Every task references the spec section it implements 
(e.g. *"Implements spec § 7 table `[7mlocal_models[0m`"* [0m[7m[0mor [0m[7m[0m*"Implements [0m[7m[0mspec [0m[7m[0m§ [0m[7m[0m12.1 [0m[7m[0mGPU [0m[7m[0mprobe"*). [0m[7m[0mThis [0m[7m[0mis [0m[7m[0mhow [0m[7m[0mStage [0m[7m[0m2/3 [0m
[7m[0mreviewers [0m[7m[0mverify [0m[7m[0mspec [0m[7m[0mcoverage.[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:170:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:171:---[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:172:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:173:## Global file structure[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:174:[0m
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:438:
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:439:export type GpuBackend = 'cuda' | 'rocm' | 'vulkan' | 
'metal' | 'cpu';
  docs\superpowers\plans\2026-05-27-local-gguf-support.md:440:
> docs\superpowers\plans\2026-05-27-local-gguf-support.md:441:export type SourceType = 'file' | '[7mfolder-entry[0m' [0m[7m[0m| [0m
[7m[0m'remote-endpoint';[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:442:[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:443:export type ModelStatus =[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:444:  | 'cold'[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:445:  | 'loading'[0m
[7m[0m  docs\superpowers\plans\2026-05-27-local-gguf-support.md:446:  | 'loaded'[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'docs/superpowers/plans/2026-05-27-local-gguf-support.md' -Pattern 'CREATE TABLE.*local_models|local_model_watch|endpoint_id|source_path' -Context 2,6 | Select-Object -First 160" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 2586ms:
exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "git -c safe.directory='C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' diff --unified=20 e52e373101fe0d413b423704c1ebd2eecb98afa6 -- package.json packages/local-gguf-runtime/package.json" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 2596ms:
diff --git a/package.json b/package.json
index d5593c4..844192c 100644
--- a/package.json
+++ b/package.json
@@ -1,23 +1,24 @@
 {
   "name": "team-x",
   "version": "3.2.1",
+  "llamaCppRelease": "b9371",
   "private": true,
   "type": "module",
   "description": "Run an AI company. Not a prompt.",
   "license": "MIT",
   "author": "Rocky Elsalaymeh",
   "engines": {
     "node": ">=22.13.0",
     "pnpm": ">=9.0.0"
   },
   "packageManager": "pnpm@9.15.9",
   "scripts": {
     "lint": "biome check .",
     "lint:fix": "biome check --write .",
     "lint:eslint": "pnpm -F @team-x/desktop lint",
     "lint:eslint:fix": "pnpm -F @team-x/desktop lint:fix",
     "format": "biome format --write .",
     "typecheck": "pnpm -r typecheck",
     "test": "vitest run",
     "test:watch": "vitest",
     "test:coverage": "vitest run --coverage",
diff --git a/packages/local-gguf-runtime/package.json b/packages/local-gguf-runtime/package.json
new file mode 100644
index 0000000..1c6c6ec
--- /dev/null
+++ b/packages/local-gguf-runtime/package.json
@@ -0,0 +1,23 @@
+{
+  "name": "@team-x/local-gguf-runtime",
+  "version": "3.2.1",
+  "private": true,
+  "type": "module",
+  "main": "./src/index.ts",
+  "types": "./src/index.ts",
+  "exports": {
+    ".": "./src/index.ts",
+    "./errors": "./src/errors.ts"
+  },
+  "scripts": {
+    "typecheck": "tsc --noEmit",
+    "test": "vitest run"
+  },
+  "dependencies": {
+    "@team-x/shared-types": "workspace:*"
+  },
+  "devDependencies": {
+    "typescript": "5.5.4",
+    "vitest": "^2"
+  }
+}

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm --config.engine-strict=false -F @team-x/local-gguf-runtime test' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 9304ms:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})

> @team-x/local-gguf-runtime@3.2.1 test C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime
> vitest run


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mC:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/packages/local-gguf-runtime[39m

No test files found, exiting with code 0

[2minclude: [22m[33m**/*.{test,spec}.{ts,tsx}[39m
[2mexclude:  [22m[33mnode_modules[2m, [22mdist[2m, [22mout[2m, [22m.idea[2m, [22m.git[2m, [22m.cache[2m, [22m**/e2e/**[2m, [22me2e/**[2m, [22mapps/desktop/e2e/**[39m

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'pnpm --config.engine-strict=false -F @team-x/local-gguf-runtime typecheck' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
2026-05-30T03:04:54.060728Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 9.7 seconds
Output:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})

> @team-x/local-gguf-runtime@3.2.1 typecheck C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime
> tsc --noEmit

error TS5033: Could not write file 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/packages/local-gguf-runtime/tsconfig.tsbuildinfo': EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime\tsconfig.tsbuildinfo'.
src/errors.ts(9,72): error TS2307: Cannot find module '@team-x/shared-types' or its corresponding type declarations.
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @team-x/local-gguf-runtime@3.2.1 typecheck: `tsc --noEmit`
Exit status 2
 WARN   Local package.json exists, but node_modules missing, did you mean to install?

 exited 1 in 9732ms:
.                                        |  WARN  Unsupported engine: wanted: {"node":">=22.13.0"} (current: {"node":"v20.20.2","pnpm":"9.15.9"})

> @team-x/local-gguf-runtime@3.2.1 typecheck C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime
> tsc --noEmit

error TS5033: Could not write file 'C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X/packages/local-gguf-runtime/tsconfig.tsbuildinfo': EPERM: operation not permitted, open 'C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime\tsconfig.tsbuildinfo'.
src/errors.ts(9,72): error TS2307: Cannot find module '@team-x/shared-types' or its corresponding type declarations.
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\packages\local-gguf-runtime:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @team-x/local-gguf-runtime@3.2.1 typecheck: `tsc --noEmit`
Exit status 2
 WARN   Local package.json exists, but node_modules missing, did you mean to install?

exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "git -c safe.directory='C:/Users/User/Desktop/Development Projects/Strategia-Enhanced-App/Team-X' ls-files '*tsbuildinfo'" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 3921ms:
exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Select-String -Path 'node_modules/.pnpm/drizzle-orm@0.33.0*/node_modules/drizzle-orm/sqlite-core/index.d.ts' -Pattern 'check' -Context 0,2" in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 3034ms:

> node_modules\.pnpm\drizzle-orm@0.33.0_@opentelemetry+api@1.9.0_@types+better-sqlite3@7.6.13_@types+react@19.2.14_qbhs
a7tk6a77xt6qtgtx6rpboe\node_modules\drizzle-orm\sqlite-core\index.d.ts:2:export * from "./[7mcheck[0ms.js";[0m
[7m [0m[7m [0m[7m[0mnode_modules\.pnpm\drizzle-orm@0.33.0_@opentelemetry+api@1.9.0_@types+better-sqlite3@7.6.13_@types+react@19.2.14_qbhs[0m
[7m[0ma7tk6a77xt6qtgtx6rpboe\node_modules\drizzle-orm\sqlite-core\index.d.ts:3:export [0m[7m[0m* [0m[7m[0mfrom [0m[7m[0m"./columns/index.js";[0m
[7m [0m[7m [0m[7m[0mnode_modules\.pnpm\drizzle-orm@0.33.0_@opentelemetry+api@1.9.0_@types+better-sqlite3@7.6.13_@types+react@19.2.14_qbhs[0m
[7m[0ma7tk6a77xt6qtgtx6rpboe\node_modules\drizzle-orm\sqlite-core\index.d.ts:4:export [0m[7m[0m* [0m[7m[0mfrom [0m[7m[0m"./db.js";[0m


exec
"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-ChildItem apps/desktop/src/renderer -Recurse -Filter window.d.ts | ForEach-Object { $_.FullName; Get-Content $_.FullName -TotalCount 80 }' in C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X
 succeeded in 2205ms:
C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X\apps\desktop\src\renderer\src\types\window.d.ts
// Global window.teamx declaration for the Team-X renderer.
//
// This file is a pure TypeScript ambient declaration — no runtime
// code — that augments the DOM Window interface with the
// teamx: TeamXApi property the preload bridge exposes via
// contextBridge.exposeInMainWorld('teamx', ...) in
// apps/desktop/src/preload/index.ts.
//
// Placement in src/renderer/src/types/ rather than at the project
// root means:
//   - it is included by the renderer's tsconfig.renderer.json
//     include glob (src/renderer/src), so the augmentation is picked
//     up automatically by every renderer source file without needing
//     an explicit triple-slash reference directive,
//   - the main process and preload tsconfigs do NOT include this
//     file, so main-process code cannot accidentally reach for
//     window.teamx (which would crash because window is undefined
//     in the main Node runtime),
//   - the React components that are about to land in Milestone 5
//     (dashboard cards, chat drawer, hire dialog) get full
//     autocomplete and type info on window.teamx call sites without
//     having to import anything.
//
// The TeamXApi type itself is defined in the shared-types package
// at packages/shared-types/src/ipc.ts and is the single source of
// truth for the bridge surface. Both the preload (preload/api.ts)
// and this declaration reference it, so a change on either side of
// the bridge is caught when the compiler runs.
//
// Note: this header uses line comments rather than a JSDoc block so
// TypeScript's declaration-file JSDoc parser never tries to parse
// identifiers inside the comment body as tags or keywords.

import type { TeamXApi } from '@team-x/shared-types';

declare global {
  interface Window {
    /**
     * Typed bridge to the main process. Populated by the preload
     * script via `contextBridge.exposeInMainWorld('teamx', api)`.
     *
     * Non-optional because every renderer runs with the preload
     * attached — if `window.teamx` were ever missing at runtime,
     * that would indicate a BrowserWindow was created without a
     * preload script, which is a wiring bug we want to surface
     * loudly (as a `TypeError: Cannot read properties of undefined`)
     * rather than silently type-narrowing to `undefined` at every
     * call site.
     */
    teamx: TeamXApi;
  }
}

// An empty export turns this file into an ES module, which is what
// `declare global` requires to merge with the ambient DOM lib types.
// Without this line, TypeScript would treat the whole file as a
// script and refuse the `declare global` block.
export {};

  ✓ Inspect review guidance and skill instructions
  ✓ Read merge-base diff and changed files
  ✓ Verify suspected issues against code context
  → Produce prioritized JSON review
codex
No discrete, actionable correctness issues were found in the diff. The added schema, repos, shared contracts, preload surface, and IPC stubs appear internally consistent with the current Phase 1 foundation scope.
No discrete, actionable correctness issues were found in the diff. The added schema, repos, shared contracts, preload surface, and IPC stubs appear internally consistent with the current Phase 1 foundation scope.
