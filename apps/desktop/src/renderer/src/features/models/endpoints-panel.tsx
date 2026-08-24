/**
 * EndpointsPanel — remote LAN inference servers.
 *
 * LM Studio, Ollama, llama-server, KoboldCPP and vLLM all expose an
 * OpenAI-compatible `/v1/models`, so one probe covers them all.
 *
 * The panel does not re-implement the local-network rule — the main process
 * owns it, because a renderer-side check is advice, not enforcement. What the
 * panel owes the operator is the *reason*: when the service refuses an address,
 * its message is shown verbatim rather than collapsed into "failed to add".
 */

import type { EndpointStatus, LocalGgufError, RemoteEndpoint } from '@team-x/shared-types';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  Faceplate,
  LampTile,
  type LampTone,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import {
  useAddEndpoint,
  useEndpoints,
  useRemoveEndpoint,
  useTestEndpoint,
  useUpdateEndpoint,
} from '@/hooks/use-local-gguf.js';

const STATUS_LAMP: Record<EndpointStatus, { label: string; tone: LampTone }> = {
  unknown: { label: 'STBY', tone: 'off' },
  reachable: { label: 'GO', tone: 'go' },
  unreachable: { label: 'NO-GO', tone: 'nogo' },
  'auth-failed': { label: 'NO-GO', tone: 'nogo' },
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Turn a typed probe error into one plain sentence. */
function describeProbeError(error: LocalGgufError | undefined): string {
  if (!error) return 'Unreachable.';
  switch (error.kind) {
    case 'endpoint-auth-failed':
      return 'Auth rejected — the server refused the stored credentials.';
    case 'endpoint-unreachable':
      return error.httpStatus
        ? `Unreachable — the server answered HTTP ${error.httpStatus}.`
        : 'Unreachable — no response from that address.';
    default:
      return `Unreachable — ${error.kind}.`;
  }
}

interface EndpointFormValues {
  name: string;
  baseUrl: string;
}

function EndpointForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: EndpointFormValues;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: EndpointFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const complete = name.trim().length > 0 && baseUrl.trim().length > 0;

  return (
    <form
      className="space-y-3 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) onSubmit({ name: name.trim(), baseUrl: baseUrl.trim() });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="endpoint-name"
            className="mb-1 block text-eyebrow text-[var(--silver-mute)]"
          >
            Name
          </label>
          <input
            id="endpoint-name"
            value={name}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            className="well-input w-full px-2.5 py-1.5 text-body-sm"
          />
        </div>
        <div>
          <label
            htmlFor="endpoint-url"
            className="mb-1 block text-eyebrow text-[var(--silver-mute)]"
          >
            Address
          </label>
          <input
            id="endpoint-url"
            value={baseUrl}
            autoComplete="off"
            placeholder="http://192.168.1.50:1234"
            onChange={(e) => setBaseUrl(e.target.value)}
            className="well-input w-full px-2.5 py-1.5 font-mono text-telemetry"
          />
        </div>
      </div>

      <p className="text-body-xs text-[var(--silver-mute)]">
        Endpoints are Local privacy tier, so the address must be on your own network — loopback, a
        192.168 / 10.x / 172.16–31 address, a <code>.local</code> name, or a bare LAN hostname. A
        public address will be refused.
      </p>

      {error ? <p className="text-body-xs text-[var(--led-nogo)]">{errorText(error)}</p> : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="cap px-3 py-1.5 text-button-sm"
          disabled={!complete || pending}
        >
          {submitLabel}
        </button>
        <button type="button" className="cap px-3 py-1.5 text-button-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EndpointRow({ endpoint }: { endpoint: RemoteEndpoint }) {
  const probe = useTestEndpoint();
  const update = useUpdateEndpoint();
  const remove = useRemoveEndpoint();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const lamp = STATUS_LAMP[endpoint.status];
  const verdict = probe.data;

  return (
    <li
      data-endpoint-row={endpoint.id}
      className="space-y-2 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-body font-medium text-foreground">{endpoint.name}</div>
          <div className="truncate font-mono text-telemetry text-[var(--silver-mute)]">
            {endpoint.baseUrl}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tag>{endpoint.privacyTier}</Tag>
          <LampTile label={lamp.label} tone={lamp.tone} small interactive={false} />
          <button
            type="button"
            className="cap px-3 py-1.5 text-button-sm"
            disabled={probe.isPending}
            onClick={() => probe.mutate(endpoint.id)}
          >
            {probe.isPending ? 'Testing…' : 'Test'}
          </button>
          <button
            type="button"
            className="cap px-3 py-1.5 text-button-sm"
            onClick={() => setEditing((v) => !v)}
          >
            Edit
          </button>
          <button
            type="button"
            className="cap px-3 py-1.5 text-button-sm"
            onClick={() => setConfirming(true)}
          >
            Remove
          </button>
        </div>
      </div>

      {verdict ? (
        <p
          className={
            verdict.reachable
              ? 'font-mono text-telemetry text-[var(--led-go)]'
              : 'text-body-xs text-[var(--led-nogo)]'
          }
        >
          {verdict.reachable
            ? `Reachable — ${verdict.latencyMs ?? 0} ms`
            : describeProbeError(verdict.error)}
        </p>
      ) : null}

      {!verdict && endpoint.lastError ? (
        <p className="text-body-xs text-[var(--led-nogo)]">{endpoint.lastError}</p>
      ) : null}

      {confirming ? (
        <div className="space-y-2 rounded-control border border-[var(--armed-deep)] bg-[var(--carbon-900)] p-3">
          <p className="text-body-sm text-[var(--silver)]">
            Removing this endpoint also removes every model served by it from your library.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cap-armed px-3 py-1.5 text-button-sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(endpoint.id)}
            >
              Remove endpoint
            </button>
            <button
              type="button"
              className="cap px-3 py-1.5 text-button-sm"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <EndpointForm
          initial={{ name: endpoint.name, baseUrl: endpoint.baseUrl }}
          submitLabel="Save"
          pending={update.isPending}
          error={update.error}
          onCancel={() => setEditing(false)}
          onSubmit={(values) =>
            update.mutate(
              { id: endpoint.id, partial: values },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : null}
    </li>
  );
}

export function EndpointsPanel() {
  const endpoints = useEndpoints();
  const add = useAddEndpoint();
  const [adding, setAdding] = useState(false);

  return (
    <div data-models-panel="endpoints">
      <Faceplate
        kicker="Endpoints"
        serial="GGUF · LAN"
        stripeSlot={<Tag mono>{endpoints.data ? String(endpoints.data.length) : '—'}</Tag>}
        bodyClassName="space-y-[var(--sp-4)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h2 text-foreground">Remote LAN servers</h2>
          <button
            type="button"
            className="cap inline-flex items-center gap-2 px-3 py-1.5 text-button-sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add endpoint
          </button>
        </div>

        {adding ? (
          <EndpointForm
            initial={{ name: '', baseUrl: '' }}
            submitLabel="Save"
            pending={add.isPending}
            error={add.error}
            onCancel={() => setAdding(false)}
            onSubmit={(values) =>
              add.mutate(
                { ...values, authHeaderKeyRef: null },
                { onSuccess: () => setAdding(false) },
              )
            }
          />
        ) : null}

        {endpoints.isError ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Could not read the endpoint list"
            description={errorText(endpoints.error)}
            className="min-h-0 p-6"
          />
        ) : endpoints.isPending ? (
          <SubviewState
            lampLabel="SYNC"
            lampTone="hold"
            title="Reading endpoints…"
            className="min-h-0 p-6"
          />
        ) : endpoints.data.length === 0 ? (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No endpoints configured"
            description="Point Team-X at an inference server already running on your network."
            className="min-h-0 p-6"
          />
        ) : (
          <ul className="space-y-1.5">
            {endpoints.data.map((endpoint) => (
              <EndpointRow key={endpoint.id} endpoint={endpoint} />
            ))}
          </ul>
        )}
      </Faceplate>
    </div>
  );
}
