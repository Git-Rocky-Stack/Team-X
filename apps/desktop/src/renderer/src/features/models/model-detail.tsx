/**
 * ModelDetail — the per-model drawer: provenance, prompt overrides, advanced
 * tuning, and benchmark history.
 *
 * Built on the Radix `DialogContent` rather than a hand-rolled panel so Escape,
 * the focus trap, and the `role="dialog"` semantics come from the primitive. A
 * hand-rolled scrim in this codebase was once keyboard-inescapable; there is no
 * reason to re-earn that lesson.
 *
 * ## Null is "auto", and the UI has to say so
 *
 * Every column in `local_model_advanced_params` is nullable, and null means
 * "let auto-tune decide" — not zero, not off. So:
 *   • a blank field round-trips as `null`, never as `0`;
 *   • the placeholder says "Auto", so a blank box is a stated default rather
 *     than an ambiguity the operator has to test for;
 *   • a value that is not a number disables the save instead of sending `NaN`
 *     to a NOT NULL-adjacent write.
 *
 * The same rule governs the benchmark table: `vramPeakMb: null` renders as
 * "Not measured", because 0 MB would be a reading nobody took.
 */

import type { AdvancedParams, BenchmarkResult, LocalModel } from '@team-x/shared-types';
import { useState } from 'react';

import { LampTile, SubviewState, Tag } from '@/components/console/index.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import {
  useBenchmarkHistory,
  useLocalModel,
  useResetAdvanced,
  useRunBenchmark,
  useSetAdvancedParams,
  useSetChatTemplate,
  useSetSystemPrompt,
} from '@/hooks/use-local-gguf.js';

/** Integer tuning fields, in the order they appear on the form. */
const INT_FIELDS = [
  { key: 'nCtx', label: 'Context length', hint: 'Auto — from GGUF metadata and free VRAM' },
  { key: 'nGpuLayers', label: 'GPU layers', hint: 'Auto — as many as VRAM allows' },
  { key: 'nBatch', label: 'Batch size', hint: 'Auto' },
  { key: 'nThreads', label: 'CPU threads', hint: 'Auto — physical cores minus two' },
  { key: 'topK', label: 'Top-K', hint: 'Auto' },
] as const;

/** Floating-point tuning fields. */
const FLOAT_FIELDS = [
  { key: 'temperature', label: 'Temperature', hint: 'Auto' },
  { key: 'topP', label: 'Top-P', hint: 'Auto' },
  { key: 'repeatPenalty', label: 'Repeat penalty', hint: 'Auto' },
] as const;

type TuningKey = (typeof INT_FIELDS)[number]['key'] | (typeof FLOAT_FIELDS)[number]['key'];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function BenchmarkTable({ rows }: { rows: BenchmarkResult[] }) {
  if (rows.length === 0) {
    return (
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="This model has never been benchmarked"
        description="A run measures prompt-eval and generation throughput on your hardware."
        className="min-h-0 p-4"
      />
    );
  }

  return (
    <div className="well overflow-x-auto rounded-card">
      <table className="w-full text-left">
        <thead>
          <tr className="text-eyebrow text-[var(--silver-mute)]">
            <th scope="col" className="px-3 py-2 font-normal">
              Ran
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Prompt tok/s
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Gen tok/s
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              TTFT
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Peak VRAM
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Backend
            </th>
          </tr>
        </thead>
        <tbody className="font-mono text-telemetry tabular-nums text-[var(--led-go)]">
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--hairline)]">
              <td className="px-3 py-2 text-[var(--silver-mute)]">
                {new Date(row.ranAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">{row.promptEvalTokS.toFixed(1)}</td>
              <td className="px-3 py-2">{row.genTokS.toFixed(1)}</td>
              <td className="px-3 py-2">{row.ttftMs} ms</td>
              <td className="px-3 py-2">
                {row.vramPeakMb === null ? (
                  <span className="text-[var(--silver-mute)]">Not measured</span>
                ) : (
                  `${row.vramPeakMb.toLocaleString()} MB`
                )}
              </td>
              <td className="px-3 py-2 text-[var(--silver-mute)]">{row.backend.toUpperCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ModelDetailProps {
  modelId: string | null;
  onClose: () => void;
}

export function ModelDetail({ modelId, onClose }: ModelDetailProps) {
  const model = useLocalModel(modelId);
  const history = useBenchmarkHistory(modelId);
  const setPrompt = useSetSystemPrompt();
  const setTemplate = useSetChatTemplate();
  const setTuning = useSetAdvancedParams();
  const resetTuning = useResetAdvanced();
  const runBenchmark = useRunBenchmark();

  // Drafts are `null` until touched, so a late-arriving model populates the
  // fields without ever overwriting something being typed.
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<string | null>(null);
  const [tuning, setTuningDraft] = useState<Partial<Record<TuningKey, string>>>({});

  if (modelId === null) return null;

  const row: LocalModel | null | undefined = model.data;
  const promptValue = promptDraft ?? row?.systemPromptOverride ?? '';
  const templateValue = templateDraft ?? row?.chatTemplateOverride ?? '';

  /** Blank → null ("auto"); anything non-numeric makes the form invalid. */
  function parseField(key: TuningKey, integer: boolean): number | null | 'invalid' {
    const raw = (tuning[key] ?? '').trim();
    if (raw.length === 0) return null;
    if (!(integer ? /^-?\d+$/ : /^-?\d*\.?\d+$/).test(raw)) return 'invalid';
    const value = integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 'invalid';
  }

  const parsed: Record<string, number | null | 'invalid'> = {};
  for (const f of INT_FIELDS) parsed[f.key] = parseField(f.key, true);
  for (const f of FLOAT_FIELDS) parsed[f.key] = parseField(f.key, false);
  const tuningValid = !Object.values(parsed).includes('invalid');

  function saveTuning() {
    if (!tuningValid || !modelId) return;
    const params = Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, v === 'invalid' ? null : v]),
    ) as Partial<AdvancedParams>;
    setTuning.mutate({ id: modelId, params });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto scrollbar-thin">
        {/*
          The dialog is named and described in every state, not only once the
          row has loaded: a screen reader announces the title and description
          on open, and without them the loading and error states were an
          unnamed dialog (and a Radix warning).
        */}
        {model.isError ? (
          <>
            <DialogTitle className="sr-only">Could not load this model</DialogTitle>
            <DialogDescription className="sr-only">{errorText(model.error)}</DialogDescription>
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Could not load this model"
              description={errorText(model.error)}
              className="min-h-0 p-6"
            />
          </>
        ) : !row ? (
          <>
            <DialogTitle className="sr-only">Loading model…</DialogTitle>
            <DialogDescription className="sr-only">
              Loading this model's details, prompt overrides and benchmark history.
            </DialogDescription>
            <SubviewState
              lampLabel="SYNC"
              lampTone="hold"
              title="Loading model…"
              className="min-h-0 p-6"
            />
          </>
        ) : (
          <div className="space-y-[var(--sp-4)]">
            <header className="space-y-2">
              <DialogTitle className="text-h2 text-foreground">{row.displayName}</DialogTitle>
              {/*
                Radix announces the description with the title on open. It is
                visually redundant beside the metadata tags below, so it is
                sr-only — but without it Radix logs a missing-description
                warning and screen-reader users get a bare title with no
                context for what the drawer contains.
              */}
              <DialogDescription className="sr-only">
                Model details for {row.displayName}: prompt overrides, advanced tuning, and
                benchmark history.
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-2">
                {row.ggufArch ? <Tag>{row.ggufArch}</Tag> : null}
                {row.ggufQuant ? <Tag>{row.ggufQuant}</Tag> : null}
                <Tag mono>{formatBytes(row.ggufSizeBytes)}</Tag>
                {row.isToolCapable ? (
                  <LampTile label="TOOLS" tone="exec" small interactive={false} />
                ) : null}
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-body-sm sm:grid-cols-2">
                {row.hfRepoId ? (
                  <div className="flex gap-2">
                    <dt className="text-[var(--silver-mute)]">Source</dt>
                    <dd className="truncate text-[var(--silver)]">{row.hfRepoId}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="text-[var(--silver-mute)]">License</dt>
                  <dd className="text-[var(--silver)]">{row.license ?? 'Unknown'}</dd>
                </div>
                {row.sourcePath ? (
                  <div className="flex min-w-0 gap-2 sm:col-span-2">
                    <dt className="shrink-0 text-[var(--silver-mute)]">Path</dt>
                    <dd className="truncate font-mono text-telemetry text-[var(--silver)]">
                      {row.sourcePath}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </header>

            {/* ── Prompt overrides ─────────────────────────────────────── */}
            <section className="space-y-2">
              <label htmlFor="model-system-prompt" className="block text-h3 text-foreground">
                System prompt
              </label>
              <textarea
                id="model-system-prompt"
                rows={3}
                value={promptValue}
                onChange={(e) => setPromptDraft(e.target.value)}
                placeholder="No override — the model's own default is used"
                className="well-input w-full px-3 py-2 text-body-sm"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="cap px-3 py-1.5 text-button-sm"
                  disabled={setPrompt.isPending}
                  onClick={() =>
                    setPrompt.mutate({
                      id: row.id,
                      // Empty means "no override" — null, not an empty prompt.
                      prompt: promptValue.trim().length > 0 ? promptValue : null,
                    })
                  }
                >
                  Save prompt
                </button>
                {setPrompt.isError ? (
                  <span className="text-body-xs text-[var(--led-nogo)]">
                    {errorText(setPrompt.error)}
                  </span>
                ) : null}
              </div>
            </section>

            <section className="space-y-2">
              <label htmlFor="model-chat-template" className="block text-h3 text-foreground">
                Chat template
              </label>
              <textarea
                id="model-chat-template"
                rows={3}
                value={templateValue}
                onChange={(e) => setTemplateDraft(e.target.value)}
                placeholder="No override — the template embedded in the GGUF is used"
                className="well-input w-full px-3 py-2 font-mono text-telemetry"
              />
              <button
                type="button"
                className="cap px-3 py-1.5 text-button-sm"
                disabled={setTemplate.isPending}
                onClick={() =>
                  setTemplate.mutate({
                    id: row.id,
                    template: templateValue.trim().length > 0 ? templateValue : null,
                  })
                }
              >
                Save template
              </button>
            </section>

            {/* ── Advanced tuning ──────────────────────────────────────── */}
            <section className="space-y-2">
              <h3 className="text-h3 text-foreground">Advanced tuning</h3>
              <p className="text-body-xs text-[var(--silver-mute)]">
                Leave a field blank to let auto-tune decide it from the GGUF metadata and the
                detected hardware.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[...INT_FIELDS, ...FLOAT_FIELDS].map((field) => {
                  const invalid = parsed[field.key] === 'invalid';
                  return (
                    <div key={field.key}>
                      <label
                        htmlFor={`tuning-${field.key}`}
                        className="mb-1 block text-eyebrow text-[var(--silver-mute)]"
                      >
                        {field.label}
                      </label>
                      <input
                        id={`tuning-${field.key}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={invalid}
                        placeholder={field.hint}
                        value={tuning[field.key] ?? ''}
                        onChange={(e) =>
                          setTuningDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="well-input w-full px-2.5 py-1.5 font-mono text-telemetry tabular-nums"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="cap px-3 py-1.5 text-button-sm"
                  disabled={!tuningValid || setTuning.isPending}
                  onClick={saveTuning}
                >
                  Save tuning
                </button>
                <button
                  type="button"
                  className="cap px-3 py-1.5 text-button-sm"
                  disabled={resetTuning.isPending}
                  onClick={() => {
                    setTuningDraft({});
                    resetTuning.mutate(row.id);
                  }}
                >
                  Reset to auto
                </button>
                {!tuningValid ? (
                  <span className="text-body-xs text-[var(--led-hold)]">
                    Every tuning value must be a number.
                  </span>
                ) : null}
              </div>
            </section>

            {/* ── Benchmarks ───────────────────────────────────────────── */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-h3 text-foreground">Benchmarks</h3>
                <button
                  type="button"
                  className="cap-armed px-3 py-1.5 text-button-sm"
                  disabled={runBenchmark.isPending}
                  onClick={() => runBenchmark.mutate(row.id)}
                >
                  {runBenchmark.isPending ? 'Running…' : 'Run benchmark'}
                </button>
              </div>
              <p className="text-body-xs text-[var(--silver-mute)]">
                A run loads the model into the pool and generates a fixed completion, so it can take
                a while on a cold model and will occupy a pool slot.
              </p>
              {runBenchmark.isError ? (
                <p className="text-body-xs text-[var(--led-nogo)]">
                  {errorText(runBenchmark.error)}
                </p>
              ) : null}
              {history.isError ? (
                <SubviewState
                  lampLabel="NO-GO"
                  lampTone="nogo"
                  title="Could not read benchmark history"
                  description={errorText(history.error)}
                  className="min-h-0 p-4"
                />
              ) : (
                <BenchmarkTable rows={history.data ?? []} />
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
