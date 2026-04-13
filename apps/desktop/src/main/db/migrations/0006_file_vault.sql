CREATE TABLE `file_vault` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL REFERENCES `companies`(`id`),
	`filename` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL DEFAULT 'application/octet-stream',
	`size_bytes` integer NOT NULL DEFAULT 0,
	`sha256` text NOT NULL,
	`vault_path` text NOT NULL,
	`extracted_text` text,
	`tags_json` text NOT NULL DEFAULT '[]',
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
