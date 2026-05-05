#!/usr/bin/env tsx
/**
 * Migration helper: Populate sqlite-vec table with existing embeddings.
 *
 * Run this after applying migration 0022 to index existing embeddings.
 * This script can also be used to rebuild the index if needed.
 *
 * Usage:
 *   npx tsx scripts/migrate-embeddings-to-vec.ts --company <company-id>
 *   npx tsx scripts/migrate-embeddings-to-vec.ts --all
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Options {
  company?: string;
  all?: boolean;
  dryRun?: boolean;
  dbPath?: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--company' && args[i + 1]) {
      opts.company = args[++i];
    } else if (arg === '--all') {
      opts.all = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--db' && args[i + 1]) {
      opts.dbPath = args[i + 1];
      ++i;
    }
  }

  return opts;
}

function getDbPath(opts: Options): string {
  if (opts.dbPath) return opts.dbPath;

  // Try common locations
  const paths = [
    join(__dirname, '../apps/desktop/src/main/db/team-x.db'),
    join(__dirname, '../apps/desktop/resources/team-x.db'),
    join(process.cwd(), 'team-x.db'),
  ];

  for (const path of paths) {
    try {
      const fs = require('node:fs');
      if (fs.existsSync(path)) return path;
    } catch {}
  }

  throw new Error('Could not find database. Specify with --db flag.');
}

async function migrate(opts: Options): Promise<void> {
  const dbPath = getDbPath(opts);
  console.log(`Using database: ${dbPath}`);

  const db = new Database(dbPath);

  try {
    // Load sqlite-vec extension
    // Note: This requires the sqlite-vec extension to be available
    // For Electron apps, it should be bundled with the app
    try {
      db.loadExtension('./sqlite-vec');
    } catch (e) {
      console.warn('Could not load sqlite-vec extension:', e);
      console.warn('The extension may need to be installed or compiled.');
      console.warn('Continuing anyway - vec table population may fail...');
    }

    // Check if vec table exists
    const vecExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings_vec'")
      .get();

    if (!vecExists) {
      console.error('embeddings_vec table does not exist.');
      console.error('Please run migration 0022 first.');
      process.exit(1);
    }

    // Build query
    let query = 'SELECT COUNT(*) as count FROM embeddings';
    const params: string[] = [];

    if (opts.company) {
      query += ' WHERE company_id = ?';
      params.push(opts.company);
    }

    const totalToMigrate = (db.prepare(query).get(...params) as { count: number }).count;
    console.log(`Total embeddings to migrate: ${totalToMigrate}`);

    if (totalToMigrate === 0) {
      console.log('Nothing to migrate.');
      return;
    }

    if (opts.dryRun) {
      console.log('[DRY RUN] Would migrate', totalToMigrate, 'embeddings');
      return;
    }

    // Perform migration
    console.log('Migrating embeddings to vec table...');

    const migrateQuery = `
      INSERT OR IGNORE INTO embeddings_vec (rowid, embedding_float)
      SELECT rowid, embedding FROM embeddings
      ${opts.company ? 'WHERE company_id = ?' : ''}
    `;

    const start = Date.now();
    const result = db.prepare(migrateQuery).run(...params);
    const elapsed = Date.now() - start;

    console.log(`Migration complete in ${elapsed}ms`);
    console.log(`  - Processed: ${result.changes} embeddings`);

    // Verify
    const vecCount = (
      db.prepare('SELECT COUNT(*) as count FROM embeddings_vec').get() as {
        count: number;
      }
    ).count;
    console.log(`  - Total in vec table: ${vecCount}`);

    // Show stats
    const stats = db
      .prepare(`
      SELECT source_type, COUNT(*) as count
      FROM embeddings
      ${opts.company ? 'WHERE company_id = ?' : ''}
      GROUP BY source_type
    `)
      .all(...params) as Array<{ source_type: string; count: number }>;

    console.log('\nEmbeddings by source type:');
    for (const stat of stats) {
      console.log(`  - ${stat.source_type}: ${stat.count}`);
    }
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const opts = parseArgs();

  if (!opts.company && !opts.all) {
    console.log('Usage: npx tsx scripts/migrate-embeddings-to-vec.ts [options]');
    console.log('');
    console.log('Options:');
    console.log('  --company <id>  Migrate embeddings for a specific company');
    console.log('  --all           Migrate all embeddings (default)');
    console.log('  --dry-run       Show what would be done without making changes');
    console.log('  --db <path>     Path to database file');
    process.exit(1);
  }

  await migrate(opts);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
