CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`name` text NOT NULL,
	`transport` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_health` text,
	`installed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`mcp_server_id` text,
	`input_json` text NOT NULL,
	`output_json` text,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
