import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import { createAionUiProductExperience, createKiBuddyProductExperience } from '@/common/platform/ki-buddy';
import { loadProductModelCatalog, projectProductModelCatalog } from '@/renderer/services/runtime/kiBuddyModelCatalog';
import productConfig from '../../../../../ki-buddy-product.json';

const { listProvidersMock } = vi.hoisted(() => ({
  listProvidersMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: listProvidersMock },
    },
  },
}));

const providers: IProvider[] = [
  {
    id: 'provider-1',
    platform: 'openai',
    name: 'Primary',
    base_url: 'https://example.invalid',
    api_key: 'secret',
    models: ['gpt-one', 'gpt-two'],
  },
  {
    id: 'provider-empty',
    platform: 'custom',
    name: 'Empty provider',
    base_url: '',
    api_key: '',
    models: [],
  },
];

describe('projectProductModelCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps current provider models visible with manage access in Ki-Buddy', () => {
    const catalog = projectProductModelCatalog(providers, createKiBuddyProductExperience(productConfig.experience));

    expect(catalog.visibleProviders).toEqual(providers);
    expect(
      catalog.entries.map(({ providerId, modelId, origin, access }) => ({
        providerId,
        modelId,
        origin,
        access,
      }))
    ).toEqual([
      { providerId: 'provider-1', modelId: 'gpt-one', origin: 'custom', access: 'manage' },
      { providerId: 'provider-1', modelId: 'gpt-two', origin: 'custom', access: 'manage' },
    ]);
    expect(catalog.hiddenResources).toEqual([]);
  });

  it('keeps the complete provider catalog manageable in AionUi', () => {
    const catalog = projectProductModelCatalog(providers, createAionUiProductExperience());

    expect(catalog.visibleProviders).toEqual(providers);
    expect(catalog.entries.every(({ access }) => access === 'manage')).toBe(true);
    expect(catalog.hiddenResources).toEqual([]);
  });

  it('records hidden models without exposing provider credentials or endpoints', () => {
    const hiddenModelPolicy = {
      ...productConfig.experience,
      resources: {
        ...productConfig.experience.resources,
        model: {
          ...productConfig.experience.resources.model,
          custom: 'hidden',
        },
      },
    } as const;
    const catalog = projectProductModelCatalog(providers, createKiBuddyProductExperience(hiddenModelPolicy));

    expect(catalog.visibleProviders).toEqual([]);
    expect(catalog.hiddenResources).toEqual([
      expect.objectContaining({ resourceId: 'provider:provider-1/model:gpt-one', origin: 'custom' }),
      expect.objectContaining({ resourceId: 'provider:provider-1/model:gpt-two', origin: 'custom' }),
    ]);
    expect(catalog.hiddenResources[0]).not.toHaveProperty('api_key');
    expect(catalog.hiddenResources[0]).not.toHaveProperty('base_url');
  });

  it('loads the shared provider directory through one product projection', async () => {
    listProvidersMock.mockResolvedValue(providers);

    const catalog = await loadProductModelCatalog(createKiBuddyProductExperience(productConfig.experience));

    expect(listProvidersMock).toHaveBeenCalledOnce();
    expect(catalog.visibleProviders).toEqual(providers);
  });

  it('emits structured diagnostics when the active model policy hides resources', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const hiddenModelPolicy = {
      ...productConfig.experience,
      resources: {
        ...productConfig.experience.resources,
        model: {
          ...productConfig.experience.resources.model,
          custom: 'hidden',
        },
      },
    } as const;
    listProvidersMock.mockResolvedValue(providers);

    const catalog = await loadProductModelCatalog(createKiBuddyProductExperience(hiddenModelPolicy));

    expect(info).toHaveBeenCalledWith(
      '[ProductExperience] Model resources hidden by product policy',
      expect.objectContaining({ code: 'product_resource_projection', resources: catalog.hiddenResources })
    );
    info.mockRestore();
  });
});
