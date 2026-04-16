CREATE TABLE `copilot_insights` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `category` text NOT NULL CHECK(`category` IN ('operational', 'cost', 'org', 'workflow', 'anomaly')),
  `severity` text NOT NULL CHECK(`severity` IN ('critical', 'warning', 'info')),
  `title` text NOT NULL,
  `detail` text NOT NULL,
  `action_suggestion` text,
  `action_intent` text,
  `action_entities_json` text,
  `dismissed_at` integer,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_insights_company_active` ON `copilot_insights`(`company_id`, `dismissed_at`, `expires_at`);
