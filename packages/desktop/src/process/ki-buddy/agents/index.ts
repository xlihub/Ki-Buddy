import type { AgentsAuthService } from '../AgentsAuthService';
import { startAgentsMcpBridge, type AgentsMcpBridgeHandle } from './bridge';
import { AGENTS_MCP_BRIDGE_TOKEN_ENV, AGENTS_MCP_BRIDGE_URL_ENV } from './client';
import { AgentsMcpError } from './errors';

type AgentsMcpAuthService = Pick<AgentsAuthService, 'fetchAuthenticated' | 'getSession'>;
type StartBridge = typeof startAgentsMcpBridge;

/** Starts the product bridge and publishes only its ephemeral loopback coordinates for Ki-Core inheritance. */
export async function startAgentsMcpRuntimeBridge(
  authService: AgentsMcpAuthService,
  env: NodeJS.ProcessEnv = process.env,
  startBridge: StartBridge = startAgentsMcpBridge
): Promise<AgentsMcpBridgeHandle> {
  const handle = await startBridge({
    fetchCatalog: async (signal) => {
      let session: Awaited<ReturnType<AgentsAuthService['getSession']>>;
      try {
        session = await authService.getSession();
      } catch {
        throw new AgentsMcpError('auth', 'Agents login is required');
      }
      if (session.status !== 'authenticated') {
        throw new AgentsMcpError('auth', 'Agents login is required');
      }
      try {
        return await authService.fetchAuthenticated('/bridge/agents/catalog', {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal,
        });
      } catch (error) {
        if (error instanceof AgentsMcpError) throw error;
        throw new AgentsMcpError('network', 'Agents catalog request failed');
      }
    },
  });

  env[AGENTS_MCP_BRIDGE_URL_ENV] = handle.url;
  env[AGENTS_MCP_BRIDGE_TOKEN_ENV] = handle.token;

  return {
    ...handle,
    close: async () => {
      if (env[AGENTS_MCP_BRIDGE_URL_ENV] === handle.url) delete env[AGENTS_MCP_BRIDGE_URL_ENV];
      if (env[AGENTS_MCP_BRIDGE_TOKEN_ENV] === handle.token) delete env[AGENTS_MCP_BRIDGE_TOKEN_ENV];
      await handle.close();
    },
  };
}
