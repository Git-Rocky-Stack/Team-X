/**
 * 60 labeled text → intent examples (4 per intent) — M30 T1 regression guardrail.
 *
 * Real-world phrasings a human would plausibly type into the Cmd+K
 * palette. Consumed by `intent-examples.test.ts` (which pairs them
 * with a deterministic mock classifier) and will be reused by the
 * command-palette E2E as a smoke harness against real providers.
 */

import type { IntentName } from '../intent-classifier.js';

export interface LabeledExample {
  readonly text: string;
  readonly intent: IntentName;
}

export const INTENT_EXAMPLES: readonly LabeledExample[] = [
  // hire_employee (4)
  { text: 'Hire a senior frontend engineer', intent: 'hire_employee' },
  { text: 'Bring on a staff data scientist', intent: 'hire_employee' },
  { text: 'We need a CMO reporting to the CEO', intent: 'hire_employee' },
  { text: 'Add a DevOps lead to the platform team', intent: 'hire_employee' },

  // fire_employee (4)
  { text: 'Fire James', intent: 'fire_employee' },
  { text: 'Let Sarah go', intent: 'fire_employee' },
  { text: 'Remove Alex from the company', intent: 'fire_employee' },
  { text: 'Terminate the senior QA engineer', intent: 'fire_employee' },

  // assign_ticket (4)
  { text: 'Assign the auth bug to Sarah', intent: 'assign_ticket' },
  { text: 'Give ticket #42 to James', intent: 'assign_ticket' },
  { text: 'Hand the billing regression to the backend lead', intent: 'assign_ticket' },
  { text: 'Route the onboarding ticket to Priya', intent: 'assign_ticket' },

  // create_ticket (4)
  { text: 'Open a ticket for the 500 errors on checkout', intent: 'create_ticket' },
  { text: 'File a P0 bug: login page blank', intent: 'create_ticket' },
  { text: 'Create a ticket to refactor the auth flow', intent: 'create_ticket' },
  { text: 'Log an issue about the slow dashboard load', intent: 'create_ticket' },

  // close_ticket (4)
  { text: 'Close the login bug', intent: 'close_ticket' },
  { text: 'Mark ticket #17 as done', intent: 'close_ticket' },
  { text: 'Resolve the billing regression', intent: 'close_ticket' },
  { text: 'The checkout ticket is fixed — close it', intent: 'close_ticket' },

  // promote_employee (4)
  { text: 'Promote Sarah to staff engineer', intent: 'promote_employee' },
  { text: 'Move James up to senior manager', intent: 'promote_employee' },
  { text: 'Elevate Alex to principal engineer', intent: 'promote_employee' },
  { text: 'Bump Priya to engineering lead', intent: 'promote_employee' },

  // create_project (4)
  { text: 'Start a new project called Atlas Migration', intent: 'create_project' },
  { text: "Create project 'Mobile Rewrite' led by Sarah", intent: 'create_project' },
  { text: 'Spin up a project for the Q3 launch', intent: 'create_project' },
  { text: 'New project: Infra Hardening', intent: 'create_project' },

  // create_goal (4)
  { text: 'Add a goal: ship v2 by Q3', intent: 'create_goal' },
  { text: 'Create goal double ARR this year', intent: 'create_goal' },
  { text: 'Set a new company goal around enterprise readiness', intent: 'create_goal' },
  { text: 'New goal — reach 10k active users by December', intent: 'create_goal' },

  // call_meeting (4)
  { text: 'All-hands with the design team about the rebrand', intent: 'call_meeting' },
  { text: 'Call a meeting with Sarah and James', intent: 'call_meeting' },
  { text: 'Pull the engineering leads into a sync', intent: 'call_meeting' },
  { text: 'Schedule an all-hands for Q4 planning', intent: 'call_meeting' },

  // end_meeting (4)
  { text: 'End the meeting', intent: 'end_meeting' },
  { text: 'Wrap this up', intent: 'end_meeting' },
  { text: "We're done here, close the meeting", intent: 'end_meeting' },
  { text: 'Adjourn', intent: 'end_meeting' },

  // check_status (4)
  { text: 'What is Sarah working on?', intent: 'check_status' },
  { text: 'Status of ticket #42', intent: 'check_status' },
  { text: "What's the current state of the Atlas project?", intent: 'check_status' },
  { text: 'How is the billing regression going?', intent: 'check_status' },

  // show_view (4)
  { text: 'Go to tickets', intent: 'show_view' },
  { text: 'Open the org chart', intent: 'show_view' },
  { text: 'Switch to the meetings view', intent: 'show_view' },
  { text: 'Show me the telemetry dashboard', intent: 'show_view' },

  // search_vault (4)
  { text: 'Find the API spec', intent: 'search_vault' },
  { text: 'Search the vault for onboarding docs', intent: 'search_vault' },
  { text: 'Look up the Q3 planning deck', intent: 'search_vault' },
  { text: 'Where is the SOC2 evidence document?', intent: 'search_vault' },

  // complex_request (4)
  { text: 'Why is the frontend team behind schedule?', intent: 'complex_request' },
  {
    text: 'Summarize what the team did this week and draft a status update',
    intent: 'complex_request',
  },
  { text: 'Compare our burn rate this quarter to last', intent: 'complex_request' },
  { text: 'Figure out who is blocked and unblock them if you can', intent: 'complex_request' },

  // reopen_ticket (4)
  { text: 'Reopen the login bug', intent: 'reopen_ticket' },
  { text: "Ticket #17 isn't actually fixed, reopen it", intent: 'reopen_ticket' },
  { text: 'Bring back the billing regression ticket', intent: 'reopen_ticket' },
  { text: 'That auth ticket needs to be reopened', intent: 'reopen_ticket' },
];
