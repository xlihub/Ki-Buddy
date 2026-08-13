import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKiBuddyAuthAdapter } from '@/renderer/pages/ki-buddy/Auth';
import { configService } from '@/common/config/configService';

const getSessionMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();
const clearAccountStateMock = vi.fn();
const setReadyMock = vi.fn();
const setStatusMock = vi.fn();
const setUserMock = vi.fn();
const setProfileMock = vi.fn();

function createHandlers() {
  const adapter = createKiBuddyAuthAdapter({ setProfile: setProfileMock });
  const handlers = adapter.handlerFactory({
    clearAccountState: clearAccountStateMock,
    setReady: setReadyMock,
    setStatus: setStatusMock,
    setUser: setUserMock,
  });
  if (!handlers) throw new Error('Ki-Buddy handlers were not created');
  return { adapter, handlers };
}

describe('Ki-Buddy renderer authentication handlers', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    loginMock.mockReset();
    logoutMock.mockReset();
    clearAccountStateMock.mockReset();
    setReadyMock.mockReset();
    setStatusMock.mockReset();
    setUserMock.mockReset();
    setProfileMock.mockReset();
    configService.reset();
    window.electronAPI = {
      ...window.electronAPI,
      kiBuddyAuth: {
        getSession: getSessionMock,
        login: loginMock,
        logout: logoutMock,
      },
    };
  });

  it('reports a rejected login dependency as a network error without activating a user', async () => {
    loginMock.mockRejectedValue(new TypeError('IPC unavailable'));
    const { adapter, handlers } = createHandlers();

    await expect(
      adapter.login(
        {
          baseUrl: 'https://agents.example.com',
          username: 'agents-user@example.com',
          password: 'password',
        },
        handlers.login
      )
    ).resolves.toEqual({ success: false, code: 'networkError' });
    expect(setUserMock).not.toHaveBeenCalled();
  });

  it('clears renderer state even when the logout dependency rejects', async () => {
    logoutMock.mockRejectedValue(new Error('IPC unavailable'));

    await createHandlers().handlers.logout();

    expect(clearAccountStateMock).toHaveBeenCalledOnce();
    expect(setUserMock).toHaveBeenCalledWith(null);
    expect(setStatusMock).toHaveBeenCalledWith('unauthenticated');
  });

  it('locks the business surface while main-process logout is still pending', async () => {
    let finishLogout: (() => void) | undefined;
    logoutMock.mockReturnValue(
      new Promise<void>((resolve) => {
        finishLogout = resolve;
      })
    );

    const logout = createHandlers().handlers.logout();

    expect(setStatusMock).toHaveBeenCalledWith('checking');
    expect(setStatusMock).not.toHaveBeenCalledWith('unauthenticated');

    finishLogout?.();
    await logout;
    expect(setStatusMock).toHaveBeenLastCalledWith('unauthenticated');
  });

  it('clears account state when restoration reports an invalidated credential', async () => {
    getSessionMock.mockResolvedValue({ status: 'unauthenticated', user: null, cleanupRequired: true });
    configService.setLocal('language', 'en-US');

    await createHandlers().handlers.refresh();

    expect(clearAccountStateMock).toHaveBeenCalledOnce();
    expect(configService.get('language')).toBe('en-US');
    expect(setStatusMock).toHaveBeenLastCalledWith('unauthenticated');
  });

  it('clears the old renderer account when a switched login fails after main-process cleanup', async () => {
    loginMock.mockResolvedValue({ success: false, code: 'serverError', shouldClearCache: true });
    configService.setLocal('language', 'en-US');
    const { adapter, handlers } = createHandlers();

    await expect(
      adapter.login(
        {
          baseUrl: 'https://new-agents.example.com',
          username: 'new-user@example.com',
          password: 'password',
        },
        handlers.login
      )
    ).resolves.toEqual({ success: false, code: 'serverError', shouldClearCache: true });

    expect(clearAccountStateMock).toHaveBeenCalledOnce();
    expect(configService.get('language')).toBe('en-US');
    expect(setProfileMock).toHaveBeenCalledWith(null);
    expect(setUserMock).toHaveBeenCalledWith(null);
    expect(setStatusMock).toHaveBeenCalledWith('unauthenticated');
  });

  it('keeps the client language hint after a successful account activation', async () => {
    localStorage.setItem('i18nextLng', 'en-US');
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
            displayName: 'New User',
            roles: [],
            deploymentUrl: 'https://new-agents.example.com',
          },
        },
      },
    });
    const { adapter, handlers } = createHandlers();

    await expect(
      adapter.login(
        {
          baseUrl: 'https://new-agents.example.com',
          username: 'new-user@example.com',
          password: 'password',
        },
        handlers.login
      )
    ).resolves.toEqual({ success: true });

    expect(localStorage.getItem('i18nextLng')).toBe('en-US');
    expect(clearAccountStateMock).toHaveBeenCalledOnce();
  });

  it('does not create product handlers when the Ki-Buddy capability is absent', () => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };

    expect(
      createKiBuddyAuthAdapter({ setProfile: setProfileMock }).handlerFactory({
        clearAccountState: clearAccountStateMock,
        setReady: setReadyMock,
        setStatus: setStatusMock,
        setUser: setUserMock,
      })
    ).toBeNull();
  });
});
