/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/agent/useManagedAgents.ts.
 *
 * The Agent settings management surface must read the
 * `include_disabled=true` view (a SEPARATE SWR key from any detected-agent
 * cache). Diagnostics-only actions can refresh the management cache only;
 * catalog-changing or health actions that affect generated assistants must also
 * invalidate assistant list caches.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { fetchProductManagedAgentsMock, mutateMock, useSWRMock } = vi.hoisted(() => ({
  fetchProductManagedAgentsMock: vi.fn(),
  mutateMock: vi.fn().mockResolvedValue(undefined),
  useSWRMock: vi.fn(() => ({ data: [], error: null, isLoading: false })),
}));

vi.mock('swr', () => ({
  default: useSWRMock,
  mutate: mutateMock,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      refreshCustomAgents: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock('@/renderer/utils/model/agentTypes', () => ({
  MANAGED_AGENTS_SWR_KEY: 'agents.managed',
}));

vi.mock('@/renderer/services/runtime/productBrandRuntime', () => ({
  fetchProductManagedAgents: fetchProductManagedAgentsMock,
}));

import {
  getManagedAgents,
  useManagedAgentRuntimeCatalog,
  useManagedAgents,
} from '@/renderer/hooks/agent/useManagedAgents';
import { ipcBridge } from '@/common';

describe('useManagedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to the management SWR key with the managed fetcher', () => {
    useSWRMock.mockReturnValue({ data: [], error: null, isLoading: false });

    renderHook(() => useManagedAgents());

    expect(useSWRMock).toHaveBeenCalledWith('agents.managed', fetchProductManagedAgentsMock);
  });

  it('shares one projected Agent directory between settings and runtime consumers', () => {
    const agents = [{ id: '632f31d2', name: 'Ki CLI', agent_type: 'aionrs', agent_source: 'internal', enabled: true }];
    useSWRMock.mockReturnValue({ data: agents, error: null, isLoading: false });

    const settings = renderHook(() => useManagedAgents());
    const runtime = renderHook(() => useManagedAgentRuntimeCatalog());

    expect(settings.result.current.agents).toEqual(agents);
    expect(runtime.result.current).toEqual(agents);
    expect(useSWRMock).toHaveBeenNthCalledWith(1, 'agents.managed', fetchProductManagedAgentsMock);
    expect(useSWRMock).toHaveBeenNthCalledWith(2, 'agents.managed', fetchProductManagedAgentsMock);
  });

  it('exposes the agents returned by SWR', () => {
    const agents = [
      { id: 'x', name: 'X', agent_type: 'acp', agent_source: 'custom', enabled: false, available: false },
    ];
    useSWRMock.mockReturnValue({ data: agents, error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    expect(result.current.agents).toEqual(agents);
  });

  it('falls back to an empty list when SWR has no data yet', () => {
    useSWRMock.mockReturnValue({ data: undefined, error: null, isLoading: true });

    const { result } = renderHook(() => useManagedAgents());

    expect(result.current.agents).toEqual([]);
  });

  it('revalidate refreshes only the management key', async () => {
    useSWRMock.mockReturnValue({ data: [], error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.revalidate();
    });

    expect(mutateMock).toHaveBeenCalledWith('agents.managed');
    expect(mutateMock).not.toHaveBeenCalledWith('agents.detected');
  });

  it('refreshCatalog refreshes the management key and assistant list caches', async () => {
    useSWRMock.mockReturnValue({ data: [], error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.refreshCatalog();
    });

    expect(mutateMock).toHaveBeenCalledWith('agents.managed');
    expect(mutateMock).toHaveBeenCalledWith('assistants.list');
  });

  it('refreshCustomAgents triggers a backend rescan then refreshes management and assistant caches', async () => {
    useSWRMock.mockReturnValue({ data: [], error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.refreshCustomAgents();
    });

    expect(ipcBridge.acpConversation.refreshCustomAgents.invoke).toHaveBeenCalled();
    expect(mutateMock).toHaveBeenCalledWith('agents.managed');
    expect(mutateMock).toHaveBeenCalledWith('assistants.list');
  });

  it('getManagedAgents fetches the management catalog without invalidating the detected cache', async () => {
    const managedAgents = [
      { id: 'managed-1', name: 'Managed Agent', agent_type: 'acp', agent_source: 'builtin', enabled: true },
    ];
    fetchProductManagedAgentsMock.mockResolvedValue(managedAgents);

    const result = await getManagedAgents();

    expect(fetchProductManagedAgentsMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith('agents.managed', managedAgents, { revalidate: false });
    expect(mutateMock).not.toHaveBeenCalledWith('agents.detected');
    expect(result).toEqual(managedAgents);
  });
});
