/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const {
  ensureBackendMcpCatalogMock,
  getExtensionMcpServersMock,
  getProductExperienceMock,
  projectMcpCatalogCandidatesMock,
} = vi.hoisted(() => ({
  ensureBackendMcpCatalogMock: vi.fn(),
  getExtensionMcpServersMock: vi.fn(),
  getProductExperienceMock: vi.fn(),
  projectMcpCatalogCandidatesMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    extensions: {
      getMcpServers: { invoke: getExtensionMcpServersMock },
    },
  },
}));

vi.mock('@/renderer/hooks/mcp/catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/renderer/hooks/mcp/catalog')>();
  return {
    ...original,
    ensureBackendMcpCatalog: ensureBackendMcpCatalogMock,
    projectMcpCatalogCandidates: (...args: Parameters<typeof original.projectMcpCatalogCandidates>) => {
      projectMcpCatalogCandidatesMock(...args);
      return original.projectMcpCatalogCandidates(...args);
    },
  };
});

vi.mock('@/renderer/services/runtime/kiBuddyRuntime', () => ({
  getProductExperience: getProductExperienceMock,
}));

import { useMcpServers } from '@/renderer/hooks/mcp/useMcpServers';

describe('useMcpServers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getExtensionMcpServersMock.mockResolvedValue([]);
    getProductExperienceMock.mockReturnValue({
      behaviorDefaults: () => ({ scheduledTaskExecutor: 'assistant', autoInjectedSkillExclusions: [] }),
      featureState: () => 'enabled',
      resourceAccess: (_kind: string, origin: string) =>
        origin === 'custom' ? 'manage' : origin === 'productBuiltin' ? 'use' : 'hidden',
    });
    ensureBackendMcpCatalogMock.mockResolvedValue({
      userServers: [],
      builtinServers: [],
      allServers: [],
      entries: [],
      hiddenResources: [],
    });
  });

  it('loads MCP catalog on mount', async () => {
    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.isMcpServersLoading).toBe(false));

    expect(ensureBackendMcpCatalogMock).toHaveBeenCalledTimes(1);
    expect(result.current.mcpServers).toEqual([]);
  });

  it('keeps backend catalog entries authoritative without reapplying product policy', async () => {
    const server = {
      id: 'product-1',
      name: 'product server',
      enabled: true,
      transport: { type: 'stdio' as const, command: 'product', args: [] },
      created_at: 1,
      updated_at: 1,
      original_json: '{}',
    };
    ensureBackendMcpCatalogMock.mockResolvedValue({
      userServers: [server],
      builtinServers: [],
      allServers: [server],
      entries: [{ server, origin: 'productBuiltin', access: 'use' }],
      hiddenResources: [],
    });

    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.mcpCatalogEntries).toHaveLength(1));
    expect(projectMcpCatalogCandidatesMock).not.toHaveBeenCalled();
  });

  it('does not fall back to configService business data when MCP catalog loading fails', async () => {
    ensureBackendMcpCatalogMock.mockRejectedValue(new Error('catalog failed'));

    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.isMcpServersLoading).toBe(false));

    expect(result.current.mcpServers).toEqual([]);
  });

  it('updates local MCP state without persisting business data outside the backend catalog', async () => {
    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.isMcpServersLoading).toBe(false));

    act(() => {
      void result.current.saveMcpServers([
        {
          id: 'mcp-1',
          name: 'server-1',
          enabled: true,
          transport: { type: 'stdio', command: 'foo', args: [] },
          created_at: 1,
          updated_at: 1,
          original_json: '{}',
          builtin: false,
        },
      ]);
    });

    await waitFor(() => expect(result.current.mcpServers).toHaveLength(1));
  });

  it('hides extension MCP servers and retains a structured diagnostic record in Ki-Buddy', async () => {
    getExtensionMcpServersMock.mockResolvedValue([
      {
        id: 'extension-1',
        name: 'extension server',
        enabled: true,
        transport: { type: 'stdio', command: 'extension', args: [] },
        created_at: 1,
        updated_at: 1,
        original_json: '{}',
      },
    ]);

    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(getExtensionMcpServersMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.hiddenResources).toHaveLength(1));

    expect(result.current.extensionMcpServers).toEqual([]);
    expect(result.current.hiddenResources).toEqual([
      expect.objectContaining({
        code: 'product_resource_hidden',
        kind: 'mcp',
        resourceId: 'extension-1',
        origin: 'extension',
      }),
    ]);
  });

  it('keeps extension MCP servers visible under the complete AionUi resource policy', async () => {
    getProductExperienceMock.mockReturnValue({
      behaviorDefaults: () => ({ scheduledTaskExecutor: 'assistant-or-team', autoInjectedSkillExclusions: [] }),
      featureState: () => 'enabled',
      resourceAccess: () => 'manage',
    });
    getExtensionMcpServersMock.mockResolvedValue([
      {
        id: 'extension-1',
        name: 'extension server',
        enabled: true,
        transport: { type: 'stdio', command: 'extension', args: [] },
        created_at: 1,
        updated_at: 1,
        original_json: '{}',
      },
    ]);

    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.extensionMcpServers).toHaveLength(1));

    expect(result.current.extensionMcpCatalogEntries).toEqual([
      expect.objectContaining({ origin: 'extension', access: 'manage' }),
    ]);
    expect(projectMcpCatalogCandidatesMock).toHaveBeenCalledTimes(1);
    expect(result.current.hiddenResources).toEqual([]);
  });

  it('preserves access for an existing backend entry when its server state changes', async () => {
    const server = {
      id: 'product-1',
      name: 'product server',
      enabled: true,
      transport: { type: 'stdio' as const, command: 'product', args: [] },
      created_at: 1,
      updated_at: 1,
      original_json: '{}',
    };
    ensureBackendMcpCatalogMock.mockResolvedValue({
      userServers: [server],
      builtinServers: [],
      allServers: [server],
      entries: [{ server, origin: 'productBuiltin', access: 'use' }],
      hiddenResources: [],
    });
    const { result } = renderHook(() => useMcpServers());
    await waitFor(() => expect(result.current.mcpCatalogEntries).toHaveLength(1));
    projectMcpCatalogCandidatesMock.mockClear();

    act(() => {
      void result.current.saveMcpServers((servers) =>
        servers.map((current) => (current.id === server.id ? { ...current, last_test_status: 'connected' } : current))
      );
    });

    await waitFor(() => expect(result.current.mcpServers[0].last_test_status).toBe('connected'));
    expect(result.current.mcpCatalogEntries[0].access).toBe('use');
    expect(projectMcpCatalogCandidatesMock).not.toHaveBeenCalled();
  });

  it('keeps access decisions separate when backend entries reuse an ID with different names', async () => {
    const customServer = {
      id: 'shared-id',
      name: 'custom server',
      enabled: true,
      transport: { type: 'stdio', command: 'custom', args: [] },
      created_at: 1,
      updated_at: 1,
      original_json: '{}',
    };
    const productServer = {
      ...customServer,
      name: 'product server',
      transport: { type: 'stdio' as const, command: 'product', args: [] },
    };
    ensureBackendMcpCatalogMock.mockResolvedValue({
      userServers: [customServer, productServer],
      builtinServers: [],
      allServers: [customServer, productServer],
      entries: [
        { server: customServer, origin: 'custom', access: 'manage' },
        { server: productServer, origin: 'productBuiltin', access: 'use' },
      ],
      hiddenResources: [],
    });

    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.mcpCatalogEntries).toHaveLength(2));

    expect(result.current.mcpCatalogEntries.map(({ server, access }) => ({ name: server.name, access }))).toEqual([
      { name: 'custom server', access: 'manage' },
      { name: 'product server', access: 'use' },
    ]);
  });
});
