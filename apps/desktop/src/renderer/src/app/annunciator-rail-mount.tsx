import { useAnnunciatorData } from './annunciator-rail-data.js';
import { ANNUNCIATOR_TELEPORT, deriveAnnunciatorTiles } from './annunciator-signals.js';

import { AnnunciatorRail } from '@/components/console';

/** The persistent lamp shelf under the command bar (DESIGN.md §Layout). */
export function AnnunciatorRailMount() {
  const { inputs, setActiveView, ackAnnunciator } = useAnnunciatorData();
  const tiles = deriveAnnunciatorTiles(inputs);
  return (
    <div data-annunciator-rail="">
      <AnnunciatorRail
        tiles={tiles}
        onNavigate={(id) => {
          const view = ANNUNCIATOR_TELEPORT[id];
          if (view) setActiveView(view);
        }}
        onAcknowledge={(id) => {
          const fp = tiles.find((t) => t.id === id)?.fingerprint;
          if (fp) ackAnnunciator(id, fp);
        }}
      />
    </div>
  );
}
