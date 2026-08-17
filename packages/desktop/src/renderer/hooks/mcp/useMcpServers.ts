import { useCallback, useEffect, useMemo, useState } from 'react';
import { ipcBridge } from '@/common';
import type { IMcpServer } from '@/common/config/storage';
import type { ProductResourceHiddenRecord, ProductResourceOrigin } from '@/common/platform/ki-buddy';
import { getProductExperience } from '@/renderer/services/runtime/kiBuddyRuntime';
import {
  ensureBackendMcpCatalog,
  getMcpCatalogServerKey,
  projectMcpCatalogCandidates,
  reportHiddenMcpResources,
  type McpCatalogEntry,
} from './catalog';

/**
 * MCP server state hook.
 * Combines backend-managed user servers with extension-contributed servers.
 */
export const useMcpServers = () => {
  const [mcpServers, setMcpServers] = useState<IMcpServer[]>([]);
  const [extensionMcpServers, setExtensionMcpServers] = useState<IMcpServer[]>([]);
  const [mcpOrigins, setMcpOrigins] = useState<Record<string, ProductResourceOrigin>>({});
  const [backendHiddenResources, setBackendHiddenResources] = useState<readonly ProductResourceHiddenRecord[]>([]);
  const [extensionHiddenResources, setExtensionHiddenResources] = useState<readonly ProductResourceHiddenRecord[]>([]);
  const [isMcpServersLoading, setIsMcpServersLoading] = useState(true);

  useEffect(() => {
    void ensureBackendMcpCatalog()
      .then(({ allServers, entries = [], hiddenResources = [] }) => {
        setMcpServers(allServers);
        setMcpOrigins(
          Object.fromEntries(entries.map(({ server, origin }) => [getMcpCatalogServerKey(server), origin]))
        );
        setBackendHiddenResources(hiddenResources);
      })
      .catch((error) => {
        console.error('[useMcpServers] Failed to load MCP catalog:', error);
        setMcpServers([]);
        setMcpOrigins({});
        setBackendHiddenResources([]);
      })
      .finally(() => {
        setIsMcpServersLoading(false);
      });

    void ipcBridge.extensions.getMcpServers
      .invoke()
      .then((extServers) => {
        if (!extServers || extServers.length === 0) {
          setExtensionMcpServers([]);
          return;
        }

        const converted: IMcpServer[] = extServers.map((server) => ({
          id: String(server.id || ''),
          name: String(server.name || ''),
          description: server.description as string | undefined,
          enabled: server.enabled !== false,
          transport: server.transport as IMcpServer['transport'],
          created_at: (server.created_at as number) || Date.now(),
          updated_at: (server.updated_at as number) || Date.now(),
          original_json: String(server.original_json || '{}'),
          builtin: false,
        }));
        const projection = projectMcpCatalogCandidates(
          converted.map((server) => ({ server, origin: 'extension' as const })),
          getProductExperience()
        );
        reportHiddenMcpResources(projection.hiddenResources);
        setExtensionMcpServers(projection.entries.map(({ server }) => server));
        setExtensionHiddenResources(projection.hiddenResources);
      })
      .catch((error) => {
        console.error('[useMcpServers] Failed to load extension MCP servers:', error);
        setExtensionMcpServers([]);
        setExtensionHiddenResources([]);
      });
  }, []);

  const saveMcpServers = useCallback((serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => {
    setMcpServers((prevServers) =>
      typeof serversOrUpdater === 'function' ? serversOrUpdater(prevServers) : serversOrUpdater
    );
    return Promise.resolve();
  }, []);

  const mcpCatalogEntries = useMemo<readonly McpCatalogEntry[]>(
    () =>
      projectMcpCatalogCandidates(
        mcpServers.map((server) => ({ server, origin: mcpOrigins[getMcpCatalogServerKey(server)] ?? 'custom' })),
        getProductExperience()
      ).entries,
    [mcpOrigins, mcpServers]
  );
  const extensionMcpCatalogEntries = useMemo<readonly McpCatalogEntry[]>(
    () =>
      projectMcpCatalogCandidates(
        extensionMcpServers.map((server) => ({ server, origin: 'extension' })),
        getProductExperience()
      ).entries,
    [extensionMcpServers]
  );
  const hiddenResources = useMemo(
    () => [...backendHiddenResources, ...extensionHiddenResources],
    [backendHiddenResources, extensionHiddenResources]
  );

  return {
    mcpServers,
    mcpCatalogEntries,
    isMcpServersLoading,
    allMcpServers: [...mcpServers, ...extensionMcpServers],
    extensionMcpServers,
    extensionMcpCatalogEntries,
    hiddenResources,
    setMcpServers,
    saveMcpServers,
  };
};
