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
   * Requires a lit `tone`; `tone: 'off'` + `alert` is a malformed spec
   * (an unlit lamp cannot warn) and renders an uncolored blinking cap.
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
 * surface in BOTH shifts.
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
      className={cn(
        'flex flex-wrap items-center gap-[6px] border-b border-black/80 bg-[#0C0C0C] px-4 py-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]',
        className,
      )}
    >
      <output className="sr-only">
        {unackCount > 0 ? `${unackCount} unacknowledged warning${unackCount === 1 ? '' : 's'}` : ''}
      </output>
      {tiles.map((tile) => {
        const blinking = Boolean(tile.alert && !tile.acknowledged);
        const lit = tile.tone !== 'off';
        if (blinking) {
          return (
            <LampTile
              key={tile.id}
              label={tile.label}
              tone={tile.tone}
              small
              alert
              acknowledged={false}
              onAcknowledge={() => onAcknowledge?.(tile.id)}
            />
          );
        }
        if (lit && onNavigate) {
          return (
            <button
              key={tile.id}
              type="button"
              aria-label={`${tile.label} — open source view`}
              className="appearance-none rounded-control border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => onNavigate(tile.id)}
            >
              <LampTile label={tile.label} tone={tile.tone} small className="cursor-pointer" />
            </button>
          );
        }
        return <LampTile key={tile.id} label={tile.label} tone={tile.tone} small />;
      })}
    </div>
  );
}
