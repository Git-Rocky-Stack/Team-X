import { useCallback, useMemo, useState } from 'react';

import type { AuditEvent, AuditFilter, Employee } from '@team-x/shared-types';
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileJson,
  FileSpreadsheet,
  Filter,
  List,
  Search,
  Shield,
  TrendingUp,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Separator } from '@/components/ui/separator.js';
import { useAuditEvents, useAuditExport, useAuditStats } from '@/hooks/use-audit.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

/** Event type → display color. */
const EVENT_TYPE_COLORS: Record<string, string> = {
  'employee.hired': 'bg-green-600/20 text-green-400',
  'employee.fired': 'bg-red-600/20 text-red-400',
  'employee.promoted': 'bg-blue-600/20 text-blue-400',
  'ticket.created': 'bg-cyan-600/20 text-cyan-400',
  'ticket.assigned': 'bg-yellow-600/20 text-yellow-400',
  'ticket.closed': 'bg-emerald-600/20 text-emerald-400',
  'meeting.started': 'bg-purple-600/20 text-purple-400',
  'meeting.ended': 'bg-purple-600/20 text-purple-400',
  'mcp.added': 'bg-orange-600/20 text-orange-400',
  'mcp.removed': 'bg-orange-600/20 text-orange-400',
  'chat.sent': 'bg-slate-600/20 text-slate-400',
  'backup.created': 'bg-indigo-600/20 text-indigo-400',
  'backup.restored': 'bg-indigo-600/20 text-indigo-400',
  'vault.uploaded': 'bg-teal-600/20 text-teal-400',
  'vault.deleted': 'bg-teal-600/20 text-teal-400',
  'work.started': 'bg-sky-600/20 text-sky-400',
  'work.completed': 'bg-sky-600/20 text-sky-400',
  'work.failed': 'bg-red-600/20 text-red-400',
  'token.delta': 'bg-gray-600/20 text-gray-400',
};

const DEFAULT_COLOR = 'bg-zinc-600/20 text-zinc-400';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatEventType(type: string): string {
  return type
    .split('.')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function getActorLabel(actorId: string, actorKind: string, employees: Employee[]): string {
  if (actorKind === 'user') return 'Rocky';
  if (actorKind === 'system' || actorKind === 'orchestrator') return actorKind;
  const emp = employees.find((e) => e.id === actorId);
  return emp?.name ?? actorId;
}

function tryParsePayload(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCards({
  totalEvents,
  eventsToday,
  topEventTypes,
}: {
  totalEvents: number;
  eventsToday: number;
  topEventTypes: Array<{ eventType: string; count: number }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">Total Events</CardTitle>
          <List className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-zinc-100">{totalEvents.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">Events Today</CardTitle>
          <TrendingUp className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-zinc-100">{eventsToday.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">Top Event Type</CardTitle>
          <Activity className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
          {(() => {
            const top = topEventTypes[0];
            return top ? (
              <>
                <div className="text-lg font-bold text-zinc-100">
                  {formatEventType(top.eventType)}
                </div>
                <p className="text-xs text-zinc-500">{top.count} occurrences</p>
              </>
            ) : (
              <div className="text-lg font-bold text-zinc-100">None</div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

function EventTypeChips({
  allTypes,
  selectedTypes,
  onToggle,
  onClear,
}: {
  allTypes: Array<{ eventType: string; count: number }>;
  selectedTypes: Set<string>;
  onToggle: (type: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-zinc-500" />
      {selectedTypes.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-700"
        >
          Clear <X className="h-3 w-3" />
        </button>
      )}
      {allTypes.slice(0, 15).map(({ eventType, count }) => {
        const active = selectedTypes.has(eventType);
        return (
          <button
            key={eventType}
            type="button"
            onClick={() => onToggle(eventType)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              active
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {formatEventType(eventType)} <span className="text-zinc-500">({count})</span>
          </button>
        );
      })}
    </div>
  );
}

function EventRow({
  event,
  employees,
  isExpanded,
  onToggle,
}: {
  event: AuditEvent;
  employees: Employee[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const colorClass = EVENT_TYPE_COLORS[event.eventType] ?? DEFAULT_COLOR;
  const payload = isExpanded ? tryParsePayload(event.payloadJson) : null;

  return (
    <div className="border-b border-zinc-800/50 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/30"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}

        <span className="w-36 shrink-0 text-xs text-zinc-500">
          {formatTimestamp(event.createdAt)}
        </span>

        <Badge variant="outline" className={`shrink-0 text-xs ${colorClass}`}>
          {formatEventType(event.eventType)}
        </Badge>

        <span className="ml-2 truncate text-sm text-zinc-300">
          {getActorLabel(event.actorId, event.actorKind, employees)}
        </span>

        <span className="ml-auto text-xs text-zinc-600">{event.actorKind}</span>
      </button>

      {isExpanded && payload && (
        <div className="border-t border-zinc-800/30 bg-zinc-900/30 px-4 py-3 pl-12">
          <p className="mb-1.5 text-xs font-medium text-zinc-400">Payload</p>
          <pre className="max-h-48 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AuditViewProps {
  companyId: string | null;
  employees: Employee[];
}

export function AuditView({ companyId, employees }: AuditViewProps) {
  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [searchActor, setSearchActor] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Build filter object
  const filter = useMemo<AuditFilter | null>(() => {
    if (!companyId) return null;
    const f: AuditFilter = {
      companyId,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (selectedTypes.size > 0) f.eventTypes = [...selectedTypes];
    if (searchActor.trim()) {
      // Try to find the employee by name
      const match = employees.find((e) => e.name.toLowerCase().includes(searchActor.toLowerCase()));
      f.actorId = match?.id ?? searchActor.trim();
    }
    if (dateFrom) f.fromMs = new Date(dateFrom).getTime();
    if (dateTo) f.toMs = new Date(dateTo).getTime() + 86400000; // end of day
    return f;
  }, [companyId, selectedTypes, searchActor, dateFrom, dateTo, page, employees]);

  const { data: events = [], isLoading } = useAuditEvents(filter);
  const { data: stats } = useAuditStats(companyId);
  const exportMutation = useAuditExport();

  const handleToggleType = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setPage(0);
  }, []);

  const handleClearTypes = useCallback(() => {
    setSelectedTypes(new Set());
    setPage(0);
  }, []);

  const handleExport = useCallback(
    (format: 'csv' | 'json') => {
      if (!filter) return;
      exportMutation.mutate({ filter, format });
    },
    [filter, exportMutation],
  );

  // Guard: no company selected
  if (!companyId) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Select a company to view the audit log.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold text-zinc-100">Audit Log</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
            disabled={exportMutation.isPending || !filter}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('json')}
            disabled={exportMutation.isPending || !filter}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <FileJson className="mr-1.5 h-3.5 w-3.5" />
            JSON
          </Button>
          {exportMutation.isSuccess && (
            <span className="text-xs text-green-400">
              Exported to {exportMutation.data.filePath.split(/[\\/]/).pop()}
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {stats && (
        <SummaryCards
          totalEvents={stats.totalEvents}
          eventsToday={stats.eventsToday}
          topEventTypes={stats.topEventTypes}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {stats && stats.topEventTypes.length > 0 && (
          <EventTypeChips
            allTypes={stats.topEventTypes}
            selectedTypes={selectedTypes}
            onToggle={handleToggleType}
            onClear={handleClearTypes}
          />
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="Filter by actor name..."
              value={searchActor}
              onChange={(e) => {
                setSearchActor(e.target.value);
                setPage(0);
              }}
              className="border-zinc-700 bg-zinc-900 pl-8 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-zinc-500" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className="w-36 border-zinc-700 bg-zinc-900 text-xs text-zinc-200"
            />
            <span className="text-xs text-zinc-500">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className="w-36 border-zinc-700 bg-zinc-900 text-xs text-zinc-200"
            />
          </div>
        </div>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Event list */}
      <ScrollArea className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/30">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-zinc-500">
            <Shield className="h-8 w-8" />
            <p className="text-sm">No events match the current filters.</p>
          </div>
        ) : (
          <div>
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                employees={employees}
                isExpanded={expandedId === event.id}
                onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {events.length > 0
            ? `Showing ${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + events.length}`
            : 'No results'}
          {stats ? ` of ${stats.totalEvents.toLocaleString()} total` : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="h-7 border-zinc-700 px-3 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Previous
          </Button>
          <span className="text-zinc-400">Page {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={events.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className="h-7 border-zinc-700 px-3 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
