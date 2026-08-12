/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configService } from '@/common/config/configService';
import { setHttpRequestTransport } from '@/common/adapter/httpBridge';
import { installKiBuddyRendererCoreTransport } from '@/renderer/pages/ki-buddy/auth/coreTransport';

const jsonResponse = (data?: unknown): Response =>
  new Response(data === undefined ? null : JSON.stringify({ data }), {
    status: 200,
    headers: data === undefined ? undefined : { 'content-type': 'application/json' },
  });

describe('configService Core authentication transport', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    configService.reset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.__backendPort = 39123;
    window.electronAPI = {
      ...window.electronAPI,
      kiBuddyCoreTransport: { csrfToken: 'core-csrf-token' },
    };
    installKiBuddyRendererCoreTransport();
  });

  afterEach(() => {
    configService.reset();
    vi.unstubAllGlobals();
    delete window.__backendPort;
    setHttpRequestTransport(null);
  });

  it('loads saved settings with the Core session cookie', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ language: 'en-US', 'theme.activeId': 'light', 'theme.userThemes': [] })
    );

    await configService.initialize();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:39123/api/settings/client',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
    expect(configService.get('language')).toBe('en-US');
  });

  it('persists a language change with the Core CSRF token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ 'theme.activeId': 'light', 'theme.userThemes': [] }))
      .mockResolvedValueOnce(jsonResponse());
    await configService.initialize();

    await configService.set('language', 'en-US');

    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://127.0.0.1:39123/api/settings/client',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json', 'x-csrf-token': 'core-csrf-token' }),
        body: JSON.stringify({ language: 'en-US' }),
      })
    );
  });

  it('retries loading settings after authentication becomes available', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Core authentication required'))
      .mockResolvedValueOnce(jsonResponse({ language: 'en-US', 'theme.activeId': 'light', 'theme.userThemes': [] }));

    await expect(configService.initialize()).rejects.toThrow('Core authentication required');
    await configService.initialize();

    expect(configService.get('language')).toBe('en-US');
  });

  it('reloads account-scoped settings without replacing the client language', async () => {
    const languageSubscriber = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ language: 'en-US', 'theme.activeId': 'light', 'theme.userThemes': [] }))
      .mockResolvedValueOnce(jsonResponse({ language: 'zh-CN', 'theme.activeId': 'light', 'theme.userThemes': [] }));
    await configService.initialize();
    configService.setLocal('language', 'en-US');
    const unsubscribe = configService.subscribe('language', languageSubscriber);

    configService.resetForAccountChange();
    expect(configService.get('language')).toBe('en-US');
    await configService.initialize();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(configService.get('language')).toBe('en-US');
    expect(languageSubscriber).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('ignores an old account initialization that resolves after an account switch', async () => {
    let resolveOldAccount: ((response: Response) => void) | undefined;
    fetchMock
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveOldAccount = resolve;
        })
      )
      .mockResolvedValueOnce(jsonResponse({ language: 'zh-CN', 'theme.activeId': 'light', 'theme.userThemes': [] }));

    const oldInitialization = configService.initialize();
    configService.resetForAccountChange();
    await configService.initialize();
    resolveOldAccount?.(jsonResponse({ language: 'en-US', 'theme.activeId': 'light', 'theme.userThemes': [] }));
    await oldInitialization;

    expect(configService.get('language')).toBe('zh-CN');
  });
});
