/**
 * AuditEventChip — pure-view chip that renders an event-type badge in
 * the audit log (Phase 5 — M35 T3).
 *
 * This file is the component shell. All pure helpers (colour map,
 * label map, aria-label builder, payload-aware row summary) live in
 * `audit-event-chip-helpers.ts` so unit tests can exercise them
 * without pulling the `Badge` primitive's transitive `@/`-aliased
 * imports through vitest. That split mirrors the existing
 * `step-card-narrow.ts` + `step-card.tsx` convention.
 *
 * A11y contract (matches the audit row's existing contract):
 *   - Semantic colour class is ALWAYS paired with a visible text
 *     label — colour is never the sole meaning carrier.
 *   - `Badge` ships a built-in `focus:ring-2 focus:ring-ring
 *     focus:ring-offset-2` ring from `components/ui/badge.tsx`, so
 *     the chip inherits keyboard focus affordances wherever it sits
 *     inside an interactive parent.
 *   - `aria-label` carries the literal event-type name (e.g.
 *     `"Event type: copilot.analyzed"`) so screen readers announce
 *     the precise wire-level type, not just the title-cased label.
 *   - `data-event-type` mirrors the literal event type as a stable
 *     E2E selector surface (mirrors the M31 `data-step-kind` / M34
 *     `data-copilot-insight-id` convention).
 */

import type { ReactElement } from 'react';

import {
  getEventTypeAriaLabel,
  getEventTypeColor,
  getEventTypeLabel,
} from './audit-event-chip-helpers.js';

import { Badge } from '@/components/ui/badge.js';


// Re-export the helper surface so consumers (audit-view.tsx, tests,
// future features) can import everything chip-related from a single
// module path and aren't forced to know the file split exists.
export {
  DEFAULT_COLOR,
  EVENT_TYPE_COLORS,
  EVENT_TYPE_LABELS,
  ROW_SUMMARY_MAX_CHARS,
  SUMMARIZABLE_TYPES,
  buildRowSummary,
  formatEventType,
  getEventTypeAriaLabel,
  getEventTypeColor,
  getEventTypeLabel,
} from './audit-event-chip-helpers.js';

export interface AuditEventChipProps {
  eventType: string;
  /** Optional extra className for layout shims (e.g. `shrink-0`). */
  className?: string;
}

/**
 * Pure-view chip for an event type in the audit log.
 *
 * Renders the display label with the semantic colour class, exposes
 * the literal event-type name via `aria-label` + `data-event-type`,
 * and inherits the `Badge` primitive's focus-visible ring so the chip
 * remains keyboard-discoverable whenever it sits inside an
 * interactive element.
 */
export function AuditEventChip({ eventType, className }: AuditEventChipProps): ReactElement {
  const colorClass = getEventTypeColor(eventType);
  const displayLabel = getEventTypeLabel(eventType);
  const ariaLabel = getEventTypeAriaLabel(eventType);

  const mergedClassName = className
    ? `shrink-0 text-xs ${colorClass} ${className}`
    : `shrink-0 text-xs ${colorClass}`;

  return (
    <Badge
      variant="outline"
      aria-label={ariaLabel}
      data-event-type={eventType}
      className={mergedClassName}
    >
      {displayLabel}
    </Badge>
  );
}
