# AI/RAG & Semantic Memory Implementation Audit

**Audit Date:** 2026-05-03
**Auditor:** Senior Prompt Engineer Agent
**Repository:** Team-X (Strategia-X)
**Phase:** Phase 5 (M28-M31)

---

## Executive Summary

The Team-X AI/RAG implementation demonstrates **solid architectural foundations** with several production-ready patterns. However, there are **critical gaps** in vector storage performance, evaluation frameworks, and enterprise-grade capabilities that must be addressed before scaling to production.

**Overall Assessment:** 6.5/10
- **Strengths:** Clean architecture, hybrid retrieval, event-driven indexing
- **Critical Issues:** O(n) vector retrieval, zero evaluation, no caching
- **Recommendation:** Address Priority 1 items before production deployment

---

## Part 1: Architecture Overview

### Current Stack

| Layer | Technology | Location |
|-------|------------|----------|
| **LLM Orchestration** | Custom ReAct Loop | `packages/intelligence/src/loop/` |
| **RAG Pipeline** | Custom Service | `packages/intelligence/src/rag/` |
| **Embeddings** | OpenAI text-embedding-3-small (1536-dim) | `packages/provider-router/src/adapters/openai-embed.ts` |
| **Vector Storage** | SQLite BLOB (brute-force) | `apps/desktop/src/main/db/repos/embeddings.ts` |
| **Chunking** | Sentence-aware with overlap | `packages/intelligence/src/rag/chunker.ts` |
| **Retrieval** | Hybrid (7-signal scoring) | `apps/desktop/src/main/services/retrieval-orchestrator.ts` |
| **Long-Run Memory** | Thread digests + checkpoints | `apps/desktop/src/main/db/migrations/0021_long_run_memory.sql` |
| **Context Assembly** | Priority-based block selection | `apps/desktop/src/main/services/context-assembler-service.ts` |

### Data Flow

```
User Query
    ↓
Query Expansion (keyword extraction)
    ↓
┌─────────────────────────────────────────────┐
│  Parallel Retrieval:                        │
│  ├─ Vector Search (O(n) - BRUTE FORCE)     │ ← CRITICAL BOTTLENECK
│  ├─ Lexical Match (tickets, goals, projects)│
│  └─ Vault Search (FTS)                      │
└─────────────────────────────────────────────┘
    ↓
Score Fusion (7 signals)
    ↓
Token Budget Allocation
    ↓
Context Assembly
    ↓
Agentic Loop (ReAct)
    ↓
Response
```

---

## Part 2: Critical Issues (Priority 1)

### Issue #1: O(n) Brute-Force Vector Retrieval ⚠️ CRITICAL

**Location:** `packages/intelligence/src/rag/service.ts:142-160`

**Current Implementation:**
```typescript
async retrieve(input: RetrieveInput): Promise<RetrievalHit[]> {
  const vectors = await opts.embedText([input.query]);
  const queryVector = vectors[0];

  // ⚠️ LOADS ALL EMBEDDINGS INTO MEMORY
  const rows = opts.repo.listByCompany(input.companyId);
  const exclude = new Set(input.excludeSourceIds ?? []);

  const ranked: RetrievalHit[] = [];
  for (const row of rows) {
    // ⚠️ BRUTE FORCE COSINE SIMILARITY FOR EVERY ROW
    const similarity = cosineSimilarity(queryVector, bufferToFloatArray(row.embedding));
    if (similarity < input.threshold) continue;
    ranked.push({ /* ... */ });
  }
  return ranked.slice(0, input.topK);
}
```

**Impact Analysis:**
- **Complexity:** O(n) where n = total embeddings per company
- **Memory Usage:** ~6MB per 1000 chunks × 1536 dims × 4 bytes
- **Latency:** ~100ms for 1K chunks, ~1s for 10K chunks, ~10s for 100K chunks
- **Scalability:** Will become unusable at ~10K chunks per company

**Root Cause:**
Using SQLite for vector storage without a vector extension. No ANN (Approximate Nearest Neighbor) indexing.

**Recommended Fix:**
```typescript
// Option 1: sqlite-vec (recommended for local/desktop)
CREATE VIRTUAL TABLE embeddings_vec USING vec0(
  embedding_float(1536)
);

// Option 2: Dedicated vector DB (for cloud deployment)
// - Qdrant (Rust-based, excellent performance)
// - Weaviate (GraphQL-native, good filtering)
// - pgvector (if already using PostgreSQL)
```

**Files to Modify:**
- `apps/desktop/src/main/db/repos/embeddings.ts`
- `apps/desktop/src/main/db/schema.ts`
- `packages/intelligence/src/rag/service.ts`

---

### Issue #2: Zero Evaluation Framework ⚠️ CRITICAL

**Current State:** No metrics, no golden dataset, no regression testing.

**Impact:**
- Cannot detect quality regressions
- No visibility into retrieval precision/recall
- Cannot optimize chunking or scoring
- Cannot compare embedding models

**Required Metrics:**

| Metric | Formula | Target |
|--------|---------|--------|
| **Precision@K** | Relevant@K / K | >0.8 @ K=5 |
| **Recall@K** | Relevant@K / Total Relevant | >0.7 @ K=10 |
| **MRR** | 1 / rank_of_first_relevant | >0.85 |
| **NDCG@K** | DCG@K / IDCG@K | >0.75 |
| **Latency P95** | 95th percentile retrieval time | <100ms |

**Required Deliverables:**
1. `packages/intelligence/src/eval/dataset.ts` - Golden dataset structure
2. `packages/intelligence/src/eval/metrics.ts` - Metric calculations
3. `packages/intelligence/src/eval/evaluator.ts` - Evaluation harness
4. `scripts/eval/run-benchmark.ts` - Benchmark runner
5. `docs/eval/golden-dataset.md` - 50+ labeled queries

**Files to Create:**
- `packages/intelligence/src/eval/` (new directory)
- `scripts/eval/` (new directory)

---

### Issue #3: No Query Caching

**Current State:** Every query re-embeds the input text.

**Impact:**
- Wasted API calls to embedding provider
- Increased latency (embedding is ~50-100ms)
- Higher costs for cloud embedding services

**Recommended Solution:**
```typescript
interface RetrievalCache {
  get(key: string, query: string): Promise<RetrievalHit[] | null>;
  set(key: string, query: string, results: RetrievalHit[], ttl: number): Promise<void>;
  invalidate(companyId: string, sourceIds: string[]): Promise<void>;
}
```

**Cache Strategy:**
- **Key:** Hash of (companyId + query + options)
- **TTL:** 5 minutes (300,000ms)
- **Invalidation:** On content update (via event bus)
- **Storage:** In-memory Map (desktop) or Redis (cloud)

**Expected Impact:**
- 30-50% cache hit rate for repeated queries
- Reduced embedding API costs by similar amount
- Lower P95 latency

**Files to Modify:**
- `packages/intelligence/src/rag/service.ts`
- `apps/desktop/src/main/services/retrieval-orchestrator.ts`

---

## Part 3: High-Priority Issues (Priority 2)

### Issue #4: Fixed Embedding Model (Vendor Lock-In)

**Location:** `packages/provider-router/src/adapters/openai-embed.ts`

**Current State:**
```typescript
// Hard-coded to OpenAI text-embedding-3-small
model: 'text-embedding-3-small'
dimension: 1536
```

**Issues:**
- Cannot switch to cheaper/faster models
- Cannot compare different embedding providers
- Migration path requires re-embedding all data

**Recommended Fix:**
```typescript
interface EmbeddingProviderConfig {
  provider: 'openai' | 'cohere' | 'voyage' | 'huggingface';
  model: string;
  dimension: number;
  baseURL?: string;
  apiKey: string;
}

// Migrate existing embeddings when model changes
interface EmbeddingMigration {
  fromModel: string;
  toModel: string;
  progress: number;
  startedAt: number;
}
```

---

### Issue #5: Naive Chunking Strategy

**Location:** `packages/intelligence/src/rag/chunker.ts`

**Current Implementation:**
- Fixed 512 token chunks
- 64 token overlap
- Sentence boundary awareness
- Character-based token estimation (4 chars/token)

**Issues:**

| Problem | Impact |
|---------|--------|
| No semantic awareness | Breaks concepts mid-sentence |
| Crude token estimation | Actual tokens may vary 2-3x |
| Static overlap | Dense content needs more overlap |
| No structure awareness | Code blocks, lists split poorly |
| One-size-fits-all | Tickets vs code vs prose treated same |

**Recommended Improvements:**
```typescript
interface SemanticChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
  minChunkSize?: number;      // Avoid tiny chunks
  preserveStructure?: boolean; // Respect markdown/HTML
  contentType?: 'prose' | 'code' | 'mixed'; // Adaptive
  adaptiveOverlap?: boolean;   // More overlap for dense content
}

// Use proper tokenizer
import { getTokenizer } from 'tiktoken';
const tokenizer = getTokenizer('cl100k_base');

// Semantic boundary detection
interface ChunkBoundary {
  position: number;
  type: 'paragraph' | 'sentence' | 'code_block' | 'list' | 'heading';
  strength: number; // 0-1, preference for splitting here
}
```

---

### Issue #6: Hard-Coded Scoring Weights

**Location:** `apps/desktop/src/main/services/retrieval-orchestrator.ts:254-260`

**Current Weights:**
```typescript
const score =
  candidate.vectorScore * 0.45 +
  candidate.lexicalScore * 0.34 +
  (exact ? 0.16 : 0) +
  overlap * 0.12 +
  authority * 0.14 +
  recency * 0.08;
// Note: These sum to ~1.07 (can exceed 1.0)
```

**Issues:**
- Not tuned for your domain
- No per-query-type routing
- No learning from feedback
- Sum can exceed 1.0

**Recommended Fix:**
```typescript
interface ScoringConfig {
  weights: {
    vector: number;
    lexical: number;
    exact: number;
    overlap: number;
    authority: number;
    recency: number;
  };
  normalize: boolean; // Ensure result is 0-1
}

// Query-type routing
type QueryIntent = 'factual' | 'semantic' | 'lookup' | 'recent';
const INTENT_WEIGHTS: Record<QueryIntent, ScoringConfig> = {
  factual: { weights: { vector: 0.3, lexical: 0.5, /* ... */ } },
  semantic: { weights: { vector: 0.7, lexical: 0.1, /* ... */ } },
  // ...
};
```

---

### Issue #7: No Reranking Step

**Current State:** Results are ranked by the hybrid score and returned directly.

**Issue:** Initial retrieval often contains marginally relevant documents that push out truly relevant ones.

**Recommended Addition:**
```typescript
// Cross-encoder reranking for top-K results
interface Reranker {
  rerank(query: string, candidates: RetrievalHit[]): Promise<RetrievalHit[]>;
}

// Use lightweight cross-encoder
// Options: ms-marco-MiniLM, bge-reranker-base
async function crossEncoderRerank(
  query: string,
  candidates: RetrievalHit[]
): Promise<RetrievalHit[]> {
  // Score top-20 with cross-encoder
  // Re-rank and return top-K
}
```

**Expected Impact:** 10-20% improvement in Precision@5

---

### Issue #8: Missing Observability

**Current State:** No structured logging, no metrics, no tracing.

**Required Observability:**

| Signal | Current | Required |
|--------|---------|----------|
| **Retrieval Latency** | None | P50/P95/P99 |
| **Cache Hit Rate** | N/A | Percentage |
| **Embedding Failures** | Caught | Logged with retry |
| **Query Distribution** | None | By type, length, frequency |
| **Result Quality** | None | User feedback |
| **Token Usage** | Partial | By component |

**Recommended Implementation:**
```typescript
// Structured logging
interface RetrievalLog {
  timestamp: number;
  companyId: string;
  query: string;
  queryHash: string;
  latencyMs: number;
  resultCount: number;
  cacheHit: boolean;
  scores: number[];
  sources: EmbeddingSourceType[];
}

// Metrics export
interface RagMetrics {
  retrievalLatency: Histogram;
  cacheHitRate: Gauge;
  embeddingErrors: Counter;
  queryCount: Counter;
  resultScoreDistribution: Histogram;
}
```

---

## Part 4: Medium-Priority Issues (Priority 3)

### Issue #9: No Prompt Versioning

**Current State:** Prompts are hardcoded strings.

**Issues:**
- Cannot A/B test prompt variations
- Hard to rollback bad changes
- No tracking of which prompt version was used

**Recommended Solution:**
```typescript
interface PromptTemplate {
  id: string;
  version: string;
  name: string;
  template: string;
  variables: string[];
  fewShots?: FewShotExample[];
  metadata: {
    createdAt: number;
    author: string;
    changelog: string[];
  };
}

// Prompt registry with versioning
class PromptRegistry {
  get(id: string, version?: string): PromptTemplate;
  list(id: string): PromptTemplate[];
  deploy(template: PromptTemplate): void;
  rollback(id: string, toVersion: string): void;
}
```

---

### Issue #10: Long-Run Memory Limitations

**Current Tables:** `thread_digests`, `run_checkpoints`

**Strengths:**
- Captures state across sessions
- Pin facts, track blockers
- Multi-checkpoint history

**Limitations:**

| Issue | Impact |
|-------|--------|
| No automatic summarization | Digests must be manually created |
| No decay/freshness | Stale facts never aged out |
| No conflict resolution | Contradictory checkpoints not handled |
| No cross-thread learning | Lessons not shared between threads |

**Recommended Enhancements:**
```typescript
// Automatic summarization trigger
interface DigestTrigger {
  messageCount: number;      // Summarize every N messages
  tokenThreshold: number;     // Or when context exceeds X tokens
  timeSinceLast: number;      // Or after X hours
  significantEvent?: boolean; // Or on state changes
}

// Cross-thread knowledge extraction
interface LessonLearned {
  id: string;
  companyId: string;
  pattern: string;           // What was learned
  sourceThreadId: string;
  confidence: number;        // 0-1
  validated: boolean;        // User-confirmed?
  extractedAt: number;
  appliedCount: number;      // How often used
}

// Fact freshness scoring
interface Fact {
  content: string;
  confidence: number;
  lastValidated: number;
  decayRate: number;         // How fast confidence drops
}
```

---

### Issue #11: No Query Expansion

**Current State:** Simple keyword extraction from recent messages.

**Enhancement Opportunities:**
```typescript
// Query expansion strategies
interface QueryExpansion {
  // Generate semantic variations
  semantic(query: string): string[];

  // Add domain-specific synonyms
  synonym(query: string): string[];

  // Expand with related entities
  entity(query: string, companyId: string): string[];

  // HyDE: Hypothetical Document Embeddings
  hyde(query: string): Promise<string[]>;
}
```

---

### Issue #12: Agentic Loop Limitations

**Location:** `packages/intelligence/src/loop/loop.ts`

**Current State:** Clean ReAct implementation with budget enforcement.

**Limitations:**

| Limitation | Impact |
|------------|--------|
| No streaming | Users wait for complete responses |
| No multi-turn planning | Each tool call is myopic |
| No tool analytics | Don't know which tools fail most |
| No reflection | No self-correction after errors |

**Recommended Enhancements:**
```typescript
// Streaming support
interface StreamingAgenticLoop {
  run(userText: string): AsyncGenerator<LoopStep>;
}

// Multi-turn planning
interface PlanStep {
  description: string;
  tools: string[];
  dependencies: string[];
  estimatedSteps: number;
}

// Tool usage analytics
interface ToolInvocationLog {
  toolName: string;
  argsHash: string;
  duration: number;
  success: boolean;
  errorMessage?: string;
  timestamp: number;
}

// Reflection step
interface Reflection {
  shouldReflect(): boolean;
  reflect(run: LoopRun): ReflectionResult;
}
```

---

## Part 5: Low-Priority Enhancements

### Issue #13: No Deduplication Strategy

**Issue:** Similar content may be embedded multiple times (e.g., minor edits to a ticket).

**Recommendation:**
```typescript
// Near-duplicate detection
async function findDuplicates(
  embedding: number[],
  threshold: number = 0.95
): Promise<string[]> {
  // Find existing embeddings with high similarity
  // Merge or mark as duplicates
}
```

---

### Issue #14: No Metadata Filtering

**Issue:** Can't efficiently pre-filter by date, source type, or other metadata.

**Recommendation:**
```typescript
// Pre-filter before vector search
interface MetadataFilter {
  sourceTypes?: EmbeddingSourceType[];
  dateRange?: { start: number; end: number };
  minAuthority?: number;
  excludeIds?: string[];
}

// Apply filter before expensive vector search
const filtered = await repo.listByFilters(input.companyId, filters);
```

---

## Part 6: Security & Compliance

### Current State

| Area | Status |
|------|--------|
| **API Key Storage** | ✅ Using keytar (OS credential store) |
| **Data at Rest** | ✅ SQLite with filesystem encryption |
| **Data in Transit** | ✅ HTTPS for external API calls |
| **PII Handling** | ⚠️ No explicit PII detection |
| **Audit Logging** | ❌ No audit trail for AI operations |
| **Rate Limiting** | ⚠️ Partial (only for external APIs) |

**Recommendations:**
1. Add PII detection before embedding
2. Implement audit logging for all AI operations
3. Add rate limiting for local operations
4. Implement data retention policies for embeddings

---

## Part 7: Performance Targets

### Baseline Metrics (To Be Established)

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Retrieval Latency P50** | ? | <50ms | Percentile |
| **Retrieval Latency P95** | ? | <100ms | Percentile |
| **Retrieval Latency P99** | ? | <200ms | Percentile |
| **Precision@5** | ? | >0.8 | Relevance |
| **Recall@10** | ? | >0.7 | Coverage |
| **MRR** | ? | >0.85 | Ranking |
| **Cache Hit Rate** | 0% | >30% | Efficiency |
| **Embedding Throughput** | ? | >100 docs/s | Batch |
| **Indexing Latency** | ? | <500ms | Real-time |

### Load Testing Plan

```typescript
// Load test scenarios
interface LoadTestScenario {
  name: string;
  concurrentQueries: number;
  duration: number; // seconds
  targetLatencyP95: number;
  dataset: 'small' | 'medium' | 'large'; // 1K, 10K, 100K chunks
}

// Required scenarios
const SCENARIOS: LoadTestScenario[] = [
  { name: 'baseline', concurrentQueries: 1, duration: 60, /* ... */ },
  { name: 'concurrent-10', concurrentQueries: 10, duration: 60, /* ... */ },
  { name: 'concurrent-50', concurrentQueries: 50, duration: 60, /* ... */ },
  { name: 'spike-100', concurrentQueries: 100, duration: 30, /* ... */ },
];
```

---

## Part 8: Implementation Roadmap

### Phase 1: Critical Fixes (Week 1-2)

| Task | Effort | Impact | Dependencies |
|------|--------|--------|--------------|
| Add sqlite-vec integration | 3 days | 🔥 Critical | None |
| Build evaluation framework | 2 days | 🔥 Critical | None |
| Create golden dataset (50 queries) | 2 days | 🔥 Critical | None |
| Add query caching | 1 day | 🟡 High | None |

### Phase 2: Performance & Quality (Week 3-4)

| Task | Effort | Impact | Dependencies |
|------|--------|--------|--------------|
| Implement reranking | 2 days | 🟡 High | Eval framework |
| Improve chunking strategy | 2 days | 🟡 High | None |
| Add structured logging | 1 day | 🟡 High | None |
| Build metrics dashboard | 2 days | 🟢 Medium | Logging |

### Phase 3: Enterprise Features (Week 5-6)

| Task | Effort | Impact | Dependencies |
|------|--------|--------|--------------|
| Add prompt versioning | 1 day | 🟢 Medium | None |
| Implement query expansion | 2 days | 🟢 Medium | None |
| Add observability/tracing | 2 days | 🟢 Medium | Logging |
| Enhance long-run memory | 3 days | 🟢 Medium | None |

### Phase 4: Optimization (Week 7-8)

| Task | Effort | Impact | Dependencies |
|------|--------|--------|--------------|
| Add streaming to agentic loop | 2 days | 🟢 Medium | None |
| Implement multi-turn planning | 3 days | 🟢 Medium | Loop |
| Add tool analytics | 1 day | 🟢 Medium | None |
| Performance tuning | 2 days | 🟢 Medium | All above |

---

## Part 9: Success Criteria

### Definition of Done for Each Issue

| Issue | Acceptance Criteria |
|-------|-------------------|
| **sqlite-vec** | P95 latency <100ms at 10K chunks |
| **Evaluation** | 50+ labeled queries, automated CI checks |
| **Caching** | 30%+ hit rate, 5min TTL, proper invalidation |
| **Reranking** | 10%+ Precision@5 improvement |
| **Chunking** | Semantic boundaries, proper tokenization |
| **Logging** | Structured JSON logs, searchable |
| **Metrics** | Dashboard with P50/P95/P99, trends |
| **Prompts** | Versioned, deployable, rollback-capable |

---

## Part 10: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Performance degradation** | Medium | High | Load testing, monitoring |
| **Quality regression** | Medium | High | Evaluation framework, CI gates |
| **Vendor lock-in** | Low | Medium | Provider abstraction layer |
| **Data loss during migration** | Low | Critical | Backups, dry-run mode |
| **Cost overruns** | Medium | Medium | Caching, batch processing |
| **Security breach** | Low | Critical | PII detection, audit logs |

---

## Appendix A: File Inventory

### RAG Components

| File | Purpose | Lines |
|------|---------|-------|
| `packages/intelligence/src/rag/chunker.ts` | Text chunking | ~70 |
| `packages/intelligence/src/rag/embeddings.ts` | Embedding generator | ~42 |
| `packages/intelligence/src/rag/retriever.ts` | Similarity math | ~58 |
| `packages/intelligence/src/rag/service.ts` | RAG facade | ~168 |
| `apps/desktop/src/main/services/rag-indexer.ts` | Event-driven indexing | ~223 |
| `apps/desktop/src/main/services/rag-rebuild.ts` | Batch reindexing | ~107 |
| `apps/desktop/src/main/services/retrieval-orchestrator.ts` | Hybrid retrieval | ~508 |
| `apps/desktop/src/main/db/repos/embeddings.ts` | CRUD operations | ~75 |

### Agentic Components

| File | Purpose | Lines |
|------|---------|-------|
| `packages/intelligence/src/loop/loop.ts` | ReAct orchestrator | ~536 |
| `packages/intelligence/src/loop/prompt.ts` | System prompt builder | ~99 |
| `packages/intelligence/src/loop/tool-registry.ts` | Tool dispatch | ~200 |

### Memory Components

| File | Purpose | Lines |
|------|---------|-------|
| `apps/desktop/src/main/services/context-assembler-service.ts` | Context assembly | ~883 |
| `apps/desktop/src/main/db/repos/run-checkpoints.ts` | Checkpoint CRUD | ~85 |

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **RAG** | Retrieval-Augmented Generation |
| **ReAct** | Reasoning + Acting (agentic pattern) |
| **Cosine Similarity** | Dot product of normalized vectors (0-1) |
| **Embedding** | Vector representation of text |
| **Chunking** | Splitting long text into smaller pieces |
| **MRR** | Mean Reciprocal Rank (ranking metric) |
| **NDCG** | Normalized Discounted Cumulative Gain |
| **HyDE** | Hypothetical Document Embeddings |
| **ANN** | Approximate Nearest Neighbor |
| **FTS** | Full-Text Search |

---

## Appendix C: References

- [RAGatouille: ColBERT-based RAG](https://github.com/bclavie/RAGatouille)
- [LangChain RAG Evaluation](https://python.langchain.com/docs/guides/evaluation/)
- [LlamaIndex Retrieval Evaluation](https://docs.llamaindex.ai/en/stable/evaluating/)
- [sqlite-vec Documentation](https://github.com/asg017/sqlite-vec)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Information Retrieval Metrics](https://en.wikipedia.org/wiki/Information_retrieval)

---

**End of Audit**

*Next Steps: Begin with Issue #1 (sqlite-vec integration)*
