import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AgentsClient } from './client';
import type { AgentsInvokeInputs } from './contracts';
import { getAgentsMcpErrorPresentation, AgentsMcpError } from './errors';

/** Stable model-facing MCP metadata; the renderer resolves localized product presentation separately. */
const AGENTS_LIST_PROTOCOL_DESCRIPTION =
  'List the complete compact catalog of published Agents available to the current signed-in account. Compare the full returned inventory before reporting that no matching agent exists.';
const AGENTS_DESCRIBE_PROTOCOL_DESCRIPTION =
  'Describe the exact input and output schema for one agentId from the current safe catalog. Use agents_list first and do not infer an agentId.';
const AGENTS_INVOKE_PROTOCOL_DESCRIPTION =
  'Direct invoke one current agentId with complete inputs. File fields must use fileUrl values returned by agents_upload_file. The Adapter refreshes the current catalog and exact schema before dispatch.';
const AGENTS_UPLOAD_PROTOCOL_DESCRIPTION =
  'Upload one local regular file by absolute path for one exact type=file input field and return the remote Agents fileUrl.';

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
  const server = new McpServer({ name: 'ki-buddy-agents-mcp-adapter', version: '0.4.0' });
  server.registerTool(
    'agents_list',
    {
      description: AGENTS_LIST_PROTOCOL_DESCRIPTION,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    () => executeAgentsTool(() => client.list())
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
    ({ agentId }) => executeAgentsTool(() => client.describe(agentId))
  );
  server.registerTool(
    'agents_upload_file',
    {
      description: AGENTS_UPLOAD_PROTOCOL_DESCRIPTION,
      inputSchema: {
        agentId: z.string().trim().min(1).max(200),
        fieldName: z.string().trim().min(1).max(200),
        filePath: z.string().min(1).max(32_768),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ agentId, fieldName, filePath }) => executeAgentsTool(() => client.upload(agentId, fieldName, filePath))
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
    ({ agentId, inputs }) => executeAgentsTool(() => client.invoke(agentId, inputs as AgentsInvokeInputs))
  );
  return server;
}
