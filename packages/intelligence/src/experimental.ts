/**
 * `@team-x/intelligence/experimental` — subsystems that are not part of the
 * stable surface (audit 2026-10-07 P2-4).
 *
 * Nothing in the app imports these. They are kept, not deleted, because the
 * unified service builds on the evaluator internally and the others are
 * candidates for future work, but they carry no compatibility promise and
 * may change or go without notice. Do not import them from app code; if a
 * feature needs one, promote it to the root export (src/index.ts) with tests,
 * which updates the public-API snapshot on purpose.
 */

// Retrieval evaluation (used internally by the unified service).
export * from './eval/index.js';

// Prompt versioning — M29.
export * from './prompt/index.js';

// Metrics & dashboard — M29.
export * from './metrics/index.js';
