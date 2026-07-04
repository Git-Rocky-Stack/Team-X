# Skills & MCP Components - UX Analysis & Improvement Plan

## Current State Analysis

### Skills Component Problems

**1. No Pre-Loaded Useful Skills**
- ❌ Zero built-in skills available by default
- ❌ Users must manually install every single skill
- ❌ Requires technical knowledge (local paths, GitHub URLs)
- ❌ No "instant value" when opening Team-X

**2. Cumbersome Installation Process**
- ❌ Two separate modes: local folder vs public URL
- ❌ Local folder requires browsing filesystem or typing exact paths
- ❌ GitHub URLs require exact repository/tree/blob URLs
- ❌ No validation until after submission
- ❌ Error messages are technical and unclear

**3. Complex Permission Management**
- ❌ Workspace defaults + employee overrides matrix
- ❌ Each skill shows per-employee dropdowns (inherit/enabled/disabled)
- ❌ Authority matrix with capabilities, paths, grants
- ❌ Autonomy policy modes (balanced/conservative/autonomous)
- ❌ Technical visibility into "capabilities" and "paths"

**4. Poor Discovery & Visibility**
- ❌ No way to browse available skills
- ❌ No marketplace or discovery mechanism
- ❌ No descriptions of what skills actually do
- ❌ No preview of tools each skill provides
- ❌ No categorization or recommendations

### MCP Component Problems

**1. Empty Template System**
- ❌ Template selector shows "No templates available"
- ❌ No pre-configured common MCP servers
- ❌ Manual entry is the only real option

**2. Complex Technical Configuration**
- ❌ Requires knowledge of stdio vs SSE transports
- ❌ Manual command/args/env configuration
- ❌ JSON editing for environment variables
- ❌ Technical error messages
- ❌ Connection testing is hidden and manual

**3. No Built-in MCP Servers**
- ❌ No filesystem MCP (most common use case)
- ❌ No search/integration MCPs
- ❌ No database connection MCPs
- ❌ No web scraping/API MCPs
- ❌ No pre-configured popular MCP servers

**4. Poor User Experience**
- ❌ Dense technical interface
- ❌ No explanations of what MCP is or why useful
- ❌ No way to discover available MCP servers
- ❌ No testing/validation until after full configuration
- ❌ Tool count shown but no tool names/descriptions

---

## Vision: User-Friendly Skills & MCP Experience

### Goals

1. **Instant Value**: Users see useful, pre-configured skills immediately
2. **Easy Discovery**: Browse, search, and preview skills/MCPs before installing
3. **Simple Management**: One-click enable/disable, clear explanations
4. **Smart Defaults**: Safe, useful configurations that work out of the box
5. **Progressive Disclosure**: Advanced options hidden unless needed

### Target User Experience

**New User Opens Team-X:**
1. ✅ Sees 10-20 pre-loaded common skills (web search, file operations, data analysis, etc.)
2. ✅ Sees 5-10 pre-loaded MCP servers (filesystem, common integrations)
3. ✅ One click to enable any skill/MCP
4. ✅ Clear descriptions of what each does
5. ✅ Can immediately ask agents to use these capabilities

**Advanced User:**
1. ✅ Browse skill marketplace with categories and ratings
2. ✅ Preview tools each skill provides before installing
3. ✅ Install custom skills with one click from URLs
4. ✅ Configure advanced options if needed
5. ✅ Monitor usage and performance

---

## Implementation Plan

### Phase 1: Built-in Skills Library (2-3 hours)

**1. Create Pre-Installed Skills Package**

Define 15-20 essential skills that ship with Team-X:

```typescript
// built-in-skills.ts
const BUILT_IN_SKILLS = [
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web and retrieve current information',
    category: 'research',
    icon: 'globe',
    tools: ['search_web', 'fetch_url', 'summarize_page'],
    capabilities: ['network'],
    enabledByDefault: true,
  },
  {
    id: 'file-operations',
    name: 'File Operations',
    description: 'Read, write, search, and manipulate files',
    category: 'files',
    icon: 'file-text',
    tools: ['read_file', 'write_file', 'search_files', 'list_directory'],
    capabilities: ['filesystem.read', 'filesystem.write'],
    enabledByDefault: true,
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Analyze CSV/JSON data and generate insights',
    category: 'data',
    icon: 'bar-chart',
    tools: ['analyze_csv', 'query_json', 'generate_chart'],
    capabilities: ['filesystem.read'],
    enabledByDefault: false,
  },
  {
    id: 'code-execution',
    name: 'Code Execution',
    description: 'Execute Python/JavaScript code safely',
    category: 'development',
    icon: 'code',
    tools: ['execute_python', 'execute_javascript'],
    capabilities: ['process.spawn'],
    enabledByDefault: false,
  },
  {
    id: 'email-helper',
    name: 'Email Helper',
    description: 'Draft, format, and manage email communications',
    category: 'communication',
    icon: 'mail',
    tools: ['draft_email', 'format_email', 'validate_email'],
    capabilities: [],
    enabledByDefault: true,
  },
  {
    id: 'scheduling',
    name: 'Scheduling & Calendar',
    description: 'Manage events, deadlines, and time coordination',
    category: 'productivity',
    icon: 'calendar',
    tools: ['create_event', 'check_availability', 'send_reminder'],
    capabilities: [],
    enabledByDefault: true,
  },
  {
    id: 'task-management',
    name: 'Task Management',
    description: 'Create, organize, and track tasks and projects',
    category: 'productivity',
    icon: 'check-square',
    tools: ['create_task', 'update_task', 'list_tasks', 'assign_task'],
    capabilities: [],
    enabledByDefault: true,
  },
  // ... 8-10 more skills
];
```

**2. New Skills UI Components**

Replace the dense current UI with:

```typescript
// skills-marketplace.tsx
export function SkillsMarketplace() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {BUILT_IN_SKILLS.map(skill => (
        <SkillCard 
          key={skill.id}
          skill={skill}
          isInstalled={installedSkills.has(skill.id)}
          isEnabled={enabledSkills.has(skill.id)}
          onToggle={() => toggleSkill(skill.id)}
          onExpand={() => showSkillDetails(skill.id)}
        />
      ))}
      
      <InstallCustomSkillCard />
    </div>
  );
}

function SkillCard({ skill, isInstalled, isEnabled, onToggle, onExpand }) {
  return (
    <Card className={cn(
      "transition-all hover:shadow-md cursor-pointer",
      isEnabled && "border-green-500/50 bg-green-50/5"
    )}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon name={skill.icon} className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{skill.name}</CardTitle>
              <CardDescription>{skill.description}</CardDescription>
            </div>
          </div>
          <Switch 
            checked={isEnabled}
            onCheckedChange={onToggle}
            disabled={!isInstalled}
          />
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="outline">{skill.category}</Badge>
          {skill.capabilities.map(cap => (
            <Badge key={cap} variant="secondary">{cap}</Badge>
          ))}
        </div>
        
        <Collapsible>
          <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground">
            View {skill.tools.length} tools →
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-1">
              {skill.tools.map(tool => (
                <li key={tool} className="text-xs text-muted-foreground">
                  • {tool}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
```

**3. Simplified Installation Flow**

```typescript
// install-custom-skill-dialog.tsx
export function InstallCustomSkillDialog() {
  const [url, setUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [preview, setPreview] = useState<SkillPreview | null>(null);
  
  // Auto-validate and preview on paste
  async function handleUrlChange(pastedUrl: string) {
    setUrl(pastedUrl);
    setIsValidating(true);
    
    try {
      const preview = await validateSkillUrl(pastedUrl);
      setPreview(preview);
    } catch {
      setPreview(null);
    } finally {
      setIsValidating(false);
    }
  }
  
  return (
    <Dialog>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Install Custom Skill</DialogTitle>
          <DialogDescription>
            Paste a GitHub URL or direct link to install a custom skill
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <Input 
            placeholder="https://github.com/username/team-x-skills/tree/main/my-skill"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
          />
          
          {isValidating && <Loader2 className="animate-spin" />}
          
          {preview && (
            <SkillPreviewCard 
              name={preview.name}
              description={preview.description}
              tools={preview.tools}
              capabilities={preview.capabilities}
              onInstall={() => installSkill(url)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Phase 2: MCP Server Marketplace (1-2 hours)

**1. Pre-Configured MCP Templates**

```typescript
// built-in-mcp-templates.ts
const BUILT_IN_MCP_TEMPLATES = [
  {
    id: 'filesystem-local',
    name: 'Filesystem (Local)',
    description: 'Access local files and directories with safety limits',
    category: 'files',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\AllowedPath'],
    enabledByDefault: true,
    autoConfigure: true, // Detects OS and sets safe default path
  },
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web using Brave Search API',
    category: 'network',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' }, // User provides key
    enabledByDefault: false,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL Database',
    description: 'Query PostgreSQL databases safely',
    category: 'database',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://...'],
    enabledByDefault: false,
  },
  {
    id: 'git',
    name: 'Git Operations',
    description: 'Read git repositories and perform operations',
    category: 'development',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    enabledByDefault: true,
  },
  {
    id: 'memory',
    name: 'Persistent Memory',
    description: 'Remember information across sessions',
    category: 'utility',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    enabledByDefault: true,
  },
];
```

**2. MCP Marketplace UI**

```typescript
// mcp-marketplace.tsx
export function McpMarketplace() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BUILT_IN_MCP_TEMPLATES.map(mcp => (
          <McpTemplateCard
            key={mcp.id}
            template={mcp}
            isInstalled={installedMcps.has(mcp.id)}
            onInstall={() => installMcp(mcp)}
            onConfigure={() => configureMcp(mcp)}
          />
        ))}
      </div>
      
      <ManualMcpInstall />
    </div>
  );
}

function McpTemplateCard({ template, isInstalled, onInstall, onConfigure }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{template.name}</CardTitle>
            <CardDescription>{template.description}</CardDescription>
          </div>
          {isInstalled ? (
            <Button variant="outline" onClick={onConfigure}>
              Configure
            </Button>
          ) : (
            <Button onClick={onInstall}>
              Install
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="outline">{template.category}</Badge>
          <Badge variant="secondary">{template.transport}</Badge>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Requires: {template.capabilities.join(', ')}
        </p>
      </CardContent>
    </Card>
  );
}
```

### Phase 3: Simplified Permissions (1 hour)

**1. Safety-First Default Permissions**

```typescript
// Simplified permission model
const PERMISSION_PRESETS = {
  safe: {
    // Read-only, no process spawn, no network
    allowedCapabilities: ['filesystem.read'],
    deniedCapabilities: ['filesystem.write', 'process.spawn', 'network'],
    allowedPaths: [], // No file access by default
  },
  standard: {
    // Read + write in user directory
    allowedCapabilities: ['filesystem.read', 'filesystem.write'],
    deniedCapabilities: ['process.spawn', 'network'],
    allowedPaths: [
      os.homedir(),
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Desktop'),
    ],
  },
  advanced: {
    // Most capabilities, controlled paths
    allowedCapabilities: ['filesystem.read', 'filesystem.write', 'network'],
    deniedCapabilities: ['process.spawn'],
    allowedPaths: [], // User specifies
  },
};
```

**2. One-Click Permission Management**

```typescript
// simplified-permissions.tsx
export function SimplifiedPermissions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skill Permissions</CardTitle>
        <CardDescription>
          Choose how much access agents have to your system
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <RadioGroup value={permissionLevel} onValueChange={setPermissionLevel}>
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <RadioGroupItem value="safe" />
            <div>
              <div className="font-medium">Safe Mode</div>
              <div className="text-xs text-muted-foreground">
                Read-only access, no external connections
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <RadioGroupItem value="standard" />
            <div>
              <div className="font-medium">Standard (Recommended)</div>
              <div className="text-xs text-muted-foreground">
                Read/write files in Documents/Desktop, no internet
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <RadioGroupItem value="advanced" />
            <div>
              <div className="font-medium">Advanced</div>
              <div className="text-xs text-muted-foreground">
                More access, you choose specific paths and capabilities
              </div>
            </div>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
```

### Phase 4: Smart Features (1-2 hours)

**1. Auto-Detection & Suggestions**

```typescript
// skill-suggestions.tsx
export function SkillSuggestions() {
  const detectedNeeds = useDetectSkillNeeds();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommended for You</CardTitle>
      </CardHeader>
      
      <CardContent>
        {detectedNeeds.map(need => (
          <div key={need.skillId} className="flex items-center justify-between p-3 border rounded">
            <div>
              <div className="font-medium">{need.reason}</div>
              <div className="text-xs text-muted-foreground">
                Enable {need.skillName} to {need.action}
              </div>
            </div>
            <Button size="sm" onClick={() => enableSkill(need.skillId)}>
              Enable
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Example detections:
// - User mentions "Excel" → suggest Data Analysis skill
// - User mentions "schedule" or "calendar" → suggest Scheduling skill  
// - User mentions "email" → suggest Email Helper skill
// - User has code files → suggest Code Execution skill
```

**2. Usage Analytics & Recommendations**

```typescript
// skill-usage-analytics.tsx
export function SkillUsageAnalytics() {
  const usage = useSkillUsageStats();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skill Usage</CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          {usage.mostUsed.map(skill => (
            <div key={skill.id} className="flex items-center justify-between">
              <div>{skill.name}</div>
              <div className="text-sm text-muted-foreground">
                {skill.calls} calls, {skill.successRate}% success
              </div>
            </div>
          ))}
          
          {usage.suggestedSkills.map(skill => (
            <div key={skill.id} className="flex items-center justify-between p-2 bg-muted rounded">
              <div>
                <div className="font-medium">{skill.name}</div>
                <div className="text-xs text-muted-foreground">
                  Similar users found this helpful
                </div>
              </div>
              <Button size="sm" onClick={() => installSkill(skill.id)}>
                Try
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Implementation Priority

### Phase 1: Quick Wins (2-3 hours) ✅ DO THIS FIRST
1. Add 10-15 built-in common skills
2. Replace dense UI with card-based marketplace
3. Add skill descriptions and tool previews
4. One-click enable/disable

### Phase 2: MCP Foundation (1-2 hours)
1. Pre-configure 5-8 common MCP templates
2. MCP marketplace UI
3. Auto-configuration for filesystem MCP

### Phase 3: Simplified Permissions (1 hour)
1. Safety-first default presets
2. Remove complex matrix for 90% of users
3. Advanced options hidden behind toggle

### Phase 4: Smart Features (1-2 hours)
1. Skill suggestions based on user context
2. Usage analytics and recommendations
3. Auto-detection of user needs

---

## Success Metrics

### User Experience
- ✅ New users see 20+ useful capabilities within 30 seconds
- ✅ Installation time: <10 seconds (vs current 2-5 minutes)
- ✅ Support tickets reduced by 80%
- ✅ Agent success rate increased by 50%

### Technical
- ✅ Zero unsafe operations by default
- ✅ Clear capability boundaries
- ✅ Easy troubleshooting (clear error messages)
- ✅ Backward compatible with advanced use cases

---

## Conclusion

**Current State**: Technical, empty, complex, requires manual installation
**Target State**: User-friendly, pre-loaded, simple, instant value

**Key Insight**: Users want agents that can *do things*, not frameworks they need to configure. Pre-load common capabilities, hide complexity behind smart defaults, provide progressive disclosure for advanced users.

**Estimated Time**: 5-8 hours for complete transformation
**Impact**: Transforms Team-X from "empty framework" to "powerful AI assistant platform"