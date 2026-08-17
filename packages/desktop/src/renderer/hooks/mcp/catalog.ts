import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer, IMcpServerTransport, ISessionMcpServer } from '@/common/config/storage';
import {
  PRODUCT_RESOURCE_ORIGINS,
  projectProductResources,
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

export const getMcpCatalogServerKey = (server: Pick<IMcpServer, 'id' | 'name' | 'builtin'>) => {
  const normalizedName = normalizeServerName(server.name);
  if (server.builtin === true) {
    return `builtin:${normalizedName || server.id}`;
  }
  return `user:${normalizedName || server.id}`;
};

const dedupeServers = (servers: IMcpServer[]) => {
  const seen = new Set<string>();
  const deduped: IMcpServer[] = [];

  for (const server of servers) {
    const key = getMcpCatalogServerKey(server);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(server);
  }

  return deduped;
};

const dedupeCandidates = (candidates: readonly McpCatalogCandidate[]): McpCatalogCandidate[] => {
  const seen = new Set<string>();
  const deduped: McpCatalogCandidate[] = [];

  for (const candidate of candidates) {
    const key = getMcpCatalogServerKey(candidate.server);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
};

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

export const toBackendMcpPayload = (
  server: Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>
): BackendMcpPayload => ({
  name: server.name,
  description: server.description,
  transport: normalizeTransportForBackend(server.transport),
  original_json: server.original_json || '{}',
  builtin: Boolean(server.builtin),
});

export const toSessionMcpServer = (server: Pick<IMcpServer, 'id' | 'name' | 'transport'>): ISessionMcpServer => ({
  id: server.id,
  name: server.name,
  transport: server.transport,
});

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

export const reportHiddenMcpResources = (hiddenResources: readonly ProductResourceHiddenRecord[]): void => {
  if (hiddenResources.length === 0) return;
  console.info('[ProductExperience] MCP resources hidden by product policy', {
    code: 'product_resource_projection',
    resources: hiddenResources,
  });
};

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
