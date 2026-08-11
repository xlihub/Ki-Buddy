import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKiBuddyAuthHandlers } from '@/renderer/services/runtime/kiBuddyAuthHandlers';

const getSessionMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();
const clearAccountStateMock = vi.fn();
const setReadyMock = vi.fn();
const setStatusMock = vi.fn();
const setUserMock = vi.fn();

function createHandlers() {
  const handlers = createKiBuddyAuthHandlers({
    clearAccountState: clearAccountStateMock,
    setReady: setReadyMock,
    setStatus: setStatusMock,
    setUser: setUserMock,
  });
  if (!handlers) throw new Error('Ki-Buddy handlers were not created');
  return handlers;
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

    await expect(
      createHandlers().login({
        baseUrl: 'https://agents.example.com',
        username: 'agents-user@example.com',
        password: 'password',
      })
    ).resolves.toEqual({ success: false, code: 'networkError' });
    expect(setUserMock).not.toHaveBeenCalled();
  });

  it('clears renderer state even when the logout dependency rejects', async () => {
    logoutMock.mockRejectedValue(new Error('IPC unavailable'));

    await createHandlers().logout();

    expect(clearAccountStateMock).toHaveBeenCalledOnce();
    expect(setUserMock).toHaveBeenCalledWith(null);
    expect(setStatusMock).toHaveBeenCalledWith('unauthenticated');
  });

  it('clears account state when restoration reports an invalidated credential', async () => {
    getSessionMock.mockResolvedValue({ status: 'unauthenticated', user: null, cleanupRequired: true });

    await createHandlers().refresh();

    expect(clearAccountStateMock).toHaveBeenCalledOnce();
    expect(setStatusMock).toHaveBeenLastCalledWith('unauthenticated');
  });
});
