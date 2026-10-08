/**
 * RAG Evaluation Module
 *
 * Provides tools for evaluating retrieval-augmented generation systems.
 * Includes the evaluation dataset types, metric calculation, and the evaluation
 * harness. Callers supply their own labelled queries; no dataset ships here.
 */

export * from './types.js';
export * from './metrics.js';
export * from './evaluator.js';
