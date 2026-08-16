import { beforeEach, describe, expect, it } from 'vitest';
import {
  AION_UI_PROTOCOL_SCHEME,
  configureDeepLinkProtocol,
  findDeepLinkUrl,
  getPendingDeepLinkUrl,
  parseDeepLinkUrl,
} from '@/process/utils/deepLink';

describe('desktop deep-link protocol', () => {
  beforeEach(() => {
    configureDeepLinkProtocol(AION_UI_PROTOCOL_SCHEME, []);
  });

  it('keeps the AionUi scheme when no product protocol is selected', () => {
    expect(parseDeepLinkUrl('aionui://add-provider?base_url=https://example.com')).toMatchObject({
      action: 'add-provider',
      params: { base_url: 'https://example.com' },
    });
    expect(parseDeepLinkUrl('ki-buddy://add-provider')).toBeNull();
  });

  it('uses the configured Ki-Buddy scheme for parsing', () => {
    configureDeepLinkProtocol('ki-buddy', []);
    const url = 'ki-buddy://provider/add?v=1';

    expect(parseDeepLinkUrl(url)).toEqual({ action: 'provider/add', params: { v: '1' } });
    expect(parseDeepLinkUrl('aionui://provider/add')).toBeNull();
  });

  it('captures a configured product URL for startup delivery', () => {
    const url = 'ki-buddy://provider/add?v=1';
    configureDeepLinkProtocol('ki-buddy', ['electron', '--flag', url]);

    expect(findDeepLinkUrl(['electron', url])).toBe(url);
    expect(getPendingDeepLinkUrl()).toBe(url);
  });

  it('rejects an invalid protocol scheme before registration', () => {
    expect(() => configureDeepLinkProtocol('not valid', [])).toThrow('protocol scheme');
  });
});
