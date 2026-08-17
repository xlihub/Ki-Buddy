/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { MANAGED_AGENTS_SWR_KEY } from '@/renderer/utils/model/agentTypes';
import { fetchProductManagedAgents } from '@/renderer/services/runtime/productBrandRuntime';
import type { ProductManagedAgent } from '@/renderer/services/runtime/kiBuddyAgentCatalog';
import useSWR, { mutate } from 'swr';

export type UseManagedAgentsResult = {
  agents: ProductManagedAgent[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  revalidate: () => Promise<ProductManagedAgent[] | undefined>;
  refreshCatalog: () => Promise<ProductManagedAgent[] | undefined>;
  refreshCustomAgents: () => Promise<void>;
};

export async function refreshManagedAgentCatalogAndAssistants(): Promise<ProductManagedAgent[] | undefined> {
  const [agents] = await Promise.all([
    mutate<ProductManagedAgent[]>(MANAGED_AGENTS_SWR_KEY),
    mutate('assistants.list'),
  ]);
  return agents;
}

/**
 * Hook for the Agent settings management surface only. Reads the dedicated
 * `/api/agents/management` diagnostics view (`MANAGED_AGENTS_SWR_KEY`) so
 * user-disabled or missing agents stay listed with working test-connection
 * and re-enable actions.
 *
 * `revalidate` refreshes only the management key. It is the right action for
 * diagnostics-only changes such as health checks that should not invalidate the
 * shared detected-agent catalog.
 *
 * `refreshCatalog` refreshes the management catalog plus assistant list caches
 * after structural or health changes that can affect generated generated assistants.
 * Business assistant pickers must not depend on this hook or on `/api/agents`.
 *
 * Do not use this anywhere other than `AgentSettings`.
 */
export const useManagedAgents = (): UseManagedAgentsResult => {
  const { data, isLoading, isValidating, error } = useSWR<ProductManagedAgent[]>(
    MANAGED_AGENTS_SWR_KEY,
    fetchProductManagedAgents
  );

  const revalidateManaged = () => mutate<ProductManagedAgent[]>(MANAGED_AGENTS_SWR_KEY);

  return {
    agents: data ?? [],
    isLoading,
    isRefreshing: isValidating && !isLoading,
    error,
    revalidate: revalidateManaged,
    refreshCatalog: refreshManagedAgentCatalogAndAssistants,
    refreshCustomAgents: async () => {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await refreshManagedAgentCatalogAndAssistants();
    },
  };
};

/**
 * Lightweight runtime catalog read model for assistant-bound agent rows.
 * Uses the same `/api/agents/management` payload because that endpoint is
 * backed by `agent_metadata`, where ACP catalog snapshots are persisted.
 */
export const useManagedAgentRuntimeCatalog = (): ProductManagedAgent[] => {
  const { data } = useSWR<ProductManagedAgent[]>(MANAGED_AGENTS_SWR_KEY, fetchProductManagedAgents);
  return data ?? [];
};

/**
 * Non-hook entry point for settings/tooling surfaces that need the management
 * diagnostics catalog rather than the business-facing detected agent list.
 * Writes the result into the shared management cache only. Callers that
 * actually mutate the agent directory should invalidate the detected-agent
 * cache separately.
 */
export async function getManagedAgents(): Promise<ProductManagedAgent[]> {
  const data = await fetchProductManagedAgents();
  await mutate(MANAGED_AGENTS_SWR_KEY, data, { revalidate: false });
  return data;
}
