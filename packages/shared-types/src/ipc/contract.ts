/**
 * The low-level channel map used by `ipcMain.handle` and its generic helpers.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { IpcContractOperations } from './contract-operations.js';
import type { IpcContractWorkspace } from './contract-workspace.js';

// ---------------------------------------------------------------------------
// Low-level channel map (used by ipcMain.handle and its generic helpers)
// ---------------------------------------------------------------------------

/**
 * Every renderer-callable channel keyed by name, declared in two halves so
 * neither file outgrows the source-size budget (audit 2026-10-07 P1-7).
 * A channel name belongs to exactly one half.
 */
export interface IpcContract extends IpcContractWorkspace, IpcContractOperations {}

export type IpcChannel = keyof IpcContract;
export type EventChannel = 'events.dashboard';
