# Developer Guide

**Extending and integrating with Team-X**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [MCP Server Development](#mcp-server-development)
4. [Custom Employee Roles](#custom-employee-roles)
5. [Workspace API](#workspace-api)
6. [Webhooks](#webhooks)
7. [Plugin Development](#plugin-development)
8. [Testing & Debugging](#testing--debugging)
9. [Best Practices](#best-practices)
10. [Resources](#resources)

---

## Overview

Team-X is designed for extensibility. Developers can:

- **Create MCP servers** to extend agent capabilities
- **Define custom employee roles** with specialized skills
- **Integrate external services** via webhooks and APIs
- **Build plugins** to customize the desktop experience
- **Automate workflows** using the public API

This guide covers each extensibility point with examples and best practices.

---

## Architecture

### Desktop Application

```
┌─────────────────────────────────────────────────────────────────────┐
│  Team-X Desktop Application (Electron + React)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  Frontend UI    │  │  Command Palette│  │  Mission Control│     │
│  │  (React)        │  │  (NLU Engine)   │  │  (Dashboard)    │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
│           │                    │                    │               │
│           └────────────────────┴────────────────────┘               │
│                              │                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  State Management (Zustand)                                 │  │
│  │  - Employees, Tickets, Runtimes, Budgets                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Provider Router                                             │  │
│  │  - Anthropic, OpenAI, Ollama                                │  │
│  │  - Failover, Load Balancing                                  │  │
│  └───────────────────────┬─────────────────────────────────────┘  │
│                          │                                          │
│  ┌───────────────────────┴─────────────────────────────────────┐  │
│  │  Agent Runtime                                              │  │
│  │  - Tool Execution (Read, Write, Bash, etc.)                  │  │
│  │  - MCP Server Integration                                   │  │
│  │  - State Management                                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                                          │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │  Local  │      │  MCP    │      │External │
    │Storage  │      │Servers  │      │Services │
    └─────────┘      └─────────┘      └─────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Desktop Shell** | Electron + React | User interface |
| **State Management** | Zustand | Application state |
| **Command Palette** | Custom NLU | Natural language commands |
| **Provider Router** | TypeScript | AI provider abstraction |
| **Agent Runtime** | TypeScript | Agent execution environment |
| **MCP Protocol** | JSON-RPC | Server extension protocol |

---

## MCP Server Development

**MCP (Model Context Protocol)** servers extend agent capabilities with custom tools, resources, and prompts.

### MCP Server Structure

```
my-mcp-server/
├── package.json
├── src/
│   ├── index.ts          # Server entry point
│   ├── tools/            # Tool implementations
│   │   ├── my-tool.ts
│   │   └── another-tool.ts
│   ├── resources/        # Resource providers
│   │   └── my-resource.ts
│   └── prompts/          # Prompt templates
│       └── my-prompt.ts
├── tsconfig.json
└── README.md
```

### Creating an MCP Server

**Step 1: Initialize project**

```bash
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk
npm install -D typescript @types/node
npx tsc --init
```

**Step 2: Create server entry point**

```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Create server instance
const server = new Server(
  {
    name: 'my-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'my_tool',
        description: 'Description of what this tool does',
        inputSchema: {
          type: 'object',
          properties: {
            param1: {
              type: 'string',
              description: 'Parameter description',
            },
          },
          required: ['param1'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'my_tool') {
    // Tool implementation
    const result = processTool(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('My MCP Server running on stdio');
}

main().catch(console.error);
```

**Step 3: Add tool implementation**

```typescript
// src/tools/my-tool.ts
export interface MyToolInput {
  param1: string;
  param2?: number;
}

export interface MyToolOutput {
  result: string;
  metadata?: Record<string, unknown>;
}

export function processTool(input: MyToolInput): MyToolOutput {
  // Tool logic here
  return {
    result: `Processed: ${input.param1}`,
    metadata: {
      timestamp: Date.now(),
    },
  };
}
```

**Step 4: Build and register**

```bash
# Build
npm run build

# Register with Team-X
# In Team-X: Autonomy → MCP Servers → Add Server
# Point to: /path/to/my-mcp-server/dist/index.js
```

### MCP Server Best Practices

1. **Use stdio transport:** Standard input/output for communication
2. **Log to stderr:** stdout is reserved for protocol messages
3. **Handle errors gracefully:** Return error responses, don't crash
4. **Validate inputs:** Check required parameters before processing
5. **Document tools:** Clear descriptions help agents use tools correctly

### MCP Tools Reference

| Tool Type | Use Case | Example |
|-----------|----------|---------|
| **Data Query** | Read database/query API | SQL queries, API calls |
| **File Operations** | Extended file access | Upload, download, convert |
| **Web Access** | Online research | Web search, API integration |
| **Computation** | Calculations | Data processing, analysis |

---

## Custom Employee Roles

### Role Definition Schema

Employee roles are defined with:

```typescript
interface EmployeeRole {
  name: string;
  category: 'engineering' | 'design' | 'product' | 'marketing' | 'data' | 'operations';
  skills: string[];
  personality: PersonalityProfile;
  workStyle: WorkStyleProfile;
  systemPrompt: string;
}

interface PersonalityProfile {
  communication: 'direct' | 'collaborative' | 'diplomatic';
  approach: 'aggressive' | 'balanced' | 'cautious';
  curiosity: number; // 0-1
  independence: number; // 0-1
}

interface WorkStyleProfile {
  speedPreference: 'fast' | 'balanced' | 'thorough';
  communicationStyle: 'async' | 'sync' | 'flexible';
  documentation: 'minimal' | 'standard' | 'comprehensive';
}
```

### Creating a Custom Role

**Step 1: Define role specification**

```yaml
# custom-roles/devops-engineer.yaml
name: DevOps Engineer
category: engineering

skills:
  - Docker containerization
  - Kubernetes orchestration
  - CI/CD pipelines (GitHub Actions, GitLab CI)
  - Infrastructure as Code (Terraform, CloudFormation)
  - Cloud platforms (AWS, GCP, Azure)
  - Monitoring and logging (Prometheus, Grafana, ELK)
  - Scripting (Bash, Python, Go)

personality:
  communication: direct
  approach: balanced
  curiosity: 0.8
  independence: 0.9

workStyle:
  speedPreference: balanced
  communicationStyle: async
  documentation: comprehensive

systemPrompt: |
  You are a DevOps Engineer with expertise in infrastructure,
  deployment automation, and reliability engineering.

  Your approach:
  - Prioritize reliability and security
  - Automate repetitive tasks
  - Document infrastructure changes
  - Monitor systems proactively
  - Follow infrastructure as code principles

  When working on tickets:
  1. Assess current state and risks
  2. Propose automated solutions
  3. Implement with testing and rollback plans
  4. Document changes and runbooks
  5. Monitor and iterate
```

**Step 2: Register custom role**

```bash
# In Team-X: Settings → Employees → Custom Roles → Import
# Select: custom-roles/devops-engineer.yaml
```

**Step 3: Hire employee with custom role**

```
Command Palette: "Hire a DevOps Engineer named Sarah"
→ Uses custom role specification
→ Sarah joins workspace with DevOps skills
```

---

## Workspace API

Team-X exposes a REST API for workspace automation.

### Authentication

```bash
# API Key in header
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://api.teamflow-x.com/v1/workspace

# Or query parameter
curl https://api.teamflow-x.com/v1/workspace?api_key=YOUR_API_KEY
```

### API Endpoints

#### Workspace

```bash
# Get workspace info
GET /v1/workspace

Response:
{
  "id": "ws_123abc",
  "name": "My Company",
  "monthlyBudget": 300.00,
  "spentThisMonth": 127.50,
  "employeeCount": 8,
  "ticketCount": 42
}

# Update workspace
PATCH /v1/workspace
Body: { "monthlyBudget": 400.00 }
```

#### Employees

```bash
# List employees
GET /v1/employees

# Create employee
POST /v1/employees
Body: {
  "name": "Alex",
  "roleId": "full-stack-engineer",
  "provider": "anthropic"
}

# Get employee
GET /v1/employees/{id}

# Update employee
PATCH /v1/employees/{id}
Body: { "provider": "openai" }

# Delete employee
DELETE /v1/employees/{id}
```

#### Tickets

```bash
# List tickets
GET /v1/tickets?status=open&assignee=alex

# Create ticket
POST /v1/tickets
Body: {
  "title": "Fix login bug",
  "description": "Users unable to login with SAML",
  "assigneeId": "emp_456",
  "priority": "high"
}

# Get ticket
GET /v1/tickets/{id}

# Update ticket
PATCH /v1/tickets/{id}
Body: { "status": "done" }

# Add comment
POST /v1/tickets/{id}/comments
Body: { "content": "Fixed in PR #123" }

# Delete ticket
DELETE /v1/tickets/{id}
```

#### Agent Runs

```bash
# List runs
GET /v1/runs?status=running

# Start run
POST /v1/tickets/{id}/run
Body: { "provider": "anthropic" }

# Get run
GET /v1/runs/{id}

# Cancel run
POST /v1/runs/{id}/cancel

# Get run artifacts
GET /v1/runs/{id}/artifacts
```

### Python SDK Example

```python
import teamflow_x

# Initialize client
client = teamflow_x.Client(api_key="your_api_key")

# Get workspace
workspace = client.workspace.get()
print(f"Budget: ${workspace.monthly_budget}")

# Create ticket
ticket = client.tickets.create(
    title="Add user authentication",
    description="Implement OAuth2 login flow",
    assignee_id="emp_789",
    priority="high"
)
print(f"Created ticket: {ticket.id}")

# Wait for completion
run = client.runs.start(ticket.id)
run.wait_for_completion()

# Get artifacts
artifacts = run.artifacts()
for artifact in artifacts:
    print(f"Artifact: {artifact.name}")
```

---

## Webhooks

Webhooks notify external systems of Team-X events.

### Configuring Webhooks

```bash
# Create webhook
POST /v1/webhooks
Body: {
  "url": "https://your-app.com/teamflow-x/webhook",
  "events": ["ticket.created", "ticket.done", "run.completed"],
  "secret": "webhook_secret_key"
}

Response:
{
  "id": "wh_123",
  "url": "https://your-app.com/teamflow-x/webhook",
  "events": ["ticket.created", "ticket.done", "run.completed"],
  "active": true
}
```

### Webhook Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `ticket.created` | Ticket created | Ticket object |
| `ticket.started` | Agent run started | Run object |
| `ticket.done` | Ticket completed | Ticket + Run objects |
| `run.failed` | Agent run failed | Run + Error |
| `budget.alert` | Budget threshold crossed | Budget info |

### Webhook Payload Example

```json
{
  "event": "ticket.done",
  "timestamp": "2026-05-03T14:32:15Z",
  "workspace_id": "ws_123abc",
  "data": {
    "ticket": {
      "id": "tkt_456",
      "title": "Add user authentication",
      "status": "done",
      "assignee": "Alex"
    },
    "run": {
      "id": "run_789",
      "duration": "2m 34s",
      "cost": 0.87
    }
  }
}
```

### Handling Webhooks

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/teamflow-x/webhook', methods=['POST'])
def handle_webhook():
    # Verify signature
    signature = request.headers.get('X-Teamflow-X-Signature')
    if not verify_signature(request.data, signature):
        return jsonify({'error': 'Invalid signature'}), 401

    # Process event
    payload = request.json
    event = payload['event']

    if event == 'ticket.done':
        ticket = payload['data']['ticket']
        print(f"Ticket {ticket['id']} completed by {ticket['assignee']}")
        # Trigger downstream actions

    return jsonify({'status': 'ok'})

def verify_signature(data, signature):
    import hmac
    import hashlib

    secret = b'webhook_secret_key'
    expected = hmac.new(secret, data, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

---

## Plugin Development

Plugins customize the Team-X desktop application.

### Plugin Structure

```
my-team-x-plugin/
├── package.json
├── src/
│   ├── index.ts          # Plugin entry point
│   ├── components/       # Custom React components
│   │   └── MyPanel.tsx
│   ├── hooks/           # Custom React hooks
│   │   └── useMyHook.ts
│   └── theme.ts         # Custom theme overrides
├── manifest.json         # Plugin metadata
└── README.md
```

### Plugin Manifest

```json
{
  "name": "my-team-x-plugin",
  "version": "1.0.0",
  "displayName": "My Plugin",
  "description": "Customizes Team-X with additional features",
  "author": "Your Name",
  "permissions": [
    "workspace:read",
    "tickets:read",
    "tickets:write"
  ],
  "entry": "dist/index.js",
  "minimumTeamXVersion": "1.0.0"
}
```

### Plugin Entry Point

```typescript
// src/index.ts
import { PluginContext } from '@teamflow-x/plugin-api';

export function activate(context: PluginContext) {
  // Register custom panel
  context.panels.register({
    id: 'my-panel',
    title: 'My Panel',
    component: () => import('./components/MyPanel'),
    icon: 'my-icon',
  });

  // Register command
  context.commands.register({
    id: 'my-command',
    title: 'Run My Command',
    handler: async () => {
      const tickets = await context.api.tickets.list();
      context.notifications.show(`Found ${tickets.length} tickets`);
    },
  });

  // Register theme
  context.theme.register({
    colors: {
      primary: '#FF5722',
      secondary: '#FF9800',
    },
  });
}

export function deactivate() {
  // Cleanup
}
```

### Building Plugins

```bash
# Install CLI
npm install -g @teamflow-x/plugin-cli

# Build
team-x-plugin build

# Package
team-x-plugin package

# Output: my-team-x-plugin.tgz
```

### Installing Plugins

```bash
# In Team-X: Settings → Plugins → Install
# Select: my-team-x-plugin.tgz
# Or: Install from registry (URL)
```

---

## Testing & Debugging

### Testing MCP Servers

```typescript
// test/mcp-server.test.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMCPServer() {
  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  const transport = new StdioServerTransport({
    command: 'node',
    args: ['dist/index.js'],
  });

  await client.connect(transport);

  // List tools
  const tools = await client.listTools();
  console.log('Available tools:', tools.tools);

  // Call tool
  const result = await client.callTool({
    name: 'my_tool',
    arguments: { param1: 'test' },
  });
  console.log('Tool result:', result);
}

testMCPServer().catch(console.error);
```

### Testing Webhooks

```bash
# Use ngrok for local testing
ngrok http 3000

# Configure webhook with ngrok URL
POST /v1/webhooks
Body: {
  "url": "https://abc123.ngrok.io/webhook",
  "events": ["ticket.done"]
}

# Trigger test event
# Webhook payload sent to ngrok URL
```

### Debugging Plugins

```typescript
// Use React DevTools
// In plugin: src/index.ts
export function activate(context: PluginContext) {
  if (process.env.DEBUG) {
    context.devtools.enable();
  }

  // Log plugin lifecycle
  console.log('[MyPlugin] Activated');
}
```

---

## Best Practices

### MCP Server Development

1. **Keep tools focused:** One tool = one responsibility
2. **Use error responses:** Don't crash on invalid input
3. **Document clearly:** Agents need context to use tools
4. **Handle concurrency:** Multiple agents may call simultaneously
5. **Version your API:** Breaking changes require major version bumps

### Custom Roles

1. **Be specific:** Narrow skills = better performance
2. **Set realistic expectations:** Don't claim expertise the model lacks
3. **Test thoroughly:** Hire employee and run test tickets
4. **Iterate:** Refine prompts based on actual performance

### API Usage

1. **Respect rate limits:** Implement exponential backoff
2. **Cache responses:** Reduce redundant API calls
3. **Use webhooks:** Don't poll for status updates
4. **Handle errors:** Network failures, service unavailable

### Webhook Handling

1. **Verify signatures:** Prevent request forgery
2. **Respond quickly:** Return 200 within 5 seconds
3. **Retry failures:** Implement retry logic with backoff
4. **Log events:** Audit trail for troubleshooting

---

## Resources

### Documentation

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Plugin API Reference](./plugin-api.md)
- [REST API Reference](./rest-api.md)

### SDKs & Libraries

| Language | SDK | Repository |
|----------|-----|------------|
| Python | `teamflow-x` | github.com/teamflow-x/python-sdk |
| JavaScript | `@teamflow-x/sdk` | github.com/teamflow-x/js-sdk |
| Go | `github.com/teamflow-x/go-sdk` | github.com/teamflow-x/go-sdk |
| Rust | `teamflow-x-rs` | github.com/teamflow-x/rust-sdk |

### Community

- **Discord:** [discord.gg/teamflow-x](https://discord.gg/teamflow-x)
- **GitHub:** [github.com/teamflow-x](https://github.com/teamflow-x)
- **Stack Overflow:** Tag questions with `teamflow-x`

### Support

- **Email:** developers@teamflow-x.com
- **Documentation Issues:** [github.com/teamflow-x/docs/issues](https://github.com/teamflow-x/docs/issues)
- **Bug Reports:** [github.com/teamflow-x/core/issues](https://github.com/teamflow-x/core/issues)

---

*Last updated: 2026-05-03*
