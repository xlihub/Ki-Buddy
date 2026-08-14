import { KI_BUDDY_PRODUCT_CONFIG } from '@/common/platform/ki-buddy';
import type { UpdateBridgeConfiguration } from '@process/bridge/updateBridge';
import type { UpdateFeedConfiguration } from '@process/services/updateFeed';
import {
  KiBuddyGitHubProvider,
  type KiBuddyGitHubProviderConfiguration,
} from '@process/ki-buddy/update/githubUpdateProvider';

type KiBuddyFeedOptions = KiBuddyGitHubProviderConfiguration & {
  updateProvider: typeof KiBuddyGitHubProvider;
};

function buildKiBuddyFeedOptions(): KiBuddyFeedOptions {
  const [owner, repo] = KI_BUDDY_PRODUCT_CONFIG.updates.repository.split('/');
  if (!owner || !repo) throw new Error('Ki-Buddy update repository must use owner/repo format');
  return {
    owner,
    provider: 'custom',
    repo,
    tagPrefix: KI_BUDDY_PRODUCT_CONFIG.updates.tagPrefix,
    updateProvider: KiBuddyGitHubProvider,
  };
}

/** Creates the product-owned update contract supplied to the shared updater service. */
export function createKiBuddyUpdateFeedConfiguration(): UpdateFeedConfiguration {
  return {
    feedOptions: buildKiBuddyFeedOptions(),
    label: 'Ki-Buddy GitHub provider',
    updaterCacheDirName: KI_BUDDY_PRODUCT_CONFIG.electronBuilder.appId,
  };
}

/** Creates the product-owned manual update contract supplied to the shared update bridge. */
export function createKiBuddyUpdateBridgeConfiguration(): UpdateBridgeConfiguration {
  return {
    allowRepositoryOverride: false,
    repository: KI_BUDDY_PRODUCT_CONFIG.updates.repository,
    source: 'github',
    tagPrefix: KI_BUDDY_PRODUCT_CONFIG.updates.tagPrefix,
    userAgent: KI_BUDDY_PRODUCT_CONFIG.brand.productName,
  };
}
