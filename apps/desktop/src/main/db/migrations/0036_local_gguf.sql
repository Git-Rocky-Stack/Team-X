-- Migration 0036 — Local & Networked GGUF Support (v3.3.0 — Phase 1, spec § 7).
--
-- Introduces five tables backing the local GGUF feature:
--   * local_model_endpoints      — remote LAN endpoints (LM Studio / Ollama / …)
--   * local_model_watch_folders  — folder-scan sources (local + UNC/SMB)
--   * local_models               — the library (file / folder-entry / remote-endpoint)
--   * local_model_advanced_params — per-model tuning overrides (PK = model_id)
--   * local_model_benchmarks     — benchmark history per model (CRUD in Phase 10)
--
-- Declared endpoints-first so every FK target precedes its referrer. CHECK
-- constraints enforce the source_type / status / privacy_tier value domains,
-- the 0/1 domain on boolean-typed integers, and the source-shape invariant
-- that disambiguates how a local_models row points at its backing source
-- (file/folder → source_path, no endpoint; remote-endpoint → endpoint_id, no
-- source_path).
--
-- Hand-authored to match this repo's migration workflow (drizzle-kit
-- generate is not used past 0002 — no meta snapshots are maintained; the
-- runtime + sql.js migrators apply NNNN_*.sql in journal order). Mirrors the
-- table/index/check declarations in schema.ts.
--
-- Forward-only. Rollback note: dropping these five tables is safe (no other
-- table references them). To fully roll back, also remove every consumer in
-- packages/local-gguf-runtime/, the local-gguf adapters in
-- packages/provider-router/, the local-gguf-embed branch in
-- packages/intelligence/src/rag/embeddings.ts, and
-- apps/desktop/src/main/services/local-gguf/. Not reversible by SQL alone.
CREATE TABLE `local_model_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`auth_header_key_ref` text,
	`privacy_tier` text DEFAULT 'Local' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `local_model_endpoints_privacy_tier_check` CHECK (`privacy_tier` = 'Local'),
	CONSTRAINT `local_model_endpoints_status_check` CHECK (`status` in ('unknown', 'reachable', 'unreachable', 'auth-failed'))
);
--> statement-breakpoint
CREATE TABLE `local_model_watch_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`recursive` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_scan_at` integer,
	`last_scan_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `local_model_watch_folders_recursive_check` CHECK (`recursive` in (0, 1)),
	CONSTRAINT `local_model_watch_folders_status_check` CHECK (`status` in ('unknown', 'reachable', 'unreachable'))
);
--> statement-breakpoint
CREATE TABLE `local_models` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`source_type` text NOT NULL,
	`source_path` text,
	`endpoint_id` text,
	`gguf_arch` text,
	`gguf_params_b` real,
	`gguf_quant` text,
	`gguf_context_max` integer,
	`gguf_size_bytes` integer,
	`gguf_sha256` text,
	`gguf_chat_template` text,
	`is_embedding_model` integer DEFAULT false NOT NULL,
	`is_tool_capable` integer DEFAULT false NOT NULL,
	`hf_repo_id` text,
	`hf_filename` text,
	`license` text,
	`chat_template_override` text,
	`system_prompt_override` text,
	`status` text DEFAULT 'cold' NOT NULL,
	`status_detail` text,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`endpoint_id`) REFERENCES `local_model_endpoints`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `local_models_source_type_check` CHECK (`source_type` in ('file', 'folder-entry', 'remote-endpoint')),
	CONSTRAINT `local_models_status_check` CHECK (`status` in ('cold', 'loading', 'loaded', 'error', 'unreachable', 'missing')),
	CONSTRAINT `local_models_is_embedding_model_check` CHECK (`is_embedding_model` in (0, 1)),
	CONSTRAINT `local_models_is_tool_capable_check` CHECK (`is_tool_capable` in (0, 1)),
	CONSTRAINT `local_models_source_shape_check` CHECK (
		(`source_type` = 'file' AND `source_path` IS NOT NULL AND `endpoint_id` IS NULL) OR
		(`source_type` = 'folder-entry' AND `source_path` IS NOT NULL AND `endpoint_id` IS NULL) OR
		(`source_type` = 'remote-endpoint' AND `endpoint_id` IS NOT NULL AND `source_path` IS NULL)
	)
);
--> statement-breakpoint
CREATE TABLE `local_model_advanced_params` (
	`model_id` text PRIMARY KEY NOT NULL,
	`n_ctx` integer,
	`n_gpu_layers` integer,
	`n_batch` integer,
	`n_threads` integer,
	`temperature` real,
	`top_p` real,
	`top_k` integer,
	`repeat_penalty` real,
	`mmap` integer,
	`mlock` integer,
	`flash_attention` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `local_models`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `local_model_advanced_params_mmap_check` CHECK (`mmap` IS NULL OR `mmap` in (0, 1)),
	CONSTRAINT `local_model_advanced_params_mlock_check` CHECK (`mlock` IS NULL OR `mlock` in (0, 1)),
	CONSTRAINT `local_model_advanced_params_flash_attention_check` CHECK (`flash_attention` IS NULL OR `flash_attention` in (0, 1))
);
--> statement-breakpoint
CREATE TABLE `local_model_benchmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`prompt_eval_tok_s` real NOT NULL,
	`gen_tok_s` real NOT NULL,
	`ttft_ms` integer NOT NULL,
	`vram_peak_mb` integer,
	`backend` text NOT NULL,
	`n_ctx_used` integer NOT NULL,
	`n_gpu_layers_used` integer NOT NULL,
	`ran_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `local_models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_local_models_source_type` ON `local_models` (`source_type`);
--> statement-breakpoint
CREATE INDEX `idx_local_models_status` ON `local_models` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_local_models_last_used_at` ON `local_models` (`last_used_at`);
--> statement-breakpoint
CREATE INDEX `idx_local_models_endpoint_id` ON `local_models` (`endpoint_id`);
--> statement-breakpoint
CREATE INDEX `idx_local_model_benchmarks_model_id_ran_at` ON `local_model_benchmarks` (`model_id`,`ran_at`);
--> statement-breakpoint
CREATE INDEX `idx_local_model_watch_folders_status` ON `local_model_watch_folders` (`status`);
