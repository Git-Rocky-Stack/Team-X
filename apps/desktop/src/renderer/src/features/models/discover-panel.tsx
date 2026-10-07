/**
 * DiscoverPanel — the Hugging Face browser and download queue.
 *
 * Search the Hub for GGUF repositories, open a repo's file list, and queue
 * transfers that survive a pause, a resume, and a quit.
 *
 * ## Numbers are shown only when they are known
 *
 * A percentage needs a denominator. A server that sends no `Content-Length`
 * leaves `bytesTotal` at 0, and dividing by it would put either "0%" or a
 * NaN-derived bar on screen — both of them inventions. In that case the panel
 * shows the bytes received and no percentage at all.
 *
 * Likewise, `sizeBytes: null` on a repo file is "the Hub did not say", and
 * renders as Unknown rather than 0 B.
 */

import type { DownloadProgress, HfModelCard } from '@team-x/shared-types';
import { Download, Search } from 'lucide-react';
import { useState } from 'react';

import {
  Faceplate,
  LampTile,
  type LampTone,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import {
  useActiveDownloads,
  useCancelDownload,
  useHfModelCard,
  useHfSearch,
  useLocalRuntimeSettings,
  usePauseDownload,
  useResumeDownload,
  useStartDownload,
} from '@/hooks/use-local-gguf.js';
import { ipc } from '@/lib/ipc.js';

const DOWNLOAD_LAMP: Record<DownloadProgress['state'], { label: string; tone: LampTone }> = {
  pending: { label: 'STBY', tone: 'off' },
  downloading: { label: 'LIVE', tone: 'go' },
  paused: { label: 'PAUSED', tone: 'hold' },
  completed: { label: 'DONE', tone: 'go' },
  cancelled: { label: 'STBY', tone: 'off' },
  failed: { label: 'NO-GO', tone: 'nogo' },
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

/** A GGUF shard or model file — the only thing worth downloading here. */
function isGgufFile(rfilename: string): boolean {
  return rfilename.toLowerCase().endsWith('.gguf');
}

function TransferRow({ download }: { download: DownloadProgress }) {
  const pause = usePauseDownload();
  const resume = useResumeDownload();
  const cancel = useCancelDownload();

  const lamp = DOWNLOAD_LAMP[download.state];
  const inFlight = download.state === 'downloading' || download.state === 'pending';
  const resumable = download.state === 'paused' || download.state === 'failed';
  const terminal = download.state === 'completed' || download.state === 'cancelled';
  // No denominator, no percentage. See the module header.
  const percent =
    download.bytesTotal > 0
      ? Math.min(100, Math.round((download.bytesReceived / download.bytesTotal) * 100))
      : null;

  return (
    <li
      data-download-row={download.handleId}
      className="space-y-1.5 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-body-sm text-foreground">{download.filename}</div>
          <div className="truncate font-mono text-telemetry text-[var(--silver-mute)]">
            {download.repoId}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LampTile label={lamp.label} tone={lamp.tone} small interactive={false} />
          {inFlight ? (
            <button
              type="button"
              className="cap px-3 py-1.5 text-button-sm"
              disabled={pause.isPending}
              onClick={() => pause.mutate(download.handleId)}
            >
              Pause
            </button>
          ) : null}
          {resumable ? (
            <button
              type="button"
              className="cap px-3 py-1.5 text-button-sm"
              disabled={resume.isPending}
              onClick={() => resume.mutate(download.handleId)}
            >
              {download.state === 'failed' ? 'Retry' : 'Resume'}
            </button>
          ) : null}
          {!terminal ? (
            <button
              type="button"
              className="cap px-3 py-1.5 text-button-sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(download.handleId)}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/*
          The bar is a visual echo of the figure beside it, not a separate
          control: it carries no information the text does not. Marking it
          decorative keeps assistive tech from announcing the same value twice
          and avoids an interactive role on something nobody can focus.
        */}
        <div className="well h-2 flex-1 overflow-hidden rounded-pill" aria-hidden="true">
          {percent !== null ? (
            <div className="h-full bg-[var(--armed)]" style={{ width: `${percent}%` }} />
          ) : null}
        </div>
        <span className="shrink-0 font-mono text-telemetry tabular-nums text-[var(--silver-mute)]">
          {percent !== null
            ? `${percent} %`
            : `${formatBytes(download.bytesReceived)} of unknown total`}
        </span>
      </div>

      {download.state === 'paused' ? (
        <p className="text-body-xs text-[var(--silver-mute)]">
          Paused. The bytes already downloaded are kept — resuming continues from here.
        </p>
      ) : null}
      {download.errorMessage ? (
        <p className="text-body-xs text-[var(--led-nogo)]">{download.errorMessage}</p>
      ) : null}
    </li>
  );
}

function ModelCardView({ card, repoId }: { card: HfModelCard; repoId: string }) {
  const settings = useLocalRuntimeSettings();
  const start = useStartDownload();
  const ggufFiles = card.siblings.filter((s) => isGgufFile(s.rfilename));

  async function download(filename: string) {
    // Never guess a destination. If no library folder is configured, ask.
    //
    // Guarded on `settings.isPending` at the button, not here: while the query
    // is in flight `data` is undefined, which is indistinguishable from "no
    // folder configured" — so an early click would pop a picker at an operator
    // who already has a default, and download somewhere they did not choose.
    if (settings.isPending) return;
    let target = settings.data?.defaultLibraryFolder ?? null;
    if (!target) {
      const picked = await ipc.system.selectDirectory({ title: 'Select download folder' });
      if (picked.canceled || !picked.folderPath) return;
      target = picked.folderPath;
    }
    start.mutate({ repoId, filename, targetFolder: target });
  }

  return (
    <div className="space-y-2">
      {card.description ? (
        <p className="text-body-sm text-[var(--silver)]">{card.description}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Tag mono>{repoId}</Tag>
        {card.license ? <Tag>{card.license}</Tag> : null}
      </div>

      {start.isError ? (
        <p className="text-body-xs text-[var(--led-nogo)]">{errorText(start.error)}</p>
      ) : null}

      {ggufFiles.length === 0 ? (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No GGUF files in this repository"
          className="min-h-0 p-4"
        />
      ) : (
        <ul className="space-y-1.5">
          {ggufFiles.map((sibling) => (
            <li
              key={sibling.rfilename}
              data-sibling-row={sibling.rfilename}
              className="flex items-center justify-between gap-3 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-2"
            >
              <span className="min-w-0 truncate text-body-sm text-foreground">
                {sibling.rfilename}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-telemetry tabular-nums text-[var(--silver-mute)]">
                  {formatBytes(sibling.sizeBytes)}
                </span>
                <button
                  type="button"
                  className="cap inline-flex items-center gap-2 px-3 py-1.5 text-button-sm"
                  disabled={start.isPending || settings.isPending}
                  onClick={() => download(sibling.rfilename)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiscoverPanel() {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [openRepo, setOpenRepo] = useState<string | null>(null);

  const results = useHfSearch(query, {});
  const card = useHfModelCard(openRepo);
  const downloads = useActiveDownloads();

  return (
    <div className="space-y-[var(--sp-4)]" data-models-panel="discover">
      <Faceplate kicker="Discover" serial="GGUF · HUB" bodyClassName="space-y-[var(--sp-4)]">
        <h2 className="text-h2 text-foreground">Hugging Face</h2>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(draft);
            setOpenRepo(null);
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <label
              htmlFor="hf-search"
              className="mb-1 block text-eyebrow text-[var(--silver-mute)]"
            >
              Search GGUF repositories
            </label>
            <input
              id="hf-search"
              value={draft}
              autoComplete="off"
              placeholder="qwen3, llama, phi…"
              onChange={(e) => setDraft(e.target.value)}
              className="well-input w-full px-2.5 py-1.5 text-body-sm"
            />
          </div>
          <button
            type="submit"
            className="cap inline-flex items-center gap-2 px-3 py-1.5 text-button-sm"
            disabled={draft.trim().length === 0}
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
        </form>

        {results.isError ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="The Hub search failed"
            description={errorText(results.error)}
            className="min-h-0 p-6"
          />
        ) : results.isFetching ? (
          <SubviewState
            lampLabel="SYNC"
            lampTone="hold"
            title="Searching the Hub…"
            className="min-h-0 p-6"
          />
        ) : results.data && results.data.length === 0 ? (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No results"
            description="No GGUF repository on the Hub matched that search."
            className="min-h-0 p-6"
          />
        ) : results.data ? (
          <ul className="space-y-1.5">
            {results.data.map((row) => (
              <li
                key={row.repoId}
                className="rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => setOpenRepo(row.repoId)}
                  className="block w-full truncate text-left text-body font-medium text-foreground hover:text-[var(--armed-lit)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                >
                  {row.repoId}
                </button>
                {row.description ? (
                  <p className="mt-1 line-clamp-2 text-body-sm text-[var(--silver)]">
                    {row.description}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Tag mono>{row.downloads.toLocaleString()} downloads</Tag>
                  <Tag mono>{row.likes.toLocaleString()} likes</Tag>
                  {row.tags.slice(0, 3).map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>

                {openRepo === row.repoId ? (
                  <div className="mt-3 border-t border-[var(--hairline)] pt-3">
                    {card.isError ? (
                      <SubviewState
                        lampLabel="NO-GO"
                        lampTone="nogo"
                        title="Could not load the model card"
                        description={errorText(card.error)}
                        className="min-h-0 p-4"
                      />
                    ) : card.data ? (
                      <ModelCardView card={card.data} repoId={row.repoId} />
                    ) : (
                      <SubviewState
                        lampLabel="SYNC"
                        lampTone="hold"
                        title="Loading model card…"
                        className="min-h-0 p-4"
                      />
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Faceplate>

      <Faceplate kicker="Transfers" serial="GGUF · DL" bodyClassName="space-y-[var(--sp-3)]">
        <h3 className="text-h3 text-foreground">Downloads</h3>
        {downloads.data && downloads.data.length > 0 ? (
          <ul className="space-y-1.5">
            {downloads.data.map((download) => (
              <TransferRow key={download.handleId} download={download} />
            ))}
          </ul>
        ) : (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No transfers"
            description="Downloads started from a model card appear here, and survive a restart."
            className="min-h-0 p-4"
          />
        )}
      </Faceplate>
    </div>
  );
}
