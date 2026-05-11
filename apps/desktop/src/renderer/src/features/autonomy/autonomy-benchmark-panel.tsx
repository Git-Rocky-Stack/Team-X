import type {
  AutonomyBenchmarkReport,
  AutonomyBenchmarkScenarioId,
  AutonomyBenchmarkScenarioResult,
  RuntimeProfileKind,
} from '@team-x/shared-types';
import { AUTONOMY_BENCHMARK_SCENARIO_IDS, RUNTIME_PROFILE_KINDS } from '@team-x/shared-types';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Gauge,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  MissionControlRow,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPill,
  MissionStateBlock,
} from '../mission/mission-shell.js';

import { Button } from '@/components/ui/button.js';
import { useAutonomyBenchmark } from '@/hooks/use-autonomy-benchmark.js';

const DEFAULT_BENCHMARK_RUNTIME_KINDS = [
  'teamx-internal',
  'bash',
  'http',
  'codex',
  'claude-code',
] as const satisfies readonly RuntimeProfileKind[];

const SCENARIO_LABELS: Record<AutonomyBenchmarkScenarioId, string> = {
  'single-ticket-claim-completion': 'Single ticket completion',
  'race-for-one-ticket': 'Checkout race',
  'stale-worker-recovery': 'Stale recovery',
  'budget-hard-stop-before-execution': 'Budget pre-stop',
  'budget-hard-stop-mid-run': 'Budget mid-run',
  'missing-secret-failure': 'Missing secret',
  'blocked-ticket-delegation': 'Blocked delegation',
  'artifact-review-approval': 'Artifact review',
  'import-template-run-first-routine': 'Template routine',
  'reboot-resume-existing-checkpoint': 'Reboot resume',
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMs(value: number | null): string {
  if (value === null) return 'n/a';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function formatCost(value: string): string {
  return `$${Number(value).toFixed(4)}`;
}

function resultTone(status: AutonomyBenchmarkScenarioResult['status']): 'accent' | 'danger' {
  return status === 'passed' ? 'accent' : 'danger';
}

function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function groupResultsByRuntime(report: AutonomyBenchmarkReport | null) {
  const groups = new Map<RuntimeProfileKind, AutonomyBenchmarkScenarioResult[]>();
  for (const result of report?.results ?? []) {
    const list = groups.get(result.runtimeKind) ?? [];
    list.push(result);
    groups.set(result.runtimeKind, list);
  }
  return [...groups.entries()];
}

function EvidencePills({ result }: { result: AutonomyBenchmarkScenarioResult }) {
  const evidence = result.evidence;
  return (
    <div className="flex flex-wrap gap-2">
      <MissionPill mono>{evidence.eventTypes.length} events</MissionPill>
      <MissionPill mono>{evidence.toolCallCount} tool calls</MissionPill>
      <MissionPill mono>{evidence.artifactCount} artifacts</MissionPill>
      {evidence.checkoutStatuses.slice(0, 3).map((status) => (
        <MissionPill key={status}>{status}</MissionPill>
      ))}
    </div>
  );
}

function ScenarioResultRow({ result }: { result: AutonomyBenchmarkScenarioResult }) {
  const StatusIcon = result.status === 'passed' ? CheckCircle2 : XCircle;

  return (
    <MissionInsetSurface
      className="space-y-3 p-4"
      data-autonomy-benchmark-result={result.scenarioId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-body-strong text-foreground">{result.label}</span>
            <MissionPill tone={resultTone(result.status)}>{result.status}</MissionPill>
          </div>
          <p className="text-caption text-muted-foreground">
            {formatMs(result.metrics.latencyMs)} latency, {result.metrics.tokenCount} tokens,{' '}
            {formatCost(result.metrics.costUsd)} simulated spend.
          </p>
        </div>
        <MissionPill mono>{result.runtimeKind}</MissionPill>
      </div>

      <EvidencePills result={result} />

      {result.evidence.notes.length > 0 ? (
        <div className="space-y-1 text-caption text-muted-foreground">
          {result.evidence.notes.slice(0, 2).map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}

      {result.error ? (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-caption text-red-100">
          {result.error}
        </div>
      ) : null}
    </MissionInsetSurface>
  );
}

export function AutonomyBenchmarkPanel({ companyId }: { companyId: string }) {
  const benchmark = useAutonomyBenchmark(companyId);
  const [runtimeKinds, setRuntimeKinds] = useState<RuntimeProfileKind[]>([
    ...DEFAULT_BENCHMARK_RUNTIME_KINDS,
  ]);
  const [scenarioIds, setScenarioIds] = useState<AutonomyBenchmarkScenarioId[]>([
    ...AUTONOMY_BENCHMARK_SCENARIO_IDS,
  ]);
  const reportGroups = useMemo(() => groupResultsByRuntime(benchmark.report), [benchmark.report]);
  const canRun = runtimeKinds.length > 0 && scenarioIds.length > 0 && !benchmark.isRunning;

  async function runBenchmark() {
    await benchmark.runAsync({ runtimeKinds, scenarioIds });
  }

  return (
    <div className="space-y-4" data-autonomy-benchmark-panel="">
      <MissionControlRow className="justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-h2 text-foreground">Autonomy Benchmarks</h2>
            <MissionPill>control-plane-simulated</MissionPill>
          </div>
          <p className="text-caption text-muted-foreground">
            Repeatable scenario replay for checkout conflicts, stale recovery, budget stops, missing
            secrets, artifact evidence, template kickoff, and reboot resume.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 bg-black/10 hover:bg-black/20"
            onClick={benchmark.reset}
            disabled={benchmark.isRunning || benchmark.report === null}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void runBenchmark();
            }}
            disabled={!canRun}
          >
            <Play className="mr-2 h-4 w-4" />
            {benchmark.isRunning ? 'Running...' : 'Run Benchmark'}
          </Button>
        </div>
      </MissionControlRow>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <MissionInsetSurface className="space-y-4 p-4">
          <div className="space-y-2">
            <div className="text-eyebrow text-muted-foreground">Runtime Targets</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {RUNTIME_PROFILE_KINDS.map((kind) => (
                <label
                  key={kind}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-body text-foreground"
                  data-autonomy-benchmark-runtime={kind}
                >
                  <input
                    type="checkbox"
                    checked={runtimeKinds.includes(kind)}
                    onChange={() => setRuntimeKinds((current) => toggleValue(current, kind))}
                  />
                  <span>{kind}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-eyebrow text-muted-foreground">Scenario Set</div>
            <div className="grid gap-2">
              {AUTONOMY_BENCHMARK_SCENARIO_IDS.map((scenarioId) => (
                <label
                  key={scenarioId}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-body text-foreground"
                  data-autonomy-benchmark-scenario={scenarioId}
                >
                  <input
                    type="checkbox"
                    checked={scenarioIds.includes(scenarioId)}
                    onChange={() => setScenarioIds((current) => toggleValue(current, scenarioId))}
                  />
                  <span>{SCENARIO_LABELS[scenarioId]}</span>
                </label>
              ))}
            </div>
          </div>
        </MissionInsetSurface>

        {benchmark.report ? (
          <div className="space-y-4" data-autonomy-benchmark-summary="">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MissionMetricTile
                label="Pass Rate"
                value={formatPercent(benchmark.report.summary.successRate)}
                hint={`${benchmark.report.summary.passedCount}/${benchmark.report.summary.scenarioCount} scenario runs`}
                icon={CheckCircle2}
              />
              <MissionMetricTile
                label="Duplicate Work"
                value={formatPercent(benchmark.report.summary.duplicateWorkRate)}
                hint="Race and checkout contention"
                icon={AlertTriangle}
              />
              <MissionMetricTile
                label="Recovery"
                value={formatMs(benchmark.report.summary.meanStaleRecoveryMs)}
                hint="Mean stale recovery"
                icon={Activity}
              />
              <MissionMetricTile
                label="Latency"
                value={formatMs(benchmark.report.summary.meanLatencyMs)}
                hint="Mean simulated run latency"
                icon={Gauge}
              />
              <MissionMetricTile
                label="Spend"
                value={formatCost(benchmark.report.summary.totalCostUsd)}
                hint={`${benchmark.report.summary.totalTokenCount.toLocaleString()} tokens`}
                icon={BarChart3}
              />
              <MissionMetricTile
                label="Artifacts"
                value={formatPercent(benchmark.report.summary.artifactCompleteness)}
                hint={`${benchmark.report.summary.operatorInterventions} operator interventions`}
                icon={CheckCircle2}
              />
            </div>

            <div className="space-y-4" data-autonomy-benchmark-results="">
              {reportGroups.map(([runtimeKind, results]) => (
                <MissionInsetSurface
                  key={runtimeKind}
                  className="space-y-3 p-4"
                  data-autonomy-benchmark-runtime-group={runtimeKind}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-body-strong text-foreground">{runtimeKind}</div>
                    <MissionPill
                      tone={
                        results.every((result) => result.status === 'passed') ? 'accent' : 'danger'
                      }
                    >
                      {results.filter((result) => result.status === 'passed').length}/
                      {results.length} passed
                    </MissionPill>
                  </div>
                  <div className="grid gap-3">
                    {results.map((result) => (
                      <ScenarioResultRow
                        key={`${result.runtimeKind}:${result.scenarioId}`}
                        result={result}
                      />
                    ))}
                  </div>
                </MissionInsetSurface>
              ))}
            </div>
          </div>
        ) : benchmark.isError ? (
          <MissionStateBlock
            title="Benchmark run failed"
            description={
              benchmark.error instanceof Error
                ? benchmark.error.message
                : 'The benchmark harness could not generate a report.'
            }
            icon={XCircle}
            tone="danger"
          />
        ) : (
          <MissionStateBlock
            title="No benchmark report yet"
            description="Run the selected scenario set to produce an operator-readable report from the deterministic autonomy harness."
            icon={Gauge}
          />
        )}
      </div>
    </div>
  );
}
