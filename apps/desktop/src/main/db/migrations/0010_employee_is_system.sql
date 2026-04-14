ALTER TABLE `employees` ADD COLUMN `is_system` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_employees_is_system` ON `employees` (`company_id`) WHERE `is_system` = 1;
