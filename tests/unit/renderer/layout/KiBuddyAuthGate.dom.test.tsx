/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Outlet } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@renderer/pages/guid', () => ({ default: () => <div>guid-page</div> }));
vi.mock('@renderer/pages/conversation', () => ({ default: () => <div>conversation-page</div> }));
vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div>about-content</div>,
}));

import PanelRoute from '@/renderer/components/layout/Router';
import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';

type TestElectronApi = NonNullable<Window['electronAPI']> & {
  kiBuddyAuth: {
    getSession: typeof getSessionMock;
    login: typeof loginMock;
    logout: typeof logoutMock;
  };
};

const TestLayout: React.FC = () => {
  const { logout, user } = useAuth();
  return (
    <div>
      business-layout
      <output aria-label='current-user'>{user?.id}</output>
      <button onClick={() => void logout()}>test-logout</button>
      <Outlet />
    </div>
  );
};

describe('Ki-Buddy Agents authentication gate', () => {
  beforeEach(() => {
    window.location.hash = '#/conversation/existing-history';
    localStorage.setItem('ki-buddy.onboarding.openingGuideSeen_v1', 'true');
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ status: 'unauthenticated', user: null });
    loginMock.mockReset();
    logoutMock.mockReset();
    logoutMock.mockResolvedValue({ status: 'unauthenticated', user: null });
    (window.electronAPI as TestElectronApi).kiBuddyAuth = {
      getSession: getSessionMock,
      login: loginMock,
      logout: logoutMock,
    };
  });

  it('shows the static Ki-Buddy introduction before the Agents login on a clean desktop launch', async () => {
    localStorage.removeItem('ki-buddy.onboarding.openingGuideSeen_v1');
    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    await waitFor(() => expect(getSessionMock).toHaveBeenCalledOnce());
    expect(
      await screen.findByText('login.onboarding.toolSupportTitle', undefined, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'login.onboarding.stepLabel' })).toHaveLength(3);
    expect(screen.queryByText('login.agentsDeployment')).not.toBeInTheDocument();
    expect(screen.queryByText('business-layout')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'login.onboarding.skip' }));
    expect(await screen.findByText('login.agentsDeployment')).toBeInTheDocument();
    expect(screen.queryByText('business-layout')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation-page')).not.toBeInTheDocument();
    expect(localStorage.getItem('ki-buddy.onboarding.openingGuideSeen_v1')).toBe('true');
  });

  it('does not render either login or business content while the saved session is being verified', async () => {
    window.location.hash = '#/login';
    let completeVerification: ((value: unknown) => void) | undefined;
    getSessionMock.mockReturnValue(
      new Promise((resolve) => {
        completeVerification = resolve;
      })
    );

    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    await waitFor(() => expect(getSessionMock).toHaveBeenCalledOnce());
    expect(screen.queryByText('login.agentsDeployment')).not.toBeInTheDocument();
    expect(screen.queryByText('business-layout')).not.toBeInTheDocument();

    completeVerification?.({ status: 'unauthenticated', user: null });
    expect(await screen.findByText('login.agentsDeployment')).toBeInTheDocument();
  });

  it('enters the empty business surface with the projected Core user after login', async () => {
    loginMock.mockResolvedValue({
      success: true,
      session: {
        status: 'authenticated',
        user: { id: 'core-user-42', username: 'agents-user@example.com' },
      },
    });

    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    fireEvent.change(await screen.findByLabelText('login.agentsDeployment'), {
      target: { value: 'https://agents.example.com/' },
    });
    fireEvent.change(screen.getByLabelText('login.accountOrEmail'), {
      target: { value: 'agents-user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('login.password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    expect(await screen.findByText('guid-page')).toBeInTheDocument();
    expect(screen.getByLabelText('current-user')).toHaveTextContent('core-user-42');
    expect(screen.queryByText('conversation-page')).not.toBeInTheDocument();
  });

  it('keeps the business surface locked until the Core user projection completes', async () => {
    let completeProjection: ((value: unknown) => void) | undefined;
    loginMock.mockReturnValue(
      new Promise((resolve) => {
        completeProjection = resolve;
      })
    );

    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    fireEvent.change(await screen.findByLabelText('login.agentsDeployment'), {
      target: { value: 'https://agents.example.com' },
    });
    fireEvent.change(screen.getByLabelText('login.accountOrEmail'), {
      target: { value: 'agents-user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('login.password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledOnce());
    expect(screen.queryByText('business-layout')).not.toBeInTheDocument();

    completeProjection?.({
      success: true,
      session: {
        status: 'authenticated',
        user: { id: 'core-user-42', username: 'agents-user@example.com' },
      },
    });
    expect(await screen.findByText('guid-page')).toBeInTheDocument();
  });

  it.each(['invalidCredentials', 'networkError', 'serverError', 'contractError'] as const)(
    'shows the %s category while keeping the business surface locked',
    async (code) => {
      loginMock.mockResolvedValue({ success: false, code });

      render(
        <AuthProvider>
          <PanelRoute layout={<TestLayout />} />
        </AuthProvider>
      );

      fireEvent.change(await screen.findByLabelText('login.agentsDeployment'), {
        target: { value: 'https://agents.example.com' },
      });
      fireEvent.change(screen.getByLabelText('login.accountOrEmail'), {
        target: { value: 'agents-user@example.com' },
      });
      fireEvent.change(screen.getByLabelText('login.password'), {
        target: { value: 'correct-password' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(`login.errors.${code}`);
      expect(screen.queryByText('business-layout')).not.toBeInTheDocument();
    }
  );

  it('does not submit incomplete credentials', async () => {
    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    await screen.findByText('login.agentsDeployment');
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    expect(await screen.findAllByText('login.errors.required')).toHaveLength(3);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('clears the business surface after desktop logout', async () => {
    getSessionMock.mockResolvedValue({
      status: 'authenticated',
      user: { id: 'core-user-42', username: 'agents-user@example.com' },
    });
    window.location.hash = '#/guid';
    const swrCache = new Map<string, { data?: unknown }>();
    swrCache.set('/api/assistants', { data: [{ id: 'previous-account-assistant' }] });
    render(
      <SWRConfig value={{ provider: () => swrCache }}>
        <AuthProvider>
          <PanelRoute layout={<TestLayout />} />
        </AuthProvider>
      </SWRConfig>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'test-logout' }));

    expect(await screen.findByText('login.agentsDeployment')).toBeInTheDocument();
    expect(logoutMock).toHaveBeenCalledOnce();
    expect(screen.queryByText('business-layout')).not.toBeInTheDocument();
    await waitFor(() => expect(swrCache.get('/api/assistants')?.data).toBeUndefined());
  });

  it('reopens the static introduction from the desktop settings action', async () => {
    getSessionMock.mockResolvedValue({
      status: 'authenticated',
      user: { id: 'core-user-42', username: 'agents-user@example.com' },
    });
    window.location.hash = '#/settings/about';

    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'login.onboarding.replay' }));

    expect(await screen.findByText('login.onboarding.toolSupportTitle')).toBeInTheDocument();
    expect(localStorage.getItem('ki-buddy.onboarding.openingGuideSeen_v1')).toBeNull();
  });
});
