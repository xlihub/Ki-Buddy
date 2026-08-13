import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, productAuthState, clearPreviewForScopeMock, closePreviewMock, logoutMock, replayMock } = vi.hoisted(
  () => ({
    authState: { user: null as { id: string; username: string } | null },
    productAuthState: { profile: null as typeof agentsProfile | null },
    clearPreviewForScopeMock: vi.fn(),
    closePreviewMock: vi.fn(),
    logoutMock: vi.fn(),
    replayMock: vi.fn(),
  })
);

const agentsProfile = {
  userId: 'agents-user-42',
  username: 'agents-user@example.com',
  displayName: 'Agents User',
  email: 'agents-user@example.com',
  phone: '13800138000',
  organization: 'Kingsoft AI',
  roles: ['设计人员', '审核人员'],
  deploymentUrl: 'https://agents.example.com',
};

const authenticatedUser = {
  id: 'core-user-42',
  username: 'agents-user@example.com',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ logout: logoutMock, user: authState.user }),
}));

vi.mock('@/renderer/pages/ki-buddy/Auth', () => ({
  useKiBuddyAuth: () => ({ profile: productAuthState.profile }),
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({
    closePreview: closePreviewMock,
    clearPreviewForScope: clearPreviewForScopeMock,
  }),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/ki-buddy/Onboarding', () => ({
  replayKiBuddyOpeningGuide: replayMock,
}));

import KiBuddyAccountSettings from '@/renderer/pages/ki-buddy/Account';

describe('KiBuddyAccountSettings', () => {
  beforeEach(() => {
    authState.user = authenticatedUser;
    productAuthState.profile = agentsProfile;
    logoutMock.mockReset();
    logoutMock.mockResolvedValue(undefined);
    closePreviewMock.mockReset();
    clearPreviewForScopeMock.mockReset();
    replayMock.mockReset();
  });

  it('displays the Agents profile returned by authentication', () => {
    render(<KiBuddyAccountSettings />);

    expect(screen.getByText('Agents User')).toBeInTheDocument();
    expect(screen.getByText('login.kiBuddy.account.userId').parentElement).toHaveTextContent('agents-user-42');
    expect(screen.getByRole('button', { name: 'login.kiBuddy.account.copyUserId' })).toBeInTheDocument();
    expect(screen.getByText('Kingsoft AI')).toBeInTheDocument();
    expect(screen.getByText('设计人员login.kiBuddy.account.roleSeparator审核人员')).toBeInTheDocument();
  });

  it('replays the product introduction', () => {
    render(<KiBuddyAccountSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'login.kiBuddy.onboarding.replay' }));
    expect(replayMock).toHaveBeenCalledOnce();
  });

  it('opens an accessible logout action from the account menu', async () => {
    render(<KiBuddyAccountSettings />);

    const menuButton = screen.getByRole('button', { name: 'login.kiBuddy.account.openMenu' });
    expect(screen.queryByTestId('ki-buddy-account-logout-menu-item')).not.toBeInTheDocument();
    fireEvent.click(menuButton);

    expect(await screen.findByTestId('ki-buddy-account-logout-menu-item')).toHaveAccessibleName(
      'login.kiBuddy.account.logout'
    );
  });

  it('confirms logout and clears the in-memory workspace preview', async () => {
    render(<KiBuddyAccountSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'login.kiBuddy.account.openMenu' }));
    const logoutMenuItem = (await screen.findByText('login.kiBuddy.account.logout')).closest('button');
    if (!logoutMenuItem) throw new Error('logout menu item is missing');
    fireEvent.click(logoutMenuItem!);
    expect(await screen.findByText('login.kiBuddy.account.logoutDescription')).toBeInTheDocument();
    expect(screen.getByTestId('ki-buddy-account-logout-modal')).toBeInTheDocument();

    const logoutButtons = screen.getAllByRole('button', { name: 'login.kiBuddy.account.logout' });
    const confirmButton = logoutButtons[logoutButtons.length - 1];
    fireEvent.click(confirmButton);

    await waitFor(() => expect(logoutMock).toHaveBeenCalledOnce());
    expect(closePreviewMock).toHaveBeenCalledOnce();
    expect(clearPreviewForScopeMock).toHaveBeenCalledOnce();
  });

  it('does not expose account controls without an Agents profile', () => {
    authState.user = null;
    productAuthState.profile = null;
    const { container } = render(<KiBuddyAccountSettings />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'login.kiBuddy.account.logout' })).not.toBeInTheDocument();
  });
});
