CREATE TABLE `embeddings` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL REFERENCES `companies`(`id`),
  `source_type` text NOT NULL,
  `source_id` text NOT NULL,
  `chunk_index` integer NOT NULL DEFAULT 0,
  `content_text` text NOT NULL,
  `embedding` blob NOT NULL,
  `created_at` integer NOT NULL,
  UNIQUE(`source_id`, `chunk_index`)
);

CREATE INDEX `idx_embeddings_company` ON `embeddings`(`company_id`);
CREATE INDEX `idx_embeddings_source` ON `embeddings`(`source_type`, `source_id`);
