import type { ReactNode } from 'react';

import { LampTile, type LampTone } from './lamp-tile';
import { RecessedWell } from './recessed-well';

import { cn } from '@/lib/utils';

interface SubviewStateProps {
  /** Stencil word-lamp carrying the state: STBY (empty/idle) / NO-GO (fault). */
  lampLabel: string;
  lampTone: LampTone;
  title: string;
  description?: string;
  /** Optional trailing control (e.g. a Retry button). */
  action?: ReactNode;
  /** Optional leading slot rendered above the title (e.g. a kbd hint). */
  children?: ReactNode;
  /** E2E selector passthrough. */
  testId?: string;
  /**
   * Layout override merged onto the well via cn() — compact hosts (e.g. the
   * dashboard copilot widget) pass `min-h-0 p-4` to retire the 12rem floor.
   */
  className?: string;
}

/**
 * Shared empty/error/loading state — a recessed display well with a stencil
 * word-lamp as the sole status carrier (DESIGN.md: status is a word, not an
 * icon). Promoted from features/dashboard into the console library so the
 * dashboard sub-views AND the autonomy cluster read as one family instead of
 * ad-hoc raw text + Lucide glyphs.
 */
export function SubviewState({
  lampLabel,
  lampTone,
  title,
  description,
  action,
  children,
  testId,
  className,
}: SubviewStateProps) {
  return (
    <RecessedWell
      data-testid={testId}
      className={cn(
        'flex h-full min-h-[12rem] flex-1 flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
    >
      <LampTile label={lampLabel} tone={lampTone} small interactive={false} />
      <div className="space-y-1">
        <p className="text-body-strong text-[var(--display-fg)]">{title}</p>
        {description ? <p className="max-w-md text-body text-silver-mute">{description}</p> : null}
      </div>
      {children}
      {action}
    </RecessedWell>
  );
}
