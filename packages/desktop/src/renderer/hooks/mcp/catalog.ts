import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer, IMcpServerTransport, ISessionMcpServer } from '@/common/config/storage';
import {
  PRODUCT_RESOURCE_ORIGINS,
  evaluateProductBuiltinResourceState,
  projectProductResources,
  type ProductBuiltinResourceRequirement,
  type ProductBuiltinResourceState,
  type ProductExperience,
  type ProductResourceAccess,
  type ProductResourceHiddenRecord,
  type ProductResourceOrigin,
} from '@/common/platform/ki-buddy';
import { getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import { getProductExperience } from '@/renderer/services/runtime/kiBuddyRuntime';

type BackendMcpTransport = Exclude<IMcpServerTransport, { type: 'streamable_http' }>;

type BackendMcpPayload = {
  name: string;
  description?: string;
  transport: BackendMcpTransport;
  original_json: string;
  builtin?: boolean;
};

type ProductAwareMcpServer = IMcpServer & { product_origin?: unknown };

export type McpCatalogEntry = Readonly<{
  access: Exclude<ProductResourceAccess, 'hidden'>;
  origin: ProductResourceOrigin;
  server: IMcpServer;
}>;

type McpCatalogCandidate = Readonly<{
  origin: ProductResourceOrigin;
  server: IMcpServer;
}>;

const isBuiltinServer = (server: IMcpServer) => server.builtin === true;

const isProductResourceOrigin = (value: unknown): value is ProductResourceOrigin =>
  typeof value === 'string' && PRODUCT_RESOURCE_ORIGINS.includes(value as ProductResourceOrigin);

const resolveBackendMcpOrigin = (server: ProductAwareMcpServer): ProductResourceOrigin => {
  if (server.product_origin !== undefined) {
    return isProductResourceOrigin(server.product_origin) ? server.product_origin : 'unclassified';
  }
  return server.builtin === true ? 'upstreamBuiltin' : 'custom';
};

const normalizeServerName = (name: string) => name.trim().toLowerCase();

/** Product-owned MCP requirements registered by features such as the future Agents Adapter integration. */
export const PRODUCT_BUILTIN_MCP_REQUIREMENTS: readonly ProductBuiltinResourceRequirement[] = [];

/** Returns the stable key used to reconcile MCP catalog entries across backend and local sources. */
export const getMcpCatalogServerKey = (server: Pick<IMcpServer, 'id' | 'name' | 'builtin'>) => {
  const normalizedName = normalizeServerName(server.name);
  if (server.builtin === true) {
    return `builtin:${normalizedName || server.id}`;
  }
  return `user:${normalizedName || server.id}`;
};

const dedupeBy = <Item>(items: readonly Item[], getKey: (item: Item) => string): Item[] => {
  const seen = new Set<string>();
  const deduped: Item[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
};

const dedupeServers = (servers: readonly IMcpServer[]) => dedupeBy<IMcpServer>(servers, getMcpCatalogServerKey);

const dedupeCandidates = (candidates: readonly McpCatalogCandidate[]) =>
  dedupeBy(candidates, ({ server }) => getMcpCatalogServerKey(server));

const normalizeTransportForBackend = (transport: IMcpServerTransport): BackendMcpTransport => {
  if (transport.type === 'streamable_http') {
    return {
      type: 'http',
      url: transport.url,
      headers: transport.headers,
    };
  }
  return transport;
};

/** Converts a renderer MCP record into the transport shape accepted by the backend service. */
export const toBackendMcpPayload = (
  server: Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>
): BackendMcpPayload => ({
  name: server.name,
  description: server.description,
  transport: normalizeTransportForBackend(server.transport),
  original_json: server.original_json || '{}',
  builtin: Boolean(server.builtin),
});

/** Selects the MCP fields forwarded to conversation session configuration. */
export const toSessionMcpServer = (server: Pick<IMcpServer, 'id' | 'name' | 'transport'>): ISessionMcpServer => ({
  id: server.id,
  name: server.name,
  transport: server.transport,
});

/** Applies the active product resource policy to trusted MCP catalog candidates. */
export const projectMcpCatalogCandidates = (
  candidates: readonly McpCatalogCandidate[],
  experience: ProductExperience
): Readonly<{ entries: readonly McpCatalogEntry[]; hiddenResources: readonly ProductResourceHiddenRecord[] }> => {
  const projection = projectProductResources(
    experience,
    'mcp',
    candidates.map(({ server, origin }) => ({ id: server.id, name: server.name, origin, server }))
  );
  return {
    entries: projection.visible.map(({ resource, access }) => ({
      server: resource.server,
      origin: resource.origin,
      access,
    })),
    hiddenResources: projection.hidden,
  };
};

/** Emits non-sensitive diagnostics for MCP resources hidden by the product policy. */
export const reportHiddenMcpResources = (hiddenResources: readonly ProductResourceHiddenRecord[]): void => {
  if (hiddenResources.length === 0) return;
  console.info('[ProductExperience] MCP resources hidden by product policy', {
    code: 'product_resource_projection',
    resources: hiddenResources,
  });
};

/** Evaluates registered product MCP requirements once the backend catalog can authoritatively answer. */
export async function loadProductBuiltinMcpResourceState(
  experience: ProductExperience = getProductExperience(),
  requirements: readonly ProductBuiltinResourceRequirement[] = PRODUCT_BUILTIN_MCP_REQUIREMENTS
): Promise<ProductBuiltinResourceState> {
  const pendingState = evaluateProductBuiltinResourceState(experience, 'mcp', {
    availableResourceIds: [],
    catalogReady: false,
    requirements,
  });
  if (pendingState.status !== 'pending') return pendingState;

  try {
    const backendServers = await mcpService.listServers.invoke();
    const availableResourceIds = backendServers
      .filter((server) => resolveBackendMcpOrigin(server) === 'productBuiltin')
      .map(({ id }) => id);
    return evaluateProductBuiltinResourceState(experience, 'mcp', {
      availableResourceIds,
      catalogReady: true,
      requirements,
    });
  } catch (error) {
    console.error('[ProductExperience] Failed to load the MCP catalog for product integrity validation', error);
    return pendingState;
  }
}

/** Loads, deduplicates, and projects backend and local built-in MCP records into one catalog. */
export const ensureBackendMcpCatalog = async (
  experience: ProductExperience = getProductExperience()
): Promise<{
  userServers: IMcpServer[];
  builtinServers: IMcpServer[];
  allServers: IMcpServer[];
  entries: readonly McpCatalogEntry[];
  hiddenResources: readonly ProductResourceHiddenRecord[];
}> => {
  const localServers = ((await getClientBusinessSetting('mcp.config').catch((): IMcpServer[] => [])) ||
    []) as IMcpServer[];
  const allBuiltinServers = dedupeServers(localServers.filter(isBuiltinServer));
  const allBackendServers = dedupeServers(await mcpService.listServers.invoke());
  const projection = projectMcpCatalogCandidates(
    dedupeCandidates([
      ...allBackendServers.map((server) => ({ server, origin: resolveBackendMcpOrigin(server) })),
      ...allBuiltinServers.map((server) => ({ server, origin: 'upstreamBuiltin' as const })),
    ]),
    experience
  );
  reportHiddenMcpResources(projection.hiddenResources);

  const visibleServers = new Set(projection.entries.map(({ server }) => server));
  const userServers = allBackendServers.filter((server) => visibleServers.has(server));
  const builtinServers = allBuiltinServers.filter((server) => visibleServers.has(server));
  const allServers = projection.entries.map(({ server }) => server);

  return {
    userServers,
    builtinServers,
    allServers,
    entries: projection.entries,
    hiddenResources: projection.hiddenResources,
  };
};
