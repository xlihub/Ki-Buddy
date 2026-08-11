/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configService } from '@/common/config/configService';

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
    window.__coreCsrfToken = 'core-csrf-token';
  });

  afterEach(() => {
    configService.reset();
    vi.unstubAllGlobals();
    delete window.__backendPort;
    delete window.__coreCsrfToken;
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
});
