-- Migration 0024 — operator invites.
--
-- Adds durable shared-workspace invite rows so invited/cloud operator posture
-- can move from read-only readiness messaging into an explicit workflow without
-- forcing remote auth or sync to ship in the same slice.

CREATE TABLE `operator_invites` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `email` text NOT NULL,
  `display_name` text,
  `auth_mode` text NOT NULL DEFAULT 'invited',
  `role` text NOT NULL DEFAULT 'operator',
  `note` text,
  `invite_token` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `invited_by_operator_id` text NOT NULL REFERENCES `operators`(`id`) ON DELETE RESTRICT,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_operator_invites_company` ON `operator_invites`(`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_operator_invites_status` ON `operator_invites`(`status`);
--> statement-breakpoint
CREATE INDEX `idx_operator_invites_company_status`
  ON `operator_invites`(`company_id`, `status`);
