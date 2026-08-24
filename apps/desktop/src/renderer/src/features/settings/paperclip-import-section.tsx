/**
 * Paperclip Import — read a Paperclip export folder and show what importing it
 * into Team-X would produce.
 *
 * ## Preview, then hand off
 *
 * This panel stops at the preview and never creates a workspace. The
 * `packageData` it produces is handed to the existing portability import flow,
 * which already owns secret binding, the per-entity plan, and conflict
 * resolution. A second write path that could create a workspace would be a
 * second place for that logic to drift out of step.
 *
 * ## Losses are shown, not hidden
 *
 * An import that silently drops a third of the source workspace's integrations
 * looks like a success and is not. Unsupported adapters and missing secrets get
 * their own counts and their own lists at the same visual weight as the things
 * that convert cleanly, because deciding *not* to import is a valid outcome of
 * reading this panel.
 *
 * ## Design
 *
 * Command Console vocabulary per DESIGN.md — Faceplate chassis, MetricTile for
 * the conversion counts, RecessedWell for the loss lists, SubviewState for the
 * standby and fault states, steady LampTile (an outcome, not an unacknowledged
 * alert, so no blink).
 */

import type { PaperclipImportBridgePreview } from '@team-x/shared-types';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import {
  Faceplate,
  LampTile,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import {
  usePaperclipImportPreview,
  useSelectPaperclipFolder,
} from '@/hooks/use-paperclip-import.js';

function CountRow({ counts }: { counts: PaperclipImportBridgePreview['counts'] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-paperclip-counts="">
      <MetricTile label="Agents" value={String(counts.agents)} />
      <MetricTile label="Runtimes" value={String(counts.runtimeProfiles)} />
      <MetricTile label="Tickets" value={String(counts.tickets)} />
      <MetricTile label="Skills" value={String(counts.skills)} />
      <MetricTile label="Unsupported" value={String(counts.unsupportedAdapters)} />
      <MetricTile label="Missing secrets" value={String(counts.missingSecrets)} />
    </div>
  );
}

export function PaperclipImportSection() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const selectFolder = useSelectPaperclipFolder();
  const previewMutation = usePaperclipImportPreview();
  const preview = previewMutation.data;

  // Picking and previewing are chained at the call site rather than inside a
  // hook: a cancelled picker must not cascade into a filesystem read, and that
  // decision should be visible where it is made.
  function handleChoose() {
    selectFolder.mutate(undefined, {
      onSuccess: (chosen) => {
        if (chosen === null) return;
        setFolderPath(chosen);
        previewMutation.mutate(chosen);
      },
    });
  }

  const busy = selectFolder.isPending || previewMutation.isPending;

  return (
    <section data-settings-paperclip="">
      <Faceplate kicker="Paperclip" serial="IMPORT" bodyClassName="space-y-4">
        <p className="max-w-[68ch] text-caption text-muted-foreground leading-relaxed">
          Read a Paperclip export folder and see exactly what it would become in Team-X — before
          anything is created. This panel only previews; commit the package it produces from the
          Portability panel above.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleChoose} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Reading export…
              </>
            ) : (
              'Choose export folder…'
            )}
          </Button>
          {folderPath ? <Tag mono>{folderPath}</Tag> : null}
        </div>

        {previewMutation.isPending ? (
          <div aria-busy="true" className="text-caption text-muted-foreground">
            Reading the export folder…
          </div>
        ) : previewMutation.isError ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="That folder could not be read as a Paperclip export"
            description={previewMutation.error.message}
            testId="paperclip-error"
          />
        ) : !preview ? (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No export selected"
            description="Choose a Paperclip export folder to see what importing it would create."
            testId="paperclip-empty"
          />
        ) : (
          <>
            <CountRow counts={preview.counts} />

            {preview.warnings.length > 0 ? (
              <ul className="space-y-1.5" data-paperclip-warnings="">
                {preview.warnings.map((warning) => (
                  <li
                    key={warning}
                    className="rounded-inset border border-[var(--led-hold-edge)] bg-[var(--hold-soft)] px-3 py-2 text-caption text-[var(--led-hold)] leading-relaxed"
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            {preview.unsupportedAdapters.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-eyebrow-sm text-silver-mute uppercase tracking-[0.14em]">
                    Will not convert
                  </h3>
                  <LampTile small interactive={false} label="HOLD" tone="hold" />
                </div>
                <RecessedWell className="overflow-hidden p-0">
                  <ul data-paperclip-unsupported="">
                    {preview.unsupportedAdapters.map((adapter) => (
                      <li
                        key={adapter.id}
                        className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-[var(--hairline)] border-b px-3 py-2.5 last:border-b-0"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-body-strong text-foreground">{adapter.name}</span>
                          <p className="max-w-[62ch] text-caption text-muted-foreground leading-relaxed">
                            {adapter.reason}
                          </p>
                        </div>
                        <Tag mono>{adapter.type}</Tag>
                      </li>
                    ))}
                  </ul>
                </RecessedWell>
              </div>
            ) : null}

            {preview.missingSecretRefs.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-eyebrow-sm text-silver-mute uppercase tracking-[0.14em]">
                  Secrets you will have to re-enter
                </h3>
                <RecessedWell className="overflow-hidden p-0">
                  <ul data-paperclip-missing-secrets="">
                    {preview.missingSecretRefs.map((ref) => (
                      <li
                        key={ref.id}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-[var(--hairline)] border-b px-3 py-2.5 last:border-b-0"
                      >
                        <span className="min-w-0 truncate text-caption text-foreground">
                          {ref.label}
                        </span>
                        <Tag>{ref.bindable ? 'bindable' : 'manual'}</Tag>
                      </li>
                    ))}
                  </ul>
                </RecessedWell>
              </div>
            ) : null}

            <p className="max-w-[68ch] text-caption text-muted-foreground leading-relaxed">
              Nothing has been written. Import the package from the Portability panel above when
              this preview looks right.
            </p>
          </>
        )}
      </Faceplate>
    </section>
  );
}
