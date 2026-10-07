/**
 * LibraryPanel — the registered local GGUF models.
 *
 * DESIGN.md composition: a raised faceplate with a brushed stripe, a machined
 * cap toolbar, and one row per model. Live figures wear Departure Mono; state
 * is a stencil word on a lamp.
 *
 * ## A row never overstates what is known
 *
 * A GGUF whose header failed to parse has null arch, quant, context and size.
 * Those render as "Unknown" — not "0 B", not an empty cell. The same reflex as
 * the backend audit: an absent measurement is reported as absent.
 *
 * ## Removal asks first
 *
 * `library.removeModel` is irreversible from the UI and, for a folder entry,
 * takes the row out from under a watcher. The row asks for a second click
 * rather than trusting the first.
 */

import type { LocalModel, ModelStatus, WatchFolder, WatchFolderStatus } from '@team-x/shared-types';
import { FilePlus2, FolderPlus, FolderSearch, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { ModelDetail } from './model-detail.js';

import {
  Faceplate,
  LampTile,
  type LampTone,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import {
  useAddModelFile,
  useAddModelFolder,
  useLocalModels,
  usePoolLoad,
  usePoolStatus,
  usePoolUnload,
  useRemoveFolder,
  useRemoveModel,
  useScanFolder,
  useWatchFolders,
} from '@/hooks/use-local-gguf.js';
import { ipc } from '@/lib/ipc.js';

/** Stencil word + lamp tone per model status (DESIGN.md status vocabulary). */
const STATUS_LAMP: Record<ModelStatus, { label: string; tone: LampTone }> = {
  cold: { label: 'STBY', tone: 'off' },
  loading: { label: 'SYNC', tone: 'hold' },
  loaded: { label: 'GO', tone: 'go' },
  error: { label: 'NO-GO', tone: 'nogo' },
  unreachable: { label: 'NO-GO', tone: 'nogo' },
  missing: { label: 'NO-GO', tone: 'nogo' },
};

const FOLDER_LAMP: Record<WatchFolderStatus, { label: string; tone: LampTone }> = {
  unknown: { label: 'STBY', tone: 'off' },
  reachable: { label: 'GO', tone: 'go' },
  // A share that has gone offline is a settled fault, not a question awaiting
  // acknowledgement — steady NO-GO, never the 1Hz blink.
  unreachable: { label: 'NO-GO', tone: 'nogo' },
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Bytes → GB. Null is unknown, and says so. */
function formatSize(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function formatParams(billions: number | null): string {
  return billions === null ? 'Unknown' : `${billions.toFixed(billions < 10 ? 1 : 0)}B`;
}

function ModelRow({
  model,
  isResident,
  onOpen,
}: {
  model: LocalModel;
  isResident: boolean;
  onOpen: () => void;
}) {
  const load = usePoolLoad();
  const unload = usePoolUnload();
  const remove = useRemoveModel();
  const [confirming, setConfirming] = useState(false);

  const lamp = STATUS_LAMP[model.status];

  return (
    <li
      data-model-row={model.id}
      className="rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full truncate text-left text-body font-medium text-foreground hover:text-[var(--armed-lit)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            {model.displayName}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag>{model.ggufArch ?? 'Unknown'}</Tag>
            <Tag>{model.ggufQuant ?? 'Unknown'}</Tag>
            <Tag mono>{formatParams(model.ggufParamsB)}</Tag>
            <Tag mono>{formatSize(model.ggufSizeBytes)}</Tag>
            {model.isToolCapable ? (
              <LampTile label="TOOLS" tone="exec" small interactive={false} />
            ) : null}
            {model.isEmbeddingModel ? (
              <LampTile label="EMBED" tone="exec" small interactive={false} />
            ) : null}
          </div>
          {model.statusDetail ? (
            <p className="mt-1 text-body-xs text-[var(--led-hold)]">{model.statusDetail}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LampTile label={lamp.label} tone={lamp.tone} small interactive={false} />
          {isResident ? (
            <button
              type="button"
              className="cap px-3 py-1.5 text-button-sm"
              disabled={unload.isPending}
              onClick={() => unload.mutate(model.id)}
            >
              Unload
            </button>
          ) : (
            <button
              type="button"
              className="cap px-3 py-1.5 text-button-sm"
              disabled={load.isPending || model.status === 'missing'}
              onClick={() => load.mutate(model.id)}
            >
              Load
            </button>
          )}
          {confirming ? (
            <>
              <button
                type="button"
                className="cap-armed px-3 py-1.5 text-button-sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate(model.id)}
              >
                Remove model
              </button>
              <button
                type="button"
                className="cap px-3 py-1.5 text-button-sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="cap px-3 py-1.5 text-button-sm"
              onClick={() => setConfirming(true)}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {load.isError ? (
        <p className="mt-2 text-body-xs text-[var(--led-nogo)]">{errorText(load.error)}</p>
      ) : null}
      {remove.isError ? (
        <p className="mt-2 text-body-xs text-[var(--led-nogo)]">{errorText(remove.error)}</p>
      ) : null}
    </li>
  );
}

/**
 * One watched folder.
 *
 * This section is why `library.listFolders` had to exist: `scanFolder` and
 * `removeFolder` both take a folder id, and before it there was no way for a
 * renderer to obtain one — two live channels with no reachable caller.
 */
function FolderRow({ folder }: { folder: WatchFolder }) {
  const scan = useScanFolder();
  const remove = useRemoveFolder();
  const [confirming, setConfirming] = useState(false);

  const lamp = FOLDER_LAMP[folder.status];

  return (
    <li
      data-folder-row={folder.id}
      className="space-y-2 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-telemetry text-foreground">{folder.path}</div>
          <div className="text-body-xs text-[var(--silver-mute)]">
            {folder.recursive ? 'Including subfolders' : 'This folder only'}
            {folder.lastScanAt
              ? ` · last scanned ${new Date(folder.lastScanAt).toLocaleString()}`
              : ' · never scanned'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LampTile label={lamp.label} tone={lamp.tone} small interactive={false} />
          <button
            type="button"
            className="cap px-3 py-1.5 text-button-sm"
            disabled={scan.isPending}
            onClick={() => scan.mutate(folder.id)}
          >
            {scan.isPending ? 'Rescanning…' : 'Rescan'}
          </button>
          <button
            type="button"
            className="cap px-3 py-1.5 text-button-sm"
            onClick={() => setConfirming(true)}
          >
            Stop watching
          </button>
        </div>
      </div>

      {scan.isSuccess ? (
        <p className="font-mono text-telemetry text-[var(--led-go)]">
          Added {scan.data.addedCount}, removed {scan.data.removedCount}.
        </p>
      ) : null}
      {scan.isError ? (
        <p className="text-body-xs text-[var(--led-nogo)]">{errorText(scan.error)}</p>
      ) : null}
      {folder.lastScanError ? (
        <p className="text-body-xs text-[var(--led-nogo)]">{folder.lastScanError}</p>
      ) : null}

      {confirming ? (
        <div className="space-y-2 rounded-control border border-[var(--armed-deep)] bg-[var(--carbon-900)] p-3">
          <p className="text-body-sm text-[var(--silver)]">
            This also removes every model this folder contributed to the library. The files on disk
            are left untouched.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cap-armed px-3 py-1.5 text-button-sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(folder.id)}
            >
              Remove folder
            </button>
            <button
              type="button"
              className="cap px-3 py-1.5 text-button-sm"
              onClick={() => setConfirming(false)}
            >
              Keep watching
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function LibraryPanel() {
  const models = useLocalModels();
  const folders = useWatchFolders();
  const pool = usePoolStatus();
  const addFile = useAddModelFile();
  const addFolder = useAddModelFolder();
  const [openModelId, setOpenModelId] = useState<string | null>(null);

  const resident = new Set((pool.data?.loaded ?? []).map((e) => e.modelId));

  async function pickFile() {
    const picked = await ipc.system.selectGgufFile({ title: 'Select a GGUF model file' });
    if (picked.canceled || !picked.filePath) return;
    addFile.mutate(picked.filePath);
  }

  async function pickFolder() {
    // The title matters: the shared picker's default used to be another
    // feature's wording, which then appeared over this one's dialog.
    const picked = await ipc.system.selectDirectory({ title: 'Select model folder' });
    if (picked.canceled || !picked.folderPath) return;
    addFolder.mutate({ path: picked.folderPath, recursive: true });
  }

  return (
    <div data-models-panel="library">
      <Faceplate
        kicker="Library"
        serial="GGUF · LIB"
        stripeSlot={
          models.isError ? (
            <LampTile label="NO-GO" tone="nogo" small interactive={false} />
          ) : (
            <Tag mono>{models.data ? String(models.data.length) : '—'}</Tag>
          )
        }
        bodyClassName="space-y-[var(--sp-4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h2 text-foreground">Local models</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cap inline-flex items-center gap-2 px-3 py-1.5 text-button-sm"
              onClick={pickFile}
              disabled={addFile.isPending}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              Add file
            </button>
            <button
              type="button"
              className="cap inline-flex items-center gap-2 px-3 py-1.5 text-button-sm"
              onClick={pickFolder}
              disabled={addFolder.isPending}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Add folder
            </button>
            <button
              type="button"
              className="cap inline-flex items-center gap-2 px-3 py-1.5 text-button-sm"
              onClick={() => models.refetch()}
              disabled={models.isFetching}
            >
              <RefreshCw
                className={models.isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
              />
              Refresh
            </button>
          </div>
        </div>

        {addFile.isError ? (
          <p className="text-body-sm text-[var(--led-nogo)]">{errorText(addFile.error)}</p>
        ) : null}
        {addFolder.isError ? (
          <p className="text-body-sm text-[var(--led-nogo)]">{errorText(addFolder.error)}</p>
        ) : null}

        {models.isError ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Could not read the model library"
            description={errorText(models.error)}
            className="min-h-0 p-6"
          />
        ) : models.isPending ? (
          <SubviewState
            lampLabel="SYNC"
            lampTone="hold"
            title="Reading the library…"
            className="min-h-0 p-6"
          />
        ) : models.data.length === 0 ? (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No models in the library"
            description="Add a .gguf file, or point Team-X at a folder to watch."
            className="min-h-0 p-6"
          />
        ) : (
          <ul className="space-y-1.5">
            {models.data.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                isResident={resident.has(model.id)}
                onOpen={() => setOpenModelId(model.id)}
              />
            ))}
          </ul>
        )}
      </Faceplate>

      <Faceplate
        kicker="Folders"
        serial="GGUF · WATCH"
        className="mt-[var(--sp-4)]"
        stripeSlot={<Tag mono>{folders.data ? String(folders.data.length) : '—'}</Tag>}
        bodyClassName="space-y-[var(--sp-3)]"
      >
        <div className="flex items-center gap-2">
          <FolderSearch className="h-4 w-4 text-[var(--silver-mute)]" />
          <h2 className="text-h2 text-foreground">Watched folders</h2>
        </div>

        {folders.isError ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Could not read the watched folders"
            description={errorText(folders.error)}
            className="min-h-0 p-4"
          />
        ) : folders.isPending ? (
          <SubviewState
            lampLabel="SYNC"
            lampTone="hold"
            title="Reading folders…"
            className="min-h-0 p-4"
          />
        ) : folders.data.length === 0 ? (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No folders are being watched"
            description="Add a folder above and Team-X keeps its GGUF files in sync with the library."
            className="min-h-0 p-4"
          />
        ) : (
          <ul className="space-y-1.5">
            {folders.data.map((folder) => (
              <FolderRow key={folder.id} folder={folder} />
            ))}
          </ul>
        )}
      </Faceplate>

      {/*
        Keyed by model id so React remounts the drawer per model instead of
        reusing one instance. The drawer holds unsaved drafts (system prompt,
        chat template, tuning) in local state, and it returns null rather than
        unmounting when nothing is selected — so without the key those drafts
        survive a close and reappear under the NEXT model, where saving would
        write one model's prompt onto another.
      */}
      <ModelDetail
        key={openModelId ?? 'none'}
        modelId={openModelId}
        onClose={() => setOpenModelId(null)}
      />
    </div>
  );
}
