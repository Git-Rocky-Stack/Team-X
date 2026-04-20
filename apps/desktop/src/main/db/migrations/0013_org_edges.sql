-- Migration 0013 — org_edges table (Phase 5.6 M-C step a, restoring Phase 2 — M9).
--
-- Context: M9 originally shipped the org chart on the
-- `worktree-phase-2-the-org` branch but the branch was never merged into
-- main (audit row 2.16, P0). The Phase 5.6 M-C remediation restores the
-- table here under migration 0013 with two design upgrades over the
-- worktree original:
--   1. ON DELETE CASCADE on every FK (worktree had bare FKs) — keeps
--      hard-deletes safe when M-C step e ships `companies.delete`.
--   2. Composite index on (company_id, manager_id) — accelerates the
--      hot-path `orgchart.get` tree projection (walking the org from
--      the CEO down requires repeated "list reports of manager X"
--      queries).
--
-- The UNIQUE constraint on report_id enforces single-manager-per-report
-- at the SQL layer (no diamond inheritance, no orphaned reports). Cycle
-- detection lives in the org-edges repo's `wouldCycle()` helper (M-C
-- step c) — the SQL layer cannot detect cycles without a recursive CTE
-- and embedding the check in a trigger would surprise non-app callers
-- (drizzle-studio, raw queries).
--
-- CASCADE rationale:
-- - company_id: when a company is hard-deleted (M-C step e), every org
--   edge for that company drops cleanly. Matches 0011's company_id
--   CASCADE on copilot_insights.
-- - manager_id / report_id: hard-deleting an employee row (test
--   fixtures, M-G branch cleanup) cascades the edge. Production
--   `employees.fire` is a soft-delete (firedAt column); soft-deleted
--   managers retain edges and the repo's tree projection filters them
--   at read time.
--
-- Upgrade note:
-- Some pre-remediation builds created the worktree-original `org_edges`
-- table before this numbered migration existed. Those databases have a
-- Drizzle journal below 0013, so a plain CREATE TABLE fails at startup.
-- This migration deliberately normalizes both states:
--   - no `org_edges` table: create an empty source table, then rebuild it
--     into the final shape;
--   - legacy `org_edges` table: copy existing edges into the final shape.
DROP TABLE IF EXISTS `org_edges_0013_rebuild`;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `org_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `manager_id` text NOT NULL REFERENCES `employees`(`id`) ON DELETE CASCADE,
  `report_id` text NOT NULL REFERENCES `employees`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `org_edges_0013_rebuild` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `manager_id` text NOT NULL REFERENCES `employees`(`id`) ON DELETE CASCADE,
  `report_id` text NOT NULL REFERENCES `employees`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `org_edges_0013_rebuild` (`id`, `company_id`, `manager_id`, `report_id`, `created_at`)
SELECT `id`, `company_id`, `manager_id`, `report_id`, `created_at`
FROM `org_edges`;
--> statement-breakpoint
DROP TABLE `org_edges`;
--> statement-breakpoint
ALTER TABLE `org_edges_0013_rebuild` RENAME TO `org_edges`;
--> statement-breakpoint
CREATE UNIQUE INDEX `org_edges_report_id_unique` ON `org_edges`(`report_id`);
--> statement-breakpoint
CREATE INDEX `idx_org_edges_company_manager` ON `org_edges`(`company_id`, `manager_id`);
