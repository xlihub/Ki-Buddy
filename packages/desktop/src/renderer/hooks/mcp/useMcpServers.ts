import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { ipcBridge } from '@/common';
import type { IMcpServer } from '@/common/config/storage';
import type { ProductResourceHiddenRecord } from '@/common/platform/ki-buddy';
import { reportHiddenProductResources } from '@/renderer/services/runtime/kiBuddyProductResourceDiagnostics';
import { getProductExperience } from '@/renderer/services/runtime/kiBuddyRuntime';
import {
  ensureBackendMcpCatalog,
  getMcpCatalogServerKey,
  projectMcpCatalogCandidates,
  type McpCatalogEntry,
} from './catalog';

/**
 * MCP server state hook.
 * Combines backend-managed user servers with extension-contributed servers.
 */
export const useMcpServers = () => {
  const [mcpCatalogEntries, setMcpCatalogEntries] = useState<readonly McpCatalogEntry[]>([]);
  const [extensionMcpCatalogEntries, setExtensionMcpCatalogEntries] = useState<readonly McpCatalogEntry[]>([]);
  const [backendHiddenResources, setBackendHiddenResources] = useState<readonly ProductResourceHiddenRecord[]>([]);
  const [extensionHiddenResources, setExtensionHiddenResources] = useState<readonly ProductResourceHiddenRecord[]>([]);
  const [isMcpServersLoading, setIsMcpServersLoading] = useState(true);

  useEffect(() => {
    void ensureBackendMcpCatalog()
      .then(({ entries = [], hiddenResources = [] }) => {
        setMcpCatalogEntries(entries);
        setBackendHiddenResources(hiddenResources);
      })
      .catch((error) => {
        console.error('[useMcpServers] Failed to load MCP catalog:', error);
        setMcpCatalogEntries([]);
        setBackendHiddenResources([]);
      })
      .finally(() => {
        setIsMcpServersLoading(false);
      });

    void ipcBridge.extensions.getMcpServers
      .invoke()
      .then((extServers) => {
        if (!extServers || extServers.length === 0) {
          setExtensionMcpCatalogEntries([]);
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
        reportHiddenProductResources('mcp', projection.hiddenResources);
        setExtensionMcpCatalogEntries(projection.entries);
        setExtensionHiddenResources(projection.hiddenResources);
      })
      .catch((error) => {
        console.error('[useMcpServers] Failed to load extension MCP servers:', error);
        setExtensionMcpCatalogEntries([]);
        setExtensionHiddenResources([]);
      });
  }, []);

  const setMcpServers = useCallback((serversOrUpdater: SetStateAction<IMcpServer[]>) => {
    setMcpCatalogEntries((previousEntries) => {
      const previousServers = previousEntries.map(({ server }) => server);
      const nextServers = typeof serversOrUpdater === 'function' ? serversOrUpdater(previousServers) : serversOrUpdater;
      const previousEntriesByKey = new Map(
        previousEntries.map((entry) => [getMcpCatalogServerKey(entry.server), entry])
      );
      const newServers = nextServers.filter((server) => !previousEntriesByKey.has(getMcpCatalogServerKey(server)));
      const newEntriesByKey =
        newServers.length === 0
          ? new Map<string, McpCatalogEntry>()
          : new Map(
              projectMcpCatalogCandidates(
                newServers.map((server) => ({ server, origin: 'custom' })),
                getProductExperience()
              ).entries.map((entry) => [getMcpCatalogServerKey(entry.server), entry])
            );

      return nextServers.flatMap((server) => {
        const key = getMcpCatalogServerKey(server);
        const existingEntry = previousEntriesByKey.get(key);
        if (existingEntry) return [{ ...existingEntry, server }];
        const newEntry = newEntriesByKey.get(key);
        return newEntry ? [newEntry] : [];
      });
    });
  }, []);

  const saveMcpServers = useCallback(
    (serversOrUpdater: SetStateAction<IMcpServer[]>) => {
      setMcpServers(serversOrUpdater);
      return Promise.resolve();
    },
    [setMcpServers]
  );

  const mcpServers = useMemo(() => mcpCatalogEntries.map(({ server }) => server), [mcpCatalogEntries]);
  const extensionMcpServers = useMemo(
    () => extensionMcpCatalogEntries.map(({ server }) => server),
    [extensionMcpCatalogEntries]
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
