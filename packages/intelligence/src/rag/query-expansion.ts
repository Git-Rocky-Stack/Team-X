/**
 * Query Expansion Strategies for RAG
 *
 * Improves retrieval recall by generating query variations:
 * - Semantic variations (paraphrases)
 * - Domain-specific synonyms
 * - Entity-based expansion (related IDs, names)
 * - HyDE: Hypothetical Document Embeddings
 *
 * Phase 5 — M29 (Priority 2 enhancement).
 */


/**
 * Query expansion result.
 */
export interface ExpandedQuery {
  /** Original query */
  original: string;

  /** Expanded queries */
  expansions: string[];

  /** Weights for each query (0-1) */
  weights: number[];

  /** Expansion method used */
  method: 'semantic' | 'synonym' | 'entity' | 'hyde' | 'combined';
}

/**
 * Entity context for expansion.
 */
export interface EntityContext {
  /** Company ID */
  companyId: string;

  /** Employee names and IDs */
  employees?: Array<{ id: string; name: string; aliases: string[] }>;

  /** Project names and IDs */
  projects?: Array<{ id: string; name: string; aliases: string[] }>;

  /** Goal names and IDs */
  goals?: Array<{ id: string; name: string; aliases: string[] }>;

  /** Ticket subjects and IDs */
  tickets?: Array<{ id: string; title: string; tags: string[] }>;

  /** Common domain synonyms */
  domainSynonyms?: Map<string, string[]>;
}

/**
 * HyDE (Hypothetical Document Embeddings) options.
 */
export interface HyDEOptions {
  /** LLM to generate hypothetical documents */
  llm: (prompt: string) => Promise<string>;

  /** Number of hypothetical documents to generate */
  nDocs?: number;

  /** Hypothetical document template */
  template?: string;

  /** Maximum tokens per hypothetical document */
  maxTokens?: number;
}

/**
 * Expand query using semantic variations.
 */
export function expandQuerySemantically(
  query: string,
  variations: number = 3
): ExpandedQuery {
  const expansions: string[] = [];

  // Generate paraphrases
  const templates = [
    query, // Original
    `What is ${query}?`, // Question form
    `Tell me about ${query}`, // Request form
    `${query} details`, // Details suffix
    `Information on ${query}`, // Information request
  ];

  // Remove duplicates and limit
  const unique = [...new Set(templates)].slice(0, variations);
  expansions.push(...unique);

  return {
    original: query,
    expansions,
    weights: expansions.map(() => 1), // Equal weight for now
    method: 'semantic',
  };
}

/**
 * Expand query using domain-specific synonyms.
 */
export function expandQueryWithSynonyms(
  query: string,
  context: EntityContext
): ExpandedQuery {
  const expansions: string[] = [query];
  const weights = [1.0];

  // Replace with synonyms from domain context
  if (context.domainSynonyms) {
    let modifiedQuery = query;
    let synonymCount = 0;

    for (const [term, synonyms] of context.domainSynonyms) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      if (regex.test(modifiedQuery)) {
        // Create expansion with synonyms
        const withSynonyms = modifiedQuery.replace(
          regex,
          `(${term}|${synonyms.join('|')})`
        );
        if (withSynonyms !== modifiedQuery) {
          expansions.push(withSynonyms);
          weights.push(0.9); // Slightly lower weight for expanded queries
          synonymCount++;
        }
      }
    }
  }

  return {
    original: query,
    expansions: [...new Set(expansions)],
    weights,
    method: 'synonym',
  };
}

/**
 * Expand query using entity names and IDs.
 */
export function expandQueryWithEntities(
  query: string,
  context: EntityContext
): ExpandedQuery {
  const expansions: string[] = [query];
  const weights = [1.0];

  // Add employee name expansions
  if (context.employees) {
    for (const emp of context.employees) {
      const nameRegex = new RegExp(`\\b${emp.name}\\b`, 'gi');
      if (nameRegex.test(query)) {
        // Add ID variant
        expansions.push(query.replace(nameRegex, emp.id));
        weights.push(0.8);

        // Add alias variants
        for (const alias of emp.aliases) {
          const aliasRegex = new RegExp(`\\b${alias}\\b`, 'gi');
          if (aliasRegex.test(query)) {
            expansions.push(query.replace(aliasRegex, emp.id));
            weights.push(0.8);
          }
        }
      }
    }
  }

  // Add project name expansions
  if (context.projects) {
    for (const proj of context.projects) {
      const nameRegex = new RegExp(`\\b${proj.name}\\b`, 'gi');
      if (nameRegex.test(query)) {
        expansions.push(query.replace(nameRegex, proj.id));
        weights.push(0.8);
      }
    }
  }

  return {
    original: query,
    expansions: [...new Set(expansions)],
    weights,
    method: 'entity',
  };
}

/**
 * Generate HyDE (Hypothetical Document Embeddings) expansions.
 *
 * This technique generates hypothetical relevant documents for the query,
 * embeds them, and uses those embeddings for retrieval.
 */
export async function expandQueryWithHyDE(
  query: string,
  options: HyDEOptions
): Promise<ExpandedQuery> {
  const { llm, nDocs = 3, maxTokens = 256 } = options;

  const prompt = `You are a search assistant. Generate a hypothetical document that would be a highly relevant answer to this question:

Question: ${query}

Generate a concise, factual document (under ${maxTokens} tokens) that directly addresses the question. Include specific details, names, IDs, and data points if applicable.`;

  const response = await llm(prompt);

  // Split response into chunks to use as queries
  const hypotheticalDocs = response
    .split(/\n\n+/g)
    .filter((s) => s.trim().length > 20)
    .slice(0, nDocs);

  const expansions = [query, ...hypotheticalDocs];

  return {
    original: query,
    expansions,
    weights: expansions.map((_, i) => (i === 0 ? 1 : 0.5)), // Lower weight for HyDE
    method: 'hyde',
  };
}

/**
 * Combine multiple expansion methods.
 */
export async function expandQueryCombined(
  query: string,
  context: EntityContext,
  options: {
    useSemantic?: boolean;
    useSynonyms?: boolean;
    useEntities?: boolean;
    useHyDE?: boolean;
    hydeOptions?: HyDEOptions;
    semanticVariations?: number;
    maxExpansions?: number;
  } = {}
): Promise<ExpandedQuery> {
  const {
    useSemantic = true,
    useSynonyms = true,
    useEntities = true,
    useHyDE = false,
    hydeOptions,
    semanticVariations = 2,
    maxExpansions = 10,
  } = options;

  const allExpansions: Array<{ query: string; weight: number; method: string }> = [
    { query, weight: 1.0, method: 'original' },
  ];

  // Semantic variations
  if (useSemantic) {
    const semantic = expandQuerySemantically(query, semanticVariations);
    for (let i = 0; i < semantic.expansions.length; i++) {
      const expanded = semantic.expansions[i];
      const weight = semantic.weights[i];
      if (expanded === undefined || weight === undefined) continue;
      allExpansions.push({
        query: expanded,
        weight: weight * 0.7, // Reduce weight for variations
        method: 'semantic',
      });
    }
  }

  // Synonym expansion
  if (useSynonyms) {
    const synonym = expandQueryWithSynonyms(query, context);
    for (let i = 0; i < synonym.expansions.length; i++) {
      const expanded = synonym.expansions[i];
      const weight = synonym.weights[i];
      if (expanded === undefined || weight === undefined) continue;
      allExpansions.push({
        query: expanded,
        weight: weight * 0.8,
        method: 'synonym',
      });
    }
  }

  // Entity expansion
  if (useEntities) {
    const entity = expandQueryWithEntities(query, context);
    for (let i = 0; i < entity.expansions.length; i++) {
      const expanded = entity.expansions[i];
      const weight = entity.weights[i];
      if (expanded === undefined || weight === undefined) continue;
      allExpansions.push({
        query: expanded,
        weight: weight * 0.9,
        method: 'entity',
      });
    }
  }

  // HyDE expansion (async)
  if (useHyDE && hydeOptions) {
    const hyde = await expandQueryWithHyDE(query, hydeOptions);
    for (let i = 0; i < hyde.expansions.length; i++) {
      const expanded = hyde.expansions[i];
      const weight = hyde.weights[i];
      if (expanded === undefined || weight === undefined) continue;
      allExpansions.push({
        query: expanded,
        weight: weight * 0.6, // Lower weight for hypotheticals
        method: 'hyde',
      });
    }
  }

  // Deduplicate and limit
  const seen = new Set<string>();
  const unique: Array<{ query: string; weight: number; method: string }> = [];

  for (const expansion of allExpansions) {
    const key = expansion.query.toLowerCase().trim();
    if (!seen.has(key) && unique.length < maxExpansions) {
      seen.add(key);
      unique.push(expansion);
    }
  }

  return {
    original: query,
    expansions: unique.map((u) => u.query),
    weights: unique.map((u) => u.weight),
    method: 'combined',
  };
}

/**
 * Execute retrieval with query expansion.
 *
 * Retrieves for each expanded query and merges results,
 * removing duplicates and re-ranking by combined score.
 */
export async function retrieveWithExpansion(
  _originalQuery: string,
  expandedQuery: ExpandedQuery,
  retrieveFn: (query: string, topK: number) => Promise<
    Array<{ id: string; score: number; content: string }>
  >,
  options: {
    topK?: number;
    threshold?: number;
    mergeStrategy?: 'average' | 'max' | 'rrf';
    rrfK?: number; // K for Reciprocal Rank Fusion
  } = {}
): Promise<Array<{ id: string; score: number; content: string }>> {
  const {
    topK = 10,
    threshold = 0.0,
    mergeStrategy = 'average',
    rrfK = 60,
  } = options;

  // Retrieve for each expanded query
  const retrievalPromises = expandedQuery.expansions.map((expQuery) =>
    retrieveFn(expQuery, topK)
  );

  const allResults = await Promise.all(retrievalPromises);

  // Score aggregation
  const scoreMap = new Map<string, { scores: number[]; content: string }>();

  for (let i = 0; i < allResults.length; i++) {
    const results = allResults[i];
    const weight = expandedQuery.weights[i] ?? 1;
    if (!results) continue;

    for (const result of results) {
      if (result.score < threshold) continue;

      const existing = scoreMap.get(result.id);
      const weightedScore = result.score * weight;

      if (!existing) {
        scoreMap.set(result.id, {
          scores: [weightedScore],
          content: result.content,
        });
      } else {
        existing.scores.push(weightedScore);
      }
    }
  }

  // Merge scores and return
  const mergedResults: Array<{ id: string; score: number; content: string }> = [];

  for (const [id, data] of scoreMap) {
    let finalScore: number;

    switch (mergeStrategy) {
      case 'average':
        finalScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        break;
      case 'max':
        finalScore = Math.max(...data.scores);
        break;
      case 'rrf':
        // Reciprocal Rank Fusion
        // score = sum(1 / (K + rank)) for each result
        finalScore = data.scores.reduce((sum) => {
          const rank = (allResults[0]?.findIndex((r) => r.id === id) ?? -1) + 1;
          return sum + 1 / (rrfK + rank);
        }, 0);
        break;
      default:
        finalScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    }

    mergedResults.push({
      id,
      score: finalScore,
      content: data.content,
    });
  }

  // Sort by final score and limit
  mergedResults.sort((a, b) => b.score - a.score);

  return mergedResults.slice(0, topK);
}

/**
 * Create domain-specific entity context for a company.
 * Extract from the company's data (employees, projects, goals, tickets).
 */
export function createEntityContext(company: {
  employees?: Array<{ id: string; name: string }>;
  projects?: Array<{ id: string; name: string }>;
  goals?: Array<{ id: string; name: string }>;
  tickets?: Array<{ id: string; title: string; tags?: string[] }>;
}): EntityContext {
  const domainSynonyms = new Map<string, string[]>();

  // Build employee aliases
  const employees = company.employees?.map((emp) => ({
    id: emp.id,
    name: emp.name,
    aliases: buildAliases(emp.name),
  }));

  // Build project aliases
  const projects = company.projects?.map((proj) => ({
    id: proj.id,
    name: proj.name,
    aliases: buildAliases(proj.name),
  }));

  // Build goal aliases
  const goals = company.goals?.map((goal) => ({
    id: goal.id,
    name: goal.name,
    aliases: buildAliases(goal.name),
  }));

  // Build ticket tags/subjects
  const tickets = company.tickets?.map((ticket) => ({
    id: ticket.id,
    title: ticket.title,
    tags: ticket.tags || [],
  }));

  // Add domain-specific synonyms
  domainSynonyms.set('blocked', ['stuck', 'waiting', 'pending', 'paused']);
  domainSynonyms.set('assigned', ['owned', 'responsible']);
  domainSynonyms.set('unassigned', ['open', 'available', 'unowned']);
  domainSynonyms.set('completed', ['done', 'finished', 'closed', 'resolved']);
  domainSynonyms.set('high priority', ['urgent', 'critical', 'important']);
  domainSynonyms.set('project', ['initiative', 'effort', 'workstream']);

  return {
    companyId: '', // Set by caller
    employees,
    projects,
    goals,
    tickets,
    domainSynonyms,
  };
}

/**
 * Build name aliases for fuzzy matching.
 */
function buildAliases(name: string): string[] {
  const aliases: string[] = [];
  const lower = name.toLowerCase();

  // Add lowercase
  if (lower !== name) aliases.push(lower);

  // Add without special chars
  const clean = lower.replace(/[^a-z0-9]/g, '');
  if (clean !== lower) aliases.push(clean);

  // Add first word
  const firstWord = lower.split(/\s+/)[0];
  if (firstWord && firstWord !== lower) aliases.push(firstWord);

  return [...new Set(aliases)];
}

/**
 * Query expansion service.
 */
export interface QueryExpansionService {
  /**
   * Expand a query using configured strategies.
   */
  expand(query: string, context: EntityContext): Promise<ExpandedQuery>;

  /**
   * Retrieve with expansion.
   */
  retrieveWithExpansion(
    query: string,
    context: EntityContext,
    retrieveFn: (query: string, topK: number) => Promise<
      Array<{ id: string; score: number; content: string }>
    >
  ): Promise<Array<{ id: string; score: number; content: string }>>;

  /**
   * Get expansion statistics.
   */
  getStats(): {
    totalExpansions: number;
    avgExpansionsPerQuery: number;
    methodCounts: Record<string, number>;
  };
}

export function createQueryExpansionService(options: {
  llm?: (prompt: string) => Promise<string>;
  hydeEnabled?: boolean;
}): QueryExpansionService {
  let totalExpansions = 0;
  const methodCounts: Record<string, number> = {};

  return {
    async expand(query, context) {
      totalExpansions++;

      // Use combined expansion strategy
      const expanded = await expandQueryCombined(query, context, {
        useSemantic: true,
        useSynonyms: true,
        useEntities: true,
        useHyDE: options.hydeEnabled && options.llm ? true : false,
        hydeOptions: options.llm ? { llm: options.llm } : undefined,
        semanticVariations: 2,
        maxExpansions: 8,
      });

      // Track method usage
      const methods = expanded.method === 'combined'
        ? ['semantic', 'synonym', 'entity']
        : [expanded.method];
      for (const method of methods) {
        methodCounts[method] = (methodCounts[method] || 0) + 1;
      }

      return expanded;
    },

    async retrieveWithExpansion(query, context, retrieveFn) {
      const expanded = await this.expand(query, context);
      return retrieveWithExpansion(query, expanded, retrieveFn);
    },

    getStats() {
      return {
        totalExpansions,
        avgExpansionsPerQuery: totalExpansions > 0 ? totalExpansions : 0,
        methodCounts,
      };
    },
  };
}
