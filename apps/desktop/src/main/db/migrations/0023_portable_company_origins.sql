ALTER TABLE `companies`
ADD COLUMN `workspace_origin_id` text;
--> statement-breakpoint

ALTER TABLE `companies`
ADD COLUMN `company_origin_id` text;
--> statement-breakpoint

UPDATE `companies`
SET `workspace_origin_id` = `id`
WHERE `workspace_origin_id` IS NULL OR trim(`workspace_origin_id`) = '';
--> statement-breakpoint

UPDATE `companies`
SET `company_origin_id` = `id`
WHERE `company_origin_id` IS NULL OR trim(`company_origin_id`) = '';
--> statement-breakpoint

CREATE INDEX `idx_companies_workspace_origin` ON `companies` (`workspace_origin_id`);
--> statement-breakpoint

CREATE INDEX `idx_companies_company_origin` ON `companies` (`company_origin_id`);
