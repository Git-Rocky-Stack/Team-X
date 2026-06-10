import { cn } from '@/lib/utils';

export type LampTone = 'off' | 'go' | 'hold' | 'warn' | 'exec' | 'armed';

interface LampTileProps {
  /** Stencil word, 2–6 chars: GO / HOLD / NO-GO / STBY / EXEC / ON AIR / SYS … */
  label: string;
  tone?: LampTone;
  /** Compact 19px variant */
  small?: boolean;
  /**
   * Dual-form red rule (DESIGN.md): an alert lamp BLINKS at 1Hz until
   * acknowledged, then burns steady until resolved. Acknowledgment is a
   * click ritual — alert lamps render as buttons.
   */
  alert?: boolean;
  acknowledged?: boolean;
  onAcknowledge?: () => void;
  className?: string;
}

const toneClass: Record<Exclude<LampTone, 'off'>, string> = {
  go: 'lamp-go',
  hold: 'lamp-hold',
  warn: 'lamp-warn',
  exec: 'lamp-exec',
  armed: 'lamp-armed',
};

export function LampTile({
  label,
  tone = 'off',
  small = false,
  alert = false,
  acknowledged = false,
  onAcknowledge,
  className,
}: LampTileProps) {
  const blinking = alert && !acknowledged;
  // Strike ignition fires exactly once per live transition: the element
  // identity is preserved across the blink→steady class swap, so the CSS
  // animation starts when `animate-ignite` newly applies and will NOT
  // restart on later unrelated re-renders. Don't re-key this element.
  const classes = cn(
    'lamp',
    small && 'lamp-sm',
    tone !== 'off' && toneClass[tone],
    tone !== 'off' && !blinking && 'animate-ignite',
    blinking && 'animate-lamp-blink',
    className,
  );
  // Reduced-motion users see no blink — the UNACK affix keeps the
  // unacknowledged state legible by form, not just animation.
  const unackAffix = blinking ? (
    <span className="ml-1 hidden text-[0.8em] opacity-80 motion-reduce:inline">UNACK</span>
  ) : null;

  if (alert) {
    return (
      <button
        type="button"
        aria-label={`${label} — ${acknowledged ? 'acknowledged' : 'unacknowledged'} warning`}
        className={cn(classes, 'cursor-pointer')}
        onClick={() => {
          if (!acknowledged) onAcknowledge?.();
        }}
      >
        {label}
        {unackAffix}
      </button>
    );
  }
  return <span className={classes}>{label}</span>;
}
