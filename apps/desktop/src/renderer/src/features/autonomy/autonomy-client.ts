import { ipc } from '@/lib/ipc.js';

/**
 * Renderer transport seam for the autonomy control plane.
 *
 * Today this is backed by Electron IPC. The hook layer depends on this
 * boundary instead of the raw preload object so the same domain surface
 * can later be served by a remote/shared API without rewriting every
 * autonomy hook.
 */
export const autonomyClient = {
  operators: {
    list: (...args: Parameters<typeof ipc.operators.list>) => ipc.operators.list(...args),
    readiness: (...args: Parameters<typeof ipc.operators.readiness>) =>
      ipc.operators.readiness(...args),
    listInvites: (...args: Parameters<typeof ipc.operators.listInvites>) =>
      ipc.operators.listInvites(...args),
    createInvite: (...args: Parameters<typeof ipc.operators.createInvite>) =>
      ipc.operators.createInvite(...args),
    revokeInvite: (...args: Parameters<typeof ipc.operators.revokeInvite>) =>
      ipc.operators.revokeInvite(...args),
    acceptInvite: (...args: Parameters<typeof ipc.operators.acceptInvite>) =>
      ipc.operators.acceptInvite(...args),
  },
  cloud: {
    getWorkspaceLink: (...args: Parameters<typeof ipc.cloud.getWorkspaceLink>) =>
      ipc.cloud.getWorkspaceLink(...args),
    linkWorkspace: (...args: Parameters<typeof ipc.cloud.linkWorkspace>) =>
      ipc.cloud.linkWorkspace(...args),
    unlinkWorkspace: (...args: Parameters<typeof ipc.cloud.unlinkWorkspace>) =>
      ipc.cloud.unlinkWorkspace(...args),
    reconnectWorkspace: (...args: Parameters<typeof ipc.cloud.reconnectWorkspace>) =>
      ipc.cloud.reconnectWorkspace(...args),
  },
  runtimeProfiles: {
    list: (...args: Parameters<typeof ipc.runtimeProfiles.list>) =>
      ipc.runtimeProfiles.list(...args),
    create: (...args: Parameters<typeof ipc.runtimeProfiles.create>) =>
      ipc.runtimeProfiles.create(...args),
    update: (...args: Parameters<typeof ipc.runtimeProfiles.update>) =>
      ipc.runtimeProfiles.update(...args),
    delete: (...args: Parameters<typeof ipc.runtimeProfiles.delete>) =>
      ipc.runtimeProfiles.delete(...args),
    bindEmployee: (...args: Parameters<typeof ipc.runtimeProfiles.bindEmployee>) =>
      ipc.runtimeProfiles.bindEmployee(...args),
    validate: (...args: Parameters<typeof ipc.runtimeProfiles.validate>) =>
      ipc.runtimeProfiles.validate(...args),
  },
  runtimeOperations: {
    snapshot: (...args: Parameters<typeof ipc.runtimeOperations.snapshot>) =>
      ipc.runtimeOperations.snapshot(...args),
  },
  autonomyDoctor: {
    run: (...args: Parameters<typeof ipc.autonomyDoctor.run>) => ipc.autonomyDoctor.run(...args),
  },
  autonomyBenchmark: {
    run: (...args: Parameters<typeof ipc.autonomyBenchmark.run>) =>
      ipc.autonomyBenchmark.run(...args),
  },
  agentImprovement: {
    list: (...args: Parameters<typeof ipc.agentImprovement.list>) =>
      ipc.agentImprovement.list(...args),
    run: (...args: Parameters<typeof ipc.agentImprovement.run>) =>
      ipc.agentImprovement.run(...args),
  },
  routines: {
    list: (...args: Parameters<typeof ipc.routines.list>) => ipc.routines.list(...args),
    listRuns: (...args: Parameters<typeof ipc.routines.listRuns>) => ipc.routines.listRuns(...args),
    create: (...args: Parameters<typeof ipc.routines.create>) => ipc.routines.create(...args),
    update: (...args: Parameters<typeof ipc.routines.update>) => ipc.routines.update(...args),
    delete: (...args: Parameters<typeof ipc.routines.delete>) => ipc.routines.delete(...args),
    runNow: (...args: Parameters<typeof ipc.routines.runNow>) => ipc.routines.runNow(...args),
  },
  budgets: {
    getOverview: (...args: Parameters<typeof ipc.budgets.getOverview>) =>
      ipc.budgets.getOverview(...args),
    listPolicies: (...args: Parameters<typeof ipc.budgets.listPolicies>) =>
      ipc.budgets.listPolicies(...args),
    listLedger: (...args: Parameters<typeof ipc.budgets.listLedger>) =>
      ipc.budgets.listLedger(...args),
    listApprovals: (...args: Parameters<typeof ipc.budgets.listApprovals>) =>
      ipc.budgets.listApprovals(...args),
    createPolicy: (...args: Parameters<typeof ipc.budgets.createPolicy>) =>
      ipc.budgets.createPolicy(...args),
    updatePolicy: (...args: Parameters<typeof ipc.budgets.updatePolicy>) =>
      ipc.budgets.updatePolicy(...args),
    deletePolicy: (...args: Parameters<typeof ipc.budgets.deletePolicy>) =>
      ipc.budgets.deletePolicy(...args),
  },
  approvals: {
    list: (...args: Parameters<typeof ipc.approvals.list>) => ipc.approvals.list(...args),
    review: (...args: Parameters<typeof ipc.approvals.review>) => ipc.approvals.review(...args),
  },
  artifacts: {
    list: (...args: Parameters<typeof ipc.artifacts.list>) => ipc.artifacts.list(...args),
  },
  memory: {
    getThreadDigest: (...args: Parameters<typeof ipc.memory.getThreadDigest>) =>
      ipc.memory.getThreadDigest(...args),
    listRunCheckpoints: (...args: Parameters<typeof ipc.memory.listRunCheckpoints>) =>
      ipc.memory.listRunCheckpoints(...args),
    packThreadContext: (...args: Parameters<typeof ipc.memory.packThreadContext>) =>
      ipc.memory.packThreadContext(...args),
  },
} as const;

export type AutonomyClient = typeof autonomyClient;
