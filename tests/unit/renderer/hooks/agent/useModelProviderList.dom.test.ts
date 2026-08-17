import { beforeEach, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';

const { loadProductModelCatalogMock, listProvidersMock } = vi.hoisted(() => ({
  loadProductModelCatalogMock: vi.fn(),
  listProvidersMock: vi.fn(),
}));

vi.mock('@/renderer/services/runtime/kiBuddyModelCatalog', () => ({
  loadProductModelCatalog: loadProductModelCatalogMock,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: listProvidersMock },
    },
  },
}));

import { fetchProviders } from '@/renderer/hooks/agent/useModelProviderList';

const provider: IProvider = {
  id: 'provider-1',
  platform: 'openai',
  name: 'Provider',
  base_url: '',
  api_key: '',
  models: ['model-1'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('fetches every Model consumer from the shared product-projected provider directory', async () => {
  loadProductModelCatalogMock.mockResolvedValue({
    entries: [],
    hiddenResources: [],
    visibleProviders: [provider],
  });
  listProvidersMock.mockResolvedValue([]);

  await expect(fetchProviders()).resolves.toEqual([provider]);
  expect(loadProductModelCatalogMock).toHaveBeenCalledOnce();
  expect(listProvidersMock).not.toHaveBeenCalled();
});
