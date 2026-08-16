/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CustomPublishOptions, GithubOptions } from 'builder-util-runtime';
import { CdnGenericProvider } from './cdnGenericProvider';
import type { CdnGenericProviderConfiguration } from './cdnGenericProvider';

export const CDN_UPDATE_BASE_URL = 'https://static.aionui.com/releases';

export type CdnFeedOptions = CdnGenericProviderConfiguration & {
  updateProvider: typeof CdnGenericProvider;
};

export type UpdateFeedConfiguration = {
  feedOptions: CdnFeedOptions | CustomPublishOptions | GithubOptions;
  label: string;
  updaterCacheDirName: string;
};

function buildCdnFeedOptions(): CdnFeedOptions {
  return {
    provider: 'custom',
    url: CDN_UPDATE_BASE_URL,
    updateProvider: CdnGenericProvider,
  };
}

/** Returns the update contract used when no product runtime overrides AionUi. */
export function createAionUiUpdateFeedConfiguration(): UpdateFeedConfiguration {
  return {
    feedOptions: buildCdnFeedOptions(),
    label: 'AionUi CDN provider',
    updaterCacheDirName: 'com.aionui.app',
  };
}
