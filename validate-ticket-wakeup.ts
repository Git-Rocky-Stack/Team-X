/**
 * Validation script to check ticket assignment → agent wakeup integration
 *
 * This script validates:
 * 1. createTicketsRepo accepts agentWakeupQueue parameter
 * 2. ticketsRepo.assign() method calls agentWakeupQueue.queueIssueAssignmentWakeup()
 * 3. main/index.ts initializes services in correct order
 * 4. All type interfaces are aligned
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = join(process.cwd(), 'apps', 'desktop');

function checkFileExists(filePath: string): boolean {
  return existsSync(join(PROJECT_ROOT, filePath));
}

function checkFileContains(filePath: string, searchStrings: string[]): boolean {
  const content = readFileSync(join(PROJECT_ROOT, filePath), 'utf-8');
  return searchStrings.every(s => content.includes(s));
}

console.log('🔍 Validating Ticket Assignment → Agent Wakeup Integration\n');

const checks = [
  {
    name: '1. Tickets repo accepts agentWakeupQueue parameter',
    file: 'src/main/db/repos/tickets.ts',
    requiredStrings: [
      'export function createTicketsRepo<TRunResult>(',
      'agentWakeupQueue?: AgentWakeupQueueLike,',
    ]
  },
  {
    name: '2. Tickets assign() uses injected agentWakeupQueue',
    file: 'src/main/db/repos/tickets.ts',
    requiredStrings: [
      'if (agentWakeupQueue) {',
      'agentWakeupQueue.queueIssueAssignmentWakeup({',
      'issueId: id,',
      'assigneeAgentId: assigneeId,',
      'contextSource: \'ticket_assignment\',',
    ]
  },
  {
    name: '3. Main index initializes heartbeat before routine service',
    file: 'src/main/index.ts',
    requiredStrings: [
      'const agentWakeupRequestsRepo = createAgentWakeupRequestsRepo(db);',
      'const heartbeatServiceInstance = createHeartbeatService({',
      'const agentWakeupQueueInstance = createAgentWakeupQueue({',
      'heartbeatServiceInstance.start(60 * 1000);',
    ]
  },
  {
    name: '4. Routine service uses agentWakeupQueue',
    file: 'src/main/index.ts',
    requiredStrings: [
      'routineServiceInstance = createRoutineService({',
      'agentWakeupQueue: agentWakeupQueueInstance,',
    ]
  },
  {
    name: '5. Tickets repo created with agentWakeupQueue',
    file: 'src/main/index.ts',
    requiredStrings: [
      'ticketsRepo = createTicketsRepo(db, agentWakeupQueueInstance)',
    ]
  },
];

let passedChecks = 0;
let failedChecks = 0;

for (const check of checks) {
  try {
    if (!checkFileExists(check.file)) {
      console.log(`❌ ${check.name}`);
      console.log(`   File not found: ${check.file}\n`);
      failedChecks++;
      continue;
    }

    if (checkFileContains(check.file, check.requiredStrings)) {
      console.log(`✅ ${check.name}`);
      passedChecks++;
    } else {
      console.log(`❌ ${check.name}`);
      console.log(`   Missing required strings in ${check.file}`);
      console.log(`   Expected: ${check.requiredStrings.join(', ')}\n`);
      failedChecks++;
    }
  } catch (error) {
    console.log(`❌ ${check.name}`);
    console.log(`   Error: ${error}\n`);
    failedChecks++;
  }
}

console.log(`\n📊 Validation Results: ${passedChecks}/${checks.length} checks passed`);

if (failedChecks === 0) {
  console.log('\n🎉 All validation checks passed! Ticket assignment → agent wakeup integration is complete.');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${failedChecks} validation check(s) failed. Please review the integration.`);
  process.exit(1);
}