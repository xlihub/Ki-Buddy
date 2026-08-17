import type { KiBuddyProductConfig } from '@/common/platform/ki-buddy';
import type { UpdateBridgeConfiguration } from '@process/bridge/updateBridge';
import type { UpdateFeedConfiguration } from '@process/services/updateFeed';
import {
  KiBuddyGitHubProvider,
  type KiBuddyGitHubProviderConfiguration,
} from '@process/ki-buddy/update/githubUpdateProvider';

type KiBuddyFeedOptions = KiBuddyGitHubProviderConfiguration & {
  updateProvider: typeof KiBuddyGitHubProvider;
};

function buildKiBuddyFeedOptions(config: KiBuddyProductConfig): KiBuddyFeedOptions {
  const [owner, repo] = config.updates.repository.split('/');
  if (!owner || !repo) throw new Error('Ki-Buddy update repository must use owner/repo format');
  return {
    owner,
    provider: 'custom',
    repo,
    tagPrefix: config.updates.tagPrefix,
    updateProvider: KiBuddyGitHubProvider,
  };
}

/** Creates the product-owned update contract supplied to the shared updater service. */
export function createKiBuddyUpdateFeedConfiguration(config: KiBuddyProductConfig): UpdateFeedConfiguration {
  return {
    feedOptions: buildKiBuddyFeedOptions(config),
    label: 'Ki-Buddy GitHub provider',
    updaterCacheDirName: config.electronBuilder.appId,
  };
}

/** Creates the product-owned manual update contract supplied to the shared update bridge. */
export function createKiBuddyUpdateBridgeConfiguration(config: KiBuddyProductConfig): UpdateBridgeConfiguration {
  return {
    allowRepositoryOverride: false,
    repository: config.updates.repository,
    source: 'github',
    tagPrefix: config.updates.tagPrefix,
    userAgent: config.brand.productName,
  };
}
