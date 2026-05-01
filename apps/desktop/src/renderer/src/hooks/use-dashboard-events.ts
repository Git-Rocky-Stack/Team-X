import type { DashboardEvent } from '@team-x/shared-types';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';
import { useAppStore } from '@/store/app-store.js';

/**
 * Subscribe to the main-process dashboard event stream and feed
 * every event into the Zustand store's `handleDashboardEvent`
 * reducer. This is a mount-once hook — it attaches a single
 * `ipc.events.onDashboard` listener on mount and removes it on
 * unmount. The listener runs for the entire lifetime of the App
 * component so every dashboard event reaches the store regardless
 * of which view is active.
 *
 * Call this ONCE from the top-level App or Layout component. Do NOT
 * call it from individual feature components — multiple subscriptions
 * would duplicate event processing and cause double state updates.
 */
export function useDashboardEvents(): void {
  const handleEvent = useAppStore((s) => s.handleDashboardEvent);

  useEffect(() => {
    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      handleEvent(event);
    });
    return unsubscribe;
  }, [handleEvent]);
}
