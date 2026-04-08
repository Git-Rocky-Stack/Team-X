import type { ChatMessage, Employee } from './entities.js';
import type { DashboardEvent } from './events.js';

export interface ListEmployeesRequest {
  companyId: string;
}

export interface SendChatRequest {
  threadId: string;
  employeeId: string;
  content: string;
}

export interface ListChatRequest {
  threadId: string;
}

export interface IpcContract {
  'employees.list': {
    request: ListEmployeesRequest;
    response: Employee[];
  };
  'chat.send': {
    request: SendChatRequest;
    response: { messageId: string };
  };
  'chat.list': {
    request: ListChatRequest;
    response: ChatMessage[];
  };
}

export type IpcChannel = keyof IpcContract;
export type EventChannel = 'events.dashboard';
export type DashboardEventEnvelope = DashboardEvent;
