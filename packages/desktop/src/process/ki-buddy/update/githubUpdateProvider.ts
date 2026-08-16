import type { CustomPublishOptions, UpdateInfo } from 'builder-util-runtime';
import type { AppUpdater } from 'electron-updater/out/AppUpdater';
import { GitHubProvider } from 'electron-updater/out/providers/GitHubProvider';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider';

export type KiBuddyGitHubProviderConfiguration = {
  owner: string;
  provider: 'custom';
  repo: string;
  tagPrefix: string;
  updateProvider?: unknown;
};

function readConfiguration(configuration: CustomPublishOptions): KiBuddyGitHubProviderConfiguration {
  const candidate = configuration as unknown as Record<string, unknown>;
  if (
    typeof candidate.owner !== 'string' ||
    typeof candidate.repo !== 'string' ||
    typeof candidate.tagPrefix !== 'string'
  ) {
    throw new Error('Ki-Buddy GitHub update provider requires owner, repo, and tagPrefix');
  }
  return {
    owner: candidate.owner,
    provider: 'custom',
    repo: candidate.repo,
    tagPrefix: candidate.tagPrefix,
  };
}

/** Enforces the Ki-Buddy release tag contract before electron-updater caches an update. */
export class KiBuddyGitHubProvider extends GitHubProvider {
  private readonly _tagPrefix: string;

  constructor(configuration: CustomPublishOptions, updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    const productConfiguration = readConfiguration(configuration);
    super(
      {
        owner: productConfiguration.owner,
        provider: 'github',
        repo: productConfiguration.repo,
        tagNamePrefix: productConfiguration.tagPrefix,
      },
      updater,
      runtimeOptions
    );
    this._tagPrefix = productConfiguration.tagPrefix;
  }

  override async getLatestVersion(): Promise<UpdateInfo & { tag: string }> {
    const updateInfo = await super.getLatestVersion();
    if (!updateInfo.tag.startsWith(this._tagPrefix)) {
      throw new Error(`GitHub release tag does not match the configured product prefix: ${this._tagPrefix}`);
    }
    return updateInfo;
  }
}
