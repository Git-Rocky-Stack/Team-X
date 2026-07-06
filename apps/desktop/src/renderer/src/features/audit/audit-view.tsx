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
  TrendingUp,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Faceplate, MetricTile, RecessedWell, SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Separator } from '@/components/ui/separator.js';
import {
  AuditEventChip,
  buildRowSummary,
  formatEventType,
} from '@/features/audit/audit-event-chip.js';
import { useAuditEvents, useAuditExport, useAuditStats } from '@/hooks/use-audit.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

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
  const top = topEventTypes[0];
  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricTile label="Total Events" value={totalEvents.toLocaleString()} icon={List} />
      <MetricTile label="Events Today" value={eventsToday.toLocaleString()} icon={TrendingUp} />
      <MetricTile
        label="Top Event Type"
        value={top ? formatEventType(top.eventType) : 'None'}
        hint={top ? `${top.count} occurrences` : undefined}
        icon={Activity}
      />
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
      <Filter className="h-4 w-4 text-muted-foreground" />
      {selectedTypes.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 rounded-[var(--r-pill)] border border-[var(--hairline)] px-2 py-0.5 text-button-sm text-muted-foreground transition-colors hover:border-[var(--hairline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            aria-pressed={active}
            className={`rounded-[var(--r-pill)] border px-2.5 py-0.5 text-button-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)] text-foreground'
                : 'border-[var(--hairline)] text-muted-foreground transition-colors hover:border-[var(--hairline-strong)]'
            }`}
          >
            {formatEventType(eventType)} <span className="text-muted-foreground/60">({count})</span>
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
  const payload = isExpanded ? tryParsePayload(event.payloadJson) : null;
  const rowSummary = buildRowSummary(event.eventType, event.payloadJson);

  return (
    <div className="border-b border-[var(--display-border)] last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--display-fg)] opacity-50" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--display-fg)] opacity-50" />
        )}

        <span className="w-36 shrink-0 text-caption text-[var(--display-fg)] opacity-55">
          {formatTimestamp(event.createdAt)}
        </span>

        <AuditEventChip eventType={event.eventType} />

        <span className="shrink-0 text-body text-[var(--display-fg)] opacity-85">
          {getActorLabel(event.actorId, event.actorKind, employees)}
        </span>

        {rowSummary ? (
          <span
            className="ml-2 min-w-0 flex-1 truncate text-caption text-[var(--display-fg)] opacity-70"
            title={rowSummary}
          >
            {rowSummary}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        <span className="ml-auto shrink-0 text-caption text-[var(--display-fg)] opacity-45">
          {event.actorKind}
        </span>
      </button>

      {isExpanded && payload && (
        <div className="border-t border-[var(--display-border)] bg-white/[0.02] px-4 py-3 pl-12">
          <p className="mb-1.5 text-label text-[var(--display-fg)] opacity-60">Payload</p>
          <pre className="max-h-48 overflow-auto rounded-inset bg-[var(--void)] p-3 text-code-sm text-[var(--display-fg)]">
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
      <div className="flex h-full flex-col justify-center p-4">
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="Select a company to view the audit log."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <Faceplate
        kicker="Governance"
        serial="AUDIT"
        bodyClassName="flex items-center justify-between"
      >
        <h1 className="text-h1 text-foreground">Audit Log</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
            disabled={exportMutation.isPending || !filter}
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('json')}
            disabled={exportMutation.isPending || !filter}
          >
            <FileJson className="mr-1.5 h-3.5 w-3.5" />
            JSON
          </Button>
          {exportMutation.isSuccess && (
            <span className="text-caption text-[var(--tag-go)]">
              Exported to {exportMutation.data.filePath.split(/[\\/]/).pop()}
            </span>
          )}
        </div>
      </Faceplate>

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
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by actor name..."
              value={searchActor}
              onChange={(e) => {
                setSearchActor(e.target.value);
                setPage(0);
              }}
              className="pl-8 text-body"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className="w-36 text-caption"
            />
            <span className="text-caption text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className="w-36 text-caption"
            />
          </div>
        </div>
      </div>

      <Separator className="bg-[var(--hairline)]" />

      {/* Event list */}
      {isLoading ? (
        <SubviewState
          className="flex-1"
          lampLabel="SYNC"
          lampTone="hold"
          title="Loading audit events..."
        />
      ) : events.length === 0 ? (
        <SubviewState
          className="flex-1"
          lampLabel="STBY"
          lampTone="off"
          title="No events match the current filters."
        />
      ) : (
        <RecessedWell className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
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
          </ScrollArea>
        </RecessedWell>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-caption text-muted-foreground">
        <span>
          {events.length > 0
            ? `Showing ${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + events.length}`
            : 'No results'}
          {stats ? ` of ${stats.totalEvents.toLocaleString()} total` : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="cap px-3 py-1 text-button-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-muted-foreground">Page {page + 1}</span>
          <button
            type="button"
            disabled={events.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className="cap px-3 py-1 text-button-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
