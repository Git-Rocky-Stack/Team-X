import type {
  DashboardEvent,
  TokenDeltaPayload,
  WorkCompletedPayload,
  WorkStartedPayload,
} from '@team-x/shared-types';
import { create } from 'zustand';

/** Options for opening a thread from the thread list. */
interface OpenThreadOpts {
  threadId: string;
  isAgentThread: boolean;
  employeeId: string | null;
}

/**
 * Per-employee live state tracked from dashboard events. The dashboard
 * cards and the chat drawer both read from this slice to show status
 * dots, streaming text previews, and "thinking" indicators.
 */
export interface EmployeeLiveState {
  status: 'idle' | 'thinking';
  currentStream: string;
  lastThreadId: string | null;
  lastMessageId: string | null;
}

export interface AppState {
  /** The employee whose chat drawer is open, or null when closed. */
  selectedEmployeeId: string | null;
  /** Whether the chat drawer is visible. */
  chatOpen: boolean;
  /** The resolved thread id for the currently open chat session. */
  activeThreadId: string | null;
  /** The id of the hardcoded Phase 1 company. Set on first employees.list fetch. */
  companyId: string | null;
  /** Per-employee live state fed by dashboard events. */
  employeeLive: Record<string, EmployeeLiveState>;
  /** Whether the thread list is showing in the chat drawer. */
  threadListView: boolean;
  /** True when viewing an employee-to-employee thread (read-only). */
  viewingAgentThread: boolean;
  /** Bumped on each `message.agent_to_agent` event — triggers thread list refetch. */
  lastAgentMessageAt: number;

  setSelectedEmployee: (id: string | null) => void;
  setChatOpen: (open: boolean) => void;
  setActiveThreadId: (threadId: string | null) => void;
  setCompanyId: (id: string) => void;
  openThreadList: () => void;
  openThread: (opts: OpenThreadOpts) => void;
  setThreadListView: (open: boolean) => void;
  handleDashboardEvent: (event: DashboardEvent) => void;
}

function defaultLive(): EmployeeLiveState {
  return { status: 'idle', currentStream: '', lastThreadId: null, lastMessageId: null };
}

export const useAppStore = create<AppState>((set) => ({
  selectedEmployeeId: null,
  chatOpen: false,
  activeThreadId: null,
  companyId: null,
  employeeLive: {},
  threadListView: false,
  viewingAgentThread: false,
  lastAgentMessageAt: 0,

  setSelectedEmployee: (id) =>
    set({
      selectedEmployeeId: id,
      chatOpen: id !== null,
      activeThreadId: null,
      threadListView: false,
      viewingAgentThread: false,
    }),

  setChatOpen: (open) =>
    set((state) => ({
      chatOpen: open,
      selectedEmployeeId: open ? state.selectedEmployeeId : null,
      activeThreadId: open ? state.activeThreadId : null,
      threadListView: open ? state.threadListView : false,
      viewingAgentThread: open ? state.viewingAgentThread : false,
    })),

  setActiveThreadId: (threadId) => set({ activeThreadId: threadId }),

  setCompanyId: (id) => set({ companyId: id }),

  openThreadList: () =>
    set({
      chatOpen: true,
      threadListView: true,
      selectedEmployeeId: null,
      activeThreadId: null,
      viewingAgentThread: false,
    }),

  openThread: ({ threadId, isAgentThread, employeeId }) =>
    set({
      activeThreadId: threadId,
      threadListView: false,
      viewingAgentThread: isAgentThread,
      selectedEmployeeId: employeeId,
      chatOpen: true,
    }),

  setThreadListView: (open) => set({ threadListView: open }),

  handleDashboardEvent: (event) =>
    set((state) => {
      const live = { ...state.employeeLive };

      if (event.type === 'message.agent_to_agent') {
        return { lastAgentMessageAt: Date.now() };
      }

      if (event.type === 'work.started') {
        const payload = event.payload as WorkStartedPayload;
        live[payload.employeeId] = {
          status: 'thinking',
          currentStream: '',
          lastThreadId: payload.threadId,
          lastMessageId: null,
        };
        return { employeeLive: live };
      }

      if (event.type === 'token.delta') {
        const payload = event.payload as TokenDeltaPayload;
        // Find the employee this token belongs to — match via actorId
        // which is set to the employee id by runAgent for token.delta events.
        const employeeId = event.actorId;
        const prev = live[employeeId] ?? defaultLive();
        live[employeeId] = {
          ...prev,
          currentStream: prev.currentStream + payload.delta,
          lastMessageId: payload.messageId,
        };
        return { employeeLive: live };
      }

      if (event.type === 'work.completed') {
        const payload = event.payload as WorkCompletedPayload;
        // Find the employee by scanning for the one with a matching thread.
        // work.completed is emitted by the orchestrator (actorId='orchestrator'),
        // so we need to look up by threadId.
        for (const [empId, empState] of Object.entries(live)) {
          if (empState.lastThreadId === payload.threadId) {
            live[empId] = { ...empState, status: 'idle' };
            break;
          }
        }
        return { employeeLive: live };
      }

      if (event.type === 'work.failed') {
        // Same thread-matching logic as work.completed.
        const payload = event.payload as { threadId?: string };
        if (payload.threadId) {
          for (const [empId, empState] of Object.entries(live)) {
            if (empState.lastThreadId === payload.threadId) {
              live[empId] = { ...empState, status: 'idle', currentStream: '' };
              break;
            }
          }
        }
        return { employeeLive: live };
      }

      return state;
    }),
}));
