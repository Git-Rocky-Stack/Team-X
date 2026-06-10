import { cn } from '@/lib/utils';

export type Shift = 'night' | 'day';

interface ShiftToggleProps {
  shift: Shift;
  /** Wire to the existing company-level theme setting ('dark' ⇄ 'light'). */
  onToggle: (next: Shift) => void;
  className?: string;
}

/**
 * Night Ops / Day Shift switch. Presentation-only: persistence stays in the
 * existing company theme setting (mounted into chrome in sweep Phase 2).
 */
export function ShiftToggle({ shift, onToggle, className }: ShiftToggleProps) {
  const next: Shift = shift === 'night' ? 'day' : 'night';
  return (
    <button
      type="button"
      aria-pressed={shift === 'day'}
      onClick={() => onToggle(next)}
      className={cn(
        'cap inline-flex items-center gap-2 px-3.5 py-[7px] font-display text-[10.5px] font-[750] uppercase tracking-[0.1em] [font-variation-settings:"wdth"_110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-[7px] w-[7px] rounded-full bg-led-hold shadow-[0_0_7px_var(--led-hold)]"
      />
      {shift === 'night' ? 'NIGHT OPS — SWITCH TO DAY SHIFT' : 'DAY SHIFT — SWITCH TO NIGHT OPS'}
    </button>
  );
}
