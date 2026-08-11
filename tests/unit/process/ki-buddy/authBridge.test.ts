/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  removeCookie: vi.fn(),
  setCookie: vi.fn(),
}));

const credentialStoreMock = vi.hoisted(() => ({
  clear: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/ki-buddy-auth-test') },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      electronMock.handlers.set(channel, handler);
    }),
  },
  session: {
    defaultSession: {
      cookies: {
        remove: electronMock.removeCookie,
        set: electronMock.setCookie,
      },
    },
  },
}));

vi.mock('@/process/ki-buddy/CredentialStore', () => ({
  SafeStorageCredentialStore: class {
    clear = credentialStoreMock.clear;
    load = credentialStoreMock.load;
    save = credentialStoreMock.save;
  },
}));

import { registerKiBuddyAuthBridge } from '@/process/ki-buddy/authBridge';

describe('Ki-Buddy authentication IPC bridge', () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.removeCookie.mockReset();
    electronMock.setCookie.mockReset();
    electronMock.removeCookie.mockResolvedValue(undefined);
    electronMock.setCookie.mockResolvedValue(undefined);
    credentialStoreMock.clear.mockReset();
    credentialStoreMock.load.mockReset();
    credentialStoreMock.save.mockReset();
    delete (globalThis as typeof globalThis & { __coreAccessToken?: string }).__coreAccessToken;
    delete (globalThis as typeof globalThis & { __coreCsrfToken?: string }).__coreCsrfToken;
  });

  it('keeps Core tokens in main, installs renderer cookies, and clears them on logout', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorCode: 0,
            responseBody: {
              uuid: 'agents-user-42',
              userName: 'agents-user@example.com',
              token: 'agents-token',
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user_id: 'core-user-42',
              user_type: 'aionpro',
              external_user_id: 'projected-user',
              session_generation: 0,
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user: { id: 'core-user-42', username: 'agents-user@example.com' },
              session_generation: 0,
            },
          }),
          { status: 200, headers: { 'set-cookie': 'aionui-session=core-token; HttpOnly; Max-Age=3600' } }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    registerKiBuddyAuthBridge({
      bootstrapSecret: 'bootstrap-secret',
      coreCsrfToken: 'core-csrf-token',
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
    });
    const loginHandler = electronMock.handlers.get('ki-buddy-auth:login');
    const logoutHandler = electronMock.handlers.get('ki-buddy-auth:logout');

    await loginHandler?.(null, {
      baseUrl: 'https://agents.example.com',
      loginName: 'agents-user@example.com',
      password: 'password',
    });

    expect(electronMock.setCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'aionui-session',
        value: 'core-token',
        httpOnly: true,
        sameSite: 'no_restriction',
        secure: true,
      })
    );
    expect(electronMock.setCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'aionui-csrf-token',
        value: 'core-csrf-token',
        httpOnly: false,
        sameSite: 'no_restriction',
        secure: true,
      })
    );
    expect((globalThis as typeof globalThis & { __coreAccessToken?: string }).__coreAccessToken).toBe('core-token');
    expect((globalThis as typeof globalThis & { __coreCsrfToken?: string }).__coreCsrfToken).toBe('core-csrf-token');

    await logoutHandler?.(null);

    expect(credentialStoreMock.clear).toHaveBeenCalledOnce();
    expect(electronMock.removeCookie).toHaveBeenCalledWith('http://127.0.0.1:39123', 'aionui-session');
    expect(electronMock.removeCookie).toHaveBeenCalledWith('http://127.0.0.1:39123', 'aionui-csrf-token');
    expect((globalThis as typeof globalThis & { __coreAccessToken?: string }).__coreAccessToken).toBeUndefined();
  });
});
