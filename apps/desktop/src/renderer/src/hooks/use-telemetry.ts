/**
 * React Query hooks for the Telemetry tab (Phase 3 — M17).
 *
 * Four hooks matching the four telemetry IPC channels:
 * - useCompanyStats — aggregate company-level summary
 * - useDailyUsage — daily time-series for charts
 * - useEmployeeStats — per-employee breakdown table
 * - useCostBreakdown — by provider/model with date range filter
 */

import { useQuery } from '@tanstack/react-query';

import type {
  TelemetryCompanyStatsRequest,
  TelemetryCostBreakdownRequest,
  TelemetryDailyUsageRequest,
  TelemetryEmployeeStatsRequest,
  TelemetryKindFilter,
  TelemetryRecentRunsRequest,
  TelemetryRunKind,
} from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

export function telemetryRequestKind(filter: TelemetryKindFilter): TelemetryRunKind | undefined {
  return filter === 'all' ? undefined : filter;
}

export function useCompanyStats(req: TelemetryCompanyStatsRequest | null) {
  return useQuery({
    queryKey: ['telemetry', 'companyStats', req?.companyId, req?.kind ?? 'all'],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.telemetry.companyStats(req!),
    enabled: req !== null && req.companyId.length > 0,
  });
}

export function useDailyUsage(req: TelemetryDailyUsageRequest | null) {
  return useQuery({
    queryKey: [
      'telemetry',
      'dailyUsage',
      req?.companyId,
      req?.fromMs,
      req?.toMs,
      req?.kind ?? 'all',
    ],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.telemetry.dailyUsage(req!),
    enabled: req !== null && req.companyId.length > 0,
  });
}

export function useEmployeeStats(req: TelemetryEmployeeStatsRequest | null) {
  return useQuery({
    queryKey: ['telemetry', 'employeeStats', req?.companyId, req?.kind ?? 'all'],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.telemetry.employeeStats(req!),
    enabled: req !== null && req.companyId.length > 0,
  });
}

export function useRecentRuns(req: TelemetryRecentRunsRequest | null) {
  return useQuery({
    queryKey: ['telemetry', 'recentRuns', req?.companyId, req?.limit ?? 6, req?.kind ?? 'all'],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.telemetry.recentRuns(req!),
    enabled: req !== null && req.companyId.length > 0,
    staleTime: 15_000,
  });
}

export function useCostBreakdown(req: TelemetryCostBreakdownRequest | null) {
  return useQuery({
    queryKey: [
      'telemetry',
      'costBreakdown',
      req?.companyId,
      req?.fromMs,
      req?.toMs,
      req?.kind ?? 'all',
    ],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.telemetry.costBreakdown(req!),
    enabled: req !== null && req.companyId.length > 0,
  });
}
