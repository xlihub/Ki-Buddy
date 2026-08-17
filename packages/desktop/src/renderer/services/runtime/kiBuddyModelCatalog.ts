import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import {
  projectProductResources,
  type ProductExperience,
  type ProductResourceAccess,
  type ProductResourceHiddenRecord,
  type ProductResourceOrigin,
} from '@/common/platform/ki-buddy';
import { getProductExperience } from './kiBuddyRuntime';
import { reportHiddenProductResources } from './kiBuddyProductResourceDiagnostics';

export type ProductModelCatalogEntry = Readonly<{
  access: Exclude<ProductResourceAccess, 'hidden'>;
  modelId: string;
  origin: ProductResourceOrigin;
  providerId: string;
  resourceId: string;
}>;

export type ProductModelCatalog = Readonly<{
  entries: readonly ProductModelCatalogEntry[];
  hiddenResources: readonly ProductResourceHiddenRecord[];
  visibleProviders: readonly IProvider[];
}>;

const getModelResourceId = (providerId: string, modelId: string) => `provider:${providerId}/model:${modelId}`;

/** Projects user-managed provider models through the shared product resource policy. */
export const projectProductModelCatalog = (
  providers: readonly IProvider[],
  experience: ProductExperience
): ProductModelCatalog => {
  const projection = projectProductResources(
    experience,
    'model',
    providers.flatMap((provider) =>
      provider.models.map((modelId) => ({
        id: getModelResourceId(provider.id, modelId),
        name: modelId,
        origin: 'custom' as const,
        modelId,
        providerId: provider.id,
      }))
    )
  );
  const entries = projection.visible.map(({ resource, access }) => ({
    access,
    modelId: resource.modelId,
    origin: resource.origin,
    providerId: resource.providerId,
    resourceId: resource.id,
  }));
  const visibleResourceIds = new Set(entries.map(({ resourceId }) => resourceId));
  const customModelsVisible = experience.resourceAccess('model', 'custom') !== 'hidden';
  const visibleProviders = providers.flatMap((provider): IProvider[] => {
    if (provider.models.length === 0) return customModelsVisible ? [provider] : [];
    const models = provider.models.filter((modelId) =>
      visibleResourceIds.has(getModelResourceId(provider.id, modelId))
    );
    return models.length > 0 ? [{ ...provider, models }] : [];
  });

  return {
    entries,
    hiddenResources: projection.hidden,
    visibleProviders,
  };
};

/** Loads the provider directory and applies one Model projection for every renderer consumer. */
export const loadProductModelCatalog = async (
  experience: ProductExperience = getProductExperience()
): Promise<ProductModelCatalog> => {
  const providers = (await ipcBridge.mode.listProviders.invoke()) ?? [];
  const catalog = projectProductModelCatalog(providers, experience);
  reportHiddenProductResources('model', catalog.hiddenResources);
  return catalog;
};
