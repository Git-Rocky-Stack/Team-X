#!/usr/bin/env node
/**
 * Standalone diagnostic script to check provider configuration and API keys
 * Run with: node scripts/check-provider-setup-standalone.js
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

async function main() {
  // Try to read the database directly
  // better-sqlite3 is installed in apps/desktop
  const Database = await import(join(repoRoot, 'apps', 'desktop', 'node_modules', 'better-sqlite3'))
    .then(m => m.default)
    .catch(() => require('better-sqlite3'));
  const dbPath = join(repoRoot, 'apps', 'desktop', '.local-data', 'team-x', 'team-x.sqlite');

  console.log('Database path:', dbPath);
  console.log('\n--- Checking Provider Configuration ---\n');

  const db = new Database(dbPath, { readonly: true });

  try {
    // Check providers table
    const providers = db.prepare(`
      SELECT id, name, kind, privacy_tier, enabled
      FROM providers
      ORDER BY id
    `).all();

    console.log('Configured providers:');
    for (const p of providers) {
      console.log(`  ${p.id.padEnd(15)} ${p.name.padEnd(25)} ${p.kind.padEnd(15)} ${p.privacy_tier.padEnd(15)} ${p.enabled ? 'enabled' : 'disabled'}`);
    }

    // Check CEO employee preferences
    const ceo = db.prepare(`
      SELECT id, name, title, provider_pref, model_pref
      FROM employees
      WHERE id = 'rocky' OR level = 'officer'
      ORDER BY created_at ASC
      LIMIT 1
    `).get();

    if (ceo) {
      console.log('\n--- CEO Employee Preferences ---\n');
      console.log(`  ID: ${ceo.id}`);
      console.log(`  Name: ${ceo.name}`);
      console.log(`  Title: ${ceo.title}`);
      console.log(`  Provider Preference: ${ceo.provider_pref || 'null (defaults to anthropic)'}`);
      console.log(`  Model Preference: ${ceo.model_pref || 'null (uses provider default)'}`);
    } else {
      console.log('\nNo CEO employee found (id: rocky)');
    }

    // Check if keytar has Anthropic API key
    console.log('\n--- API Key Status ---\n');
    try {
      const keytar = await import('keytar').then(m => m.default);
      const apiKey = await keytar.getPassword('team-x', 'anthropic');
      if (apiKey && apiKey.length > 0) {
        console.log(`  ✓ Anthropic API key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
      } else {
        console.log(`  ✗ Anthropic API key: NOT FOUND or EMPTY`);
        console.log(`    → Set key with: pnpm run env:key-import`);
        console.log(`    → Or manually: keytar set --service=team-x --username=anthropic YOUR_API_KEY`);
      }
    } catch (err) {
      console.log(`  ✗ Could not check keychain: ${err.message}`);
      console.log(`    → Install keytar: npm install -g keytar`);
    }

    // Check if Ollama is available as fallback
    console.log('\n--- Ollama Status ---\n');
    const ollama = db.prepare(`SELECT * FROM providers WHERE id = 'ollama-local'`).get();
    if (ollama) {
      console.log(`  Status: ${ollama.enabled ? 'enabled' : 'disabled'}`);
      const config = JSON.parse(ollama.config_json || '{}');
      console.log(`  Base URL: ${config.baseUrl || 'default (http://localhost:11434/api)'}`);
      console.log(`    → Test: curl ${config.baseUrl || 'http://localhost:11434/api'}/tags`);
    } else {
      console.log(`  Ollama provider not found`);
    }

  } finally {
    db.close();
  }

  console.log('\n--- Recommendations ---\n');
  console.log('If CEO is timing out on Anthropic:');
  console.log('  1. Check API key above');
  console.log('  2. Test with: curl https://api.anthropic.com/v1/messages');
  console.log('  3. Try switching to Ollama (local) if no API key available');
  console.log('  4. Check for proxy/firewall blocking api.anthropic.com');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
