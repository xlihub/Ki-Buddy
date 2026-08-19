import { normalizeAgentsCatalog, type AgentsCatalogInventory } from './catalog';
import { AgentsMcpError, getAgentsMcpErrorPresentation, resolveAgentsBridgeErrorCode } from './errors';
import { readBoundedJsonResponse } from './json';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_CATALOG_RESPONSE_BYTES = 5 * 1024 * 1024;

export const AGENTS_MCP_BRIDGE_URL_ENV = 'KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL';
export const AGENTS_MCP_BRIDGE_TOKEN_ENV = 'KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN';

export type AgentsCatalogClient = Readonly<{
  list: () => Promise<AgentsCatalogInventory>;
}>;

type AgentsCatalogClientOptions = Readonly<{
  bridgeToken: string;
  bridgeUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

function resolveBridgeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AgentsMcpError('configuration', 'Agents Adapter bridge URL is invalid');
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new AgentsMcpError('configuration', 'Agents Adapter bridge URL must use loopback HTTP');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new AgentsMcpError('configuration', 'Agents Adapter bridge URL must not include a path or query');
  }
  return url.toString().replace(/\/$/u, '');
}

/** Creates the narrow client used by the external stdio process to reach its Electron-owned bridge. */
export function createAgentsCatalogClient(options: AgentsCatalogClientOptions): AgentsCatalogClient {
  const bridgeUrl = resolveBridgeUrl(options.bridgeUrl.trim());
  const bridgeToken = options.bridgeToken.trim();
  if (!bridgeToken) throw new AgentsMcpError('configuration', 'Agents Adapter bridge token is required');
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) {
    throw new AgentsMcpError('configuration', 'Agents Adapter timeout must be between 1000 and 120000 milliseconds');
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async list() {
      let response: Response;
      try {
        response = await fetchImpl(`${bridgeUrl}/catalog`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${bridgeToken}`,
          },
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (error instanceof AgentsMcpError) throw error;
        throw new AgentsMcpError('network', 'Agents Adapter bridge is unavailable');
      }
      if (response.status === 401 || response.status === 403) {
        throw new AgentsMcpError('auth', 'Agents login is required');
      }
      if (!response.ok) {
        const code = resolveAgentsBridgeErrorCode(await readBoundedJsonResponse(response, 1024)) ?? ('server' as const);
        throw new AgentsMcpError(code, getAgentsMcpErrorPresentation(code).message);
      }
      return normalizeAgentsCatalog(await readBoundedJsonResponse(response, MAX_CATALOG_RESPONSE_BYTES));
    },
  };
}
