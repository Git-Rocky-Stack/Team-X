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
   * click ritual — alert lamps render as buttons. An unlit lamp cannot
   * warn, so `alert` coerces `tone: 'off'` to warn visuals (a blink must
   * never be invisible).
   */
  alert?: boolean;
  acknowledged?: boolean;
  onAcknowledge?: () => void;
  /**
   * `false` renders a pure visual (always a <span>, never a button) for
   * hosts that own the interaction themselves — e.g. AnnunciatorRail
   * wraps lamps in ONE stable button per tile so element identity (and
   * keyboard focus) survives the ack→teleport ritual.
   */
  interactive?: boolean;
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
  interactive = true,
  className,
}: LampTileProps) {
  const blinking = alert && !acknowledged;
  // An unlit lamp cannot warn — alert tiles always show a visible tone.
  const effectiveTone = alert && tone === 'off' ? 'warn' : tone;
  // Strike ignition fires exactly once per live transition: the element
  // identity is preserved across the blink→steady class swap, so the CSS
  // animation starts when `animate-ignite` newly applies and will NOT
  // restart on later unrelated re-renders. Don't re-key this element.
  const classes = cn(
    'lamp',
    small && 'lamp-sm',
    effectiveTone !== 'off' && toneClass[effectiveTone],
    effectiveTone !== 'off' && !blinking && 'animate-ignite',
    blinking && 'animate-lamp-blink',
    className,
  );
  // Reduced-motion users see no blink — the UNACK affix keeps the
  // unacknowledged state legible by form, not just animation.
  const unackAffix = blinking ? (
    <span className="ml-1 hidden text-[0.8em] opacity-80 motion-reduce:inline">UNACK</span>
  ) : null;

  if (alert && interactive) {
    // Acknowledged lamps stay a focusable button (aria-disabled, click
    // no-ops) — swapping to a <span> mid-ritual would drop keyboard focus
    // to <body> the instant the user acknowledges (WCAG 2.4.3). An alert
    // lamp whose host forgot to wire onAcknowledge is likewise
    // aria-disabled, never an enabled no-op control.
    const canAck = !acknowledged && Boolean(onAcknowledge);
    return (
      <button
        type="button"
        aria-label={`${label} — ${acknowledged ? 'acknowledged' : 'unacknowledged'} warning`}
        aria-disabled={!canAck || undefined}
        className={cn(
          classes,
          canAck && 'lamp-interactive cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
        onClick={() => {
          if (canAck) onAcknowledge?.();
        }}
      >
        {label}
        {unackAffix}
      </button>
    );
  }
  return (
    <span className={classes}>
      {label}
      {unackAffix}
    </span>
  );
}
