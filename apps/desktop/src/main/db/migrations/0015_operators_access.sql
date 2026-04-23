-- Migration 0015 — operators and access foundation.
--
-- Introduces durable human-operator identity and company-scoped access
-- memberships. This keeps Team-X local-first by default while removing
-- the "single human with no row in storage" assumption from the data model.

CREATE TABLE `operators` (
  `id` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL,
  `email` text,
  `auth_mode` text NOT NULL DEFAULT 'local',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE `operator_memberships` (
  `id` text PRIMARY KEY NOT NULL,
  `operator_id` text NOT NULL REFERENCES `operators`(`id`) ON DELETE CASCADE,
  `company_id` text NOT NULL REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL,
  `can_approve_budget` integer NOT NULL DEFAULT 0,
  `can_approve_authority` integer NOT NULL DEFAULT 0,
  `can_manage_routines` integer NOT NULL DEFAULT 0,
  `can_manage_runtimes` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operator_memberships_company` ON `operator_memberships`(`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_operator_memberships_operator` ON `operator_memberships`(`operator_id`);
--> statement-breakpoint
CREATE INDEX `idx_operator_memberships_operator_company`
  ON `operator_memberships`(`operator_id`, `company_id`);
