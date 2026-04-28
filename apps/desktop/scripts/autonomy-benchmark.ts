#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  AUTONOMY_BENCHMARK_SCENARIO_IDS,
  type AutonomyBenchmarkReport,
  type AutonomyBenchmarkScenarioId,
  RUNTIME_PROFILE_KINDS,
  type RuntimeProfileKind,
} from '@team-x/shared-types';

import { createInMemoryAutonomyBenchmarkScenarioContext } from '../src/main/services/autonomy-benchmark-memory-context.js';
import {
  AUTONOMY_BENCHMARK_DEFAULT_RUNTIME_KINDS,
  createAutonomyBenchmarkService,
} from '../src/main/services/autonomy-benchmark-service.js';

interface CliArgs {
  runtimeKinds: RuntimeProfileKind[];
  scenarioIds: AutonomyBenchmarkScenarioId[];
  out: string | null;
  summaryOnly: boolean;
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isRuntimeKind(value: string): value is RuntimeProfileKind {
  return RUNTIME_PROFILE_KINDS.includes(value as RuntimeProfileKind);
}

function isScenarioId(value: string): value is AutonomyBenchmarkScenarioId {
  return AUTONOMY_BENCHMARK_SCENARIO_IDS.includes(value as AutonomyBenchmarkScenarioId);
}

function parseArgs(argv: string[]): CliArgs {
  const runtimeKinds = new Set<RuntimeProfileKind>();
  const scenarioIds = new Set<AutonomyBenchmarkScenarioId>();
  let out: string | null = null;
  let summaryOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === '--runtime' || arg === '--runtimes') && next) {
      for (const value of splitCsv(next)) {
        if (!isRuntimeKind(value)) {
          throw new Error(`Unknown runtime kind: ${value}`);
        }
        runtimeKinds.add(value);
      }
      index += 1;
      continue;
    }
    if ((arg === '--scenario' || arg === '--scenarios') && next) {
      for (const value of splitCsv(next)) {
        if (!isScenarioId(value)) {
          throw new Error(`Unknown benchmark scenario: ${value}`);
        }
        scenarioIds.add(value);
      }
      index += 1;
      continue;
    }
    if (arg === '--out' && next) {
      out = next;
      index += 1;
      continue;
    }
    if (arg === '--summary') {
      summaryOnly = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  pnpm autonomy:benchmark [--runtime bash,codex] [--scenario race-for-one-ticket] [--summary] [--out report.json]

Runtime kinds:
  ${RUNTIME_PROFILE_KINDS.join(', ')}

Scenarios:
  ${AUTONOMY_BENCHMARK_SCENARIO_IDS.join(', ')}`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    runtimeKinds:
      runtimeKinds.size > 0 ? [...runtimeKinds] : [...AUTONOMY_BENCHMARK_DEFAULT_RUNTIME_KINDS],
    scenarioIds: scenarioIds.size > 0 ? [...scenarioIds] : [...AUTONOMY_BENCHMARK_SCENARIO_IDS],
    out,
    summaryOnly,
  };
}

function printableReport(report: AutonomyBenchmarkReport, summaryOnly: boolean): unknown {
  if (!summaryOnly) return report;
  return {
    id: report.id,
    generatedAt: report.generatedAt,
    mode: report.mode,
    runtimeKinds: report.runtimeKinds,
    scenarioIds: report.scenarioIds,
    summary: report.summary,
    failures: report.results
      .filter((result) => result.status === 'failed')
      .map((result) => ({
        runtimeKind: result.runtimeKind,
        scenarioId: result.scenarioId,
        error: result.error,
      })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const service = createAutonomyBenchmarkService({
    createScenarioContext: createInMemoryAutonomyBenchmarkScenarioContext,
  });
  const report = await service.run({
    runtimeKinds: args.runtimeKinds,
    scenarioIds: args.scenarioIds,
  });
  const output = JSON.stringify(printableReport(report, args.summaryOnly), null, 2);
  if (args.out) {
    writeFileSync(resolve(args.out), `${output}\n`, 'utf8');
  }
  console.log(output);
  if (report.summary.failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
