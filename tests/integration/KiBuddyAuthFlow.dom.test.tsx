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
const syncLanguageFromConfigMock = vi.fn().mockResolvedValue(undefined);

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

vi.mock('@/renderer/services/i18n', () => ({
  changeLanguage: vi.fn().mockResolvedValue(undefined),
  syncLanguageFromConfig: syncLanguageFromConfigMock,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({
    closePreview: vi.fn(),
    clearPreviewForScope: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/system/useExtensionSettingsTabs', () => ({
  useExtensionSettingsTabs: () => [],
}));

vi.mock('@/renderer/hooks/system/useExtI18n', () => ({
  useExtI18n: () => ({ resolveExtTabName: (tab: { label: string }) => tab.label }),
}));

vi.mock('@renderer/pages/guid', () => ({ default: () => <div>guid-page</div> }));
vi.mock('@renderer/pages/conversation', () => ({ default: () => <div>conversation-page</div> }));
vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div>about-content</div>,
}));

import PanelRoute from '@/renderer/components/layout/Router';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { KiBuddyAuthProvider as AuthProvider } from '@/renderer/pages/ki-buddy/Auth';

const authenticatedUser = {
  id: 'core-user-42',
  username: 'agents-user@example.com',
  agents: {
    userId: 'agents-user-42',
    username: 'agents-user@example.com',
    displayName: 'Agents User',
    email: 'agents-user@example.com',
    phone: '13800138000',
    organization: 'Kingsoft AI',
    roles: ['设计人员', '审核人员'],
    deploymentUrl: 'https://agents.example.com',
  },
};

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
    localStorage.clear();
    localStorage.setItem('ki-buddy.onboarding.openingGuideSeen_v1', 'true');
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ status: 'unauthenticated', user: null });
    loginMock.mockReset();
    logoutMock.mockReset();
    logoutMock.mockResolvedValue({ status: 'unauthenticated', user: null });
    syncLanguageFromConfigMock.mockClear();
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
      await screen.findByText('login.kiBuddy.onboarding.toolSupportTitle', undefined, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'login.kiBuddy.onboarding.stepLabel' })).toHaveLength(3);
    expect(screen.queryByText('login.kiBuddy.agentsDeployment')).not.toBeInTheDocument();
    expect(screen.queryByText('business-layout')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'login.kiBuddy.onboarding.skip' }));
    expect(await screen.findByText('login.kiBuddy.agentsDeployment')).toBeInTheDocument();
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
    expect(screen.queryByText('login.kiBuddy.agentsDeployment')).not.toBeInTheDocument();
    expect(screen.queryByText('business-layout')).not.toBeInTheDocument();

    completeVerification?.({ status: 'unauthenticated', user: null });
    expect(await screen.findByText('login.kiBuddy.agentsDeployment')).toBeInTheDocument();
  });

  it('prefills the public Agents deployment on the login page', async () => {
    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    expect(await screen.findByLabelText('login.kiBuddy.agentsDeployment')).toHaveValue('https://ksapi.kingsware.cn');
  });

  it('prefills the last successful deployment from history', async () => {
    localStorage.setItem(
      'ki-buddy.login.successfulDeployments_v1',
      JSON.stringify({
        lastSuccessful: 'https://agents-two.example.com',
        successfulUrls: ['https://agents-two.example.com', 'https://agents-one.example.com'],
      })
    );

    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    const deploymentInput = await screen.findByLabelText('login.kiBuddy.agentsDeployment');
    expect(deploymentInput).toHaveValue('https://agents-two.example.com');
  });

  it('records a deployment only after authentication succeeds', async () => {
    loginMock.mockResolvedValue({ success: false, code: 'invalidCredentials' });
    const view = render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    fireEvent.change(await screen.findByLabelText('login.kiBuddy.agentsDeployment'), {
      target: { value: 'https://failed.example.com' },
    });
    fireEvent.change(screen.getByLabelText('login.kiBuddy.accountOrEmail'), {
      target: { value: 'agents-user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('login.password'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(localStorage.getItem('ki-buddy.login.successfulDeployments_v1')).toBeNull();

    view.unmount();
    loginMock.mockResolvedValue({
      success: true,
      session: { status: 'authenticated', user: authenticatedUser },
    });
    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );
    fireEvent.change(await screen.findByLabelText('login.kiBuddy.agentsDeployment'), {
      target: { value: 'https://successful.example.com/' },
    });
    fireEvent.change(screen.getByLabelText('login.kiBuddy.accountOrEmail'), {
      target: { value: 'agents-user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('login.password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    await screen.findByText('guid-page');
    expect(JSON.parse(localStorage.getItem('ki-buddy.login.successfulDeployments_v1') ?? '{}')).toEqual({
      lastSuccessful: 'https://successful.example.com',
      successfulUrls: ['https://successful.example.com'],
    });
  });

  it('enters the empty business surface with the projected Core user after login', async () => {
    loginMock.mockResolvedValue({
      success: true,
      session: {
        status: 'authenticated',
        user: authenticatedUser,
      },
    });

    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    fireEvent.change(await screen.findByLabelText('login.kiBuddy.agentsDeployment'), {
      target: { value: 'https://agents.example.com/' },
    });
    fireEvent.change(screen.getByLabelText('login.kiBuddy.accountOrEmail'), {
      target: { value: 'agents-user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('login.password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    expect(await screen.findByText('guid-page')).toBeInTheDocument();
    expect(screen.getByLabelText('current-user')).toHaveTextContent('core-user-42');
    expect(screen.queryByText('conversation-page')).not.toBeInTheDocument();
    await waitFor(() => expect(syncLanguageFromConfigMock).toHaveBeenCalledOnce());
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

    fireEvent.change(await screen.findByLabelText('login.kiBuddy.agentsDeployment'), {
      target: { value: 'https://agents.example.com' },
    });
    fireEvent.change(screen.getByLabelText('login.kiBuddy.accountOrEmail'), {
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
        user: authenticatedUser,
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

      fireEvent.change(await screen.findByLabelText('login.kiBuddy.agentsDeployment'), {
        target: { value: 'https://agents.example.com' },
      });
      fireEvent.change(screen.getByLabelText('login.kiBuddy.accountOrEmail'), {
        target: { value: 'agents-user@example.com' },
      });
      fireEvent.change(screen.getByLabelText('login.password'), {
        target: { value: 'correct-password' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(`login.kiBuddy.errors.${code}`);
      expect(screen.queryByText('business-layout')).not.toBeInTheDocument();
    }
  );

  it('does not submit incomplete credentials', async () => {
    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    await screen.findByText('login.kiBuddy.agentsDeployment');
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    expect(await screen.findAllByText('login.kiBuddy.form.required')).toHaveLength(2);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('clears the business surface after desktop logout', async () => {
    getSessionMock.mockResolvedValue({
      status: 'authenticated',
      user: authenticatedUser,
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

    expect(await screen.findByText('login.kiBuddy.agentsDeployment')).toBeInTheDocument();
    expect(logoutMock).toHaveBeenCalledOnce();
    expect(screen.queryByText('business-layout')).not.toBeInTheDocument();
    await waitFor(() => expect(swrCache.get('/api/assistants')?.data).toBeUndefined());
  });

  it('routes an authenticated Ki-Buddy user to the account page', async () => {
    getSessionMock.mockResolvedValue({
      status: 'authenticated',
      user: authenticatedUser,
    });
    window.location.hash = '#/settings/account';

    render(
      <AuthProvider>
        <PanelRoute layout={<TestLayout />} />
      </AuthProvider>
    );

    expect(await screen.findByText('Agents User')).toBeInTheDocument();
    expect(screen.getByText('agents-user-42')).toBeInTheDocument();
    expect(screen.getByText('login.kiBuddy.onboarding.replayTitle')).toBeInTheDocument();
  });
});
