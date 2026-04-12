ALTER TABLE `messages` ADD `is_agent_initiated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `threads` ADD `last_message_at` integer;