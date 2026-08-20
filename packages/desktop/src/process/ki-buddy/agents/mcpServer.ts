import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AgentsCatalogClient } from './client';
import { AgentsMcpError, getAgentsMcpErrorPresentation } from './errors';

/** Stable model-facing MCP metadata; the renderer resolves localized product presentation separately. */
const AGENTS_LIST_PROTOCOL_DESCRIPTION =
  'List the complete compact catalog of published Agents available to the current signed-in account. Compare the full returned inventory before reporting that no matching agent exists.';
const AGENTS_DESCRIBE_PROTOCOL_DESCRIPTION =
  'Describe the exact input and output schema for one agentId from the current safe catalog. Use agents_list first and do not infer an agentId.';

const textResult = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

async function executeCatalogTool<T>(operation: () => Promise<T>) {
  try {
    return textResult(await operation());
  } catch (error) {
    const code = error instanceof AgentsMcpError ? error.code : 'server';
    return textResult({ ok: false, error: { code, message: getAgentsMcpErrorPresentation(code).message } }, true);
  }
}

/** Creates the read-only catalog discovery surface for the Agents Adapter. */
export function createAgentsMcpServer(client: AgentsCatalogClient): McpServer {
  const server = new McpServer({ name: 'ki-buddy-agents-mcp-adapter', version: '0.2.0' });
  server.registerTool(
    'agents_list',
    {
      description: AGENTS_LIST_PROTOCOL_DESCRIPTION,
      inputSchema: { forceRefresh: z.boolean().optional() },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ forceRefresh }) => executeCatalogTool(() => client.list({ forceRefresh }))
  );
  server.registerTool(
    'agents_describe',
    {
      description: AGENTS_DESCRIBE_PROTOCOL_DESCRIPTION,
      inputSchema: { agentId: z.string().trim().min(1).max(200) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ agentId }) => executeCatalogTool(() => client.describe(agentId))
  );
  return server;
}
