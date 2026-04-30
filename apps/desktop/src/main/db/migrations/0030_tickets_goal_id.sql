-- Add goal_id column to tickets table for proactive execution (Phase 5)
-- References goals(id) for optional goal ancestry
ALTER TABLE `tickets` ADD `goal_id` text REFERENCES `goals`(`id`);
--> statement-breakpoint
-- Add parent_ticket_id column to tickets table for task decomposition hierarchies
ALTER TABLE `tickets` ADD `parent_ticket_id` text REFERENCES `tickets`(`id`);
