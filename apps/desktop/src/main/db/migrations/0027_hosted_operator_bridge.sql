ALTER TABLE `operator_invites`
  ADD `source_kind` text NOT NULL DEFAULT 'local';
--> statement-breakpoint
ALTER TABLE `operator_invites`
  ADD `cloud_workspace_id` text;
--> statement-breakpoint
ALTER TABLE `operator_invites`
  ADD `hosted_invite_id` text;
--> statement-breakpoint
CREATE INDEX `idx_operator_invites_company_source`
  ON `operator_invites`(`company_id`, `source_kind`);
--> statement-breakpoint
ALTER TABLE `operator_memberships`
  ADD `source_kind` text NOT NULL DEFAULT 'local';
--> statement-breakpoint
ALTER TABLE `operator_memberships`
  ADD `cloud_workspace_id` text;
--> statement-breakpoint
ALTER TABLE `operator_memberships`
  ADD `hosted_invite_id` text;
--> statement-breakpoint
CREATE INDEX `idx_operator_memberships_company_source`
  ON `operator_memberships`(`company_id`, `source_kind`);
