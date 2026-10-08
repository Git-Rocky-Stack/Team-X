/**
 * The IPC handler contract: one method per renderer-callable channel.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */

import type { IpcHandlersOperations } from './contract-operations.js';
import type { IpcHandlersWorkspace } from './contract-workspace.js';

/**
 * One method per renderer-callable channel, declared in two halves; a
 * channel belongs to exactly one.
 */
export interface IpcHandlers extends IpcHandlersWorkspace, IpcHandlersOperations {}
