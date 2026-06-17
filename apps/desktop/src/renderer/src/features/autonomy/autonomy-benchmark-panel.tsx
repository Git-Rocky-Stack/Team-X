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
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  LampTile,
  type LampTone,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
  VuMeter,
} from '@/components/console/index.js';
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

function resultTone(status: AutonomyBenchmarkScenarioResult['status']): LampTone {
  return status === 'passed' ? 'go' : 'nogo';
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
      <Tag mono>{evidence.eventTypes.length} events</Tag>
      <Tag mono>{evidence.toolCallCount} tool calls</Tag>
      <Tag mono>{evidence.artifactCount} artifacts</Tag>
      {evidence.checkoutStatuses.slice(0, 3).map((status) => (
        <Tag key={status}>{status}</Tag>
      ))}
    </div>
  );
}

function ScenarioResultRow({ result }: { result: AutonomyBenchmarkScenarioResult }) {
  return (
    <RecessedWell className="space-y-3 p-4" data-autonomy-benchmark-result={result.scenarioId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-strong text-foreground">{result.label}</span>
            <LampTile
              label={result.status}
              tone={resultTone(result.status)}
              small
              interactive={false}
            />
          </div>
          <p className="text-caption text-muted-foreground">
            {formatMs(result.metrics.latencyMs)} latency, {result.metrics.tokenCount} tokens,{' '}
            {formatCost(result.metrics.costUsd)} simulated spend.
          </p>
        </div>
        <Tag mono>{result.runtimeKind}</Tag>
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
        <RecessedWell className="px-3 py-2 text-caption text-led-nogo">{result.error}</RecessedWell>
      ) : null}
    </RecessedWell>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-h2 text-foreground">Autonomy Benchmarks</h2>
            <Tag>control-plane-simulated</Tag>
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <RecessedWell className="space-y-4 p-4">
          <div className="space-y-2">
            <div className="text-eyebrow text-muted-foreground">Runtime Targets</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {RUNTIME_PROFILE_KINDS.map((kind) => (
                <label
                  key={kind}
                  className="cap flex min-h-11 items-center gap-3 px-3 py-2 text-body text-foreground"
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
                  className="cap flex min-h-11 items-center gap-3 px-3 py-2 text-body text-foreground"
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
        </RecessedWell>

        {benchmark.report ? (
          <div className="space-y-4" data-autonomy-benchmark-summary="">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricTile
                label="Pass Rate"
                value={formatPercent(benchmark.report.summary.successRate)}
                hint={`${benchmark.report.summary.passedCount}/${benchmark.report.summary.scenarioCount} scenario runs`}
                icon={CheckCircle2}
                tone={benchmark.report.summary.successRate < 1 ? 'amber' : undefined}
              />
              <MetricTile
                label="Duplicate Work"
                value={formatPercent(benchmark.report.summary.duplicateWorkRate)}
                hint="Race and checkout contention"
                icon={AlertTriangle}
              />
              <MetricTile
                label="Recovery"
                value={formatMs(benchmark.report.summary.meanStaleRecoveryMs)}
                hint="Mean stale recovery"
                icon={Activity}
              />
              <MetricTile
                label="Latency"
                value={formatMs(benchmark.report.summary.meanLatencyMs)}
                hint="Mean simulated run latency"
                icon={Gauge}
              />
              <MetricTile
                label="Spend"
                value={formatCost(benchmark.report.summary.totalCostUsd)}
                hint={`${benchmark.report.summary.totalTokenCount.toLocaleString()} tokens`}
                icon={BarChart3}
              />
              <MetricTile
                label="Artifacts"
                value={formatPercent(benchmark.report.summary.artifactCompleteness)}
                hint={`${benchmark.report.summary.operatorInterventions} operator interventions`}
                icon={CheckCircle2}
              />
            </div>

            <VuMeter
              className="w-40"
              value={benchmark.report.summary.successRate}
              label="Benchmark pass rate"
            />

            <div className="space-y-4" data-autonomy-benchmark-results="">
              {reportGroups.map(([runtimeKind, results]) => (
                <RecessedWell
                  key={runtimeKind}
                  className="space-y-3 p-4"
                  data-autonomy-benchmark-runtime-group={runtimeKind}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-body-strong text-foreground">{runtimeKind}</div>
                    <LampTile
                      label={`${results.filter((result) => result.status === 'passed').length}/${results.length} passed`}
                      tone={results.every((result) => result.status === 'passed') ? 'go' : 'nogo'}
                      small
                      interactive={false}
                    />
                  </div>
                  <div className="grid gap-3">
                    {results.map((result) => (
                      <ScenarioResultRow
                        key={`${result.runtimeKind}:${result.scenarioId}`}
                        result={result}
                      />
                    ))}
                  </div>
                </RecessedWell>
              ))}
            </div>
          </div>
        ) : benchmark.isError ? (
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Benchmark run failed"
            description={
              benchmark.error instanceof Error
                ? benchmark.error.message
                : 'The benchmark harness could not generate a report.'
            }
          />
        ) : (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title="No benchmark report yet"
            description="Run the selected scenario set to produce an operator-readable report from the deterministic autonomy harness."
          />
        )}
      </div>
    </div>
  );
}
