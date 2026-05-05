/**
 * Prompt Versioning System
 *
 * Manages prompt templates with version control, A/B testing, and deployment automation.
 * Enables safe prompt iteration with rollback capabilities.
 *
 * Phase 5 — M29 (Priority 2 enhancement).
 */

/**
 * Few-shot example for prompting.
 */
export interface FewShotExample {
  /** Unique identifier */
  id: string;

  /** Input/context for the example */
  input: string;

  /** Expected output */
  output: string;

  /** Metadata about the example */
  metadata?: {
    source?: string;
    domain?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    tags?: string[];
  };
}

/**
 * Prompt template definition.
 */
export interface PromptTemplate {
  /** Unique identifier */
  id: string;

  /** Version (semver) */
  version: string;

  /** Template name */
  name: string;

  /** Template description */
  description: string;

  /** Template content with {{variable}} placeholders */
  template: string;

  /** Variables that must be provided */
  variables: string[];

  /** System role/prefix */
  systemPrefix?: string;

  /** Few-shot examples */
  fewShots?: FewShotExample[];

  /** Template metadata */
  metadata: {
    createdAt: number;
    author?: string;
    changelog: PromptChange[];
    tags?: string[];
    category?: string;
    status: 'draft' | 'testing' | 'production' | 'deprecated';
  };
}

/**
 * Single change in template history.
 */
export interface PromptChange {
  /** Change version */
  version: string;

  /** Change description */
  description: string;

  /** Author of change */
  author: string;

  /** Timestamp of change */
  timestamp: number;

  /** Diff of template changes (simplified) */
  diff?: string;
}

/**
 * Rendered prompt with all variables substituted.
 */
export interface RenderedPrompt {
  /** Template ID and version */
  id: string;
  version: string;

  /** Rendered prompt text */
  text: string;

  /** Variables used for rendering */
  variables: Record<string, unknown>;

  /** Render timestamp */
  renderedAt: number;
}

/**
 * A/B test configuration for prompts.
 */
export interface PromptABTest {
  /** Test identifier */
  testId: string;

  /** Start timestamp */
  startedAt: number;

  /** End timestamp (null if ongoing) */
  endedAt?: number;

  /** Templates being tested (ID -> percentage allocation) */
  allocations: Map<string, number>;

  /** Metrics collected */
  metrics: {
    totalUsage: number;
    templateMetrics: Map<string, { usage: number; avgScore?: number }>;
  };
}

/**
 * Prompt registry with versioning.
 */
export class PromptRegistry {
  private templates = new Map<string, PromptTemplate[]>();
  private activeVersions = new Map<string, string>(); // id -> version
  private abTests = new Map<string, PromptABTest>();

  /**
   * Register a prompt template.
   */
  register(template: PromptTemplate): void {
    const existing = this.templates.get(template.id) || [];

    // Check if version already exists
    if (existing.some((t) => t.version === template.version)) {
      throw new Error(`Template ${template.id} version ${template.version} already exists`);
    }

    existing.push(template);
    this.templates.set(template.id, existing);

    // Set as active if it's the first version
    if (!this.activeVersions.has(template.id)) {
      this.activeVersions.set(template.id, template.version);
    }
  }

  /**
   * Get a specific template version.
   */
  get(id: string, version?: string): PromptTemplate | null {
    const templates = this.templates.get(id);
    if (!templates) return null;

    const targetVersion = version ?? this.activeVersions.get(id);
    if (!targetVersion) return null;

    return templates.find((t) => t.version === targetVersion) || null;
  }

  /**
   * Get the active (latest) version of a template.
   */
  getActive(id: string): PromptTemplate | null {
    const version = this.activeVersions.get(id);
    return this.get(id, version);
  }

  /**
   * List all versions of a template.
   */
  listVersions(id: string): PromptTemplate[] {
    return [...(this.templates.get(id) || [])].sort((a, b) => b.version.localeCompare(a.version));
  }

  /**
   * List all templates.
   */
  listTemplates(): Array<{ id: string; name: string; versions: number; activeVersion: string }> {
    const result: Array<{
      id: string;
      name: string;
      versions: number;
      activeVersion: string;
    }> = [];

    for (const [id, templates] of this.templates) {
      const active = this.activeVersions.get(id) || '';
      const template = templates.find((t) => t.version === active);
      result.push({
        id,
        name: template?.name || id,
        versions: templates.length,
        activeVersion: active,
      });
    }

    return result.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Deploy a template as the active version.
   */
  deploy(id: string, version: string): void {
    const template = this.get(id, version);
    if (!template) {
      throw new Error(`Template ${id} version ${version} not found`);
    }

    this.activeVersions.set(id, version);
  }

  /**
   * Rollback to a previous version.
   */
  rollback(id: string, toVersion: string): void {
    const versions = this.listVersions(id);
    const targetIndex = versions.findIndex((t) => t.version === toVersion);

    if (targetIndex < 0) {
      throw new Error(`Version ${toVersion} not found for template ${id}`);
    }

    this.deploy(id, toVersion);
  }

  /**
   * Start an A/B test between templates.
   */
  startABTest(config: {
    testId: string;
    templateIds: string[];
    allocations: Map<string, number>; // Must sum to 1.0
  }): void {
    const totalAllocation = Array.from(config.allocations.values()).reduce((a, b) => a + b, 0);

    if (Math.abs(totalAllocation - 1.0) > 0.01) {
      throw new Error(`Allocations must sum to 1.0, got ${totalAllocation}`);
    }

    this.abTests.set(config.testId, {
      testId: config.testId,
      startedAt: Date.now(),
      allocations: config.allocations,
      metrics: {
        totalUsage: 0,
        templateMetrics: new Map(),
      },
    });
  }

  /**
   * Record usage in an A/B test.
   */
  recordABUsage(testId: string, templateId: string, score?: number): void {
    const test = this.abTests.get(testId);
    if (!test) return;

    test.metrics.totalUsage++;
    const metrics = test.metrics.templateMetrics.get(templateId) || {
      usage: 0,
      avgScore: 0,
    };
    metrics.usage++;

    if (score !== undefined) {
      const currentAvg = metrics.avgScore || 0;
      metrics.avgScore = (currentAvg * (metrics.usage - 1) + score) / metrics.usage;
    }

    test.metrics.templateMetrics.set(templateId, metrics);
  }

  /**
   * Select a template for A/B testing.
   */
  selectForABTest(testId: string): PromptTemplate | null {
    const test = this.abTests.get(testId);
    if (!test) return null;

    const rand = Math.random();
    let cumulative = 0;

    for (const [templateId, allocation] of test.allocations) {
      cumulative += allocation;
      if (rand < cumulative) {
        return this.getActive(templateId);
      }
    }

    return null;
  }

  /**
   * End an A/B test and get results.
   */
  endABTest(testId: string): {
    winner?: string;
    metrics: PromptABTest['metrics'];
  } | null {
    const test = this.abTests.get(testId);
    if (!test) return null;

    test.endedAt = Date.now();

    // Determine winner based on metrics
    let bestTemplate: string | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const [templateId, metrics] of test.metrics.templateMetrics) {
      if (metrics.avgScore && metrics.avgScore > bestScore) {
        bestScore = metrics.avgScore;
        bestTemplate = templateId;
      }
    }

    return {
      winner: bestTemplate || undefined,
      metrics: test.metrics,
    };
  }

  /**
   * Render a template with variables.
   */
  render(id: string, variables: Record<string, unknown>, version?: string): RenderedPrompt {
    const template = this.get(id, version);
    if (!template) {
      throw new Error(`Template ${id} version ${version || 'active'} not found`);
    }

    // Validate all required variables are provided
    const missing = template.variables.filter((v) => !(v in variables));
    if (missing.length > 0) {
      throw new Error(`Missing required variables: ${missing.join(', ')}`);
    }

    // Substitute variables in template
    let text = template.template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      text = text.replace(new RegExp(placeholder, 'g'), String(value));
    }

    // Add few-shot examples if present
    if (template.fewShots && template.fewShots.length > 0) {
      const examples = template.fewShots
        .map((ex, i) => `Example ${i + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}`)
        .join('\n\n');
      text = `${examples}\n\n${text}`;
    }

    // Add system prefix if present
    if (template.systemPrefix) {
      text = `${template.systemPrefix}\n\n${text}`;
    }

    return {
      id: template.id,
      version: template.version,
      text,
      variables,
      renderedAt: Date.now(),
    };
  }

  /**
   * Export template to JSON for backup/sharing.
   */
  exportTemplate(id: string, version?: string): string {
    const template = this.get(id, version);
    if (!template) {
      throw new Error(`Template ${id} version ${version || 'active'} not found`);
    }
    return JSON.stringify(template, null, 2);
  }

  /**
   * Import template from JSON.
   */
  importTemplate(json: string): PromptTemplate {
    const template = JSON.parse(json) as PromptTemplate;

    // Validate required fields
    if (!template.id || !template.version || !template.template) {
      throw new Error('Invalid template: missing id, version, or template');
    }

    this.register(template);
    return template;
  }

  /**
   * Compare two template versions.
   */
  compareVersions(
    id: string,
    version1: string,
    version2: string,
  ): {
    template1: PromptTemplate;
    template2: PromptTemplate;
    changes: string[];
  } | null {
    const t1 = this.get(id, version1);
    const t2 = this.get(id, version2);

    if (!t1 || !t2) return null;

    const changes: string[] = [];

    // Check for variable changes
    const vars1 = new Set(t1.variables);
    const vars2 = new Set(t2.variables);
    for (const v of vars1) if (!vars2.has(v)) changes.push(`Removed variable: ${v}`);
    for (const v of vars2) if (!vars1.has(v)) changes.push(`Added variable: ${v}`);

    // Check for template changes
    if (t1.template !== t2.template) {
      changes.push('Template content changed');
    }

    // Check for few-shot changes
    if (t1.fewShots?.length !== t2.fewShots?.length) {
      changes.push(
        `Few-shot examples count changed: ${t1.fewShots?.length || 0} → ${t2.fewShots?.length || 0}`,
      );
    }

    // Check for metadata changes
    if (t1.metadata.status !== t2.metadata.status) {
      changes.push(`Status changed: ${t1.metadata.status} → ${t2.metadata.status}`);
    }

    return { template1: t1, template2: t2, changes };
  }
}

/**
 * Create a prompt registry.
 */
export function createPromptRegistry(): PromptRegistry {
  return new PromptRegistry();
}

/**
 * Default system prompts for the Strategia-X AI assistant.
 */
export const DEFAULT_SYSTEM_PROMPTS: Record<string, PromptTemplate> = {
  copilot: {
    id: 'copilot-system',
    name: 'Strategia-X Company Copilot',
    version: '1.2.0',
    description: 'Main system prompt for the company copilot assistant',
    systemPrefix: `You are the Strategia-X company copilot. You answer complex questions about the state of the company — its employees, tickets, projects, meetings, files, and recent activity.

Principles:
- Think before you act. Explain your plan for one short sentence, then call exactly one tool.
- Ground every claim in the tool results you have actually observed. Do not invent numbers, names, or IDs.
- If a question cannot be answered with the available tools, say so plainly in your final answer.
- Keep the final answer concise and executive. Cite specific employees, tickets, or projects by name.`,
    template: `{{context}}

Tools available:
{{tools}}

At each turn you MUST respond in this exact shape:
1. (Optional) A short one- or two-sentence plan describing what you intend to do next.
2. A single JSON object on the final line, with no trailing text, matching one of:
     {"action": "<tool_name>", "args": { ... }}      — call a tool
     {"action": "final_answer", "answer": "..."}     — finish and return the answer

Rules:
- The JSON object MUST be the last thing in your message.
- Do NOT wrap the JSON in triple-backtick code fences.
- Do NOT emit multiple JSON objects in one turn.
- Tool args MUST exactly match the tool's schema.
- If you have enough information to answer the user, emit {"action": "final_answer", ...}. Do not keep calling tools unnecessarily.`,
    variables: ['context', 'tools'],
    metadata: {
      createdAt: Date.now(),
      author: 'Rocky Elsalaymeh',
      changelog: [
        {
          version: '1.0.0',
          description: 'Initial system prompt',
          author: 'Rocky Elsalaymeh',
          timestamp: Date.now(),
        },
        {
          version: '1.1.0',
          description: 'Added execution policy section',
          author: 'Rocky Elsalaymeh',
          timestamp: Date.now() - 86400000 * 7,
        },
        {
          version: '1.2.0',
          description: 'Improved action contract clarity and JSON examples',
          author: 'Rocky Elsalaymeh',
          timestamp: Date.now() - 86400000 * 3,
        },
      ],
      status: 'production',
      tags: ['system', 'copilot', 'agentic'],
      category: 'system',
    },
  },

  retrieval: {
    id: 'retrieval-context',
    name: 'RAG Context',
    version: '1.0.0',
    description: 'Context block for RAG-retrieved information',
    template: `## Relevant Context

{{context}}

Use the above context to answer the user's question. If the context doesn't contain relevant information, say so clearly.`,
    variables: ['context'],
    metadata: {
      createdAt: Date.now(),
      author: 'Rocky Elsalaymeh',
      changelog: [],
      status: 'production',
      tags: ['rag', 'context', 'retrieval'],
      category: 'rag',
    },
  },
};

/**
 * Initialize registry with default prompts.
 */
export function createDefaultPromptRegistry(): PromptRegistry {
  const registry = createPromptRegistry();

  for (const prompt of Object.values(DEFAULT_SYSTEM_PROMPTS)) {
    registry.register(prompt);
  }

  return registry;
}
