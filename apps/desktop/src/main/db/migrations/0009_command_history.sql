CREATE TABLE `command_history` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL REFERENCES `companies`(`id`),
  `actor_id` text NOT NULL,
  `text` text NOT NULL,
  `intent` text NOT NULL,
  `entities_json` text NOT NULL,
  `executed_at` text NOT NULL,
  `outcome` text NOT NULL,
  `result_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_command_history_company_time` ON `command_history`(`company_id`, `executed_at` DESC);
