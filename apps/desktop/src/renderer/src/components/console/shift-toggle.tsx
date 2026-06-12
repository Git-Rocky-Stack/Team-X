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
        'cap stencil inline-flex items-center gap-2 px-3.5 py-[7px] text-[10.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {/* Functional LED, not decoration (DESIGN.md): lit amber while Day
          Shift is active, dark socket on Night Ops. */}
      <span
        aria-hidden="true"
        className={cn(
          'h-[7px] w-[7px] rounded-pill',
          shift === 'day'
            ? 'bg-led-hold shadow-[0_0_7px_var(--led-hold)]'
            : 'bg-[#1a1a1a] shadow-[inset_0_1px_1px_rgba(0,0,0,0.8)]',
        )}
      />
      {shift === 'night' ? 'NIGHT OPS — SWITCH TO DAY SHIFT' : 'DAY SHIFT — SWITCH TO NIGHT OPS'}
    </button>
  );
}
