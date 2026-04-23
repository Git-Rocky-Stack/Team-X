CREATE TABLE `runtime_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `kind` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `config_json` text DEFAULT '{}' NOT NULL,
  `last_health_status` text DEFAULT 'unknown' NOT NULL,
  `last_health_message` text,
  `last_validated_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_runtime_profiles_company` ON `runtime_profiles` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_profiles_company_slug` ON `runtime_profiles` (`company_id`, `slug`);
--> statement-breakpoint
CREATE TABLE `employee_runtime_bindings` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `employee_id` text NOT NULL,
  `runtime_profile_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`runtime_profile_id`) REFERENCES `runtime_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_employee_runtime_bindings_company` ON `employee_runtime_bindings` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_employee_runtime_bindings_employee` ON `employee_runtime_bindings` (`employee_id`);
--> statement-breakpoint
CREATE INDEX `idx_employee_runtime_bindings_profile` ON `employee_runtime_bindings` (`runtime_profile_id`);
--> statement-breakpoint
CREATE INDEX `idx_employee_runtime_bindings_company_employee` ON `employee_runtime_bindings` (`company_id`, `employee_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_employee_runtime_bindings_employee` ON `employee_runtime_bindings` (`employee_id`);
