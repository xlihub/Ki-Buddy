import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpRequest, setHttpRequestTransport } from '@/common/adapter/httpBridge';
import { KiBuddyMainCoreTransport } from '@/process/ki-buddy/coreTransport';

describe('Ki-Buddy main-process Core transport', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    setHttpRequestTransport(null);
  });

  afterEach(() => {
    setHttpRequestTransport(null);
    vi.unstubAllGlobals();
  });

  it('owns Bearer and CSRF protocol headers for Ki-Buddy Core requests', async () => {
    const transport = new KiBuddyMainCoreTransport('core-csrf-token');
    transport.setAccessToken('core-access-token');
    transport.install();

    await httpRequest('POST', '/api/settings/client', { language: 'zh-CN' });

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer core-access-token',
      Cookie: 'aionui-csrf-token=core-csrf-token',
      'x-csrf-token': 'core-csrf-token',
    });
  });

  it('removes the old account token when the Core session is cleared', async () => {
    const transport = new KiBuddyMainCoreTransport('core-csrf-token');
    transport.setAccessToken('old-account-token');
    transport.install();
    transport.clearAccessToken();

    await httpRequest('GET', '/api/settings/client');

    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
  });
});
