import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AgentsClient } from './client';
import type { AgentsInvokeGrant } from './contracts';
import { AgentsMcpError, getAgentsMcpErrorPresentation } from './errors';

/** Stable model-facing MCP metadata; the renderer resolves localized product presentation separately. */
const AGENTS_LIST_PROTOCOL_DESCRIPTION =
  'List the complete compact catalog of published Agents available to the current signed-in account. Compare the full returned inventory before reporting that no matching agent exists.';
const AGENTS_DESCRIBE_PROTOCOL_DESCRIPTION =
  'Describe the exact input and output schema for one agentId from the current safe catalog. Use agents_list first and do not infer an agentId.';
const AGENTS_INVOKE_PROTOCOL_DESCRIPTION =
  'Direct invoke the one agentId established by the latest successful agents_describe call. Provide only complete scalar inputs from that exact schema. The Adapter refreshes authorization and schema before one dispatch.';

const textResult = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

async function executeAgentsTool<T>(operation: () => Promise<T>) {
  try {
    return textResult(await operation());
  } catch (error) {
    const code = error instanceof AgentsMcpError ? error.code : 'server';
    return textResult(
      {
        ok: false,
        ...(error instanceof AgentsMcpError ? error.correlation : undefined),
        error: { code, message: getAgentsMcpErrorPresentation(code).message },
      },
      true
    );
  }
}

/** Creates the catalog discovery and one-agent direct invoke surface for the Agents Adapter. */
export function createAgentsMcpServer(client: AgentsClient): McpServer {
  const server = new McpServer({ name: 'ki-buddy-agents-mcp-adapter', version: '0.3.0' });
  let selectedGrant: AgentsInvokeGrant | null = null;
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
    ({ forceRefresh }) => executeAgentsTool(() => client.list({ forceRefresh }))
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
    ({ agentId }) =>
      executeAgentsTool(async () => {
        selectedGrant = null;
        const { description, grant } = await client.describe(agentId);
        selectedGrant = grant;
        return description;
      })
  );
  server.registerTool(
    'agents_invoke',
    {
      description: AGENTS_INVOKE_PROTOCOL_DESCRIPTION,
      inputSchema: {
        agentId: z.string().trim().min(1).max(200),
        inputs: z
          .record(z.string().trim().min(1).max(200), z.union([z.string(), z.number().finite(), z.boolean()]))
          .default({}),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ agentId, inputs }) =>
      executeAgentsTool(async () => {
        const grant = selectedGrant;
        selectedGrant = null;
        if (grant?.agentId !== agentId) {
          throw new AgentsMcpError('invalid_input', 'Agents invoke agentId does not match the described candidate');
        }
        return client.invoke(grant, inputs);
      })
  );
  return server;
}
