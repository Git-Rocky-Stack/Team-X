/**
 * Golden Evaluation Dataset for Team-X RAG System
 *
 * This dataset contains representative queries across different intents
 * and difficulty levels, each labeled with relevant document IDs.
 *
 * To use this dataset for evaluation:
 * 1. Replace the placeholder document IDs with actual IDs from your system
 * 2. Add/modify queries to match your actual use cases
 * 3. Run evaluation using the evaluator in eval/evaluator.ts
 */

import type { EvalDataset, EvalQuery, QueryIntent } from './types.js';

/**
 * Placeholder document IDs.
 *
 * Replace these with actual document IDs from your system before running evaluation.
 * You can extract these from your database using:
 *
 * SELECT id, source_type, source_id FROM embeddings LIMIT 50;
 */
const DOCS = {
  // Tickets
  ticket_1: 'TICKET_001_PLACEHOLDER',
  ticket_2: 'TICKET_002_PLACEHOLDER',
  ticket_3: 'TICKET_003_PLACEHOLDER',
  ticket_blocked: 'TICKET_BLOCKED_PLACEHOLDER',
  ticket_high_priority: 'TICKET_HIGH_PRIO_PLACEHOLDER',
  ticket_assigned: 'TICKET_ASSIGNED_PLACEHOLDER',
  ticket_unassigned: 'TICKET_UNASSIGNED_PLACEHOLDER',

  // Projects
  project_1: 'PROJECT_001_PLACEHOLDER',
  project_2: 'PROJECT_002_PLACEHOLDER',
  project_active: 'PROJECT_ACTIVE_PLACEHOLDER',
  project_risk: 'PROJECT_RISK_PLACEHOLDER',
  project_q1: 'PROJECT_Q1_PLACEHOLDER',
  project_q2: 'PROJECT_Q2_PLACEHOLDER',

  // Goals
  goal_1: 'GOAL_001_PLACEHOLDER',
  goal_2: 'GOAL_002_PLACEHOLDER',
  goal_revenue: 'GOAL_REVENUE_PLACEHOLDER',
  goal_active: 'GOAL_ACTIVE_PLACEHOLDER',

  // Messages (conversations)
  message_1: 'MESSAGE_001_PLACEHOLDER',
  message_2: 'MESSAGE_002_PLACEHOLDER',
  message_decision: 'MESSAGE_DECISION_PLACEHOLDER',

  // Vault files
  vault_doc_1: 'VAULT_DOC_001_PLACEHOLDER',
  vault_doc_2: 'VAULT_DOC_002_PLACEHOLDER',
  vault_meeting: 'VAULT_MEETING_PLACEHOLDER',

  // Meeting minutes
  meeting_1: 'MEETING_001_PLACEHOLDER',
  meeting_standup: 'MEETING_STANDUP_PLACEHOLDER',
};

/**
 * Golden evaluation queries.
 *
 * Each query is tagged with:
 * - intent: Query type for routing
 * - difficulty: 1 (easiest) to 5 (hardest)
 * - relevantDocIds: Ground truth relevant documents
 * - tags: For categorization and filtering
 */
const QUERIES: EvalQuery[] = [
  // ============================================================================
  // FACTUAL QUERIES (1-5)
  // Direct lookups for specific information
  // ============================================================================

  {
    id: 'factual_001',
    query: 'What is the status of ticket TIX-001?',
    intent: 'factual',
    difficulty: 1,
    relevantDocIds: [DOCS.ticket_1],
    tags: ['ticket-lookup', 'status'],
    expectedAnswer: 'The status of ticket TIX-001 should be clearly stated (e.g., "In Progress", "Open", "Closed").',
  },
  {
    id: 'factual_002',
    query: 'Who is assigned to the high-priority ticket?',
    intent: 'factual',
    difficulty: 1,
    relevantDocIds: [DOCS.ticket_high_priority],
    tags: ['ticket-lookup', 'assignee'],
    expectedAnswer: 'Should return the employee name and title assigned to the high-priority ticket.',
  },
  {
    id: 'factual_003',
    query: 'What projects are linked to goal GOAL-001?',
    intent: 'factual',
    difficulty: 2,
    relevantDocIds: [DOCS.goal_1, DOCS.project_1, DOCS.project_2],
    tags: ['goal-lookup', 'projects'],
    expectedAnswer: 'Should list all projects that reference this goal as their parent goal.',
  },
  {
    id: 'factual_004',
    query: 'What is the target date for the Q1 project?',
    intent: 'factual',
    difficulty: 1,
    relevantDocIds: [DOCS.project_q1],
    tags: ['project-lookup', 'dates'],
    expectedAnswer: 'Should return the target/deadline date for the Q1 project.',
  },
  {
    id: 'factual_005',
    query: 'Show me the unassigned tickets',
    intent: 'factual',
    difficulty: 1,
    relevantDocIds: [DOCS.ticket_unassigned],
    tags: ['ticket-lookup', 'unassigned'],
    expectedAnswer: 'Should list tickets with no assignee.',
  },

  // ============================================================================
  // SEMANTIC QUERIES (6-10)
  // Concept-based searches requiring semantic understanding
  // ============================================================================

  {
    id: 'semantic_001',
    query: 'Show me blocked projects',
    intent: 'semantic',
    difficulty: 2,
    relevantDocIds: [DOCS.project_blocked, DOCS.project_risk],
    tags: ['project-status', 'blocked'],
    expectedAnswer: 'Should return projects that have blockers or are stuck/blocked.',
  },
  {
    id: 'semantic_002',
    query: 'What goals are at risk?',
    intent: 'semantic',
    difficulty: 3,
    relevantDocIds: [DOCS.goal_2, DOCS.project_risk],
    tags: ['goal-status', 'risk'],
    expectedAnswer: 'Should identify goals that are behind schedule or at risk of missing targets.',
  },
  {
    id: 'semantic_003',
    query: 'Find projects about revenue growth',
    intent: 'semantic',
    difficulty: 2,
    relevantDocIds: [DOCS.goal_revenue, DOCS.project_1],
    tags: ['project-search', 'revenue'],
    expectedAnswer: 'Should return projects related to revenue, sales, or growth targets.',
  },
  {
    id: 'semantic_004',
    query: 'What decisions were made about the Q1 launch?',
    intent: 'semantic',
    difficulty: 3,
    relevantDocIds: [DOCS.project_q1, DOCS.message_decision, DOCS.meeting_1],
    tags: ['decision-tracking', 'project'],
    expectedAnswer: 'Should summarize key decisions related to the Q1 launch project.',
  },
  {
    id: 'semantic_005',
    query: 'Show me high-priority items that are unassigned',
    intent: 'semantic',
    difficulty: 2,
    relevantDocIds: [DOCS.ticket_high_priority, DOCS.ticket_unassigned],
    tags: ['cross-source', 'priority', 'unassigned'],
    expectedAnswer: 'Should find items marked as high priority but with no assignee.',
  },

  // ============================================================================
  // RECENT/TEMPORAL QUERIES (11-14)
  // Time-based queries about recent activity
  // ============================================================================

  {
    id: 'recent_001',
    query: 'What happened in yesterday\'s standup?',
    intent: 'recent',
    difficulty: 2,
    relevantDocIds: [DOCS.meeting_standup],
    tags: ['meeting', 'standup', 'recent'],
    expectedAnswer: 'Should return the most recent standup meeting notes.',
  },
  {
    id: 'recent_002',
    query: 'What tickets were created this week?',
    intent: 'recent',
    difficulty: 2,
    relevantDocIds: [DOCS.ticket_2, DOCS.ticket_3],
    tags: ['ticket', 'recent', 'created'],
    expectedAnswer: 'Should list tickets with created_at within the past 7 days.',
  },
  {
    id: 'recent_003',
    query: 'What was discussed about the blocked project?',
    intent: 'recent',
    difficulty: 3,
    relevantDocIds: [DOCS.project_blocked, DOCS.message_2],
    tags: ['project', 'blocked', 'discussion'],
    expectedAnswer: 'Should surface conversations and documents mentioning the blocked project.',
  },
  {
    id: 'recent_004',
    query: 'Show me recent decisions about the revenue goal',
    intent: 'recent',
    difficulty: 3,
    relevantDocIds: [DOCS.goal_revenue, DOCS.message_1],
    tags: ['goal', 'revenue', 'decisions'],
    expectedAnswer: 'Should find recent messages or updates mentioning revenue targets.',
  },

  // ============================================================================
  // COMPLEX QUERIES (15-20)
  // Multi-step reasoning across multiple data sources
  // ============================================================================

  {
    id: 'complex_001',
    query: 'Which goals are at risk due to staffing issues?',
    intent: 'complex',
    difficulty: 4,
    relevantDocIds: [DOCS.goal_1, DOCS.project_risk, DOCS.ticket_unassigned],
    tags: ['multi-source', 'risk', 'staffing'],
    expectedAnswer: 'Should identify goals that may be at risk specifically because of unassigned work or staffing shortages.',
  },
  {
    id: 'complex_002',
    query: 'What projects need attention before the Q1 launch?',
    intent: 'complex',
    difficulty: 4,
    relevantDocIds: [DOCS.project_q1, DOCS.project_blocked, DOCS.ticket_1],
    tags: ['multi-source', 'project', 'deadline'],
    expectedAnswer: 'Should find projects related to Q1 that have issues, blockers, or incomplete work.',
  },
  {
    id: 'complex_003',
    query: 'What work is assigned to the project lead but not started?',
    intent: 'complex',
    difficulty: 4,
    relevantDocIds: [DOCS.project_1, DOCS.ticket_assigned, DOCS.project_active],
    tags: ['multi-source', 'assignee', 'status'],
    expectedAnswer: 'Should find tickets assigned to a project lead that are still in "Open" or "Todo" status.',
  },
  {
    id: 'complex_004',
    query: 'Show me all work related to the revenue goal that is behind schedule',
    intent: 'complex',
    difficulty: 5,
    relevantDocIds: [DOCS.goal_revenue, DOCS.project_2, DOCS.ticket_blocked, DOCS.project_risk],
    tags: ['multi-source', 'revenue', 'behind'],
    expectedAnswer: 'Should aggregate tickets, projects, and goals related to revenue that are not on track.',
  },
  {
    id: 'complex_005',
    query: 'What dependencies exist between the active projects?',
    intent: 'complex',
    difficulty: 5,
    relevantDocIds: [DOCS.project_active, DOCS.project_1, DOCS.project_2],
    tags: ['multi-source', 'dependencies', 'projects'],
    expectedAnswer: 'Should identify relationships or dependencies between projects (e.g., shared tickets, parent-child goals).',
  },
  {
    id: 'complex_006',
    query: 'What unassigned high-priority work is blocking the Q1 project?',
    intent: 'complex',
    difficulty: 4,
    relevantDocIds: [DOCS.project_q1, DOCS.ticket_high_priority, DOCS.ticket_unassigned, DOCS.project_blocked],
    tags: ['multi-source', 'blocking', 'unassigned'],
    expectedAnswer: 'Should find unassigned high-priority tickets that are linked to or blocking the Q1 project.',
  },

  // ============================================================================
  // LOOKUP QUERIES (21-25)
  // Exact match lookups by ID or name
  // ============================================================================

  {
    id: 'lookup_001',
    query: 'Find ticket TIX-123',
    intent: 'lookup',
    difficulty: 1,
    relevantDocIds: [DOCS.ticket_1],
    tags: ['ticket', 'exact-match'],
    expectedAnswer: 'Should return the exact ticket with ID TIX-123 or similar.',
  },
  {
    id: 'lookup_002',
    query: 'Find the project called "Q1 Launch"',
    intent: 'lookup',
    difficulty: 1,
    relevantDocIds: [DOCS.project_q1],
    tags: ['project', 'name-match'],
    expectedAnswer: 'Should return the project with title matching "Q1 Launch".',
  },
  {
    id: 'lookup_003',
    query: 'Find the document "Q1 Planning Notes"',
    intent: 'lookup',
    difficulty: 1,
    relevantDocIds: [DOCS.vault_doc_1],
    tags: ['vault', 'name-match'],
    expectedAnswer: 'Should return the vault file with that exact name.',
  },
  {
    id: 'lookup_004',
    query: 'Find goal "Increase MRR to 100K"',
    intent: 'lookup',
    difficulty: 1,
    relevantDocIds: [DOCS.goal_revenue],
    tags: ['goal', 'name-match'],
    expectedAnswer: 'Should return the goal with that exact title.',
  },
  {
    id: 'lookup_005',
    query: 'Find the standup meeting from 2024-04-28',
    intent: 'lookup',
    difficulty: 1,
    relevantDocIds: [DOCS.meeting_standup],
    tags: ['meeting', 'date-match'],
    expectedAnswer: 'Should return the meeting with that exact date.',
  },

  // ============================================================================
  // ADDITIONAL SEMANTIC QUERIES (26-30)
  // More semantic searches to test vocabulary variation
  // ============================================================================

  {
    id: 'semantic_006',
    query: 'What needs to be done for the upcoming release?',
    intent: 'semantic',
    difficulty: 3,
    relevantDocIds: [DOCS.project_q1, DOCS.ticket_2, DOCS.ticket_3],
    tags: ['project', 'release', 'tasks'],
    expectedAnswer: 'Should find open tickets and project tasks related to an upcoming release.',
  },
  {
    id: 'semantic_007',
    query: 'What infrastructure issues are we tracking?',
    intent: 'semantic',
    difficulty: 2,
    relevantDocIds: [DOCS.ticket_1, DOCS.ticket_blocked],
    tags: ['ticket', 'infrastructure'],
    expectedAnswer: 'Should return tickets tagged with infrastructure, backend, or similar.',
  },
  {
    id: 'semantic_008',
    query: 'Where are we stuck on the backend API work?',
    intent: 'semantic',
    difficulty: 3,
    relevantDocIds: [DOCS.ticket_blocked, DOCS.message_2],
    tags: ['blocked', 'backend', 'api'],
    expectedAnswer: 'Should find blocked tickets or discussions about backend API work.',
  },
  {
    id: 'semantic_009',
    query: 'What customer feedback have we received?',
    intent: 'semantic',
    difficulty: 2,
    relevantDocIds: [DOCS.ticket_1, DOCS.vault_doc_2],
    tags: ['customer', 'feedback'],
    expectedAnswer: 'Should find tickets or documents mentioning customer feedback.',
  },
  {
    id: 'semantic_010',
    query: 'What engineering debt items should we prioritize?',
    intent: 'semantic',
    difficulty: 3,
    relevantDocIds: [DOCS.ticket_2, DOCS.project_risk],
    tags: ['engineering-debt', 'priority'],
    expectedAnswer: 'Should find technical debt tickets or flagged items.',
  },
];

/**
 * The golden evaluation dataset.
 *
 * This is the canonical dataset for RAG evaluation.
 * Update this as your system evolves and new use cases emerge.
 */
export const GOLDEN_DATASET: EvalDataset = {
  name: 'team-x-golden-dataset',
  version: '1.0.0',
  queries: QUERIES,
  metadata: {
    createdAt: Date.now(),
    author: 'Rocky Elsalaymeh',
    description: 'Golden dataset for Team-X RAG evaluation. Covers factual, semantic, recent, complex, and lookup queries.',
    lastUpdated: Date.now(),
  },
};

/**
 * Helper function to get placeholder document IDs that need to be replaced.
 */
export function getPlaceholderDocIds(): Record<string, string> {
  return DOCS;
}

/**
 * Helper function to validate the dataset before running evaluation.
 * Returns a list of errors that should be fixed.
 */
export function validateDataset(dataset: EvalDataset = GOLDEN_DATASET): Array<{
  type: 'error' | 'warning';
  message: string;
}> {
  const issues: Array<{ type: 'error' | 'warning'; message: string }> = [];

  // Check for placeholder IDs
  const hasPlaceholder = Object.values(DOCS).some((id) =>
    id.includes('PLACEHOLDER')
  );

  if (hasPlaceholder) {
    issues.push({
      type: 'error',
      message: 'Dataset contains placeholder document IDs. Replace with actual IDs from your system.',
    });
  }

  // Check for empty relevant doc lists
  const emptyRelevant = dataset.queries.filter((q) => q.relevantDocIds.length === 0);
  if (emptyRelevant.length > 0) {
    issues.push({
      type: 'error',
      message: `${emptyRelevant.length} queries have no relevant documents: ${emptyRelevant.map((q) => q.id).join(', ')}`,
    });
  }

  // Check for duplicate query IDs
  const ids = dataset.queries.map((q) => q.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    issues.push({
      type: 'error',
      message: `Duplicate query IDs found: ${[...new Set(duplicates)].join(', ')}`,
    });
  }

  // Check distribution across intents
  const intentCounts = dataset.queries.reduce((acc, q) => {
    acc[q.intent] = (acc[q.intent] || 0) + 1;
    return acc;
  }, {} as Record<QueryIntent, number>);

  const minPerIntent = 5;
  const lowIntentCounts = Object.entries(intentCounts)
    .filter(([, count]) => count < minPerIntent)
    .map(([intent, count]) => `${intent}: ${count} (need ${minPerIntent})`);

  if (lowIntentCounts.length > 0) {
    issues.push({
      type: 'warning',
      message: `Some intents have few queries: ${lowIntentCounts.join(', ')}`,
    });
  }

  // Check distribution across difficulty levels
  const difficultyCounts = dataset.queries.reduce((acc, q) => {
    const diff = q.difficulty ?? 3;
    acc[diff] = (acc[diff] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  for (let d = 1; d <= 5; d++) {
    if ((difficultyCounts[d] ?? 0) < 3) {
      issues.push({
        type: 'warning',
        message: `Difficulty ${d} has only ${difficultyCounts[d] ?? 0} queries (recommend 3+)`,
      });
    }
  }

  return issues;
}

/**
 * Helper to extract real document IDs from the database.
 *
 * Run this to get actual IDs to replace the placeholders:
 *
 * npx tsx -e "
 *   import Database from 'better-sqlite3';
 *   const db = new Database('./team-x.db');
 *   const tickets = db.prepare('SELECT id FROM tickets LIMIT 5').all();
 *   console.log('TICKET_IDS:', tickets.map(t => t.id));
 *   // Repeat for other source types
 * "
 */
export function extractDocIdsScript(): string {
  return `
// Run this script to extract actual document IDs from your database

import Database from 'better-sqlite3';

const db = new Database('./path/to/team-x.db');

// Extract ticket IDs
const tickets = db.prepare('SELECT id FROM tickets LIMIT 10').all();
console.log('Tickets:', tickets.map((t) => t.id));

// Extract project IDs
const projects = db.prepare('SELECT id FROM projects LIMIT 10').all();
console.log('Projects:', projects.map((p) => p.id));

// Extract goal IDs
const goals = db.prepare('SELECT id FROM goals LIMIT 10').all();
console.log('Goals:', goals.map((g) => g.id));

// Extract message IDs
const messages = db.prepare('SELECT id FROM messages LIMIT 10').all();
console.log('Messages:', messages.map((m) => m.id));

// Extract vault file IDs
const vault = db.prepare('SELECT id FROM vault_files LIMIT 10').all();
console.log('Vault files:', vault.map((v) => v.id));

db.close();
`;
}
