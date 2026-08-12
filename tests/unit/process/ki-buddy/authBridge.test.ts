/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  agentsFetch: vi.fn(),
  fromPartition: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  removeCookie: vi.fn(),
  setCertificateVerifyProc: vi.fn(),
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
    fromPartition: electronMock.fromPartition,
    defaultSession: {
      cookies: {
        remove: electronMock.removeCookie,
        set: electronMock.setCookie,
      },
    },
  },
}));

vi.mock('@/process/ki-buddy/CredentialStore', () => ({
  KeytarCredentialStore: class {
    clear = credentialStoreMock.clear;
    load = credentialStoreMock.load;
    save = credentialStoreMock.save;
  },
}));

import { registerKiBuddyAuthBridge } from '@/process/ki-buddy/authBridge';
import { KiBuddyMainCoreTransport } from '@/process/ki-buddy/coreTransport';

function registerBridgeWithSuccessfulLogin() {
  const coreTransport = new KiBuddyMainCoreTransport('core-csrf-token');
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
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { user_id: 'core-user-42', session_generation: 1 } }), {
        status: 200,
      })
    );
  electronMock.agentsFetch.mockImplementation(fetchMock);
  vi.stubGlobal('fetch', fetchMock);
  registerKiBuddyAuthBridge({
    bootstrapSecret: 'bootstrap-secret',
    coreTransport,
    getCoreBaseUrl: () => 'http://127.0.0.1:39123',
  });
  return { coreTransport, fetchMock };
}

describe('Ki-Buddy authentication IPC bridge', () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.agentsFetch.mockReset();
    electronMock.fromPartition.mockReset();
    electronMock.setCertificateVerifyProc.mockReset();
    electronMock.fromPartition.mockReturnValue({
      fetch: electronMock.agentsFetch,
      setCertificateVerifyProc: electronMock.setCertificateVerifyProc,
    });
    electronMock.removeCookie.mockReset();
    electronMock.setCookie.mockReset();
    electronMock.removeCookie.mockResolvedValue(undefined);
    electronMock.setCookie.mockResolvedValue(undefined);
    credentialStoreMock.clear.mockReset();
    credentialStoreMock.load.mockReset();
    credentialStoreMock.save.mockReset();
  });

  it('installs projected Core cookies while keeping tokens in main', async () => {
    const { coreTransport } = registerBridgeWithSuccessfulLogin();
    const loginHandler = electronMock.handlers.get('ki-buddy-auth:login');

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
    expect(coreTransport.getHeaders({ method: 'POST' })).toMatchObject({
      Authorization: 'Bearer core-token',
      'x-csrf-token': 'core-csrf-token',
    });
  });

  it('routes Agents login through the isolated network session without automatic redirects', async () => {
    registerBridgeWithSuccessfulLogin();
    const loginHandler = electronMock.handlers.get('ki-buddy-auth:login');

    await loginHandler?.(null, {
      baseUrl: 'https://agents.example.com',
      loginName: 'agents-user@example.com',
      password: 'password',
    });

    expect(electronMock.fromPartition).toHaveBeenCalledWith('ki-buddy-agents-network', { cache: false });
    expect(electronMock.agentsFetch).toHaveBeenCalledWith(
      'https://agents.example.com/kagent/login',
      expect.objectContaining({ method: 'POST', redirect: 'manual' })
    );
  });

  it('clears projected Core state on logout', async () => {
    const { coreTransport } = registerBridgeWithSuccessfulLogin();
    const loginHandler = electronMock.handlers.get('ki-buddy-auth:login');
    const logoutHandler = electronMock.handlers.get('ki-buddy-auth:logout');
    await loginHandler?.(null, {
      baseUrl: 'https://agents.example.com',
      loginName: 'agents-user@example.com',
      password: 'password',
    });

    await logoutHandler?.(null);

    expect(credentialStoreMock.clear).toHaveBeenCalledOnce();
    expect(coreTransport.getHeaders({ method: 'GET' })).not.toHaveProperty('Authorization');
  });

  it('rejects malformed login IPC requests before making a network request', async () => {
    registerBridgeWithSuccessfulLogin();
    const loginHandler = electronMock.handlers.get('ki-buddy-auth:login');

    await expect(loginHandler?.(null, { baseUrl: 'https://agents.example.com' })).resolves.toEqual({
      success: false,
      code: 'contractError',
    });
    expect(electronMock.agentsFetch).not.toHaveBeenCalled();
  });
});
