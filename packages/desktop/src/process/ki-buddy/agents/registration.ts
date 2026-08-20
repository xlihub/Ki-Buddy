import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer } from '@/common/config/storage';
import { getBuiltinMcpScriptPath } from '@process/utils/initStorage';

export const AGENTS_MCP_SERVER_NAME = 'agents-mcp-adapter';
export const AGENTS_MCP_SCRIPT_NAME = 'builtin-mcp-agents';
const AGENTS_MCP_SERVER_DESCRIPTION = 'List the Agents catalog available to the current Ki-Buddy account.';

type McpImportServer = Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>;

type AgentsMcpRegistrationDependencies = Readonly<{
  batchImportServers: (input: { servers: McpImportServer[] }) => Promise<unknown>;
  getScriptPath: () => string;
  listServers: () => Promise<IMcpServer[]>;
  updateServer: (input: {
    data: Partial<Pick<IMcpServer, 'builtin' | 'description' | 'enabled' | 'original_json' | 'transport'>>;
    id: string;
  }) => Promise<unknown>;
}>;

function buildAgentsMcpServer(scriptPath: string): McpImportServer {
  const command = 'node';
  const args = [scriptPath];
  return {
    name: AGENTS_MCP_SERVER_NAME,
    description: AGENTS_MCP_SERVER_DESCRIPTION,
    enabled: true,
    builtin: true,
    transport: { type: 'stdio', command, args },
    original_json: JSON.stringify({ mcpServers: { [AGENTS_MCP_SERVER_NAME]: { command, args } } }, null, 2),
  };
}

function sameRegistration(existing: IMcpServer, desired: McpImportServer): boolean {
  return (
    existing.enabled === true &&
    existing.builtin === true &&
    existing.description === desired.description &&
    existing.original_json === desired.original_json &&
    JSON.stringify(existing.transport) === JSON.stringify(desired.transport)
  );
}

const defaultDependencies = (): AgentsMcpRegistrationDependencies => ({
  listServers: () => mcpService.listServers.invoke(),
  batchImportServers: (input) => mcpService.batchImportServers.invoke(input),
  updateServer: (input) => mcpService.updateServer.invoke(input),
  getScriptPath: () => getBuiltinMcpScriptPath(AGENTS_MCP_SCRIPT_NAME),
});

/** Idempotently registers the product-owned Adapter through the existing generic MCP API. */
export async function ensureAgentsMcpRegistration(
  dependencies: AgentsMcpRegistrationDependencies = defaultDependencies()
): Promise<void> {
  const desired = buildAgentsMcpServer(dependencies.getScriptPath());
  const existing = (await dependencies.listServers()).find(({ name }) => name === AGENTS_MCP_SERVER_NAME);
  if (!existing) {
    await dependencies.batchImportServers({ servers: [desired] });
    return;
  }
  if (existing.builtin !== true) {
    throw new Error(`Agents MCP Adapter registration conflicts with an existing Custom MCP: ${existing.name}`);
  }
  if (sameRegistration(existing, desired)) return;
  await dependencies.updateServer({
    id: existing.id,
    data: {
      enabled: true,
      builtin: true,
      description: AGENTS_MCP_SERVER_DESCRIPTION,
      transport: desired.transport,
      original_json: desired.original_json,
    },
  });
}
