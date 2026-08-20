import {
  isSameAgentsCatalogIdentity,
  normalizeAgentsCatalog,
  normalizeAgentsCatalogIdentity,
  normalizeAgentsCatalogSelection,
  normalizeAgentsBridgeInvokeResult,
  type AgentsAuthorizedDescription,
  type AgentsCatalogIdentity,
  type AgentsCatalogInventory,
  type AgentsInvokeCorrelation,
  type AgentsInvokeGrant,
  type AgentsInvokeResult,
  type AgentsScalarInputs,
} from './contracts';
import { AgentsMcpError, getAgentsMcpErrorPresentation, resolveAgentsBridgeErrorCode } from './errors';
import { readBoundedJsonResponse } from './json';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_SESSION_RESPONSE_BYTES = 16 * 1024;
const MAX_CATALOG_RESPONSE_BYTES = 5 * 1024 * 1024 + MAX_SESSION_RESPONSE_BYTES;
const MAX_INVOKE_RESPONSE_BYTES = 5 * 1024 * 1024 + 1024;
const DEFAULT_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

export const AGENTS_MCP_BRIDGE_URL_ENV = 'KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL';
export const AGENTS_MCP_BRIDGE_TOKEN_ENV = 'KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN';

export type AgentsClient = Readonly<{
  describe: (agentId: string) => Promise<AgentsAuthorizedDescription>;
  invoke: (grant: AgentsInvokeGrant, inputs: AgentsScalarInputs) => Promise<AgentsInvokeResult>;
  list: (options?: Readonly<{ forceRefresh?: boolean }>) => Promise<AgentsCatalogInventory>;
}>;

type AgentsClientOptions = Readonly<{
  bridgeToken: string;
  bridgeUrl: string;
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
  now?: () => number;
  timeoutMs?: number;
}>;

type AgentsCatalogEnvelope = Readonly<{
  catalog: unknown;
  identity: AgentsCatalogIdentity;
}>;

type AgentsCatalogProjection<T> = Readonly<{
  inventory: AgentsCatalogInventory;
  result: T;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCatalogEnvelope(value: unknown): AgentsCatalogEnvelope {
  if (!isRecord(value) || !('catalog' in value)) {
    throw new AgentsMcpError('contract', 'Agents catalog bridge response is incompatible');
  }
  return { identity: normalizeAgentsCatalogIdentity(value.identity), catalog: value.catalog };
}

function normalizeOptionalCorrelationField(field: unknown): string | undefined {
  if (field === undefined) return undefined;
  if (typeof field !== 'string') {
    throw new AgentsMcpError('contract', 'Agents invoke failure correlation is incompatible');
  }
  const normalized = field.trim();
  if (!normalized || normalized.length > 200) {
    throw new AgentsMcpError('contract', 'Agents invoke failure correlation is incompatible');
  }
  return normalized;
}

function normalizeInvokeCorrelation(value: unknown, expectedAgentId: string): AgentsInvokeCorrelation {
  if (!isRecord(value) || value.agentId !== expectedAgentId) {
    throw new AgentsMcpError('contract', 'Agents invoke failure correlation is incompatible');
  }
  const taskId = normalizeOptionalCorrelationField(value.taskId);
  const requestId = normalizeOptionalCorrelationField(value.requestId);
  return {
    agentId: expectedAgentId,
    ...(taskId ? { taskId } : {}),
    ...(requestId ? { requestId } : {}),
  };
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

/** Creates the narrow client used by the external stdio process to reach its Electron-owned bridge. */
export function createAgentsClient(options: AgentsClientOptions): AgentsClient {
  const bridgeUrl = resolveBridgeUrl(options.bridgeUrl.trim());
  const bridgeToken = options.bridgeToken.trim();
  if (!bridgeToken) throw new AgentsMcpError('configuration', 'Agents Adapter bridge token is required');
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) {
    throw new AgentsMcpError('configuration', 'Agents Adapter timeout must be between 1000 and 120000 milliseconds');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CATALOG_CACHE_TTL_MS;
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs <= 0 || cacheTtlMs > 60 * 60 * 1000) {
    throw new AgentsMcpError('configuration', 'Agents catalog cache TTL must be between 1 and 3600000 milliseconds');
  }
  const now = options.now ?? Date.now;
  let cache: Readonly<{
    expiresAt: number;
    identity: AgentsCatalogIdentity;
    inventory: AgentsCatalogInventory;
  }> | null = null;

  const request = async (
    path: '/catalog' | '/invoke' | '/session',
    maxResponseBytes: number,
    init: Readonly<{ body?: string; method?: 'GET' | 'POST' }> = {},
    expectedAgentId?: string
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${bridgeUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${bridgeToken}`,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
        ...(init.body ? { body: init.body } : {}),
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
      const body = await readBoundedJsonResponse(response, 1024);
      const code = resolveAgentsBridgeErrorCode(body) ?? ('server' as const);
      const correlation =
        expectedAgentId && isRecord(body) && body.correlation !== undefined
          ? normalizeInvokeCorrelation(body.correlation, expectedAgentId)
          : undefined;
      throw new AgentsMcpError(code, getAgentsMcpErrorPresentation(code).message, correlation);
    }
    return readBoundedJsonResponse(response, maxResponseBytes);
  };

  const withCacheInvalidation = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      cache = null;
      throw error;
    }
  };

  const refreshCatalog = async <T>(
    project: (catalog: unknown, identity: AgentsCatalogIdentity) => AgentsCatalogProjection<T>
  ): Promise<T> => {
    const envelope = normalizeCatalogEnvelope(await request('/catalog', MAX_CATALOG_RESPONSE_BYTES));
    const { inventory, result } = project(envelope.catalog, envelope.identity);
    cache = { identity: envelope.identity, inventory, expiresAt: now() + cacheTtlMs };
    return result;
  };

  return {
    async describe(agentId) {
      return withCacheInvalidation(() =>
        refreshCatalog((catalog, identity) => {
          const { description, inventory } = normalizeAgentsCatalogSelection(catalog, agentId);
          return {
            inventory,
            result: { description, grant: { agentId: description.agentId, identity } },
          };
        })
      );
    },
    async invoke(grant, inputs) {
      return withCacheInvalidation(async () => {
        const agentId = grant.agentId;
        const result = await request(
          '/invoke',
          MAX_INVOKE_RESPONSE_BYTES,
          {
            method: 'POST',
            body: JSON.stringify({ agentId, catalogIdentity: grant.identity, inputs }),
          },
          agentId
        );
        return normalizeAgentsBridgeInvokeResult(result, agentId);
      });
    },
    async list({ forceRefresh = false } = {}) {
      return withCacheInvalidation(async () => {
        if (!forceRefresh && cache && cache.expiresAt > now()) {
          const currentIdentity = normalizeAgentsCatalogIdentity(await request('/session', MAX_SESSION_RESPONSE_BYTES));
          if (isSameAgentsCatalogIdentity(cache.identity, currentIdentity)) return cache.inventory;
          cache = null;
        }
        return refreshCatalog((catalog) => {
          const inventory = normalizeAgentsCatalog(catalog);
          return { inventory, result: inventory };
        });
      });
    },
  };
}
