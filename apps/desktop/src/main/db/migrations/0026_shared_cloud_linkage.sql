ALTER TABLE `companies`
  ADD `cloud_workspace_id` text;
--> statement-breakpoint

ALTER TABLE `companies`
  ADD `cloud_tenant_id` text;
--> statement-breakpoint

ALTER TABLE `companies`
  ADD `cloud_link_state` text NOT NULL DEFAULT 'unlinked';
--> statement-breakpoint

ALTER TABLE `companies`
  ADD `linked_device_id` text;
--> statement-breakpoint

ALTER TABLE `companies`
  ADD `last_synced_cursor_json` text;
--> statement-breakpoint

ALTER TABLE `companies`
  ADD `last_snapshot_id` text;
--> statement-breakpoint

ALTER TABLE `companies`
  ADD `last_sync_at` integer;
--> statement-breakpoint

ALTER TABLE `companies`
  ADD `last_sync_error` text;
--> statement-breakpoint

CREATE INDEX `idx_companies_cloud_workspace` ON `companies` (`cloud_workspace_id`);
--> statement-breakpoint
CREATE INDEX `idx_companies_cloud_link_state` ON `companies` (`cloud_link_state`);
