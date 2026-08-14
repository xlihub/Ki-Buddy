import { expect, it } from 'vitest';
import { createAionUiUpdateFeedConfiguration } from '@/process/services/updateFeed';
import { CdnGenericProvider } from '@/process/services/cdnGenericProvider';

it('keeps the upstream CDN when no product update configuration is supplied', () => {
  expect(createAionUiUpdateFeedConfiguration()).toEqual({
    feedOptions: {
      provider: 'custom',
      url: 'https://static.aionui.com/releases',
      updateProvider: CdnGenericProvider,
    },
    label: 'AionUi CDN provider',
    updaterCacheDirName: 'com.aionui.app',
  });
});
