import type { ComponentType, HTMLAttributes } from 'react';

import { LcdWell } from './lcd-well';

import { cn } from '@/lib/utils';

type MetricIcon = ComponentType<{ className?: string }>;

interface MetricTileProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** Eyebrow label above the readout. */
  label: string;
  /** The figure shown in the phosphor well. */
  value: string;
  /** Optional sub-line under the well. */
  hint?: string;
  /** Optional leading icon next to the label. */
  icon?: MetricIcon;
  /** LCD tone: undefined = green (default), amber = caution, red = fault. */
  tone?: 'amber' | 'red';
  /** When set, the tile renders as a button. */
  onClick?: () => void;
}

/**
 * Labeled console readout — an eyebrow label + a Departure-Mono LCD well + an
 * optional hint. The console replacement for the legacy MissionMetricTile.
 * Displays stay dark in both shifts (LcdWell carries the literal void/phosphor
 * values).
 */
export function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  onClick,
  className,
  ...props
}: MetricTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-eyebrow text-silver-mute">
        {Icon ? <Icon className="h-4 w-4 text-silver-mute" /> : null}
        {label}
      </div>
      <LcdWell tone={tone} className="px-3 py-1.5">
        <span className="text-numeric tabular-nums">{value}</span>
      </LcdWell>
      {hint ? <p className="text-caption text-silver-mute">{hint}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn('cap flex flex-col gap-2 p-4 text-left', className)}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-card border border-[var(--hairline)] p-4',
        className,
      )}
      {...props}
    >
      {body}
    </div>
  );
}
