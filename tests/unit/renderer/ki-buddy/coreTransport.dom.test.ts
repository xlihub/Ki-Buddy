import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpRequest, setHttpRequestTransport } from '@/common/adapter/httpBridge';
import { installKiBuddyRendererCoreTransport } from '@/renderer/pages/ki-buddy/auth/coreTransport';

describe('Ki-Buddy renderer Core transport', () => {
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
    window.__backendPort = 39123;
    setHttpRequestTransport(null);
  });

  afterEach(() => {
    setHttpRequestTransport(null);
    vi.unstubAllGlobals();
  });

  it('installs CSRF handling only when the Ki-Buddy capability is present', async () => {
    window.electronAPI = {
      ...window.electronAPI,
      kiBuddyCoreTransport: { csrfToken: 'renderer-csrf-token' },
    };

    expect(installKiBuddyRendererCoreTransport()).toBe(true);
    await httpRequest('POST', '/api/settings/client', { language: 'zh-CN' });

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-csrf-token': 'renderer-csrf-token',
    });
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');
  });

  it('leaves ordinary AionUi requests unchanged when the capability is absent', async () => {
    window.electronAPI = { ...window.electronAPI, kiBuddyCoreTransport: undefined };

    expect(installKiBuddyRendererCoreTransport()).toBe(false);
    await httpRequest('POST', '/api/settings/client', { language: 'en-US' });

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('credentials');
  });
});
