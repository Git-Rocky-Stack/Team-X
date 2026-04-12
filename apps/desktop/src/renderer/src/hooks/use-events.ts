import { useInfiniteQuery } from '@tanstack/react-query';
import type { DashboardEvent, ListEventsResponse } from '@team-x/shared-types';

/**
 * React Query infinite-scroll hook for the Timeline subview.
 * Fetches paginated events newest-first from `events.list`.
 */
export function useTimelineEvents(companyId: string | null) {
  return useInfiniteQuery<ListEventsResponse>({
    queryKey: ['events', 'timeline', companyId],
    queryFn: async ({ pageParam }) => {
      if (!companyId) return { events: [], nextCursor: null };
      return window.teamx.events.list({
        companyId,
        cursor: pageParam as number | undefined,
        limit: 50,
      });
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: companyId !== null,
    refetchInterval: 5000,
  });
}

/**
 * Flatten all pages into a single event array.
 */
export function flattenEvents(pages: ListEventsResponse[] | undefined): DashboardEvent[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.events);
}
