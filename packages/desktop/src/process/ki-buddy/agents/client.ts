import {
  AGENTS_MCP_CLIENT_ID_HEADER,
  isAgentsMcpClientId,
  normalizeAgentsCatalog,
  normalizeAgentsCatalogSelection,
  type AgentsCatalogDescription,
  type AgentsCatalogInventory,
  type AgentsInvokeCorrelation,
  type AgentsInvokeResult,
  type AgentsScalarInputs,
} from './contracts';
import { AgentsMcpError, getAgentsMcpErrorPresentation, resolveAgentsBridgeErrorCode } from './errors';
import { readBoundedJsonResponse } from './json';

const DEFAULT_CATALOG_TIMEOUT_MS = 30_000;
const DEFAULT_INVOKE_TIMEOUT_MS = 310_000;
const MAX_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_CATALOG_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_INVOKE_RESPONSE_BYTES = 5 * 1024 * 1024 + 1024;

export const AGENTS_MCP_BRIDGE_URL_ENV = 'KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL';
export const AGENTS_MCP_BRIDGE_TOKEN_ENV = 'KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN';

export type AgentsClient = Readonly<{
  describe: (agentId: string) => Promise<AgentsCatalogDescription>;
  invoke: (agentId: string, inputs: AgentsScalarInputs) => Promise<AgentsInvokeResult>;
  list: () => Promise<AgentsCatalogInventory>;
}>;

type AgentsClientOptions = Readonly<{
  bridgeToken: string;
  bridgeUrl: string;
  clientId: string;
  fetchImpl?: typeof fetch;
  invokeTimeoutMs?: number;
  timeoutMs?: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeInvokeCorrelation(value: unknown, expectedAgentId: string): AgentsInvokeCorrelation {
  if (!isRecord(value) || value.agentId !== expectedAgentId) {
    throw new AgentsMcpError('contract', 'Agents invoke failure correlation is incompatible');
  }
  return { agentId: expectedAgentId };
}

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

function normalizeTimeout(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1000 || value > MAX_REQUEST_TIMEOUT_MS) {
    throw new AgentsMcpError(
      'configuration',
      `${label} must be between 1000 and ${MAX_REQUEST_TIMEOUT_MS} milliseconds`
    );
  }
  return value;
}

/** Creates the direct catalog and invoke client used by the external stdio process. */
export function createAgentsClient(options: AgentsClientOptions): AgentsClient {
  const bridgeUrl = resolveBridgeUrl(options.bridgeUrl.trim());
  const bridgeToken = options.bridgeToken.trim();
  if (!bridgeToken) throw new AgentsMcpError('configuration', 'Agents Adapter bridge token is required');
  const clientId = options.clientId.trim();
  if (!isAgentsMcpClientId(clientId)) {
    throw new AgentsMcpError('configuration', 'Agents Adapter client identity is invalid');
  }
  const timeoutMs = normalizeTimeout(options.timeoutMs ?? DEFAULT_CATALOG_TIMEOUT_MS, 'Agents Adapter timeout');
  const invokeTimeoutMs = normalizeTimeout(
    options.invokeTimeoutMs ?? DEFAULT_INVOKE_TIMEOUT_MS,
    'Agents invoke timeout'
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async (
    path: '/catalog' | '/invoke',
    maxResponseBytes: number,
    init: Readonly<{ body?: string; method?: 'GET' | 'POST' }> = {},
    expectedAgentId?: string,
    requestTimeoutMs = timeoutMs
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${bridgeUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${bridgeToken}`,
          [AGENTS_MCP_CLIENT_ID_HEADER]: clientId,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
        ...(init.body ? { body: init.body } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof AgentsMcpError) throw error;
      if (path === '/invoke') {
        throw new AgentsMcpError('result_unknown', 'Agent execution result is unknown', {
          agentId: expectedAgentId ?? 'unknown',
        });
      }
      throw new AgentsMcpError('network', 'Agents service is temporarily unavailable');
    }
    if (response.status === 401 || response.status === 403) {
      throw new AgentsMcpError('auth', 'Agents login is required');
    }
    if (!response.ok) {
      const body = await readBoundedJsonResponse(response, 1024);
      const code = resolveAgentsBridgeErrorCode(body) ?? ('server' as const);
      const correlation =
        expectedAgentId && code === 'result_unknown'
          ? normalizeInvokeCorrelation(isRecord(body) ? body.correlation : undefined, expectedAgentId)
          : expectedAgentId && isRecord(body) && body.correlation !== undefined
            ? normalizeInvokeCorrelation(body.correlation, expectedAgentId)
            : undefined;
      throw new AgentsMcpError(code, getAgentsMcpErrorPresentation(code).message, correlation);
    }
    return readBoundedJsonResponse(response, maxResponseBytes);
  };

  const fetchCatalog = () => request('/catalog', MAX_CATALOG_RESPONSE_BYTES);

  return {
    async describe(agentId) {
      return normalizeAgentsCatalogSelection(await fetchCatalog(), agentId).description;
    },
    async invoke(agentId, inputs) {
      const result = await request(
        '/invoke',
        MAX_INVOKE_RESPONSE_BYTES,
        { method: 'POST', body: JSON.stringify({ agentId, inputs }) },
        agentId,
        invokeTimeoutMs
      );
      return result as AgentsInvokeResult;
    },
    async list() {
      return normalizeAgentsCatalog(await fetchCatalog());
    },
  };
}
