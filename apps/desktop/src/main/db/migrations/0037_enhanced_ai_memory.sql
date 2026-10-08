-- Migration 0037 — persistent storage for Enhanced AI long-term memory and
-- the knowledge graph.
--
-- `@team-x/intelligence` stores extracted facts, conversation summaries and
-- the entity graph built from them behind two repo interfaces
-- (LongTermMemoryRepo, KnowledgeGraphRepo). Until now the desktop app only
-- ever gave it the in-memory implementations, so "long-term" memory and the
-- graph were wiped every time the app exited. These four tables back the
-- SQL implementations in db/repos/enhanced-ai-memory.ts.
--
-- Each row keeps the package's object verbatim in `data_json` — the shapes
-- are owned by the package and carry nested arrays (fact ids, entities,
-- topics) — and promotes only the columns the repos filter or join on.
-- Rows cascade away with their company; edges cascade with either endpoint.
--
-- Hand-authored, journaled, forward-only. Rollback: dropping the four tables
-- is safe (nothing references them); Enhanced AI falls back to forgetting on
-- exit.
CREATE TABLE `memory_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`source_id` text NOT NULL,
	`type` text NOT NULL,
	`expires_at` integer,
	`data_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_memory_facts_company` ON `memory_facts` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_memory_facts_source` ON `memory_facts` (`source_id`);
--> statement-breakpoint
CREATE TABLE `memory_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`source_id` text NOT NULL,
	`data_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_memory_summaries_company` ON `memory_summaries` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_memory_summaries_source` ON `memory_summaries` (`source_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`source_id` text,
	`data_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_nodes_company` ON `knowledge_nodes` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_nodes_source` ON `knowledge_nodes` (`source_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`source_id` text,
	`data_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_node_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_node_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_edges_company` ON `knowledge_edges` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_edges_from` ON `knowledge_edges` (`from_node_id`);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_edges_to` ON `knowledge_edges` (`to_node_id`);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_edges_source` ON `knowledge_edges` (`source_id`);
