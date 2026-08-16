/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KI_BUDDY_PRODUCT_CAPABILITY } from '@/common/platform/ki-buddy';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { KiBuddyAuthProvider, useKiBuddyAuth } from '@/renderer/pages/ki-buddy/Auth';

const getSessionMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();

const browserTab = {
  id: 'client-browser-tab',
  title: 'Client documentation',
  content: 'https://docs.example.com',
  content_type: 'browser',
};

function setMixedPreviewState(key: string): void {
  localStorage.setItem(
    key,
    JSON.stringify({
      isOpen: true,
      tabs: [
        {
          id: 'account-file-tab',
          title: 'secret.txt',
          content: 'previous account data',
          content_type: 'code',
        },
        browserTab,
      ],
      activeTabId: 'account-file-tab',
    })
  );
}

const AuthStatusProbe: React.FC = () => {
  const { status } = useAuth();
  const { login } = useKiBuddyAuth();
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
    sessionStorage.clear();
    getSessionMock.mockReset();
    loginMock.mockReset();
    logoutMock.mockReset();
    (window.electronAPI as NonNullable<Window['electronAPI']>).kiBuddyAuth = {
      getSession: getSessionMock,
      login: loginMock,
      logout: logoutMock,
    };
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;
  });

  it('clears runtime state without deleting client storage when the credential is invalidated', async () => {
    getSessionMock.mockResolvedValue({
      status: 'unauthenticated',
      user: null,
      cleanupRequired: true,
    });
    setMixedPreviewState('preview-ui:previous-account-project');
    localStorage.setItem('client-auth-layout', 'preserved');
    const swrCache = new Map<string, { data?: unknown }>();
    swrCache.set('/api/assistants', { data: [{ id: 'previous-account-assistant' }] });

    render(
      <SWRConfig value={{ provider: () => swrCache }}>
        <KiBuddyAuthProvider>
          <AuthStatusProbe />
        </KiBuddyAuthProvider>
      </SWRConfig>
    );

    expect(await screen.findByLabelText('authentication-status')).toHaveTextContent('unauthenticated');
    expect(JSON.parse(localStorage.getItem('preview-ui:previous-account-project') ?? '{}').tabs).toHaveLength(2);
    expect(localStorage.getItem('client-auth-layout')).toBe('preserved');
    expect(swrCache.get('/api/assistants')?.data).toBeUndefined();
  });

  it('preserves account-scoped renderer state after a temporary restore failure', async () => {
    getSessionMock.mockResolvedValue({ status: 'unauthenticated', user: null });
    localStorage.setItem('preview-ui:current-account-project', '{"activeFile":"draft.txt"}');
    const swrCache = new Map<string, { data?: unknown }>();
    swrCache.set('/api/assistants', { data: [{ id: 'current-account-assistant' }] });

    render(
      <SWRConfig value={{ provider: () => swrCache }}>
        <KiBuddyAuthProvider>
          <AuthStatusProbe />
        </KiBuddyAuthProvider>
      </SWRConfig>
    );

    expect(await screen.findByLabelText('authentication-status')).toHaveTextContent('unauthenticated');
    expect(localStorage.getItem('preview-ui:current-account-project')).not.toBeNull();
    expect(swrCache.get('/api/assistants')?.data).toEqual([{ id: 'current-account-assistant' }]);
  });

  it('clears runtime state without deleting client storage before activating a new account', async () => {
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
    setMixedPreviewState('preview-ui:previous-account-project');
    sessionStorage.setItem('conversation-command-queue/previous-account', '{"items":[{"input":"draft"}]}');
    const swrCache = new Map<string, { data?: unknown }>();
    swrCache.set('/api/assistants', { data: [{ id: 'previous-account-assistant' }] });
    render(
      <SWRConfig value={{ provider: () => swrCache }}>
        <KiBuddyAuthProvider>
          <AuthStatusProbe />
        </KiBuddyAuthProvider>
      </SWRConfig>
    );
    expect(await screen.findByLabelText('authentication-status')).toHaveTextContent('unauthenticated');

    fireEvent.click(screen.getByRole('button', { name: 'sign-in-new-account' }));

    await waitFor(() => expect(screen.getByLabelText('authentication-status')).toHaveTextContent('authenticated'));
    expect({
      previewTabs: JSON.parse(localStorage.getItem('preview-ui:previous-account-project') ?? '{}').tabs.length,
      queuedCommand: sessionStorage.getItem('conversation-command-queue/previous-account'),
    }).toEqual({
      previewTabs: 2,
      queuedCommand: '{"items":[{"input":"draft"}]}',
    });
    expect(swrCache.get('/api/assistants')?.data).toBeUndefined();
  });
});
