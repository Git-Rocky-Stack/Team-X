/**
 * Long-Run Memory System
 *
 * Manages persistent knowledge extraction, summarization, and fact freshness
 * for the Strategia-X AI assistant. Enables cross-thread knowledge retention
 * and temporal relevance scoring.
 *
 * Phase 5 — M29 (Priority 2 enhancement).
 */

/**
 * A fact extracted from conversation or content.
 */
export interface ExtractedFact {
  /** Unique fact ID */
  id: string;

  /** Company this fact belongs to */
  companyId: string;

  /** Source conversation/session ID */
  sourceId: string;

  /** The fact content */
  fact: string;

  /** Fact type for categorization */
  type: FactType;

  /** Confidence score (0-1) from extraction */
  confidence: number;

  /** When this fact was extracted */
  extractedAt: number;

  /** When the underlying fact was created/observed */
  observedAt: number;

  /** Related entities (employee IDs, project IDs, etc.) */
  entities?: string[];

  /** Whether this fact should persist indefinitely */
  persistent?: boolean;

  /** Fact expiration (null = never expires) */
  expiresAt?: number;

  /** Access count for relevance tracking */
  accessCount: number;

  /** Last access timestamp */
  lastAccessedAt: number;
}

/**
 * Types of facts we extract.
 */
export type FactType =
  | 'preference'    // User/system preferences
  | 'status'        // Current status (project state, employee status)
  | 'decision'      // Decisions made
  | 'relationship'  // Entity relationships (who works on what)
  | 'event'         // Events that occurred
  | 'metric'        // Numeric metrics/KPIs
  | 'procedure'     // How-to procedures
  | 'custom';       // Other

/**
 * A summary of a conversation or content.
 */
export interface ConversationSummary {
  /** Unique summary ID */
  id: string;

  /** Company ID */
  companyId: string;

  /** Source conversation ID */
  sourceId: string;

  /** Summary title */
  title: string;

  /** Summary content */
  summary: string;

  /** Key topics covered */
  topics: string[];

  /** Key entities mentioned */
  entities: string[];

  /** When conversation occurred */
  conversationStart: number;

  /** When conversation ended */
  conversationEnd: number;

  /** When summary was created */
  summarizedAt: number;

  /** Conversation length (messages) */
  messageCount: number;

  /** Related fact IDs */
  factIds: string[];
}

/**
 * Fact freshness scoring result.
 */
export interface FreshnessScore {
  /** Base relevance score (0-1) */
  relevance: number;

  /** Time decay factor (0-1, newer = higher) */
  timeDecay: number;

  /** Access frequency boost (0-1) */
  frequencyBoost: number;

  /** Final freshness score (0-1) */
  finalScore: number;

  /** Whether fact is expired */
  expired: boolean;
}

/**
 * Summarization trigger configuration.
 */
export interface SummarizationTrigger {
  /** Minimum messages before considering summarization */
  minMessages: number;

  /** Maximum messages before forcing summarization */
  maxMessages: number;

  /** Minimum time span (ms) before summarization */
  minTimeSpan: number;

  /** Maximum conversation length (tokens) before summarization */
  maxTokens: number;

  /** Whether to auto-summarize on thread close */
  summarizeOnClose: boolean;
}

/**
 * Fact extraction options.
 */
export interface ExtractionOptions {
  /** Minimum confidence for extracted facts (0-1) */
  minConfidence: number;

  /** Whether to extract preferences */
  extractPreferences: boolean;

  /** Whether to extract relationships */
  extractRelationships: boolean;

  /** Whether to extract decisions */
  extractDecisions: boolean;

  /** Custom patterns for fact extraction */
  customPatterns?: FactExtractionPattern[];
}

/**
 * Pattern for fact extraction.
 */
export interface FactExtractionPattern {
  /** Pattern name */
  name: string;

  /** Regex pattern with named groups */
  pattern: RegExp;

  /** Fact type to assign */
  type: FactType;

  /** Template for fact text (uses named groups) */
  template: string;

  /** Confidence score for this pattern */
  confidence: number;
}

/**
 * LLM call signature for summarization.
 */
export type SummarizeFn = (
  conversation: string,
  context: {
    companyId: string;
    title?: string;
    maxLength?: number;
  }
) => Promise<{
  summary: string;
  topics: string[];
  entities: string[];
}>;

/**
 * LLM call signature for fact extraction.
 */
export type ExtractFactsFn = (
  text: string,
  context: {
    companyId: string;
    sourceId: string;
    options: ExtractionOptions;
  }
) => Promise<ExtractedFact[]>;

/**
 * Repository interface for long-term memory.
 */
export interface LongTermMemoryRepo {
  // Facts
  upsertFact(fact: ExtractedFact): void;
  getFact(id: string): ExtractedFact | null;
  listFactsByCompany(companyId: string): ExtractedFact[];
  listFactsBySource(sourceId: string): ExtractedFact[];
  listFactsByType(companyId: string, type: FactType): ExtractedFact[];
  deleteFact(id: string): boolean;
  deleteExpiredFacts(now: number): number;

  // Summaries
  upsertSummary(summary: ConversationSummary): void;
  getSummary(id: string): ConversationSummary | null;
  listSummariesByCompany(companyId: string): ConversationSummary[];
  listSummariesBySource(sourceId: string): ConversationSummary[];
  deleteSummary(id: string): boolean;

  // Cleanup
  deleteBySource(sourceId: string): number;
}

/**
 * Freshness scoring options.
 */
export interface FreshnessOptions {
  /** Half-life of facts in milliseconds (default: 30 days) */
  halfLife: number;

  /** Minimum frequency factor (prevents cold-start starvation) */
  minFrequencyBoost: number;

  /** Maximum frequency boost (prevents popularity runaway) */
  maxFrequencyBoost: number;

  /** Frequency decay rate */
  frequencyDecay: number;
}

/**
 * Default freshness options (30-day half-life).
 */
export const DEFAULT_FRESHNESS_OPTIONS: FreshnessOptions = {
  halfLife: 30 * 24 * 60 * 60 * 1000, // 30 days
  minFrequencyBoost: 0.5,
  maxFrequencyBoost: 2.0,
  frequencyDecay: 0.95,
};

/**
 * Calculate time decay using exponential decay.
 * decay = 0.5 ^ (age / halfLife)
 */
function calculateTimeDecay(observedAt: number, now: number, halfLife: number): number {
  const age = now - observedAt;
  if (age < 0) return 1.0; // Future facts = fully fresh
  return Math.pow(0.5, age / halfLife);
}

/**
 * Calculate frequency boost based on access count and recency.
 */
function calculateFrequencyBoost(
  accessCount: number,
  lastAccessedAt: number,
  now: number,
  options: FreshnessOptions
): number {
  if (accessCount === 0) return 1.0;

  const daysSinceAccess = (now - lastAccessedAt) / (24 * 60 * 60 * 1000);
  const decay = Math.pow(options.frequencyDecay, daysSinceAccess);

  // Boost scales with log of access count (diminishing returns)
  const rawBoost = 1 + Math.log1p(accessCount) * 0.2;

  const boosted = rawBoost * decay;
  return Math.max(options.minFrequencyBoost, Math.min(options.maxFrequencyBoost, boosted));
}

/**
 * Calculate freshness score for a fact.
 */
export function calculateFreshness(
  fact: ExtractedFact,
  options: FreshnessOptions = DEFAULT_FRESHNESS_OPTIONS,
  baseRelevance: number = fact.confidence,
  now: number = Date.now()
): FreshnessScore {
  const timeDecay = calculateTimeDecay(fact.observedAt, now, options.halfLife);
  const frequencyBoost = calculateFrequencyBoost(
    fact.accessCount,
    fact.lastAccessedAt,
    now,
    options
  );

  // Check expiration
  const expired = fact.expiresAt !== undefined && now > fact.expiresAt;

  // Final score combines all factors
  const finalScore = expired ? 0 : baseRelevance * timeDecay * frequencyBoost;

  return {
    relevance: baseRelevance,
    timeDecay,
    frequencyBoost,
    finalScore: Math.max(0, Math.min(1, finalScore)),
    expired,
  };
}

/**
 * Default fact extraction patterns for Strategia-X.
 */
export const DEFAULT_FACT_PATTERNS: FactExtractionPattern[] = [
  {
    name: 'employee_status',
    pattern: /(?<name>\w+(?:\s+\w+)*)\s+(is|was)\s+(?<status>on vacation|out of office|available|busy|in a meeting|working from home)/gi,
    type: 'status',
    template: '{{name}} is {{status}}',
    confidence: 0.9,
  },
  {
    name: 'project_status',
    pattern: /(?:the\s+)?(?<project>[\w-]+)\s+(?:project\s+)?is\s+(?<status>on track|delayed|at risk|completed|paused|cancelled)/gi,
    type: 'status',
    template: 'Project {{project}} is {{status}}',
    confidence: 0.85,
  },
  {
    name: 'preference',
    pattern: /(?:I\s+(?:prefer|like|want)|(?:we\s+should|let['']s\s+)?(?:use|enable|disable))\s+(?<preference>[^.]+)/gi,
    type: 'preference',
    template: 'Prefers: {{preference}}',
    confidence: 0.75,
  },
  {
    name: 'decision',
    pattern: /(?:we\s+)?(?:decided|agreed|concluded)\s+(?:to\s+)?(?<decision>[^.]+)/gi,
    type: 'decision',
    template: 'Decided: {{decision}}',
    confidence: 0.9,
  },
  {
    name: 'assignment',
    pattern: /(?<person>\w+(?:\s+\w+)*)\s+(?:is\s+)?(?:working\s+on|assigned\s+to|leading|owns)\s+(?<thing>[^.]+)/gi,
    type: 'relationship',
    template: '{{person}} works on {{thing}}',
    confidence: 0.85,
  },
];

/**
 * Long-term memory service.
 */
export interface LongTermMemoryService {
  /**
   * Extract facts from text using LLM or patterns.
   */
  extractFacts(
    text: string,
    context: {
      companyId: string;
      sourceId: string;
      observedAt?: number;
      options?: ExtractionOptions;
    }
  ): Promise<ExtractedFact[]>;

  /**
   * Store extracted facts.
   */
  storeFacts(facts: ExtractedFact[]): void;

  /**
   * Retrieve relevant facts for a company.
   */
  retrieveFacts(companyId: string, options?: {
    types?: FactType[];
    includeExpired?: boolean;
    maxResults?: number;
  }): ExtractedFact[];

  /**
   * Retrieve ranked facts (by freshness score).
   */
  retrieveRankedFacts(
    companyId: string,
    query?: string,
    freshnessOptions?: FreshnessOptions
  ): Array<{ fact: ExtractedFact; score: FreshnessScore }>;

  /**
   * Summarize a conversation.
   */
  summarizeConversation(
    conversation: string,
    context: {
      companyId: string;
      sourceId: string;
      title?: string;
      conversationStart: number;
      conversationEnd: number;
      messageCount: number;
    }
  ): Promise<ConversationSummary>;

  /**
   * Store a summary.
   */
  storeSummary(summary: ConversationSummary): void;

  /**
   * Check if summarization should be triggered.
   */
  shouldSummarize(
    conversationLength: {
      messageCount: number;
      tokenCount: number;
      timeSpan: number;
    },
    trigger?: Partial<SummarizationTrigger>
  ): boolean;

  /**
   * Record fact access (for freshness scoring).
   */
  recordAccess(factId: string): void;

  /**
   * Clean up expired facts.
   */
  cleanup(): number;

  /**
   * Delete all data for a source (e.g., deleted conversation).
   */
  deleteBySource(sourceId: string): number;
}

/**
 * Create long-term memory service.
 */
export function createLongTermMemoryService(options: {
  repo: LongTermMemoryRepo;
  summarizeFn: SummarizeFn;
  extractFactsFn: ExtractFactsFn;
  summarizationTrigger?: Partial<SummarizationTrigger>;
  freshnessOptions?: FreshnessOptions;
  idGen?: () => string;
  now?: () => number;
}): LongTermMemoryService {
  const now = options.now ?? Date.now;
  const idGen =
    options.idGen ??
    (() => `fact_${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`);
  const summaryIdGen = () =>
    `sum_${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`;

  const summarizationTrigger: SummarizationTrigger = {
    minMessages: 10,
    maxMessages: 50,
    minTimeSpan: 5 * 60 * 1000, // 5 minutes
    maxTokens: 4000,
    summarizeOnClose: true,
    ...options.summarizationTrigger,
  };

  const freshnessOptions: FreshnessOptions = {
    ...DEFAULT_FRESHNESS_OPTIONS,
    ...options.freshnessOptions,
  };

  return {
    async extractFacts(text, context) {
      const extractionOptions = context.options ?? {
        minConfidence: 0.7,
        extractPreferences: true,
        extractRelationships: true,
        extractDecisions: true,
      };

      // Use LLM-based extraction
      const facts = await options.extractFactsFn(text, {
        companyId: context.companyId,
        sourceId: context.sourceId,
        options: extractionOptions,
      });

      // Filter by min confidence and add timestamps
      const now_ = now();
      return facts
        .filter((f) => f.confidence >= extractionOptions.minConfidence)
        .map((f) => ({
          ...f,
          id: idGen(),
          companyId: context.companyId,
          sourceId: context.sourceId,
          observedAt: context.observedAt ?? now_,
          extractedAt: now_,
          accessCount: 0,
          lastAccessedAt: now_,
        }));
    },

    storeFacts(facts) {
      for (const fact of facts) {
        options.repo.upsertFact(fact);
      }
    },

    retrieveFacts(companyId, opts) {
      const includeExpired = opts?.includeExpired ?? false;
      const maxResults = opts?.maxResults;
      const types = opts?.types;

      let facts = options.repo.listFactsByCompany(companyId);

      // Filter by type
      if (types && types.length > 0) {
        const typeSet = new Set(types);
        facts = facts.filter((f) => typeSet.has(f.type));
      }

      // Filter expired
      if (!includeExpired) {
        const now_ = now();
        facts = facts.filter((f) => !f.expiresAt || f.expiresAt > now_);
      }

      // Limit results
      if (maxResults) {
        facts = facts.slice(0, maxResults);
      }

      return facts;
    },

    retrieveRankedFacts(companyId, _query, freshnessOpts) {
      const facts = options.repo.listFactsByCompany(companyId);
      const now_ = now();
      const opts = freshnessOpts ?? freshnessOptions;

      const withScores = facts.map((fact) => ({
        fact,
        score: calculateFreshness(fact, opts, fact.confidence, now_),
      }));

      // Filter expired and sort by score
      return withScores
        .filter((fs) => !fs.score.expired)
        .sort((a, b) => b.score.finalScore - a.score.finalScore);
    },

    async summarizeConversation(conversation, context) {
      const result = await options.summarizeFn(conversation, {
        companyId: context.companyId,
        title: context.title,
      });

      const summary: ConversationSummary = {
        id: summaryIdGen(),
        companyId: context.companyId,
        sourceId: context.sourceId,
        title: context.title ?? 'Conversation Summary',
        summary: result.summary,
        topics: result.topics,
        entities: result.entities,
        conversationStart: context.conversationStart,
        conversationEnd: context.conversationEnd,
        summarizedAt: now(),
        messageCount: context.messageCount,
        factIds: [],
      };

      options.repo.upsertSummary(summary);
      return summary;
    },

    storeSummary(summary) {
      options.repo.upsertSummary(summary);
    },

    shouldSummarize(conversationLength, trigger) {
      const trig = { ...summarizationTrigger, ...trigger };

      // Check message count
      if (conversationLength.messageCount >= trig.maxMessages) return true;
      if (conversationLength.messageCount < trig.minMessages) return false;

      // Check token count
      if (conversationLength.tokenCount >= trig.maxTokens) return true;

      // Check time span
      if (conversationLength.timeSpan >= trig.minTimeSpan) return true;

      return false;
    },

    recordAccess(factId) {
      const fact = options.repo.getFact(factId);
      if (fact) {
        options.repo.upsertFact({
          ...fact,
          accessCount: fact.accessCount + 1,
          lastAccessedAt: now(),
        });
      }
    },

    cleanup() {
      return options.repo.deleteExpiredFacts(now());
    },

    deleteBySource(sourceId) {
      return options.repo.deleteBySource(sourceId);
    },
  };
}

/**
 * Create in-memory long-term memory repository (for development/testing).
 */
export function createInMemoryMemoryRepo(): LongTermMemoryRepo {
  const facts = new Map<string, ExtractedFact>();
  const summaries = new Map<string, ConversationSummary>();
  const sourceToFacts = new Map<string, Set<string>>();
  const sourceToSummaries = new Map<string, Set<string>>();
  const companyToFacts = new Map<string, Set<string>>();
  const companyToSummaries = new Map<string, Set<string>>();

  return {
    upsertFact(fact) {
      facts.set(fact.id, fact);

      // Update indexes
      if (!sourceToFacts.has(fact.sourceId)) {
        sourceToFacts.set(fact.sourceId, new Set());
      }
      sourceToFacts.get(fact.sourceId)!.add(fact.id);

      if (!companyToFacts.has(fact.companyId)) {
        companyToFacts.set(fact.companyId, new Set());
      }
      companyToFacts.get(fact.companyId)!.add(fact.id);
    },

    getFact(id) {
      return facts.get(id) ?? null;
    },

    listFactsByCompany(companyId) {
      const ids = companyToFacts.get(companyId) ?? new Set();
      return Array.from(ids)
        .map((id) => facts.get(id))
        .filter((f): f is ExtractedFact => f !== undefined);
    },

    listFactsBySource(sourceId) {
      const ids = sourceToFacts.get(sourceId) ?? new Set();
      return Array.from(ids)
        .map((id) => facts.get(id))
        .filter((f): f is ExtractedFact => f !== undefined);
    },

    listFactsByType(companyId, type) {
      return this.listFactsByCompany(companyId).filter((f) => f.type === type);
    },

    deleteFact(id) {
      const fact = facts.get(id);
      if (!fact) return false;

      facts.delete(id);
      sourceToFacts.get(fact.sourceId)?.delete(id);
      companyToFacts.get(fact.companyId)?.delete(id);
      return true;
    },

    deleteExpiredFacts(now) {
      let count = 0;
      for (const [id, fact] of facts) {
        if (fact.expiresAt !== undefined && now > fact.expiresAt) {
          this.deleteFact(id);
          count++;
        }
      }
      return count;
    },

    upsertSummary(summary) {
      summaries.set(summary.id, summary);

      if (!sourceToSummaries.has(summary.sourceId)) {
        sourceToSummaries.set(summary.sourceId, new Set());
      }
      sourceToSummaries.get(summary.sourceId)!.add(summary.id);

      if (!companyToSummaries.has(summary.companyId)) {
        companyToSummaries.set(summary.companyId, new Set());
      }
      companyToSummaries.get(summary.companyId)!.add(summary.id);
    },

    getSummary(id) {
      return summaries.get(id) ?? null;
    },

    listSummariesByCompany(companyId) {
      const ids = companyToSummaries.get(companyId) ?? new Set();
      return Array.from(ids)
        .map((id) => summaries.get(id))
        .filter((s): s is ConversationSummary => s !== undefined);
    },

    listSummariesBySource(sourceId) {
      const ids = sourceToSummaries.get(sourceId) ?? new Set();
      return Array.from(ids)
        .map((id) => summaries.get(id))
        .filter((s): s is ConversationSummary => s !== undefined);
    },

    deleteSummary(id) {
      const summary = summaries.get(id);
      if (!summary) return false;

      summaries.delete(id);
      sourceToSummaries.get(summary.sourceId)?.delete(id);
      companyToSummaries.get(summary.companyId)?.delete(id);
      return true;
    },

    deleteBySource(sourceId) {
      let count = 0;

      // Delete facts
      const factIds = sourceToFacts.get(sourceId) ?? new Set();
      for (const id of factIds) {
        if (this.deleteFact(id)) count++;
      }

      // Delete summaries
      const summaryIds = sourceToSummaries.get(sourceId) ?? new Set();
      for (const id of summaryIds) {
        if (this.deleteSummary(id)) count++;
      }

      return count;
    },
  };
}

/**
 * Default summarization trigger for production use.
 */
export const DEFAULT_SUMMARIZATION_TRIGGER: SummarizationTrigger = {
  minMessages: 8,
  maxMessages: 40,
  minTimeSpan: 3 * 60 * 1000, // 3 minutes
  maxTokens: 3000,
  summarizeOnClose: true,
};
