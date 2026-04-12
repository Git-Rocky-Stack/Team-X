/**
 * Tool builder — converts MCP-style tool specs into AI SDK tool
 * definitions that `streamText` can consume.
 *
 * This module is the translation layer between the MCP protocol's
 * JSON Schema tool definitions and the Vercel AI SDK's `CoreTool`
 * type. It lives in provider-router (not the desktop app) because
 * building AI SDK tool objects is an LLM-API concern — the provider
 * router is the only layer that touches the `ai` package (invariant #5).
 *
 * The desktop app's orchestrator wiring creates `ToolSpec[]` from
 * MCP tools + McpHost execute callbacks, then passes them here.
 */

import { jsonSchema, tool } from 'ai';

/**
 * Specification for a single tool the agent can invoke. The desktop
 * app builds these from MCP `Tool` objects, binding `execute` to
 * a closure that routes through `McpHost.callTool()`.
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: never) => Promise<unknown>;
}

/**
 * Convert a list of tool specs into the `Record<string, CoreTool>`
 * shape that `streamText({ tools })` expects. Returns an empty
 * record when the input array is empty — the caller should omit
 * `tools` from the `streamText` call entirely in that case.
 */
export function buildProviderTools(specs: ToolSpec[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const spec of specs) {
    result[spec.name] = tool({
      description: spec.description,
      parameters: jsonSchema(spec.inputSchema),
      execute: spec.execute as (args: unknown) => Promise<unknown>,
    });
  }
  return result;
}
