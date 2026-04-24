ALTER TABLE `operator_invites`
  ADD `accepted_operator_id` text REFERENCES `operators`(`id`) ON DELETE SET NULL;
