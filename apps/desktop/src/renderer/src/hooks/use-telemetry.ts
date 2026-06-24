/**
 * React Query hooks for the Telemetry tab (Phase 3 — M17).
 *
 * Four hooks matching the four telemetry IPC channels:
 * - useCompanyStats — aggregate company-level summary
 * - useDailyUsage — daily time-series for charts
 * - useEmployeeStats — per-employee breakdown table
 * - useCostBreakdown — by provider/model with date range filter
 */

import { skipToken, useQuery } from '@tanstack/react-query';
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
    queryFn:
      req !== null && req.companyId.length > 0 ? () => ipc.telemetry.companyStats(req) : skipToken,
    // The Mission Control dashboard subscribes to the same companyStats
    // cache key (no kind filter) on app boot. Without 'always' here, the
    // global staleTime (5s) keeps that initial value fresh, so when the
    // user (or the M39 e2e) navigates to Telemetry mid-stale-window the
    // page renders the boot-time count instead of the current count.
    // 'always' refetches every time CompanyTelemetry mounts → Telemetry
    // tab always shows fresh data on entry.
    refetchOnMount: 'always',
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
    queryFn:
      req !== null && req.companyId.length > 0 ? () => ipc.telemetry.dailyUsage(req) : skipToken,
  });
}

export function useEmployeeStats(req: TelemetryEmployeeStatsRequest | null) {
  return useQuery({
    queryKey: ['telemetry', 'employeeStats', req?.companyId, req?.kind ?? 'all'],
    queryFn:
      req !== null && req.companyId.length > 0 ? () => ipc.telemetry.employeeStats(req) : skipToken,
  });
}

export function useRecentRuns(req: TelemetryRecentRunsRequest | null) {
  return useQuery({
    queryKey: ['telemetry', 'recentRuns', req?.companyId, req?.limit ?? 6, req?.kind ?? 'all'],
    queryFn:
      req !== null && req.companyId.length > 0 ? () => ipc.telemetry.recentRuns(req) : skipToken,
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
    queryFn:
      req !== null && req.companyId.length > 0 ? () => ipc.telemetry.costBreakdown(req) : skipToken,
  });
}
