/**
 * RuntimePanel — GPU probe, active llama.cpp backend, and the LRU model pool.
 *
 * DESIGN.md composition: raised faceplate → brushed stripe → recessed wells for
 * data → machined caps for controls. Live numbers wear Departure Mono inside
 * LCD wells (MetricTile); status is a stencil word on a lamp, never an icon.
 *
 * Two rules this panel exists to honour:
 *
 *   • **Unknown is rendered as unknown.** A Linux box probed only through
 *     `lspci` reports a device name with no VRAM figure. Printing "0 MB" would
 *     claim a measurement that was never taken — the same class of lie the
 *     backend truth audit removed.
 *   • **A settled fault is NO-GO, steady.** DESIGN.md's dual-form red rule
 *     reserves the 1Hz blink for an unacknowledged question; a probe that has
 *     already failed is not asking anything.
 */

import type { GpuBackend, GpuDevice, GpuInventory } from '@team-x/shared-types';
import { Cpu, HardDrive, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Faceplate, LampTile, MetricTile, SubviewState, Tag } from '@/components/console/index.js';
import {
  useBinariesVersion,
  useGpuInventory,
  useLocalRuntimeSettings,
  usePoolStatus,
  usePoolUnload,
  useReprobeGpu,
  useSetLocalRuntimeSettings,
  useSetMaxConcurrent,
} from '@/hooks/use-local-gguf.js';
import { ipc } from '@/lib/ipc.js';

/** Pool capacity bounds. Enforced in code because the field is a text input. */
const MIN_CONCURRENT = 1;
const MAX_CONCURRENT = 8;

/** Backends in the order the ranking prefers them, for a stable display. */
const BACKENDS: ReadonlyArray<{ key: Exclude<GpuBackend, 'cpu'>; label: string }> = [
  { key: 'cuda', label: 'CUDA' },
  { key: 'rocm', label: 'ROCm' },
  { key: 'vulkan', label: 'Vulkan' },
  { key: 'metal', label: 'Metal' },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function gigabytes(mb: number): string {
  return `${(mb / 1024).toFixed(mb >= 10_240 ? 0 : 1)} GB`;
}

/**
 * A device's VRAM for display.
 *
 * `vramMb: 0` is not zero memory — it is the probe telling us it could not
 * read the figure (Apple's unified memory reports 0, and the lspci fallback
 * has no memory column at all). It renders as "Unknown".
 */
function vramLabel(device: GpuDevice): string {
  return device.vramMb > 0 ? `${device.vramMb.toLocaleString()} MB` : 'Unknown';
}

function DeviceRow({ device }: { device: GpuDevice }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-3 py-2 last:border-b-0">
      <span className="min-w-0 truncate text-body-sm text-foreground">{device.name}</span>
      <span className="shrink-0 font-mono text-telemetry tabular-nums text-[var(--silver-mute)]">
        {vramLabel(device)}
      </span>
    </div>
  );
}

function BackendGroup({ inventory }: { inventory: GpuInventory }) {
  const groups = BACKENDS.map(({ key, label }) => ({
    label,
    ...inventory[key],
  })).filter((g) => g.devices.length > 0);

  if (groups.length === 0) {
    return (
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="No GPU detected"
        description="Local models will run on the CPU backend."
        className="min-h-0 p-4"
      />
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-eyebrow text-[var(--silver-mute)]">{group.label}</span>
            <LampTile label="GO" tone="go" small interactive={false} />
          </div>
          <div className="well rounded-card">
            {group.devices.map((device) => (
              <DeviceRow
                key={`${group.label}-${device.name}-${device.uuid ?? ''}`}
                device={device}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Where downloads land, and which llama.cpp backend serves models.
 *
 * Both write through `runtime.setSettings`. The folder matters beyond tidiness:
 * Discover falls back to a one-off picker when it is unset, so without a place
 * to set it the operator gets asked every single time.
 *
 * The backend select carries an explicit "Auto-detect" option because the
 * readout above already distinguishes auto-detected from pinned — offering the
 * label without a way to reach either state would make it a half-truth.
 */
function RuntimeSettingsSection() {
  const settings = useLocalRuntimeSettings();
  const save = useSetLocalRuntimeSettings();

  async function chooseFolder() {
    const picked = await ipc.system.selectDirectory({ title: 'Select default model folder' });
    if (picked.canceled || !picked.folderPath) return;
    save.mutate({ defaultLibraryFolder: picked.folderPath });
  }

  function chooseBackend(value: string) {
    if (value === 'auto') {
      // Hand selection back to the probe; the next resolve re-picks a backend.
      save.mutate({ activeBackendIsAutoDetected: true });
      return;
    }
    save.mutate({ activeBackend: value as GpuBackend, activeBackendIsAutoDetected: false });
  }

  const folder = settings.data?.defaultLibraryFolder ?? null;
  const backendValue = settings.data?.activeBackendIsAutoDetected
    ? 'auto'
    : (settings.data?.activeBackend ?? 'auto');

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <span className="mb-1 block text-eyebrow text-[var(--silver-mute)]">
          Default download folder
        </span>
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate font-mono text-telemetry text-[var(--silver)]"
            data-testid="models-default-folder"
          >
            {folder ?? 'Not set — Discover will ask each time'}
          </span>
          <button
            type="button"
            className="cap shrink-0 px-3 py-1.5 text-button-sm"
            disabled={save.isPending}
            onClick={chooseFolder}
          >
            Choose folder
          </button>
        </div>
      </div>

      <div>
        <label
          htmlFor="models-backend-select"
          className="mb-1 block text-eyebrow text-[var(--silver-mute)]"
        >
          Backend
        </label>
        <select
          id="models-backend-select"
          className="well-input h-9 w-full px-2.5 text-body-sm"
          value={backendValue}
          disabled={save.isPending}
          onChange={(e) => chooseBackend(e.target.value)}
        >
          <option value="auto">Auto-detect</option>
          {BACKENDS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
          <option value="cpu">CPU</option>
        </select>
      </div>

      {save.isError ? (
        <p className="text-body-xs text-[var(--led-nogo)] sm:col-span-2">{errorText(save.error)}</p>
      ) : null}
    </div>
  );
}

function PoolSection() {
  const pool = usePoolStatus();
  const unload = usePoolUnload();
  const setMax = useSetMaxConcurrent();
  // The field is DERIVED from the server value until the operator touches it,
  // rather than copied into state by an effect.
  //
  // The effect version raced: the panel mounts before `pool.status` resolves,
  // so the field starts empty. An operator who begins typing in that window has
  // their input stomped the instant the query lands — type "5" into an empty
  // field, the seed fires, and you are looking at "2" or "25" and about to
  // apply a capacity you never chose. `null` here means "untouched, mirror the
  // server", so a late arrival and a post-write refetch both flow through
  // naturally, and a draft is never overwritten. Derive, don't synchronise.
  const [draft, setDraft] = useState<string | null>(null);
  const serverMax = pool.data?.maxConcurrent;
  const capacity = draft ?? (serverMax !== undefined ? String(serverMax) : '');

  const parsed = Number.parseInt(capacity, 10);
  const capacityValid =
    /^\d+$/.test(capacity.trim()) &&
    Number.isFinite(parsed) &&
    parsed >= MIN_CONCURRENT &&
    parsed <= MAX_CONCURRENT;
  const capacityDirty = pool.data !== undefined && parsed !== pool.data.maxConcurrent;

  return (
    <div className="space-y-3" data-models-pool="">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-h3 text-foreground">Model pool</h3>
        <Tag mono>{pool.data ? `${pool.data.loaded.length}/${pool.data.maxConcurrent}` : '—'}</Tag>
      </div>

      {pool.isError ? (
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Could not read the pool"
          description={pool.error instanceof Error ? pool.error.message : String(pool.error)}
          className="min-h-0 p-4"
        />
      ) : pool.data && pool.data.loaded.length > 0 ? (
        <ul className="space-y-1.5">
          {pool.data.loaded.map((entry) => (
            <li
              key={entry.modelId}
              className="flex items-center justify-between gap-3 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-body-sm text-foreground">{entry.modelId}</div>
                <div className="font-mono text-telemetry tabular-nums text-[var(--silver-mute)]">
                  {entry.baseUrl} · PID {entry.pid}
                </div>
              </div>
              <button
                type="button"
                className="cap shrink-0 px-3 py-1.5 text-button-sm"
                onClick={() => unload.mutate(entry.modelId)}
                disabled={unload.isPending}
              >
                Unload
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No models are loaded"
          description="A model loads on first use, or from the Library tab."
          className="min-h-0 p-4"
        />
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem]">
          <label
            htmlFor="models-max-concurrent"
            className="mb-1 block text-eyebrow text-[var(--silver-mute)]"
          >
            Max concurrent models
          </label>
          {/*
            A numeric TEXT field, not `type="number"`. The spinner has no place
            on an instrument faceplate, and a controlled number input carries
            browser-specific behaviour (locale decimals, silent coercion of
            partial input) that a plain string plus an explicit parse does not.
            Bounds are enforced by `capacityValid` rather than by the browser,
            so the rule lives in one place and is testable.
          */}
          <input
            id="models-max-concurrent"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby="models-max-concurrent-hint"
            aria-invalid={capacity.length > 0 && !capacityValid}
            value={capacity}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-control border border-[var(--hairline)] bg-[var(--void)] px-2.5 py-1.5 font-mono text-telemetry tabular-nums text-[var(--led-go)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          />
        </div>
        <button
          type="button"
          className="cap px-3 py-1.5 text-button-sm"
          disabled={!capacityValid || !capacityDirty || setMax.isPending}
          onClick={() =>
            setMax.mutate(parsed, {
              // Hand the field back to the server value once the write lands,
              // so it reflects what was actually persisted rather than a draft
              // that happens to match.
              onSuccess: () => setDraft(null),
            })
          }
        >
          Apply
        </button>
      </div>
      <p id="models-max-concurrent-hint" className="text-body-xs text-[var(--silver-mute)]">
        Raising this keeps more models resident at once. Each resident model holds its own
        llama-server process and its share of VRAM.
      </p>
    </div>
  );
}

export function RuntimePanel() {
  const inventory = useGpuInventory();
  const settings = useLocalRuntimeSettings();
  const binaries = useBinariesVersion();
  const reprobe = useReprobeGpu();

  const activeBackend = settings.data?.activeBackend;

  return (
    <div className="space-y-[var(--sp-4)]" data-models-panel="runtime">
      <Faceplate
        kicker="Runtime"
        serial="GGUF · HW"
        stripeSlot={
          inventory.isError ? (
            <LampTile label="NO-GO" tone="nogo" small interactive={false} />
          ) : inventory.isSuccess ? (
            <LampTile label="GO" tone="go" small interactive={false} />
          ) : null
        }
        bodyClassName="space-y-[var(--sp-4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h2 text-foreground">Hardware &amp; backend</h2>
          <button
            type="button"
            className="cap inline-flex items-center gap-2 px-3 py-1.5 text-button-sm"
            onClick={() => reprobe.mutate()}
            disabled={reprobe.isPending}
          >
            <RefreshCw className={reprobe.isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Re-probe
          </button>
        </div>

        {inventory.isError ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Hardware probe failed"
            description={
              inventory.error instanceof Error ? inventory.error.message : String(inventory.error)
            }
            className="min-h-0 p-6"
          />
        ) : inventory.isPending || settings.isPending ? (
          <SubviewState
            lampLabel="SYNC"
            lampTone="hold"
            title="Probing hardware…"
            className="min-h-0 p-6"
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <MetricTile
                data-testid="models-active-backend"
                label="Backend"
                value={activeBackend ? activeBackend.toUpperCase() : '—'}
                hint={
                  settings.data?.activeBackendIsAutoDetected ? 'Auto-detected' : 'Pinned manually'
                }
              />
              <MetricTile
                label="CPU cores"
                value={String(inventory.data?.cpu.cores ?? 0)}
                icon={Cpu}
              />
              <MetricTile
                label="System RAM"
                value={gigabytes(inventory.data?.cpu.ramMb ?? 0)}
                icon={HardDrive}
              />
              <MetricTile label="llama.cpp" value={binaries.data ?? '—'} hint="Bundled build" />
            </div>

            {settings.data?.autoFallbackReason ? (
              <div className="rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] p-3">
                <div className="mb-1 flex items-center gap-2">
                  <LampTile label="HOLD" tone="hold" small interactive={false} />
                  <span className="text-eyebrow text-[var(--silver-mute)]">Backend fell back</span>
                </div>
                <p className="text-body-sm text-[var(--silver)]">
                  {settings.data.autoFallbackReason}
                </p>
              </div>
            ) : null}

            <RuntimeSettingsSection />

            {inventory.data ? <BackendGroup inventory={inventory.data} /> : null}
          </>
        )}
      </Faceplate>

      <Faceplate kicker="Pool" serial="GGUF · LRU" bodyClassName="space-y-[var(--sp-3)]">
        <PoolSection />
      </Faceplate>
    </div>
  );
}
