// packages/local-gguf-runtime/src/metadata/embedding-arches.ts
//
// Embedding-architecture classification for GGUF models.
//
// Embedding models (sentence-transformers, BERT-family encoders) report a
// distinct `general.architecture` value from generative LLMs and must be
// routed to llama-server's `--embedding` mode, never the chat completion
// path. There is no boolean GGUF field that says "this is an embedding
// model", so we classify by the well-known set of encoder architectures
// llama.cpp supports for embeddings. Matching is case-insensitive because
// `general.architecture` casing is not contractually fixed across exporters.
//
// Seed set rationale:
//   bert         — classic BERT encoders (e.g. BGE, GTE, E5 exported as bert)
//   nomic-bert   — Nomic Embed Text family
//   xlm-roberta  — multilingual RoBERTa encoders (e.g. BGE-M3)
//   e5 / bge     — some exporters set arch to the model family directly
//   gte          — Alibaba GTE embedding models (general.architecture = "gte")
//   t5           — T5 encoder embeddings
//   mpnet        — sentence-transformers all-mpnet family

const EMBEDDING_ARCHES: ReadonlySet<string> = new Set([
  'bert',
  'nomic-bert',
  'xlm-roberta',
  'e5',
  'bge',
  'gte',
  't5',
  'mpnet',
]);

/**
 * True when `arch` (a GGUF `general.architecture` value) denotes an encoder /
 * embedding architecture rather than a generative LLM. Case-insensitive.
 */
export function isEmbeddingArch(arch: string): boolean {
  return EMBEDDING_ARCHES.has(arch.toLowerCase());
}
