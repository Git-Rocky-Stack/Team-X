# Team-X RAG + Agent Intelligence Design

> **Status:** Approved 2026-04-21.
> **Scope:** Strengthen Team-X memory, retrieval, semantic understanding, and agent execution discipline so the product becomes more grounded, more capable, and more operationally truthful.
> **Primary driver:** Team-X already has RAG, NLU, and agent-loop seams, but they are still shallow enough that agents often retrieve too little context, reason over incomplete state, and narrate actions more confidently than they can verify.

---

## 1. Problem Statement

Team-X has the right architectural surfaces in place:

- a RAG service for embeddings and retrieval
- prompt-time RAG injection
- an intent classifier, entity resolver, and slot filler
- an agentic loop with read-side and write-side tools
- a copilot analyzer that can reason over company activity

The issue is not "missing AI architecture." The issue is that the current intelligence stack is still too thin in three places:

1. **Memory coverage is narrow.** The live indexer primarily captures completed work messages and meeting minutes. Important company state such as tickets, goals, projects, vault knowledge, org facts, and long-lived decisions is not consistently retrievable.
2. **Retrieval quality is shallow.** Retrieval is mostly a single similarity pass over embeddings, seeded from the last one or two user messages, then appended directly into the prompt. That improves recall somewhat, but it does not create strong semantic memory or evidence-ranked context.
3. **Agent action discipline is weak.** Agents can still produce managerial or procedural prose without a verified state mutation underneath it. The result is memo-like language that sounds decisive but is not grounded in persisted outcomes.

The product consequence is predictable:

- agents appear forgetful across turns
- semantic understanding depends too heavily on the live prompt
- answers can sound plausible while missing the best evidence
- action claims can outrun actual execution

---

## 2. Goals

- Expand RAG from chat-history retrieval into company-memory retrieval.
- Make operational facts, org knowledge, and uploaded documents retrievable in one unified memory layer.
- Improve retrieval relevance through hybrid search, reranking, and better context packing.
- Improve semantic understanding by making structured intent parsing and ambiguity handling more reliable.
- Make agents operationally truthful: no claim of completion without tool or state verification.
- Add measurable quality gates so intelligence improvements are evaluated by retrieval quality, action correctness, and latency rather than by perceived fluency alone.

---

## 3. Non-goals

- No immediate attempt to build a universal knowledge graph across every entity in the product.
- No model-size escalation as the primary solution. Better recall and execution discipline should come before heavier models.
- No rewrite of the existing orchestrator, command service, or provider-router abstractions.
- No unbounded memory retention. Distillation and curation remain necessary.
- No requirement that every user turn route through the freeform agent loop. Structured requests should still prefer structured execution paths.

---

## 4. Decisions

### 4.1 Memory becomes a first-class product surface

RAG is no longer treated as a prompt garnish. Team-X will evolve toward a persistent company-memory layer composed of operational, organizational, knowledge, and episodic sources.

### 4.2 Retrieval quality matters more than raw context volume

The product should retrieve fewer, better, more diverse facts instead of appending large numbers of semantically similar chunks into the system prompt.

### 4.3 Structured execution remains the default for structured requests

The NLU pipeline remains important. Explicit actions such as hire, assign, create, close, promote, or show should continue to route through structured intent resolution when possible. The agentic loop remains the fallback for genuinely open-ended work.

### 4.4 Agents must verify before claiming completion

If the assistant says something happened, there must be a tool result, event, or persisted state change backing it. When execution is pending, blocked, or delegated-but-unconfirmed, the assistant must say that plainly.

### 4.5 Evaluation is part of the design, not a later add-on

Every intelligence improvement must be measurable with deterministic tests and scenario-based evals, including retrieval relevance, semantic parsing accuracy, execution correctness, and latency budgets.

---

## 5. Memory Architecture

Team-X will evolve from message-centric retrieval to a unified memory fabric with four source classes.

### 5.1 Operational memory

Sources:

- tickets
- goals
- projects
- meetings
- work outputs
- audit and operational events

Purpose:

- answer questions about status, blockers, progress, accountability, ownership, and recent execution

### 5.2 Organizational memory

Sources:

- employee profiles
- role specs
- reporting lines
- permissions and tool visibility
- current responsibilities and active workload summaries

Purpose:

- answer who owns what, who should do what, and how responsibilities are distributed

### 5.3 Knowledge memory

Sources:

- vault files
- uploaded documents
- SOPs
- policies
- strategic notes
- role-pack instructions where appropriate

Purpose:

- ground answers in durable knowledge rather than ephemeral conversation alone

### 5.4 Episodic memory

Sources:

- thread summaries
- major decisions
- accepted plans
- delegated outcomes
- recurring blockers

Purpose:

- preserve important history without forcing retrieval to trawl raw turn-by-turn transcripts forever

### 5.5 Chunk metadata

Each memory record should carry enough metadata to support filtered retrieval and evidence ranking:

- `companyId`
- `sourceType`
- `sourceId`
- `chunkIndex`
- `createdAt`
- `updatedAt`
- `visibility`
- `importance`
- `entityIds`
- `semanticTags`

This allows queries like:

- "recent blockers for onboarding"
- "everything related to the CMO role"
- "facts about Sarah's current workload"

without relying on pure embedding similarity alone.

---

## 6. Retrieval Pipeline

Retrieval will move from a single similarity pass to a staged evidence pipeline.

### 6.1 Query shaping

Before retrieval, derive a small set of retrieval intents from the current turn:

- direct subject lookup
- related blockers or dependencies
- owners and deadlines
- related project or ticket context

This lets "why is onboarding stuck?" search not only for semantic neighbors of that sentence, but also for related tickets, owners, deadlines, and recent escalations.

### 6.2 Hybrid recall

Use both:

- vector similarity for semantic matching
- lexical or FTS search for exact names, acronyms, ticket IDs, role titles, and phrase matches

Semantic and lexical retrieval solve different problems. Team-X should use both.

### 6.3 Reranking

Candidates should be reranked using more than cosine similarity:

- source authority
- recency
- source type priority
- exact-match strength
- explicit entity overlap
- user-turn intent

Current project briefs, active tickets, and accepted plans should outrank stale conversational fragments when both are relevant.

### 6.4 Context packing

Instead of simply appending top-k chunks, build a compact evidence pack with:

- diversity across source classes
- duplicate suppression
- token budgeting
- priority for authoritative facts over casual discussion

The outcome should be a short, high-value context bundle, not a long semantically redundant paste.

### 6.5 Grounded-answer discipline

The prompt assembly layer should preserve the link between retrieved facts and generated answers, whether through explicit citations, internal evidence tracking, or structured reasoning traces. The product should always know which retrieved facts the model relied on.

---

## 7. Semantic Understanding

The existing NLU pipeline remains valuable, but it needs a stronger contract with the retrieval and execution layers.

### 7.1 Structured path first

Structured user requests should prefer:

1. intent classification
2. entity resolution
3. slot filling
4. execution preconditions
5. mutation or read-side execution

Only requests that genuinely require decomposition, synthesis, or open-ended reasoning should drop into the freeform agent loop.

### 7.2 Better ambiguity handling

The product should become more explicit when it is unsure:

- ambiguous role names
- duplicate employee names
- unclear deadlines
- fuzzy project references

Clarification is better than silent guesswork.

### 7.3 Retrieval-assisted understanding

Entity resolution and slot filling should be allowed to consult memory and current operational state, especially for:

- role aliases
- active project references
- recurring shorthand used by the company
- recent decisions that changed ownership or status

This makes semantic understanding less brittle than a raw string-only pass.

---

## 8. Agent Reasoning and Action Discipline

The goal is not simply to make agents sound more intelligent. The goal is to make them behave more reliably.

### 8.1 Plan before tool use

Open-ended loops should form a short internal plan before reaching for tools. This avoids impulsive tool calls and makes later verification easier.

### 8.2 Verify before claiming

Operational claims must be backed by one of:

- a successful tool result
- a persisted state check
- a new event emitted from a confirmed mutation path

If the system cannot verify completion, it must say:

- recorded
- delegated
- pending
- blocked

and not "completed."

### 8.3 Separate decision state from narration

Internally, the agent should maintain a progression like:

- interpreted request
- action plan
- tool results
- verification result
- final user-facing summary

This reduces the chance that polished prose outruns actual execution.

### 8.4 Tool breadth should follow memory breadth

As memory improves, tools should expose more grounded actions and checks, especially around:

- staffing and onboarding
- ticket creation and assignment
- project decomposition
- role and responsibility lookup
- policy and document retrieval
- verification queries over current state

---

## 9. Evaluation and Quality Gates

This design only succeeds if Team-X can measure it.

### 9.1 Retrieval evals

Create a fixed scenario set with expected source classes and target facts.

Measure:

- recall@k
- source-class coverage
- authoritative-source hit rate
- context-pack precision

### 9.2 NLU evals

Create a locked intent/entity scenario set covering:

- straightforward commands
- ambiguous references
- shorthand language
- multi-entity requests
- open-ended prompts that should fall through to the loop

Measure:

- intent accuracy
- entity resolution accuracy
- clarification correctness
- false-freeform rate

### 9.3 Agent execution evals

Create end-to-end scenarios where success means:

- correct plan formation
- correct tool selection
- verified state mutation or state check
- honest final response

This is where memo-sounding failures must be caught.

### 9.4 Latency and cost budgets

Track:

- classify latency
- retrieve latency
- rerank latency
- prompt-build latency
- first-token latency
- completion latency
- tool round-trip latency

Smarter cannot quietly become unusable.

### 9.5 Hard runtime policy

One product rule is mandatory:

> No unverified action claims.

This should be enforced both by runtime behavior and by regression tests.

---

## 10. Rollout Strategy

The work should ship in four sequential slices.

### Slice 1: Memory fabric

- expand indexing coverage
- add richer metadata
- support rebuilds and source-specific indexing

### Slice 2: Retrieval orchestrator

- query shaping
- hybrid retrieval
- reranking
- compact evidence packing

### Slice 3: Verified agents

- stronger execution preconditions
- plan-before-tool-use
- verify-before-claim
- richer action and verification tools

### Slice 4: Intelligence eval harness

- retrieval evals
- NLU evals
- agent execution evals
- latency and cost dashboards

This order is intentional. Better memory improves everything above it.

---

## 11. Risks

- **Scope creep:** "agent intelligence" can expand into many unrelated projects. The rollout must stay staged.
- **Index noise:** broader indexing without curation will increase irrelevant retrieval. Metadata and reranking are mandatory, not optional.
- **Latency regression:** hybrid retrieval and reranking can improve quality while harming usability if budgets are ignored.
- **False confidence:** better prompts can make the model sound smarter even if verification remains weak. The no-unverified-claims rule addresses this.
- **Schema pressure:** richer memory metadata may pressure current repo surfaces. New structure should remain additive and not force a broad rewrite.

---

## 12. Success Criteria

- Agents can retrieve relevant operational, organizational, and knowledge context beyond recent chat messages.
- Retrieval consistently surfaces authoritative sources before stale conversational fragments.
- Structured requests resolve more accurately and ask for clarification more honestly.
- Agentic runs use tools more deliberately and stop claiming actions that were not verified.
- Deterministic evals show measurable improvement in recall quality, execution correctness, and latency stability.

