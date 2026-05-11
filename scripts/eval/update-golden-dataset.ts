/**
 * Update Golden Dataset with Real Document IDs
 *
 * This script extracts actual document IDs from the database and updates
 * the golden-dataset.ts file with real IDs for evaluation.
 *
 * Usage:
 *   npx tsx scripts/eval/update-golden-dataset.ts
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *   --min-count  Minimum documents required per type (default: 3)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

interface Options {
  dryRun: boolean;
  minCount: number;
}

interface DocMapping {
  ticket_1: string;
  ticket_2: string;
  ticket_3: string;
  ticket_blocked: string;
  ticket_high_priority: string;
  ticket_assigned: string;
  ticket_unassigned: string;
  project_1: string;
  project_2: string;
  project_active: string;
  project_risk: string;
  project_q1: string;
  project_q2: string;
  goal_1: string;
  goal_2: string;
  goal_revenue: string;
  goal_active: string;
  message_1: string;
  message_2: string;
  message_decision: string;
  vault_doc_1: string;
  vault_doc_2: string;
  vault_meeting: string;
  meeting_1: string;
  meeting_standup: string;
}

/**
 * Get database path from environment or default.
 */
function getDatabasePath(): string {
  return process.env.TEAM_X_DB_PATH || join(process.cwd(), 'team-x.db');
}

/**
 * Extract document IDs from database by type and criteria.
 */
function extractDocumentIds(db: Database.Database, minCount: number): Partial<DocMapping> {
  const mapping: Partial<DocMapping> = {};

  // Helper to get source_id from embeddings by source type
  const getSourceIds = (sourceType: string, limit = 10): string[] => {
    const stmt = db.prepare(`
      SELECT DISTINCT source_id
      FROM embeddings
      WHERE source_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return (stmt.all(sourceType, limit) as { source_id: string }[]).map((r) => r.source_id);
  };

  // Helper to search for specific content
  const searchByContent = (sourceType: string, searchTerms: string[], limit = 5): string[] => {
    const results = new Set<string>();
    for (const term of searchTerms) {
      const stmt = db.prepare(`
        SELECT DISTINCT source_id
        FROM embeddings
        WHERE source_type = ? AND content_text LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      const rows = stmt.all(sourceType, `%${term}%`, limit) as { source_id: string }[];
      for (const r of rows) results.add(r.source_id);
      if (results.size >= limit) break;
    }
    return Array.from(results);
  };

  // Extract tickets
  const tickets = getSourceIds('ticket', 10);
  if (tickets.length >= minCount) {
    mapping.ticket_1 = tickets[0];
    mapping.ticket_2 = tickets[1] ?? tickets[0];
    mapping.ticket_3 = tickets[2] ?? tickets[0];
  }

  // Search for blocked tickets
  const blockedTickets = searchByContent('ticket', ['blocked', 'stuck', 'waiting'], 3);
  if (blockedTickets.length > 0) mapping.ticket_blocked = blockedTickets[0];

  // Search for high priority tickets
  const highPrioTickets = searchByContent('ticket', ['high', 'urgent', 'critical'], 3);
  if (highPrioTickets.length > 0) mapping.ticket_high_priority = highPrioTickets[0];

  // Search for assigned tickets (has assignee mentioned)
  const assignedTickets = searchByContent('ticket', ['assigned', 'owner', 'assignee'], 3);
  if (assignedTickets.length > 0) mapping.ticket_assigned = assignedTickets[0];

  // Search for unassigned tickets
  const unassignedTickets = searchByContent('ticket', ['unassigned', 'open', 'available'], 3);
  if (unassignedTickets.length > 0) mapping.ticket_unassigned = unassignedTickets[0];

  // Extract projects
  const projects = getSourceIds('project', 10);
  if (projects.length >= minCount) {
    mapping.project_1 = projects[0];
    mapping.project_2 = projects[1] ?? projects[0];
  }

  // Search for active projects
  const activeProjects = searchByContent('project', ['active', 'in progress', 'ongoing'], 3);
  if (activeProjects.length > 0) mapping.project_active = activeProjects[0];

  // Search for at-risk projects
  const riskProjects = searchByContent('project', ['risk', 'delayed', 'behind'], 3);
  if (riskProjects.length > 0) mapping.project_risk = riskProjects[0];

  // Search for Q1/Q2 projects
  const q1Projects = searchByContent('project', ['Q1', 'quarter 1', 'first quarter'], 3);
  if (q1Projects.length > 0) mapping.project_q1 = q1Projects[0];

  const q2Projects = searchByContent('project', ['Q2', 'quarter 2', 'second quarter'], 3);
  if (q2Projects.length > 0) mapping.project_q2 = q2Projects[0];

  // Extract goals
  const goals = getSourceIds('goal', 10);
  if (goals.length >= minCount) {
    mapping.goal_1 = goals[0];
    mapping.goal_2 = goals[1] ?? goals[0];
  }

  // Search for revenue goals
  const revenueGoals = searchByContent('goal', ['revenue', 'sales', 'income'], 3);
  if (revenueGoals.length > 0) mapping.goal_revenue = revenueGoals[0];

  // Search for active goals
  const activeGoals = searchByContent('goal', ['active', 'current', 'ongoing'], 3);
  if (activeGoals.length > 0) mapping.goal_active = activeGoals[0];

  // Extract messages
  const messages = getSourceIds('message', 10);
  if (messages.length >= minCount) {
    mapping.message_1 = messages[0];
    mapping.message_2 = messages[1] ?? messages[0];
  }

  // Search for decision messages
  const decisionMessages = searchByContent('message', ['decided', 'agreed', 'concluded'], 3);
  if (decisionMessages.length > 0) mapping.message_decision = decisionMessages[0];

  // Extract vault files
  const vaultDocs = getSourceIds('vault_file', 10);
  if (vaultDocs.length >= 2) {
    mapping.vault_doc_1 = vaultDocs[0];
    mapping.vault_doc_2 = vaultDocs[1];
  }

  // Search for meeting files in vault
  const meetingVault = searchByContent('vault_file', ['meeting', 'standup', 'review'], 3);
  if (meetingVault.length > 0) mapping.vault_meeting = meetingVault[0];

  // Extract meeting minutes
  const meetings = getSourceIds('meeting_minutes', 10);
  if (meetings.length >= 1) {
    mapping.meeting_1 = meetings[0];
  }

  // Search for standup meetings
  const standups = searchByContent('meeting_minutes', ['standup', 'daily'], 3);
  if (standups.length > 0) mapping.meeting_standup = standups[0];

  return mapping;
}

/**
 * Update the golden-dataset.ts file with new document IDs.
 */
function updateGoldenDataset(mapping: Partial<DocMapping>, dryRun: boolean): void {
  const datasetPath = join(process.cwd(), 'packages/intelligence/src/eval/golden-dataset.ts');
  let content = readFileSync(datasetPath, 'utf-8');

  // Track changes
  const changes: Array<{ key: string; oldValue: string; newValue: string }> = [];

  // Replace each placeholder
  for (const [key, value] of Object.entries(mapping)) {
    const placeholder = `${key.toUpperCase()}_PLACEHOLDER`;
    const regex = new RegExp(`${key}:\\s*['"]${placeholder}['"]`, 'g');

    const oldValue = `${key}: '${placeholder}'`;
    const newValue = `${key}: '${value}'`;

    if (content.match(regex)) {
      content = content.replace(regex, `${key}: '${value}'`);
      changes.push({ key, oldValue, newValue });
    } else {
      console.warn(`⚠️  Could not find placeholder for ${key}`);
    }
  }

  // Report changes
  console.log('\n📊 Document ID Mapping Summary:');
  console.log('━'.repeat(60));

  const byType = {
    ticket: Object.keys(mapping).filter((k) => k.startsWith('ticket')),
    project: Object.keys(mapping).filter((k) => k.startsWith('project')),
    goal: Object.keys(mapping).filter((k) => k.startsWith('goal')),
    message: Object.keys(mapping).filter((k) => k.startsWith('message')),
    vault: Object.keys(mapping).filter((k) => k.startsWith('vault')),
    meeting: Object.keys(mapping).filter((k) => k.startsWith('meeting')),
  };

  for (const [type, keys] of Object.entries(byType)) {
    if (keys.length === 0) continue;
    console.log(`\n${type.toUpperCase()}:`);
    for (const key of keys) {
      const value = mapping[key as keyof DocMapping];
      console.log(`  ${key}: ${value}`);
    }
  }

  console.log(`\n${'━'.repeat(60)}`);
  console.log(`✅ Found ${changes.length} document IDs`);

  // Write file
  if (!dryRun) {
    writeFileSync(datasetPath, content, 'utf-8');
    console.log('✅ Updated golden-dataset.ts');
  } else {
    console.log('🔄 Dry run - file not modified');
  }
}

/**
 * Main execution.
 */
function main() {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: args.includes('--dry-run'),
    minCount: Number.parseInt(
      args.find((a) => a.startsWith('--min-count='))?.split('=')[1] ?? '3',
      10,
    ),
  };

  console.log('🔍 Updating Golden Dataset with Real Document IDs');
  console.log('━'.repeat(60));
  console.log(`Database: ${getDatabasePath()}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Min count per type: ${options.minCount}`);
  console.log('━'.repeat(60));

  // Open database
  const db = new Database(getDatabasePath());

  try {
    // Check if embeddings table exists
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'")
      .get();

    if (!tableExists) {
      console.error('❌ Embeddings table not found. Run migrations first.');
      process.exit(1);
    }

    // Count embeddings by type
    const counts = db
      .prepare('SELECT source_type, COUNT(*) as count FROM embeddings GROUP BY source_type')
      .all() as { source_type: string; count: number }[];

    console.log('\n📊 Current embeddings by type:');
    for (const row of counts) {
      console.log(`  ${row.source_type}: ${row.count}`);
    }

    // Extract document IDs
    console.log('\n🔍 Extracting document IDs...');
    const mapping = extractDocumentIds(db, options.minCount);

    // Update dataset
    updateGoldenDataset(mapping, options.dryRun);

    // Check for missing mappings
    const allKeys: (keyof DocMapping)[] = [
      'ticket_1',
      'ticket_2',
      'ticket_3',
      'ticket_blocked',
      'ticket_high_priority',
      'ticket_assigned',
      'ticket_unassigned',
      'project_1',
      'project_2',
      'project_active',
      'project_risk',
      'project_q1',
      'project_q2',
      'goal_1',
      'goal_2',
      'goal_revenue',
      'goal_active',
      'message_1',
      'message_2',
      'message_decision',
      'vault_doc_1',
      'vault_doc_2',
      'vault_meeting',
      'meeting_1',
      'meeting_standup',
    ];

    const missing = allKeys.filter((k) => !mapping[k]);
    if (missing.length > 0) {
      console.log('\n⚠️  Missing document IDs:');
      for (const key of missing) {
        console.log(`  - ${key}`);
      }
      console.log('\n💡 Add more content to the database or lower --min-count');
    }

    console.log('\n✅ Done!');
  } finally {
    db.close();
  }
}

main();
