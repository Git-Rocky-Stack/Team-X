import { LampTile, type LampTone } from './lamp-tile';

import { cn } from '@/lib/utils';

export interface AnnunciatorTileSpec {
  /** Source view / system id — passed to onNavigate (teleport target) */
  id: string;
  /** Stencil word: SYS / ORG / TOKN / BUDG / GGUF / QUE / NET / MTG … */
  label: string;
  tone: LampTone;
  /** Unacknowledged warning — blinks until acknowledged (dual-form rule) */
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
 */
export function AnnunciatorRail({
  tiles,
  onNavigate,
  onAcknowledge,
  className,
}: AnnunciatorRailProps) {
  return (
    // <output> carries the implicit `status` role Biome's useSemanticElements
    // rule requires (same precedent as sidenav.tsx / command-palette.tsx).
    <output
      aria-label="Annunciator rail"
      className={cn(
        'flex flex-wrap items-center gap-[6px] border-b border-black/80 bg-[#0C0C0C] px-4 py-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]',
        className,
      )}
    >
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
              className="appearance-none border-0 bg-transparent p-0"
              onClick={() => onNavigate(tile.id)}
            >
              <LampTile label={tile.label} tone={tile.tone} small className="cursor-pointer" />
            </button>
          );
        }
        return <LampTile key={tile.id} label={tile.label} tone={tile.tone} small />;
      })}
    </output>
  );
}
