-- Migration 0022: Add sqlite-vec virtual table for O(1) vector similarity search
-- This replaces the O(n) brute-force cosine similarity in JavaScript

-- Step 1: Load sqlite-vec extension
-- Note: The extension must be loaded at runtime via better-sqlite3
-- This migration documents the expected schema

-- Step 2: Create virtual table for vector indexing
-- The vec0 extension provides HNSW indexing for approximate nearest neighbor search
CREATE VIRTUAL TABLE IF NOT EXISTS embeddings_vec USING vec0(
  embedding_float(1536)
);

-- Step 3: Create a view that joins embeddings with their vector representations
-- This allows efficient similarity searches while maintaining the original table structure
CREATE VIEW IF NOT EXISTS embeddings_with_vec AS
SELECT
  e.id,
  e.company_id,
  e.source_type,
  e.source_id,
  e.chunk_index,
  e.content_text,
  e.embedding,
  e.created_at,
  v.rowid AS vec_rowid
FROM embeddings e
INNER JOIN embeddings_vec v ON e.rowid = v.rowid;

-- Step 4: Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_embeddings_company_created
ON embeddings(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_embeddings_source_type_company
ON embeddings(source_type, company_id);

-- Step 5: Create trigger to automatically populate vec table on insert
CREATE TRIGGER IF NOT EXISTS embeddings_vec_insert
AFTER INSERT ON embeddings
BEGIN
  INSERT INTO embeddings_vec(rowid, embedding_float)
  VALUES (NEW.rowid, NEW.embedding);
END;

-- Step 6: Create trigger to update vec table on embedding update
CREATE TRIGGER IF NOT EXISTS embeddings_vec_update
AFTER UPDATE OF embedding ON embeddings
BEGIN
  UPDATE embeddings_vec
  SET embedding_float = NEW.embedding
  WHERE rowid = NEW.rowid;
END;

-- Step 7: Create trigger to remove from vec table on delete
CREATE TRIGGER IF NOT EXISTS embeddings_vec_delete
AFTER DELETE ON embeddings
BEGIN
  DELETE FROM embeddings_vec WHERE rowid = OLD.rowid;
END;

-- Migration metadata
INSERT INTO migration_metadata (migration_id, applied_at, description)
VALUES ('0022', strftime('%s', 'now'), 'Added sqlite-vec virtual table for vector similarity search');

-- Note: After applying this migration, run the population script
-- to sync existing embeddings to the vec table:
-- scripts/migrate-embeddings-to-vec.ts
