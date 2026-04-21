# RAG + Agent Intelligence — Implementation Plan

**Date:** 2026-04-21  
**Design reference:** [`2026-04-21-rag-and-agent-intelligence-design.md`](./2026-04-21-rag-and-agent-intelligence-design.md)  
**Depends on:** existing Phase 5 intelligence surfaces:

- [`2026-04-13-team-x-phase-5-m28-rag-foundation.md`](./2026-04-13-team-x-phase-5-m28-rag-foundation.md)
- [`2026-04-13-team-x-phase-5-m29-rag-agent-integration.md`](./2026-04-13-team-x-phase-5-m29-rag-agent-integration.md)
- [`2026-04-13-team-x-phase-5-m30-nlu-engine.md`](./2026-04-13-team-x-phase-5-m30-nlu-engine.md)
- [`2026-04-14-team-x-phase-5-m31-agentic-loop.md`](./2026-04-14-team-x-phase-5-m31-agentic-loop.md)
- [`2026-04-16-team-x-phase-5-m33-copilot-service.md`](./2026-04-16-team-x-phase-5-m33-copilot-service.md)

## Overview

This plan turns the approved design into four implementation slices:

1. `Memory fabric`
2. `Retrieval orchestrator`
3. `Verified agents`
4. `Evaluation harness`

The order matters. Team-X should improve memory coverage before trying to make the agents more autonomous, because better action quality depends on better evidence.

---

## Slice 1: Memory Fabric

### Goal

Expand Team-X from message-centric retrieval into broader company-memory retrieval.

### Deliverables

- Extend the indexing surface beyond completed work messages and meeting minutes.
- Add source adapters for:
  - tickets
  - goals
  - projects
  - vault files
  - employee/org summaries
  - accepted plans or episodic summaries
- Enrich stored chunks with metadata:
  - `companyId`
  - `sourceType`
  - `sourceId`
  - `createdAt`
  - `updatedAt`
  - `importance`
  - `visibility`
  - `entityIds`
  - `semanticTags`
- Add source-aware rebuild support so indexing can be repaired or regenerated without deleting unrelated memory.

### Likely touchpoints

- `apps/desktop/src/main/services/rag-indexer.ts`
- `apps/desktop/src/main/index.ts`
- `packages/intelligence/src/rag/service.ts`
- embeddings repo + related shared types
- source repos for tickets, goals, projects, vault, employees

### Tests

- unit tests for new source mappers
- rag-indexer tests per source type
- rebuild tests for source-specific regeneration
- regression test proving existing message retrieval still works

### Exit criteria

- every major business object category can be indexed
- indexing remains additive and idempotent
- memory rebuild does not require a full-company destructive reset

---

## Slice 2: Retrieval Orchestrator

### Goal

Replace shallow "top-k embeddings appended to the prompt" behavior with a staged evidence pipeline.

### Deliverables

- Introduce a retrieval-orchestrator layer above the low-level RAG service.
- Implement query shaping:
  - direct subject search
  - related blockers/dependencies
  - ownership/deadline lookup
  - linked project/ticket context
- Combine:
  - vector retrieval
  - lexical or FTS retrieval
- Add reranking using:
  - recency
  - source authority
  - exact-match strength
  - source type weighting
  - entity overlap
- Replace naive prompt append with compact evidence packing:
  - diversity caps
  - duplicate suppression
  - token budget enforcement

### Likely touchpoints

- new retrieval orchestration service in `apps/desktop/src/main/services/`
- `apps/desktop/src/main/services/system-prompt.ts`
- `packages/intelligence/src/rag/service.ts`
- ticket/vault search helpers already available in main-process repos

### Tests

- unit tests for query shaping
- reranking tests with deterministic source ordering
- prompt assembly tests for duplicate suppression and diversity
- regression tests for no-RAG and empty-retrieval fallback behavior

### Exit criteria

- prompt context is smaller but better
- exact identifiers and semantic neighbors both retrieve correctly
- authoritative sources consistently outrank stale conversational fragments

---

## Slice 3: Verified Agents

### Goal

Make agents more reliable by tightening the relationship between parsing, planning, execution, and verification.

### Deliverables

- Improve the contract between:
  - intent classifier
  - entity resolver
  - slot filler
  - command execution
  - agentic loop
- Add retrieval-assisted entity resolution where helpful.
- Add a plan-first discipline for complex requests.
- Add verification gates so user-facing claims reflect actual state.
- Add or extend tools for:
  - role and responsibility lookup
  - staffing and onboarding
  - ticket/project verification
  - state checks after mutation
- Add response-state distinctions such as:
  - completed
  - recorded
  - delegated
  - pending
  - blocked

### Likely touchpoints

- `packages/intelligence/src/nlu/intent-classifier.ts`
- `packages/intelligence/src/nlu/entity-resolver.ts`
- `packages/intelligence/src/nlu/slot-filler.ts`
- `apps/desktop/src/main/services/command-service.ts`
- `apps/desktop/src/main/services/agentic-loop-service.ts`
- direct chat action tools and agentic tool registries

### Tests

- NLU regression cases for structured vs freeform routing
- ambiguity and clarification tests
- end-to-end verification tests for state-backed action claims
- regression tests for the "decision recorded, execution pending" case

### Exit criteria

- agents stop claiming success without evidence
- structured requests hit structured paths more reliably
- freeform loops verify mutations before narrating them as done

---

## Slice 4: Evaluation Harness

### Goal

Create a durable intelligence benchmark so improvements can be measured and guarded.

### Deliverables

- Retrieval scenario suite with expected sources and facts.
- NLU scenario suite with expected intents, entities, and clarification outcomes.
- Agent execution scenario suite with persisted-state assertions.
- Latency measurement for:
  - classify
  - retrieve
  - rerank
  - prompt-build
  - first-token
  - completion
  - tool round-trips
- A hard regression category for unverified action claims.

### Likely touchpoints

- deterministic test seams already in place:
  - fake embed adapter
  - test classifier
  - test agentic provider
  - test copilot provider
- existing unit and E2E harnesses
- optional lightweight telemetry surface for local diagnostics

### Tests

- locked retrieval eval fixtures
- locked NLU eval fixtures
- locked agent execution eval fixtures
- latency budget assertions where stable enough

### Exit criteria

- every intelligence slice has objective pass/fail gates
- regressions can be caught without live provider calls
- latency remains within acceptable product budgets

---

## Recommended Task Breakdown

### T1: Expand RAG indexing coverage

- Add ticket, goal, project, vault, and org-summary indexing adapters.
- Extend metadata carried through indexing.
- Keep current message and meeting-minute behavior intact.

### T2: Add source-aware rebuild and repair flows

- Rebuild per source class where possible.
- Avoid all-or-nothing deletes when repairing one category.

### T3: Add retrieval orchestrator

- New service that shapes queries, runs hybrid recall, reranks, and packs evidence.

### T4: Replace direct prompt append with curated evidence packs

- Update system-prompt assembly to consume orchestrated retrieval output.

### T5: Tighten NLU and clarification behavior

- Improve structured routing, alias handling, and ambiguity resolution.

### T6: Add verification-aware execution responses

- Teach agents to distinguish completed vs pending vs delegated vs blocked.

### T7: Extend tooling for state checks and org-aware actions

- Add missing verification and responsibility lookup tools where needed.

### T8: Build retrieval eval fixtures

- Deterministic retrieval scenarios with expected sources and facts.

### T9: Build NLU and execution eval fixtures

- Deterministic structured-command and verified-action scenarios.

### T10: Add latency and regression gates

- Track timing and hard-fail on unverified action-claim regressions.

---

## Verification Strategy

At the end of each slice:

- run targeted unit tests for touched modules
- run affected main/renderer typechecks
- run deterministic intelligence evals where available
- verify no regression to existing direct-chat, command, or copilot paths

At the end of the full plan:

- run cross-package typecheck
- run touched unit suites
- run the intelligence eval harness
- inspect a real local DB-backed scenario to confirm retrieved evidence and verified claims behave as designed

---

## Risks and Controls

- **Noise risk:** more indexed material can reduce quality if reranking lags.
  - Control: do not ship broader indexing without reranking and diversity caps close behind.
- **Latency risk:** hybrid retrieval can become expensive.
  - Control: instrument every stage and set budgets early.
- **Behavior drift risk:** agents may sound better before they become more truthful.
  - Control: enforce the no-unverified-action-claims rule in tests and runtime behavior.
- **Schema creep risk:** metadata expansion can sprawl.
  - Control: keep new metadata additive and constrained to retrieval needs.

---

## Recommended Immediate Next Step

Start with `T1 + T2` as one narrow milestone:

- expand indexing coverage
- add richer chunk metadata
- make rebuild and repair source-aware

This gives the rest of the stack a better substrate without forcing a large cross-cutting refactor in the first pass.
