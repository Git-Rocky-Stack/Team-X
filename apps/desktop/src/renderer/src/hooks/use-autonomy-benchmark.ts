import { useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import type {
  AutonomyBenchmarkReport,
  AutonomyBenchmarkScenarioId,
  RuntimeProfileKind,
} from '@team-x/shared-types';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

export interface AutonomyBenchmarkRunOptions {
  runtimeKinds?: RuntimeProfileKind[];
  scenarioIds?: AutonomyBenchmarkScenarioId[];
}

export function useAutonomyBenchmark(companyId: string | null | undefined) {
  const [report, setReport] = useState<AutonomyBenchmarkReport | null>(null);
  const benchmarkMutation = useMutation({
    mutationKey: ['autonomy-benchmark', companyId],
    mutationFn: (input: AutonomyBenchmarkRunOptions = {}) =>
      autonomyClient.autonomyBenchmark.run({
        companyId: requireString(companyId, 'companyId'),
        runtimeKinds: input.runtimeKinds,
        scenarioIds: input.scenarioIds,
      }),
    onSuccess: setReport,
  });

  return {
    report,
    run: benchmarkMutation.mutate,
    runAsync: benchmarkMutation.mutateAsync,
    isRunning: benchmarkMutation.isPending,
    isError: benchmarkMutation.isError,
    error: benchmarkMutation.error,
    reset: () => {
      benchmarkMutation.reset();
      setReport(null);
    },
  };
}
