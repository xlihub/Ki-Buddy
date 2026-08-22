import type { AgentsAuthService } from '../AgentsAuthService';
import { startAgentsMcpBridge, type AgentsInvokeRequest, type AgentsMcpBridgeHandle } from './bridge';
import { AGENTS_MCP_BRIDGE_TOKEN_ENV, AGENTS_MCP_BRIDGE_URL_ENV } from './client';
import { AgentsMcpError } from './errors';
import { AGENTS_MCP_CLIENT_ID_HEADER } from './contracts';

type AgentsMcpAuthService = Pick<AgentsAuthService, 'fetchAuthenticated' | 'getSessionEpoch'>;
type StartBridge = typeof startAgentsMcpBridge;

/** Starts the product bridge and publishes only its ephemeral loopback coordinates for Ki-Core inheritance. */
export async function startAgentsMcpRuntimeBridge(
  authService: AgentsMcpAuthService,
  env: NodeJS.ProcessEnv = process.env,
  startBridge: StartBridge = startAgentsMcpBridge
): Promise<AgentsMcpBridgeHandle> {
  const handle = await startBridge({
    fetchCatalog: async (clientId, signal) => {
      const sessionEpoch = authService.getSessionEpoch();
      try {
        const response = await authService.fetchAuthenticated('/bridge/agents/catalog', {
          method: 'GET',
          headers: { accept: 'application/json', [AGENTS_MCP_CLIENT_ID_HEADER]: clientId },
          signal,
        });
        if (authService.getSessionEpoch() !== sessionEpoch) {
          throw new AgentsMcpError('auth', 'Agents session changed during catalog refresh');
        }
        return { response, sessionEpoch };
      } catch (error) {
        if (error instanceof AgentsMcpError) throw error;
        throw new AgentsMcpError('network', 'Agents catalog request failed');
      }
    },
    invokeAgent: async (request: AgentsInvokeRequest, sessionEpoch, clientId, signal) => {
      if (authService.getSessionEpoch() !== sessionEpoch) {
        throw new AgentsMcpError('auth', 'Agents session changed before invoke dispatch');
      }
      try {
        return await authService.fetchAuthenticated('/bridge/agents/invoke', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            [AGENTS_MCP_CLIENT_ID_HEADER]: clientId,
          },
          body: JSON.stringify(request),
          signal,
        });
      } catch (error) {
        if (error instanceof AgentsMcpError) throw error;
        throw new AgentsMcpError('result_unknown', 'Agents invoke result is unknown', {
          agentId: request.agentId,
        });
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
