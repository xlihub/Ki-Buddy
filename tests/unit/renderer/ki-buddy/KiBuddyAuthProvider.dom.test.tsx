/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';
import { KiBuddyAuthProvider, useKiBuddyAuth } from '@/renderer/pages/ki-buddy/Auth';
import { createKiBuddyAccountSwitchBarrier } from '@/renderer/pages/ki-buddy/Auth/KiBuddyAuthProvider';
import { configService } from '@/common/config/configService';
import { httpRequest, setHttpRequestTransport } from '@/common/adapter/httpBridge';
import { installKiBuddyRendererCoreTransport } from '@/renderer/pages/ki-buddy/Auth/coreTransport';

const getSessionMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();
const onSessionInvalidatedMock = vi.fn();
let sessionInvalidatedListener: (() => void) | undefined;

const ProductProbe: React.FC = () => {
  const auth = useAuth();
  const productAuth = useKiBuddyAuth();
  return (
    <div>
      <output aria-label='core-user'>{JSON.stringify(auth.user)}</output>
      <output aria-label='auth-status'>{auth.status}</output>
      <output aria-label='agents-profile'>{JSON.stringify(productAuth.profile)}</output>
      <button
        onClick={() =>
          void productAuth.login({
            baseUrl: 'https://agents.example.com',
            username: 'agents-user@example.com',
            password: 'password',
          })
        }
      >
        product-login
      </button>
      <button onClick={() => void auth.logout()}>product-logout</button>
      <button onClick={() => void httpRequest('GET', '/api/settings/client').catch(() => {})}>core-request</button>
    </div>
  );
};

const CommonProbe: React.FC = () => {
  const { logout, status, user } = useAuth();
  return (
    <div>
      <output aria-label='common-session'>{JSON.stringify({ status, user })}</output>
      <button onClick={() => void logout()}>common-logout</button>
    </div>
  );
};

describe('Ki-Buddy product authentication context', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    loginMock.mockReset();
    logoutMock.mockReset();
    onSessionInvalidatedMock.mockReset();
    sessionInvalidatedListener = undefined;
    onSessionInvalidatedMock.mockImplementation((listener: () => void) => {
      sessionInvalidatedListener = listener;
      return () => {
        sessionInvalidatedListener = undefined;
      };
    });
    window.electronAPI = {
      ...window.electronAPI,
      kiBuddyAuth: {
        getSession: getSessionMock,
        login: loginMock,
        logout: logoutMock,
        onSessionInvalidated: onSessionInvalidatedMock,
      },
    };
    configService.reset();
    setHttpRequestTransport(null);
  });

  afterEach(() => {
    setHttpRequestTransport(null);
    vi.unstubAllGlobals();
  });

  it('keeps the Agents profile out of the common AuthContext user', async () => {
    getSessionMock.mockResolvedValue({
      status: 'authenticated',
      user: {
        id: 'core-user-42',
        username: 'agents-user@example.com',
        agents: {
          userId: 'agents-user-42',
          username: 'agents-user@example.com',
          displayName: 'Agents User',
          roles: ['reviewer'],
          deploymentUrl: 'https://agents.example.com',
        },
      },
    });

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <KiBuddyAuthProvider>
          <ProductProbe />
        </KiBuddyAuthProvider>
      </SWRConfig>
    );

    await waitFor(() => expect(screen.getByLabelText('core-user')).toHaveTextContent('core-user-42'));
    expect(screen.getByLabelText('core-user')).not.toHaveTextContent('agents-user-42');
    expect(screen.getByLabelText('core-user')).not.toHaveTextContent('deploymentUrl');
    expect(screen.getByLabelText('agents-profile')).toHaveTextContent('agents-user-42');
  });

  it('keeps deployment input in the product context login contract', async () => {
    getSessionMock.mockResolvedValue({ status: 'unauthenticated', user: null });
    loginMock.mockResolvedValue({
      success: true,
      session: {
        status: 'authenticated',
        user: {
          id: 'core-user-42',
          username: 'agents-user@example.com',
          agents: {
            userId: 'agents-user-42',
            username: 'agents-user@example.com',
            displayName: 'Agents User',
            roles: [],
            deploymentUrl: 'https://agents.example.com',
          },
        },
      },
    });
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <KiBuddyAuthProvider>
          <ProductProbe />
        </KiBuddyAuthProvider>
      </SWRConfig>
    );
    configService.setLocal('language', 'en-US');
    await waitFor(() => expect(screen.getByLabelText('core-user')).toHaveTextContent('null'));

    fireEvent.click(screen.getByRole('button', { name: 'product-login' }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledOnce());
    expect(loginMock).toHaveBeenCalledWith({
      baseUrl: 'https://agents.example.com',
      loginName: 'agents-user@example.com',
      password: 'password',
    });
    expect(configService.get('language')).toBe('en-US');
  });

  it('blocks a different Core account before requesting one renderer reload', () => {
    const reload = vi.fn();
    const barrier = createKiBuddyAccountSwitchBarrier(reload);

    expect(barrier.shouldBlock(null)).toBe(false);
    expect(barrier.shouldBlock('core-user-a')).toBe(false);
    barrier.recordCommittedUser('core-user-a');
    expect(reload).not.toHaveBeenCalled();

    expect(barrier.shouldBlock(null)).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    expect(barrier.shouldBlock('core-user-b')).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    barrier.requestReload();
    expect(reload).toHaveBeenCalledOnce();

    expect(barrier.shouldBlock('core-user-b')).toBe(true);
    barrier.requestReload();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('removes product children before reloading for another Core account', async () => {
    const reload = vi.fn();
    getSessionMock.mockResolvedValue({
      status: 'authenticated',
      user: {
        id: 'core-user-a',
        username: 'shared-visible-name',
        agents: {
          userId: 'agents-user-a',
          username: 'account-a@example.com',
          displayName: 'Shared visible name',
          roles: [],
          deploymentUrl: 'https://agents.example.com',
        },
      },
    });
    logoutMock.mockResolvedValue(undefined);
    loginMock.mockResolvedValue({
      success: true,
      session: {
        status: 'authenticated',
        user: {
          id: 'core-user-b',
          username: 'shared-visible-name',
          agents: {
            userId: 'agents-user-b',
            username: 'account-b@example.com',
            displayName: 'Shared visible name',
            roles: [],
            deploymentUrl: 'https://agents.example.com',
          },
        },
      },
    });

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <KiBuddyAuthProvider reload={reload}>
          <ProductProbe />
        </KiBuddyAuthProvider>
      </SWRConfig>
    );
    await waitFor(() => expect(screen.getByLabelText('core-user')).toHaveTextContent('core-user-a'));

    fireEvent.click(screen.getByRole('button', { name: 'product-logout' }));
    await waitFor(() => expect(screen.getByLabelText('auth-status')).toHaveTextContent('unauthenticated'));
    fireEvent.click(screen.getByRole('button', { name: 'product-login' }));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button', { name: 'product-login' })).not.toBeInTheDocument();
  });

  it('keeps the active account when a Core business request returns 401', async () => {
    getSessionMock.mockResolvedValue({
      status: 'authenticated',
      user: {
        id: 'core-user-42',
        username: 'agents-user@example.com',
        agents: {
          userId: 'agents-user-42',
          username: 'agents-user@example.com',
          roles: [],
          deploymentUrl: 'https://agents.example.com',
        },
      },
    });
    window.electronAPI = {
      ...window.electronAPI,
      kiBuddyAuth: window.electronAPI?.kiBuddyAuth,
      kiBuddyCoreTransport: { csrfToken: 'core-csrf-token' },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    installKiBuddyRendererCoreTransport();

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <KiBuddyAuthProvider>
          <ProductProbe />
        </KiBuddyAuthProvider>
      </SWRConfig>
    );
    await waitFor(() => expect(screen.getByLabelText('auth-status')).toHaveTextContent('authenticated'));

    fireEvent.click(screen.getByRole('button', { name: 'core-request' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('auth-status')).toHaveTextContent('authenticated');
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('returns to the login state when main reports a trusted Agents authentication failure', async () => {
    getSessionMock
      .mockResolvedValueOnce({
        status: 'authenticated',
        user: {
          id: 'core-user-42',
          username: 'agents-user@example.com',
          agents: {
            userId: 'agents-user-42',
            username: 'agents-user@example.com',
            displayName: 'Agents User',
            roles: [],
            deploymentUrl: 'https://agents.example.com',
          },
        },
      })
      .mockResolvedValueOnce({ status: 'unauthenticated', user: null, cleanupRequired: true });

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <KiBuddyAuthProvider>
          <ProductProbe />
        </KiBuddyAuthProvider>
      </SWRConfig>
    );
    await waitFor(() => expect(screen.getByLabelText('auth-status')).toHaveTextContent('authenticated'));

    sessionInvalidatedListener?.();

    await waitFor(() => expect(screen.getByLabelText('auth-status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByLabelText('core-user')).toHaveTextContent('null');
    expect(screen.getByLabelText('agents-profile')).toHaveTextContent('null');
  });

  it('preserves ordinary AionUi desktop authentication when the product capability is absent', async () => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    configService.setLocal('language', 'en-US');

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <AuthProvider>
          <CommonProbe />
        </AuthProvider>
      </SWRConfig>
    );

    await waitFor(() => expect(screen.getByLabelText('common-session')).toHaveTextContent('authenticated'));
    expect(screen.getByLabelText('common-session')).toHaveTextContent('"user":null');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(configService.get('language')).toBe('en-US');
  });

  it('preserves ordinary AionUi web authentication outside Electron', async () => {
    window.electronAPI = undefined;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, user: { id: 'web-user', username: 'web-admin' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    configService.setLocal('language', 'en-US');

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <AuthProvider>
          <CommonProbe />
        </AuthProvider>
      </SWRConfig>
    );

    await waitFor(() => expect(screen.getByLabelText('common-session')).toHaveTextContent('web-user'));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/user', expect.objectContaining({ method: 'GET' }));
    expect(configService.get('language')).toBe('en-US');
  });

  it('keeps the WebUI logout cleanup contract when no product adapter is active', async () => {
    window.electronAPI = undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (input === '/api/auth/user') {
        return new Response(JSON.stringify({ success: true, user: { id: 'web-user', username: 'web-admin' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('auth-session', 'remove');
    localStorage.setItem('csrf-state', 'remove');
    localStorage.setItem('access-token', 'remove');
    localStorage.setItem('preview-ui:web-project', '{"tabs":[]}');
    localStorage.setItem('client-layout', 'preserve');

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <AuthProvider>
          <CommonProbe />
        </AuthProvider>
      </SWRConfig>
    );
    await waitFor(() => expect(screen.getByLabelText('common-session')).toHaveTextContent('web-user'));

    fireEvent.click(screen.getByRole('button', { name: 'common-logout' }));

    await waitFor(() => expect(screen.getByLabelText('common-session')).toHaveTextContent('unauthenticated'));
    expect(localStorage.getItem('auth-session')).toBeNull();
    expect(localStorage.getItem('csrf-state')).toBeNull();
    expect(localStorage.getItem('access-token')).toBeNull();
    expect(localStorage.getItem('preview-ui:web-project')).toBeNull();
    expect(localStorage.getItem('client-layout')).toBe('preserve');
  });
});
