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
  /**
   * True when the thread belongs to the M31 system pseudo-employee. The
   * drawer switches to the read-only Copilot step-transcript layout and
   * hides the composer. Defaults to false so existing callers keep the
   * employee-DM / agent-thread behaviour unchanged.
   */
  isCopilotThread?: boolean;
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

export interface PendingDirectChatState {
  queuedMessages: string[];
  isStopping: boolean;
  awaitingReply: boolean;
}

/** Top-level view tab in the cockpit. Phase 3 enables all tabs. */
export type ActiveView =
  | 'dashboard'
  | 'org'
  | 'projects'
  | 'tickets'
  | 'meetings'
  | 'chat'
  | 'files'
  | 'telemetry'
  | 'audit'
  | 'user-guide'
  | 'settings';

export type SettingsSectionFocus = 'providers' | 'extensions';

/** Dashboard inner subview tabs. */
export type DashboardSubview = 'cards' | 'timeline' | 'stream' | 'floor' | 'commands';

/** Projects inner subview tabs. */
export type ProjectsSubview = 'kanban' | 'goals';

/** Telemetry inner subview tabs. */
export type TelemetrySubview = 'company' | 'employees' | 'cost';

export interface AppState {
  /** Which top-level view is active. */
  activeView: ActiveView;
  /** Which dashboard subview is showing (Cards/Timeline/Stream/Floor). */
  dashboardSubview: DashboardSubview;
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
  /**
   * True when viewing a system-agent (Copilot) thread. The drawer
   * renders the M31 step-transcript read-only view with no composer.
   * Mutually exclusive with `viewingAgentThread` — a thread is either
   * employee-to-employee (classic agent thread) or user-to-system-agent.
   */
  viewingCopilotThread: boolean;
  /** Bumped on each `message.agent_to_agent` event — triggers thread list refetch. */
  lastAgentMessageAt: number;
  /** Currently selected ticket id for detail panel. */
  activeTicketId: string | null;
  /** Currently selected project id for detail panel. */
  activeProjectId: string | null;
  /** Currently selected goal id for detail panel. */
  activeGoalId: string | null;
  /** Which projects subview is showing (Kanban / Goals). */
  projectsSubview: ProjectsSubview;
  /** Currently selected meeting id for detail panel. */
  activeMeetingId: string | null;
  /** Which telemetry subview is showing (Company / Employees / Cost). */
  telemetrySubview: TelemetrySubview;
  /**
   * Whether the Copilot sidebar panel is open (Phase 5 — M34).
   * Toggled by `Cmd+Shift+K`, the Sparkles toolbar button, and the
   * dashboard widget's "View all" link. Single source of truth shared
   * by all three entry points so the toggle state never drifts.
   */
  copilotSidebarOpen: boolean;
  /** Per-employee queued direct-chat follow-ups and stop state. */
  pendingDirectChats: Record<string, PendingDirectChatState>;
  /** Optional section to focus when Settings opens. */
  settingsFocusSection: SettingsSectionFocus | null;
  /** Incremented when another surface needs the Hire dialog to open. */
  hireDialogRequestNonce: number;

  setActiveView: (view: ActiveView) => void;
  setCopilotSidebarOpen: (open: boolean) => void;
  setDashboardSubview: (subview: DashboardSubview) => void;
  setProjectsSubview: (subview: ProjectsSubview) => void;
  setTelemetrySubview: (subview: TelemetrySubview) => void;
  setActiveProjectId: (projectId: string | null) => void;
  setActiveGoalId: (goalId: string | null) => void;
  setSelectedEmployee: (id: string | null) => void;
  setChatOpen: (open: boolean) => void;
  setActiveThreadId: (threadId: string | null) => void;
  setCompanyId: (id: string | null) => void;
  openThreadList: () => void;
  openThread: (opts: OpenThreadOpts) => void;
  setThreadListView: (open: boolean) => void;
  setActiveTicketId: (ticketId: string | null) => void;
  setActiveMeetingId: (meetingId: string | null) => void;
  setSettingsFocusSection: (section: SettingsSectionFocus | null) => void;
  openSettingsSection: (section: SettingsSectionFocus) => void;
  requestHireDialog: () => void;
  enqueueQueuedDirectChatMessage: (employeeId: string, content: string) => void;
  dequeueQueuedDirectChatMessage: (employeeId: string) => string | null;
  setDirectChatStopping: (employeeId: string, isStopping: boolean) => void;
  setDirectChatAwaitingReply: (employeeId: string, awaitingReply: boolean) => void;
  handleDashboardEvent: (event: DashboardEvent) => void;
}

function defaultLive(): EmployeeLiveState {
  return { status: 'idle', currentStream: '', lastThreadId: null, lastMessageId: null };
}

function defaultPendingDirectChat(): PendingDirectChatState {
  return { queuedMessages: [], isStopping: false, awaitingReply: false };
}

function upsertPendingDirectChats(
  pendingDirectChats: Record<string, PendingDirectChatState>,
  employeeId: string,
  next: PendingDirectChatState,
): Record<string, PendingDirectChatState> {
  if (next.queuedMessages.length === 0 && !next.isStopping && !next.awaitingReply) {
    const { [employeeId]: _removed, ...rest } = pendingDirectChats;
    return rest;
  }
  return { ...pendingDirectChats, [employeeId]: next };
}

export const useAppStore = create<AppState>((set, get) => ({
  activeView: 'dashboard',
  dashboardSubview: 'cards',
  selectedEmployeeId: null,
  chatOpen: false,
  activeThreadId: null,
  companyId: null,
  employeeLive: {},
  threadListView: false,
  viewingAgentThread: false,
  viewingCopilotThread: false,
  lastAgentMessageAt: 0,
  activeTicketId: null,
  activeProjectId: null,
  activeGoalId: null,
  projectsSubview: 'kanban',
  activeMeetingId: null,
  telemetrySubview: 'company',
  copilotSidebarOpen: false,
  pendingDirectChats: {},
  settingsFocusSection: null,
  hireDialogRequestNonce: 0,

  setCopilotSidebarOpen: (open) => set({ copilotSidebarOpen: open }),

  setActiveView: (view) =>
    set({
      activeView: view,
      activeTicketId: null,
      activeProjectId: null,
      activeGoalId: null,
      activeMeetingId: null,
    }),

  setDashboardSubview: (subview) => set({ dashboardSubview: subview }),
  setTelemetrySubview: (subview) => set({ telemetrySubview: subview }),

  setSelectedEmployee: (id) =>
    set({
      selectedEmployeeId: id,
      chatOpen: id !== null,
      activeThreadId: null,
      threadListView: false,
      viewingAgentThread: false,
      viewingCopilotThread: false,
    }),

  setChatOpen: (open) =>
    set((state) => ({
      chatOpen: open,
      selectedEmployeeId: open ? state.selectedEmployeeId : null,
      activeThreadId: open ? state.activeThreadId : null,
      threadListView: open ? state.threadListView : false,
      viewingAgentThread: open ? state.viewingAgentThread : false,
      viewingCopilotThread: open ? state.viewingCopilotThread : false,
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
      viewingCopilotThread: false,
    }),

  openThread: ({ threadId, isAgentThread, employeeId, isCopilotThread }) =>
    set({
      activeThreadId: threadId,
      threadListView: false,
      viewingAgentThread: isAgentThread,
      viewingCopilotThread: isCopilotThread ?? false,
      selectedEmployeeId: employeeId,
      chatOpen: true,
    }),

  setThreadListView: (open) => set({ threadListView: open }),

  setActiveTicketId: (ticketId) => set({ activeTicketId: ticketId }),
  setActiveMeetingId: (meetingId) => set({ activeMeetingId: meetingId }),
  setSettingsFocusSection: (section) => set({ settingsFocusSection: section }),
  openSettingsSection: (section) =>
    set({
      activeView: 'settings',
      settingsFocusSection: section,
      activeTicketId: null,
      activeProjectId: null,
      activeGoalId: null,
      activeMeetingId: null,
    }),
  requestHireDialog: () =>
    set((state) => ({
      hireDialogRequestNonce: state.hireDialogRequestNonce + 1,
    })),

  enqueueQueuedDirectChatMessage: (employeeId, content) =>
    set((state) => {
      const prev = state.pendingDirectChats[employeeId] ?? defaultPendingDirectChat();
      return {
        pendingDirectChats: {
          ...state.pendingDirectChats,
          [employeeId]: {
            ...prev,
            queuedMessages: [...prev.queuedMessages, content],
          },
        },
      };
    }),

  dequeueQueuedDirectChatMessage: (employeeId) => {
    const prev = get().pendingDirectChats[employeeId];
    if (!prev || prev.queuedMessages.length === 0) return null;
    const [nextMessage, ...rest] = prev.queuedMessages;
    set((state) => ({
      pendingDirectChats: upsertPendingDirectChats(state.pendingDirectChats, employeeId, {
        ...prev,
        queuedMessages: rest,
      }),
    }));
    return nextMessage ?? null;
  },

  setDirectChatStopping: (employeeId, isStopping) =>
    set((state) => {
      const prev = state.pendingDirectChats[employeeId] ?? defaultPendingDirectChat();
      return {
        pendingDirectChats: upsertPendingDirectChats(state.pendingDirectChats, employeeId, {
          ...prev,
          isStopping,
        }),
      };
    }),

  setDirectChatAwaitingReply: (employeeId, awaitingReply) =>
    set((state) => {
      const prev = state.pendingDirectChats[employeeId] ?? defaultPendingDirectChat();
      return {
        pendingDirectChats: upsertPendingDirectChats(state.pendingDirectChats, employeeId, {
          ...prev,
          awaitingReply,
        }),
      };
    }),

  setProjectsSubview: (subview) => set({ projectsSubview: subview }),
  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
  setActiveGoalId: (goalId) => set({ activeGoalId: goalId }),

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
