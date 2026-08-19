import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentsCatalogClient } from './client';
import { AgentsMcpError, getAgentsMcpErrorPresentation } from './errors';

/** Stable model-facing MCP metadata; the renderer resolves localized product presentation separately. */
const AGENTS_LIST_PROTOCOL_DESCRIPTION =
  'List the complete compact catalog of published Agents available to the current signed-in account. Compare the full returned inventory before reporting that no matching agent exists.';

const textResult = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

/** Creates the first-release, catalog-only MCP surface for the Agents Adapter. */
export function createAgentsMcpServer(client: AgentsCatalogClient): McpServer {
  const server = new McpServer({ name: 'ki-buddy-agents-mcp-adapter', version: '0.1.0' });
  server.registerTool(
    'agents_list',
    {
      description: AGENTS_LIST_PROTOCOL_DESCRIPTION,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        return textResult(await client.list());
      } catch (error) {
        const code = error instanceof AgentsMcpError ? error.code : 'server';
        return textResult({ ok: false, error: { code, message: getAgentsMcpErrorPresentation(code).message } }, true);
      }
    }
  );
  return server;
}
