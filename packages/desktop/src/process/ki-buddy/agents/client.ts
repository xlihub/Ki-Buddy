import {
  isSameAgentsCatalogIdentity,
  normalizeAgentsCatalog,
  normalizeAgentsCatalogSelection,
  type AgentsCatalogDescription,
  type AgentsCatalogIdentity,
  type AgentsCatalogInventory,
} from './catalog';
import { AgentsMcpError, getAgentsMcpErrorPresentation, resolveAgentsBridgeErrorCode } from './errors';
import { readBoundedJsonResponse } from './json';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_SESSION_RESPONSE_BYTES = 16 * 1024;
const MAX_CATALOG_RESPONSE_BYTES = 5 * 1024 * 1024 + MAX_SESSION_RESPONSE_BYTES;
const DEFAULT_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

export const AGENTS_MCP_BRIDGE_URL_ENV = 'KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL';
export const AGENTS_MCP_BRIDGE_TOKEN_ENV = 'KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN';

export type AgentsCatalogClient = Readonly<{
  describe: (agentId: string) => Promise<AgentsCatalogDescription>;
  list: (options?: Readonly<{ forceRefresh?: boolean }>) => Promise<AgentsCatalogInventory>;
}>;

type AgentsCatalogClientOptions = Readonly<{
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

function normalizeIdentity(value: unknown): AgentsCatalogIdentity {
  if (
    !isRecord(value) ||
    typeof value.deploymentOrigin !== 'string' ||
    !Number.isSafeInteger(value.sessionEpoch) ||
    (value.sessionEpoch as number) < 0 ||
    typeof value.userId !== 'string'
  ) {
    throw new AgentsMcpError('contract', 'Agents catalog identity is incompatible');
  }
  let origin: string;
  try {
    const url = new URL(value.deploymentOrigin);
    origin = url.origin;
    if (!['http:', 'https:'].includes(url.protocol) || value.deploymentOrigin !== origin)
      throw new Error('invalid origin');
  } catch {
    throw new AgentsMcpError('contract', 'Agents catalog deployment origin is incompatible');
  }
  const userId = value.userId.trim();
  if (!userId || userId.length > 200) {
    throw new AgentsMcpError('contract', 'Agents catalog user identity is incompatible');
  }
  return { deploymentOrigin: origin, sessionEpoch: value.sessionEpoch as number, userId };
}

function normalizeCatalogEnvelope(value: unknown): AgentsCatalogEnvelope {
  if (!isRecord(value) || !('catalog' in value)) {
    throw new AgentsMcpError('contract', 'Agents catalog bridge response is incompatible');
  }
  return { identity: normalizeIdentity(value.identity), catalog: value.catalog };
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
export function createAgentsCatalogClient(options: AgentsCatalogClientOptions): AgentsCatalogClient {
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

  const request = async (path: '/catalog' | '/session', maxResponseBytes: number): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${bridgeUrl}${path}`, {
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

  const refreshCatalog = async <T>(project: (catalog: unknown) => AgentsCatalogProjection<T>): Promise<T> => {
    const envelope = normalizeCatalogEnvelope(await request('/catalog', MAX_CATALOG_RESPONSE_BYTES));
    const { inventory, result } = project(envelope.catalog);
    cache = { identity: envelope.identity, inventory, expiresAt: now() + cacheTtlMs };
    return result;
  };

  return {
    async describe(agentId) {
      return withCacheInvalidation(() =>
        refreshCatalog((catalog) => {
          const { description, inventory } = normalizeAgentsCatalogSelection(catalog, agentId);
          return { inventory, result: description };
        })
      );
    },
    async list({ forceRefresh = false } = {}) {
      return withCacheInvalidation(async () => {
        if (!forceRefresh && cache && cache.expiresAt > now()) {
          const currentIdentity = normalizeIdentity(await request('/session', MAX_SESSION_RESPONSE_BYTES));
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
