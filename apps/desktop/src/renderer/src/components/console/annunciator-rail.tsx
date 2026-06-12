import { cn } from '@/lib/utils';

import { LampTile, type LampTone } from './lamp-tile';

export interface AnnunciatorTileSpec {
  /** Source view / system id — passed to onNavigate (teleport target) */
  id: string;
  /** Stencil word: SYS / ORG / TOKN / BUDG / GGUF / QUE / NET / MTG … */
  label: string;
  tone: LampTone;
  /**
   * Unacknowledged warning — blinks until acknowledged (dual-form rule).
   * `tone: 'off'` + `alert` coerces to warn visuals inside LampTile —
   * a warning blink must never be invisible.
   */
  alert?: boolean;
  acknowledged?: boolean;
}

interface AnnunciatorRailProps {
  tiles: AnnunciatorTileSpec[];
  /** Teleport: fired with the tile id when a LIT, non-blinking tile is clicked */
  onNavigate?: (id: string) => void;
  /** Master-caution ack: fired with the tile id on first click of a blinking tile */
  onAcknowledge?: (id: string) => void;
  className?: string;
}

/**
 * The signature element (DESIGN.md): a persistent strip of lamp tiles.
 * Strike ignition on light-up, 1Hz blink until click-to-ack, lit tiles
 * teleport to their source view. The strip itself is a dark display
 * surface in BOTH shifts (`.annunciator-strip`).
 *
 * Interaction ritual: each interactive tile is ONE stable <button> whose
 * meaning changes with state — first activation acknowledges the blink
 * (master caution), the next activation teleports to the source view.
 * Element identity is preserved through the whole ritual so keyboard
 * focus never drops and strike ignition never replays. A blinking tile
 * whose host forgot `onAcknowledge` renders aria-disabled instead of a
 * silent dead end.
 *
 * A11y model: the rail is a non-live `group` (a live region over the whole
 * interactive strip would announce every tone churn to screen readers).
 * New warnings announce through the narrow sr-only status region below,
 * which only changes when the unacknowledged count changes.
 */
export function AnnunciatorRail({
  tiles,
  onNavigate,
  onAcknowledge,
  className,
}: AnnunciatorRailProps) {
  const unackCount = tiles.filter((t) => t.alert && !t.acknowledged).length;
  return (
    // biome-ignore lint/a11y/useSemanticElements: the only native `group` element is <fieldset> (form semantics); this is an interactive status strip, and <output> would make the whole rail a live region.
    <div
      role="group"
      aria-label="Annunciator rail"
      className={cn('annunciator-strip flex flex-wrap items-center gap-[6px] px-4 py-2', className)}
    >
      <output className="sr-only">
        {unackCount > 0 ? `${unackCount} unacknowledged warning${unackCount === 1 ? '' : 's'}` : ''}
      </output>
      {tiles.map((tile) => {
        const blinking = Boolean(tile.alert && !tile.acknowledged);
        // Alert tiles are always visibly lit (LampTile coerces off→warn).
        const lit = tile.tone !== 'off' || Boolean(tile.alert);
        const canAck = blinking && Boolean(onAcknowledge);
        const canNavigate = !blinking && lit && Boolean(onNavigate);
        const interactive = Boolean(tile.alert) || (lit && Boolean(onNavigate));
        if (!interactive) {
          return <LampTile key={tile.id} label={tile.label} tone={tile.tone} small />;
        }
        return (
          <button
            key={tile.id}
            type="button"
            aria-label={
              blinking
                ? `${tile.label} — unacknowledged warning`
                : canNavigate
                  ? `${tile.label} — open source view`
                  : `${tile.label} — acknowledged warning`
            }
            aria-disabled={!canAck && !canNavigate ? true : undefined}
            // p-[6px] -m-[3px]: ≥31px hit target around the 19px lamp; the
            // negative margin reclaims the strip's 6px gap so adjacent hit
            // areas tile edge-to-edge without shifting the visual rhythm.
            className={cn(
              'appearance-none rounded-control border-0 bg-transparent p-[6px] -m-[3px]',
              (canAck || canNavigate) && 'lamp-interactive cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
            onClick={() => {
              if (canAck) onAcknowledge?.(tile.id);
              else if (canNavigate) onNavigate?.(tile.id);
            }}
          >
            <LampTile
              label={tile.label}
              tone={tile.tone}
              small
              alert={tile.alert}
              acknowledged={tile.acknowledged}
              interactive={false}
            />
          </button>
        );
      })}
    </div>
  );
}
