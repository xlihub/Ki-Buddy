/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';

const getSessionMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();

const AuthStatusProbe: React.FC = () => {
  const { login, status } = useAuth();
  return (
    <div>
      <output aria-label='authentication-status'>{status}</output>
      <button
        onClick={() =>
          void login({
            baseUrl: 'https://new-agents.example.com',
            username: 'new-user@example.com',
            password: 'password',
          })
        }
      >
        sign-in-new-account
      </button>
    </div>
  );
};

describe('Ki-Buddy AuthProvider session restoration', () => {
  beforeEach(() => {
    localStorage.clear();
    getSessionMock.mockReset();
    loginMock.mockReset();
    logoutMock.mockReset();
    (window.electronAPI as NonNullable<Window['electronAPI']>).kiBuddyAuth = {
      getSession: getSessionMock,
      login: loginMock,
      logout: logoutMock,
    };
  });

  it('clears account-scoped renderer state when the saved Agents credential is invalidated', async () => {
    getSessionMock.mockResolvedValue({
      status: 'unauthenticated',
      user: null,
      cleanupRequired: true,
    });
    localStorage.setItem('preview-ui:previous-account-project', '{"activeFile":"secret.txt"}');
    const swrCache = new Map<string, { data?: unknown }>();
    swrCache.set('/api/assistants', { data: [{ id: 'previous-account-assistant' }] });

    render(
      <SWRConfig value={{ provider: () => swrCache }}>
        <AuthProvider>
          <AuthStatusProbe />
        </AuthProvider>
      </SWRConfig>
    );

    expect(await screen.findByLabelText('authentication-status')).toHaveTextContent('unauthenticated');
    await waitFor(() => expect(localStorage.getItem('preview-ui:previous-account-project')).toBeNull());
    expect(swrCache.get('/api/assistants')?.data).toBeUndefined();
  });

  it('preserves account-scoped renderer state after a temporary restore failure', async () => {
    getSessionMock.mockResolvedValue({ status: 'unauthenticated', user: null });
    localStorage.setItem('preview-ui:current-account-project', '{"activeFile":"draft.txt"}');
    const swrCache = new Map<string, { data?: unknown }>();
    swrCache.set('/api/assistants', { data: [{ id: 'current-account-assistant' }] });

    render(
      <SWRConfig value={{ provider: () => swrCache }}>
        <AuthProvider>
          <AuthStatusProbe />
        </AuthProvider>
      </SWRConfig>
    );

    expect(await screen.findByLabelText('authentication-status')).toHaveTextContent('unauthenticated');
    expect(localStorage.getItem('preview-ui:current-account-project')).not.toBeNull();
    expect(swrCache.get('/api/assistants')?.data).toEqual([{ id: 'current-account-assistant' }]);
  });

  it('clears preserved account state before activating a newly signed-in Agents account', async () => {
    getSessionMock.mockResolvedValue({ status: 'unauthenticated', user: null });
    loginMock.mockResolvedValue({
      success: true,
      session: {
        status: 'authenticated',
        user: {
          id: 'new-core-user',
          username: 'new-user@example.com',
          agents: {
            userId: 'new-agents-user',
            username: 'new-user@example.com',
            displayName: 'New user',
            roles: [],
            deploymentUrl: 'https://new-agents.example.com',
          },
        },
      },
    });
    localStorage.setItem('preview-ui:previous-account-project', '{"activeFile":"secret.txt"}');
    const swrCache = new Map<string, { data?: unknown }>();
    swrCache.set('/api/assistants', { data: [{ id: 'previous-account-assistant' }] });
    render(
      <SWRConfig value={{ provider: () => swrCache }}>
        <AuthProvider>
          <AuthStatusProbe />
        </AuthProvider>
      </SWRConfig>
    );
    expect(await screen.findByLabelText('authentication-status')).toHaveTextContent('unauthenticated');

    fireEvent.click(screen.getByRole('button', { name: 'sign-in-new-account' }));

    await waitFor(() => expect(screen.getByLabelText('authentication-status')).toHaveTextContent('authenticated'));
    expect(localStorage.getItem('preview-ui:previous-account-project')).toBeNull();
    expect(swrCache.get('/api/assistants')?.data).toBeUndefined();
  });
});
