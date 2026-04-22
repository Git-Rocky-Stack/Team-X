-- Migration 0014 — extensions and authority foundation.
--
-- Adds the durable registry + authority tables for the unified
-- Extensions & Authority control plane. Existing MCP runtime tables
-- remain untouched; `extensions.runtime_ref_id` is the bridge seam
-- for future MCP wrapping without destabilizing `mcp_servers`.

CREATE TABLE `extensions` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `source_kind` text NOT NULL,
  `source_ref` text NOT NULL,
  `version` text,
  `update_channel` text,
  `manifest_json` text,
  `requested_capabilities_json` text NOT NULL DEFAULT '[]',
  `requested_paths_json` text NOT NULL DEFAULT '[]',
  `enabled` integer NOT NULL DEFAULT 1,
  `trust_state` text NOT NULL DEFAULT 'pending-review',
  `runtime_ref_id` text,
  `installed_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_extensions_company_kind` ON `extensions`(`company_id`, `kind`);
--> statement-breakpoint
CREATE INDEX `idx_extensions_slug` ON `extensions`(`slug`);
--> statement-breakpoint

CREATE TABLE `skill_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `extension_id` text NOT NULL REFERENCES `extensions`(`id`) ON DELETE CASCADE,
  `company_id` text NOT NULL REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `employee_id` text REFERENCES `employees`(`id`) ON DELETE CASCADE,
  `enabled` integer NOT NULL DEFAULT 1,
  `source` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_skill_assignments_company_employee`
  ON `skill_assignments`(`company_id`, `employee_id`);
--> statement-breakpoint
CREATE INDEX `idx_skill_assignments_extension` ON `skill_assignments`(`extension_id`);
--> statement-breakpoint

CREATE TABLE `authority_grants` (
  `id` text PRIMARY KEY NOT NULL,
  `scope_kind` text NOT NULL,
  `scope_id` text NOT NULL,
  `resource_kind` text NOT NULL,
  `resource_id` text NOT NULL,
  `permission` text NOT NULL,
  `metadata_json` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_authority_grants_scope` ON `authority_grants`(`scope_kind`, `scope_id`);
--> statement-breakpoint
CREATE INDEX `idx_authority_grants_resource`
  ON `authority_grants`(`resource_kind`, `resource_id`);
--> statement-breakpoint

CREATE TABLE `authority_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `extension_id` text NOT NULL REFERENCES `extensions`(`id`) ON DELETE CASCADE,
  `employee_id` text REFERENCES `employees`(`id`) ON DELETE CASCADE,
  `resource_kind` text NOT NULL,
  `resource_id` text NOT NULL,
  `requested_permission` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `reason` text,
  `created_at` integer NOT NULL,
  `reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_authority_requests_extension_status`
  ON `authority_requests`(`extension_id`, `status`);
