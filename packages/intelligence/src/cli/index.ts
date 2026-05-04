/**
 * CLI Module
 *
 * Command-line interface for AI system management.
 * Phase 5 — M31 (Integration).
 */

export * from './ai-cli.js';

// CLI entry point for bin/team-x-ai
import { program } from './ai-cli.js';

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parseAsync(process.argv);
}
