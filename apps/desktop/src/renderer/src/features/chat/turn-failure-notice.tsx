/**
 * Direct-line readout for a turn that failed or was refused before it ran —
 * a Settings → Privacy refusal, a missing API key, a provider error. The
 * reason is the orchestrator's `work.failed` text, shown verbatim: the
 * refusal messages are written to name the provider and the way out.
 */
import { AlertTriangle } from 'lucide-react';

import { RecessedWell } from '@/components/console/index.js';

export interface TurnFailureNoticeProps {
  employeeName: string;
  error: string;
}

export function TurnFailureNotice({ employeeName, error }: TurnFailureNoticeProps) {
  return (
    <RecessedWell role="alert" className="flex items-start gap-2 px-3 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-led-nogo" aria-hidden="true" />
      <span className="text-caption text-led-nogo">
        <span className="font-semibold">{employeeName} could not reply.</span> {error}
      </span>
    </RecessedWell>
  );
}
